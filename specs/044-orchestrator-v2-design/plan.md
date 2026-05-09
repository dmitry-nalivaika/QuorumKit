# Plan: Orchestrator v2 — Pluggable Runtimes, SDLC Loops & Agent Message Protocol — Issue #44

> Spec: `specs/044-orchestrator-v2-design/spec.md`
> Branch: `044-orchestrator-v2-design`
> ADRs honoured: ADR-004 (state comments), ADR-005 (runtime registry interface),
> ADR-006 (`.apm/` SoT + mirror), ADR-007 (GitHub Actions substrate contract).

---

## Constitution Check

| Rule | How this plan satisfies it |
|------|---------------------------|
| No direct commits to `main` | All work on feature branch `044-orchestrator-v2-design`; PR opened only when phase exit criteria pass. |
| Tests before implementation | Every task in `tasks.md` ships its test first (red), then implementation (green), then refactor. Vitest suite `tests/orchestrator/**` is the gate. |
| No hardcoded secrets | Runtime registry stores `credential_ref` *names* only; resolution is via `process.env` / `${{ secrets.* }}` at invocation time (FR-009). The orchestrator MUST NEVER write a secret value to a comment, log, or audit entry — enforced by a redaction unit test in `tests/orchestrator/redaction.test.js`. |
| Input validation at boundaries | Boundaries: (1) pipeline YAML loader (Ajv against v2 JSON schema + semantic validator for unreachable steps, undeclared identifiers, missing loop budgets); (2) runtime registry loader (Ajv + kind-allowlist check); (3) agent comment ingest (`apm-msg` parser validates author identity, exactly-one fenced block, schema, expected agent for current step); (4) `/approve` comment handler (permission level checked via GitHub API). |
| Data access scoping | N/A — QuorumKit handles no PII; no per-user authorisation surface. Orchestrator runs under `GITHUB_TOKEN` with least-privilege scopes per ADR-007 §7 (per-adapter `requiredPermissions` union). |
| Coverage threshold | Constitution does not pin a numeric threshold. This plan targets **≥ 90 % statements / ≥ 85 % branches** on `scripts/orchestrator/**` (pure logic, no live GitHub). FR-023 enumerates the mandatory scenarios; each maps 1:1 to a test file listed in `tasks.md`. |

No spec-vs-constitution conflicts. Open `[PLAN]` items from the spec are
resolved below.

---

## Resolved `[PLAN]` items from spec

| Item | Decision | Rationale |
|------|----------|-----------|
| `loop_budget.max_iterations_per_edge` default | **3** | ADR-007 recommendation; matches the worked example in spec Success Criteria. |
| `loop_budget.max_total_steps` default | **30** | ADR-007 recommendation; ~10× the worked-example length, leaves head-room. |
| `loop_budget.max_wallclock_minutes` default | **720** (12 h) | ADR-007 recommendation; thread-spanning measurement per FR-028, NOT a per-job cap. |
| Idempotency cache bound | **Last 200 audit comments OR `max_wallclock_minutes` window, whichever first** | Architect recommendation; matches ADR-007 §1 ("default N = 200"). Implemented in `state-manager.js#findDedupKey`. |
| Per-step default `timeout_minutes` | **60** | ADR-007 §4. |
| Default approval gate timeout | **72 h** | Preserved from v1. |

---

## Architecture Overview

### Module map (additions and refactors)

```
scripts/orchestrator/
├── index.js                       # REFAC — v1+v2 dispatcher; single runOrchestrator
├── pipeline-loader.js             # REFAC — schema v1 → adapter; schema v2 → semantic validate
├── pipeline-validator.js          # NEW — pure semantic validator (offline-runnable)
├── pipeline-validator-cli.js      # NEW — `node pipeline-validator-cli.js <path>` for FR-020 / CI
├── router.js                      # REFAC — outcome→step transitions, loop counters
├── state-manager.js               # REFAC — two-channel: append audit + edit live-status (ADR-004)
├── agent-invoker.js               # REFAC — resolves runtime, delegates to runtime adapter
├── approval-gate.js               # UNCHANGED behaviour (preserved for v1 + v2)
├── github-client.js               # ADD — updateComment(), repositoryDispatch(), event delivery hash
├── apm-msg-parser.js              # NEW — fenced-block extractor + schema validator + redaction
├── identity-registry.js           # NEW — load .apm/agent-identities.yml; map login → agent slug
├── runtime-registry.js            # NEW — load .apm/runtimes.yml; resolve precedence; validate kinds
├── loop-budget.js                 # NEW — pure budget arithmetic and exhaustion detection
├── dedup-key.js                   # NEW — ADR-007 §1 per-trigger formulas
├── timeline-reconstructor.js      # NEW — rebuild RunTimeline from audit comments alone
├── runtimes/
│   ├── _retry.js                  # NEW — bounded backoff helper (ADR-007 §8)
│   ├── claude.js                  # NEW — ports v1 dispatch behaviour to adapter interface
│   └── copilot.js                 # NEW — ports v1 dispatch behaviour to adapter interface
└── schemas/
    ├── pipeline.schema.json       # REFAC — schema_version: "1" | "2"; adds graph form
    ├── runtimes.schema.json       # NEW
    ├── agent-identities.schema.json # NEW
    └── apm-msg.schema.json        # NEW — version, runId, step, agent, iteration, outcome, summary, payload

tests/orchestrator/                # +1 file per new module + scenario tests for FR-023
docs/AGENT_PROTOCOL.md             # NEW — single source for labels, outcomes, transitions
.apm/runtimes.yml                  # NEW — ships with `claude` + `copilot` runtimes
.apm/agent-identities.yml          # NEW — ships with default copilot/claude bot mappings
.apm/pipelines/feature-pipeline-v2.yml  # NEW — worked example with loop edges
scripts/verify-mirror.sh           # NEW (or extend existing) — ADR-006 CI gate
.github/workflows/quality.yml      # REFAC — adds pipeline-validator, regulation-lint, verify-mirror jobs
```

### Backward compatibility (US-7, FR-002)

`pipeline-loader.js` reads `schema_version` (default `"1"` if absent) and routes
to one of two normalisers. Both produce the **same internal `Pipeline`
representation** — a graph of `{steps, transitions, loop_budget}` — so the rest
of the orchestrator (router, state-manager, invoker) is schema-agnostic. v1
files become a degenerate forward-only graph with `transitions: [{from: stepN,
outcome: "success", to: stepN+1}]` and `loop_budget.max_iterations_per_edge: 0`.

### Two-channel state (ADR-004, FR-015)

- **Audit channel** — existing `<!-- apm-pipeline-state: {…} -->` shape, new
  fields: `dedup_key`, `iterations` (per-edge map), `runtime_used`,
  `outcome`, `runtime_retries?`. **v1 runs use audit channel only.**
- **Live-status channel** — new `<!-- apm-pipeline-status: {"runId":"<uuid>"} -->`
  marker; PATCH on every transition; locator algorithm per ADR-004; recreated
  from audit on corruption. **v2 runs only.**

### Concurrency (ADR-007 §2)

Orchestrator workflow gets a `concurrency:` block keyed on the issue/PR number
with `cancel-in-progress: false`. This is a workflow-file change (not code), but
is a *required* part of the v2 contract and is owned by this plan.

### Runtime adapter contract (ADR-005 §Interface)

```js
// scripts/orchestrator/runtimes/<kind>.js
export const requiredPermissions = { issues: 'write', actions: 'write', /* … */ };
export async function invoke(context) { /* … */ }
//   context = { runtime, agent, owner, repo, issueNumber, ref, runId, step, iteration }
//   resolves credentials from process.env via runtime.credential_ref (name only)
//   wraps the underlying call in _retry.js
//   returns { dispatched: true } — outcome arrives later via workflow_run.completed
```

The orchestrator core never imports a `runtimes/<kind>.js` module by name; it
loads `runtimes/${runtime.kind}.js` dynamically after the kind-allowlist check.

### `apm-msg` protocol (FR-011, FR-012, FR-013)

Format:

````markdown
…free-form prose…

```apm-msg
{
  "version": "2",
  "runId": "<uuid>",
  "step": "qa",
  "agent": "qa-agent",
  "iteration": 2,
  "outcome": "fail",
  "summary": "3 of 47 acceptance scenarios failed; details in PR #N comment.",
  "payload": { "failed_scenarios": ["AS-12", "AS-19", "AS-31"] }
}
```
````

Parser rules (`apm-msg-parser.js`):
1. Extract every fenced block tagged exactly `apm-msg`.
2. Reject if count ≠ 1.
3. JSON.parse + Ajv against `apm-msg.schema.json`.
4. Reject if `runId` ≠ active run, `agent` ≠ expected agent for current step,
   or `iteration` ≠ active iteration counter.
5. Verify the comment author is in the identity registry and maps to the
   expected agent.
6. On any failure: redact the offending block to its first 200 chars and post
   a `protocol-violation` audit comment.

### Loop budget enforcement (FR-004, FR-005, FR-028)

- Pure module `loop-budget.js` with `evaluate(state, transition, now)` →
  `{ allowed: true } | { allowed: false, reason: 'edge'|'total'|'wallclock', detail: {…} }`.
- Budget defaults injected from spec; per-pipeline override allowed.
- Wallclock baseline is the `created_at` of the **first audit comment**, read
  by `state-manager.getRunStartedAt()`.

### Dedup (FR-016, FR-026, ADR-007 §1)

- `dedup-key.js` exports one pure function `computeDedupKey(eventName, payload)`
  switching on the trigger table from ADR-007.
- `state-manager.findDedupKeyHit(comments, key)` scans the most recent 200
  audit comments for `payload.dedup_key === key`.
- `workflow_dispatch` is exempt (operator intent).

### Regulation document (FR-014, FR-024, ADR-006 §5)

- `docs/AGENT_PROTOCOL.md` — single human-authored source of:
  - All `agent:*`, `status:*`, `loop:*`, `gate:*` labels (name, applier, effect).
  - All `apm-msg` outcomes (enum) with per-outcome payload schema link.
  - All transition triggers (event name → matched pipelines).
  - Comment etiquette (live-status vs audit vs agent comments).
  - Compliant vs non-compliant `apm-msg` examples.
- `regulation-lint.js` (new) parses the markdown into label/outcome sets, then:
  - Refuses any pipeline YAML that references identifiers not declared.
  - Refuses any orchestrator source line matching a label/outcome regex that is
    not in the document.
- Reviewer Agent gets a checklist item (instructions update) to BLOCKER any PR
  adding identifiers without doc updates (FR-024).

### Source-of-truth + mirror (ADR-006)

- `.apm/runtimes.yml`, `.apm/agent-identities.yml`, `.apm/pipelines/*.yml` are
  authoritative. Orchestrator reads them directly under both runtimes.
- `docs/AGENT_PROTOCOL.md` is the authoritative regulation; not mirrored.
- `scripts/verify-mirror.sh` (new) checks that
  `.github/instructions/<agent>.instructions.md` is in sync with
  `.apm/agents/<agent>.md` and exits non-zero on drift; printed diff is the
  PR-comment material.

### Substrate-level CI (ADR-007 §5, FR-029)

`quality.yml` gains four jobs that become required status checks on `main`:

| Job | Command |
|---|---|
| `pipeline-validator` | `node scripts/orchestrator/pipeline-validator-cli.js .apm/pipelines/` |
| `verify-mirror` | `bash scripts/verify-mirror.sh` |
| `orchestrator-tests` | `cd scripts/orchestrator && npm test` |
| `regulation-lint` | `node scripts/orchestrator/regulation-lint.js` |

Plus the orchestrator workflow gains a `continue-on-error` outer guard that
posts an `outcome: orchestrator-failure` audit comment + Actions-run link on
uncaught failure (FR-029, ADR-007 §6).

---

## Phasing

The work is decomposed into seven phases, ordered so each is independently
mergeable behind the v1 orchestrator (no big-bang flip).

| # | Phase | Exit criteria |
|---|-------|---------------|
| 0 | **Plan + scaffolds** (this document, `tasks.md`, empty test files) | Plan reviewed; tasks decomposed; CI green. |
| 1 | **Foundations** — `apm-msg` parser, schema files, regulation document skeleton, dedup-key module, loop-budget module, `runtimes/_retry.js` | All new modules unit-tested; no production wiring yet. |
| 2 | **v2 pipeline schema + semantic validator + CLI** (FR-002 – FR-006, FR-020) | `pipeline-validator-cli` rejects all defects in FR-006; v1 files still load via adapter. |
| 3 | **Runtime registry + adapters** (FR-007 – FR-010, ADR-005, ADR-007 §7/§8) | `claude` + `copilot` adapters port v1 behaviour through the new interface; reserved kinds rejected with the prescribed error. |
| 4 | **Two-channel state + identity registry + new router** (FR-011 – FR-017, ADR-004) | v2 run on a fixture pipeline produces exactly one live-status comment + N audit comments, recoverable from audit alone. |
| 5 | **Loop-aware orchestrator dispatch + dashboard payload** (FR-018 – FR-022, US-9) | Worked example loop runs to budget exhaustion; dashboard payload includes loop iteration + runtime per step. |
| 6 | **CI gates + concurrency + workflow self-failure feedback** (FR-027, FR-029, ADR-007 §5/§6) | Required status checks land; orchestrator workflow concurrency block in place; failure feedback test fixture passes. |
| 7 | **Cutover + worked example issue + Reviewer/QA handoff** | All Success Criteria items in `spec.md` demonstrated; v1 pipelines exercised end-to-end with no regression. |

Each phase ends with a green test suite and an updated `tasks.md` checklist. PR
is opened **after Phase 7 only**, per role hard constraint #2 ("MUST NOT open a
PR while any test is failing"). However, the test suite must be green at the
end of every phase; failing tests inside a phase block progress.

---

## Risk register

| Risk | Mitigation |
|------|------------|
| Spec → code drift on `apm-msg` schema | Single source: `apm-msg.schema.json`; regulation document references it; tests assert spec-text examples parse. |
| Loop-budget infinite recursion if defaults misread | `loop-budget.js` is pure and has a property-based test asserting `evaluate` is monotonic in iteration count. |
| Live-status PATCH race | Closed at substrate level by ADR-007 §2 concurrency block; application-level dedup is defence-in-depth, not primary. |
| v1 backward compatibility regression | A dedicated test executes the existing `feature-pipeline.yml` byte-for-byte through the v2 dispatcher. |
| Reserved-kind bypass via local fork | Acknowledged in ADR-005; upstream invariant is the validator + Reviewer BLOCKER on allowlist edits without ADR. |
| Secret leakage via comment | `redaction.test.js` asserts that no log/comment helper ever serialises a value matching an env var listed by the runtime adapter. |
| GitHub API context fields renamed | Dedup-key formulas covered by fixture-payload tests in `tests/orchestrator/fixtures/`. |
| Mirror drift between `.apm/` and `.github/instructions/` | `verify-mirror.sh` is a required status check (ADR-006). |

---

## Out of scope (explicitly)

Everything listed under spec § "Out of Scope" remains out of scope. Notably:
graphical pipeline editor, multi-repo coordination, non-GitHub SCM, write-capable
dashboard, automatic regulation generation, token-streamed agent output.

---

## Handoff exit (for `/reviewer-agent` and `/qa-agent`)

The PR opened at the end of Phase 7 will state:

- All tasks in `tasks.md` complete.
- `npm test` (under `scripts/orchestrator/`) green; coverage ≥ targets.
- `pipeline-validator-cli` green against `.apm/pipelines/`.
- `regulation-lint` green.
- `verify-mirror` green.
- Worked-example issue link demonstrating the spec's Success Criteria.
- ADRs referenced in the PR body (ADR-004, ADR-005, ADR-006, ADR-007).
