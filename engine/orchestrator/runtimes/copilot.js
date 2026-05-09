/**
 * runtimes/copilot.js
 * Adapter for the Copilot (GitHub Models) runtime kind (ADR-005, ADR-003).
 *
 * Dispatches the agent's Copilot workflow file (`copilot-agent-<slug>.yml`)
 * via repository_dispatch / workflow_dispatch through the supplied client.
 * Wraps the call in the shared bounded-backoff retry helper (ADR-007 §8).
 *
 * The adapter is purely a dispatch layer — the LLM call itself happens
 * inside the dispatched GHA workflow, where the GITHUB_TOKEN is already
 * scoped via the workflow file. No secret value ever crosses this module.
 *
 * Exports:
 *   requiredPermissions      — GH Actions token scopes consumed by this kind
 *   invoke(context)          — dispatch entry point
 */

import { withRetry } from './_retry.js';

export const KIND = 'copilot';

/**
 * Permissions consumed by the dispatched copilot workflow. The orchestrator
 * unions these with the scopes of every other adapter actually used at run
 * time (ADR-007 §7) when composing dispatched workflow `permissions:` blocks.
 */
export const requiredPermissions = Object.freeze({
  contents: 'read',
  issues: 'write',
  'pull-requests': 'write',
  models: 'read', // GitHub Models inference
});

/**
 * Resolve the credential for a runtime entry. Returns the env var value or
 * throws { code: 'runtime-credential-missing', credential_ref } if absent.
 *
 * NEVER returns the value to a caller that logs/comments — only the dispatch
 * call uses it, and only the *name* (credential_ref) is recorded in audits.
 */
function resolveCredential(runtime, env = process.env) {
  const ref = runtime.credential_ref;
  if (!ref) {
    const e = new Error('runtime-credential-missing');
    e.code = 'runtime-credential-missing';
    e.credential_ref = '(none declared)';
    throw e;
  }
  const value = env[ref];
  if (!value) {
    const e = new Error('runtime-credential-missing');
    e.code = 'runtime-credential-missing';
    e.credential_ref = ref;
    throw e;
  }
  return value;
}

/**
 * Invoke the runtime for one step.
 *
 * @param {object} context
 * @param {object} context.client      - GitHub client with triggerWorkflow()
 * @param {string} context.owner
 * @param {string} context.repo
 * @param {string} context.agent       - agent slug (e.g. "qa-agent")
 * @param {string} context.ref         - git ref to dispatch on
 * @param {number} context.issueNumber
 * @param {string} context.runId
 * @param {string} context.step
 * @param {number} context.iteration
 * @param {object} context.runtime     - resolved runtime entry
 * @param {string} context.runtimeName
 * @param {object} [context.env]       - injectable env (for tests)
 * @returns {Promise<{ dispatched: true, retries: number, workflow: string }>}
 */
export async function invoke(context) {
  const env = context.env ?? process.env;
  // Trigger credential check (throws on absence) but never expose value:
  resolveCredential(context.runtime, env);

  // Workflow filename uses the bare agent slug (no `-agent` suffix):
  //   pipeline `agent: dev-agent` → `copilot-agent-dev.yml`
  const slug = context.agent.replace(/-agent$/, '');
  const workflow = `copilot-agent-${slug}.yml`;
  const dispatchRef = context.ref ?? 'main';
  // Note: agent workflows do not declare a `runtime` input; the runtime
  // *kind* is implied by which workflow is dispatched (copilot-agent-* vs
  // agent-*). Sending it would be rejected with `Unexpected inputs provided`.
  const inputs = {
    issue_number: String(context.issueNumber),
    run_id: context.runId ?? '',
    step: context.step ?? '',
    iteration: String(context.iteration ?? 1),
  };

  const { retries } = await withRetry(
    () => context.client.triggerWorkflow(context.owner, context.repo, workflow, dispatchRef, inputs),
    { clock: context.clock }
  );
  return { dispatched: true, retries, workflow };
}
