# Tasks: Per-Feature and Per-Agent LLM Cost & Token Visibility — Issue #335

Ordered by dependency. Each task follows TDD (test → implement → refactor → commit).

1. [x] **Pricing config** — Create `src/model-pricing.yml` with `gpt-4o` / `gpt-4o-mini` /
   `claude-opus-4-5` entries and an "estimates only" header comment (FR-006, FR-016).
2. [x] **Pricing loader (engine, ESM)** — Write `engine/tests/model-pricing.test.js`
   covering: valid lookup, missing file, malformed YAML, unknown model,
   zero-token invocation. Then implement `engine/orchestrator/model-pricing.js`
   (`loadPricing`, `computeUsage`) to pass (FR-007, FR-008).
3. [x] **`apm-msg` schema extension** — Extend
   `engine/tests/apm-msg-parser.test.js` with a case asserting a message
   containing a `usage` object still validates, and one asserting `usage` is
   optional (absent passes). Then add the `usage` property to
   `engine/orchestrator/schemas/apm-msg.schema.json` (FR-003, FR-004).
4. [x] **Pricing loader (GHA scripts, CJS, dependency-free)** — Implement
   `.github/scripts/model-pricing.cjs` with the same `computeUsage()` contract
   as task 2, covered by a new test requiring it directly; mirror to
   `src/.github/scripts/model-pricing.cjs` (FR-007, FR-008).
5. [x] **`dev-agent-runner.cjs` usage capture** — Extend
   `engine/tests/dev-agent-runner-tools.test.js` to assert `signal_outcome`'s
   posted comment includes a fenced ```apm-msg``` block with a `usage` object
   when the runtime reported token usage, and omits it when the API response
   has no `usage`. Implement accumulation in `runCopilot`/`runClaude` and wire
   into `signal_outcome` in `.github/scripts/dev-agent-runner.cjs`; mirror to
   `src/.github/scripts/dev-agent-runner.cjs` (FR-001, FR-002, FR-005).
6. [x] **`copilot-agent-ba.yml` usage wiring** — Pass `data.usage` from the first
   `chat/completions` step to the PR-publish step via `core.setOutput` /
   `steps.<id>.outputs`, and include the computed `usage` object in the
   `apmMsg` payload already posted; mirror to `src/.github/workflows/copilot-agent-ba.yml`
   (FR-001, FR-002, FR-003).
7. [x] **Dashboard aggregation** — Extend `engine/tests/dashboard-timeline.test.js`
   with fixtures containing `usage`-bearing and `usage`-less `apm-msg`
   comments; assert `/api/timeline/:n` response's new `costTokens` field sums
   tokens/cost per agent and per feature, marks "not tracked" invocations
   correctly, and flags partial totals. Implement `aggregateCostTokens()` and
   wire it into `engine/dashboard/server.js` (FR-009 – FR-014).
8. [x] **Dashboard UI panel** — Add the read-only "💰 Cost & Tokens" summary panel
   to the Timeline view in `engine/dashboard/index.html`, rendering
   `costTokens` from task 7, labelled as an estimate (FR-012, FR-016).
9. [x] **Security check** — Add/confirm a test asserting the `usage` object and
   `model-pricing.yml` contain no prompt/completion content (FR-015).
10. [x] **Full suite + coverage** — Run `npm test` (orchestrator) and dashboard
    tests; confirm 80% line coverage threshold still holds; run
    `markdown-link-check` on any `.md` files touched.
11. [x] **azure-openai usage capture (QA blocker 1)** — Add `recordUsage` wiring (via
    `agent-report.cjs`, replacing the removed `usageApmBlock()`) into every
    `copilot-agent-*.yml` that calls `chat/completions`; label usage
    `runtime: azure-openai` when an endpoint override is used (workflows and
    `dev-agent-runner.cjs`); mirror to `src/`; structural tests in
    `copilot-agent-usage-wiring.test.js` (FR-001, FR-002, FR-005, FR-015).
12. [x] **Cross-feature aggregation + endpoint (QA blocker 2)** — Tests then
    `aggregateCostTokensByFeature`, `normalizeFeature`, `parsePaginatedJson` in
    `engine/dashboard/cost-tokens.js`; `fetchCostOverview` + `GET /api/cost-tokens`
    in `server.js` (`dashboard-cost-overview.test.js`) (FR-009–FR-011, FR-013, FR-014).
13. [x] **Cross-feature UI** — "💰 Cost & Tokens" main-nav tab with per-feature
    and per-agent tables, partial / not-tracked indicators, and the estimate
    label (FR-012, FR-014, FR-016).
14. [x] **Open/refresh Draft PR** — Push branch, open/refresh `[WIP] 335 …` PR
    linked with `Closes #335`.
