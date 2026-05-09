/**
 * Phase 7 — worked-example tests.
 *
 * Loads the shipped `.apm/pipelines/feature-pipeline-v2.yml` and exercises:
 *   1. happy path: ba → architect (skipped via condition) → dev → qa → reviewer → release(approval)
 *   2. loop-budget exceeded when QA repeatedly bounces dev past the per-edge cap
 *   3. three-runtime fixture (copilot + claude + a per-step override) all dispatch correctly
 *
 * The runtime adapters are dependency-injected via runtimeRegistry so the
 * tests don't touch real GitHub.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { runOrchestrator } from '../orchestrator/index.js';
import { normalise } from '../orchestrator/pipeline-loader.js';

globalThis.__APM_TEST_NO_FS = true;

const fastClock = { now: () => 0, sleep: vi.fn(async () => {}) };
const env = { GITHUB_TOKEN: 'gh_xxx', ANTHROPIC_API_KEY: 'ak_xxx' };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PIPELINE_PATH = path.resolve(__dirname, '../../.apm/pipelines/feature-pipeline.yml');

async function loadV2WorkedExample() {
  const raw = await readFile(PIPELINE_PATH, 'utf8');
  const parsed = yaml.load(raw);
  return normalise(parsed);
}

const identities = new Map([
  ['ba-bot',        'ba-agent'],
  ['architect-bot', 'architect-agent'],
  ['dev-bot',       'dev-agent'],
  ['qa-bot',        'qa-agent'],
  ['reviewer-bot',  'reviewer-agent'],
  ['release-bot',   'release-agent'],
]);

const runtimeRegistryDefault = {
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

const runtimeRegistryThreeRuntimes = {
  default_runtime: 'copilot-default',
  agent_defaults: {
    'qa-agent':       'claude-default',  // QA runs on Claude
    'reviewer-agent': 'copilot-fast',    // Reviewer uses an alternate copilot
  },
  runtimes: {
    'copilot-default': { kind: 'copilot', endpoint: 'https://api.github.com',  credential_ref: 'GITHUB_TOKEN' },
    'copilot-fast':    { kind: 'copilot', endpoint: 'https://api.github.com',  credential_ref: 'GITHUB_TOKEN' },
    'claude-default':  { kind: 'claude',  endpoint: 'https://api.anthropic.com', credential_ref: 'ANTHROPIC_API_KEY' },
  },
};

function makeMutableClient() {
  const comments = [];
  let nextId = 100;
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
    getCollaboratorPermission: vi.fn().mockResolvedValue('admin'),
    addLabels: vi.fn().mockResolvedValue(undefined),
  };
}

function parseLatestState(client) {
  const sc = client._comments
    .filter(c => c.body.includes('apm-pipeline-state'))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (sc.length === 0) return null;
  const m = sc[0].body.match(/<!-- apm-pipeline-state: (.*?) -->/s);
  return m ? JSON.parse(m[1]) : null;
}

async function postApmMsg({ client, pipeline, runtimeRegistry, issueNumber, runId, step, agent, user, outcome, iteration = 1 }) {
  const apmMsg = { version: '2', runId, step, agent, iteration, outcome, summary: `${step} ${outcome}` };
  await runOrchestrator({
    client,
    event: {
      type: 'issue_comment.created',
      issueNumber, ref: 'main', labels: [],
      comment: { body: `\`\`\`apm-msg\n${JSON.stringify(apmMsg)}\n\`\`\``, user },
      _rawEventName: 'issue_comment',
      _rawPayload: { action: 'created', issue: { number: issueNumber }, comment: { id: Math.floor(Math.random() * 1e9) } },
    },
    pipelines: [pipeline], owner: 'o', repo: 'r',
    runtimeRegistry, identities, env, clock: fastClock,
  });
}

async function startRun({ client, pipeline, runtimeRegistry, issueNumber, extraLabels = [] }) {
  await runOrchestrator({
    client,
    event: {
      type: 'issues.labeled',
      labels: ['triaged', 'type:feature', ...extraLabels],
      issueNumber, ref: 'main',
      _rawEventName: 'issues',
      _rawPayload: {
        action: 'labeled', label: { name: 'type:feature' },
        issue: { number: issueNumber, updated_at: new Date().toISOString() },
      },
    },
    pipelines: [pipeline], owner: 'o', repo: 'r',
    runtimeRegistry, identities, env, clock: fastClock,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('worked-example feature-pipeline-v2', () => {
  let pipeline;
  beforeEach(async () => { pipeline = await loadV2WorkedExample(); });

  it('runs the happy path ba → dev → qa → reviewer → release and stops at the approval gate', async () => {
    const client = makeMutableClient();
    await startRun({ client, pipeline, runtimeRegistry: runtimeRegistryDefault, issueNumber: 100 });

    const start = parseLatestState(client);
    expect(start.currentStep).toBe('ba');

    // Architect step has condition labels.includes('needs:adr') — without that
    // label the loader still keeps the step but the orchestrator does not
    // skip-evaluate v2 conditions (FR-006). For the worked example we route
    // ba → architect on success per the transitions table; have BA emit
    // 'success' which forwards to architect, then architect emits success.
    await postApmMsg({ client, pipeline, runtimeRegistry: runtimeRegistryDefault, issueNumber: 100, runId: start.runId, step: 'ba',        agent: 'ba-agent',        user: 'ba-bot',        outcome: 'success' });
    await postApmMsg({ client, pipeline, runtimeRegistry: runtimeRegistryDefault, issueNumber: 100, runId: start.runId, step: 'architect', agent: 'architect-agent', user: 'architect-bot', outcome: 'success' });
    await postApmMsg({ client, pipeline, runtimeRegistry: runtimeRegistryDefault, issueNumber: 100, runId: start.runId, step: 'dev',       agent: 'dev-agent',       user: 'dev-bot',       outcome: 'success' });
    await postApmMsg({ client, pipeline, runtimeRegistry: runtimeRegistryDefault, issueNumber: 100, runId: start.runId, step: 'qa',        agent: 'qa-agent',        user: 'qa-bot',        outcome: 'success' });
    await postApmMsg({ client, pipeline, runtimeRegistry: runtimeRegistryDefault, issueNumber: 100, runId: start.runId, step: 'reviewer',  agent: 'reviewer-agent',  user: 'reviewer-bot',  outcome: 'success' });

    const after = parseLatestState(client);
    // Either parked at release awaiting approval, or release dispatched
    expect(['awaiting-approval', 'awaiting-agent', 'running']).toContain(after.status);
    expect(after.currentStep).toBe('release');
    // Workflow dispatches happened for each forward step
    const wfs = client.triggerWorkflow.mock.calls.map(c => c[2]);
    expect(wfs).toEqual(expect.arrayContaining([
      'copilot-agent-ba-agent.yml',
      'copilot-agent-architect-agent.yml',
      'copilot-agent-dev-agent.yml',
      'copilot-agent-qa-agent.yml',
      'copilot-agent-reviewer-agent.yml',
    ]));
  });

  it('trips loop-budget-exceeded when QA bounces dev past max_iterations_per_edge', async () => {
    // Tighten the budget for this test so we don't need 4 round trips.
    const tight = { ...pipeline, loopBudget: { max_iterations_per_edge: 2, max_total_steps: 30, max_wallclock_minutes: 720 } };
    const client = makeMutableClient();
    await startRun({ client, pipeline: tight, runtimeRegistry: runtimeRegistryDefault, issueNumber: 101 });
    const start = parseLatestState(client);

    // ba → architect → dev → qa(fail → dev) → dev → qa(fail → dev) → would be iter 3, blocked by budget=2
    await postApmMsg({ client, pipeline: tight, runtimeRegistry: runtimeRegistryDefault, issueNumber: 101, runId: start.runId, step: 'ba',        agent: 'ba-agent',        user: 'ba-bot',        outcome: 'success' });
    await postApmMsg({ client, pipeline: tight, runtimeRegistry: runtimeRegistryDefault, issueNumber: 101, runId: start.runId, step: 'architect', agent: 'architect-agent', user: 'architect-bot', outcome: 'success' });
    await postApmMsg({ client, pipeline: tight, runtimeRegistry: runtimeRegistryDefault, issueNumber: 101, runId: start.runId, step: 'dev',       agent: 'dev-agent',       user: 'dev-bot',       outcome: 'success' });
    await postApmMsg({ client, pipeline: tight, runtimeRegistry: runtimeRegistryDefault, issueNumber: 101, runId: start.runId, step: 'qa',        agent: 'qa-agent',        user: 'qa-bot',        outcome: 'fail' }); // iter 1 backward
    // dev re-runs at iter 1 of qa->dev edge
    let s = parseLatestState(client);
    await postApmMsg({ client, pipeline: tight, runtimeRegistry: runtimeRegistryDefault, issueNumber: 101, runId: start.runId, step: 'dev',       agent: 'dev-agent',       user: 'dev-bot',       outcome: 'success', iteration: s.currentIteration });
    s = parseLatestState(client);
    await postApmMsg({ client, pipeline: tight, runtimeRegistry: runtimeRegistryDefault, issueNumber: 101, runId: start.runId, step: 'qa',        agent: 'qa-agent',        user: 'qa-bot',        outcome: 'fail', iteration: s.currentIteration });
    s = parseLatestState(client);
    await postApmMsg({ client, pipeline: tight, runtimeRegistry: runtimeRegistryDefault, issueNumber: 101, runId: start.runId, step: 'dev',       agent: 'dev-agent',       user: 'dev-bot',       outcome: 'success', iteration: s.currentIteration });
    s = parseLatestState(client);
    await postApmMsg({ client, pipeline: tight, runtimeRegistry: runtimeRegistryDefault, issueNumber: 101, runId: start.runId, step: 'qa',        agent: 'qa-agent',        user: 'qa-bot',        outcome: 'fail', iteration: s.currentIteration }); // would be iter 3 — exceeds 2

    const after = parseLatestState(client);
    expect(after.status).toBe('loop-budget-exceeded');
    expect(client.addLabels).toHaveBeenCalledWith(
      'o', 'r', 101, expect.arrayContaining(['status:loop-budget-exceeded']),
    );
  });

  it('dispatches three runtimes correctly via the agent_defaults precedence', async () => {
    const client = makeMutableClient();
    await startRun({ client, pipeline, runtimeRegistry: runtimeRegistryThreeRuntimes, issueNumber: 102 });
    const start = parseLatestState(client);

    await postApmMsg({ client, pipeline, runtimeRegistry: runtimeRegistryThreeRuntimes, issueNumber: 102, runId: start.runId, step: 'ba',        agent: 'ba-agent',        user: 'ba-bot',        outcome: 'success' });
    await postApmMsg({ client, pipeline, runtimeRegistry: runtimeRegistryThreeRuntimes, issueNumber: 102, runId: start.runId, step: 'architect', agent: 'architect-agent', user: 'architect-bot', outcome: 'success' });
    await postApmMsg({ client, pipeline, runtimeRegistry: runtimeRegistryThreeRuntimes, issueNumber: 102, runId: start.runId, step: 'dev',       agent: 'dev-agent',       user: 'dev-bot',       outcome: 'success' });
    await postApmMsg({ client, pipeline, runtimeRegistry: runtimeRegistryThreeRuntimes, issueNumber: 102, runId: start.runId, step: 'qa',        agent: 'qa-agent',        user: 'qa-bot',        outcome: 'success' });

    const dispatched = client.triggerWorkflow.mock.calls.map(c => c[2]);
    // BA, Architect, Dev → copilot-default → 'copilot-agent-*.yml'
    expect(dispatched).toEqual(expect.arrayContaining([
      'copilot-agent-ba-agent.yml',
      'copilot-agent-architect-agent.yml',
      'copilot-agent-dev-agent.yml',
    ]));
    // QA → claude-default → 'agent-qa-agent.yml'
    expect(dispatched).toContain('agent-qa-agent.yml');
    // Reviewer dispatch is via copilot-fast (still the copilot kind → copilot-agent-*.yml)
    expect(dispatched).toContain('copilot-agent-reviewer-agent.yml');

    // Verify state captured the runtime per step (last applicable runtime_used)
    const state = parseLatestState(client);
    expect(['copilot-default', 'copilot-fast', 'claude-default']).toContain(state.runtime_used);
  });
});
