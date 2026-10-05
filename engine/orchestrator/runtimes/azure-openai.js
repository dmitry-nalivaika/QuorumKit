/**
 * runtimes/azure-openai.js
 * Adapter for the Azure AI Foundry / Azure OpenAI runtime kind
 * (ADR-005 kind allowlist, ADR-332 enablement decision).
 *
 * Per ADR-332 §1, this kind does NOT ship as a fourth parallel workflow
 * fleet. It dispatches the same `copilot-agent-<slug>.yml` workflow family
 * used by the `copilot` kind (which already performs a generic
 * OpenAI-compatible `chat/completions` call), but additionally passes the
 * runtime's `endpoint`, `model`, and `credential_ref`, plus an optional
 * `api_version` (from `runtime.parameters.api_version`), as workflow inputs.
 * The dispatched workflow's HTTP step uses these to route the call to the
 * maintainer's own Azure OpenAI deployment instead of the GitHub Models
 * default, using the `api-key` auth header Azure OpenAI expects.
 *
 * The adapter is purely a dispatch layer — the LLM call itself happens
 * inside the dispatched GHA workflow. No secret value ever crosses this
 * module; only the *name* (credential_ref) is ever recorded in audits.
 *
 * Exports:
 *   requiredPermissions      — GH Actions token scopes consumed by this kind
 *   invoke(context)          — dispatch entry point
 */

import { withRetry } from './_retry.js';

export const KIND = 'azure-openai';

/**
 * Permissions consumed by the dispatched workflow. No `models:` scope is
 * requested — the call goes to the maintainer's own Azure endpoint, not
 * GitHub Models.
 */
export const requiredPermissions = Object.freeze({
  contents: 'read',
  issues: 'write',
  'pull-requests': 'write',
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
 * @param {object} context.runtime     - resolved runtime entry (kind: azure-openai)
 * @param {string} context.runtimeName
 * @param {object} [context.env]       - injectable env (for tests)
 * @returns {Promise<{ dispatched: true, retries: number, workflow: string }>}
 */
export async function invoke(context) {
  const env = context.env ?? process.env;
  // Trigger credential check (throws on absence) but never expose value:
  resolveCredential(context.runtime, env);

  // Dispatches the same Copilot workflow family (ADR-332 §1 — no new fleet).
  //   pipeline `agent: dev-agent` → `copilot-agent-dev.yml`
  const slug = context.agent.replace(/-agent$/, '');
  const workflow = `copilot-agent-${slug}.yml`;
  const dispatchRef = context.ref ?? 'main';

  const inputs = {
    issue_number: String(context.issueNumber),
    run_id: context.runId ?? '',
    step: context.step ?? '',
    iteration: String(context.iteration ?? 1),
    runtime_endpoint: context.runtime.endpoint ?? '',
    runtime_model: context.runtime.model ?? '',
    runtime_credential_ref: context.runtime.credential_ref ?? '',
    runtime_api_version: context.runtime.parameters?.api_version ?? '',
  };

  const { retries } = await withRetry(
    () => context.client.triggerWorkflow(context.owner, context.repo, workflow, dispatchRef, inputs),
    { clock: context.clock }
  );
  return { dispatched: true, retries, workflow };
}
