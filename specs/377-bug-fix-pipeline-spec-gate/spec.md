# Spec: Bug-Fix Pipeline Produces a Spec Before Development — Issue #377

**Issue:** #377
**Branch:** `377-bug-fix-pipeline-spec-gate`
**Type:** bug-fix (Template C — Bug Fix)
**Status:** draft
**Decision record:** [ADR-377](../../docs/architecture/adr-377-bug-fix-pipeline-spec-gate.md) (Proposed)

---

## Overview

Every `type:bug` issue currently stops at the first step of the bug-fix pipeline. The
Developer Agent correctly refuses to start without a spec for the issue (Constitution §III,
Spec-Before-Code), but the bug-fix pipeline has no step that produces one. The pipeline
therefore cannot finish any bug without a person writing a spec by hand. This was observed
on issues #376 and #377. When the Developer Agent reports the missing spec, the pipeline
routes the problem back to the Developer Agent, so nobody who can fix it is ever asked.

This change makes the bug-fix pipeline satisfy the spec-first rule on its own: a spec is
written by the BA/Product Agent, using a short bug-specific format, before development
starts, and a missing spec is routed to the BA/Product Agent instead of back to the
Developer Agent.

---

## Reproduction

**Observed (before this change):**

1. Open a small `type:bug` issue and let Triage label it `triaged` and `type:bug`.
2. The pipeline starts and dispatches the Developer Agent as its first step.
3. The Developer Agent fails with "spec missing for issue" and reports a `blocker`.
4. The pipeline sends the issue back to the Developer Agent. The run ends in a timeout with
   no resolution.

**Expected (after this change):**

1. The same issue is labelled `triaged` and `type:bug`.
2. The pipeline dispatches the BA/Product Agent first. It publishes a short bug spec.
3. The pipeline then dispatches the Developer Agent, which finds the spec and proceeds
   through QA and Review.

---

## User Stories

### US-1: A bug issue reaches development without manual spec authoring (Priority: P1)

As a **maintainer**, I want a `type:bug` issue to get a spec automatically before
development begins, so that the bug-fix pipeline completes end to end without me writing
specs by hand.

**Acceptance Scenarios:**
- Given an issue labelled `triaged` and `type:bug`, When the bug-fix pipeline starts,
  Then its first step is the BA/Product Agent and the Developer Agent has not yet run.
- Given the BA/Product Agent finishes successfully, When the pipeline advances,
  Then the next step is the Developer Agent and a spec for the issue exists.
- Given the BA/Product Agent cannot establish what the bug is from the report,
  When it finishes, Then the pipeline stops for a person (`needs-human`) rather than
  starting development against an invented description.

### US-2: A missing spec is routed to the role that can fix it (Priority: P1)

As a **maintainer**, I want a missing or inadequate spec found during development or review
to send the issue back to the BA/Product Agent, so that the pipeline does not loop on a
step that is forbidden from writing specs.

**Acceptance Scenarios:**
- Given the Developer Agent finds no spec for the issue, When it reports its result,
  Then the result is `spec_gap` and the pipeline returns to the BA/Product Agent.
- Given the Reviewer Agent finds the spec inadequate to verify the fix, When it reports
  `spec_gap`, Then the pipeline returns to the BA/Product Agent.
- Given the BA/Product Agent itself reports `spec_gap` or `needs-human`, When the pipeline
  evaluates the result, Then the BA/Product Agent step is repeated (as in the feature
  pipeline), bounded by the existing loop budget.

### US-3: Bug specs stay short (Priority: P2)

As a **maintainer**, I want a bug spec to be a short document, so that the added step costs
minutes of agent time and not a feature-sized specification.

**Acceptance Scenarios:**
- Given an issue labelled `type:bug`, When the BA/Product Agent writes the spec,
  Then it uses the bug-fix format and does not add user-story or key-entity sections.
- Given a bug spec written in the bug-fix format, When the spec quality check runs,
  Then it does not fail the spec for lacking feature-only sections.
- Given a bug spec, When it is handed to development, Then it still contains no unresolved
  clarification markers and no unresolved open questions.

### US-4: Existing installations are told how to adopt the change (Priority: P2)

As an **adopter of QuorumKit with a customised bug-fix pipeline file**, I want to be told
exactly what changed, so that I can update my copy by hand and my bug issues stop failing.

**Acceptance Scenarios:**
- Given a project that already has its own bug-fix pipeline file, When the installer is
  re-run, Then the existing file is left untouched (current behaviour is preserved).
- Given that project, When the maintainer reads the migration guide, Then it shows the exact
  difference to apply to their pipeline file.

---

## Functional Requirements

### Pipeline chain

- **FR-001:** The bug-fix pipeline MUST run the BA/Product Agent as its entry step, followed
  by Developer, QA and Reviewer, in that order: BA → Dev → QA → Reviewer.
- **FR-002:** The BA/Product Agent step in the bug-fix pipeline MUST have the same time limit
  as the BA/Product Agent step in the feature pipeline (60 minutes).
- **FR-003:** A successful BA/Product Agent step MUST advance the pipeline to the Developer
  step.

### Routing

- **FR-004:** When the BA/Product Agent step reports `spec_gap` or `needs-human`, the pipeline
  MUST repeat the BA/Product Agent step, as the feature pipeline does.
- **FR-005:** When the Developer step reports `spec_gap`, the pipeline MUST route to the
  BA/Product Agent step. This replaces the current route back to the Developer step.
- **FR-006:** When the Reviewer step reports `spec_gap`, the pipeline MUST route to the
  BA/Product Agent step, matching the feature pipeline.
- **FR-007:** All other existing routes MUST be unchanged: QA `fail`/`blocker`/`timeout` →
  Dev; Reviewer `fail`/`blocker` → Dev; Dev `blocker`/`needs-human` → Dev; Dev `success` →
  QA; QA `success` → Reviewer.
- **FR-008:** The pipeline's existing trigger labels, loop budget (iterations per route,
  total steps, wall-clock limit) and file format version MUST be unchanged. The added step
  MUST fit within the existing total-step budget.

### Developer Agent behaviour

- **FR-009:** The Developer Agent's definition MUST state that a missing spec for the issue is
  reported with the result `spec_gap`, not `blocker`, so that the pipeline routes it to the
  BA/Product Agent.
- **FR-010:** The Developer Agent MUST continue to refuse to author specs. Nothing in this
  change may permit it to draft, or skip, a spec.

### Bug-fix spec format (Template C)

- **FR-011:** The BA/Product Agent's definition MUST include a bug-fix spec format ("Template
  C — Bug Fix") and MUST direct the agent to use it when the issue carries `type:bug`.
- **FR-012:** A bug-fix spec MUST contain: an Overview stating observed versus expected
  behaviour; the Reproduction steps; one or more testable functional requirements describing
  the corrected behaviour; a success criterion requiring a regression test that fails before
  the fix and passes after; an "Out of Scope" section; and a one-line security and privacy
  note (which may state "N/A" with a reason).
- **FR-013:** A bug-fix spec MUST be a complete spec at the standard location for the issue
  (`specs/NNN-slug/spec.md`, NNN = issue number), so that the spec quality check, QA and
  Review work unchanged.
- **FR-014:** The BA/Product Agent MUST leave no unresolved clarification markers and no open
  questions in a bug-fix spec at handoff, as for any other spec.
- **FR-015:** The BA/Product Agent's definition MUST state that the bug-fix format is
  intentionally short and that the spec quality check must not require feature-only sections
  (user stories, key entities) for it.
- **FR-016:** The BA/Product Agent's existing handling of issues labelled `status:needs-info`
  (infer missing reproduction details, or stop and ask) MUST apply to bug issues unchanged.

### Dual-runtime consistency

- **FR-017:** Every change to a BA/Product Agent or Developer Agent definition MUST be applied
  to every copy of that definition (source and installed copies, Claude and Copilot variants)
  so the two runtimes behave equivalently. The repository's existing mirror check MUST pass.

### Documentation

- **FR-018:** The pipelines reference MUST show the bug-fix chain as BA → Dev → QA → Reviewer,
  including its footnote describing which steps can loop back.
- **FR-019:** The agent inventory MUST list the bug-fix pipeline against the BA/Product Agent
  as well as the Developer Agent.
- **FR-020:** The changelog MUST record the change, classified as a minor (non-breaking)
  change.
- **FR-021:** The migration guide MUST describe the change and give the exact difference for
  adopters who maintain their own copy of the bug-fix pipeline file, including that a
  re-install does not overwrite an existing pipeline file.

### Tests

- **FR-022:** Automated tests MUST cover the new routes: BA success → Dev, and Dev `spec_gap`
  → BA (the constitution requires a test for any new or modified routing rule). They MUST
  also cover Reviewer `spec_gap` → BA and BA `spec_gap`/`needs-human` → BA.
- **FR-023:** An automated test MUST confirm the bug-fix pipeline file still passes the
  pipeline validator and that its entry step is the BA/Product Agent.

---

## Success Criteria

- [ ] A `type:bug` issue with no pre-existing spec, labelled `triaged`, progresses from the
      BA step to the Developer step without anyone writing a spec by hand.
- [ ] When the Developer Agent is run on an issue with no spec, its reported result is
      `spec_gap` and the pipeline's next step is the BA/Product Agent.
- [ ] Routing tests for BA → Dev, Dev `spec_gap` → BA, Reviewer `spec_gap` → BA and BA
      self-repeat pass, and fail if the corresponding route is removed.
- [ ] The bug-fix pipeline file passes the pipeline validator.
- [ ] A bug spec produced from the bug-fix format passes the spec quality check with no
      failures and fits on roughly one page.
- [ ] The mirror check reports no divergence between the Claude and Copilot copies of the
      two changed agent definitions.
- [ ] The pipelines reference, agent inventory, changelog and migration guide are updated and
      consistent with each other.
- [ ] After the change is merged, issues #376 and #377, re-triggered, get past the first step.
- [ ] A regression test exists that would fail on the pre-change pipeline definition (where
      Dev `spec_gap` routes to Dev).

---

## Out of Scope

- Amending the constitution or exempting `type:bug` from Spec-Before-Code (ADR-377 option C;
  it would need the human-gated amendment path and supersede the ADR).
- Allowing the Developer Agent to draft its own spec, or to skip the spec (ADR-377 options A
  and E).
- Skipping the BA step for "trivial" bugs. The engine does not evaluate step conditions
  today, so this is not buildable and is a separate concern (ADR-377 concern 1).
- Evaluating or correcting step conditions in the engine, or correcting the claim in the
  pipelines reference that the architect step is skipped by its condition. Recommended as a
  separate issue.
- Adding a `timeout` route for the Developer step (ADR-377 concern 2). Recommended follow-up.
- Changes to the feature pipeline or release pipeline.
- Changes to the Orchestrator engine, the Developer Agent runner, workflow permissions or
  the installer. A routing change in a pipeline file is not expected to need any of them.
- Automatically migrating consumer-owned pipeline files.
- Recovering pipeline runs that are in flight when the change is merged (see Assumptions).

---

## Security and Privacy Considerations

N/A — no new permissions, secrets, data flows or external services. The BA/Product Agent
already runs under the permissions it uses in the feature pipeline; the installer and
workflow permission grants are unchanged. No personal data is involved.

---

## Assumptions

- ADR-377 (status: Proposed) is the accepted direction. Merge of the implementation is gated
  on a human maintainer confirming the cost trade-off the ADR names: one extra BA run and one
  spec PR for every bug, including one-line fixes, adding up to about 60 minutes of latency.
  If the maintainer chooses a constitution amendment instead, this spec is superseded.
- The BA/Product Agent's existing spec branch, spec pull request and hand-off behaviour,
  proven in the feature pipeline, is reused for bug specs without modification beyond the new
  format.
- The existing 20-step budget for the bug-fix pipeline leaves enough headroom for one extra
  step; no budget change is needed.
- The installer leaves an existing project pipeline file untouched, so adopters with their own
  copy must update it by hand (FR-021). Verified in the installer's pipeline-install routine.
- Runs that are in flight when the change merges may reference the old step order. The change
  should be applied when no bug-fix run is active; runs already stuck (#376, #377) are
  re-triggered after merge.
- The "constitution check" for this work is satisfied without amendment: the change conforms to
  §II (traceability: every bug now gets a spec directory and branch), §III (spec before code,
  roles not conflated) and §VIII (routing remains declarative and in the Orchestrator).

---

## Open Questions

None. All questions are resolved; the cost trade-off in Assumptions is a merge gate for the
maintainer, not an open specification question.
