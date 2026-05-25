# Spec: BA Agent — Auto Branch, Commit & PR on Spec Write — Issue #45

**Issue:** #45
**Branch:** `045-ba-auto-push-pr`
**Type:** feature
**Status:** draft

---

## Overview

The BA/Product Agent currently writes `specs/NNN-slug/spec.md` but stops there — a
human must manually commit, push the branch, open a PR, apply labels, and post the
PR link back on the issue. This breaks the autonomous SDLC loop: the orchestrator
cannot route to the next agent because there is no PR to act on. This feature
makes the BA agent fully self-publishing: after writing or updating a spec it
creates (or updates) the feature branch, commits, pushes, opens (or updates) the
PR with the correct labels, posts the PR link on the originating issue, and emits
an `apm-msg` outcome so the orchestrator can route automatically.

---

## User Stories

### US-1: New spec creates branch and opens PR automatically

As a **project maintainer**, I want the BA agent to commit and push the new spec
and open a PR automatically, so that the spec is immediately visible to reviewers
and the orchestrator can route to the next agent without human intervention.

**Acceptance Scenarios:**
- Given the BA agent has written `specs/045-foo/spec.md` for issue #45  
  And the working tree contains no unrelated uncommitted changes  
  When the agent finishes writing the spec  
  Then branch `045-foo` is created from `main` (if it does not already exist)  
  And `specs/045-foo/spec.md` and `.specify/feature.json` (if updated) are committed with message `docs(spec): add spec for #45 — <feature title>`  
  And the branch is pushed to `origin`  
  And a PR is opened against `main` with title `docs(spec): #45 — <feature title>`  
  And the PR body contains `Refs #45`, the spec path, and a BA handoff summary  
  And the PR carries labels `type:spec` and exactly one next-agent label  
  And the PR URL is posted as a comment on issue #45

- Given the agent cannot determine whether an ADR is required  
  When applying PR labels  
  Then the agent applies `agent:dev` as the conservative default (no ADR assumed)

### US-2: Re-running BA agent on the same issue is idempotent

As a **developer**, I want the BA agent to update the existing spec PR when I
re-run it on the same issue, so that duplicate PRs are never created and the
audit trail stays clean.

**Acceptance Scenarios:**
- Given a PR already exists for branch `045-foo`  
  When the BA agent re-runs for issue #45  
  Then no second PR is opened  
  And the existing PR body is updated to reflect the latest spec content  
  And the branch is force-pushed with the updated commit  
  And a new comment is posted on issue #45 with the (unchanged) PR URL

### US-3: Dirty working tree causes a clean, explicit abort

As a **developer**, I want the BA agent to abort clearly when the working tree
contains unrelated uncommitted changes, so that the agent never accidentally
commits files it did not produce.

**Acceptance Scenarios:**
- Given the working tree has uncommitted changes to files outside `specs/NNN-slug/`
  and `.specify/feature.json`  
  When the agent attempts to publish the spec  
  Then it aborts without committing or pushing  
  And it posts an error comment on the issue listing the offending files  
  And it exits non-zero

### US-4: Missing token permissions produce a clear error, not a silent failure

As a **DevOps engineer**, I want the BA agent to report missing GitHub token scopes
clearly, so that permission problems are diagnosed immediately and no partial
state is left behind.

**Acceptance Scenarios:**
- Given the `GITHUB_TOKEN` does not have `contents: write` or `pull-requests: write`  
  When the agent attempts to push or create a PR  
  Then it posts an error comment on the issue identifying the missing scope  
  And it exits non-zero  
  And no branch, commit, or PR is left in a partial state

---

## Functional Requirements

- **FR-001:** Before staging any files, the agent MUST inspect the working tree for
  uncommitted changes to files **other than** `specs/NNN-slug/spec.md` and
  `.specify/feature.json`. If any such files are dirty, the agent MUST abort, post
  an error comment on the originating issue listing the offending files, and exit
  non-zero. It MUST NOT commit, push, or open a PR.

- **FR-002:** The agent MUST derive the branch name as `NNN-slug` directly from the
  spec directory name (e.g. `specs/045-ba-auto-push-pr/` → branch `045-ba-auto-push-pr`).
  No other branch naming convention is permitted.

- **FR-003:** The agent MUST create branch `NNN-slug` from the current default branch
  (`main`) if it does not already exist. If the branch already exists locally or
  remotely, the agent MUST check it out without resetting or rebasing it.

- **FR-004:** The agent MUST stage ONLY `specs/NNN-slug/spec.md` and
  `.specify/feature.json` (the latter only if it was modified as part of this
  spec-write). No other file may be included in the commit.

- **FR-005:** The agent MUST commit with a conventional message:
  - New spec: `docs(spec): add spec for #NNN — <feature title>`
  - Updated spec: `docs(spec): refine spec for #NNN — <feature title>`
  
  The `<feature title>` is extracted from the `# Spec:` heading of `spec.md`
  (everything after `# Spec:` and before ` — Issue #NNN`).

- **FR-006:** The agent MUST push branch `NNN-slug` to `origin`. Force-push is
  permitted **only** on the agent's own `NNN-slug` branch and only when a PR for
  that branch already exists (re-run / update path). The agent MUST NEVER push
  to the default branch and MUST NEVER force-push any branch other than the
  current `NNN-slug`.

- **FR-007:** Before opening a PR, the agent MUST query the GitHub API to determine
  whether a PR already exists for branch `NNN-slug`:
  - **No existing PR:** create a new PR.
  - **Existing PR:** update (PATCH) the PR body only; do NOT create a second PR.

- **FR-008:** The PR title MUST follow the format:
  `docs(spec): #NNN — <feature title>`

- **FR-009:** The PR body MUST contain all of the following:
  - `Refs #NNN` (never `Closes #NNN` — closing is reserved for the implementation PR)
  - The spec path: `specs/NNN-slug/spec.md`
  - A BA handoff summary: number of user stories, number of functional requirements,
    whether all open questions are resolved (detected by scanning the `## Open Questions`
    section for unresolved items)
  - A link to the originating GitHub issue

- **FR-010:** The PR MUST carry exactly the following labels on creation:
  - `type:spec` (always)
  - Exactly one next-agent label determined as follows:
    - `agent:architect` — if the spec's Functional Requirements mention a new
      external service, new storage layer, new protocol, or any other indicator
      that an ADR is warranted per `architect-agent.md`
    - `agent:dev` — in all other cases (conservative default)
  
  All labels applied MUST be declared in `docs/AGENT_PROTOCOL.md`. No undeclared
  labels may be applied.

- **FR-011:** After the PR is opened or updated, the agent MUST post a comment on
  the originating issue #NNN containing the PR URL and a one-line handoff summary.

- **FR-012:** The agent's final comment (on the issue or PR) MUST end with exactly
  one ` ```apm-msg ``` ` fenced block with `outcome: "spec-ready"` and
  `payload: { "specPath": "specs/NNN-slug/spec.md", "branch": "NNN-slug", "prUrl": "<url>" }`.
  This outcome MUST be registered in `docs/AGENT_PROTOCOL.md` as a new canonical
  outcome (see FR-016).

- **FR-013:** If the `GITHUB_TOKEN` lacks `contents: write` permission, the agent
  MUST detect this before attempting a push (e.g. test-push to a scratch ref or
  handle the 403 response), post an error comment identifying the missing scope, and
  exit non-zero.

- **FR-014:** If the `GITHUB_TOKEN` lacks `pull-requests: write` permission, the
  agent MUST detect this before attempting PR creation, post an error comment
  identifying the missing scope, and exit non-zero.

- **FR-015:** The `copilot-agent-ba.yml` workflow MUST be updated to grant:
  - `contents: write` (was `read`)
  - `pull-requests: write` (was `read`)
  
  All other permissions remain unchanged.

- **FR-016:** `docs/AGENT_PROTOCOL.md` (the canonical regulation document) MUST be
  updated to register the new `spec-ready` outcome in the `apm-msg` Outcomes table
  with semantics: _"BA Agent finished writing/refining a spec and published it to a
  branch + PR; orchestrator routes to next-agent label."_  
  Payload schema: `{ "specPath": string, "branch": string, "prUrl": string }`.

- **FR-017:** The BA agent role definitions at `.github/agents/ba-product-agent.md`
  and `src/agents/ba-product-agent.md` MUST be updated to include the
  branch/commit/push/PR/apm-msg step in the agent's **Responsibilities** section
  and in any handoff checklist present in those files.

- **FR-018:** Behaviour MUST be identical in both runtimes:
  - **Claude Code** (local): runs git commands via shell; uses `gh pr create` /
    `gh pr edit` for PR operations.
  - **Copilot / GitHub Actions**: uses `actions/github-script` with the GitHub REST
    API for PR operations; uses `git` CLI (available in the runner) for branch/commit/push.
  
  Branch name, commit message, PR title, PR body structure, labels, and `apm-msg`
  payload MUST be identical regardless of runtime.

---

## Success Criteria

- [ ] Running the BA agent on a new issue creates branch `NNN-slug`, commits spec + feature.json, pushes, and opens a PR — all without human intervention
- [ ] Re-running the BA agent on the same issue updates the existing PR and does NOT create a duplicate
- [ ] The PR title matches `docs(spec): #NNN — <title>` exactly
- [ ] The PR carries `type:spec` and exactly one of `agent:architect` or `agent:dev`
- [ ] A comment containing the PR URL is posted on the originating issue
- [ ] The final comment contains a valid `apm-msg` block with `outcome: "spec-ready"`
- [ ] A dirty working tree causes an abort with a comment listing the dirty files, no commit or push
- [ ] Missing `contents: write` causes a clear error comment and non-zero exit
- [ ] Missing `pull-requests: write` causes a clear error comment and non-zero exit
- [ ] `docs/AGENT_PROTOCOL.md` contains the `spec-ready` outcome entry
- [ ] Both agent role definition files are updated with the new push/PR responsibility

---

## Key Entities

- **Spec PR:** A GitHub Pull Request whose head branch is `NNN-slug`, whose title follows the `docs(spec):` convention, and whose sole purpose is to get the spec reviewed and merged before implementation begins. It is opened by the BA agent and closed by a human or the Reviewer Agent merging it.
- **`apm-msg` block:** A single fenced ` ```apm-msg ``` ` JSON block at the end of an issue/PR comment, consumed by the Orchestrator to determine the next routing step.
- **`spec-ready` outcome:** A new canonical `apm-msg` outcome emitted exclusively by the BA agent, signalling that a spec has been published and the orchestrator should activate the next-agent label.

---

## Out of Scope

- Implementing the Orchestrator v2 message protocol itself (Issue #44)
- Changing the spec template, sections, or validation rules
- Auto-merging the spec PR — humans or the Reviewer Agent still merge
- Push/PR automation for any other agent (Architect ADR, Dev implementation PRs — each is a separate issue)
- Cross-repository PRs
- Automatic creation of the implementation PR (that is the Developer Agent's responsibility)
- Changing the label taxonomy beyond adding the `spec-ready` outcome to `AGENT_PROTOCOL.md`

---

## Security and Privacy Considerations

The feature requires elevating the `copilot-agent-ba.yml` permissions from
`contents: read` to `contents: write` and from `pull-requests: read` to
`pull-requests: write`. These are the minimum scopes needed for branch push and PR
creation. The `GITHUB_TOKEN` is scoped to the repository and expires at the end of
each workflow run; no long-lived credentials are introduced. The agent MUST NOT log
the token value. No new external services or secrets are introduced. The agent MUST
only push to branches named with the `NNN-slug` pattern; a guard MUST prevent
accidental push to `main` or any unrelated branch (FR-006).

---

## Assumptions

- The default branch is `main`; this is hardcoded as the PR base. If a project uses
  a different default branch name, a follow-up configuration option can be added
  (YAGNI — not in scope here).
- `.specify/feature.json` may or may not exist; the agent handles both cases (commit
  it if present/modified, skip if absent).
- The `gh` CLI is available in the Claude Code environment; GitHub Actions runners
  have `git` CLI available via the `actions/checkout` step.
- The `spec-ready` outcome is a new identifier that is not yet in `AGENT_PROTOCOL.md`;
  adding it is part of this feature (FR-016).

---

## Open Questions

_All questions must be resolved before Developer Agent handoff._

1. **ADR-trigger heuristic (FR-010):** The spec says the agent applies `agent:architect`
   when the spec mentions a new external service, new storage, or new protocol. Should
   this be a keyword scan of the spec text, or should the spec author explicitly declare
   `requires-adr: true` in a frontmatter field?  
   → **Default:** keyword scan on the Functional Requirements section for terms like
   "new external", "new storage", "new protocol", "ADR". Simple and requires no spec
   format change. Can be refined later if false-positive rate is high.  
   **Status: RESOLVED — keyword scan.**

2. **Force-push on re-run (FR-006):** On the update path, the agent force-pushes the
   `NNN-slug` branch. Is a force-push acceptable if reviewers have left comments on
   the existing spec PR?  
   → Yes: spec PRs are pre-review artefacts; comments are not lost (they stay on the
   PR timeline even after a force-push). This is consistent with how spec refinement
   works today (overwrite spec.md). If the project later requires non-destructive
   history, this can be revisited via an amendment commit strategy.  
   **Status: RESOLVED — force-push accepted on spec PRs.**

3. **`spec-ready` registration in AGENT_PROTOCOL.md (FR-016):** The regulation document
   states it is "human-authored" and source must conform to it, not the reverse. Does
   adding `spec-ready` require a separate ADR, or can it be added directly as part of
   this feature's PR since no orchestrator routing logic yet depends on it?  
   → Adding a new outcome to `AGENT_PROTOCOL.md` without a new orchestrator rule does
   not change observable orchestrator behaviour, so no ADR is required. The Developer
   Agent's PR for this feature includes the `AGENT_PROTOCOL.md` update and the
   Reviewer Agent verifies compliance.  
   **Status: RESOLVED — no ADR required; update AGENT_PROTOCOL.md in this PR.**
