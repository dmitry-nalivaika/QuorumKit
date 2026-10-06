# Spec: Bug-Fix Pipeline Produces a Spec Before Development — Issue #377

**Issue:** #377
**Branch:** `377-dev-agent-blocks-bug-fix-pipeline-spec-f` (generated from the issue title by the pipeline tooling; the spec directory slug is shorter, see Assumptions)
**Type:** bug-fix (Template C — Bug Fix)
**Status:** ready (amended after review of PR #395; merge gated on ADR-377, see Assumptions)
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

The first review of the implementation (PR #395) showed that changing the pipeline file alone is
not enough, because the two automated agents involved cannot yet do what the new routes
assume: the Developer Agent, when run automatically, cannot report `spec_gap`, and the BA/Product
Agent, when run automatically, posts a requirements summary as a comment but never creates the
spec file. This change therefore also covers those two capabilities (FR-024 to FR-032).

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
- Given the BA/Product Agent step runs as an automated workflow on a `type:bug` issue that has
  no spec, When it finishes successfully, Then a bug-fix spec file for the issue has been
  created and published (not only described in a comment).
- Given the BA/Product Agent step runs as an automated workflow and cannot produce a spec,
  When it finishes, Then it reports `spec_gap` and no spec file is written.
- Given the BA/Product Agent cannot establish what the bug is from the report,
  When it finishes with `needs-human`, Then the pipeline does not advance to development
  against an invented description: it repeats the BA step (FR-004) and, once the existing
  per-route iteration limit is reached, stops and flags the issue for a person.

### US-2: A missing spec is routed to the role that can fix it (Priority: P1)

As a **maintainer**, I want a missing or inadequate spec found during development or review
to send the issue back to the BA/Product Agent, so that the pipeline does not loop on a
step that is forbidden from writing specs.

**Acceptance Scenarios:**
- Given the Developer Agent finds no spec for the issue, When it reports its result,
  Then the result is `spec_gap` and the pipeline returns to the BA/Product Agent.
- Given the Developer Agent runs as an automated workflow and finds no spec, When it
  finishes, Then the result the Orchestrator reads is `spec_gap` (not `blocker` or
  `needs-human`), and no later report replaces it.
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
  step. "Successful" means a spec for the issue exists and has been published (FR-025).

### Routing

- **FR-004:** When the BA/Product Agent step reports `spec_gap` or `needs-human`, the pipeline
  MUST repeat the BA/Product Agent step, as the feature pipeline does. Repetition is bounded
  by the existing per-route iteration limit; when it is exhausted the run stops and the
  issue is flagged for a person (existing loop-budget behaviour, unchanged).
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

### Bug spec authoring by the automated BA/Product Agent step

- **FR-024:** When the BA/Product Agent step runs on a `type:bug` issue that has no spec, it
  MUST create the spec file for the issue in the bug-fix format and publish it (spec branch and
  pull request, as for feature specs). This MUST hold when the step runs as an automated
  workflow, not only when a person runs the agent interactively.
- **FR-025:** The BA/Product Agent step MUST report `success` only when a spec file for the
  issue exists and has been published. When no spec could be produced it MUST report
  `spec_gap`, and when the report does not contain enough to establish the bug (FR-016) it
  MUST report `needs-human`. It MUST NOT report `success` without a spec.
- **FR-026:** When a spec for the issue already exists (for example one written by hand), the
  BA/Product Agent step MUST reuse it: no second spec directory and no second pull request.
- **FR-027:** A spec created by the automated step MUST meet the same hand-off bar as any
  other bug-fix spec (FR-012 to FR-015) and MUST NOT contain facts that are not in, or
  inferable from, the issue. If they cannot be established, FR-025 applies and no spec is
  written.
- **FR-028:** The automated BA/Product Agent step MUST write only the spec file (and the
  active-feature pointer) to the repository; the existing rule that any other changed file
  stops the publish remains.

### Developer Agent result reporting

- **FR-029:** `spec_gap` MUST be an accepted result in every way the Developer Agent can be
  run (automated workflow and interactive), so a missing spec is reported as `spec_gap`
  (FR-009) and is not rewritten into `blocker` or `needs-human`.
- **FR-030:** A Developer Agent run MUST end with exactly one reported result. A run that
  finds no spec MUST NOT report `spec_gap` and then a second, different result: the
  Orchestrator acts on the most recent report, so a second report would override it.
- **FR-031:** The instructions given to the Developer Agent when it runs as an automated
  workflow MUST tell it to report a missing spec as `spec_gap` through the single reporting
  mechanism available in that mode, and MUST NOT contradict the agent definition (FR-009).
- **FR-032:** The Developer Agent's definition of what it may report MUST list `spec_gap`
  consistently wherever the list of results appears.

### Dual-runtime consistency

- **FR-017:** Every change to a BA/Product Agent or Developer Agent definition, and to the
  automated workflow or runner that executes either agent (FR-024 to FR-032), MUST be applied
  to every copy of that file (source and installed copies, Claude and Copilot variants) so the
  runtimes behave equivalently. The repository's existing mirror check MUST pass.

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
- **FR-033:** An automated test MUST cover the Developer Agent's automated run: `spec_gap` is
  accepted as a result, the resulting report is the one the Orchestrator reads, and that
  report routes the bug-fix pipeline from Dev to BA. It MUST fail if `spec_gap` is removed
  from the accepted results.
- **FR-034:** Automated tests MUST cover the automated BA/Product Agent step: given a reply
  containing a bug-fix spec for an issue with no spec, a spec file is written at the standard
  location and the step reports `success`; given a reply with no usable spec, nothing is
  written and the step reports `spec_gap`; given an existing spec, no second spec is created
  (FR-024 to FR-027).

---

## Success Criteria

- [ ] A `type:bug` issue with no pre-existing spec, labelled `triaged`, progresses from the
      BA step to the Developer step without anyone writing a spec by hand.
- [ ] When the Developer Agent is run on an issue with no spec, its reported result is
      `spec_gap` and the pipeline's next step is the BA/Product Agent.
- [ ] Routing tests for BA → Dev, Dev `spec_gap` → BA, Reviewer `spec_gap` → BA and BA
      self-repeat pass, and fail if the corresponding route is removed.
- [ ] Run as an automated workflow on a `type:bug` issue with no spec, the BA/Product Agent
      step leaves a published spec file for the issue (FR-024), not only a comment.
- [ ] Run as an automated workflow on an issue with no spec, the Developer Agent's final
      reported result is `spec_gap` and it is the only result reported (FR-029, FR-030).
- [ ] Runner-level and BA-step-level tests (FR-033, FR-034) pass, and fail if `spec_gap` is
      removed from the Developer Agent's accepted results or if the BA step stops writing the
      spec file.
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
- Changes to the Orchestrator engine, workflow permissions or the installer. The existing
  permissions of the BA/Product Agent workflow (repository content, issues, pull requests)
  already cover FR-024 and are not widened.
- Making the Developer Agent's automated run read a spec that exists only on an unmerged
  spec branch (see Assumptions). Spec-handoff timing stays as in the feature pipeline.
- Declaring bug specs to be authored only by a person running the BA agent locally. That
  would leave the pipeline unable to finish a bug without manual work, which is the defect.
- Changing how the BA/Product Agent writes feature specs (Templates A and B).
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
- The BA/Product Agent's existing spec branch, spec pull request and hand-off behaviour
  (publish step, dirty-tree guard, create-or-update pull request) is reused for bug specs.
  Review of PR #395 showed that the automated step does not yet author the spec file itself;
  that gap is closed by FR-024 to FR-028 and is no longer assumed away.
- The Developer Agent's automated run reads the repository as checked out by its workflow
  (default branch). As in the feature pipeline today, a spec published on its own branch is
  seen by development once its pull request is merged or the run is dispatched against that
  branch. This change does not alter that timing; if it proves to block bug fixes in practice
  it is a separate issue.
- The spec directory slug (`bug-fix-pipeline-spec-gate`) is intentionally more descriptive than
  the branch name the pipeline tooling generated from the issue title. Renaming either would
  break existing references (tests, ADR, changelog) and is not worth a rename; the active
  feature pointer records the real branch.
- The existing 20-step budget for the bug-fix pipeline leaves enough headroom for one extra
  step; no budget change is needed.
- When the BA/Product Agent runs as a pipeline step, it reports `success` after publishing a
  spec (as in the feature pipeline), so the BA `success` route is the one that fires. The
  `spec-ready` outcome in the agent definition applies to the spec pull request hand-off, not
  to pipeline routing.
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
