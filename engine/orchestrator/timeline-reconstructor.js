/**
 * timeline-reconstructor.js
 * Rebuild a deterministic run timeline from the audit-channel comments alone
 * (FR-022). Used for the dashboard, debugging, and test assertions.
 *
 * Input:  list of GitHub comment objects (`{ body, created_at }`) on an issue.
 * Output: { runId, pipelineName, status, steps: [...], finalOutcome? }
 *
 * Each entry in `steps` reflects one transition from the audit channel:
 *   { at, step, agent?, runtime?, outcome?, iteration?, edgeKey?, dedup_key? }
 *
 * The reconstructor is order-preserving and tolerates missing fields (older
 * v1 audit payloads have no `runtime_used` or `iterations`).
 */

import { STATE_TAG } from './state-manager.js';

const STATE_CLOSE = ' -->';

/**
 * @param {Array<{body: string, created_at: string}>} comments
 * @returns {{
 *   runId: string|null,
 *   pipelineName: string|null,
 *   status: string|null,
 *   steps: Array<object>,
 *   finalOutcome: string|null
 * }}
 */
export function reconstructTimeline(comments) {
  const audit = (comments ?? [])
    .filter(c => c?.body && c.body.includes(STATE_TAG))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  let runId = null;
  let pipelineName = null;
  let status = null;
  const steps = [];

  for (const c of audit) {
    const state = parseStateBody(c.body);
    if (!state) continue;
    runId = state.runId ?? runId;
    pipelineName = state.pipelineName ?? pipelineName;
    status = state.status ?? status;

    const idx = (state.currentStepIndex != null && state.steps?.[state.currentStepIndex]) || null;
    const stepName = state.currentStep ?? idx?.name ?? null;

    steps.push({
      at: c.created_at,
      step: stepName,
      agent: state.currentAgent ?? null,
      runtime: state.runtime_used ?? null,
      outcome: state.outcome ?? null,
      iteration: state.currentIteration ?? null,
      edgeKey: state.currentEdgeKey ?? null,
      dedup_key: state.dedup_key ?? null,
      runtime_retries: state.runtime_retries ?? null,
      status: state.status ?? null,
    });
  }

  return {
    runId,
    pipelineName,
    status,
    steps,
    finalOutcome: steps.length > 0 ? steps[steps.length - 1].outcome ?? null : null,
  };
}

function parseStateBody(body) {
  const start = body.indexOf(STATE_TAG) + STATE_TAG.length;
  const end = body.indexOf(STATE_CLOSE, start);
  if (start < STATE_TAG.length || end === -1) return null;
  try { return JSON.parse(body.slice(start, end)); } catch { return null; }
}
