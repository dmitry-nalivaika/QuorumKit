import { describe, it, expect } from 'vitest';
import { computeDedupKey } from '../../scripts/orchestrator/dedup-key.js';

describe('dedup-key.computeDedupKey', () => {
  it('issues: combines number, action, updated_at', () => {
    expect(computeDedupKey('issues', {
      action: 'labeled',
      issue: { number: 10, updated_at: '2026-05-08T10:00:00Z' },
    })).toBe('issues:10:labeled:2026-05-08T10:00:00Z');
  });

  it('issue_comment: combines parent issue number and comment id (immutable)', () => {
    expect(computeDedupKey('issue_comment', {
      action: 'created',
      issue: { number: 10 },
      comment: { id: 9999 },
    })).toBe('issue_comment:10:9999');
  });

  it('issue_comment with id=0 is still valid (not null)', () => {
    expect(computeDedupKey('issue_comment', {
      issue: { number: 10 },
      comment: { id: 0 },
    })).toBe('issue_comment:10:0');
  });

  it('pull_request: combines number, action, updated_at', () => {
    expect(computeDedupKey('pull_request', {
      action: 'synchronize',
      pull_request: { number: 7, updated_at: '2026-05-08T11:00:00Z' },
    })).toBe('pr:7:synchronize:2026-05-08T11:00:00Z');
  });

  it('pull_request_review_comment: combines pr number and comment id', () => {
    expect(computeDedupKey('pull_request_review_comment', {
      action: 'created',
      pull_request: { number: 7 },
      comment: { id: 1234 },
    })).toBe('pr_review_comment:7:1234');
  });

  it('workflow_run: combines run id and conclusion', () => {
    expect(computeDedupKey('workflow_run', {
      action: 'completed',
      workflow_run: { id: 42, conclusion: 'success' },
    })).toBe('workflow_run:42:success');
  });

  it('workflow_run: unknown conclusion is recorded as "unknown"', () => {
    expect(computeDedupKey('workflow_run', {
      workflow_run: { id: 99 },
    })).toBe('workflow_run:99:unknown');
  });

  it('repository_dispatch: uses dedup_id when present', () => {
    expect(computeDedupKey('repository_dispatch', {
      action: 'alert',
      client_payload: { dedup_id: 'alert-001', title: 'foo' },
    })).toBe('repo_dispatch:alert:alert-001');
  });

  it('repository_dispatch: hashes payload when dedup_id absent', () => {
    const k1 = computeDedupKey('repository_dispatch', {
      action: 'alert', client_payload: { title: 'foo' },
    });
    const k2 = computeDedupKey('repository_dispatch', {
      action: 'alert', client_payload: { title: 'foo' },
    });
    expect(k1).toBe(k2);
    expect(k1).toMatch(/^repo_dispatch:alert:[0-9a-f]{16}$/);

    const k3 = computeDedupKey('repository_dispatch', {
      action: 'alert', client_payload: { title: 'bar' },
    });
    expect(k3).not.toBe(k1);
  });

  it('workflow_dispatch is exempt (returns null)', () => {
    expect(computeDedupKey('workflow_dispatch', { inputs: { foo: 'bar' } })).toBeNull();
  });

  it('returns null for unknown event names', () => {
    expect(computeDedupKey('schedule', {})).toBeNull();
  });

  it('returns null for missing required fields', () => {
    expect(computeDedupKey('issues', {})).toBeNull();
    expect(computeDedupKey('issue_comment', { issue: { number: 1 } })).toBeNull();
    expect(computeDedupKey('workflow_run', {})).toBeNull();
  });

  it('handles falsy / non-object payloads defensively', () => {
    expect(computeDedupKey('issues', null)).toBeNull();
    expect(computeDedupKey('', {})).toBeNull();
  });
});
