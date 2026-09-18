/**
 * Unit tests for model-pricing.js (Issue #335, ADR-335).
 *
 * Covers: valid lookup, missing file, malformed YAML, unknown model,
 * zero-token invocation, and no-usage passthrough (FR-006, FR-007, FR-008).
 */
import { describe, it, expect } from 'vitest';
import fs   from 'fs';
import os   from 'os';
import path from 'path';
import { loadPricing, computeUsage, PRICING_PATH } from '../orchestrator/model-pricing.js';

function makeTmpRoot(pricingYaml) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pricing-test-'));
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  if (pricingYaml !== null) {
    fs.writeFileSync(path.join(dir, PRICING_PATH), pricingYaml, 'utf8');
  }
  return dir;
}

const VALID_YAML = `
pricing:
  gpt-4o:
    prompt_per_1k_usd: 0.0025
    completion_per_1k_usd: 0.01
`;

describe('model-pricing.loadPricing', () => {
  it('loads a valid pricing file', async () => {
    const root = makeTmpRoot(VALID_YAML);
    const result = await loadPricing(root);
    expect(result.pricing['gpt-4o'].prompt_per_1k_usd).toBe(0.0025);
  });

  it('returns an empty pricing table when the file is missing', async () => {
    const root = makeTmpRoot(null);
    const result = await loadPricing(root);
    expect(result.pricing).toEqual({});
  });

  it('returns an empty pricing table when the file is malformed YAML', async () => {
    const root = makeTmpRoot('pricing:\n  gpt-4o: [this, is, not, { a: map');
    const result = await loadPricing(root);
    expect(result.pricing).toEqual({});
  });
});

describe('model-pricing.computeUsage', () => {
  const pricing = { 'gpt-4o': { prompt_per_1k_usd: 0.0025, completion_per_1k_usd: 0.01 } };

  it('computes estimated_cost_usd for a known model', () => {
    const usage = computeUsage({
      runtime: 'copilot-default', model: 'gpt-4o',
      promptTokens: 1000, completionTokens: 500, pricing,
    });
    expect(usage).toEqual({
      runtime: 'copilot-default', model: 'gpt-4o',
      prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500,
      estimated_cost_usd: 0.0025 + 0.005,
    });
  });

  it('returns estimated_cost_usd: null for an unknown model, tokens still reported', () => {
    const usage = computeUsage({
      runtime: 'copilot-default', model: 'unknown-model',
      promptTokens: 100, completionTokens: 50, pricing,
    });
    expect(usage.estimated_cost_usd).toBeNull();
    expect(usage.total_tokens).toBe(150);
  });

  it('returns estimated_cost_usd: null when the pricing table is empty', () => {
    const usage = computeUsage({
      runtime: 'copilot-default', model: 'gpt-4o',
      promptTokens: 100, completionTokens: 50, pricing: {},
    });
    expect(usage.estimated_cost_usd).toBeNull();
  });

  it('handles zero-token invocations without error', () => {
    const usage = computeUsage({
      runtime: 'copilot-default', model: 'gpt-4o',
      promptTokens: 0, completionTokens: 0, pricing,
    });
    expect(usage.total_tokens).toBe(0);
    expect(usage.estimated_cost_usd).toBe(0);
  });

  it('never includes prompt or completion content — only counts and identifiers (FR-015)', () => {
    const usage = computeUsage({
      runtime: 'copilot-default', model: 'gpt-4o',
      promptTokens: 10, completionTokens: 10, pricing,
    });
    expect(Object.keys(usage).sort()).toEqual(
      ['completion_tokens', 'estimated_cost_usd', 'model', 'prompt_tokens', 'runtime', 'total_tokens'].sort()
    );
  });
});
