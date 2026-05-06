import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runOrchestrator } from '../../scripts/orchestrator/index.js';

// Minimal pipeline fixture — triage is now standalone, pipelines start with ba/dev
const featurePipeline = {
  name: 'feature-pipeline',
  version: '1',
  trigger: { event: 'issues.labeled', labels: ['triaged', 'type:feature'] },
  steps: [
    { name: 'ba', agent: 'ba' },
    { name: 'dev', agent: 'dev' },
  ],
};

function makeClient() {
  return {
    listComments: vi.fn().mockResolvedValue([]),
    createComment: vi.fn().mockResolvedValue({ id: 1 }),
    triggerWorkflow: vi.fn().mockResolvedValue(undefined),
    getCollaboratorPermission: vi.fn().mockResolvedValue('write'),
  };
}

describe('orchestrator.runOrchestrator — new feature issue', () => {
  it('starts a new pipeline run and invokes the first agent when type:feature label is applied', async () => {
    const client = makeClient();
    const event = { type: 'issues.labeled', labels: ['triaged', 'type:feature'], issueNumber: 10, ref: 'main' };
    const pipelines = [featurePipeline];

    await runOrchestrator({ client, event, pipelines, owner: 'o', repo: 'r', aiTool: 'copilot' });

    // Should have saved state at least once
    const stateCalls = client.createComment.mock.calls.filter(c =>
      typeof c[3] === 'string' && c[3].includes('apm-pipeline-state')
    );
    expect(stateCalls.length).toBeGreaterThanOrEqual(1);

    // Should have triggered the first pipeline agent (ba, not triage)
    expect(client.triggerWorkflow).toHaveBeenCalledWith(
      'o', 'r', 'copilot-agent-ba.yml', 'main', expect.any(Object)
    );
  });

  it('pauses at awaiting-agent after dispatching the first step', async () => {
    const client = makeClient();
    const event = { type: 'issues.labeled', labels: ['triaged', 'type:feature'], issueNumber: 10, ref: 'main' };

    await runOrchestrator({ client, event, pipelines: [featurePipeline], owner: 'o', repo: 'r', aiTool: 'copilot' });

    // Only the first agent should be dispatched
    const workflowCalls = client.triggerWorkflow.mock.calls.map(c => c[2]);
    expect(workflowCalls).toEqual(['copilot-agent-ba.yml']);

    // State should be awaiting-agent (not completed)
    const allBodies = client.createComment.mock.calls.map(c => c[3]);
    const awaitingState = allBodies.find(b => typeof b === 'string' && b.includes('"status":"awaiting-agent"'));
    expect(awaitingState).toBeTruthy();
  });

  it('advances to the next step when workflow_run.completed fires for the current agent', async () => {
    const state = {
      runId: 'run-xyz',
      pipelineName: 'feature-pipeline',
      triggerEvent: 'issues.labeled',
      status: 'awaiting-agent',
      currentStepIndex: 0,
      steps: [
        { name: 'ba', status: 'awaiting-agent', startedAt: '2026-05-04T10:00:00Z', completedAt: null, outcome: null },
        { name: 'dev', status: 'pending', startedAt: null, completedAt: null, outcome: null },
      ],
      approvalGate: { requestedAt: null, timeoutAt: null, approvedBy: null },
      updatedAt: '2026-05-04T10:00:00Z',
    };
    const stateBody = `<!-- apm-pipeline-state: ${JSON.stringify(state)} -->`;
    const client = {
      listComments: vi.fn().mockResolvedValue([{ body: stateBody, created_at: '2026-05-04T10:00:00Z' }]),
      createComment: vi.fn().mockResolvedValue({ id: 3 }),
      triggerWorkflow: vi.fn().mockResolvedValue(undefined),
      getCollaboratorPermission: vi.fn().mockResolvedValue('write'),
    };
    const event = {
      type: 'workflow_run.completed',
      issueNumber: 10,
      ref: 'main',
      labels: [],
      workflowName: 'BA / Product Agent (Copilot)',
      workflowConclusion: 'success',
    };

    await runOrchestrator({ client, event, pipelines: [featurePipeline], owner: 'o', repo: 'r', aiTool: 'copilot' });

    // Should advance and dispatch the second agent (dev)
    expect(client.triggerWorkflow).toHaveBeenCalledWith('o', 'r', 'copilot-agent-dev.yml', 'main', expect.any(Object));
  });

  it('logs no-rule-match for issues.opened (pipelines only trigger on issues.labeled)', async () => {
    const client = makeClient();
    const event = { type: 'issues.opened', labels: ['triaged', 'type:feature'], issueNumber: 11, ref: 'main' };

    await runOrchestrator({ client, event, pipelines: [featurePipeline], owner: 'o', repo: 'r', aiTool: 'copilot' });

    expect(client.triggerWorkflow).not.toHaveBeenCalled();
    const auditCalls = client.createComment.mock.calls.filter(c =>
      typeof c[3] === 'string' && c[3].includes('no-rule-match')
    );
    expect(auditCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('does NOT start a pipeline when only type:feature is applied without triaged', async () => {
    const client = makeClient();
    const event = { type: 'issues.labeled', labels: ['type:feature'], issueNumber: 11, ref: 'main' };

    await runOrchestrator({ client, event, pipelines: [featurePipeline], owner: 'o', repo: 'r', aiTool: 'copilot' });

    expect(client.triggerWorkflow).not.toHaveBeenCalled();
    expect(client.createComment).not.toHaveBeenCalled();
  });

  it('marks run failed and posts a comment when aiTool is invalid', async () => {
    const client = makeClient();
    const event = { type: 'issues.labeled', labels: ['triaged', 'type:feature'], issueNumber: 12, ref: 'main' };

    await runOrchestrator({ client, event, pipelines: [featurePipeline], owner: 'o', repo: 'r', aiTool: 'openai' });

    const failedStateCalls = client.createComment.mock.calls.filter(c =>
      typeof c[3] === 'string' && c[3].includes('"status":"failed"')
    );
    expect(failedStateCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe('orchestrator.runOrchestrator — /approve comment', () => {
  it('resumes an awaiting-approval pipeline when an authorised user posts /approve', async () => {
    const state = {
      runId: 'run-abc',
      pipelineName: 'feature-pipeline',
      triggerEvent: 'issues.labeled',
      status: 'awaiting-approval',
      currentStepIndex: 1,
      steps: [
        { name: 'ba', status: 'completed', startedAt: '2026-05-04T10:00:00Z', completedAt: '2026-05-04T10:01:00Z', outcome: 'dispatched' },
        { name: 'dev', status: 'pending', startedAt: null, completedAt: null, outcome: null },
      ],
      approvalGate: {
        requestedAt: '2026-05-04T10:01:00Z',
        timeoutAt: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
        approvedBy: null,
      },
      updatedAt: '2026-05-04T10:01:00Z',
    };
    const stateBody = `<!-- apm-pipeline-state: ${JSON.stringify(state)} -->`;
    const client = {
      listComments: vi.fn().mockResolvedValue([{ body: stateBody, created_at: '2026-05-04T10:01:00Z' }]),
      createComment: vi.fn().mockResolvedValue({ id: 2 }),
      triggerWorkflow: vi.fn().mockResolvedValue(undefined),
      getCollaboratorPermission: vi.fn().mockResolvedValue('write'),
    };

    const event = {
      type: 'issue_comment.created',
      issueNumber: 10,
      ref: 'main',
      labels: [],
      comment: { body: '/approve', user: 'alice' },
    };

    await runOrchestrator({ client, event, pipelines: [featurePipeline], owner: 'o', repo: 'r', aiTool: 'copilot' });

    expect(client.triggerWorkflow).toHaveBeenCalledWith(
      'o', 'r', 'copilot-agent-dev.yml', 'main', expect.any(Object)
    );
  });
});
