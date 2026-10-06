# Spec: Periodic Full-Set Documentation Audit — Issue #331

**Feature Branch**: `331-agent-that-keeps-all-the-documentation-u`
**Created**: 2026-10-06
**Status**: Draft
**Input**: GitHub Issue #331 — "Agent that keeps all the documentation up to date"

## Overview

Project documentation drifts out of sync with the code as features land across many merges. Today the Docs Agent reviews documentation only after a single merge or on request, so drift that builds up across several merges, or in files no single change touched, is never caught. This feature adds a recurring audit that re-checks the **entire** documentation set against the existing Docs Agent checklist and reports any drift to maintainers. It is silent when everything is current and never edits documentation itself.

## User Stories

### US-1: Recurring audit of the full documentation set (Priority: P1)

As a maintainer, I want the whole documentation set to be audited automatically on a regular schedule, so that drift accumulated over many merges is found even if nobody remembers to ask for a review.

**Why this priority**: This is the core gap the issue describes. Without a recurring, request-independent audit nothing else in this feature has value.

**Independent Test**: With the schedule active and no merge or manual request in the interval, confirm an audit run takes place and that it examined documentation files that no recent change touched.

Acceptance Scenarios:
- Given the audit schedule is active and no merge or `@docs-agent` request has occurred in the interval When the scheduled time arrives Then a full audit of the documentation set runs.
- Given a documentation file has not been modified by any recent change but contains a broken link When the scheduled audit runs Then that link is detected.
- Given the audit cannot complete (for example the documentation set cannot be read or a check cannot run) When the scheduled time arrives Then the run is visibly recorded as failed and is clearly distinguishable from a "no drift found" result.

---

### US-2: Traceable drift report for maintainers (Priority: P1)

As a maintainer, I want drift findings summarised in a GitHub Issue (or a comment on an existing tracking issue), so that I can see exactly which file and section need attention and act on it.

**Why this priority**: An audit that finds drift but does not make it actionable does not close the gap. Traceability to file and section is an explicit acceptance criterion.

**Independent Test**: Introduce a known stale statement in one documentation file, run the audit, and confirm the resulting report names that file and section and the category of drift.

Acceptance Scenarios:
- Given the audit finds one or more drift items and no open tracking issue exists When the audit completes Then a new GitHub Issue is created summarising each finding with its category, file path, and section.
- Given the audit finds drift and an open tracking issue already exists When the audit completes Then the findings are added as a comment on that issue and no second tracking issue is created.
- Given a finding refers to a missing item rather than a wrong one (for example a merged feature with no architecture document) When the report is produced Then the finding names the feature (by issue number) and the location where the missing documentation is expected.
- Given a very large number of findings (for example on the first audit of a long-neglected repository) When the report is produced Then findings are grouped by category and nothing is silently dropped; if the content must be split across multiple comments, the report says so.

---

### US-3: No noise when documentation is current (Priority: P1)

As a maintainer, I want the audit to stay quiet when it finds nothing, so that I only hear from it when there is something to do.

**Why this priority**: An audit that posts on every run trains maintainers to ignore it. Quiet success is an explicit acceptance criterion.

**Independent Test**: Run the audit against a repository whose documentation is fully current and confirm no issue and no comment is created anywhere.

Acceptance Scenarios:
- Given the documentation set has no drift When the scheduled audit completes Then no GitHub Issue is created and no comment is posted.
- Given the documentation set has no drift When the scheduled audit completes Then the run's own log still records that the audit executed and found nothing, so that a clean run is verifiable but not announced.
- Given an open tracking issue exists and a later audit finds no drift When the audit completes Then no comment is posted on it and it is not closed automatically.

---

### US-4: No repeated reports of unchanged findings (Priority: P2)

As a maintainer, I want repeated audits not to re-post findings I already know about, so that the tracking issue stays readable and my notifications stay meaningful.

**Why this priority**: Drift that is acknowledged but not yet fixed will persist across several scheduled runs. Without this, the feature would become the noise that US-3 is meant to prevent.

**Independent Test**: Run the audit twice in a row against an unchanged repository that contains drift and confirm the second run adds nothing to the tracking issue.

Acceptance Scenarios:
- Given an open tracking issue already lists a set of findings and nothing has changed When the next audit runs Then no new comment is posted.
- Given an open tracking issue lists findings and the next audit finds additional new drift When the audit completes Then a comment is posted that identifies only the new findings.
- Given some previously reported findings have since been fixed When the next audit completes Then the maintainer can tell which earlier findings no longer apply.
- Given the previous tracking issue was closed by a maintainer and drift is still present When the next audit completes Then a new tracking issue is created.

---

### Edge Cases

- The repository contains no documentation beyond a README: the audit still runs and checks what exists; missing categories are not treated as failures unless the checklist requires them.
- A documentation file links to an external URL that is temporarily unreachable: the audit does not report a transient network failure as permanent drift on a single failed attempt.
- A feature has an architecture document under a different slug than its issue number suggests: matching is by issue number (NNN traceability), not by slug text.
- The audit runs while a per-merge Docs Agent review is also running: neither may block or corrupt the other, and the audit's findings do not replace the per-merge review.
- Repository has never been audited before: the first run treats the whole history as the baseline and may produce a large report (see US-2 large-report scenario).
- A finding is in a file that is intentionally exempt from link checking: the audit honours the repository's existing link-check exclusions rather than reporting excluded links.

## Functional Requirements

- FR-001: The system MUST run a documentation audit on a defined, recurring schedule, with no dependency on any merge event or manual request.
- FR-002: The default schedule MUST be defined out of the box so that a project adopting this package gets the recurring audit without manual edits.
- FR-003: Each audit MUST examine the entire documentation set of the repository (root-level documents, the documentation directory, architecture decision records, the changelog, and feature specs), not only content changed since the last merge.
- FR-004: Each audit MUST evaluate, at minimum, these four categories, using the same checklist the Docs Agent already follows for per-merge reviews: (a) README currency, (b) cross-reference and link validity, (c) CHANGELOG accuracy, (d) presence of architecture documentation for merged features that meet the existing ADR-triggering criteria.
- FR-005: The audit MUST use the existing Docs Agent checklist as its single source of truth for what constitutes drift; the checklist MUST NOT be duplicated or redefined for the audit.
- FR-006: Checklist items that the per-merge review phrases relative to "the merged change" MUST be evaluated for the audit against the current state of the repository as a whole.
- FR-007: When at least one finding exists, the system MUST create a GitHub Issue, or add a comment to an existing open tracking issue, that summarises the findings.
- FR-008: Every finding MUST identify its category, the file path, and the section (heading, or line when no heading applies) that needs attention.
- FR-009: Each finding MUST be labelled with the severity vocabulary the Docs Agent already uses (blocker versus suggestion).
- FR-010: A finding about missing documentation for a merged feature MUST identify the feature by its issue number and state where the missing document is expected.
- FR-011: The system MUST maintain at most one open tracking issue for documentation drift at a time; new findings are added to it rather than creating a second one.
- FR-012: The tracking issue MUST be reliably identifiable by both maintainers and the audit itself, so that later audits find and reuse it.
- FR-013: When no findings exist, the system MUST NOT create an issue or post a comment, and MUST NOT close or modify an existing tracking issue.
- FR-014: A run that finds no drift MUST still leave a verifiable record in the run's own log that the audit executed and what it covered.
- FR-015: The system MUST NOT re-report findings that an open tracking issue already lists and that are unchanged; only new findings are reported on later runs.
- FR-016: If the audit cannot complete, the failure MUST be visible to maintainers and MUST NOT be indistinguishable from a clean "no drift" result.
- FR-017: The audit MUST NOT edit, delete, or create any documentation or other repository file; it only reports.
- FR-018: The audit MUST NOT replace, disable, or change the behaviour of the existing per-merge and on-request Docs Agent reviews.
- FR-019: The audit MUST honour the repository's existing exclusions for link checking and MUST NOT report a link as broken on the basis of a single transient failure.
- FR-020: The audit MUST behave equivalently under both supported AI runtimes (Claude Code and GitHub Copilot).
- FR-021: The audit MUST leave a human-readable audit trail for every run in which it posts a report, consistent with the project's agent footprint convention.
- FR-022: The audit and its scheduling behaviour MUST be documented, including the default schedule, what is checked, how findings are reported, and how a maintainer acts on them.

## Success Criteria

- [ ] An audit run occurs on the defined schedule in an interval containing no merge and no manual request.
- [ ] A deliberately introduced broken link in a file untouched by any recent change is reported by the next audit, identifying the file and section.
- [ ] A deliberately introduced stale README statement, an unlogged user-facing change, and a merged ADR-triggering feature with no architecture document are each reported under the correct category.
- [ ] Across at least 3 consecutive audits of a repository with current documentation, zero issues and zero comments are created.
- [ ] Two consecutive audits of an unchanged repository containing drift result in exactly one report; the second adds nothing.
- [ ] At no point are two open documentation-drift tracking issues present at the same time.
- [ ] 100% of reported findings include a category, file path, and section or line reference.
- [ ] A forced audit failure is visible to maintainers and is not mistaken for a clean result.
- [ ] After an audit, the working tree and all documentation files are unchanged.
- [ ] The existing per-merge Docs Agent review still runs on merge and on `@docs-agent`, unchanged.
- [ ] A project installing this package gets the scheduled audit active with no manual configuration.

## Key Entities

- Documentation Set: All of the repository's own documentation — root documents, the documentation directory, architecture decision records, the changelog, and feature specs. External wikis and third-party documents are not part of it.
- Audit Checklist: The existing Docs Agent checklist, the single definition of what counts as drift.
- Audit Run: One execution of the audit; has a start time, a scope, and an outcome (clean, drift found, or failed).
- Finding: One detected instance of drift; has a category, a severity, a file path, a section or line reference, and a short description of what is out of date.
- Drift Report: The GitHub Issue (or comment on it) that presents the findings of one or more audit runs to maintainers.
- Tracking Issue: The single open GitHub Issue that accumulates drift reports until a maintainer closes it.

## Out of Scope

- Automatically rewriting or fixing documentation without human review; the audit reports and a maintainer or the existing Docs Agent workflow performs the edit.
- Auditing content outside this repository's own documentation and specs (external wikis, third-party documentation).
- Replacing or altering the existing per-merge documentation review.
- Code-level documentation checks from the Docs Agent checklist (public API doc comments, inline comments, TODO and FIXME hygiene); this version covers documentation files only.
- Automatically opening a fix PR, assigning owners, or notifying through channels other than GitHub Issues.
- Automatically closing the tracking issue when drift is resolved.
- Configurable or per-project customisation of severity rules or checklist content.

## Security and Privacy Considerations

N/A for personal data: the audit reads only repository documentation and handles no PII; standard open-source data classification applies (per the project constitution). The audit is read-only with respect to repository content and writes only GitHub Issues or comments, so it requires issue-write access but no content-write access. Any change to automation permissions or scheduled agent invocation is subject to Security Agent review under the constitution. Findings must not quote secrets or credentials that may appear in documentation; they reference location only.

## Assumptions

- The default cadence is weekly. The issue requires a "defined recurring schedule" without a period; weekly balances timely detection against noise. The architect or developer may adjust it if justified.
- The audit's findings are surfaced only as GitHub Issues or comments, consistent with the project's preference for existing GitHub primitives.
- "Merged features" and their ADR-triggering status are determined by issue-number traceability (issue, spec directory, architecture document) and the Architect Agent's existing ADR criteria.
- "Unchanged" findings are determined by comparing the category, file, and section of a finding with those already listed in the open tracking issue.
- The existing link-check exclusion configuration is the authoritative definition of links that must not be reported.
- An on-demand run of the audit is not required by this feature but is not prohibited.
- How the audit is triggered and sequenced relative to the Orchestrator is a design decision for later steps; this spec only requires the behaviour described above.
- The trailing "Docs Review" report format of the Docs Agent may be reused for presenting findings, as long as the traceability fields in FR-008 are present.

## Open Questions

None. All ambiguities were resolved through the assumptions above.
