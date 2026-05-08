/**
 * agent-invoker.js
 * Dispatches an agent invocation (FR-010, FR-030).
 *
 * Two surfaces:
 *
 *   invokeAgent(client, owner, repo, agentSlug, issueNumber, ref, aiTool)
 *     — v1 surface, preserved unchanged for existing pipelines that key off
 *       a project-level `aiTool` ("copilot" | "claude"). Throws
 *       INVALID_AI_TOOL on unrecognised values.
 *
 *   invokeAgentV2({ client, owner, repo, agent, ref, issueNumber, runId,
 *                   step, iteration, runtimeName, runtime, env, clock })
 *     — v2 surface, used by v2 pipelines. Loads the runtime adapter at
 *       `runtimes/<kind>.js` (only the kind allowlist is loadable per
 *       ADR-005), wraps invocation in the shared retry helper. Returns
 *       `{ dispatched: true, retries, workflow, runtimeName }`.
 *
 * Errors surface with stable codes the orchestrator translates into
 * audit-comment outcomes:
 *   - INVALID_AI_TOOL              → fail (v1)
 *   - runtime-credential-missing   → step fails with that outcome (FR-009)
 *   - runtime-error                → retry-exhausted (FR-030)
 */

import { ENABLED_KINDS } from './runtime-registry.js';

const VALID_AI_TOOLS = new Set(['copilot', 'claude']);

/**
 * v1 invocation surface (unchanged).
 */
export async function invokeAgent(client, owner, repo, agentSlug, issueNumber, ref, aiTool) {
  const runtime = aiTool ?? 'copilot';

  if (!VALID_AI_TOOLS.has(runtime)) {
    throw new Error(
      `INVALID_AI_TOOL: "${runtime}" is not a recognised aiTool. ` +
      `Valid values are: ${[...VALID_AI_TOOLS].join(', ')}.`
    );
  }

  const workflow = runtime === 'claude'
    ? `agent-${agentSlug}.yml`
    : `copilot-agent-${agentSlug}.yml`;

  const dispatchRef = ref ?? 'main';

  await client.triggerWorkflow(owner, repo, workflow, dispatchRef, {
    issue_number: String(issueNumber),
  });
}

/**
 * v2 invocation surface — loads the adapter for the resolved runtime kind.
 *
 * @param {object} ctx  see jsdoc above
 * @returns {Promise<{ dispatched: true, retries: number, workflow: string, runtimeName: string }>}
 */
export async function invokeAgentV2(ctx) {
  const kind = ctx.runtime?.kind;
  if (!ENABLED_KINDS.includes(kind)) {
    const e = new Error(`RUNTIME_KIND_NOT_ENABLED: ${kind}`);
    e.code = 'RUNTIME_KIND_NOT_ENABLED';
    e.kind = kind;
    throw e;
  }
  // Dynamic import — ADR-005 §Interface: orchestrator MUST contain no
  // kind-specific code paths outside the adapter modules.
  const adapter = await import(`./runtimes/${kind}.js`);
  try {
    const result = await adapter.invoke(ctx);
    return { ...result, runtimeName: ctx.runtimeName };
  } catch (err) {
    if (err.code === 'runtime-credential-missing') {
      // Pass through with the credential_ref name only (never a value).
      throw err;
    }
    // Retry-exhausted failure → runtime-error outcome (FR-030)
    const e = new Error(`runtime-error: ${err.message ?? err}`);
    e.code = 'runtime-error';
    e.cause = err;
    throw e;
  }
}

export { ENABLED_KINDS };
