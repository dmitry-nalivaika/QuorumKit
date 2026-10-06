/**
 * model-pricing.js
 * Loads `src/model-pricing.yml` and computes the `usage` object added to
 * `apm-msg` blocks (Issue #335, ADR-335).
 *
 * Graceful degradation (FR-008): a missing file, malformed YAML, or unknown
 * model NEVER throws — the caller always gets token counts back, with
 * `estimated_cost_usd: null` when a price cannot be determined.
 */

import { readFile } from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';

export const PRICING_PATH = 'src/model-pricing.yml';

/**
 * @param {string} [rootDir]
 * @returns {Promise<{ pricing: object }>}
 */
export async function loadPricing(rootDir = process.cwd()) {
  const fullPath = path.join(rootDir, PRICING_PATH);
  try {
    const raw = await readFile(fullPath, 'utf8');
    const parsed = yaml.load(raw, { schema: yaml.CORE_SCHEMA });
    if (!parsed || typeof parsed !== 'object' || typeof parsed.pricing !== 'object' || parsed.pricing === null) {
      return { pricing: {} };
    }
    // Keep only entries with two finite rates, as the CJS loader does, so a partial entry
    // is "unknown model" (null cost) rather than NaN.
    const pricing = {};
    for (const [model, entry] of Object.entries(parsed.pricing)) {
      if (entry && Number.isFinite(entry.prompt_per_1k_usd) && Number.isFinite(entry.completion_per_1k_usd)) {
        pricing[model] = entry;
      }
    }
    return { pricing };
  } catch {
    // Missing file, unreadable, or malformed YAML — degrade gracefully.
    return { pricing: {} };
  }
}

/**
 * Build the additive `usage` object for an `apm-msg` block (FR-003, FR-007, FR-008).
 *
 * @param {object} args
 * @param {string} args.runtime          - runtime entry name (e.g. "copilot-default")
 * @param {string} args.model            - model/deployment identifier
 * @param {number} args.promptTokens
 * @param {number} args.completionTokens
 * @param {object} args.pricing          - `{ [model]: { prompt_per_1k_usd, completion_per_1k_usd } }`
 * @returns {{runtime: string, model: string, prompt_tokens: number, completion_tokens: number, total_tokens: number, estimated_cost_usd: number|null}}
 */
export function computeUsage({ runtime, model, promptTokens, completionTokens, pricing }) {
  const entry = pricing?.[model];
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
