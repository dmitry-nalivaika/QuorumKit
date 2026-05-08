# ADR-004: Hybrid Live-Status + Append-Only Audit Comment Model (Orchestrator v2)

| Field | Value |
|---|---|
| **ADR Number** | 004 |
| **Issue** | #44 — Orchestrator v2 Design |
| **Status** | Accepted |
| **Date** | 2026-05-08 |
| **Deciders** | Architect Agent |
| **Supersedes** | ADR-002 (Orchestrator State Storage Strategy) |

---

## Context

ADR-002 chose a **purely append-only** model: every transition writes a new
`<!-- apm-pipeline-state: {…} -->` comment, and the most recently created one is
authoritative. This guarantees an immutable audit trail (Constitution §VI) but
produces a thread that is hostile to humans:

- A pipeline with N transitions creates N+ orchestrator comments. On long
  loop-bearing v2 runs (e.g. `DEV → QA → DEV → QA → DEV → BA`) the thread becomes
  dominated by orchestrator chatter, drowning out human and agent content.
- Readers must mentally diff successive comments to know "what's happening *now*".
- The dashboard webhook (FR-021 in spec #44) duplicates the live-view function;
  users without the dashboard have no equivalent.

Spec #44 FR-015 calls for "exactly one mutable live-status comment + one
append-only audit comment per transition", which is in direct tension with the
Accepted ADR-002. Per the Architect Agent Hard Constraints, this requires a
superseding ADR rather than a silent override.

---

## Decision

The Orchestrator v2 uses a **hybrid two-channel comment model** on the triggering
Issue/PR:

1. **Audit channel — append-only, authoritative.**
   Every state transition writes a new comment whose body contains the embedded
   tagged HTML payload `<!-- apm-pipeline-state: {…} -->`. These comments are
   **never edited** and **never deleted**. They are the source of truth from
   which any run state can be reconstructed (FR-017 of spec #44). The format and
   lookup algorithm from ADR-002 carry over unchanged for the audit channel.

2. **Live-status channel — single mutable view, derived.**
   The Orchestrator additionally maintains exactly **one** comment per active run
   carrying the embedded tag `<!-- apm-pipeline-status: {"runId":"<uuid>"} -->`
   plus a human-readable rendering of the current step, iteration, runtime, and
   ETA-to-budget. On every transition this comment is **edited in place** (PATCH
   to the same comment ID). The runId is recorded in its tag so the orchestrator
   can locate it deterministically across restarts.

### Authoritativeness invariant

The live-status comment is a **projection** of the audit comments. If the two
disagree (e.g. a manual edit corrupts the live-status comment), the audit
comments win and the live-status comment is recomputed and overwritten on the
next transition. Removing or corrupting the live-status comment MUST NOT cause
data loss; the orchestrator MUST recreate it from the audit log.

### Locating the live-status comment

1. List all comments authored by the orchestrator identity.
2. Filter to comments whose body contains
   `<!-- apm-pipeline-status: ` followed by `"runId":"<this run's uuid>"`.
3. If exactly one match: edit it. If zero: create it. If more than one (should
   never happen): keep the oldest, delete the rest, log a warning audit comment.

---

## Consequences

**Positive**
- Thread readability: humans and other agents see one "live" snapshot plus one
  audit line per transition — no duplicate banners.
- No loss of auditability: the audit channel retains every ADR-002 guarantee.
- Recoverability: corruption of the mutable comment is non-fatal because state
  is reconstructible from the audit channel.
- Dashboard parity: users without the optional dashboard still get a live view.

**Negative / Trade-offs**
- Two payload formats coexist on the same thread (`apm-pipeline-state` and
  `apm-pipeline-status`). Mitigation: both share the same HTML-comment +
  `runId`-tagged convention; one parser regex covers both with a discriminator.
- Editing requires `issues:write` (already held) and one extra GitHub API call
  per transition (PATCH). Acceptable; well within rate limits per ADR-002 §Cons.
- Tests must cover the recovery path (live comment missing/corrupt → recreated
  from audit log).

**Risks & mitigations**
- *Risk*: A reader assumes the live-status comment is authoritative.
  *Mitigation*: The live-status comment body MUST include the literal disclaimer
  "_Live view — authoritative state is the audit comments below._".
- *Risk*: Concurrent transitions (parallel webhook deliveries) race on the PATCH.
  *Mitigation*: Idempotency dedup (FR-016 of spec #44) eliminates this; the
  audit-write happens before the live-status PATCH, so a lost PATCH is recovered
  at the next transition.

---

## Alternatives Considered

| Option | Pro | Con | Rejected Because |
|---|---|---|---|
| Keep ADR-002 unchanged (pure append-only) | Simplest; one channel | Thread noise on loop-bearing runs is severe | Fails the v2 spec UX goal (US-5: clean thread) |
| Single mutable comment only (drop append-only) | Cleanest thread | Loses immutable audit trail | Violates Constitution §VI; loses ADR-002's recoverability |
| Mutable comment + dashboard-only audit | Cleanest thread | Dashboard is optional (Constitution §IX); cannot be the audit substrate | Violates Constitution §IX (dashboard is read-only observability, not authoritative state) |
| Hybrid (chosen) | Clean thread + immutable audit + recoverable | Two payload formats | Accepted |

---

## Migration from ADR-002

- Existing v1 runs in flight at upgrade time continue to read/write only the
  `apm-pipeline-state` audit channel (no live-status comment is created for v1
  runs). The v1 lookup algorithm is unchanged.
- v2 runs (any pipeline with `schema_version: "2"`) use both channels.
- No data migration is required; no historical comment is rewritten.

---

## References

- ADR-002 (superseded) — Orchestrator State Storage Strategy
- `specs/044-orchestrator-v2-design/spec.md` — FR-015, FR-017, US-5
- Constitution §VI (Observable, Auditable Automation), §IX (Dashboard read-only)
- `scripts/orchestrator/state-manager.js` — current implementation of the audit
  channel
