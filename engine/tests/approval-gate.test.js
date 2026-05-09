import { describe, it, expect, vi } from 'vitest';
import {
  isApproveCommand,
  checkApprovalTimeout,
  verifyApproverPermission,
} from '../orchestrator/approval-gate.js';

describe('approval-gate.isApproveCommand', () => {
  it('returns true for a comment body containing /approve', () => {
    expect(isApproveCommand('/approve')).toBe(true);
  });

  it('returns true when /approve is surrounded by whitespace', () => {
    expect(isApproveCommand('  /approve  ')).toBe(true);
  });

  it('returns false for unrelated comments', () => {
    expect(isApproveCommand('LGTM!')).toBe(false);
    expect(isApproveCommand('/reject')).toBe(false);
    expect(isApproveCommand('')).toBe(false);
  });
});

describe('approval-gate.checkApprovalTimeout', () => {
  it('returns false when timeoutAt is in the future', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(checkApprovalTimeout({ requestedAt: new Date().toISOString(), timeoutAt: future, approvedBy: null })).toBe(false);
  });

  it('returns true when timeoutAt is in the past', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(checkApprovalTimeout({ requestedAt: new Date().toISOString(), timeoutAt: past, approvedBy: null })).toBe(true);
  });

  it('returns false when approvalGate is null', () => {
    expect(checkApprovalTimeout(null)).toBe(false);
  });
});

describe('approval-gate.verifyApproverPermission', () => {
  it('returns true when user has write permission', async () => {
    const client = { getCollaboratorPermission: vi.fn().mockResolvedValue('write') };
    expect(await verifyApproverPermission(client, 'owner', 'repo', 'alice')).toBe(true);
  });

  it('returns true when user has admin permission', async () => {
    const client = { getCollaboratorPermission: vi.fn().mockResolvedValue('admin') };
    expect(await verifyApproverPermission(client, 'owner', 'repo', 'alice')).toBe(true);
  });

  it('returns true when user has maintain permission', async () => {
    const client = { getCollaboratorPermission: vi.fn().mockResolvedValue('maintain') };
    expect(await verifyApproverPermission(client, 'owner', 'repo', 'alice')).toBe(true);
  });

  it('returns false when user has read-only permission', async () => {
    const client = { getCollaboratorPermission: vi.fn().mockResolvedValue('read') };
    expect(await verifyApproverPermission(client, 'owner', 'repo', 'bob')).toBe(false);
  });

  it('returns false when API call throws', async () => {
    const client = { getCollaboratorPermission: vi.fn().mockRejectedValue(new Error('API error')) };
    expect(await verifyApproverPermission(client, 'owner', 'repo', 'bob')).toBe(false);
  });
});
