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

module.exports = { aggregateCostTokens };
