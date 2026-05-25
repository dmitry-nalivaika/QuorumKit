# Spec: Comprehensive Agent Consistency — GitHub Footprint & Parallel Local Pipelines — Issue #175

**Issue:** #175
**Branch:** `175-comprehensive-agents-review`
**Type:** feature
**Status:** ready

---

## Overview

Every agent in QuorumKit must be auditable, consistent, and context-aware: it must
leave a traceable record on GitHub whenever it acts, validate that it is operating
on the correct branch before touching anything, and — for local development — be able
to run as one of many parallel pipelines without clobbering a peer. This spec defines
three interlocking requirements: (1) a universal **Agent GitHub Footprint** protocol
that every agent must implement, (2) a shared **Branch Guard** that all agents run
before any file or code operation, and (3) a **Local Pipeline Manager** that uses git
worktrees to let developers work on multiple features simultaneously with isolated or
shared working directories.

---

## User Stories

### US-1: Universal Agent GitHub Footprint

As a **project maintainer**, I want every agent to post a structured start comment
and a structured completion comment on the relevant GitHub Issue or PR whenever it
acts, so that every agent invocation is traceable without having to inspect workflow
logs.

**Acceptance Scenarios:**

- Given the BA Agent is invoked for issue #42  
  When it begins working  
  Then a comment is posted on issue #42 with event type `agent-start`, agent name
  `ba-agent`, branch `042-*`, and a timestamp  
  And when it finishes successfully, a second comment is posted with event type
  `agent-complete`, a summary of what was produced, and an `apm-msg` block  

- Given the Developer Agent is invoked for issue #42  
  When it begins working  
  Then a comment is posted on issue #42 with event type `agent-start`  
  And when it finishes, a comment is posted on the associated PR (or issue) with
  event type `agent-complete`, listing: tasks completed, tests passed/failed, and
  next recommended action  

- Given the Reviewer Agent is invoked on PR #55  
  When it finishes its review  
  Then a full review report is posted as a PR review or PR comment (not only in
  workflow logs) containing all BLOCKER and SUGGESTION items  
  And a comment is also posted on the linked issue with event type `agent-complete`  

- Given any agent fails due to an error or timeout  
  When it terminates abnormally  
  Then a comment is posted with event type `agent-fail`, the error message, and a
  recommended recovery action  
  And no silent termination occurs under any code path  

- Given the QA Agent completes its quality gate run  
  When it posts its QA Report  
  Then the full QA Report is posted as a PR comment and a summary comment is posted
  on the linked issue  

### US-2: Automatic Branch Validation and Creation

As a **developer**, I want every agent to verify that it is operating on the correct
feature branch (NNN-slug) before it modifies any file, so that no artefact or code
change ever lands in the wrong branch.

**Acceptance Scenarios:**

- Given the Developer Agent is invoked for issue #42  
  And the branch `042-user-auth` does not yet exist  
  When the agent runs the Branch Guard  
  Then branch `042-user-auth` is created from the latest `main`  
  And the agent verifies the current working branch is `042-user-auth` before
  touching any file  

- Given the BA Agent is invoked for issue #42  
  And branch `042-user-auth` already exists on `origin`  
  When the agent runs the Branch Guard  
  Then the agent checks out `042-user-auth` from `origin`  
  And it does NOT reset, rebase, or create a new branch  

- Given any agent is invoked with an issue number in context  
  When `git branch --show-current` returns `main` or any branch whose NNN prefix
  does not match the issue number  
  Then the agent MUST NOT proceed with any file operation  
  And it MUST post an error comment on the issue explaining the branch mismatch  

- Given the Branch Guard is implemented as a reusable shared script  
  When two different agents (e.g. BA and Developer) call it for the same issue  
  Then the behaviour is identical and the result is idempotent  

### US-3: Isolated Parallel Local Pipelines (Separate Worktrees)

As a **developer**, I want to run multiple feature pipelines in parallel on my local
machine — each in its own isolated working directory — so that I can switch contexts
instantly without losing uncommitted work or conflicting with a peer pipeline.

**Acceptance Scenarios:**

- Given I have QuorumKit installed and `gh` CLI is authenticated  
  When I run `scripts/pipeline.sh start 42 --mode=isolated`  
  Then a git worktree is created at `../QuorumKit-042-user-auth/` (or
  `$QUORUMKIT_PIPELINES_DIR/042-user-auth/` if the env var is set)  
  And branch `042-user-auth` is checked out in that worktree (creating it if absent)  
  And a "pipeline-started" comment is posted on issue #42 with the worktree path,
  mode, and timestamp  

- Given an isolated pipeline worktree exists for issue #42  
  When I run `scripts/pipeline.sh start 55 --mode=isolated`  
  Then a second worktree is created at `../QuorumKit-055-another-feat/`  
  And the two worktrees are fully independent — modifying files in one does NOT
  affect the other  

- Given an isolated pipeline exists for issue #42  
  When I run `scripts/pipeline.sh stop 42`  
  Then `git worktree remove` removes the `042-*` worktree  
  And a "pipeline-stopped" comment is posted on issue #42  
  And the main repository working tree is unaffected  

- Given `QUORUMKIT_PIPELINES_DIR=/workspace/pipelines` is set  
  When I run `scripts/pipeline.sh start 42 --mode=isolated`  
  Then the worktree is created at `/workspace/pipelines/042-user-auth/`  

### US-4: Shared Pipeline Mode (Same Working Directory)

As a **developer**, I want to invite multiple agents to work on the same feature
inside the same local checkout, so that I can collaborate with agents on the same
branch without needing separate worktrees.

**Acceptance Scenarios:**

- Given I run `scripts/pipeline.sh start 42 --mode=shared`  
  When the pipeline starts  
  Then no new worktree is created — the agents work in the current repo directory  
  And branch `042-user-auth` is checked out in the current working directory  
  And a "pipeline-started" comment is posted on issue #42 with mode `shared`  

- Given a shared pipeline is active for issue #42  
  And another shared pipeline is started for issue #55  
  When both pipelines are active  
  Then the developer is warned that two shared pipelines are active simultaneously  
  And a recommendation to use `--mode=isolated` is included in the warning  

### US-5: Pipeline Status and State Visibility

As a **developer**, I want to see the status of all my active local pipelines at a
glance, so that I can track progress across multiple features without opening each
GitHub Issue individually.

**Acceptance Scenarios:**

- Given I have two active pipelines — issue #42 (isolated) and issue #55 (shared)  
  When I run `scripts/pipeline.sh status`  
  Then the output lists both pipelines with: issue number, branch name, worktree
  path (or "shared"), mode, and the latest pipeline status derived from the most
  recent `apm-msg` comment on the GitHub Issue  

- Given no active pipelines exist  
  When I run `scripts/pipeline.sh status`  
  Then the output clearly states "No active pipelines"  

- Given GitHub is unreachable  
  When I run `scripts/pipeline.sh status`  
  Then the command falls back to local worktree inspection (`git worktree list`)  
  And displays a warning that GitHub status may be stale  

---

## Functional Requirements

### Theme 1 — Universal Agent GitHub Footprint

- **FR-001:** Every agent definition file (`src/agents/*.md`) MUST include an
  "Agent Footprint" section describing the exact GitHub comments the agent posts
  at start and at completion.

- **FR-002:** Every agent MUST post an `agent-start` comment on the relevant GitHub
  Issue (or PR, if the invocation context is a PR) before performing any meaningful
  work. The comment MUST contain: agent name, event type `agent-start`, ISO-8601
  timestamp, issue/PR reference, and current branch name.

- **FR-003:** Every agent MUST post an `agent-complete` or `agent-fail` comment on
  the relevant GitHub Issue or PR when it finishes. The comment MUST contain: agent
  name, event type, ISO-8601 timestamp, outcome summary, next recommended action,
  and a valid `apm-msg` block (version 2) including the `pipeline_id` field.

- **FR-004:** An `agent-fail` comment MUST be posted under all abnormal termination
  conditions (unhandled exception, timeout, permission error). Silent termination is
  prohibited. The comment MUST include the error message and a recommended recovery
  action.

- **FR-005:** The Reviewer Agent MUST post its complete review output (all BLOCKER
  and SUGGESTION items) as a GitHub PR review comment (not only in the Actions log).
  It MUST additionally post a summary comment on the linked issue.

- **FR-006:** The QA Agent MUST post its full QA Report as a PR comment. It MUST
  additionally post a summary comment on the linked issue.

- **FR-007:** The Security Agent MUST post its security finding summary as a PR
  comment. If findings include `HIGH` or `CRITICAL` severity items, it MUST also
  post a comment on the linked issue (without disclosing exploit details publicly).

- **FR-008:** The `apm-msg` block format MUST be extended with new **optional**
  fields: `issue`, `pr` (nullable), `branch`, `pipeline_id` (nullable for
  cloud/CI runs), `event_type` (`complete | fail`), and `timestamp`.

  **Backward-compatibility constraint**: The existing schema at
  `engine/orchestrator/schemas/apm-msg.schema.json` declares
  `"additionalProperties": false`. The Developer Agent MUST update this schema
  **before** any agent definition is changed to emit new fields. The schema
  update MUST:
  1. Add all new fields as **optional** (not required) properties so existing
     agents that do not yet include them continue to pass validation.
  2. Change `"additionalProperties": false` to `"additionalProperties": true`
     OR explicitly declare all new fields as optional properties.
  Making new fields required is deferred to a follow-on PR once all agents have
  been updated.

  **`outcome` field for `agent-start` events**: `apm-msg` blocks are emitted
  only at step completion or failure — they are NOT required in `agent-start`
  comments. FR-002 `agent-start` comments use a plain structured GitHub comment
  (no `apm-msg` block). FR-003 `agent-complete` / `agent-fail` comments include
  an `apm-msg` block with `event_type: "complete"` or `event_type: "fail"`
  respectively. The `outcome` field therefore always has a meaningful value when
  an `apm-msg` block is present. The `event_type` enum in the schema MUST be
  restricted to `"complete" | "fail"` — `"start"` is NOT a valid `event_type`
  in an `apm-msg` block.

- **FR-009:** The Triage Agent's existing triage comment MUST be updated to include
  an `apm-msg` block so its output enters the Orchestrator's routing logic. The
  Triage Agent MUST emit `outcome: "success"` on successful triage and
  `outcome: "fail"` if it cannot classify the issue. No new `outcome` enum value
  is required.

- **FR-024:** The implementation MUST update `docs/AGENT_PROTOCOL.md` Section 2
  to document the extended `apm-msg` schema fields (`event_type`, `pipeline_id`,
  `issue`, `pr`, `branch`, `timestamp`) **before** any agent definition is
  updated to emit them. This ensures the `regulation-lint` CI job and the
  Reviewer Agent's hard-constraint check remain satisfied throughout rollout.

### Theme 2 — Branch Guard

- **FR-010:** A shared Branch Guard routine MUST be implemented as a reusable shell
  script at `scripts/branch-guard.sh` accepting arguments `<issue_number>` and
  `<branch_slug>`.

- **FR-011:** The Branch Guard MUST perform the following steps in order:
  1. Fetch `origin` to get the latest remote state.
  2. Check if branch `NNN-slug` exists locally or on `origin`.
  3. If it does NOT exist: create it from `origin/main` and push it.
  4. If it exists remotely only: check it out tracking `origin/NNN-slug`.
  5. If it exists locally: check it out.
  6. Verify `git branch --show-current` returns `NNN-slug`. If not: post an error
     comment on the issue and exit non-zero.

- **FR-012:** The Branch Guard MUST be invoked by ALL of the following agents before
  any file operation: BA Agent, Developer Agent, Architect Agent, QA Agent (when
  running locally), Reviewer Agent (when running locally).

- **FR-013:** The Branch Guard MUST be idempotent — calling it twice for the same
  issue number produces the same end state without error.

- **FR-014:** If the Branch Guard is invoked inside a git worktree (isolated pipeline
  mode), it MUST operate within that worktree's path and MUST NOT switch branches in
  the main checkout.

### Theme 3 — Local Pipeline Manager

- **FR-015:** A `scripts/pipeline.sh` script MUST be provided implementing the
  following subcommands: `start <NNN> [--mode=isolated|shared]`, `join <NNN>`,
  `status`, `stop <NNN>`.

- **FR-016:** `pipeline start <NNN> [--mode=isolated|shared]` MUST:
  1. Look up the GitHub Issue #NNN to resolve the branch slug (from existing branch
     or issue title).
  2. Run the Branch Guard to ensure the branch exists.
  3. In `isolated` mode: create a git worktree at
     `${QUORUMKIT_PIPELINES_DIR:-../$(basename "$PWD")-NNN-slug}/` with the feature
     branch checked out. Post a `pipeline-started` comment on issue #NNN.
  4. In `shared` mode: check out the feature branch in the current working directory.
     Post a `pipeline-started` comment on issue #NNN.
  5. Default mode: `isolated`.

- **FR-017:** `pipeline join <NNN>` MUST:
  1. Locate the existing pipeline for issue #NNN (from GitHub Issue comments or
     local `git worktree list`).
  2. Print the worktree path (isolated) or confirm the current branch (shared).
  3. NOT create a second worktree for the same issue.

- **FR-018:** `pipeline stop <NNN>` MUST:
  1. In `isolated` mode: run `git worktree remove` on the NNN worktree path.
  2. In `shared` mode: offer to switch back to `main` (with a prompt or `--no-switch`
     flag to suppress).
  3. Post a `pipeline-stopped` comment on issue #NNN with final branch commit SHA.
  4. NOT delete the remote branch — branch lifecycle is controlled by PR merge.

- **FR-019:** `pipeline status` MUST:
  1. Run `git worktree list` to enumerate local worktrees.
  2. For each worktree, extract the NNN prefix from the branch name.
  3. Fetch the latest `apm-msg` pipeline status comment from the GitHub Issue for
     each NNN.
  4. Print a formatted table: issue #, branch, path, mode, and last agent step.
  5. If GitHub is unreachable, display local worktree data with a staleness warning.

- **FR-020:** Pipeline state (started timestamp, mode, worktree path, current agent
  step) MUST be persisted as a structured JSON comment on the GitHub Issue. The
  local machine derives all pipeline state by reading GitHub — no local state files
  (`.pipeline`, `.quorumkit-state`) are written.

- **FR-021:** When multiple isolated pipelines are active simultaneously, they MUST
  share the git object store (via worktrees) but MUST have completely separate
  working trees. No `git checkout` in one pipeline may affect another pipeline's
  working tree.

- **FR-022:** When the `--mode=shared` flag is used and another shared pipeline is
  already active on a different issue, the script MUST print a warning and prompt
  the user to confirm before proceeding.

- **FR-023:** The Orchestrator MUST accept optional `pipeline_id` and `worktree_path`
  fields in its invocation context and pass them through to agents so agents can
  correctly resolve their working directory.

---

## Success Criteria

- [ ] All 15 agent definition files in `src/agents/` have been audited; every agent
  that performs file or GitHub operations has an "Agent Footprint" section
  defining its start and complete comment structure.
- [ ] `agent-start` comments appear in GitHub when the BA Agent, Developer Agent,
  Reviewer Agent, QA Agent, and Security Agent begin work on any issue or PR.
- [ ] `agent-complete` or `agent-fail` comments appear in GitHub when any of the
  above agents finish, under both success and failure paths.
- [ ] `scripts/branch-guard.sh` exists, passes its unit tests, and is invoked by at
  least BA Agent, Developer Agent, and Architect Agent before any file operation.
- [ ] `scripts/pipeline.sh start <NNN> --mode=isolated` creates a git worktree,
  checks out the correct branch, and posts a GitHub comment on the issue.
- [ ] `scripts/pipeline.sh start <NNN> --mode=shared` checks out the branch in the
  current directory and posts a GitHub comment.
- [ ] `scripts/pipeline.sh stop <NNN>` removes the worktree (isolated) or switches
  back (shared) and posts a GitHub comment.
- [ ] `scripts/pipeline.sh status` correctly lists all active worktrees mapped to
  their GitHub issues and last agent step.
- [ ] Two isolated pipelines can be active simultaneously with no working-tree
  conflicts verified by an integration test.
- [ ] The `apm-msg` schema documentation is updated to version 2 with `pipeline_id`
  and `event_type` fields.
- [ ] All existing `spec.md` / `plan.md` / `tasks.md` references to branch management
  remain consistent with the new Branch Guard contract.

---

## Key Entities

- **Pipeline**: A unit of local development isolation tied to a GitHub Issue. Core
  attributes: `pipeline_id` (= NNN, zero-padded), `branch` (NNN-slug), `mode`
  (`isolated` | `shared`), `worktree_path` (absolute fs path or `null` for shared),
  `status` (`active` | `stopped`), `created_at`, `issue_url`.

- **Agent Footprint**: A structured GitHub comment recording an agent lifecycle
  event. Core attributes: `agent_name`, `event_type` (`agent-start` | `agent-complete`
  | `agent-fail`), `timestamp`, `issue_number`, `pr_number` (nullable), `branch`,
  `outcome` (nullable for start events), `summary`, `apm_msg_block`.

- **Branch Guard**: A reusable, idempotent pre-execution validation routine. Inputs:
  `issue_number`, `branch_slug`, optional `worktree_path`. Outputs: verified that
  `git branch --show-current` (inside the target worktree) equals `branch_slug`.

- **`apm-msg` Block (v2)**: The canonical inter-agent message format embedded in
  GitHub comments. Fields: `version` (always `"2"`), `step`, `agent`, `outcome`,
  `issue`, `pr`, `branch`, `pipeline_id`, `event_type`, `timestamp`.

---

## Out of Scope

- Multi-machine pipeline synchronisation — pipelines are local-only; remote
  execution (GitHub Actions) does not use worktrees and is unaffected.
- Cloud-based development environments (Codespaces, Gitpod) — treated as future work.
- Changes to the pipeline DSL schema (`feature-pipeline.yml`) — the parallel
  pipeline concept is a local dev tool layered on top of the existing orchestrator.
- Dashboard integration for parallel pipeline visibility — handled by a follow-on
  enhancement.
- AI model selection or resource allocation per pipeline.
- Automatic PR merging or branch deletion after `pipeline stop`.

---

## Security and Privacy Considerations

N/A — single-user/no-auth system; this project handles no PII. Standard open-source
data classification applies per the constitution.

Additional notes:
- Pipeline state comments on GitHub Issues are public (consistent with all existing
  issue activity). No sensitive data must be included in pipeline state comments.
- The `scripts/branch-guard.sh` and `scripts/pipeline.sh` scripts perform local
  filesystem and `git` operations. They MUST NOT accept arbitrary shell-injectable
  input (issue numbers are validated as integers; branch slugs are validated against
  `[a-z0-9-]+` pattern) to prevent local command-injection.
- `gh` CLI authentication is managed by the user's existing `gh auth` session.
  No tokens are written to local files by these scripts.
- GitHub API calls made by the pipeline scripts MUST use least-privilege token scopes:
  `issues: write`, `contents: write`, `pull-requests: write`.

---

## Assumptions

- Git version ≥ 2.5 is available locally (worktree support was added in 2.5).
- The `gh` CLI is installed and authenticated (`gh auth status` passes).
- Agent definitions live in `src/agents/` (as present in this repo).
- The Orchestrator already persists all state in GitHub Issues/PRs (Constitution §VIII);
  this spec builds on that guarantee.
- Cloud/CI runners (GitHub Actions) are ephemeral single-checkout environments;
  they do not use worktrees and are excluded from FR-016/021.
- The project follows the `NNN-slug` branch naming convention without exception
  (already enforced by existing agents).
- `QUORUMKIT_PIPELINES_DIR` defaults to `../$(basename "$PWD")-NNN-slug/` when unset.

---

## Open Questions

_Target: zero open questions before handoff. All resolved below._

| # | Question | Resolution |
|---|----------|------------|
| OQ-1 | Should `pipeline.sh` be a new script or extend an existing `scripts/` script? | New standalone script `scripts/pipeline.sh` — consistent with `scripts/init.sh`, `scripts/dev-setup.sh` pattern. No existing script is close enough to extend. |
| OQ-2 | Where is worktree path configured — per project or per user? | Per-user via `QUORUMKIT_PIPELINES_DIR` env var; project-level default documented in README but not committed as a config file (avoids polluting the repo). |
| OQ-3 | Do GitHub Actions agents also need to post `agent-start` comments? | Yes — the footprint requirement applies in all contexts. CI agents must also post `agent-start`/`agent-complete` comments. |
| OQ-4 | Is `apm-msg` v2 the canonical format for footprint comments, or a separate format? | `apm-msg` v2 is the canonical format — extended with `event_type` and `pipeline_id`. No separate format is introduced (YAGNI). |
| OQ-5 | Should the parallel pipeline concept require an ADR? | Yes — this spec introduces git worktrees as a new local workflow primitive and extends the Orchestrator interface (FR-023). An ADR must be written before implementation. PR label: `agent:architect`. |
| OQ-6 | What happens if `git worktree add` fails (e.g. branch already checked out elsewhere)? | Branch Guard detects the condition; `pipeline start` aborts and posts an error comment explaining the conflict, recommending `pipeline join <NNN>` instead. |
| OQ-7 | Should `pipeline stop` delete the remote branch? | No — branch deletion is tied to PR merge (existing convention). `pipeline stop` only removes the local worktree. |
