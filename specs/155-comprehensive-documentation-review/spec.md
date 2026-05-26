# Spec: Comprehensive Documentation Review — Issue #155

## Overview

All Markdown files in the QuorumKit repository are reviewed for accuracy,
completeness, clarity, consistency, broken links, and onboarding quality.
Identified issues are fixed in-place by the docs-agent and delivered in a single
consolidated PR. The review is conducted file-by-file in priority order, creating
a visible feedback loop where each fix is traceable in the PR diff.

## User Stories

### US-1: Accurate and complete setup documentation

As a new user, I want README.md and INIT.md to contain accurate, complete
installation and setup instructions, so that I can adopt QuorumKit without
encountering undocumented errors or gaps.

Acceptance Scenarios:
- Given I open README.md, when I follow every step listed under "Getting Started",
  then I can successfully run the project locally without consulting external sources.
- Given I open INIT.md, when I read the initialisation guide, then every command
  listed resolves without error on a clean clone and no prerequisites are undocumented.
- Given any link in README.md or INIT.md, when I follow it, then it resolves to
  a valid target (file, anchor, or URL) that still exists.

### US-2: Consistent terminology across all docs

As a contributor, I want all Markdown files to use the same terminology for agents,
pipelines, commands, and file paths as defined in the project constitution, so that
I can navigate documentation confidently without encountering contradictory names
or outdated references.

Acceptance Scenarios:
- Given I read any agent definition file, when I compare it with the constitution's
  role definitions, then all role names, trigger types, and output descriptions match
  the canonical definitions.
- Given I read any guide in `docs/`, when I encounter a component name, then it
  matches the current branding and naming introduced in ADR-067.
- Given any cross-document reference (e.g. "see PIPELINES.md"), when I follow it,
  then the heading or section referenced actually exists in the target document.

### US-3: Trustworthy architecture decision records

As a project architect, I want all ADRs to reflect the current state of the system
and to reference the correct component names, file paths, and agent roles, so that
design decisions remain a reliable source of truth.

Acceptance Scenarios:
- Given I read any ADR, when I check the component names against the codebase, then
  no obsolete names or pre-rebranding identifiers appear.
- Given any code or file path cited in an ADR, when I look it up in the repository,
  then the path exists or the ADR contains an explicit note that it has moved.
- Given an ADR's "Status" field, when I verify it against merged PRs, then the
  status is current (e.g. a superseded ADR is marked "Superseded by ADR-NNN").

### US-4: Structured per-file review with feedback loop

As the docs-agent, I want a defined review workflow with an explicit ordered list
of files to process, so that no file is missed and the progress of the review is
fully visible in the PR diff.

Acceptance Scenarios:
- Given the complete list of in-scope files, when I process each one in priority
  order, then every file receives at least one review pass and its status is
  recorded.
- Given a file with no issues, when the review completes, then it is marked
  "reviewed — no changes" and no spurious edits are made.
- Given a file with issues, when the review completes, then all identified accuracy,
  completeness, clarity, consistency, and broken-link issues are fixed in the same PR.

## Functional Requirements

- FR-001: docs-agent MUST process all in-scope Markdown files exactly once, in
  the priority order defined in this spec.
- FR-002: For each file, docs-agent MUST evaluate all six review dimensions:
  accuracy, completeness, clarity, consistency, broken links, and onboarding quality.
- FR-003: Broken internal links MUST be verified by confirming the target
  file/anchor exists in the repository at the time of review.
- FR-004: Terminology inconsistencies MUST be resolved against the canonical
  definitions in `.specify/memory/constitution.md`.
- FR-005: Obsolete pre-rebranding names (superseded by ADR-067) MUST be replaced
  with their current equivalents wherever found.
- FR-006: All fixes MUST be committed to branch `155-comprehensive-documentation-review`
  and delivered in a single consolidated PR that references Issue #155.
- FR-007: The PR description MUST include a manifest table listing every reviewed
  file, its review outcome, and the number of issues fixed.
- FR-008: Files with no issues found MUST NOT receive cosmetic or trivial edits
  (no "improvement for improvement's sake" changes).
- FR-009: ADR "Decision" section content MUST NOT be changed unless the decision
  is factually incorrect (e.g. references a file that no longer exists).
- FR-010: The review MUST NOT restructure the repository (no file moves, renames,
  or directory changes).

## Review Priority Order

Process files in this sequence:

**Group A — Architecture ADRs** (12 files — reviewed first; decisions affect all
other docs)
1. `docs/architecture/adr-002-orchestrator-state-storage.md`
2. `docs/architecture/adr-003-copilot-workflow-github-models-migration.md`
3. `docs/architecture/adr-004-orchestrator-state-comment-model-v2.md`
4. `docs/architecture/adr-005-pluggable-runtime-registry-interface.md`
5. `docs/architecture/adr-006-dual-runtime-source-of-truth-and-sync.md`
6. `docs/architecture/adr-007-orchestrator-github-actions-substrate-contract.md`
7. `docs/architecture/adr-047-action-runtime.md`
8. `docs/architecture/adr-047-repo-topology-and-engine-distribution.md`
9. `docs/architecture/adr-067-quorumkit-rebranding.md`
10. `docs/architecture/adr-175-local-parallel-pipeline-worktree-model.md`
11. `docs/architecture/adr-176-dashboard-pipeline-lifecycle-write-path.md`
12. `docs/architecture/adr-177-pipeline-timeline-data-fetch.md`

**Group B — Agent definitions** (28 files — reviewed second; drive agent behaviour
contracts)
- All `.github/agents/*.md` files (alphabetical order)

**Group C — Root-level docs** (4 files — primary entry points for new users)
- `README.md`
- `CONTRIBUTING.md`
- `CHANGELOG.md`
- `SECURITY.md`

**Group D — docs/ guides** (9 files)
- `docs/INIT.md`
- `docs/PIPELINES.md`
- `docs/LOCAL_PIPELINES.md`
- `docs/DASHBOARD.md`
- `docs/AGENT_PROTOCOL.md`
- `docs/MIGRATION.md`
- `docs/BROWNFIELD_GUIDE.md`
- `docs/DARK_FACTORY_GUIDE.md`
- `docs/ENHANCEMENTS.md`

**Group E — Skills** (16 files)
- All `src/skills/*/SKILL.md` files (alphabetical order)

**Group F — Specs** (plan.md and tasks.md in all specs/ subdirectories)

**Group G — Engine docs** (2 files)
- `engine/RELEASING.md`
- `engine/SECURITY.md`

## Success Criteria

- [ ] All ~70 in-scope `.md` files have been reviewed at least once.
- [ ] All identified accuracy issues are fixed (no references to obsolete components,
      commands, or file paths).
- [ ] All identified broken internal links are resolved (target exists or link is
      removed/updated).
- [ ] All terminology inconsistencies with the constitution are corrected.
- [ ] All identified clarity and completeness gaps are addressed.
- [ ] A PR manifest table lists every reviewed file with its outcome and fix count.
- [ ] The consolidated PR is merged and Issue #155 is closed.

## Key Entities

- **DocumentationFile**: a `.md` file in the repository; identified by its
  repository-relative path, group classification (A–G), review status
  (pending / reviewed-no-changes / reviewed-fixed), and a count of issues found
  and fixed.
- **ReviewManifest**: the ordered list of all DocumentationFiles with per-file
  status and findings; lives in the PR description.
- **ReviewDimension**: one of the six quality axes evaluated for every file —
  accuracy, completeness, clarity, consistency, broken links, onboarding quality.

## Out of Scope

- New documentation for features that have not yet been implemented.
- Structural reorganisation (moving, renaming, or deleting files or directories).
- Changing the substantive content of ADR "Decision" sections unless the decision
  contains a factually incorrect statement.
- Documentation in non-Markdown files (YAML, JavaScript, shell scripts, etc.).
- Writing new ADRs for existing decisions that are not yet documented.
- Updating `CHANGELOG.md` with new release entries (that is the release-agent's
  responsibility).

## Security and Privacy Considerations

N/A — single-user / no-auth system. This feature modifies only static Markdown
documentation. No sensitive data, credentials, or access-controlled content is
processed.

## Assumptions

- `.specify/memory/constitution.md` is the authoritative source for agent role
  names, NNN traceability convention, and project terminology throughout this review.
- ADR-067 defines the canonical post-rebranding names; any pre-rebranding terms
  found in other docs are considered an accuracy issue.
- The review is performed on branch `155-comprehensive-documentation-review`; the
  branch already exists.
- "With feedback loop" means each file is reviewed and fixed before moving to the
  next, so progress is visible incrementally in the PR diff.
- SKILL.md files in `src/skills/` are reviewed for internal consistency and
  accuracy but are not required to mirror agent definitions word-for-word, as they
  serve a different runtime context.

## Open Questions

_None — all questions resolved during BA clarification on 2026-05-26._
