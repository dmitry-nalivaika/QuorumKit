/**
 * Cost & Tokens aggregation (Issue #335, ADR-335 — FR-009 to FR-014, FR-016).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(new URL(import.meta.url).pathname, '../../..');
const { aggregateCostTokens, aggregateCostTokensByFeature, normalizeFeature, parsePaginatedJson } = require(path.join(REPO_ROOT, 'engine/dashboard/cost-tokens.js'));

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

describe('normalizeFeature', () => {
  it('reduces issue numbers, zero-padded pipeline ids, and URLs to one canonical key', () => {
    expect(normalizeFeature(42)).toBe('42');
    expect(normalizeFeature('42')).toBe('42');
    expect(normalizeFeature('042')).toBe('42');
    expect(normalizeFeature('https://github.com/o/r/issues/42')).toBe('42');
  });

  it('returns null for missing or non-numeric values', () => {
    for (const v of [undefined, null, '', 'abc', 0, '000']) expect(normalizeFeature(v)).toBeNull();
  });
});

describe('aggregateCostTokensByFeature (cross-feature view, US-3, FR-010, FR-011)', () => {
  const fev = (feature, agent, usageObj) => ev(agent, usageObj, { feature });

  it('groups totals per feature and per agent across features', () => {
    const r = aggregateCostTokensByFeature([
      fev('42', 'dev-agent', usage(1000, 0.01)),
      fev('42', 'qa-agent', usage(200, 0.002)),
      fev('7', 'dev-agent', usage(500, 0.005)),
    ]);
    expect(r.byFeature['42']).toMatchObject({ totalTokens: 1200, estimatedCostUsd: 0.012, trackedInvocations: 2 });
    expect(r.byFeature['7']).toMatchObject({ totalTokens: 500, estimatedCostUsd: 0.005 });
    expect(r.byAgent['dev-agent']).toMatchObject({ totalTokens: 1500, estimatedCostUsd: 0.015, trackedInvocations: 2 });
    expect(r.byAgent['qa-agent']).toMatchObject({ totalTokens: 200 });
    expect(r.total).toMatchObject({ totalTokens: 1700, estimatedCostUsd: 0.017, partial: false });
  });

  it('flags a feature partial when it has an untracked or cost-unknown invocation without tainting others (FR-014)', () => {
    const r = aggregateCostTokensByFeature([
      fev('42', 'dev-agent', usage(1000, 0.01)),
      fev('42', 'qa-agent', undefined),
      fev('7', 'dev-agent', usage(500, null)),
      fev('9', 'dev-agent', usage(100, 0.001)),
    ]);
    expect(r.byFeature['42']).toMatchObject({ untrackedInvocations: 1, partial: true });
    expect(r.byFeature['7']).toMatchObject({ costUnknownInvocations: 1, estimatedCostUsd: null, partial: true });
    expect(r.byFeature['9'].partial).toBe(false);
    expect(r.total.partial).toBe(true);
  });

  it('buckets events with no resolvable feature under "unknown" rather than dropping them', () => {
    const r = aggregateCostTokensByFeature([fev(undefined, 'dev-agent', usage(100, 0.001))]);
    expect(r.byFeature.unknown.totalTokens).toBe(100);
  });

  it('ignores non-apm-msg events and tolerates invalid input', () => {
    expect(aggregateCostTokensByFeature([{ source: 'footprint', feature: '1' }]).byFeature).toEqual({});
    expect(aggregateCostTokensByFeature(undefined).total.trackedInvocations).toBe(0);
  });

  it('labels the figures as an estimate (FR-016)', () => {
    expect(aggregateCostTokensByFeature([]).disclaimer).toMatch(/estimate/i);
  });
});

describe('parsePaginatedJson', () => {
  it('parses a single JSON array', () => {
    expect(parsePaginatedJson('[{"a":1}]')).toEqual([{ a: 1 }]);
  });

  it('merges the concatenated per-page arrays emitted by `gh api --paginate`', () => {
    expect(parsePaginatedJson('[{"a":1}][{"a":2}]\n[{"a":3}]')).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
  });

  it('is not fooled by "][" or brackets inside string values', () => {
    const raw = JSON.stringify([{ body: 'see [a][b] and ] [ ' }]) + JSON.stringify([{ body: '"][" \\" ]' }]);
    expect(parsePaginatedJson(raw)).toEqual([{ body: 'see [a][b] and ] [ ' }, { body: '"][" \\" ]' }]);
  });

  it('returns an empty array for empty output and throws on garbage', () => {
    expect(parsePaginatedJson('')).toEqual([]);
    expect(() => parsePaginatedJson('not json')).toThrow();
  });
});
