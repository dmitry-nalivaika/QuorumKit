/**
 * Unit tests for the dependency-free GHA-script variant of the pricing helper
 * (.github/scripts/model-pricing.cjs, mirrored to src/.github/scripts/).
 * Issue #335, ADR-335 — FR-007, FR-008.
 */
import { describe, it, expect } from 'vitest';
import fs   from 'fs';
import os   from 'os';
import path from 'path';
import yaml from 'js-yaml';
import { createRequire } from 'module';
import { computeUsage as computeUsageEsm } from '../orchestrator/model-pricing.js';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(new URL(import.meta.url).pathname, '../../..');
const CJS_PATH  = path.join(REPO_ROOT, '.github/scripts/model-pricing.cjs');
const { loadPricing, computeUsage, tokensFromResponse, usageFromResponse, normalizeUsage, PRICING_PATH } = require(CJS_PATH);

function makeTmpRoot(pricingYaml) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pricing-cjs-test-'));
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  if (pricingYaml !== null) fs.writeFileSync(path.join(dir, PRICING_PATH), pricingYaml, 'utf8');
  return dir;
}

describe('model-pricing.cjs loadPricing', () => {
  it('parses a valid file with comments and blank lines', () => {
    const root = makeTmpRoot(`# header\n\npricing:\n  gpt-4o:\n    prompt_per_1k_usd: 0.0025 # inline\n    completion_per_1k_usd: 0.01\n`);
    expect(loadPricing(root).pricing['gpt-4o']).toEqual({ prompt_per_1k_usd: 0.0025, completion_per_1k_usd: 0.01 });
  });

  it('returns an empty table when the file is missing', () => {
    expect(loadPricing(makeTmpRoot(null)).pricing).toEqual({});
  });

  it('skips model entries with missing or non-numeric rates', () => {
    const root = makeTmpRoot(`pricing:\n  good:\n    prompt_per_1k_usd: 1\n    completion_per_1k_usd: 2\n  half:\n    prompt_per_1k_usd: 1\n  bad:\n    prompt_per_1k_usd: abc\n    completion_per_1k_usd: 2\n`);
    expect(Object.keys(loadPricing(root).pricing)).toEqual(['good']);
  });

  it('returns an empty table for garbage input', () => {
    expect(loadPricing(makeTmpRoot('{{{ not yaml at all')).pricing).toEqual({});
  });

  it('parses the real src/model-pricing.yml identically to js-yaml (drift guard)', () => {
    const expected = yaml.load(fs.readFileSync(path.join(REPO_ROOT, 'src/model-pricing.yml'), 'utf8')).pricing;
    expect(loadPricing(REPO_ROOT).pricing).toEqual(expected);
  });
});

describe('model-pricing.cjs computeUsage', () => {
  const pricing = { 'gpt-4o': { prompt_per_1k_usd: 0.0025, completion_per_1k_usd: 0.01 } };

  it('matches the ESM implementation for known and unknown models', () => {
    for (const model of ['gpt-4o', 'nope']) {
      const args = { runtime: 'r', model, promptTokens: 1234, completionTokens: 567, pricing };
      expect(computeUsage(args)).toEqual(computeUsageEsm(args));
    }
  });

  it('returns estimated_cost_usd: null for an unknown model', () => {
    const u = computeUsage({ runtime: 'r', model: 'nope', promptTokens: 1, completionTokens: 2, pricing });
    expect(u.estimated_cost_usd).toBeNull();
    expect(u.total_tokens).toBe(3);
  });
});

describe('model-pricing.cjs tokensFromResponse', () => {
  it('reads chat/completions counts', () => {
    expect(tokensFromResponse({ usage: { prompt_tokens: 7, completion_tokens: 3 } })).toEqual({ promptTokens: 7, completionTokens: 3 });
  });

  it('reads Responses API counts', () => {
    expect(tokensFromResponse({ usage: { input_tokens: 9, output_tokens: 2 } })).toEqual({ promptTokens: 9, completionTokens: 2 });
  });

  it('treats one missing side as zero but still reports the other', () => {
    expect(tokensFromResponse({ usage: { prompt_tokens: 5 } })).toEqual({ promptTokens: 5, completionTokens: 0 });
  });

  it('returns null when there is no usable usage (FR-005)', () => {
    for (const r of [undefined, null, {}, { usage: null }, { usage: {} }, { usage: 'x' }, { usage: { prompt_tokens: 'x' } }, { usage: { prompt_tokens: -1 } }]) {
      expect(tokensFromResponse(r)).toBeNull();
    }
  });
});

describe('model-pricing.cjs usageFromResponse', () => {
  const pricing = { 'gpt-4o': { prompt_per_1k_usd: 0.0025, completion_per_1k_usd: 0.01 } };
  const base = { model: 'gpt-4o', runtime: 'azure-foundry-standard', pricing };

  it('computes the schema-shaped usage object (FR-003, FR-007)', () => {
    expect(usageFromResponse({ ...base, response: { usage: { prompt_tokens: 1000, completion_tokens: 500 } } })).toEqual({
      runtime: 'azure-foundry-standard', model: 'gpt-4o',
      prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500, estimated_cost_usd: 0.0075,
    });
  });

  it('reports tokens with null cost for an unpriced model (FR-008)', () => {
    const u = usageFromResponse({ ...base, model: 'custom', response: { usage: { prompt_tokens: 10, completion_tokens: 5 } } });
    expect(u).toMatchObject({ total_tokens: 15, estimated_cost_usd: null });
  });

  it('returns null without usage and never throws (FR-005)', () => {
    expect(usageFromResponse({ ...base, response: {} })).toBeNull();
    expect(() => usageFromResponse(undefined)).not.toThrow();
    expect(usageFromResponse(undefined)).toBeNull();
  });

  it('does not turn a partial pricing entry into NaN', () => {
    const u = computeUsage({ runtime: 'r', model: 'half', promptTokens: 1, completionTokens: 1, pricing: { half: { prompt_per_1k_usd: 1 } } });
    expect(u.estimated_cost_usd).toBeNull();
  });
});

describe('model-pricing.cjs normalizeUsage', () => {
  const good = { runtime: 'r', model: 'm', prompt_tokens: 1, completion_tokens: 2, total_tokens: 3, estimated_cost_usd: 0.5 };

  it('keeps a valid object and accepts a null cost', () => {
    expect(normalizeUsage(good)).toEqual(good);
    expect(normalizeUsage({ ...good, estimated_cost_usd: null })).toEqual({ ...good, estimated_cost_usd: null });
  });

  it('drops unknown fields so no content can ride along (FR-015)', () => {
    expect(normalizeUsage({ ...good, prompt: 'SECRET' })).toEqual(good);
  });

  it('rejects anything the schema would reject', () => {
    for (const bad of [null, 'x', {}, { ...good, runtime: '' }, { ...good, prompt_tokens: 1.5 }, { ...good, total_tokens: -1 },
      { ...good, estimated_cost_usd: NaN }, { ...good, estimated_cost_usd: -1 }, { ...good, estimated_cost_usd: '1' }]) {
      expect(normalizeUsage(bad)).toBeNull();
    }
  });
});
