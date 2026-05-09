import { describe, it, expect } from 'vitest';
import { evaluate, mergeBudget, DEFAULT_LOOP_BUDGET } from '../orchestrator/loop-budget.js';

const T0 = '2026-05-08T10:00:00Z';

function args(over = {}) {
  return {
    budget: { ...DEFAULT_LOOP_BUDGET, ...(over.budget ?? {}) },
    iterations: over.iterations ?? {},
    totalSteps: over.totalSteps ?? 0,
    runStartedAt: over.runStartedAt ?? T0,
    now: over.now ?? '2026-05-08T10:01:00Z',
    fromStep: over.fromStep ?? 'qa',
    toStep: over.toStep ?? 'dev',
    isBackward: over.isBackward ?? true,
  };
}

describe('loop-budget.evaluate', () => {
  it('allows the first traversal of a backward edge', () => {
    const r = evaluate(args());
    expect(r.allowed).toBe(true);
    expect(r.edgeKey).toBe('qa->dev');
    expect(r.nextEdgeIteration).toBe(1);
  });

  it('blocks when per-edge iterations exceed the budget', () => {
    const r = evaluate(args({
      budget: { max_iterations_per_edge: 3 },
      iterations: { 'qa->dev': 3 },
    }));
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('edge');
    expect(r.detail.edge_iteration).toBe(4);
  });

  it('does NOT count edge iterations for forward edges', () => {
    const r = evaluate(args({
      isBackward: false,
      iterations: { 'qa->dev': 999 },
      budget: { max_iterations_per_edge: 1 },
    }));
    expect(r.allowed).toBe(true);
  });

  it('blocks when total steps exceed the budget', () => {
    const r = evaluate(args({
      budget: { max_total_steps: 5 },
      totalSteps: 5,
    }));
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('total');
  });

  it('blocks when wallclock exceeds the budget (thread-spanning)', () => {
    const r = evaluate(args({
      budget: { max_wallclock_minutes: 10 },
      runStartedAt: '2026-05-08T10:00:00Z',
      now: '2026-05-08T10:11:00Z',
    }));
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('wallclock');
    expect(r.detail.elapsed_minutes).toBe(11);
  });

  it('is monotonic in iteration count: not-allowed remains not-allowed as we increase iterations', () => {
    const baseBudget = { max_iterations_per_edge: 2 };
    let prev = true;
    for (let i = 0; i < 6; i++) {
      const r = evaluate(args({
        budget: baseBudget, iterations: { 'qa->dev': i },
      }));
      if (!prev) expect(r.allowed).toBe(false);
      prev = r.allowed;
    }
  });

  it('preserves edgeKey on rejection so callers can audit which edge tripped', () => {
    const r = evaluate(args({
      budget: { max_iterations_per_edge: 1 },
      iterations: { 'qa->dev': 1 },
      fromStep: 'qa', toStep: 'dev',
    }));
    expect(r.edgeKey).toBe('qa->dev');
  });
});

describe('loop-budget.mergeBudget', () => {
  it('returns defaults when declared is undefined', () => {
    expect(mergeBudget(undefined)).toEqual(DEFAULT_LOOP_BUDGET);
  });
  it('overrides only declared keys', () => {
    expect(mergeBudget({ max_iterations_per_edge: 5 }))
      .toEqual({ ...DEFAULT_LOOP_BUDGET, max_iterations_per_edge: 5 });
  });
});
