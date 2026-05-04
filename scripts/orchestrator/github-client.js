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

  return { listComments, createComment, triggerWorkflow, getCollaboratorPermission };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
