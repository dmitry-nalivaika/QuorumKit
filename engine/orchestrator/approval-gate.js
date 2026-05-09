/**
 * approval-gate.js
 * Human-in-the-loop approval gate logic (FR-008, FR-009, FR-010).
 */

const ALLOWED_PERMISSIONS = new Set(['write', 'admin', 'maintain']);
const APPROVE_PATTERN = /^\s*\/approve\s*$/;

/**
 * Returns true if a comment body contains the /approve command.
 * @param {string} body
 * @returns {boolean}
 */
export function isApproveCommand(body) {
  if (!body) return false;
  return APPROVE_PATTERN.test(body);
}

/**
 * Returns true if the approval gate has timed out.
 * @param {{ requestedAt: string|null, timeoutAt: string|null, approvedBy: string|null } | null} approvalGate
 * @returns {boolean}
 */
export function checkApprovalTimeout(approvalGate) {
  if (!approvalGate || !approvalGate.timeoutAt) return false;
  return new Date(approvalGate.timeoutAt) <= new Date();
}

/**
 * Verifies that a GitHub user has at least write permission on the repository.
 * Returns false (not throws) on API failure, so the gate remains open (FR-010).
 *
 * @param {object} client - GitHub client with getCollaboratorPermission method
 * @param {string} owner
 * @param {string} repo
 * @param {string} username
 * @returns {Promise<boolean>}
 */
export async function verifyApproverPermission(client, owner, repo, username) {
  try {
    const permission = await client.getCollaboratorPermission(owner, repo, username);
    return ALLOWED_PERMISSIONS.has(permission);
  } catch {
    return false;
  }
}
