/**
 * router-v2.js
 * Outcome-graph traversal for v2 pipelines (FR-003, FR-004).
 *
 * Stateless: callers provide the pipeline + current state + outcome, and
 * the router returns the next step (and whether the edge is backward).
 *
 * The forward/backward distinction uses topological order of the steps as
 * declared in the pipeline file. A transition is BACKWARD iff the target
 * step's index is less than or equal to the source step's index.
 */

/**
 * Build a quick-lookup index of step name → declaration order.
 * @param {object} pipeline (v2 normalised)
 * @returns {Map<string, number>}
 */
export function buildStepIndex(pipeline) {
  return new Map(pipeline.steps.map((s, i) => [s.name, i]));
}

/**
 * Resolve the transition triggered by `(fromStep, outcome)` for a v2 pipeline.
 *
 * @param {object} pipeline (v2 normalised)
 * @param {string} fromStep
 * @param {string} outcome
 * @returns {{ to: string, isBackward: boolean } | null}
 */
export function resolveTransition(pipeline, fromStep, outcome) {
  const transitions = pipeline.transitions ?? [];
  const t = transitions.find(t => t.from === fromStep && t.outcome === outcome);
  if (!t) return null;
  const idx = buildStepIndex(pipeline);
  const src = idx.get(t.from);
  const dst = idx.get(t.to);
  return { to: t.to, isBackward: typeof src === 'number' && typeof dst === 'number' && dst <= src };
}

/**
 * Match an event against a list of pipelines (used by both v1 and v2).
 * Reuses the v1 router's exact-match-event + all-labels-present semantics.
 */
export { matchEvent } from './router.js';
