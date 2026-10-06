/**
 * github-client.js
 * Thin GitHub REST wrapper with exponential back-off retry (FR-005).
 * All methods accept { owner, repo, token } — no global state.
 */

import { Octokit } from '@octokit/rest';

const ALLOWED_PERMISSIONS = new Set(['write', 'admin', 'maintain']);

/**
 * Create a GitHub client instance.
 * @param {string} token - GitHub token (GITHUB_TOKEN or PAT with required scopes)
 * @returns {object} client interface
 */
export function createGitHubClient(token) {
  const octokit = new Octokit({ auth: token });

  /**
   * Retry a GitHub API call up to maxAttempts with exponential back-off.
   * Respects Retry-After header on 429 / 403 responses.
   */
  async function withRetry(fn, maxAttempts = 3) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        const isRetryable =
          err.status === 500 ||
          err.status === 502 ||
          err.status === 503 ||
          err.status === 504 ||
          err.status === 429;
        if (!isRetryable || attempt === maxAttempts) break;

        const retryAfterHeader = err.response?.headers?.['retry-after'];
        const delayMs = retryAfterHeader
          ? parseInt(retryAfterHeader, 10) * 1000
          : Math.pow(2, attempt) * 1000;
        await sleep(delayMs);
      }
    }
    throw lastError;
  }

  /**
   * List all comments on an issue/PR, paginating through every page.
   * @returns {Array<{id, body, created_at, user}>}
   */
  async function listComments(owner, repo, issueNumber) {
    const comments = [];
    let page = 1;
    while (true) {
      const { data } = await withRetry(() =>
        octokit.rest.issues.listComments({
          owner, repo, issue_number: issueNumber, per_page: 100, page,
        })
      );
      comments.push(...data);
      if (data.length < 100) break;
      page++;
    }
    return comments;
  }

  /**
   * Create a comment on an issue/PR.
   */
  async function createComment(owner, repo, issueNumber, body) {
    const { data } = await withRetry(() =>
      octokit.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body })
    );
    return data;
  }

  /**
   * Update (PATCH) an existing comment by ID. Used by the v2 live-status
   * channel to edit the single mutable status comment in place (ADR-004).
   */
  async function updateComment(owner, repo, commentId, body) {
    const { data } = await withRetry(() =>
      octokit.rest.issues.updateComment({ owner, repo, comment_id: commentId, body })
    );
    return data;
  }

  /**
   * Add labels to an issue/PR (used by FR-005 to apply `status:needs-human`
   * on loop-budget exhaustion).
   */
  async function addLabels(owner, repo, issueNumber, labels) {
    if (!labels || labels.length === 0) return;
    await withRetry(() =>
      octokit.rest.issues.addLabels({ owner, repo, issue_number: issueNumber, labels })
    );
  }

  /**
   * Remove one label from an issue/PR. A label that is not on the issue (404) is
   * not an error: callers use this to converge on "label absent".
   */
  async function removeLabel(owner, repo, issueNumber, name) {
    try {
      await withRetry(() =>
        octokit.rest.issues.removeLabel({ owner, repo, issue_number: issueNumber, name })
      );
    } catch (err) {
      if (err.status !== 404) throw err;
    }
  }

  /**
   * List open issues and PRs carrying a label (used by the scheduled reconciler to
   * find runs that are awaiting an agent). Paginates through every page.
   * @returns {Array<{number: number, labels: Array}>}
   */
  async function listIssuesByLabel(owner, repo, label) {
    const issues = [];
    let page = 1;
    while (true) {
      const { data } = await withRetry(() =>
        octokit.rest.issues.listForRepo({
          owner, repo, labels: label, state: 'open', per_page: 100, page,
        })
      );
      issues.push(...data);
      if (data.length < 100) break;
      page++;
    }
    return issues;
  }

  /**
   * List runs of one workflow file, newest first. `created` is a GitHub search
   * qualifier such as `>=2026-10-06T07:49:50Z`.
   * @returns {Array<{id, status, conclusion, display_title, created_at, html_url}>}
   */
  async function listWorkflowRuns(owner, repo, workflow, { created, event } = {}) {
    const { data } = await withRetry(() =>
      octokit.rest.actions.listWorkflowRuns({
        owner, repo, workflow_id: workflow, per_page: 100,
        ...(created ? { created } : {}),
        ...(event ? { event } : {}),
      })
    );
    return data.workflow_runs ?? [];
  }

  /**
   * Fetch a single issue (used to recover labels for workflow_dispatch events,
   * which carry no issue payload).
   * @returns {{number: number, labels: Array<string|{name: string}>, pull_request?: object}}
   */
  async function getIssue(owner, repo, issueNumber) {
    const { data } = await withRetry(() =>
      octokit.rest.issues.get({ owner, repo, issue_number: issueNumber })
    );
    return data;
  }

  /**
   * Trigger a repository workflow_dispatch event.
   */
  async function triggerWorkflow(owner, repo, workflow, ref, inputs = {}) {
    await withRetry(() =>
      octokit.rest.actions.createWorkflowDispatch({ owner, repo, workflow_id: workflow, ref, inputs })
    );
  }

  /**
   * Get a collaborator's permission level for the repo.
   * @returns {string} permission level: 'read'|'write'|'admin'|'maintain'|'triage'
   */
  async function getCollaboratorPermission(owner, repo, username) {
    const { data } = await withRetry(() =>
      octokit.rest.repos.getCollaboratorPermissionLevel({ owner, repo, username })
    );
    return data.permission;
  }

  return {
    listComments, createComment, updateComment, addLabels, removeLabel,
    listIssuesByLabel, listWorkflowRuns, getIssue, triggerWorkflow, getCollaboratorPermission,
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
