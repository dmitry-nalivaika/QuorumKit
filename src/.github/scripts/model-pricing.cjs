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
  const priced = entry && Number.isFinite(entry.prompt_per_1k_usd) && Number.isFinite(entry.completion_per_1k_usd);
  const estimated_cost_usd = priced
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

/**
 * Token counts from one LLM response, whichever API shape it used:
 *   chat/completions  usage.prompt_tokens / completion_tokens
 *   Responses API     usage.input_tokens  / output_tokens
 * Returns null when the provider reported no usable counts (FR-005). Never throws.
 */
function tokensFromResponse(response) {
  const u = response && response.usage;
  if (!u || typeof u !== 'object') return null;
  const finite = n => Number.isFinite(n) && n >= 0;
  const prompt = finite(u.prompt_tokens) ? u.prompt_tokens : (finite(u.input_tokens) ? u.input_tokens : null);
  const completion = finite(u.completion_tokens) ? u.completion_tokens : (finite(u.output_tokens) ? u.output_tokens : null);
  if (prompt === null && completion === null) return null;
  return { promptTokens: prompt ?? 0, completionTokens: completion ?? 0 };
}

/**
 * The `usage` object for an apm-msg block built from one LLM response, or null when the
 * response carried no usage. Never throws: pricing problems degrade to estimated_cost_usd null.
 */
function usageFromResponse({ response, runtime, model, pricing, rootDir } = {}) {
  try {
    const t = tokensFromResponse(response);
    if (!t || !runtime || !model) return null;
    return computeUsage({ runtime, model, ...t, pricing: pricing ?? loadPricing(rootDir).pricing });
  } catch {
    return null;
  }
}

/**
 * Validate an untrusted `usage` object (e.g. a step output) against the apm-msg schema and return
 * a copy holding only the schema fields, or null when it is not usable. Never throws.
 */
function normalizeUsage(u) {
  try {
    if (!u || typeof u !== 'object') return null;
    const count = n => Number.isInteger(n) && n >= 0;
    const text = v => typeof v === 'string' && v.length > 0;
    if (!text(u.runtime) || !text(u.model)) return null;
    if (!count(u.prompt_tokens) || !count(u.completion_tokens) || !count(u.total_tokens)) return null;
    const cost = u.estimated_cost_usd;
    if (cost !== null && !(typeof cost === 'number' && Number.isFinite(cost) && cost >= 0)) return null;
    return {
      runtime: u.runtime,
      model: u.model,
      prompt_tokens: u.prompt_tokens,
      completion_tokens: u.completion_tokens,
      total_tokens: u.total_tokens,
      estimated_cost_usd: cost,
    };
  } catch {
    return null;
  }
}

module.exports = { PRICING_PATH, loadPricing, computeUsage, tokensFromResponse, usageFromResponse, normalizeUsage };
