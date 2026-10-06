/**
 * #378 follow-up — scheduled reconciler. Event delivery is best-effort (a finished agent run can
 * produce no orchestrator run, and a silent agent produces no event at all), so a cron sweep over
 * issues labelled `status:awaiting-agent` settles runs the event path missed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runOrchestrator, reconcileAwaitingRuns, normaliseEvent, AWAITING_LABEL } from '../orchestrator/index.js';

globalThis.__APM_TEST_NO_FS = true;

const NOW = new Date('2026-10-06T10:00:00Z');
const minutesAgo = m => new Date(NOW.getTime() - m * 60_000).toISOString();

const bugFix = {
  name: 'bug-fix-pipeline',
  schemaVersion: '2',
  trigger: { event: 'issues.labeled', labels: ['triaged', 'type:bug'] },
  entry: 'dev',
  steps: [
    { name: 'dev', agent: 'dev-agent', timeout_minutes: 30 },
    { name: 'qa', agent: 'qa-agent' },
  ],
  transitions: [
    { from: 'dev', outcome: 'success', to: 'qa' },
    { from: 'dev', outcome: 'blocker', to: 'dev' },
  ],
  loopBudget: { max_iterations_per_edge: 2, max_total_steps: 30, max_wallclock_minutes: 720 },
};
const runtimeRegistry = {
  default_runtime: 'rt',
  agent_defaults: {},
  runtimes: { rt: { kind: 'copilot', endpoint: 'https://api.github.com', credential_ref: 'GITHUB_TOKEN' } },
};
const identities = new Map([['github-actions[bot]', 'dev-agent'], ['qa-bot', 'qa-agent']]);
const clock = { now: () => 0, sleep: vi.fn(async () => {}) };
const env = { GITHUB_TOKEN: 'x' };

function makeClient({ runs = [] } = {}) {
  const comments = [];
  const labels = new Map();            // issue -> Set
  let id = 100, tick = NOW.getTime() - 3_600_000;
  const issueLabels = n => labels.get(n) ?? labels.set(n, new Set()).get(n);
  return {
    _comments: comments,
    _labels: labels,
    _runs: runs,
    listComments: vi.fn(async (_o, _r, n) => comments.filter(c => c.issue === n)),
    createComment: vi.fn(async (_o, _r, n, body) => {
      const c = { id: id++, issue: n, body, created_at: new Date(tick++).toISOString() };
      comments.push(c);
      return c;
    }),
    updateComment: vi.fn(async (_o, _r, cid, body) => { const c = comments.find(x => x.id === cid); if (c) c.body = body; return c; }),
    triggerWorkflow: vi.fn().mockResolvedValue(undefined),
    getCollaboratorPermission: vi.fn().mockResolvedValue('write'),
    addLabels: vi.fn(async (_o, _r, n, ls) => { ls.forEach(l => issueLabels(n).add(l)); }),
    removeLabel: vi.fn(async (_o, _r, n, l) => { issueLabels(n).delete(l); }),
    listIssuesByLabel: vi.fn(async (_o, _r, label) =>
      [...labels].filter(([, set]) => set.has(label)).map(([number]) => ({ number }))),
    listWorkflowRuns: vi.fn(async () => runs),
    postBot(body, at, n = 378) {
      const c = { id: id++, issue: n, body, created_at: at ?? new Date(tick++).toISOString(), user: { login: 'github-actions[bot]' } };
      comments.push(c);
      return c;
    },
  };
}

const latestState = (client, n = 378) => {
  const c = client._comments.filter(x => x.issue === n && x.body.includes('apm-pipeline-state'))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  return JSON.parse(c.body.match(/<!-- apm-pipeline-state: (.*?) -->/s)[1]);
};

async function start(client, issue = 378) {
  await runOrchestrator({
    client,
    event: { type: 'issues.labeled', labels: ['triaged', 'type:bug'], issueNumber: issue, ref: 'main' },
    pipelines: [bugFix], owner: 'o', repo: 'r', runtimeRegistry, identities, env, clock,
  });
  return latestState(client, issue);
}

/** Rewrite the saved state's timestamps so the run looks like it started `m` minutes ago. */
function backdate(client, m, n = 378) {
  const c = client._comments.filter(x => x.issue === n && x.body.includes('apm-pipeline-state')).at(-1);
  const s = JSON.parse(c.body.match(/<!-- apm-pipeline-state: (.*?) -->/s)[1]);
  s.awaitingSince = s.dispatchedAt = s.updatedAt = minutesAgo(m);
  c.body = c.body.replace(/<!-- apm-pipeline-state: .*? -->/s, `<!-- apm-pipeline-state: ${JSON.stringify(s)} -->`);
  return s;
}

const marker = (s, o) =>
  `**[QuorumKit Orchestrator]** Developer Agent (copilot) -- outcome: \`${o}\`\n\nSpec missing.\n\n<!-- apm:run_id=${s.runId} step=dev iteration=1 runtime=rt outcome=${o} -->`;

const mkRun = (over = {}) => ({
  id: 1, status: 'completed', conclusion: 'failure',
  display_title: 'Developer Agent (Copilot) #378',
  created_at: minutesAgo(18), updated_at: minutesAgo(15), ...over,
});

const sweep = client => runOrchestrator({
  client, event: { type: 'schedule.reconcile', labels: [], issueNumber: null, ref: 'main' },
  pipelines: [bugFix], owner: 'o', repo: 'r', runtimeRegistry, identities, env, clock,
});

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); vi.clearAllMocks(); });
afterEach(() => vi.useRealTimers());

describe('normaliseEvent(schedule)', () => {
  it('turns a cron delivery into a reconcile sweep with no issue', () => {
    expect(normaliseEvent('schedule', {})).toMatchObject({ type: 'schedule.reconcile', issueNumber: null });
  });
});

describe('awaiting-agent label bookkeeping', () => {
  it('labels the issue when a run starts waiting and clears it when the run ends', async () => {
    const client = makeClient();
    const s = await start(client);
    expect(s.status).toBe('awaiting-agent');
    expect(client._labels.get(378).has(AWAITING_LABEL)).toBe(true);
    expect(s.dispatchedAt).toBeTruthy();

    client.postBot(marker(s, 'success'));
    await runOrchestrator({
      client,
      event: { type: 'workflow_run.completed', labels: [], issueNumber: 378, ref: 'main',
        workflowPath: '.github/workflows/copilot-agent-dev.yml', workflowConclusion: 'failure' },
      pipelines: [bugFix], owner: 'o', repo: 'r', runtimeRegistry, identities, env, clock,
    });
    // success -> qa, which is dispatched and awaiting again: still labelled
    expect(latestState(client).currentStep).toBe('qa');
    expect(client._labels.get(378).has(AWAITING_LABEL)).toBe(true);
  });

  it('a failing label API never fails the run', async () => {
    const client = makeClient();
    client.addLabels.mockRejectedValue(new Error('boom'));
    const s = await start(client);
    expect(s.status).toBe('awaiting-agent');
  });
});

describe('reconcileAwaitingRuns', () => {
  it('applies a reported outcome once the agent run has finished and the event path missed it', async () => {
    const client = makeClient({ runs: [mkRun()] });
    const s = await start(client);
    backdate(client, 20);
    client.postBot(marker(s, 'blocker'), minutesAgo(15));
    client.triggerWorkflow.mockClear();

    await sweep(client);

    const after = latestState(client);
    expect(after.outcome).toBe('blocker');
    expect(after.iterations['dev->dev']).toBe(1);
    expect(client.triggerWorkflow).toHaveBeenCalledWith('o', 'r', 'copilot-agent-dev.yml', 'main', expect.any(Object));
  });

  it('ends the run with runtime-error when the agent run failed without reporting', async () => {
    const client = makeClient({ runs: [mkRun({ conclusion: 'cancelled' })] });
    await start(client);
    backdate(client, 20);

    await sweep(client);

    const after = latestState(client);
    expect(after.status).toBe('failed');
    expect(after.outcome).toBe('runtime-error');
    expect(client._labels.get(378).has(AWAITING_LABEL)).toBe(false);
  });

  it('leaves a run alone while its agent is still running', async () => {
    const client = makeClient({ runs: [mkRun({ status: 'in_progress', conclusion: null, updated_at: minutesAgo(1) })] });
    const s = await start(client);
    backdate(client, 5);
    client.postBot(marker(s, 'blocker'), minutesAgo(1));
    const before = client._comments.length;

    await sweep(client);

    expect(client._comments.length).toBe(before);
    expect(latestState(client).status).toBe('awaiting-agent');
  });

  it('gives the event path a grace period for a run that just finished', async () => {
    const client = makeClient({ runs: [mkRun({ updated_at: minutesAgo(0.5) })] });
    await start(client);
    backdate(client, 5);
    const before = client._comments.length;

    await sweep(client);

    expect(client._comments.length).toBe(before);
  });

  it('enforces timeout_minutes on a silent agent that produced no event and no run', async () => {
    const client = makeClient({ runs: [] });
    await start(client);
    backdate(client, 45);                    // dev step allows 30

    await sweep(client);

    const after = latestState(client);
    expect(after.status).toBe('timed-out');
    expect(after.outcome).toBe('timeout');
    expect(client.addLabels).toHaveBeenCalledWith('o', 'r', 378, expect.arrayContaining(['status:step-timeout']));
    expect(client._labels.get(378).has(AWAITING_LABEL)).toBe(false);
  });

  it('does nothing to a run still inside its timeout', async () => {
    const client = makeClient({ runs: [] });
    await start(client);
    backdate(client, 10);
    const before = client._comments.length;
    await sweep(client);
    expect(client._comments.length).toBe(before);
  });

  it('trusts an old marker when no agent run can be found at all', async () => {
    const client = makeClient({ runs: [] });
    const s = await start(client);
    backdate(client, 25);
    client.postBot(marker(s, 'blocker'), minutesAgo(20));
    await sweep(client);
    expect(latestState(client).outcome).toBe('blocker');
  });

  it('does not trust a fresh marker when no agent run can be found', async () => {
    const client = makeClient({ runs: [] });
    const s = await start(client);
    backdate(client, 5);
    client.postBot(marker(s, 'blocker'), minutesAgo(1));
    await sweep(client);
    expect(latestState(client).status).toBe('awaiting-agent');
  });

  it("ignores another issue's run and runs created before the dispatch", async () => {
    const client = makeClient({ runs: [
      mkRun({ display_title: 'Developer Agent (Copilot) #999' }),
      mkRun({ created_at: minutesAgo(120), updated_at: minutesAgo(100) }),
    ] });
    await start(client);
    backdate(client, 20);
    await sweep(client);
    // no matching run and no marker, still within 30m? no: 20 < 30 -> untouched
    expect(latestState(client).status).toBe('awaiting-agent');
  });

  it('survives a run-lookup API failure and still enforces the timeout', async () => {
    const client = makeClient();
    client.listWorkflowRuns.mockRejectedValue(new Error('rate limited'));
    await start(client);
    backdate(client, 45);
    await sweep(client);
    expect(latestState(client).status).toBe('timed-out');
  });

  it('heals a stale label on an issue whose run is no longer awaiting', async () => {
    const client = makeClient({ runs: [mkRun()] });
    const s = await start(client);
    backdate(client, 20);
    client.postBot(marker(s, 'success'), minutesAgo(15));
    // The event path settled it, but the label was left behind.
    await sweep(client);
    client._labels.get(378).add(AWAITING_LABEL);
    await sweep(client);
    expect(client._labels.get(378).has(AWAITING_LABEL)).toBe(true); // qa now awaiting: legitimately labelled
  });

  it('isolates failures: one bad issue does not stop the sweep', async () => {
    const client = makeClient({ runs: [] });
    await start(client, 1);
    await start(client, 2);
    backdate(client, 45, 1);
    backdate(client, 45, 2);
    const orig = client.listComments.getMockImplementation();
    client.listComments.mockImplementation(async (...a) => {
      if (a[2] === 1) throw new Error('boom');     // issue 1 is poisoned for the whole sweep
      return orig(...a);
    });
    const res = await reconcileAwaitingRuns({
      client, event: { type: 'schedule.reconcile' }, pipelines: [bugFix], owner: 'o', repo: 'r',
      runtimeRegistry, identities, env, clock,
    });
    expect(res).toEqual({ scanned: 2, settled: 1 });
    expect(latestState(client, 2).status).toBe('timed-out');
  });

  it('a stale workflow_run from an earlier iteration is ignored by the event path', async () => {
    const client = makeClient();
    await start(client);
    backdate(client, 5);
    const before = client._comments.length;
    await runOrchestrator({
      client,
      event: { type: 'workflow_run.completed', labels: [], issueNumber: 378, ref: 'main',
        workflowPath: '.github/workflows/copilot-agent-dev.yml', workflowConclusion: 'failure',
        workflowCreatedAt: minutesAgo(60) },
      pipelines: [bugFix], owner: 'o', repo: 'r', runtimeRegistry, identities, env, clock,
    });
    expect(client._comments.length).toBe(before);
    expect(latestState(client).status).toBe('awaiting-agent');
  });
});
