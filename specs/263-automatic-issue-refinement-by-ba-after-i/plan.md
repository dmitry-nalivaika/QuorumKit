# Implementation Plan: Automatic Issue Refinement by BA After Triage

**Issue**: #263
**Spec**: [spec.md](./spec.md)
**Branch**: `263-automatic-issue-refinement-by-ba-after-i`

---

## Constitution Check

| Rule | How this plan satisfies it |
|------|---------------------------|
| No direct commits to main | Feature branch: `263-automatic-issue-refinement-by-ba-after-i` |
| Tests before implementation | TDD workflow enforced per task; tests written first in `engine/tests/issue-enrichment.test.js` |
| No hardcoded secrets | GitHub Token sourced from `${{ secrets.GITHUB_TOKEN }}`; no credentials in code |
| Input validation at boundaries | `issue_number` input validated as a number; label matching uses strict prefix allowlist |
| Data access scoping | N/A — reads/writes only the specific issue being processed via `gh issue edit` |
| Coverage threshold | New test file covers all four US-1 acceptance scenarios and edge cases |

---

## Design Summary

### Problem

When the Triage Agent applies the `triaged` label to an issue routed to `agent:ba`,
the issue body is typically sparse (only a Problem/Motivation section). The BA Agent
must be triggered manually to enrich it, slowing the path to an actionable spec.

### Solution

Introduce a **standalone enrichment pipeline** (`ba-enrichment-pipeline`) that:

1. **Triggers automatically** on `issues.labeled` when both `triaged` and `agent:ba`
   labels are present on the issue.
2. **Dispatches the BA Issue Enrichment workflow** (`copilot-agent-ba-enrich.yml`)
   which reads the issue body, infers the four missing sections, updates the body
   in-place, and manages the `status:needs-info` / `status:confirmed` labels.
3. **Does not create branches, spec files, or plan files** — enrichment is issue-body
   only.

### Key Design Decisions

**Separate workflow file (`copilot-agent-ba-enrich.yml`)**: Rather than adding a `mode`
input to the existing `copilot-agent-ba.yml`, a dedicated workflow is created. This
prevents accidental spec-writing by the enrichment step and keeps the enrichment logic
isolated and testable. The BA Agent instruction files document both modes.

**Pipeline naming (`ba-enrichment-pipeline.yml`)**: Named with prefix `ba-` so it is
loaded alphabetically before `bug-fix-pipeline.yml` and `feature-pipeline.yml`. For
issues with `agent:ba` (all feature issues), the enrichment pipeline matches first on
the `triaged` event. The feature pipeline is suppressed for this event, which is
intentional — spec creation is a separate, explicitly triggered step (spec §Out of Scope).

**Behaviour change for `agent:ba` issues**: For issues carrying both `triaged` and
`agent:ba`, the enrichment pipeline now takes precedence over the feature pipeline.
The feature pipeline (spec-writing) is no longer triggered automatically from the
`triaged` event for these issues. This is correct per the spec: "spec creation remains
a separate, explicitly triggered step."

**V1 pipeline**: The enrichment pipeline uses schema version `1` (not v2). The
orchestrator dispatches the workflow, then waits for `workflow_run.completed` before
advancing (no apm-msg required). This avoids requiring the enrichment workflow to
implement the full v2 apm-msg protocol while still providing correct state tracking.

---

## Files Changed

| File | Type | Purpose |
|------|------|---------|
| `src/pipelines/ba-enrichment-pipeline.yml` | Create | New standalone enrichment pipeline (FR-001) |
| `.github/workflows/copilot-agent-ba-enrich.yml` | Create | BA enrichment workflow — issue body only (FR-002–FR-010) |
| `.github/workflows/orchestrator.yml` | Modify | Add enrichment workflow to watched `workflow_run` list |
| `.github/agents/ba-product-agent.md` | Modify | Document issue-refinement mode (FR-011) |
| `src/agents/ba-product-agent.md` | Modify | Mirror update (FR-012) |
| `engine/tests/issue-enrichment.test.js` | Create | Tests for US-1 dispatch scenarios |
| `specs/263-.../plan.md` | Create | This document |
| `specs/263-.../tasks.md` | Create | Task list |

---

## Architecture Diagram

```
issues.labeled (triaged + agent:ba)
        │
        ▼
  Orchestrator
  ba-enrichment-pipeline (v1)
        │
        ▼
  copilot-agent-ba-enrich.yml
  ┌─────────────────────────────────────────┐
  │ 1. Read issue body + triage comment     │
  │ 2. Call GitHub Models API               │
  │    - infer Proposed Solution            │
  │    - infer Acceptance Criteria          │
  │    - infer Out of Scope                 │
  │    - infer Alternatives Considered      │
  │ 3a. If all inferred:                    │
  │     - Update issue body (gh issue edit) │
  │     - Remove status:needs-info          │
  │     - Add status:confirmed              │
  │     - Post confirmation comment         │
  │ 3b. If cannot infer:                    │
  │     - Retain status:needs-info          │
  │     - Post clarification comment        │
  │ 3c. If already enriched:               │
  │     - Post "no changes needed" comment  │
  └─────────────────────────────────────────┘
        │
        ▼
  workflow_run.completed
        │
        ▼
  Orchestrator: pipeline completed
```

---

## Security Considerations

- Uses existing `GITHUB_TOKEN` with `issues: write` scope (no new permissions).
- `gh issue edit` modifies only the body and labels of the target issue.
- LLM response is used for issue body content only; no code is executed.
- Label injection is guarded: only `status:needs-info` and `status:confirmed` are
  manipulated, never arbitrary strings from LLM output.
- Issue number is parsed as a number to prevent path injection in `gh` calls.
