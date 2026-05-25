# Spec: Docs Agent — Real PR Diff Grounding — Issue #11

**Issue:** #11
**Branch:** `011-docs-agent-pr-diff`
**Type:** bug-fix / feature-improvement
**Status:** draft

---

## Overview

The Docs Agent workflow currently sends only a natural-language instruction to the
LLM without supplying any actual PR data. This causes the model to fabricate
("hallucinate") documentation findings. This feature grounds the Docs Agent on the
real GitHub PR diff — files changed, additions, deletions, and commit messages —
so every finding it reports is traceable to actual code changes in the PR.

---

## User Stories

### US-1: Docs Agent reads the real diff on push-to-main

As a **project maintainer**, I want the Docs Agent to analyse the actual files
changed in the PR that was just merged, so that its documentation report reflects
real changes rather than invented ones.

**Acceptance Scenarios:**
- Given a PR is merged into `main`  
  When the Docs Agent workflow runs  
  Then it fetches the diff for that specific PR from the GitHub API  
  And the LLM prompt includes the list of changed files, the unified diff, and the PR title/body  
  And every finding in the report references a file or symbol that actually changed

- Given the merged commit is linked to no open PR  
  When the workflow tries to resolve the PR  
  Then it logs a warning and audits using the commit's changed files only (no hallucinated diff)

- Given the GitHub API returns an error fetching the diff  
  When the workflow handles that error  
  Then it posts a comment stating "Docs Agent could not retrieve PR diff — skipping audit" instead of hallucinating

### US-2: Docs Agent reads the real diff when invoked by comment

As a **developer**, I want to comment `@docs-agent` on my open PR and receive a
report grounded in that PR's actual diff, so that the feedback is actionable and
trustworthy.

**Acceptance Scenarios:**
- Given I comment `@docs-agent` on PR #N  
  When the workflow runs  
  Then it fetches the diff for PR #N from the GitHub API  
  And the LLM prompt includes the changed files and unified diff for that PR  
  And the report contains only findings about files that appear in the diff

- Given the PR diff is very large (> 500 KB)  
  When the workflow truncates the diff  
  Then it includes only the first 400 KB of the unified diff and appends a truncation notice  
  And it does NOT omit the file-change summary (filenames + line counts) even if the body is truncated

### US-3: Audit report is traceable to real changes

As a **reviewer**, I want every DOCS-BLOCKER and DOCS-SUGGESTION item in the
report to reference a specific file and line range that was changed in the PR, so
that I can verify the finding without guessing.

**Acceptance Scenarios:**
- Given the LLM produces a report  
  When it lists a finding  
  Then each finding includes the filename it relates to  
  And the filename must appear in the list of files changed in that PR

---

## Functional Requirements

- **FR-001:** On `push` to `main`, the workflow MUST resolve the PR number associated
  with the triggering commit using the GitHub API (`/repos/{owner}/{repo}/commits/{sha}/pulls`)
  before constructing the LLM prompt.

- **FR-002:** On `issue_comment` or `pull_request_review_comment` trigger where the
  comment body contains `@docs-agent`, the workflow MUST extract the PR number from
  `context.payload.issue.number` (for issue comments on a PR) or
  `context.payload.pull_request.number` (for review comments).

- **FR-003:** The workflow MUST fetch the list of files changed in the resolved PR
  using the GitHub API (`/repos/{owner}/{repo}/pulls/{pull_number}/files`) and include:
  - Each filename
  - Status (`added` / `modified` / `removed` / `renamed`)
  - Additions and deletions count
  - The patch (unified diff) for each file, up to the per-file and total size limits defined in FR-005.

- **FR-004:** The workflow MUST include the PR title, PR body, and PR number in the
  LLM prompt so the model can reference the intent of the change.

- **FR-005:** To avoid exceeding context-window limits the workflow MUST apply the
  following size limits:
  - Per-file patch: truncate to 20 KB if larger, appending `[... truncated]`
  - Total diff payload: truncate to 400 KB if larger, appending a truncation notice
  that lists the omitted filenames

- **FR-006:** If no PR can be resolved for a push-to-main event (e.g. a direct commit),
  the workflow MUST fall back to using `git diff HEAD~1 HEAD` output (fetched via the
  GitHub Commits API compare endpoint) and note in the report that no PR was found.

- **FR-007:** If any GitHub API call fails, the workflow MUST post a comment stating
  it could not retrieve the PR diff and MUST NOT proceed to call the LLM with a
  prompt that omits real data (to prevent hallucination).

- **FR-008:** The updated prompt MUST instruct the LLM to base ALL findings
  exclusively on the provided diff and to explicitly state "No documentation change
  needed" when a changed file requires no documentation update — rather than
  fabricating suggestions.

- **FR-009:** The workflow change MUST be contained entirely within
  `.github/workflows/copilot-agent-docs.yml`. No changes to agent definition files
  or other workflows are required.

- **FR-010:** All existing workflow triggers (`push`, `issue_comment`,
  `pull_request_review_comment`, `workflow_dispatch`) and permission grants MUST be
  preserved unchanged.

---

## Success Criteria

- [ ] On a test PR merge, the Docs Agent report lists only files that appear in that PR's diff
- [ ] When `@docs-agent` is commented on a PR, the report references only files changed in that PR
- [ ] When the GitHub API call fails, the workflow posts an error comment and does NOT post a hallucinated report
- [ ] The workflow completes within the existing 30-minute timeout for a typical PR (< 50 files changed)
- [ ] Zero occurrences of findings referencing files not present in the PR diff in a 3-run sample

---

## Key Entities

- **PR Diff Payload:** The structured data fetched from the GitHub API for a single PR, containing file list, per-file patch, title, body, and PR number. This is the single source of truth passed to the LLM.
- **Docs Agent Report:** The markdown output produced by the LLM, structured per the existing reporting format in `docs-agent.md`. Post-fix, every finding in this report is grounded in the PR Diff Payload.

---

## Out of Scope

- Changing the LLM model or the GitHub Models API endpoint
- Changing the Docs Agent role definition (`docs-agent.md` / `src/agents/docs-agent.md`)
- Adding any new workflow triggers beyond those already present
- Automatically opening a PR with documentation fixes (the agent already handles this; no change needed)
- Rate-limit handling beyond a single retry (the GitHub API quota is generous for this workflow)
- Support for the Claude runtime variant of the Docs Agent (tracked separately under Dual-AI Compatibility, ADR-004)

---

## Security and Privacy Considerations

The workflow uses `GITHUB_TOKEN` with the existing `contents: write`, `pull-requests: write`,
`issues: write`, and `models: read` permissions. No additional permissions are required.
The PR diff is fetched using the same token and is scoped entirely to the repository —
no cross-repository access. The diff payload is passed only to the GitHub Models API
(same endpoint already used by the workflow); no new external service is introduced.
The `GITHUB_TOKEN` is never logged or echoed to console output.

---

## Assumptions

- The repository uses GitHub-native PRs; no external PR workflow.
- The GitHub Models API (`gpt-4o`) context window is sufficient for diffs up to 400 KB
  when combined with the system prompt (≈ 3 KB). The 400 KB cap in FR-005 is conservative.
- The existing `actions/checkout` step with `fetch-depth: 0` already provides full git
  history, so commit-to-PR resolution is always possible.
- No authentication changes are needed; `GITHUB_TOKEN` is sufficient for all GitHub API calls.

---

## Open Questions

_All questions must be resolved before Developer Agent handoff._

1. **Truncation strategy:** Should the truncation in FR-005 prefer newer files
   (added/modified) over removed files, or truncate strictly by order in the API response?
   → **Default:** truncate by API response order; no prioritisation required unless
   the model produces low-quality results on large diffs (can be revisited).
   **Status: RESOLVED — truncate by API response order.**

2. **workflow_dispatch input:** When the workflow is triggered manually via
   `workflow_dispatch` with an `issue_number` input, is that number a PR number or
   an issue number?
   → Looking at the existing code: it is used as `issue_number` for posting a comment
   but no PR diff is fetched today. Post-fix, if the `issue_number` is a PR, the
   workflow should attempt to fetch its diff. If it is a plain issue (not a PR), skip
   diff fetch and post a "no PR context" notice.
   **Status: RESOLVED — attempt PR diff fetch; fall back gracefully if not a PR.**
