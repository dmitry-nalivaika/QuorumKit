/**
 * dedup-key.js
 * Deterministic per-trigger event-deduplication keys (FR-026, ADR-007 §1).
 *
 * Manual `workflow_dispatch` is exempt (operator intent) and returns null.
 *
 * Key formulas (frozen by ADR-007):
 *   issues.{opened,labeled,...}                  → issues:<n>:<action>:<updated_at>
 *   issue_comment.created                        → issue_comment:<n>:<comment.id>
 *   pull_request.{opened,labeled,synchronize}    → pr:<n>:<action>:<updated_at>
 *   pull_request_review_comment.created          → pr_review_comment:<n>:<comment.id>
 *   workflow_run.completed                       → workflow_run:<id>:<conclusion>
 *   repository_dispatch                          → repo_dispatch:<event_type>:<dedup_id|hash>
 *   workflow_dispatch                            → null (never deduplicated)
 */

import { createHash } from 'crypto';

/**
 * Compute the dedup key for a normalised GitHub event payload.
 *
 * @param {string} eventName - e.g. 'issues', 'issue_comment', 'workflow_run'
 * @param {object} payload   - the raw GitHub Actions event payload (github.event)
 * @returns {string | null}  - dedup key, or null if not deduplicable
 */
export function computeDedupKey(eventName, payload) {
  if (!eventName || typeof payload !== 'object' || payload === null) return null;

  switch (eventName) {
    case 'issues': {
      const n = payload.issue?.number;
      const action = payload.action;
      const updated = payload.issue?.updated_at;
      if (!n || !action || !updated) return null;
      return `issues:${n}:${action}:${updated}`;
    }

    case 'issue_comment': {
      const n = payload.issue?.number;
      const id = payload.comment?.id;
      if (!n || id === undefined || id === null) return null;
      return `issue_comment:${n}:${id}`;
    }

    case 'pull_request': {
      const n = payload.pull_request?.number;
      const action = payload.action;
      const updated = payload.pull_request?.updated_at;
      if (!n || !action || !updated) return null;
      return `pr:${n}:${action}:${updated}`;
    }

    case 'pull_request_review_comment': {
      const n = payload.pull_request?.number;
      const id = payload.comment?.id;
      if (!n || id === undefined || id === null) return null;
      return `pr_review_comment:${n}:${id}`;
    }

    case 'workflow_run': {
      const id = payload.workflow_run?.id;
      const conclusion = payload.workflow_run?.conclusion ?? 'unknown';
      if (!id) return null;
      return `workflow_run:${id}:${conclusion}`;
    }

    case 'repository_dispatch': {
      const evType = payload.action ?? payload.event_type ?? 'unknown';
      const dedupId = payload.client_payload?.dedup_id;
      if (dedupId) return `repo_dispatch:${evType}:${dedupId}`;
      const hash = createHash('sha256')
        .update(JSON.stringify(payload.client_payload ?? {}))
        .digest('hex')
        .slice(0, 16);
      return `repo_dispatch:${evType}:${hash}`;
    }

    case 'workflow_dispatch':
      return null;

    default:
      return null;
  }
}
