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
const { loadPricing, computeUsage, PRICING_PATH } = require(CJS_PATH);

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
