/**
 * state-manager.js
 * Two-channel comment state model (ADR-004, FR-015, FR-017).
 *
 *   AUDIT CHANNEL — append-only, authoritative.
 *     Tag: `<!-- apm-pipeline-state: { …JSON… } -->`
 *     One new comment per state transition. NEVER edited, NEVER deleted.
 *     The most recently CREATED matching comment is the run's current state.
 *     v1 + v2 both use this channel. v1 uses ONLY this channel.
 *
 *   LIVE-STATUS CHANNEL — single mutable view, derived. (v2 only)
 *     Tag: `<!-- apm-pipeline-status: {"runId":"<uuid>"} -->`
 *     Edited in place on every transition. Recreated from audit on
 *     corruption (the audit channel always wins).
 *
 * Public surface (back-compat with v1 callers preserved):
 *   loadState(client, owner, repo, issueNumber)            → state | null
 *   saveState(client, owner, repo, issueNumber, state, msg)→ created comment
 *   postAuditEntry(client, owner, repo, issueNumber, msg)  → created comment
 *   getRunStartedAt(client, owner, repo, issueNumber)      → ISO | null
 *   findDedupKeyHit(client, owner, repo, issueNumber, key) → boolean
 *   upsertLiveStatus(client, owner, repo, issueNumber, runId, body) → comment
 *
 * The audit channel state JSON in v2 may carry these extra fields:
 *   dedup_key       — FR-016 / FR-026
 *   iterations      — { "<from>-><to>": <count> }
 *   runtime_used    — name of resolved runtime
 *   outcome         — last apm-msg outcome
 *   runtime_retries — count from the last invocation (advisory)
 */

export const STATE_TAG = '<!-- apm-pipeline-state: ';
const STATE_CLOSE = ' -->';
const STATUS_TAG_PREFIX = '<!-- apm-pipeline-status: ';
const STATUS_CLOSE = ' -->';
const DEFAULT_DEDUP_LOOKBACK = 200;

const LIVE_STATUS_DISCLAIMER =
  '_Live view — authoritative state is the audit comments below._';

// ─── Audit channel ────────────────────────────────────────────────────────

/**
 * Load the authoritative pipeline run state from the audit channel.
 * Selects the most recently created `apm-pipeline-state` comment.
 */
export async function loadState(client, owner, repo, issueNumber) {
  const comments = await client.listComments(owner, repo, issueNumber);

  const stateComments = comments
    .filter(c => c.body && c.body.includes(STATE_TAG))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (stateComments.length === 0) return null;

  return parseStateBody(stateComments[0].body);
}

/**
 * Append a new audit-channel comment containing the JSON payload + a
 * human-readable preamble.
 */
export async function saveState(client, owner, repo, issueNumber, state, auditMessage) {
  const stateTag = `${STATE_TAG}${JSON.stringify(state)}${STATE_CLOSE}`;
  const now = new Date().toISOString();
  const humanLine = auditMessage
    ? `**[QuorumKit Orchestrator]** ${auditMessage}\n\n_${now}_\n\n`
    : '';
  const body = `${humanLine}${stateTag}`;
  return client.createComment(owner, repo, issueNumber, body);
}

/**
 * Post a human-readable audit entry without a state update. Use only when
 * there is no state change to persist alongside the message.
 */
export async function postAuditEntry(client, owner, repo, issueNumber, message) {
  const now = new Date().toISOString();
  const body = `**[QuorumKit Orchestrator]** ${message}\n\n_${now}_`;
  return client.createComment(owner, repo, issueNumber, body);
}

/**
 * Return the ISO timestamp of the OLDEST audit-channel comment for the run,
 * which is the wall-clock baseline for FR-028 budget computations.
 */
export async function getRunStartedAt(client, owner, repo, issueNumber) {
  const comments = await client.listComments(owner, repo, issueNumber);
  const stateComments = comments
    .filter(c => c.body && c.body.includes(STATE_TAG))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  return stateComments[0]?.created_at ?? null;
}

/**
 * Scan the most recent N audit comments for a matching `dedup_key` field.
 * Returns true if the key was already processed (FR-016 / FR-026).
 *
 * @param {object} client
 * @param {string} owner
 * @param {string} repo
 * @param {number} issueNumber
 * @param {string} key
 * @param {number} [lookback=200]
 */
export async function findDedupKeyHit(client, owner, repo, issueNumber, key, lookback = DEFAULT_DEDUP_LOOKBACK) {
  if (!key) return false;
  const comments = await client.listComments(owner, repo, issueNumber);
  const stateComments = comments
    .filter(c => c.body && c.body.includes(STATE_TAG))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, lookback);
  for (const c of stateComments) {
    const s = parseStateBody(c.body);
    if (s && s.dedup_key === key) return true;
  }
  return false;
}

// ─── Live-status channel (v2 only) ────────────────────────────────────────

/**
 * Locate the existing live-status comment for `runId`, if any.
 * Returns the GitHub comment object or null.
 */
export async function findLiveStatus(client, owner, repo, issueNumber, runId) {
  const comments = await client.listComments(owner, repo, issueNumber);
  const matches = comments.filter(c => c.body && c.body.includes(`${STATUS_TAG_PREFIX}{"runId":"${runId}"}`));
  if (matches.length === 0) return null;
  // Per ADR-004: keep the OLDEST when multiple exist (warning logged elsewhere).
  matches.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  return matches[0];
}

/**
 * Upsert the single live-status comment for a v2 run.
 *
 *   - If exactly one matching comment exists → PATCH it via client.updateComment.
 *   - If none exist → POST a new comment.
 *   - If multiple exist → keep the oldest, leave duplicates alone (callers may log).
 *
 * The body is composed as:
 *   <human readable view>
 *   <disclaimer>
 *   <hidden marker tag>
 *
 * @param {object} client
 * @param {string} owner
 * @param {string} repo
 * @param {number} issueNumber
 * @param {string} runId
 * @param {string} humanBody
 * @returns {Promise<{commentId: number, action: 'created'|'updated'}>}
 */
export async function upsertLiveStatus(client, owner, repo, issueNumber, runId, humanBody) {
  const tag = `${STATUS_TAG_PREFIX}{"runId":"${runId}"}${STATUS_CLOSE}`;
  const body = `${humanBody}\n\n${LIVE_STATUS_DISCLAIMER}\n\n${tag}`;
  const existing = await findLiveStatus(client, owner, repo, issueNumber, runId);
  if (existing) {
    if (typeof client.updateComment !== 'function') {
      throw new Error('GitHub client does not implement updateComment(); v2 live-status requires PATCH support.');
    }
    await client.updateComment(owner, repo, existing.id, body);
    return { commentId: existing.id, action: 'updated' };
  }
  const created = await client.createComment(owner, repo, issueNumber, body);
  return { commentId: created.id, action: 'created' };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function parseStateBody(body) {
  const start = body.indexOf(STATE_TAG) + STATE_TAG.length;
  const end = body.indexOf(STATE_CLOSE, start);
  if (start < STATE_TAG.length || end === -1) return null;
  try {
    return JSON.parse(body.slice(start, end));
  } catch {
    return null;
  }
}
