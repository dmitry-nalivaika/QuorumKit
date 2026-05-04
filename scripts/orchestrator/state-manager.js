/**
 * state-manager.js
 * Reads and writes Orchestrator pipeline run state as tagged HTML comments
 * in GitHub Issue / PR comment threads (FR-002, FR-002a, ADR-002).
 *
 * State format:
 *   <!-- apm-pipeline-state: {...JSON...} -->
 *
 * On each transition a NEW comment is posted (immutable audit history).
 * The most recently CREATED matching comment is authoritative (FR-002).
 */

export const STATE_TAG = '<!-- apm-pipeline-state: ';
const STATE_CLOSE = ' -->';

/**
 * Load the authoritative pipeline run state from GitHub comments.
 * Paginates through all comments (via client.listComments).
 *
 * @param {object} client - GitHub client (createGitHubClient result)
 * @param {string} owner
 * @param {string} repo
 * @param {number} issueNumber
 * @returns {PipelineRunState | null}
 */
export async function loadState(client, owner, repo, issueNumber) {
  const comments = await client.listComments(owner, repo, issueNumber);

  // Filter to state comments, sort by created_at descending, pick the newest
  const stateComments = comments
    .filter(c => c.body && c.body.includes(STATE_TAG))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (stateComments.length === 0) return null;

  const body = stateComments[0].body;
  const start = body.indexOf(STATE_TAG) + STATE_TAG.length;
  const end = body.indexOf(STATE_CLOSE, start);
  if (start < STATE_TAG.length || end === -1) return null;

  try {
    return JSON.parse(body.slice(start, end));
  } catch {
    return null;
  }
}

/**
 * Persist updated pipeline run state by posting a new tagged comment.
 *
 * @param {object} client
 * @param {string} owner
 * @param {string} repo
 * @param {number} issueNumber
 * @param {PipelineRunState} state
 */
export async function saveState(client, owner, repo, issueNumber, state) {
  const body = `${STATE_TAG}${JSON.stringify(state)}${STATE_CLOSE}`;
  return client.createComment(owner, repo, issueNumber, body);
}

/**
 * Post a human-readable audit entry (no state tag — visible in rendered GitHub UI).
 *
 * @param {object} client
 * @param {string} owner
 * @param {string} repo
 * @param {number} issueNumber
 * @param {string} message
 */
export async function postAuditEntry(client, owner, repo, issueNumber, message) {
  const now = new Date().toISOString();
  const body = `**[APM Orchestrator]** ${message}\n\n_${now}_`;
  return client.createComment(owner, repo, issueNumber, body);
}
