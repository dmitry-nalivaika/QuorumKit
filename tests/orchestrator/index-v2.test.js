/**
 * End-to-end integration tests for the v2 dispatch path through
 * `runOrchestrator`. Exercises:
 *   - schemaVersion: '2' branch routing
 *   - runtime resolution via runtime-registry
 *   - invokeAgentV2 dispatch (copilot kind)
 *   - apm-msg ingestion via issue_comment.created
 *   - identity check + transition resolution
 *   - persistV2 (audit + live-status upsert)
 *   - loop-budget gating on backward edges
 *   - workflow_run.completed handling for v2 runs
 *
 * The pipeline objects passed in are pre-normalised (the loader normally
 * does this); this lets the tests stay focused on dispatch logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runOrchestrator } from '../../scripts/orchestrator/index.js';

// Avoid /tmp filesystem writes during tests.
globalThis.__APM_TEST_NO_FS = true;

// ─── Fixtures ─────────────────────────────────────────────────────────────

const v2Pipeline = {
  name: 'feature-pipeline-v2',
  schemaVersion: '2',
  trigger: { event: 'issues.labeled', labels: ['triaged', 'type:feature'] },
  entry: 'ba',
  steps: [
    { name: 'ba',  agent: 'ba-agent' },
    { name: 'dev', agent: 'dev-agent' },
    { name: 'qa',  agent: 'qa-agent' },
  ],
  transitions: [
    { from: 'ba',  outcome: 'success', to: 'dev' },
    { from: 'dev', outcome: 'success', to: 'qa' },
    { from: 'qa',  outcome: 'success', to: 'qa' },   // terminal self-loop
    { from: 'qa',  outcome: 'fail',    to: 'dev' },  // backward edge
  ],
  loopBudget: { max_iterations_per_edge: 2, max_total_steps: 30, max_wallclock_minutes: 720 },
};

const runtimeRegistry = {
  default_runtime: 'copilot-default',
  agent_defaults: {},
  runtimes: {
    'copilot-default': {
      kind: 'copilot',
      endpoint: 'https://api.github.com',
      credential_ref: 'GITHUB_TOKEN',
    },
  },
};

const identities = new Map([
  ['ba-bot',  'ba-agent'],
  ['dev-bot', 'dev-agent'],
  ['qa-bot',  'qa-agent'],
]);

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeMutableClient(initialComments = []) {
  const comments = [...initialComments];
  let nextId = initialComments.length + 100;
  // Monotonically increasing virtual clock so audit comments sort
  // unambiguously by created_at — Date.now() collides at sub-ms speed.
  // Anchor near "now" because the orchestrator uses real Date.now() for
  // wallclock budget comparisons against created_at.
  let tick = Date.now();

  return {
    _comments: comments,
    listComments: vi.fn(async () => comments.slice()),
    createComment: vi.fn(async (_o, _r, _i, body) => {
      const c = { id: nextId++, body, created_at: new Date(tick++).toISOString() };
      comments.push(c);
      return c;
    }),
    updateComment: vi.fn(async (_o, _r, id, body) => {
      const c = comments.find(x => x.id === id);
      if (c) c.body = body;
      return c;
    }),
    triggerWorkflow: vi.fn().mockResolvedValue(undefined),
    getCollaboratorPermission: vi.fn().mockResolvedValue('write'),
    addLabels: vi.fn().mockResolvedValue(undefined),
  };
}

function findLatestStateBody(client) {
  const stateComments = client._comments
    .filter(c => c.body.includes('apm-pipeline-state'))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return stateComments[0]?.body ?? null;
}

function parseLatestState(client) {
  const body = findLatestStateBody(client);
  if (!body) return null;
  const m = body.match(/<!-- apm-pipeline-state: (.*?) -->/s);
  return m ? JSON.parse(m[1]) : null;
}

const fastClock = { now: () => 0, sleep: vi.fn(async () => {}) };
const env = { GITHUB_TOKEN: 'gh_xxx' };

// ─── Tests ────────────────────────────────────────────────────────────────

describe('runOrchestrator — v2 dispatch path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts a v2 run, resolves the runtime, dispatches the entry step, and pauses awaiting-agent', async () => {
    const client = makeMutableClient();
    const event = {
      type: 'issues.labeled',
      labels: ['triaged', 'type:feature'],
      issueNumber: 42,
      ref: 'main',
      _rawEventName: 'issues',
      _rawPayload: { action: 'labeled', label: { name: 'type:feature' }, issue: { number: 42, updated_at: '2026-05-08T10:00:00Z' } },
    };

    await runOrchestrator({
      client, event, pipelines: [v2Pipeline], owner: 'o', repo: 'r',
      runtimeRegistry, identities, env, clock: fastClock,
    });

    // Copilot kind dispatches via copilot-agent-<agent>.yml
    expect(client.triggerWorkflow).toHaveBeenCalledWith(
      'o', 'r', 'copilot-agent-ba-agent.yml', 'main', expect.any(Object)
    );

    const state = parseLatestState(client);
    expect(state.schemaVersion).toBe('2');
    expect(state.status).toBe('awaiting-agent');
    expect(state.currentStep).toBe('ba');
    expect(state.currentIteration).toBe(1);
    expect(state.runtime_used).toBe('copilot-default');
  });

  it('advances to the next step when the active agent posts a valid apm-msg success', async () => {
    const client = makeMutableClient();

    // 1) Start the run
    await runOrchestrator({
      client,
      event: {
        type: 'issues.labeled',
        labels: ['triaged', 'type:feature'],
        issueNumber: 42,
        ref: 'main',
        _rawEventName: 'issues',
        _rawPayload: { action: 'labeled', label: { name: 'type:feature' }, issue: { number: 42, updated_at: '2026-05-08T10:00:00Z' } },
      },
      pipelines: [v2Pipeline], owner: 'o', repo: 'r',
      runtimeRegistry, identities, env, clock: fastClock,
    });

    const initial = parseLatestState(client);
    expect(initial.currentStep).toBe('ba');

    // 2) BA agent posts an apm-msg success comment
    const apmMsg = {
      version: '2',
      runId: initial.runId,
      step: 'ba',
      agent: 'ba-agent',
      iteration: 1,
      outcome: 'success',
      summary: 'Spec finalised',
    };
    const commentEvent = {
      type: 'issue_comment.created',
      issueNumber: 42,
      ref: 'main',
      labels: [],
      comment: {
        body: `Done.\n\n\`\`\`apm-msg\n${JSON.stringify(apmMsg)}\n\`\`\`\n`,
        user: 'ba-bot',
      },
      _rawEventName: 'issue_comment',
      _rawPayload: { action: 'created', issue: { number: 42 }, comment: { id: 7777 } },
    };

    await runOrchestrator({
      client, event: commentEvent, pipelines: [v2Pipeline], owner: 'o', repo: 'r',
      runtimeRegistry, identities, env, clock: fastClock,
    });

    // After ingestion the state should have advanced to dev and re-dispatched.
    const after = parseLatestState(client);
    expect(after.currentStep).toBe('dev');
    expect(after.status).toBe('awaiting-agent');
    expect(after.outcome).toBe('success');

    // The dev agent must have been invoked.
    const dispatchedAgents = client.triggerWorkflow.mock.calls.map(c => c[2]);
    expect(dispatchedAgents).toContain('copilot-agent-ba-agent.yml');
    expect(dispatchedAgents).toContain('copilot-agent-dev-agent.yml');
  });

  it('marks the run failed with outcome=protocol-violation when the apm-msg block is malformed', async () => {
    const client = makeMutableClient();
    await runOrchestrator({
      client,
      event: {
        type: 'issues.labeled',
        labels: ['triaged', 'type:feature'],
        issueNumber: 43,
        ref: 'main',
        _rawEventName: 'issues',
        _rawPayload: { action: 'labeled', label: { name: 'type:feature' }, issue: { number: 43, updated_at: '2026-05-08T10:00:00Z' } },
      },
      pipelines: [v2Pipeline], owner: 'o', repo: 'r',
      runtimeRegistry, identities, env, clock: fastClock,
    });
    const initial = parseLatestState(client);

    const malformed = `Got it.\n\n\`\`\`apm-msg\n{ not-json }\n\`\`\``;
    await runOrchestrator({
      client,
      event: {
        type: 'issue_comment.created',
        issueNumber: 43, ref: 'main', labels: [],
        comment: { body: malformed, user: 'ba-bot' },
        _rawEventName: 'issue_comment',
        _rawPayload: { action: 'created', issue: { number: 43 }, comment: { id: 8888 } },
      },
      pipelines: [v2Pipeline], owner: 'o', repo: 'r',
      runtimeRegistry, identities, env, clock: fastClock,
    });

    const after = parseLatestState(client);
    expect(after.status).toBe('failed');
    expect(after.outcome).toBe('protocol-violation');
    // run id should be preserved across the failure
    expect(after.runId).toBe(initial.runId);
  });

  it('silently ignores apm-msg comments from authors not in the identity registry', async () => {
    const client = makeMutableClient();
    await runOrchestrator({
      client,
      event: {
        type: 'issues.labeled',
        labels: ['triaged', 'type:feature'],
        issueNumber: 44,
        ref: 'main',
        _rawEventName: 'issues',
        _rawPayload: { action: 'labeled', label: { name: 'type:feature' }, issue: { number: 44, updated_at: '2026-05-08T10:00:00Z' } },
      },
      pipelines: [v2Pipeline], owner: 'o', repo: 'r',
      runtimeRegistry, identities, env, clock: fastClock,
    });
    const initial = parseLatestState(client);
    const dispatchCallsBefore = client.triggerWorkflow.mock.calls.length;

    const apmMsg = {
      version: '2',
      runId: initial.runId,
      step: 'ba',
      agent: 'ba-agent',
      iteration: 1,
      outcome: 'success',
      summary: 'I am a human pretending to be the BA agent.',
    };
    await runOrchestrator({
      client,
      event: {
        type: 'issue_comment.created',
        issueNumber: 44, ref: 'main', labels: [],
        comment: {
          body: `\`\`\`apm-msg\n${JSON.stringify(apmMsg)}\n\`\`\``,
          user: 'random-user',
        },
        _rawEventName: 'issue_comment',
        _rawPayload: { action: 'created', issue: { number: 44 }, comment: { id: 9999 } },
      },
      pipelines: [v2Pipeline], owner: 'o', repo: 'r',
      runtimeRegistry, identities, env, clock: fastClock,
    });

    const after = parseLatestState(client);
    expect(after.currentStep).toBe('ba');
    expect(after.status).toBe('awaiting-agent');
    expect(client.triggerWorkflow.mock.calls.length).toBe(dispatchCallsBefore);
  });

  it('skips processing on a dedup-key hit (FR-016)', async () => {
    const client = makeMutableClient();

    // First delivery — establishes a state comment carrying dedup_key.
    const event = {
      type: 'issues.labeled',
      labels: ['triaged', 'type:feature'],
      issueNumber: 45, ref: 'main',
      _rawEventName: 'issues',
      _rawPayload: { action: 'labeled', label: { name: 'type:feature' }, issue: { number: 45, updated_at: '2026-05-08T10:00:00Z' } },
    };
    await runOrchestrator({
      client, event, pipelines: [v2Pipeline], owner: 'o', repo: 'r',
      runtimeRegistry, identities, env, clock: fastClock,
    });

    const state1 = parseLatestState(client);
    expect(state1.dedup_key).toBeTruthy();

    // Second delivery — identical raw event payload → same dedup key → skip.
    const dispatchesBefore = client.triggerWorkflow.mock.calls.length;
    const commentsBefore = client._comments.length;

    await runOrchestrator({
      client, event, pipelines: [v2Pipeline], owner: 'o', repo: 'r',
      runtimeRegistry, identities, env, clock: fastClock,
    });

    expect(client.triggerWorkflow.mock.calls.length).toBe(dispatchesBefore);
    expect(client._comments.length).toBe(commentsBefore);
  });

  it('takes a backward edge on outcome=fail and tracks per-edge iterations', async () => {
    const client = makeMutableClient();
    const event = {
      type: 'issues.labeled',
      labels: ['triaged', 'type:feature'],
      issueNumber: 46, ref: 'main',
      _rawEventName: 'issues',
      _rawPayload: { action: 'labeled', label: { name: 'type:feature' }, issue: { number: 46, updated_at: '2026-05-08T10:00:00Z' } },
    };
    await runOrchestrator({
      client, event, pipelines: [v2Pipeline], owner: 'o', repo: 'r',
      runtimeRegistry, identities, env, clock: fastClock,
    });
    const start = parseLatestState(client);

    // Walk forward: ba -> dev (success), dev -> qa (success), qa -> dev (fail).
    const post = async (step, agent, user, outcome, iteration = 1) => {
      const apmMsg = {
        version: '2', runId: start.runId, step, agent, iteration, outcome,
        summary: `${step} ${outcome}`,
      };
      await runOrchestrator({
        client,
        event: {
          type: 'issue_comment.created',
          issueNumber: 46, ref: 'main', labels: [],
          comment: { body: `\`\`\`apm-msg\n${JSON.stringify(apmMsg)}\n\`\`\``, user },
          _rawEventName: 'issue_comment',
          _rawPayload: { action: 'created', issue: { number: 46 }, comment: { id: Math.random() } },
        },
        pipelines: [v2Pipeline], owner: 'o', repo: 'r',
        runtimeRegistry, identities, env, clock: fastClock,
      });
    };

    await post('ba',  'ba-agent',  'ba-bot',  'success');
    await post('dev', 'dev-agent', 'dev-bot', 'success');
    await post('qa',  'qa-agent',  'qa-bot',  'fail');

    const after = parseLatestState(client);
    expect(after.currentStep).toBe('dev');
    expect(after.currentEdgeKey).toBe('qa->dev');
    // First traversal of the backward edge → counter = 1.
    expect(after.iterations['qa->dev']).toBeGreaterThanOrEqual(1);
  });

  it('does not interfere with v1 pipelines on the same orchestrator', async () => {
    const v1 = {
      name: 'legacy-feature',
      version: '1',
      schemaVersion: '1',
      trigger: { event: 'issues.labeled', labels: ['triaged', 'type:legacy'] },
      entry: 'ba',
      steps: [{ name: 'ba', agent: 'ba' }, { name: 'dev', agent: 'dev' }],
      transitions: [{ from: 'ba', outcome: 'success', to: 'dev' }],
      loopBudget: null,
    };
    const client = makeMutableClient();
    await runOrchestrator({
      client,
      event: {
        type: 'issues.labeled',
        labels: ['triaged', 'type:legacy'],
        issueNumber: 50, ref: 'main',
      },
      pipelines: [v1, v2Pipeline], owner: 'o', repo: 'r', aiTool: 'copilot',
      runtimeRegistry, identities, env, clock: fastClock,
    });

    const state = parseLatestState(client);
    expect(state.schemaVersion).toBeUndefined(); // v1 state shape
    expect(state.currentStepIndex).toBe(0);
    expect(client.triggerWorkflow).toHaveBeenCalledWith(
      'o', 'r', 'copilot-agent-ba.yml', 'main', expect.any(Object)
    );
  });

  it('synthesises a timeout outcome and ends the run when no `timeout` transition is declared (FR-019)', async () => {
    // Pipeline whose ba step has a 1-minute timeout and no timeout transition.
    const pipeline = {
      name: 'tight-timeout-pipeline',
      schemaVersion: '2',
      trigger: { event: 'issues.labeled', labels: ['triaged', 'type:feature'] },
      entry: 'ba',
      steps: [
        { name: 'ba',  agent: 'ba-agent', timeout_minutes: 1 },
        { name: 'dev', agent: 'dev-agent' },
      ],
      transitions: [{ from: 'ba', outcome: 'success', to: 'dev' }],
      loopBudget: null,
    };

    const client = makeMutableClient();

    // Start the run.
    await runOrchestrator({
      client,
      event: {
        type: 'issues.labeled',
        labels: ['triaged', 'type:feature'],
        issueNumber: 60, ref: 'main',
        _rawEventName: 'issues',
        _rawPayload: { action: 'labeled', label: { name: 'type:feature' }, issue: { number: 60, updated_at: '2026-05-08T10:00:00Z' } },
      },
      pipelines: [pipeline], owner: 'o', repo: 'r',
      runtimeRegistry, identities, env, clock: fastClock,
    });

    // Backdate the awaitingSince marker on the latest state so the next event
    // crosses the 1-minute threshold without sleeping in real time.
    const stateComments = client._comments
      .filter(c => c.body.includes('apm-pipeline-state'))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const top = stateComments[0];
    const m = top.body.match(/<!-- apm-pipeline-state: (.*?) -->/s);
    const parsed = JSON.parse(m[1]);
    parsed.awaitingSince = new Date(Date.now() - 5 * 60_000).toISOString();
    parsed.updatedAt = parsed.awaitingSince;
    top.body = top.body.replace(/<!-- apm-pipeline-state: (.*?) -->/s,
      `<!-- apm-pipeline-state: ${JSON.stringify(parsed)} -->`);

    // Now any agent comment (or workflow_run.completed) on the issue should
    // trip the timeout. Use a non-agent comment so the identity check would
    // otherwise short-circuit; the timeout fires before identity check.
    await runOrchestrator({
      client,
      event: {
        type: 'issue_comment.created',
        issueNumber: 60, ref: 'main', labels: [],
        comment: { body: 'Are we still waiting?', user: 'random-bystander' },
        _rawEventName: 'issue_comment',
        _rawPayload: { action: 'created', issue: { number: 60 }, comment: { id: 12121 } },
      },
      pipelines: [pipeline], owner: 'o', repo: 'r',
      runtimeRegistry, identities, env, clock: fastClock,
    });

    const after = parseLatestState(client);
    expect(after.outcome).toBe('timeout');
    expect(after.status).toBe('timed-out');
    // status:step-timeout label should have been applied
    expect(client.addLabels).toHaveBeenCalledWith(
      'o', 'r', 60, expect.arrayContaining(['status:step-timeout']),
    );
  });
});
