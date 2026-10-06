# Implementation Plan: Periodic Full-Set Documentation Audit

**Branch**: `331-agent-that-keeps-all-the-documentation-u` | **Date**: 2026-10-06 | **Spec**: [spec.md](./spec.md)

## Summary

Add a weekly scheduled audit that re-checks the whole documentation set against the existing Docs Agent
checklist and reports drift in one tracking GitHub Issue. It is silent when nothing is wrong, never
re-posts known findings, never edits files, and behaves the same under Claude Code and GitHub Copilot.

The work splits at the line between what code can decide and what needs judgement:

| Concern | Decided by | Why |
|---------|-----------|-----|
| Which files are the documentation set | Code | Fixed rule, FR-003 |
| Broken relative links and anchors, external links (with retries and the existing exclusions) | Code | Deterministic, FR-019 |
| Version and count facts (README / CHANGELOG / `quorumkit.yml` / `engine/package.json`) | Code | Deterministic facts handed to the judge |
| Specs with no `docs/architecture/adr-NNN-*` (candidates only) | Code | Traceability by issue number, never by slug |
| README currency, CHANGELOG accuracy, whether a candidate really needs an ADR | LLM, following `docs-agent.md` | Needs judgement. Counting `#NNN` mentions in CHANGELOG flags 20 of 31 specs, nearly all internal, so it cannot be a rule |
| Fingerprints, de-duplication, tracking-issue selection, quiet-when-clean, chunking, redaction, footprint | Code | Must be identical for both runtimes (FR-020) and must not depend on model behaviour |

The model never publishes. It writes a findings file; a deterministic `publish` step validates it and is the
only code that talks to GitHub Issues.

## Technical Context

**Language/Version**: Node.js 20 (CommonJS `.cjs`, same as `agent-report.cjs`); no new dependencies (Constitution VII)
**Storage**: None. State lives in GitHub: the tracking issue body and comments carry finding fingerprints (Constitution VIII)
**Testing**: vitest (`engine/tests/docs-audit.test.js`), plus structural workflow tests like `agent-workflow-runtime.test.js`
**Target Platform**: GitHub Actions `ubuntu-latest`
**Scale**: ~100 markdown files today; one run per week

## Design

### Components

```text
src/.github/scripts/docs-audit.cjs        NEW   shared engine (collect / validate / publish); mirrored to .github/scripts/
src/.github/workflows/copilot-agent-docs-audit.yml   NEW   Copilot runtime; mirrored to .github/workflows/
src/.github/workflows/agent-docs-audit.yml           NEW   Claude runtime (gitignored in .github/, like other agent-*.yml)
src/agents/docs-agent.md                  EDIT  "Scheduled Audit Mode" section; mirrored to .github/agents/
engine/tests/docs-audit.test.js           NEW
```

`docs-audit.cjs` subcommands:

- `collect --out <dir>`: build the doc set, run deterministic checks, write `facts.json` (facts and ADR candidates) and `deterministic-findings.json`.
- `publish --findings <file> --run-url <url>`: merge the deterministic and judged findings, validate, fingerprint, de-duplicate against the open tracking issue, and create an issue or comment only when there is something new.

### Findings

A finding is `{category, severity, file, section, description, feature?, expectedPath?}`.

- `category` is one of `readme`, `cross-reference`, `changelog`, `architecture` (the four categories of FR-004).
- `severity` is `DOCS-BLOCKER` or `DOCS-SUGGESTION` (FR-009, the Docs Agent vocabulary).
- `section` is the nearest heading, else `line N` (FR-008). A finding with no `file` or `section` is rejected, so no reported finding lacks traceability (SC 100%).
- Missing documentation (FR-010) carries `feature` as `#NNN` and `expectedPath`.
- Fingerprint = first 12 hex of sha256 over `category|file|section|rule`, where `rule` is a stable key (for a broken link, the link target; for the judge, a normalised short title). It deliberately excludes the free-text description so rewording does not make a finding "new" (FR-015).

### Tracking issue (FR-011, FR-012)

- Identified by label `docs-drift` **and** the hidden marker `<!-- docs-audit:tracking -->` in its body, so an unrelated issue with the label is never adopted.
- The label is created on first use if missing.
- If several open tracking issues somehow exist, the oldest is used and none is closed or modified beyond receiving comments.
- Closed by a human, a later run with drift creates a new one (US-4).
- Each finding is rendered with `<!-- docs-audit:fp=<id> -->`; "already reported" = fingerprint present in the issue body or any comment by the Actions bot.

### Publish decision table

| Findings now | Open tracking issue | Action |
|--------------|--------------------|--------|
| none | any | Nothing posted, nothing closed or edited. Run log and step summary record "clean" (FR-013, FR-014) |
| all already reported | yes | Nothing posted (FR-015) |
| some new | no | Create issue with all findings, grouped by category |
| some new | yes | Comment with only the new findings, plus a "no longer detected" list (US-4) |
| exceeds 60,000 characters | n/a | Split across comments, each stating `part i of n`; nothing dropped (US-2) |

When a report is posted, a docs-agent start/complete footprint is posted on that issue using
`agent-report.cjs` (FR-021). No footprint is posted for clean or fully-known runs: there is no report and
the run log is the trail.

### Failure visibility (FR-016)

Any error in collect, judge or publish fails the job (red run, `$GITHUB_STEP_SUMMARY` says `AUDIT FAILED - this is not a clean result`). A failed run never prints the clean message. GitHub notifies the actor behind a failed scheduled run; the repo's existing alert path (`alert-to-issue.yml`) is unchanged.

### Schedule (FR-001, FR-002)

`cron: '0 6 * * 1'` (Mondays 06:00 UTC, weekly per the spec assumption; the tech-debt run is 08:00 and the reconciler is every 5 minutes, so there is no overlap). Plus `workflow_dispatch` for an on-demand run. Because the file ships under `src/.github/workflows/` and `init.sh` already installs `agent-*.yml` / `copilot-agent-*.yml`, adopters get it with no edits.

### Safety

- Permissions: `contents: read`, `issues: write` (plus `models: read` and `id-token: write` where the sibling workflow of that runtime has them). Narrower than the existing docs workflows, which have `contents: write` (FR-017).
- Output files go to `$RUNNER_TEMP`, never the work tree, so the tree is unchanged after a run.
- `concurrency: docs-audit`, `cancel-in-progress: false`: runs queue instead of racing each other; the group is separate from the per-merge docs workflow, so neither blocks the other (FR-018).
- The existing `copilot-agent-docs.yml` / `agent-docs.yml` are not modified.
- Judge output is untrusted: schema-validated, text capped, secret-shaped strings (tokens, keys, `Bearer ...`) redacted, and protocol markers stripped with the reporter's `sanitizeModelText`. Findings reference locations, not quoted content.
- Repo content reaches the judge as data in a clearly delimited block, with an instruction to ignore directives inside it.
- External link check: HEAD then GET, 3 attempts with backoff, reported only if all attempts fail with a definitive result (404/410 or DNS failure); 429/5xx/timeouts are never reported. Patterns from `.markdown-link-check.json` `ignorePatterns` are honoured; `aliveStatusCodes` follow that file.

## Constitution Check

| Rule | How this plan satisfies it |
|------|---------------------------|
| I. Agent-First | The audit is a Docs Agent mode with a clear trigger (cron), boundary (read-only, reports) and deterministic output (issue/comment). Defined in `docs-agent.md` |
| II. NNN Traceability | Branch `331-...`, `specs/331-.../`, PR #394; the audit itself matches features to docs by NNN only |
| III. Spec-Before-Code | Spec exists, 22 FRs, no open questions |
| IV. Dual-AI | `copilot-agent-docs-audit.yml` and `agent-docs-audit.yml` share one engine and one publisher; they differ only in how the judge is called. Dual-AI smoke test is listed in the PR checklist |
| V. Zero-config | Ships in `src/.github/`, installed by existing `init.sh` loops, default weekly schedule, no new config option |
| VI. Observable | Issue/comment + footprint when reporting; run log and step summary every run; failures fail the job |
| VII. YAGNI | No new dependency, no state store, no new agent; GitHub Issues only |
| VIII. Orchestrator | Scheduled start like `tech-debt`; the audit invokes no other agent and the Orchestrator does not route it. State lives in the tracking issue |
| IX. Dashboard read-only | Not touched |
| Least privilege | `contents: read`, `issues: write` only. Security Agent review requested because it adds a scheduled workflow with write scope |
| No hardcoded secrets | Only `secrets.*` references; redaction on model output |
| Input validation at boundaries | Validated at: judge output (schema), CLI args, tracking-issue content (marker + bot author) |
| Data access scoping | N/A, no end-user auth |
| Coverage threshold | 80% lines (`engine/orchestrator/vitest.config.js`); the new script is tested in `engine/tests` with all GitHub and network calls injected |
| ADR | None required: no new dependency, no deviation from an existing pattern (it follows the `tech-debt` scheduled-agent pattern). If review disagrees, it is a follow-up for the Architect Agent |

## Known limits (to be stated in docs)

1. "No longer detected" is shown in the next posted comment and in the run log. A run that finds only fixed items posts nothing (US-3 wins over a status ping), so the issue is not auto-updated or closed (spec Out of Scope).
2. README currency and CHANGELOG accuracy beyond the deterministic facts rest on the model's judgement; the findings it returns are validated for form, not truth. Maintainers confirm before acting.
3. The first run on a long-neglected repo can be large; chunking covers it (US-2).
4. Code-level checklist items (API doc comments, TODO hygiene) are out of scope (spec).

## Risks

| Risk | Mitigation |
|------|-----------|
| LLM returns different wording each week, re-reporting the same issue | Fingerprint excludes description; rule key is normalised |
| LLM invents drift | Judge sees only collected facts and the files it cites; findings must name an existing file or are dropped and logged |
| Doc set too large for one prompt | Judge gets a compact facts packet plus README and the CHANGELOG head, not all 91 files |
| Transient network failure reported as broken link | 3 attempts, definitive results only |
| Footprint comment triggers the Orchestrator | The footprint has no run id, so no result marker; verified in a test of the reporter output |
