# ADR-002: Orchestrator State Storage Strategy

| Field | Value |
|---|---|
| **ADR Number** | 002 |
| **Issue** | #2 — Autonomous Agent Orchestration System |
| **Status** | Superseded by [ADR-004](./adr-004-orchestrator-state-comment-model-v2.md) (2026-05-08) |
| **Date** | 2026-05-04 |
| **Deciders** | BA/Product Agent, Architect Agent |
| **Supersedes** | — |
| **Superseded By** | [ADR-004](./adr-004-orchestrator-state-comment-model-v2.md) — Hybrid live-status + append-only audit comment model (Orchestrator v2) |

---

> **Status note (2026-05-08):** This ADR is superseded by ADR-004 for Orchestrator
> v2 (spec #44). The append-only-only model described below remains the v1
> behaviour and is kept for historical reference and v1 backward compatibility
> (see spec 044 US-7, FR-002, FR-015).

---

## Context

The Orchestrator (spec: `specs/002-autonomous-agent-orchestration/spec.md`) must be
**stateless between runs** (Constitution §VIII, FR-002). Every pipeline run must be
resumable after a crash or restart using only state persisted outside the workflow
process itself.

The Orchestrator is implemented as a stateless **GitHub Actions workflow** (Assumption
A5). It has no persistent backend, no database, and no shared filesystem between runs.
Any state store must be:

1. Reachable from a GitHub Actions runner with only the repository's GitHub token.
2. Readable by both the Claude Code and Copilot runtime paths (Constitution §IV).
3. Human-readable so non-technical stakeholders can understand pipeline progress
   without tooling (Constitution §VI).
4. Auditable via standard GitHub UI without additional infrastructure.

---

## Decision

**Pipeline run state is serialised as a JSON object embedded in a specially-tagged
HTML comment and posted to the GitHub Issue or PR that triggered the pipeline.**

### State comment format

```html
<!-- apm-pipeline-state: {"runId":"<uuid>","pipelineName":"<string>","triggerEvent":"<string>","status":"<status>","currentStepIndex":<int>,"steps":[...],"approvalGate":{...},"updatedAt":"<ISO8601>"} -->
```

The full schema is defined in FR-002a of the spec.

### Authoritative-comment lookup algorithm

1. Fetch all comments on the triggering Issue/PR, paginating through every page
   (GitHub default: 30/page, max: 100/page).
2. Filter to comments whose body contains the literal prefix
   `<!-- apm-pipeline-state:`.
3. Among matching comments, select the one with the **highest `created_at`
   timestamp** (most recently created).
4. Parse the JSON payload from that comment.
5. If no matching comment is found, treat the pipeline run as brand-new (state =
   `pending`, `currentStepIndex` = 0).

### On each state transition

The Orchestrator posts a **new** comment with the updated state (rather than editing
the previous one) to preserve an immutable audit history. The previous state comment
remains in the thread as a historical record.

---

## Alternatives Considered

### Option A — GitHub Actions Cache (`actions/cache`)

**Pros:** Fast, no API calls needed; native to GHA.  
**Cons:**
- Cache is keyed by branch and may not survive across workflow runs on different
  branches or forks.
- Cache is not human-readable in the GitHub UI; requires downloading the cache
  artifact to inspect state.
- Cache has a 7-day TTL; long-running pipelines with slow approval gates could
  expire.
- Cache is not accessible from the Copilot runtime path (non-GHA execution).

**Rejected.**

### Option B — GitHub Release assets as state blobs

**Pros:** Permanent; accessible via GitHub API.  
**Cons:**
- Releases are a public, user-visible surface; polluting them with internal
  Orchestrator state is confusing and non-standard.
- Creating a release for each pipeline state update is semantically incorrect and
  clutters the repository's release history.
- Requires `contents:write` scope, broader than the least-privilege baseline.

**Rejected.**

### Option C — Lightweight external database (SQLite, Redis, Postgres)

**Pros:** Rich query capability; no comment clutter; efficient state retrieval.  
**Cons:**
- Requires a persistent backend service — directly contradicts Constitution §VIII
  (stateless Orchestrator) and Assumption A5.
- Introduces an external dependency, violating Constitution §VII (simplicity/YAGNI)
  and §V (zero-config defaults).
- Requires secrets management for DB credentials, increasing attack surface
  (Constitution Security §1).
- Breaks Dual-AI compatibility unless both runtimes can reach the same external
  service.

**Rejected.**

### Option D — Dedicated GitHub repository labels as state flags

**Pros:** Visible in GitHub UI; no comment parsing needed.  
**Cons:**
- Labels carry no structured payload; encoding step-level detail would require an
  unwieldy number of labels.
- Label operations require per-label API calls; updating step state = many API
  calls per transition.
- Label history is not preserved; previous state is overwritten, losing the audit
  trail.

**Rejected.**

### Option E — GitHub Issue comments with tagged JSON (chosen)

**Pros:**
- Zero external dependencies; only `issues:write` / `pull-requests:write` scope
  needed (already required).
- Human-readable in the GitHub UI; stakeholders see pipeline progress without
  tooling.
- Each state comment is immutable once created — full history is preserved in
  chronological order.
- Accessible to both Claude Code and Copilot runtime paths via the same GitHub API.
- Resilient to Orchestrator restarts; state survives indefinitely as long as the
  Issue/PR exists.

**Cons:**
- Long-running pipelines on busy issues may accumulate many state comments; comment
  pagination must be implemented.
- Comments cannot be queried by content via the GitHub API (no server-side filter);
  all comments must be fetched and filtered client-side.
- GitHub enforces a rate limit on Issues API calls; the Orchestrator must respect
  `Retry-After` headers and the existing 3-retry/exponential-backoff policy (FR-005).

**Mitigation for cons:**
- Pagination is explicitly required in FR-002 and the lookup algorithm above.
- Rate-limit handling is already required by FR-005.
- Comment accumulation is acceptable; GitHub Issues support thousands of comments
  and the HTML comment tag is invisible in the rendered UI.

**Accepted.**

---

## Consequences

- `dashboard/server.js` does **not** need to read state comments directly. The
  Orchestrator posts state to the dashboard via a webhook POST (FR-007) on each
  transition; the comment is the durable audit record, not the live-update
  mechanism.
- The FR-002a JSON schema is the single contract both runtimes MUST produce and
  consume. Any schema change requires updating this ADR and FR-002a in the spec.
- Future enhancement: if comment accumulation becomes a problem, a compaction step
  can delete superseded state comments after writing the new one — this can be
  added without changing the lookup algorithm.

---

## References

- `specs/002-autonomous-agent-orchestration/spec.md` — FR-002, FR-002a, FR-015
- Constitution §VIII (Orchestrator stateless), §VI (Observable/Auditable)
- Architect Agent review comment on Issue #2 (ARCH-BLOCKER-1, ARCH-CONCERN-4)
