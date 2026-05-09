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

  const workflow = `agent-${context.agent}.yml`;
  const dispatchRef = context.ref ?? 'main';
  const inputs = {
    issue_number: String(context.issueNumber),
    run_id: context.runId ?? '',
    step: context.step ?? '',
    iteration: String(context.iteration ?? 1),
    runtime: context.runtimeName ?? '',
  };

  const { retries } = await withRetry(
    () => context.client.triggerWorkflow(context.owner, context.repo, workflow, dispatchRef, inputs),
    { clock: context.clock }
  );
  return { dispatched: true, retries, workflow };
}
