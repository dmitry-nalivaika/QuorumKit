# ADR-007: Orchestrator v2 — GitHub Actions Execution Substrate Contract

| Field | Value |
|---|---|
| **ADR Number** | 007 |
| **Issue** | #44 — Orchestrator v2 Design |
| **Status** | Accepted |
| **Date** | 2026-05-08 |
| **Deciders** | DevOps Agent, Architect Agent |
| **Supersedes** | — |
| **Related** | ADR-004 (state comment model), ADR-005 (runtime registry), ADR-006 (SoT + mirror) |

---

## Context

Spec #44 defines the v2 orchestrator at the protocol layer (pipelines, runtimes,
`apm-msg`, audit comments, loop budgets) and explicitly preserves GitHub Actions
as the execution substrate (Assumptions §2, FR-001, FR-021). It does not,
however, specify the **substrate-level contract** — how the protocol guarantees
hold up against the realities of how GitHub Actions delivers events, scopes
permissions, caps job duration, and races on concurrent workflow runs.

Three concrete substrate hazards are unaddressed:

1. **Dedup key (FR-016).** The spec requires per-delivery idempotency, but the
   GitHub Actions context does **not** expose `X-GitHub-Delivery`. Implementers
   would invent their own key — likely incorrectly.
2. **Concurrent live-status PATCH (ADR-004 §Risks).** ADR-004 acknowledges the
   race but mitigates with FR-016 dedup. FR-016 dedup runs *inside one workflow
   process*; two parallel webhook deliveries spawn two independent processes,
   so application-level dedup cannot prevent the PATCH race.
3. **Wallclock budget vs job cap.** `loop_budget.max_wallclock_minutes` defaults
   discussed in spec `[PLAN]` (720 minutes) exceed the GitHub Actions per-job
   cap of 360 minutes. Implementers will assume one long-running job.

A spec-level FR cluster plus this ADR makes the substrate contract explicit and
testable.

---

## Decision

The orchestrator v2 binds the protocol to the GitHub Actions substrate via the
following frozen contract.

### 1. Event dedup key (resolves FR-016 ambiguity)

The orchestrator computes a deterministic dedup key per inbound event using
fields available in `github.event`. The key is persisted in the audit comment
stream (an `apm-pipeline-state` payload field, `dedup_key`). On every event the
orchestrator checks the most recent N audit comments (default N = 200) for a
matching key and exits silently on hit.

| Trigger | Dedup key formula |
|---|---|
| `issues` (opened, labeled) | `issues:${issue.number}:${action}:${issue.updated_at}` |
| `issue_comment` (created) | `issue_comment:${issue.number}:${comment.id}` |
| `pull_request` (opened, labeled, synchronize) | `pr:${pull_request.number}:${action}:${pull_request.updated_at}` |
| `pull_request_review_comment` (created) | `pr_review_comment:${pull_request.number}:${comment.id}` |
| `workflow_run` (completed) | `workflow_run:${workflow_run.id}:${workflow_run.conclusion}` |
| `repository_dispatch` (alerts, /approve) | `repo_dispatch:${event_type}:${client_payload.dedup_id || sha256(payload)}` |
| `workflow_dispatch` (manual replay) | NEVER deduplicated (operator intent) |

Rationale: comment IDs are globally unique and immutable; for events without a
stable child ID, `(parent_id, action, updated_at)` is collision-free in practice
because GitHub's `updated_at` is monotonic per resource.

### 2. Workflow-level concurrency (resolves ADR-004 race)

The orchestrator workflow MUST declare:

```yaml
concurrency:
  group: apm-orchestrator-${{ github.event.issue.number || github.event.pull_request.number || github.event.workflow_run.id || github.run_id }}
  cancel-in-progress: false
```

This serialises all orchestrator runs **per issue/PR**, eliminating the
live-status PATCH race named in ADR-004. `cancel-in-progress: false` preserves
queued events (we never silently drop a transition).

The `alert-to-issue.yml` workflow MUST also declare a concurrency group keyed on
`group: alert-${{ github.event.client_payload.title }}` with
`cancel-in-progress: false` to deduplicate alert storms while preserving every
unique alert.

### 3. Wallclock semantics (resolves [PLAN] open item)

`loop_budget.max_wallclock_minutes` is measured **across the whole pipeline run
on the issue thread**, computed as `(now - first audit comment created_at)`. It
is **not** the per-job `timeout-minutes`. The orchestrator is a sequence of
short event-driven workflow runs; a 720-minute pipeline can span dozens of
sub-360-minute jobs.

Recommended defaults (final values to be confirmed in `plan.md`):
- `max_iterations_per_edge`: 3
- `max_total_steps`: 30
- `max_wallclock_minutes`: 720 (= 12 h)

### 4. Per-step timeout invariant (resolves [PLAN] open item)

The validator MUST enforce `step.timeout_minutes ≤ dispatched_workflow.timeout-minutes`
for every step. The orchestrator MUST also reject at runtime any step whose
agent workflow declares no `timeout-minutes:` (treating it as the GitHub
default of 360 minutes for the comparison). Default per-step timeout: 60 minutes.

Every shipped agent workflow under `templates/github/workflows/copilot-agent-*.yml`
and `.apm/workflows/agent-*.yml` MUST declare an explicit `timeout-minutes:` on
its job(s). This is enforced by `quality-check.sh` gate **#14** (added below).

### 5. Required CI status checks

The following jobs MUST be configured as required status checks on `main`
before the v2 orchestrator is enabled:

| Job | Workflow | Purpose |
|---|---|---|
| `pipeline-validator` | `quality.yml` | FR-020 — block invalid pipelines |
| `verify-mirror` | `quality.yml` | ADR-006 — block stale Copilot mirror |
| `orchestrator-tests` | `quality.yml` | FR-023 — block regressions in routing/dedup/loop-budget |
| `regulation-lint` | `quality.yml` | FR-014 — block undeclared labels/outcomes |

Without these as **required** status checks, the gates are advisory and the
spec's contracts are unenforced.

### 6. Workflow-failure feedback loop

If the orchestrator workflow itself fails (uncaught exception, runtime API
outage, rate-limit), the failure MUST surface as a comment on the triggering
issue/PR (or, for non-issue triggers, via the `alert-to-issue.yml` mechanism).
A failed orchestrator run that posts no comment violates Constitution §VI
(silent failures prohibited).

Implementation: a `continue-on-error` outer step that captures the inner job
status and posts an audit comment with `outcome: orchestrator-failure` plus a
link to the failed run.

### 7. Least-privilege per runtime adapter

The `models: read` permission is required only for runtime kinds that call
GitHub Models (`copilot`). Other kinds MUST NOT request scopes they don't
consume. Each `runtimes/<kind>.js` adapter MUST export a static
`requiredPermissions` map; the orchestrator MUST union only the permissions of
adapters used by enabled runtimes when composing the dispatched workflow's
`permissions:` block.

### 8. Runtime invocation retry policy

Transient runtime failures (HTTP 5xx, timeout, rate-limit 429) MUST be retried
inside the adapter with bounded exponential backoff (default: 3 attempts,
base 2 s, jitter ±25 %, max 30 s total) before being surfaced as a step
outcome. Retried-then-succeeded invocations MUST record the retry count in the
audit comment (`runtime_retries: N`) but MUST NOT count as separate
`loop_budget` iterations.

Retry-exhausted failures MUST surface as `outcome: runtime-error` (a new
declared outcome in the regulation document), distinct from `protocol-violation`.

---

## Consequences

**Positive**
- Implementers no longer have to re-derive the dedup key from first principles
  or guess at concurrency semantics.
- The ADR-004 PATCH race is closed at the substrate level, not papered over by
  application dedup.
- The 720-minute wallclock vs 360-minute job-cap mismatch is no longer a latent
  hazard.
- Required-status-check gating is documented; CI silently passing v2 with broken
  validation becomes mechanically impossible.
- Workflow failures of the orchestrator itself are observable, satisfying §VI.

**Negative / Trade-offs**
- Workflow concurrency serialises per issue, slightly increasing latency on
  busy threads. Acceptable: the orchestrator is the hot path's coordinator,
  not an autoscaling worker.
- Bounded retries inside adapters add code per kind. Acceptable: the policy is
  a small shared helper exported from `scripts/orchestrator/runtimes/_retry.js`.

**Risks**
- *Risk*: A GitHub Actions context field referenced in §1 is renamed by GitHub.
  *Mitigation*: The dedup-key formulas are tested against fixture event payloads
  in `tests/orchestrator/fixtures/`; a renamed field fails CI immediately.
- *Risk*: A consumer project disables required status checks.
  *Mitigation*: This is their right; the upstream constraint is documented and
  the `verify-mirror.sh` pattern from ADR-006 establishes the precedent.

---

## Alternatives Considered

| Option | Pro | Con | Rejected Because |
|---|---|---|---|
| Leave dedup key to implementers | Maximally flexible | Each implementer reinvents (incorrectly) | Defeats the purpose of FR-016 |
| Use only `comment.id` for all events | Simplest | Doesn't cover `issues`, `workflow_run`, `pr.synchronize` | Incomplete |
| Mutex via a "lock" comment instead of workflow concurrency | Substrate-agnostic | Adds a new comment shape; doesn't survive forced cancellation | Re-creates ADR-004's noise problem |
| Cap wallclock at 360 min (per-job) | Aligns with substrate cap | Forces every loop-bearing pipeline to fit one job — kills the design | Defeats the v2 use case |
| Retry policy left to each adapter | Maximum runtime-author freedom | Inconsistent UX; some adapters silently swallow failures | Violates §VI |
| Frozen substrate contract (chosen) | Implementable, testable, audited | Slightly longer ADR | Accepted |

---

## References

- `specs/044-orchestrator-v2-design/spec.md` — FR-015, FR-016, FR-017, FR-019, FR-021, FR-023
- ADR-004 (live-status PATCH race acknowledged, mitigated here)
- ADR-005 (runtime adapter interface — `requiredPermissions` extension)
- ADR-006 (`.apm/` SoT + mirror — `verify-mirror.sh` referenced as required check)
- Constitution §VI (Observable, Auditable Automation), §VIII (Orchestrator as control plane)
- `.github/agents/devops-agent.md` — infrastructure review checklist
- GitHub Actions docs — [`concurrency`](https://docs.github.com/en/actions/using-jobs/using-concurrency), [`timeout-minutes`](https://docs.github.com/en/actions/using-jobs/setting-a-maximum-execution-time-for-a-job) (cap: 360 min)
