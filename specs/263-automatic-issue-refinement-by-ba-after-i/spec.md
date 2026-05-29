# Feature Specification: Automatic Issue Refinement by BA After Triage

**Feature Branch**: `263-automatic-issue-refinement-by-ba-after-i`
**Created**: 2026-05-29
**Status**: Draft
**Issue**: #263

## Overview

When a GitHub Issue is opened and triaged, the resulting issue body is often sparse — it contains a raw problem statement but lacks a structured Proposed Solution, concrete Acceptance Criteria, an Out of Scope boundary, and documented Alternatives Considered. This forces a human BA (or a BA Agent invoked manually) to start from a near-empty canvas, slowing the path from triage to a fully actionable spec.

This feature introduces automatic issue enrichment: immediately after the Triage Agent completes and applies the `triaged` label on an issue routed to `agent:ba`, the Orchestrator automatically triggers the BA Agent in **issue-refinement mode**. The BA Agent reads the sparse issue body, infers the four missing structured sections using its reasoning capabilities, updates the issue body in-place, promotes the issue status to `status:confirmed` when all sections can be fully inferred, and posts an auditable comment. No code, branches, spec files, or plan files are created — this is issue enrichment only.

## User Stories

### User Story 1 — Orchestrator Auto-Dispatches BA Agent After Triage (Priority: P1)

As the **agentic pipeline**, I need the Orchestrator to automatically trigger the BA Agent in issue-refinement mode whenever the Triage Agent completes routing to `agent:ba`, so that the enrichment step happens without any human intervention and issues do not stall in `status:needs-info`.

**Why this priority**: This is the foundational trigger that makes all subsequent enrichment possible. Without automatic dispatch, the feature delivers no value.

**Independent Test**: Can be fully tested by applying the `triaged` label to an issue that already carries `agent:ba` and verifying that the BA Agent workflow is dispatched automatically, without any human comment or manual trigger.

**Acceptance Scenarios**:

1. **Given** a GitHub Issue carries both the `agent:ba` label and no `triaged` label, **When** no label change occurs, **Then** the BA Agent workflow is not dispatched.
2. **Given** a GitHub Issue carries the `agent:ba` label, **When** the Triage Agent applies the `triaged` label, **Then** the Orchestrator automatically dispatches the BA Agent workflow in issue-refinement mode without any human action.
3. **Given** a GitHub Issue is labeled `triaged` but does NOT carry `agent:ba`, **When** the label event fires, **Then** the BA Agent workflow is NOT dispatched (the issue is routed to a different agent).
4. **Given** the BA Agent workflow is dispatched automatically, **When** the workflow starts, **Then** it receives the issue number as its input context.

---

### User Story 2 — BA Agent Fills All Four Empty Structured Sections (Priority: P1)

As a **project maintainer** reviewing the issue tracker, I want the BA Agent to fill in the empty structured sections of a triaged issue — Proposed Solution, Acceptance Criteria, Out of Scope, and Alternatives Considered — using its analysis of the issue title, body, triage comment, and codebase context, so that every triaged issue is immediately actionable without requiring manual BA effort.

**Why this priority**: The core value of this feature is the automated enrichment content. An automatically dispatched workflow that does not enrich the issue body provides no benefit.

**Independent Test**: Can be fully tested by pointing the BA Agent at a sparse issue (one with four empty sections) and verifying that all four sections are present and non-empty after the agent runs.

**Acceptance Scenarios**:

1. **Given** a triaged issue with empty Proposed Solution, Acceptance Criteria, Out of Scope, and Alternatives Considered sections, **When** the BA Agent runs in issue-refinement mode, **Then** the issue body is updated in-place with coherent, non-empty content in all four sections.
2. **Given** the BA Agent fills in the sections, **When** the update is applied, **Then** the section headings in the enriched body exactly match those defined in the repository's issue template (same heading text, same heading level).
3. **Given** the BA Agent enriches the issue body, **When** the update is applied, **Then** the original content already present in the issue (Problem / Motivation and any other non-empty sections) is preserved verbatim.
4. **Given** the BA Agent enriches the issue body, **When** the update is complete, **Then** a human-readable comment is posted on the issue confirming that refinement was performed and summarising the changes made.

---

### User Story 3 — BA Agent Promotes Status Label When Enrichment is Complete (Priority: P2)

As a **project maintainer**, I want the issue status to automatically transition from `status:needs-info` to `status:confirmed` when the BA Agent successfully infers all missing sections, so that the issue tracker accurately reflects which issues are ready for spec-writing.

**Why this priority**: Label promotion is observable evidence that enrichment succeeded. Without it, maintainers must read every enriched issue to know its readiness state.

**Independent Test**: Can be fully tested by verifying that after a successful enrichment run, the issue no longer carries `status:needs-info` and now carries `status:confirmed`.

**Acceptance Scenarios**:

1. **Given** the BA Agent successfully infers and populates all four missing sections, **When** the issue body update is confirmed, **Then** the `status:needs-info` label is removed and `status:confirmed` is added to the issue in the same operation.
2. **Given** the label transition occurs, **When** the confirmation comment is posted, **Then** the comment text notes that `status:needs-info` has been resolved and the status has been changed to `status:confirmed`.

---

### User Story 4 — BA Agent Degrades Gracefully When Sections Cannot Be Inferred (Priority: P2)

As a **project maintainer**, I want the BA Agent to retain the `status:needs-info` label and post a targeted clarification comment when it cannot confidently infer one or more sections, so that incomplete enrichment is visible and actionable rather than silently partial.

**Why this priority**: Graceful degradation preserves issue integrity. A partial or incorrect enrichment is worse than no enrichment, and the maintainer needs a clear signal that human input is still required.

**Independent Test**: Can be fully tested by presenting the BA Agent with a genuinely ambiguous issue (missing context that cannot be inferred from the codebase) and verifying that the issue body is not modified, `status:needs-info` is retained, and a comment listing specific outstanding questions is posted.

**Acceptance Scenarios**:

1. **Given** the BA Agent cannot confidently infer one or more of the four required sections, **When** the enrichment attempt is made, **Then** the issue body is left unmodified (no partial updates).
2. **Given** the BA Agent cannot complete enrichment, **When** it finishes processing, **Then** the `status:needs-info` label is retained on the issue.
3. **Given** the BA Agent cannot complete enrichment, **When** it finishes processing, **Then** a comment is posted listing the specific sections it could not infer and the specific questions that a human must answer.
4. **Given** enrichment is skipped, **When** the comment is posted, **Then** the comment clearly explains that no changes were made to the issue body.

---

### Edge Cases

- What happens when the `triaged` label is applied but the issue body is already fully enriched? The BA Agent should detect that all four sections are non-empty and post a short comment confirming no changes were needed, without re-writing the body.
- What happens if the `agent:ba` label is applied before `triaged`? The dispatch condition requires both labels to be present at the time of the `triaged` label event; if `triaged` fires first, it checks for `agent:ba` at that moment.
- What happens if the BA Agent workflow fails mid-run (network error, token expiry)? The workflow exits non-zero; the issue remains in its pre-enrichment state; the Orchestrator logs the failure; a maintainer can re-trigger manually via `/ba-agent`.
- What happens if the same issue is labeled `triaged` more than once (e.g. label removed and re-applied)? Each `triaged` label application independently triggers the dispatch; the BA Agent should be idempotent — if sections are already populated, it skips re-enrichment.

## Requirements

### Functional Requirements

- **FR-001**: The Orchestrator MUST listen to the `issues.labeled` event and dispatch the BA Agent workflow automatically when the applied label is `triaged` AND the issue already carries the `agent:ba` label.
- **FR-002**: The BA Agent workflow MUST accept an issue number as input when dispatched in issue-refinement mode.
- **FR-003**: The BA Agent MUST read the full issue body and any triage comment before attempting enrichment.
- **FR-004**: The BA Agent MUST infer and populate all four sections: Proposed Solution, Acceptance Criteria, Out of Scope, and Alternatives Considered — using the issue title, body, triage comment, and available codebase context.
- **FR-005**: The BA Agent MUST update the issue body in-place using `gh issue edit`, preserving all existing non-empty content and replacing only the empty structured sections.
- **FR-006**: The section headings in the enriched issue body MUST exactly match the headings defined in the repository issue template (same text, same Markdown heading level).
- **FR-007**: When all four sections are successfully populated, the BA Agent MUST remove the `status:needs-info` label and add the `status:confirmed` label in a single operation.
- **FR-008**: When one or more sections cannot be confidently inferred, the BA Agent MUST leave the issue body unmodified, retain the `status:needs-info` label, and post a comment listing the specific sections and questions still outstanding.
- **FR-009**: The BA Agent MUST post a human-readable comment on the issue after every enrichment attempt — whether successful, skipped (already enriched), or failed — describing the outcome and any actions taken.
- **FR-010**: The BA Agent in issue-refinement mode MUST NOT create any git branch, spec file (`specs/NNN-slug/spec.md`), plan file, task file, or any code change.
- **FR-011**: The BA Agent instruction file (`.github/agents/ba-product-agent.md`) MUST document the issue-refinement mode as a distinct capability, including its trigger conditions, inputs, outputs, and constraints.
- **FR-012**: The mirrored BA Agent instruction file (`src/agents/ba-product-agent.md`) MUST be updated identically and simultaneously with `.github/agents/ba-product-agent.md`.

### Key Entities

- **GitHub Issue**: The unit of work that is enriched. Key attributes: issue number, body, labels, comments.
- **Triage Agent**: The agent that classifies and routes incoming issues. Its output — the `triaged` label combined with an `agent:*` routing label — is the trigger for this feature.
- **BA Agent (issue-refinement mode)**: The BA Agent operating in a constrained mode that enriches issue bodies only. Inputs: issue number, issue body, triage comment, codebase context. Outputs: updated issue body, label changes, confirmation comment.
- **Orchestrator**: The coordination layer that listens to repository events and dispatches agent workflows. Extended in this feature to handle the `issues.labeled:triaged` event.
- **`triaged` label**: Applied by the Triage Agent to signal that classification and routing are complete.
- **`agent:ba` label**: Applied by the Triage Agent to route the issue to the BA Agent.
- **`status:needs-info` label**: Indicates the issue requires more information before it can proceed; applied by the Triage Agent on sparse issues and removed by the BA Agent after successful enrichment.
- **`status:confirmed` label**: Indicates the issue is understood and ready for spec-writing; applied by the BA Agent after successful enrichment.
- **Issue Template**: The repository's GitHub Issue template that defines the expected section headings for the issue body.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Every issue labeled `triaged` + `agent:ba` has the BA Agent workflow dispatched automatically, with zero issues requiring a manual `/ba-agent` trigger after triage.
- **SC-002**: Enriched issues contain non-empty, coherent content in all four sections (Proposed Solution, Acceptance Criteria, Out of Scope, Alternatives Considered), as verified by reading the updated issue body.
- **SC-003**: Issues where all four sections are successfully inferred transition from `status:needs-info` to `status:confirmed` without any human label change.
- **SC-004**: Issues where enrichment cannot be completed retain `status:needs-info` and receive a comment listing specific outstanding questions within the same workflow run.
- **SC-005**: The time from the Triage Agent applying the `triaged` label to the BA Agent posting its enrichment comment is within a duration acceptable for automated pipelines (no human waiting required — the step is non-blocking).
- **SC-006**: Zero git branches, spec files, plan files, or code changes are produced as a side-effect of the issue-refinement mode across all test scenarios.
- **SC-007**: The BA Agent instruction file accurately documents the issue-refinement mode, enabling a new project maintainer to understand the trigger, inputs, outputs, and constraints without consulting any other document.

## Out of Scope

- Writing `specs/NNN-slug/spec.md` — spec creation remains a separate, explicitly triggered step.
- Creating or switching git branches.
- Triggering the Developer Agent, Architect Agent, or any downstream agent after enrichment.
- Modifying the Triage Agent's behaviour, output format, or label assignments.
- Retroactively enriching issues that were triaged before this feature is deployed.
- Enriching issues that are not routed to `agent:ba` by the Triage Agent (e.g. issues routed to `agent:dev` or `agent:architect`).
- Full spec quality check (`/speckit-checklist`) — that command applies only to `spec.md` files, not to issue bodies.
- Sending external notifications (email, Slack, etc.) when enrichment completes.

## Security and Privacy Considerations

- The BA Agent uses the existing `GITHUB_TOKEN` with `issues: write` scope, which is already required by the current BA Agent workflow. No new permissions or secrets are introduced.
- The `gh issue edit` command modifies only the body and labels of the specific issue being processed; it cannot access other issues, repositories, or external systems.
- No personally identifiable information (PII) is introduced: the agent reads and rewrites the issue body, which is already public in a public repository or scoped to repository members in a private repository.
- The Orchestrator dispatch condition (both `triaged` AND `agent:ba` must be present) limits the attack surface: an actor who can only add labels would need to control both label assignments, which requires the same permissions as the Triage Agent itself.
- Workflow run logs are retained under the existing repository log-retention policy; no additional sensitive data is written to logs.

## Assumptions

- The Triage Agent always applies both the `triaged` label and an `agent:*` routing label in the same operation; there is no window where `triaged` is present without an `agent:*` label.
- The `triaged`, `agent:ba`, `status:needs-info`, and `status:confirmed` labels already exist in the repository label set (verified from prior BA Agent work on issue #224).
- The Orchestrator dispatch mechanism for `issues.labeled` events is already available for use by other agent workflows and requires only configuration, not a new infrastructure component.
- The repository issue template defines stable section headings that the BA Agent can match; if the template changes, the BA Agent instruction file must be updated accordingly.
- The BA Agent's LLM reasoning capabilities are sufficient to infer coherent enrichment content from a typical sparse issue body combined with codebase context; no external data sources beyond the repository are required.
- Idempotency is a responsibility of the BA Agent: if dispatched multiple times on the same issue, it must check whether sections are already populated before attempting re-enrichment.

## Open Questions

_None — all sections and constraints are derived from the enriched issue body for #263, the existing BA Agent definition, and the Orchestrator architecture. Ready for handoff to the Developer Agent._
