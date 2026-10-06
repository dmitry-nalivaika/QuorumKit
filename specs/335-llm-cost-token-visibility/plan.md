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

`azure-openai` was enabled by ADR-332 (it is no longer in
`runtime-registry.js` `RESERVED_KINDS`). Its adapter dispatches the same
`copilot-agent-<slug>.yml` workflow family as the `copilot` kind, passing
`runtime_endpoint` / `runtime_model` inputs, so usage capture for
`azure-openai` is implemented at those shared call sites:

- `.github/scripts/dev-agent-runner.cjs` (dev agent; `copilot` / `claude` / `azure-openai`).
- Every `copilot-agent-*.yml` workflow that performs a `chat/completions` call
  (`ba`, `ba-enrich`, `architect`, `qa`, `reviewer`, `security`, `triage`,
  `docs`, `release`, `tech-debt`). Each calls `report.recordUsage(...)` after
  the model response; the totals are published as the `usage` step output and
  the final `agent-report.cjs` step (#378) adds them to the one `apm-msg` block
  it posts. That block is schema-valid (`runId`, `iteration`, `outcome`,
  `event_type`), so the orchestrator treats it like any other agent message.
  An earlier design appended a separate usage-only block built by
  `usageApmBlock()`; it was removed because it failed schema validation
  (reviewer B1).

`usage.runtime` is the resolved runtime entry name (`azure-openai` when an
endpoint override is in use). The dashboard only counts comments authored by a
bot or a repo OWNER, MEMBER or COLLABORATOR, so a pasted block cannot forge
totals.

The dashboard "Cost & Tokens" view is both a summary panel in the per-issue
Timeline and a main-nav tab backed by `GET /api/cost-tokens`, which reads the
repo-wide `issues/comments` list (one read-only `gh api` call, filtered to
comments containing an `apm-msg` block) for a bounded window (`days`, default
90, max 365). Features are grouped by the block's `issue` / `pipeline_id`,
falling back to the comment's issue number. No new backend, store, or write
path is introduced.

Known limits: `release` / `tech-debt` / `docs` (no-issue path) post report
issues, whose bodies the dashboard does not read, so their usage is auditable
in GitHub but not aggregated. `init.sh` installs `src/model-pricing.yml` into
consumer repos (never overwriting a maintainer-edited copy).

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

### 3. Usage capture at the shared call sites (FR-001, FR-002, FR-005)

- `.github/workflows/copilot-agent-ba.yml` (+ `src/` mirror): the "Run BA /
  Product Agent" step's `chat/completions` response already contains
  `data.usage`; pass it via a step output to the "Push spec branch and open
  PR" step and add it to the `apmMsg` object already constructed there.
- `.github/scripts/dev-agent-runner.cjs` (+ `src/` mirror): accumulate
  `usage` across every `chat/completions` (copilot) / `/v1/messages` (claude)
  call made during the run; on `signal_outcome`, compute the `usage` object
  via `model-pricing.cjs` and append it as an additive fenced ```apm-msg```
  block to the comment already posted (existing text/marker untouched).
- Every other `copilot-agent-*.yml` workflow (azure-openai-capable): call
  `report.recordUsage({ response, model, runtime })` after each model call; the
  final reporter step adds the totals to its `apm-msg` block. No usage on the
  response means no `usage` field (FR-005); it never throws.
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
| `engine/tests/dev-agent-runner-usage.test.js` | New — usage accumulation + apm-msg block |
| `.github/workflows/copilot-agent-ba.yml` | Pass through + include `usage` in `apmMsg` |
| `src/.github/workflows/copilot-agent-ba.yml` | Mirror |
| `engine/tests/copilot-agent-ba-usage.test.js` | New — structural wiring + mirror parity |
| `engine/dashboard/cost-tokens.js` | New — pure `aggregateCostTokens` (server.js listens on load, so not testable in place) |
| `engine/dashboard/server.js` | `usage` passthrough + `costTokens` in timeline response |
| `engine/tests/cost-tokens.test.js`, `dashboard-cost-tokens.test.js` | New — aggregation unit + end-to-end |
| `engine/dashboard/index.html` | Cost & Tokens summary panel in Timeline view + main-nav Cost & Tokens tab |
| `engine/tests/dashboard-cost-panel.test.js` | New — structural + read-only checks (panel and tab) |
| `.github/scripts/model-pricing.cjs` (+ `src/` mirror) | `tokensFromResponse`, `usageFromResponse`, `normalizeUsage` helpers |
| `.github/workflows/copilot-agent-{architect,qa,reviewer,security,triage,docs,release,tech-debt,ba-enrich}.yml` (+ `src/` mirrors, except `ba-enrich`) | Call `report.recordUsage(...)`; pass `USAGE` to the final reporter step |
| `engine/tests/copilot-agent-usage-wiring.test.js` | New — structural wiring + mirror parity + runtime labels |
| `engine/dashboard/cost-tokens.js`, `server.js` | Cross-feature aggregation + `GET /api/cost-tokens` |
| `engine/tests/dashboard-cost-overview.test.js` | New — end-to-end `/api/cost-tokens` |
| `src/scripts/init.sh`, `scripts/test-external-install.sh` | Install `src/model-pricing.yml`, `src/runtimes.yml` and `src/agent-identities.yml` for consumers; assert install + re-run safety |

## Out of Scope (mirrors spec.md)

- Billing-grade cost, budgets/alerts, third-party LLM gateway/proxy.
- Changing the reporting protocol itself; usage only adds an optional field to
  the block `agent-report.cjs` already posts.
- Docs Agent's `AGENT_PROTOCOL.md` update (ADR-335 Follow-Up Work item 2) and
  Security Agent's independent PII audit (item 4) — separate agent roles.
