/**
 * model-pricing.cjs
 * Dependency-free pricing helper for GHA scripts (Issue #335, ADR-335).
 * Mirrors engine/orchestrator/model-pricing.js; parses only the fixed
 * two-level `pricing:` schema of src/model-pricing.yml (no js-yaml available here).
 *
 * Never throws: a missing/malformed file or unknown model yields
 * `estimated_cost_usd: null` (FR-008).
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const PRICING_PATH = 'src/model-pricing.yml';

function parsePricing(raw) {
  const pricing = {};
  let inPricing = false;
  let model = null;
  for (const line of raw.split('\n')) {
    const text = line.replace(/\s+#.*$/, '').replace(/^#.*$/, '');
    if (!text.trim()) continue;
    const indent = text.match(/^ */)[0].length;
    const body = text.trim();
    if (indent === 0) { inPricing = body === 'pricing:'; model = null; continue; }
    if (!inPricing) continue;
    if (indent === 2 && body.endsWith(':')) { model = body.slice(0, -1).trim(); pricing[model] = {}; continue; }
    if (indent === 4 && model) {
      const m = body.match(/^(prompt_per_1k_usd|completion_per_1k_usd):\s*(\S+)$/);
      if (m) pricing[model][m[1]] = Number(m[2]);
    }
  }
  for (const [name, entry] of Object.entries(pricing)) {
    if (!Number.isFinite(entry.prompt_per_1k_usd) || !Number.isFinite(entry.completion_per_1k_usd)) delete pricing[name];
  }
  return pricing;
}

function loadPricing(rootDir = process.cwd()) {
  try {
    return { pricing: parsePricing(fs.readFileSync(path.join(rootDir, PRICING_PATH), 'utf8')) };
  } catch {
    return { pricing: {} };
  }
}

function computeUsage({ runtime, model, promptTokens, completionTokens, pricing }) {
  const entry = pricing && pricing[model];
  const estimated_cost_usd = entry
    ? (promptTokens / 1000) * entry.prompt_per_1k_usd + (completionTokens / 1000) * entry.completion_per_1k_usd
    : null;
  return {
    runtime,
    model,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
    estimated_cost_usd,
  };
}

module.exports = { PRICING_PATH, loadPricing, computeUsage };
