import { describe, it, expect, vi } from 'vitest';
import {
  STATE_TAG,
  upsertLiveStatus,
  findLiveStatus,
  findDedupKeyHit,
  getRunStartedAt,
} from '../orchestrator/state-manager.js';

function client(comments) {
  return {
    listComments: vi.fn().mockResolvedValue(comments),
    createComment: vi.fn().mockResolvedValue({ id: 1001 }),
    updateComment: vi.fn().mockResolvedValue({ id: 999 }),
  };
}

describe('state-manager.findDedupKeyHit', () => {
  it('returns true when an audit comment carries the matching dedup_key', async () => {
    const state = { runId: 'r', dedup_key: 'issues:10:labeled:t1' };
    const c = client([
      { body: `${STATE_TAG}${JSON.stringify(state)} -->`, created_at: '2026-05-08T10:00:00Z' },
    ]);
    expect(await findDedupKeyHit(c, 'o', 'r', 10, 'issues:10:labeled:t1')).toBe(true);
  });

  it('returns false when no audit comment carries the key', async () => {
    const c = client([{ body: `${STATE_TAG}${JSON.stringify({ runId: 'r', dedup_key: 'other' })} -->`, created_at: '2026-05-08T10:00:00Z' }]);
    expect(await findDedupKeyHit(c, 'o', 'r', 10, 'issues:10:labeled:t1')).toBe(false);
  });

  it('returns false on empty / null key (defensive)', async () => {
    const c = client([]);
    expect(await findDedupKeyHit(c, 'o', 'r', 10, '')).toBe(false);
    expect(await findDedupKeyHit(c, 'o', 'r', 10, null)).toBe(false);
  });

  it('honours the lookback bound (older keys outside window not seen)', async () => {
    const oldHit = { runId: 'r', dedup_key: 'old' };
    const fresh = { runId: 'r', dedup_key: 'new' };
    const comments = [
      { body: `${STATE_TAG}${JSON.stringify(oldHit)} -->`, created_at: '2020-01-01T00:00:00Z' },
      { body: `${STATE_TAG}${JSON.stringify(fresh)} -->`, created_at: '2026-05-08T10:00:00Z' },
    ];
    expect(await findDedupKeyHit(client(comments), 'o', 'r', 10, 'old', 1)).toBe(false);
  });
});

describe('state-manager.getRunStartedAt', () => {
  it('returns the OLDEST audit comment timestamp', async () => {
    const c = client([
      { body: `${STATE_TAG}{"runId":"r"} -->`, created_at: '2026-05-08T10:05:00Z' },
      { body: `${STATE_TAG}{"runId":"r"} -->`, created_at: '2026-05-08T10:00:00Z' },
    ]);
    expect(await getRunStartedAt(c, 'o', 'r', 10)).toBe('2026-05-08T10:00:00Z');
  });

  it('returns null when no audit comments exist', async () => {
    expect(await getRunStartedAt(client([]), 'o', 'r', 10)).toBeNull();
  });
});

describe('state-manager.upsertLiveStatus', () => {
  it('CREATES the live-status comment when none exists', async () => {
    const c = client([]);
    const r = await upsertLiveStatus(c, 'o', 'r', 10, 'run-xyz', '## Status\nDoing things');
    expect(r.action).toBe('created');
    expect(c.createComment).toHaveBeenCalledOnce();
    const body = c.createComment.mock.calls[0][3];
    expect(body).toContain('apm-pipeline-status');
    expect(body).toContain('"runId":"run-xyz"');
    expect(body).toContain('Live view — authoritative state is the audit comments below');
    expect(c.updateComment).not.toHaveBeenCalled();
  });

  it('PATCHES the existing live-status comment when one is found', async () => {
    const existing = {
      id: 555,
      body: `Old body\n\n<!-- apm-pipeline-status: {"runId":"run-xyz"} -->`,
      created_at: '2026-05-08T10:00:00Z',
    };
    const c = client([existing]);
    const r = await upsertLiveStatus(c, 'o', 'r', 10, 'run-xyz', '## Status\nUpdated');
    expect(r.action).toBe('updated');
    expect(r.commentId).toBe(555);
    expect(c.updateComment).toHaveBeenCalledWith('o', 'r', 555, expect.stringContaining('Updated'));
  });

  it('KEEPS THE OLDEST when multiple matches exist (ADR-004 locator)', async () => {
    const oldest = { id: 100, body: '<!-- apm-pipeline-status: {"runId":"r"} -->', created_at: '2026-05-08T10:00:00Z' };
    const newer  = { id: 101, body: '<!-- apm-pipeline-status: {"runId":"r"} -->', created_at: '2026-05-08T10:01:00Z' };
    const c = client([newer, oldest]);
    const r = await upsertLiveStatus(c, 'o', 'r', 10, 'r', 'body');
    expect(r.commentId).toBe(100);
  });

  it('does NOT confuse runs with different runIds', async () => {
    const other = { id: 1, body: '<!-- apm-pipeline-status: {"runId":"other"} -->', created_at: '2026-05-08T10:00:00Z' };
    const c = client([other]);
    const r = await upsertLiveStatus(c, 'o', 'r', 10, 'mine', 'body');
    expect(r.action).toBe('created');
  });
});

describe('state-manager.findLiveStatus', () => {
  it('returns null when no matching comment', async () => {
    expect(await findLiveStatus(client([]), 'o', 'r', 10, 'r1')).toBeNull();
  });
});
