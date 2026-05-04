/**
 * agent-invoker.js
 * Dispatches an agent invocation via the correct AI runtime (FR-011).
 *
 * Supported aiTool values:
 *   "copilot" → triggers copilot-agent-{slug}.yml workflow
 *   "claude"  → triggers agent-{slug}.yml workflow
 *   undefined / missing → defaults to "copilot"
 *   any other value → throws with reason INVALID_AI_TOOL
 */

const VALID_AI_TOOLS = new Set(['copilot', 'claude']);

/**
 * Invoke an agent via the configured AI runtime.
 *
 * @param {object} client         - GitHub client with triggerWorkflow method
 * @param {string} owner
 * @param {string} repo
 * @param {string} agentSlug      - e.g. "triage-agent"
 * @param {number} issueNumber    - triggering issue/PR number
 * @param {string|null} ref       - git ref to dispatch on (default: "main")
 * @param {string|undefined} aiTool - "copilot" | "claude" | undefined
 * @returns {Promise<void>}
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
