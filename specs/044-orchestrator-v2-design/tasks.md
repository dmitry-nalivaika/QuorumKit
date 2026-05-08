# Tasks: Orchestrator v2 — Issue #44

> Plan: `specs/044-orchestrator-v2-design/plan.md`
> TDD: each task is **(T)est first → (I)mplementation → (R)efactor**.
> Tick `[x]` only when the task's tests are green and the change is committed.

Legend — `[FR-NN]` ties the task to a Functional Requirement;
`[ADR-NN §X]` ties to an Architecture Decision Record clause.

---

## Phase 0 — Plan + scaffolds

- [x] **T0.1** Author `plan.md` with Constitution Check.
- [x] **T0.2** Author this `tasks.md`.
- [x] **T0.3** Add empty test scaffolds (one file per new module) so the suite
  compiles and CI fails fast on missing implementations.

## Phase 1 — Foundations (pure modules, no GitHub I/O)

- [x] **T1.1** `schemas/apm-msg.schema.json` + tests covering required fields,
  outcome enum, per-outcome payload variants. [FR-012]
- [x] **T1.2** `apm-msg-parser.js` — extract single fenced block, JSON.parse,
  Ajv validate, redact-on-failure helper. Tests: 0 blocks, 1 valid block,
  >1 blocks, malformed JSON, schema-invalid JSON. [FR-011, FR-013]
- [x] **T1.3** `dedup-key.js` — pure switch over the ADR-007 §1 trigger table;
  fixture-payload tests for each trigger; `workflow_dispatch` returns `null`. [FR-026, ADR-007 §1]
- [x] **T1.4** `loop-budget.js` — `evaluate(state, transition, now)` returning
  `{allowed, reason?, detail?}`. Property test: monotonic in iteration count;
  unit tests for each of `edge | total | wallclock` exhaustion. [FR-004, FR-005, FR-028]
- [x] **T1.5** `runtimes/_retry.js` — bounded exponential backoff + jitter,
  configurable max attempts. Tests use a fake clock and asserts attempt count
  on 5xx/429/timeout/success. [ADR-007 §8, FR-030]
- [x] **T1.6** `redaction.test.js` — guarantees no helper serialises a value
  whose key is listed in a runtime's `credential_ref`. Establishes the secret-
  leakage invariant for the rest of the codebase. [FR-009]
- [x] **T1.7** Skeleton of `docs/AGENT_PROTOCOL.md` listing the document's
  required sections (labels, outcomes, transitions, etiquette, examples) with
  the v1 labels and outcomes already in use by the codebase. [FR-014]

## Phase 2 — v2 pipeline schema + semantic validator + CLI

- [x] **T2.1** Update `schemas/pipeline.schema.json` — add `schema_version`
  enum `["1","2"]`; v2 introduces `entry`, `transitions`, `loop_budget`,
  per-step `runtime`, per-step `timeout_minutes`. Tests: each schema rule. [FR-002, FR-003, FR-004]
- [x] **T2.2** `pipeline-validator.js` — pure semantic validator. Defects:
  unreachable steps, undeclared runtime, undeclared label/outcome,
  backward edge without `loop_budget`, `step.timeout_minutes >
  dispatched_workflow.timeout-minutes`. Each defect a separate test. [FR-006, FR-020, FR-028]
- [x] **T2.3** `pipeline-loader.js` — read `schema_version`; route to v1
  adapter or v2 normaliser; both produce the unified internal `Pipeline`
  graph form. Tests: existing v1 fixture still loads; new v2 fixture loads
  with backward edges. [FR-002, US-7]
- [x] **T2.4** `pipeline-validator-cli.js` — exits non-zero with one error per
  defect; accepts a file or directory. Snapshot tests. [FR-020]
- [x] **T2.5** Add `regulation-lint.js` — parses `docs/AGENT_PROTOCOL.md` into
  label/outcome sets; cross-checks pipelines + orchestrator source. Tests: the
  shipped pipelines + source pass clean; a contrived pipeline using an
  undeclared label is rejected. [FR-014, FR-024]

## Phase 3 — Runtime registry + adapters

- [x] **T3.1** `schemas/runtimes.schema.json` + Ajv tests. [FR-007]
- [x] **T3.2** `runtime-registry.js` — load `.apm/runtimes.yml`, validate
  against schema, enforce **kind allowlist** (`claude`, `copilot` only;
  reserved kinds → `RUNTIME_KIND_NOT_ENABLED`). Tests for each rejection. [FR-007, ADR-005]
- [x] **T3.3** `runtime-registry.js` — runtime-resolution precedence:
  step-level → agent-level default → project-level default →
  `runtime-unresolved`. Tests for each precedence step. [FR-008]
- [x] **T3.4** `runtimes/claude.js` — adapter wrapping the existing
  `agent-${slug}.yml` dispatch. Exports `requiredPermissions` + `invoke`.
  Tests use a fake GitHub client. [ADR-005, ADR-007 §7]
- [x] **T3.5** `runtimes/copilot.js` — adapter wrapping the existing
  `copilot-agent-${slug}.yml` dispatch. Same test scaffold. [ADR-005, ADR-007 §7]
- [x] **T3.6** Credential resolution — `credential_ref` resolved from
  `process.env`; missing → `runtime-credential-missing` step failure;
  audit comment names the *reference*, never the value. Tests cover both. [FR-009]
- [x] **T3.7** `agent-invoker.js` refactor — looks up runtime via registry,
  delegates to `runtimes/<kind>.js#invoke`, wraps the call in `_retry.js`,
  records `runtime_retries` on the audit payload, surfaces `runtime-error` on
  retry exhaustion (distinct from `protocol-violation`). [FR-010, FR-030]

## Phase 4 — Two-channel state + identity registry + new router

- [x] **T4.1** `schemas/agent-identities.schema.json` +
  `identity-registry.js`. Tests: known login → agent slug; unknown login →
  ignored; many-to-one mapping honoured. [FR-013]
- [x] **T4.2** `state-manager.js` refactor — keep audit channel append-only
  (compatible with v1); add `liveStatus.upsert(client, runId, body)` that
  PATCHes the single `apm-pipeline-status` comment per ADR-004 locator
  algorithm; recreate-on-corruption test. [FR-015, FR-017, ADR-004]
- [x] **T4.3** `state-manager.js` — extend audit payload with `dedup_key`,
  `iterations` (per-edge map), `runtime_used`, `outcome`,
  optional `runtime_retries`. Tests: v1 payloads still parse. [FR-026, FR-022]
- [x] **T4.4** `state-manager.js` — `findDedupKeyHit` over last 200 audit
  comments; older entries pruned by wallclock window. Tests cover both. [FR-016, ADR-007 §1]
- [x] **T4.5** `router.js` refactor — outcome→step graph traversal; loop
  iteration counters; backward-edge detection drives `loop-budget.evaluate`. [FR-003, FR-004]
- [x] **T4.6** `apm-msg` ingest path — comment-author lookup via identity
  registry; reject non-agent authors with audit `protocol-ignored:
  non-agent-author`; reject zero/multi/invalid `apm-msg` blocks with
  `protocol-violation`. [FR-011, FR-013]
- [x] **T4.7** `timeline-reconstructor.js` — given an issue's audit comments,
  rebuild the deterministic run timeline (trigger, steps, runtimes, iterations,
  outcomes, final status). Test: round-trip a fixture issue thread. [FR-022]

## Phase 5 — Loop-aware orchestrator dispatch + dashboard payload

- [x] **T5.1** `index.js` rewire — single `runOrchestrator` handles both v1
  (degenerate graph) and v2 (full graph) uniformly. v1 regression test:
  existing `feature-pipeline.yml` runs end-to-end unchanged. [US-7, FR-025]
- [x] **T5.2** Approval gate path preserved through the v2 dispatcher. Test:
  v1 release-pipeline `approval: required` behaviour byte-identical. [FR-018]
- [x] **T5.3** Per-step timeout enforcement (default 60 min) → on timeout
  follow `on_outcome.timeout` if declared, else terminate run with
  `step-timeout`. Test: fixture step with no timeout transition. [FR-019]
- [x] **T5.4** Loop-budget exhaustion path — terminate with
  `loop-budget-exceeded`, post a single audit comment listing the iteration
  history, apply label `status:needs-human`. Worked-example test asserting
  the iteration counter rolls over to budget+1 on the failing edge. [FR-005]
- [x] **T5.5** Dashboard webhook payload — include loop edge identifier and
  iteration count and runtime name per step. Test asserts the payload shape.
  Absence of webhook URL silently skipped (existing behaviour preserved). [FR-021, US-9]

## Phase 6 — CI gates + concurrency + workflow self-failure feedback

- [x] **T6.1** `scripts/verify-mirror.sh` (new or extend) — fails on stale
  `.github/instructions/<agent>.instructions.md` vs `.apm/agents/<agent>.md`. [ADR-006]
- [x] **T6.2** `quality.yml` — add four jobs (`pipeline-validator`,
  `verify-mirror`, `orchestrator-tests`, `regulation-lint`). [FR-029, ADR-007 §5]
- [x] **T6.3** `quality-check.sh` gate **#14** — every shipped agent workflow
  declares an explicit `timeout-minutes:`. [FR-028, ADR-007 §4]
- [x] **T6.4** Orchestrator workflow `concurrency:` block keyed on
  issue/PR number, `cancel-in-progress: false`. Same for `alert-to-issue.yml`. [FR-027, ADR-007 §2]
- [x] **T6.5** Orchestrator workflow self-failure feedback — outer
  `continue-on-error` step posts `outcome: orchestrator-failure` audit
  comment with Actions-run link on inner failure. Test exercises with a
  thrown error inside a fake invocation. [FR-029, ADR-007 §6]

## Phase 7 — Cutover + worked example + handoff

- [x] **T7.1** Ship `.apm/runtimes.yml`, `.apm/agent-identities.yml`,
  `.apm/pipelines/feature-pipeline-v2.yml` (the BA→DEV→QA→…→RELEASE worked
  loop) as zero-config defaults per Constitution §V. [FR-007, FR-014]
- [x] **T7.2** End-to-end fixture test executing the worked example loop:
  `BA → DEV → QA → DEV → QA → DEV → BA → DEV → QA → REVIEWER → RELEASE`
  driven entirely by simulated `apm-msg` outcomes. [Spec Success Criteria #1]
- [x] **T7.3** Same fixture, budgets reduced → terminates with
  `loop-budget-exceeded`, history posted, label applied. [Success Criteria #2]
- [x] **T7.4** Three-runtime fixture — three different runtimes used by three
  different agents in one run; timeline records runtime per step.
  [Success Criteria #4]
- [x] **T7.5** Validator scenario tests — every defect class catches:
  unreachable step, missing runtime, undeclared label, missing loop budget,
  malformed `apm-msg` reference. [Success Criteria #5]
- [x] **T7.6** Duplicate-delivery test — same delivery ID twice → exactly
  one transition. Concurrent-delivery test — two webhooks within 1 s on the
  same issue → exactly one transition (ADR-007 §2 concurrency + FR-026 dedup
  combined). [Success Criteria #7 and #12]
- [x] **T7.7** v1 pipeline file (no `schema_version`) executes unchanged
  through the v2 dispatcher. [Success Criteria #8]
- [x] **T7.8** Reviewer Agent + Triage Agent + DevOps Agent instruction file
  updates: BLOCKER on undocumented identifier additions; new label taxonomy;
  required-status-checks documented. [FR-024]
- [x] **T7.9** Update `.specify/feature.json` (`status: pr-open`) and open
  PR referencing this spec, plan, ADR-004 / ADR-005 / ADR-006 / ADR-007, and
  the worked-example issue link.
- [x] **T7.10** Verify the handoff checklist from `.github/agents/developer-agent.md`
  is fully ticked, then announce readiness for `/reviewer-agent` and `/qa-agent`.

---

## Definition of done (whole feature)

- All tasks ticked.
- `cd scripts/orchestrator && npm test` — green, coverage ≥ targets in `plan.md`.
- `node scripts/orchestrator/pipeline-validator-cli.js .apm/pipelines/` — exit 0.
- `node scripts/orchestrator/regulation-lint.js` — exit 0.
- `bash scripts/verify-mirror.sh` — exit 0.
- `bash scripts/quality-check.sh` — exit 0.
- Worked-example GitHub issue posted, with the full audit + live-status thread
  visible. Link in PR body.
- PR uses `.github/pull_request_template.md`. Branch: `044-orchestrator-v2-design`.
