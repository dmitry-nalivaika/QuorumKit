/**
 * runtimes/claude.js
 * Adapter for the Claude (Anthropic) runtime kind (ADR-005, ADR-002).
 *
 * Dispatches the agent's Claude workflow file (`agent-<slug>.yml`) through
 * the supplied client. Mirrors copilot.js with a smaller required-permissions
 * set (no `models:` scope — Claude calls go to api.anthropic.com).
 */

import { withRetry } from './_retry.js';

export const KIND = 'claude';

export const requiredPermissions = Object.freeze({
  contents: 'read',
  issues: 'write',
  'pull-requests': 'write',
});

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

export async function invoke(context) {
  const env = context.env ?? process.env;
  resolveCredential(context.runtime, env);

  // Workflow filename uses the bare agent slug (no `-agent` suffix):
  //   pipeline `agent: dev-agent` → `agent-dev.yml`
  const slug = context.agent.replace(/-agent$/, '');
  const workflow = `agent-${slug}.yml`;
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
