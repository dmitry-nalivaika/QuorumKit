import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runOrchestrator } from '../../scripts/orchestrator/index.js';

// Minimal pipeline fixture
const featurePipeline = {
  name: 'feature-pipeline',
  version: '1',
  trigger: { event: 'issues.opened', labels: ['type:feature'] },
  steps: [
    { name: 'triage', agent: 'triage' },
    { name: 'ba', agent: 'ba' },
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
  it('starts a new pipeline run and invokes the first agent', async () => {
    const client = makeClient();
    const event = { type: 'issues.opened', labels: ['type:feature'], issueNumber: 10, ref: 'main' };
    const pipelines = [featurePipeline];

    await runOrchestrator({ client, event, pipelines, owner: 'o', repo: 'r', aiTool: 'copilot' });

    // Should have saved state at least once (pending → running)
    const stateCalls = client.createComment.mock.calls.filter(c =>
      typeof c[3] === 'string' && c[3].includes('apm-pipeline-state')
    );
    expect(stateCalls.length).toBeGreaterThanOrEqual(1);

    // Should have triggered the first agent workflow
    expect(client.triggerWorkflow).toHaveBeenCalledWith(
      'o', 'r', 'copilot-agent-triage.yml', 'main', expect.any(Object)
    );
  });

  it('invokes ALL steps in sequence within a single run', async () => {
    const client = makeClient();
    const event = { type: 'issues.opened', labels: ['type:feature'], issueNumber: 10, ref: 'main' };
    const pipelines = [featurePipeline];

    await runOrchestrator({ client, event, pipelines, owner: 'o', repo: 'r', aiTool: 'copilot' });

    const workflowCalls = client.triggerWorkflow.mock.calls.map(c => c[2]);
    expect(workflowCalls).toContain('copilot-agent-triage.yml');
    expect(workflowCalls).toContain('copilot-agent-ba.yml');

    // Final state should be 'completed'
    const allCommentBodies = client.createComment.mock.calls.map(c => c[3]);
    const completedState = allCommentBodies.find(b =>
      typeof b === 'string' && b.includes('"status":"completed"')
    );
    expect(completedState).toBeTruthy();
  });

  it('logs no-rule-match and does not invoke any agent when no pipeline matches', async () => {
    const client = makeClient();
    const event = { type: 'issues.opened', labels: ['type:chore'], issueNumber: 11, ref: 'main' };

    await runOrchestrator({ client, event, pipelines: [featurePipeline], owner: 'o', repo: 'r', aiTool: 'copilot' });

    expect(client.triggerWorkflow).not.toHaveBeenCalled();
    // An audit comment mentioning no-rule-match should be posted
    const auditCalls = client.createComment.mock.calls.filter(c =>
      typeof c[3] === 'string' && c[3].includes('no-rule-match')
    );
    expect(auditCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('marks run failed and posts a comment when aiTool is invalid', async () => {
    const client = makeClient();
    const event = { type: 'issues.opened', labels: ['type:feature'], issueNumber: 12, ref: 'main' };

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
      triggerEvent: 'issues.opened',
      status: 'awaiting-approval',
      currentStepIndex: 1,
      steps: [
        { name: 'triage', status: 'completed', startedAt: '2026-05-04T10:00:00Z', completedAt: '2026-05-04T10:01:00Z', outcome: 'dispatched' },
        { name: 'ba', status: 'pending', startedAt: null, completedAt: null, outcome: null },
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
      'o', 'r', 'copilot-agent-ba.yml', 'main', expect.any(Object)
    );
  });
});
