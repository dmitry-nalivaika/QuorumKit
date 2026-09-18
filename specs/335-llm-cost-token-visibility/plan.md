# Plan: Per-Feature and Per-Agent LLM Cost & Token Visibility — Issue #335

## Constitution Check

| Rule | How this plan satisfies it |
|------|---------------------------|
| No direct commits to main | Feature branch: `335-llm-cost-token-visibility` |
| Tests before implementation | TDD per task: `engine/tests/model-pricing.test.js`, `apm-msg-parser.test.js` extension, `dashboard-timeline.test.js` extension, `dev-agent-runner-tools.test.js` extension all written before/with the code they cover |
| No hardcoded secrets | `src/model-pricing.yml` contains only $/1K-token rates, no credentials |
| Input validation at boundaries | Pricing YAML parsed defensively (malformed/missing file/model → graceful `null`, never throws); `apm-msg` `usage` object validated by JSON Schema (additive, non-breaking) |
| Data access scoping | N/A — no auth required; dashboard continues read-only access to data it already has permission to read (Constitution §IX) |
| Coverage threshold | 80% lines (existing `engine/orchestrator` vitest threshold); new modules (`model-pricing.js`) ship with dedicated unit tests covering the happy path + every graceful-degradation branch |

## Overview

Implements ADR-335: extend the existing `apm-msg` audit-comment mechanism with
an additive, optional `usage` object (token counts + estimated cost), backed
by a maintainer-editable `src/model-pricing.yml`, and surface it in the
dashboard as a read-only per-feature / per-agent rollup. No new service,
store, or external dependency.

## Scope Decision (read before implementing)

Investigation of the current codebase found that of the many
`copilot-agent-*.yml` workflows, only **`copilot-agent-ba.yml`** currently
posts a real fenced ` ```apm-msg ` JSON block from a live `chat/completions`
response, and **`.github/scripts/dev-agent-runner.cjs`** (shared by the
`copilot` and `claude` runtime kinds — see its own top-of-file comment) is
the only *shared, already-tested* runtime-adapter call site making
instrumented `chat/completions` / `/v1/messages` calls. `azure-openai` is a
**reserved, not-yet-enabled** runtime kind (`engine/orchestrator/runtime-registry.js`
`RESERVED_KINDS`); ADR-332 / issue #332's ADR file does not exist yet, and the
issue body itself says "(once implemented) Azure OpenAI runtime kind" —
confirming it is out of scope until that runtime kind ships.

Per Constitution §VII (YAGNI) this plan wires `usage` capture into the two
call sites above (the concrete "already posts apm-msg" / "already-shared
adapter" surfaces named by the ADR) rather than rewriting every per-agent
inline `actions/github-script` workflow (most of which don't post `apm-msg`
blocks at all today — a pre-existing gap orthogonal to this issue). Extending
those to the full agent-footprint protocol is tracked as follow-up, not part
of #335.

The dashboard "Cost & Tokens" view is implemented as an additive summary
panel inside the existing per-issue Timeline view (`/api/timeline/:n`
already fetches and parses every `apm-msg` comment for that issue/feature),
rather than a brand-new main-nav tab requiring a new cross-issue data source
— consistent with ADR-335 §3 ("purely a derived view over data the dashboard
already reads") and the fact no existing endpoint enumerates historical
issues across features to aggregate on my own volition would be a new
capability beyond this ADR's stated scope.

## Design

### 1. Pricing config + loader (FR-006, FR-007, FR-008)

- `src/model-pricing.yml` — new, maintainer-editable, comment-labelled
  "estimates only" (FR-016).
- `engine/orchestrator/model-pricing.js` (new, ESM) — `loadPricing(path)`,
  `computeUsage({ runtime, model, promptTokens, completionTokens, pricing })`.
  Missing file / malformed YAML / unknown model → `estimated_cost_usd: null`,
  never throws. Uses `js-yaml` (already a dependency).
- `.github/scripts/model-pricing.cjs` (new, CJS, dependency-free — no
  `package.json` exists yet under `.github/scripts`, and adding a new
  dependency there requires an ADR per Constitution §VII) mirrored to
  `src/.github/scripts/model-pricing.cjs`, same `computeUsage()` contract, a
  minimal parser scoped to the fixed two-level pricing schema.

### 2. `apm-msg` schema extension (FR-003, FR-004)

- `engine/orchestrator/schemas/apm-msg.schema.json` — add optional `usage`
  object property (`runtime`, `model`, `prompt_tokens`, `completion_tokens`,
  `total_tokens`, `estimated_cost_usd` nullable). `version` stays `"2"`.
  `additionalProperties: true` already present, so this is purely additive.

### 3. Usage capture at the two identified call sites (FR-001, FR-002, FR-005)

- `.github/workflows/copilot-agent-ba.yml` (+ `src/` mirror): the "Run BA /
  Product Agent" step's `chat/completions` response already contains
  `data.usage`; pass it via a step output to the "Push spec branch and open
  PR" step and add it to the `apmMsg` object already constructed there.
- `.github/scripts/dev-agent-runner.cjs` (+ `src/` mirror): accumulate
  `usage` across every `chat/completions` (copilot) / `/v1/messages` (claude)
  call made during the run; on `signal_outcome`, compute the `usage` object
  via `model-pricing.cjs` and append it as an additive fenced ```apm-msg```
  block to the comment already posted (existing text/marker untouched).
- If a response omits `usage` entirely, the field is omitted rather than
  fabricated (FR-005); the run still completes.

### 4. Dashboard Cost & Tokens view (FR-009 – FR-014)

- `engine/dashboard/server.js`: `parseCommentToEvent`'s `apm-msg` branch adds
  `usage: parsed.usage ?? null` to the returned event. A new pure function
  `aggregateCostTokens(events)` computes, from the same per-issue event list
  already fetched by `/api/timeline/:issueNumber`: total tracked tokens/cost
  for the feature, a per-agent breakdown, and counts of "not tracked"
  (no `usage` field) vs "partial" (`estimated_cost_usd: null`) invocations.
  Included in the existing `/api/timeline/:issueNumber` response as
  `costTokens` — no new endpoint, no new backend/database (FR-009, FR-012).
- `engine/dashboard/index.html`: within the existing Timeline view, render a
  small read-only "💰 Cost & Tokens" summary panel from `costTokens`,
  labelled as an estimate (FR-016), with a "not tracked" note when
  applicable (FR-013, FR-014).

### 5. Security (FR-015)

`usage` and `model-pricing.yml` never carry prompt/completion content —
verified by test asserting the schema/object shape contains only counts and
identifiers.

## Affected Files

| File | Action |
|------|--------|
| `src/model-pricing.yml` | New |
| `engine/orchestrator/model-pricing.js` | New |
| `engine/tests/model-pricing.test.js` | New |
| `engine/orchestrator/schemas/apm-msg.schema.json` | Add optional `usage` property |
| `engine/tests/apm-msg-parser.test.js` | Extend for `usage` passthrough |
| `.github/scripts/model-pricing.cjs` | New |
| `src/.github/scripts/model-pricing.cjs` | New (mirror) |
| `.github/scripts/dev-agent-runner.cjs` | Capture + report `usage` |
| `src/.github/scripts/dev-agent-runner.cjs` | Mirror |
| `engine/tests/dev-agent-runner-tools.test.js` | Extend for usage accumulation |
| `.github/workflows/copilot-agent-ba.yml` | Pass through + include `usage` in `apmMsg` |
| `src/.github/workflows/copilot-agent-ba.yml` | Mirror |
| `engine/dashboard/server.js` | `usage` passthrough + `aggregateCostTokens` |
| `engine/tests/dashboard-timeline.test.js` | Extend for `costTokens` aggregation |
| `engine/dashboard/index.html` | Cost & Tokens summary panel in Timeline view |

## Out of Scope (mirrors spec.md)

- Billing-grade cost, budgets/alerts, third-party LLM gateway/proxy.
- Wiring every other per-agent inline workflow (qa/security/reviewer/architect/
  triage/docs/release/…) that does not yet post `apm-msg` blocks — pre-existing
  gap, not introduced or worsened by this change.
- `azure-openai` runtime kind (not yet enabled).
- Docs Agent's `AGENT_PROTOCOL.md` update (ADR-335 Follow-Up Work item 2) and
  Security Agent's independent PII audit (item 4) — separate agent roles.
