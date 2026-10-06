/**
 * cost-tokens.js — read-only Cost & Tokens aggregation for the dashboard
 * (Issue #335, ADR-335). Pure function over events already parsed from
 * GitHub comments; performs no I/O and has no write path (Constitution §IX).
 */

'use strict';

const DISCLAIMER = 'Estimates only — not billing-grade. Costs derive from src/model-pricing.yml.';

function emptyBucket() {
  return { totalTokens: 0, estimatedCostUsd: null, trackedInvocations: 0, untrackedInvocations: 0, costUnknownInvocations: 0, partial: false };
}

function addEvent(bucket, usage) {
  const tracked = usage && typeof usage === 'object' && Number.isFinite(usage.total_tokens) && usage.total_tokens >= 0;
  if (!tracked) {
    bucket.untrackedInvocations += 1;
    return;
  }
  bucket.trackedInvocations += 1;
  bucket.totalTokens += usage.total_tokens;
  if (Number.isFinite(usage.estimated_cost_usd)) {
    bucket.estimatedCostUsd = (bucket.estimatedCostUsd ?? 0) + usage.estimated_cost_usd;
  } else {
    bucket.costUnknownInvocations += 1;
  }
}

function finalize(bucket) {
  if (bucket.estimatedCostUsd !== null) bucket.estimatedCostUsd = Math.round(bucket.estimatedCostUsd * 1e6) / 1e6;
  bucket.partial = bucket.untrackedInvocations > 0 || bucket.costUnknownInvocations > 0;
  return bucket;
}

/**
 * @param {Array<{source: string, agent?: string, usage?: object|null}>} events
 * @returns {{ total: object, byAgent: Record<string, object>, disclaimer: string }}
 */
function aggregateCostTokens(events) {
  const total = emptyBucket();
  const byAgent = {};
  for (const e of Array.isArray(events) ? events : []) {
    if (!e || e.source !== 'apm-msg') continue;
    const agent = e.agent || 'unknown';
    byAgent[agent] ??= emptyBucket();
    addEvent(total, e.usage);
    addEvent(byAgent[agent], e.usage);
  }
  finalize(total);
  Object.values(byAgent).forEach(finalize);
  return { total, byAgent, disclaimer: DISCLAIMER };
}

/** Canonical feature key (issue number as a string) from an issue number, zero-padded pipeline id, or URL. */
function normalizeFeature(value) {
  if (value === undefined || value === null) return null;
  const m = String(value).match(/(\d+)\s*$/);
  const n = m ? Number(m[1]) : 0;
  return n > 0 ? String(n) : null;
}

/**
 * Cross-feature rollup (US-3, FR-010, FR-011): tokens/cost per feature and per agent.
 * @param {Array<{source: string, feature?: string|null, agent?: string, usage?: object|null}>} events
 * @returns {{ total: object, byFeature: Record<string, object>, byAgent: Record<string, object>, disclaimer: string }}
 */
function aggregateCostTokensByFeature(events) {
  const total = emptyBucket();
  const byFeature = {};
  const byAgent = {};
  for (const e of Array.isArray(events) ? events : []) {
    if (!e || e.source !== 'apm-msg') continue;
    const feature = normalizeFeature(e.feature) || 'unknown';
    const agent = e.agent || 'unknown';
    byFeature[feature] ??= emptyBucket();
    byAgent[agent] ??= emptyBucket();
    addEvent(total, e.usage);
    addEvent(byFeature[feature], e.usage);
    addEvent(byAgent[agent], e.usage);
  }
  finalize(total);
  Object.values(byFeature).forEach(finalize);
  Object.values(byAgent).forEach(finalize);
  return { total, byFeature, byAgent, disclaimer: DISCLAIMER };
}

/**
 * Parse `gh api --paginate` output: one JSON array per page, concatenated.
 * Splits on top-level array boundaries, ignoring brackets inside strings.
 */
function parsePaginatedJson(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return [];
  const out = [];
  let depth = 0, start = -1, pages = 0, inString = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '[' || ch === '{') { if (depth === 0) start = i; depth += 1; }
    else if (ch === ']' || ch === '}') {
      depth -= 1;
      if (depth === 0) {
        const page = JSON.parse(text.slice(start, i + 1));
        pages += 1;
        if (Array.isArray(page)) out.push(...page);
        else out.push(page);
      }
    }
  }
  if (depth !== 0 || pages === 0) throw new Error('Malformed JSON');
  return out;
}

module.exports = { aggregateCostTokens, aggregateCostTokensByFeature, normalizeFeature, parsePaginatedJson };
