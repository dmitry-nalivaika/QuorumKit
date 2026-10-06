/**
 * #378 — a dispatched agent finishes (often non-zero) after posting a bot-authored result comment
 * carrying `<!-- apm:run_id=… step=… iteration=… runtime=… outcome=… -->`. The orchestrator
 * workflow skips bot-authored comments, so the finished workflow_run must pick the result up and
 * drive the pipeline's transition table instead of leaving the run stuck in `awaiting-agent`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runOrchestrator, issueNumberFromRunTitle } from '../orchestrator/index.js';

globalThis.__APM_TEST_NO_FS = true;

const bugFix = {
  name: 'bug-fix-pipeline',
  schemaVersion: '2',
  trigger: { event: 'issues.labeled', labels: ['triaged', 'type:bug'] },
  entry: 'dev',
  steps: [
    { name: 'dev', agent: 'dev-agent' },
    { name: 'qa', agent: 'qa-agent' },
  ],
  transitions: [
    { from: 'dev', outcome: 'success', to: 'qa' },
    { from: 'dev', outcome: 'blocker', to: 'dev' },
    { from: 'dev', outcome: 'needs-human', to: 'dev' },
  ],
  loopBudget: { max_iterations_per_edge: 2, max_total_steps: 30, max_wallclock_minutes: 720 },
};

const runtimeRegistry = {
  default_runtime: 'rt',
  agent_defaults: {},
  runtimes: { rt: { kind: 'copilot', endpoint: 'https://api.github.com', credential_ref: 'GITHUB_TOKEN' } },
};
const identities = new Map([['github-actions[bot]', 'dev-agent'], ['qa-bot', 'qa-agent']]);

function makeClient() {
  const comments = [];
  let id = 100, tick = Date.now();
  return {
    _comments: comments,
    listComments: vi.fn(async () => comments.slice()),
    createComment: vi.fn(async (_o, _r, _i, body, user) => {
      const c = { id: id++, body, created_at: new Date(tick++).toISOString(), user: user ? { login: user } : undefined };
      comments.push(c);
      return c;
    }),
    updateComment: vi.fn(async (_o, _r, cid, body) => { const c = comments.find(x => x.id === cid); if (c) c.body = body; return c; }),
    triggerWorkflow: vi.fn().mockResolvedValue(undefined),
    getCollaboratorPermission: vi.fn().mockResolvedValue('write'),
    addLabels: vi.fn().mockResolvedValue(undefined),
    // test helper: a comment authored by someone other than the orchestrator
    postAs(login, body) {
      const c = { id: id++, body, created_at: new Date(tick++).toISOString(), user: { login } };
      comments.push(c);
      return c;
    },
  };
}

const clock = { now: () => 0, sleep: vi.fn(async () => {}) };
const env = { GITHUB_TOKEN: 'x' };

function latestState(client) {
  const c = client._comments.filter(x => x.body.includes('apm-pipeline-state')).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  return JSON.parse(c.body.match(/<!-- apm-pipeline-state: (.*?) -->/s)[1]);
}

async function start(client, issue = 378) {
  await runOrchestrator({
    client,
    event: {
      type: 'issues.labeled', labels: ['triaged', 'type:bug'], issueNumber: issue, ref: 'main',
      _rawEventName: 'issues',
      _rawPayload: { action: 'labeled', label: { name: 'type:bug' }, issue: { number: issue, updated_at: '2026-10-06T07:00:00Z' } },
    },
    pipelines: [bugFix], owner: 'o', repo: 'r', runtimeRegistry, identities, env, clock,
  });
  return latestState(client);
}

const marker = (s, o, step = 'dev', iteration = 1) =>
  `**[QuorumKit Orchestrator]** Developer Agent (copilot) -- outcome: \`${o}\`\n\nSpec missing.\n\n<!-- apm:run_id=${s.runId} step=${step} iteration=${iteration} runtime=copilot-default outcome=${o} -->`;

// Shape of a real workflow_run: the human name does NOT contain the agent slug; the path does.
const finished = (n, conclusion = 'failure', file = 'copilot-agent-dev.yml', name = 'Developer Agent (Copilot)') => ({
  type: 'workflow_run.completed', labels: [], issueNumber: n, ref: 'main',
  workflowName: name, workflowPath: `.github/workflows/${file}`, workflowConclusion: conclusion,
});

const resume = (client, event) => runOrchestrator({
  client, event, pipelines: [bugFix], owner: 'o', repo: 'r', runtimeRegistry, identities, env, clock,
});

describe('issueNumberFromRunTitle', () => {
  it('reads the trailing #<n> from a run title', () => {
    expect(issueNumberFromRunTitle('Developer Agent (Copilot) #376')).toBe(376);
    expect(issueNumberFromRunTitle('QA/Test Agent (Copilot) #7 ')).toBe(7);
  });
  it('returns null when there is no trailing number', () => {
    expect(issueNumberFromRunTitle('Developer Agent (Copilot)')).toBeNull();
    expect(issueNumberFromRunTitle('Fix #12 in the middle')).toBeNull();
    expect(issueNumberFromRunTitle(undefined)).toBeNull();
  });
});

describe('workflow_run.completed ingests the agent result marker (#378)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('takes the dev -> dev transition on a failed run that reported `blocker`', async () => {
    const client = makeClient();
    const s = await start(client);
    expect(s.status).toBe('awaiting-agent');
    client.postAs('github-actions[bot]', marker(s, 'blocker'));
    client.triggerWorkflow.mockClear();

    await resume(client, finished(378, 'failure'));

    const after = latestState(client);
    expect(after.outcome).toBe('blocker');
    expect(after.status).toBe('awaiting-agent');     // re-dispatched, not stuck and not failed
    expect(after.currentStep).toBe('dev');
    expect(after.iterations['dev->dev']).toBe(1);     // backward edge counted against the loop budget
    expect(client.triggerWorkflow).toHaveBeenCalledWith('o', 'r', 'copilot-agent-dev.yml', 'main', expect.any(Object));
  });

  it('handles `needs-human` the same way (not specific to blocker)', async () => {
    const client = makeClient();
    const s = await start(client);
    client.postAs('github-actions[bot]', marker(s, 'needs-human'));
    await resume(client, finished(378, 'failure'));
    expect(latestState(client).outcome).toBe('needs-human');
  });

  it('advances on `success` from a run that concluded success', async () => {
    const client = makeClient();
    const s = await start(client);
    client.postAs('github-actions[bot]', marker(s, 'success'));
    client.triggerWorkflow.mockClear();
    await resume(client, finished(378, 'success'));
    const after = latestState(client);
    expect(after.currentStep).toBe('qa');
    expect(client.triggerWorkflow).toHaveBeenCalledWith('o', 'r', 'copilot-agent-qa.yml', 'main', expect.any(Object));
  });

  it('still marks the run failed with runtime-error when the agent crashed without reporting', async () => {
    const client = makeClient();
    await start(client);
    await resume(client, finished(378, 'failure'));
    const after = latestState(client);
    expect(after.status).toBe('failed');
    expect(after.outcome).toBe('runtime-error');
  });

  it('ignores a marker from another run, another step, or a stale iteration', async () => {
    const client = makeClient();
    const s = await start(client);
    client.postAs('github-actions[bot]', marker({ runId: 'other-run' }, 'success'));
    client.postAs('github-actions[bot]', marker(s, 'success', 'qa'));
    client.postAs('github-actions[bot]', marker(s, 'success', 'dev', 5));
    await resume(client, finished(378, 'failure'));
    expect(latestState(client).outcome).toBe('runtime-error');   // fell through to crash handling
  });

  it('ignores a marker posted by a login that is not the expected agent (forgery)', async () => {
    const client = makeClient();
    const s = await start(client);
    client.postAs('some-human', marker(s, 'success'));
    client.postAs('qa-bot', marker(s, 'success'));               // right shape, wrong agent for `dev`
    await resume(client, finished(378, 'failure'));
    expect(latestState(client).outcome).toBe('runtime-error');
  });

  it('ignores an unknown outcome value', async () => {
    const client = makeClient();
    const s = await start(client);
    client.postAs('github-actions[bot]', marker(s, 'banana'));
    await resume(client, finished(378, 'failure'));
    expect(latestState(client).outcome).toBe('runtime-error');
  });

  it('uses the newest matching marker when an agent reported more than once', async () => {
    const client = makeClient();
    const s = await start(client);
    client.postAs('github-actions[bot]', marker(s, 'needs-human'));
    client.postAs('github-actions[bot]', marker(s, 'blocker'));
    await resume(client, finished(378, 'failure'));
    expect(latestState(client).outcome).toBe('blocker');
  });

  it('ignores a finished workflow that belongs to a different agent', async () => {
    const client = makeClient();
    const s = await start(client);
    client.postAs('github-actions[bot]', marker(s, 'blocker'));
    const before = latestState(client);
    await resume(client, finished(378, 'failure', 'copilot-agent-qa.yml', 'QA/Test Agent (Copilot)'));
    expect(latestState(client)).toEqual(before);
  });
});
