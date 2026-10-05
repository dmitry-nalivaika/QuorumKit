/**
 * Cost & Tokens aggregation (Issue #335, ADR-335 — FR-009 to FR-014, FR-016).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(new URL(import.meta.url).pathname, '../../..');
const { aggregateCostTokens } = require(path.join(REPO_ROOT, 'engine/dashboard/cost-tokens.js'));

const usage = (total, cost, model = 'gpt-4o') => ({
  runtime: 'copilot-default', model,
  prompt_tokens: total - 10, completion_tokens: 10, total_tokens: total, estimated_cost_usd: cost,
});
const ev = (agent, usageObj, extra = {}) => ({ source: 'apm-msg', agent, usage: usageObj, ...extra });

describe('aggregateCostTokens', () => {
  it('sums tokens and cost for the feature and per agent', () => {
    const r = aggregateCostTokens([
      ev('dev-agent', usage(1000, 0.01)),
      ev('dev-agent', usage(500, 0.005)),
      ev('qa-agent', usage(200, 0.002)),
    ]);
    expect(r.total).toEqual({ totalTokens: 1700, estimatedCostUsd: 0.017, trackedInvocations: 3, untrackedInvocations: 0, costUnknownInvocations: 0, partial: false });
    expect(r.byAgent['dev-agent']).toMatchObject({ totalTokens: 1500, trackedInvocations: 2 });
    expect(r.byAgent['qa-agent']).toMatchObject({ totalTokens: 200, trackedInvocations: 1 });
  });

  it('excludes invocations without usage and flags the total partial (FR-013, FR-014)', () => {
    const r = aggregateCostTokens([ev('dev-agent', usage(100, 0.001)), ev('dev-agent', undefined), ev('qa-agent', null)]);
    expect(r.total.totalTokens).toBe(100);
    expect(r.total.untrackedInvocations).toBe(2);
    expect(r.total.partial).toBe(true);
    expect(r.byAgent['qa-agent']).toMatchObject({ totalTokens: 0, untrackedInvocations: 1, partial: true });
  });

  it('counts tokens but not cost when estimated_cost_usd is null, and flags partial', () => {
    const r = aggregateCostTokens([ev('dev-agent', usage(100, 0.001)), ev('dev-agent', usage(300, null, 'mystery'))]);
    expect(r.total.totalTokens).toBe(400);
    expect(r.total.estimatedCostUsd).toBe(0.001);
    expect(r.total.costUnknownInvocations).toBe(1);
    expect(r.total.partial).toBe(true);
  });

  it('reports a null cost when no invocation had a known cost', () => {
    const r = aggregateCostTokens([ev('dev-agent', usage(300, null))]);
    expect(r.total.estimatedCostUsd).toBeNull();
  });

  it('ignores events that are not apm-msg blocks', () => {
    const r = aggregateCostTokens([
      { source: 'footprint', agent: 'dev-agent' },
      { source: 'pipeline', agent: 'pipeline' },
    ]);
    expect(r.total).toMatchObject({ trackedInvocations: 0, untrackedInvocations: 0, partial: false });
    expect(r.byAgent).toEqual({});
  });

  it('is robust to malformed usage values', () => {
    const r = aggregateCostTokens([ev('dev-agent', { total_tokens: 'lots', estimated_cost_usd: 'free' })]);
    expect(r.total.untrackedInvocations).toBe(1);
  });

  it('returns an empty result for empty or invalid input', () => {
    expect(aggregateCostTokens([]).total.trackedInvocations).toBe(0);
    expect(aggregateCostTokens(undefined).byAgent).toEqual({});
  });

  it('labels the figures as an estimate (FR-016)', () => {
    expect(aggregateCostTokens([]).disclaimer).toMatch(/estimate/i);
  });
});
