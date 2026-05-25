/**
 * engine/tests/index-pipeline.test.js
 * Vitest tests for FR-023: Orchestrator accepts optional pipeline_id and
 * worktree_path context fields and passes them through to invokeAgent.
 *
 * Issue #175 — Comprehensive Agent Consistency
 */

import { describe, it, expect, vi } from 'vitest';
import { runOrchestrator } from '../orchestrator/index.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────

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

// ─── FR-023: pipeline_id and worktree_path pass-through ───────────────────

describe('FR-023: pipeline_id and worktree_path context fields', () => {
  it('passes pipeline_id to triggerWorkflow inputs when present in the event', async () => {
    const client = makeClient();
    const event = {
      type: 'issues.labeled',
      labels: ['triaged', 'type:feature'],
      issueNumber: 42,
      ref: 'main',
      pipeline_id: '042',
    };

    await runOrchestrator({
      client, event,
      pipelines: [featurePipeline],
      owner: 'o', repo: 'r', aiTool: 'copilot',
    });

    // triggerWorkflow should have been called once for 'ba' agent
    expect(client.triggerWorkflow).toHaveBeenCalledOnce();

    const [, , , , inputs] = client.triggerWorkflow.mock.calls[0];
    expect(inputs).toMatchObject({ pipeline_id: '042' });
  });

  it('passes worktree_path to triggerWorkflow inputs when present in the event', async () => {
    const client = makeClient();
    const event = {
      type: 'issues.labeled',
      labels: ['triaged', 'type:feature'],
      issueNumber: 42,
      ref: 'main',
      worktree_path: '/workspace/pipelines/042-user-auth',
    };

    await runOrchestrator({
      client, event,
      pipelines: [featurePipeline],
      owner: 'o', repo: 'r', aiTool: 'copilot',
    });

    expect(client.triggerWorkflow).toHaveBeenCalledOnce();
    const [, , , , inputs] = client.triggerWorkflow.mock.calls[0];
    expect(inputs).toMatchObject({ worktree_path: '/workspace/pipelines/042-user-auth' });
  });

  it('passes both pipeline_id and worktree_path when both are present', async () => {
    const client = makeClient();
    const event = {
      type: 'issues.labeled',
      labels: ['triaged', 'type:feature'],
      issueNumber: 42,
      ref: 'main',
      pipeline_id: '042',
      worktree_path: '/workspace/pipelines/042-user-auth',
    };

    await runOrchestrator({
      client, event,
      pipelines: [featurePipeline],
      owner: 'o', repo: 'r', aiTool: 'copilot',
    });

    expect(client.triggerWorkflow).toHaveBeenCalledOnce();
    const [, , , , inputs] = client.triggerWorkflow.mock.calls[0];
    expect(inputs).toMatchObject({
      pipeline_id: '042',
      worktree_path: '/workspace/pipelines/042-user-auth',
    });
  });

  it('omits pipeline_id and worktree_path from inputs when not in event (backward-compatible)', async () => {
    const client = makeClient();
    const event = {
      type: 'issues.labeled',
      labels: ['triaged', 'type:feature'],
      issueNumber: 42,
      ref: 'main',
      // No pipeline_id or worktree_path
    };

    await runOrchestrator({
      client, event,
      pipelines: [featurePipeline],
      owner: 'o', repo: 'r', aiTool: 'copilot',
    });

    expect(client.triggerWorkflow).toHaveBeenCalledOnce();
    const [, , , , inputs] = client.triggerWorkflow.mock.calls[0];
    // Should still have issue_number (existing field) but NOT pipeline_id/worktree_path
    expect(inputs).toMatchObject({ issue_number: '42' });
    expect(inputs.pipeline_id).toBeUndefined();
    expect(inputs.worktree_path).toBeUndefined();
  });

  it('includes pipeline_id when orchestrator resumes after workflow_run.completed', async () => {
    const state = {
      runId: 'run-xyz',
      pipelineName: 'feature-pipeline',
      triggerEvent: 'issues.labeled',
      status: 'awaiting-agent',
      currentStepIndex: 0,
      steps: [
        { name: 'ba', status: 'awaiting-agent', startedAt: '2026-05-25T10:00:00Z', completedAt: null, outcome: null },
        { name: 'dev', status: 'pending', startedAt: null, completedAt: null, outcome: null },
      ],
      approvalGate: { requestedAt: null, timeoutAt: null, approvedBy: null },
      updatedAt: '2026-05-25T10:00:00Z',
    };
    const stateBody = `<!-- apm-pipeline-state: ${JSON.stringify(state)} -->`;

    const client = {
      listComments: vi.fn().mockResolvedValue([
        { body: stateBody, created_at: '2026-05-25T10:00:00Z' },
      ]),
      createComment: vi.fn().mockResolvedValue({ id: 2 }),
      triggerWorkflow: vi.fn().mockResolvedValue(undefined),
      getCollaboratorPermission: vi.fn().mockResolvedValue('write'),
    };

    const event = {
      type: 'workflow_run.completed',
      issueNumber: 42,
      ref: 'main',
      workflowName: 'copilot-agent-ba.yml',
      workflowConclusion: 'success',
      pipeline_id: '042',
      worktree_path: '/workspace/pipelines/042-user-auth',
    };

    await runOrchestrator({
      client, event,
      pipelines: [featurePipeline],
      owner: 'o', repo: 'r', aiTool: 'copilot',
    });

    // Should advance to 'dev' step and trigger it with pipeline_id
    expect(client.triggerWorkflow).toHaveBeenCalledOnce();
    const [, , , , inputs] = client.triggerWorkflow.mock.calls[0];
    expect(inputs).toMatchObject({ pipeline_id: '042' });
  });
});
