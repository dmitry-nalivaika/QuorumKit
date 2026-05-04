import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadState, saveState, postAuditEntry, STATE_TAG } from '../../scripts/orchestrator/state-manager.js';

const mockState = {
  runId: 'run-001',
  pipelineName: 'feature-pipeline',
  triggerEvent: 'issues.opened',
  status: 'running',
  currentStepIndex: 1,
  steps: [
    { name: 'triage', status: 'completed', startedAt: '2026-05-04T10:00:00Z', completedAt: '2026-05-04T10:01:00Z', outcome: 'done' },
  ],
  approvalGate: { requestedAt: null, timeoutAt: null, approvedBy: null },
  updatedAt: '2026-05-04T10:01:00Z',
};

function makeClient(comments = []) {
  return {
    listComments: vi.fn().mockResolvedValue(comments),
    createComment: vi.fn().mockResolvedValue({ id: 999 }),
  };
}

describe('state-manager.loadState', () => {
  it('returns null when no state comment exists', async () => {
    const client = makeClient([{ body: 'just a regular comment', created_at: '2026-05-04T09:00:00Z' }]);
    const result = await loadState(client, 'owner', 'repo', 42);
    expect(result).toBeNull();
  });

  it('parses and returns state from a tagged comment', async () => {
    const body = `${STATE_TAG}${JSON.stringify(mockState)} -->`;
    const client = makeClient([{ body, created_at: '2026-05-04T10:01:00Z' }]);
    const result = await loadState(client, 'owner', 'repo', 42);
    expect(result).toMatchObject({ runId: 'run-001', status: 'running' });
  });

  it('selects the most recently created state comment when multiple exist', async () => {
    const old = `${STATE_TAG}${JSON.stringify({ ...mockState, status: 'pending' })} -->`;
    const recent = `${STATE_TAG}${JSON.stringify({ ...mockState, status: 'running' })} -->`;
    const client = makeClient([
      { body: old, created_at: '2026-05-04T09:00:00Z' },
      { body: recent, created_at: '2026-05-04T10:01:00Z' },
    ]);
    const result = await loadState(client, 'owner', 'repo', 42);
    expect(result.status).toBe('running');
  });
});

describe('state-manager.saveState', () => {
  it('posts a new comment containing the serialised state', async () => {
    const client = makeClient();
    await saveState(client, 'owner', 'repo', 42, mockState);
    expect(client.createComment).toHaveBeenCalledOnce();
    const body = client.createComment.mock.calls[0][3];
    expect(body).toContain(STATE_TAG);
    expect(body).toContain('"runId":"run-001"');
  });
});

describe('state-manager.postAuditEntry', () => {
  it('posts a human-readable comment (no state tag)', async () => {
    const client = makeClient();
    await postAuditEntry(client, 'owner', 'repo', 42, '✅ Step triage completed');
    expect(client.createComment).toHaveBeenCalledOnce();
    const body = client.createComment.mock.calls[0][3];
    expect(body).not.toContain(STATE_TAG);
    expect(body).toContain('Step triage completed');
  });
});
