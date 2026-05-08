/**
 * loop-budget.js
 * Pure budget arithmetic for v2 pipelines containing backward edges
 * (FR-004, FR-005, FR-028).
 *
 * Wallclock baseline (FR-028): NOT a per-job timeout — it is measured from
 * the run's first audit comment created_at to "now", spanning all dispatched
 * sub-workflows. The caller passes the baseline timestamp explicitly.
 */

export const DEFAULT_LOOP_BUDGET = Object.freeze({
  max_iterations_per_edge: 3,
  max_total_steps: 30,
  max_wallclock_minutes: 720,
});

/**
 * Evaluate whether a proposed transition is permitted by the run's loop budget.
 *
 * @param {object} args
 * @param {object} args.budget       - merged budget block (defaults filled in by caller)
 * @param {object<string, number>} args.iterations - per-edge counters (key: "src->dst")
 * @param {number} args.totalSteps   - total step invocations so far
 * @param {string} args.runStartedAt - ISO timestamp of first audit comment
 * @param {string} args.now          - ISO timestamp of "now"
 * @param {string} args.fromStep
 * @param {string} args.toStep
 * @param {boolean} args.isBackward  - true iff target step occurs earlier in topological order
 * @returns {{allowed: true, edgeKey: string, nextEdgeIteration: number} |
 *           {allowed: false, reason: 'edge'|'total'|'wallclock', edgeKey: string, detail: object}}
 */
export function evaluate(args) {
  const {
    budget = DEFAULT_LOOP_BUDGET,
    iterations = {},
    totalSteps = 0,
    runStartedAt,
    now,
    fromStep,
    toStep,
    isBackward = false,
  } = args;

  const edgeKey = `${fromStep}->${toStep}`;
  const currentEdgeIter = iterations[edgeKey] ?? 0;
  const nextEdgeIteration = currentEdgeIter + 1;

  // Wallclock check (always applies, not just on backward edges)
  if (runStartedAt && now && Number.isFinite(budget.max_wallclock_minutes)) {
    const elapsedMs = new Date(now).getTime() - new Date(runStartedAt).getTime();
    const limitMs = budget.max_wallclock_minutes * 60_000;
    if (elapsedMs > limitMs) {
      return {
        allowed: false,
        reason: 'wallclock',
        edgeKey,
        detail: {
          elapsed_minutes: Math.round(elapsedMs / 60_000),
          max_wallclock_minutes: budget.max_wallclock_minutes,
        },
      };
    }
  }

  // Total-steps check (every step, regardless of direction)
  if (Number.isFinite(budget.max_total_steps) && totalSteps + 1 > budget.max_total_steps) {
    return {
      allowed: false,
      reason: 'total',
      edgeKey,
      detail: {
        total_steps: totalSteps + 1,
        max_total_steps: budget.max_total_steps,
      },
    };
  }

  // Per-edge iteration check applies only to backward edges
  if (isBackward &&
      Number.isFinite(budget.max_iterations_per_edge) &&
      nextEdgeIteration > budget.max_iterations_per_edge) {
    return {
      allowed: false,
      reason: 'edge',
      edgeKey,
      detail: {
        edge_iteration: nextEdgeIteration,
        max_iterations_per_edge: budget.max_iterations_per_edge,
      },
    };
  }

  return { allowed: true, edgeKey, nextEdgeIteration };
}

/**
 * Merge a pipeline-declared budget with defaults, filling missing keys.
 * @param {object|undefined} declared
 * @returns {object}
 */
export function mergeBudget(declared) {
  return { ...DEFAULT_LOOP_BUDGET, ...(declared ?? {}) };
}
