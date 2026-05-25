# Spec: Local Pipeline Management UI — Issue #176

**Issue:** #176
**Branch:** `176-local-pipeline-ui`
**Type:** feature
**Status:** draft

---

## Overview

Developers running multiple parallel feature pipelines today must jump between
terminals and run `scripts/pipeline.sh` manually to start, stop, and inspect
worktrees. This spec defines a **Local Pipelines panel** in the dashboard browser
UI that gives developers full visibility and control over local git-worktree-based
pipelines — start, stop, join, and agent-in-pipeline invocation — without leaving
the browser tab.

---

> ⚠️ **Constitutional ADR Required (Principle IX)**
>
> Constitution Principle IX designates the dashboard as a read-only observability
> surface and states that "dashboard features that require write access to any
> system are out of scope and prohibited **without an ADR**." Starting and stopping
> pipelines mutates the local filesystem (git worktrees). An ADR must be approved
> before the Developer Agent begins implementation of the write-path endpoints
> (FR-176-002, FR-176-004). The Developer Agent MUST NOT begin implementation
> until that ADR is merged.
>
> **Precedent note:** The existing `POST /api/invoke` and `POST /api/stop`
> endpoints (FR-023) already spawn and kill local processes from the dashboard
> server. The ADR for this feature should reference those precedents and extend
> their scope to filesystem-mutating pipeline lifecycle operations.

---

## User Stories

### US-1: View Active Local Pipelines

As a **developer**, I want the dashboard to show me all active local feature
pipelines with their branch, directory, age, and running-agent status, so that
I can see the full picture of my local work-in-progress at a glance.

**Acceptance Scenarios:**

- Given at least one git worktree exists for a feature branch (NNN-slug pattern)
  When I open the dashboard
  Then the "Local Pipelines" panel shows one row per worktree, displaying:
  branch name, worktree directory path, creation time, pipeline mode, and
  whether an agent process is currently running in that directory

- Given no feature-branch worktrees exist
  When I open the dashboard
  Then the panel shows an empty-state message: "No local pipelines active"

- Given `QUORUMKIT_PIPELINES_DIR` is set in the server environment
  When the dashboard loads the pipeline list
  Then the pipeline list is filtered to worktrees under that directory

- Given the worktree list cannot be retrieved (git command fails)
  When the dashboard tries to load pipelines
  Then the panel shows a clear error message describing the failure rather
  than silently showing an empty list

### US-2: Start a New Local Pipeline

As a **developer**, I want to start a new local pipeline from the dashboard by
entering an issue number (and optionally a slug and mode), so that I do not need
to open a terminal to call `pipeline.sh start`.

**Acceptance Scenarios:**

- Given I click "Start Pipeline" and enter issue number 42 with no slug
  When the server resolves the slug from the GitHub Issue title
  Then a new pipeline row appears with branch `042-<derived-slug>` and the
  correct worktree path
  And the Start button becomes unavailable for that issue number while creation
  is in progress

- Given I click "Start Pipeline", enter issue 42, and manually type slug
  `my-custom-slug`
  When I confirm
  Then the pipeline is started with branch `042-my-custom-slug`

- Given I choose `isolated` mode
  When the pipeline starts
  Then the worktree is created at a separate directory path (not the main repo
  working directory)

- Given I choose `shared` mode
  When the pipeline starts
  Then the worktree is created within or collocated with the main working
  directory structure

- Given the issue number provided is not a positive integer
  When I attempt to start
  Then the form shows a validation error and does not submit

- Given the pipeline for issue 42 already exists
  When I attempt to start it again
  Then the server returns a conflict response and the UI shows a clear error
  message without creating a duplicate

### US-3: Stop a Local Pipeline

As a **developer**, I want to stop and remove a local pipeline from the
dashboard, so that I can clean up finished worktrees without using the terminal.

**Acceptance Scenarios:**

- Given a pipeline row is visible in the Local Pipelines panel
  When I click "Stop" on that row
  Then a confirmation dialog appears listing the branch name and path to be removed

- Given I confirm the stop action
  When the server processes the request
  Then the pipeline row disappears from the list
  And the worktree is removed from the local filesystem

- Given an agent process is currently running in the pipeline
  When I attempt to stop the pipeline
  Then the UI shows a warning that an agent is running and asks for explicit
  confirmation before proceeding

- Given the stop operation fails
  When the server returns an error
  Then the pipeline row remains visible and the error is shown in the panel
  (not silently swallowed)

### US-4: Join (Navigate to) a Local Pipeline

As a **developer**, I want the dashboard to show me the exact working directory
path for a pipeline so that I can quickly `cd` to it in my terminal.

**Acceptance Scenarios:**

- Given a pipeline row is visible
  When I click "Join"
  Then the worktree directory path and branch name are displayed in a modal
  with a one-click "Copy path" button

- Given I click "Copy path"
  Then the path is written to the clipboard and a brief confirmation toast
  is shown

### US-5: Invoke an Agent Within a Pipeline Context

As a **developer**, I want to optionally select an active local pipeline when
invoking an agent from the dashboard, so that the agent operates in the correct
feature branch context (isolated worktree directory) without manual configuration.

**Acceptance Scenarios:**

- Given at least one active pipeline exists
  When I open the agent invoke modal
  Then an optional "Run in pipeline" dropdown appears listing active pipelines
  by branch name

- Given I select pipeline `042-user-auth` from the dropdown and click "Invoke"
  When the server spawns the agent process
  Then the agent's working directory is set to the pipeline's worktree path
  And the pipeline row shows a running-agent indicator for the duration of
  the agent process

- Given no active pipelines exist
  When I open the invoke modal
  Then the "Run in pipeline" dropdown is hidden or shows a greyed-out
  placeholder ("No active pipelines")

- Given I invoke a Claude agent in isolated mode
  When the agent starts
  Then the spawned Claude process runs with its working directory set to the
  pipeline's worktree path, not the main project root

- Given I invoke a Copilot (VS Code) agent in isolated mode
  When the agent starts
  Then VS Code is opened (or a new window is opened) pointing at the pipeline's
  worktree directory so that Copilot's context is scoped to the correct branch

---

## Functional Requirements

- **FR-176-001**: The system MUST expose an endpoint that lists all local feature
  pipelines, where each entry includes: branch name, worktree directory path,
  creation timestamp, pipeline mode (isolated or shared), and a boolean indicating
  whether an agent process is currently running in that directory.

- **FR-176-002**: The system MUST expose an endpoint that accepts an issue number,
  an optional branch slug, and a pipeline mode, and starts a new local pipeline by
  delegating to the existing pipeline management script. *(Requires ADR — see
  constitutional note above.)*

- **FR-176-003**: When no branch slug is supplied to FR-176-002, the system MUST
  automatically derive a slug from the GitHub Issue title (or fall back to
  `NNN-feature`) using the same resolution logic already implemented in
  `scripts/pipeline.sh`.

- **FR-176-004**: The system MUST expose an endpoint that accepts an issue number
  and stops the corresponding local pipeline by delegating to the existing pipeline
  management script. *(Requires ADR.)*

- **FR-176-005**: The system MUST expose an endpoint that returns the worktree
  directory path and branch name for a given issue-number pipeline ("join" action).

- **FR-176-006**: The dashboard UI MUST display a "Local Pipelines" panel that
  renders the list returned by FR-176-001. The panel MUST be visible without
  scrolling past the agent grid on standard 1080p displays.

- **FR-176-007**: Each pipeline row in the panel MUST display: branch name,
  worktree path (truncated if needed), human-readable creation time (e.g.
  "2 hours ago"), mode badge, and a running-agent indicator dot.

- **FR-176-008**: The dashboard UI MUST provide a "Start Pipeline" action that
  opens a modal collecting: issue number (required, positive integer), slug
  (optional, alphanumeric-and-hyphen), and mode selection (isolated / shared,
  defaulting to isolated).

- **FR-176-009**: The dashboard UI MUST provide a "Stop" button per pipeline row
  that requires explicit confirmation before dispatching the stop request
  (FR-176-004).

- **FR-176-010**: The dashboard UI MUST show a warning in the stop-confirmation
  dialog when an agent is currently running in the targeted pipeline.

- **FR-176-011**: The dashboard UI MUST provide a "Join" action per pipeline row
  that displays the worktree path and branch name in a modal with a
  clipboard-copy button.

- **FR-176-012**: The existing agent invoke modal MUST be extended with an optional
  "Run in pipeline" selector that lists active pipelines by branch name. When a
  pipeline is selected, the agent invocation (FR-023) MUST use that pipeline's
  worktree directory as the working directory for the spawned process.

- **FR-176-013**: For Copilot (VS Code) agent invocations with a selected isolated
  pipeline, the system MUST open VS Code targeting the pipeline's worktree
  directory rather than the main project root.

- **FR-176-014**: The pipeline list MUST be filtered to worktrees whose branch names
  match the NNN-slug pattern (three-digit prefix followed by a hyphen and
  alphanumeric characters), excluding the main working tree.

- **FR-176-015**: The pipelines root directory MUST be sourced from the
  `QUORUMKIT_PIPELINES_DIR` environment variable when set; otherwise the system
  MUST derive it from the repository name and issue number using the same default
  logic already in `scripts/pipeline.sh`.

- **FR-176-016**: All issue-number inputs MUST be validated as positive integers on
  both the client and server sides before any pipeline operation is dispatched.

- **FR-176-017**: All pipeline operation results (start success, start failure, stop
  success, stop failure) MUST be broadcast to connected WebSocket clients so that
  all open dashboard tabs reflect the updated state.

---

## Non-Functional Requirements

- **NFR-176-001**: The pipeline list endpoint MUST respond within 3 seconds under
  normal conditions (single `git worktree list` call).
- **NFR-176-002**: Start and stop operations MUST surface progress feedback
  (loading indicator) within 200 ms of the user's confirmation action.
- **NFR-176-003**: All user-input strings (issue number, slug) MUST be sanitised
  before being passed to any shell command to prevent command injection.
- **NFR-176-004**: The "Local Pipelines" panel MUST be present but display an
  informative error state when `git` is unavailable, without crashing the page.

---

## Success Criteria

- [ ] A developer can see all active feature worktrees in the dashboard panel
  without opening a terminal.
- [ ] A developer can start a pipeline for a new issue in under 30 seconds from the
  browser UI, including slug auto-resolution from the issue title.
- [ ] A developer can stop a pipeline with confirmation from the browser UI.
- [ ] A developer can copy the worktree path to clipboard via the "Join" action.
- [ ] An agent invoked with a selected pipeline runs with its working directory set
  to the pipeline's worktree path (verified by log output showing the correct cwd).
- [ ] A Copilot (VS Code) invocation with an isolated pipeline opens VS Code in the
  worktree directory.
- [ ] Invalid issue number inputs (non-integer, empty, negative) are rejected with
  a clear error message before any server call is made.
- [ ] The panel auto-updates when another browser tab starts or stops a pipeline
  (via WebSocket broadcast).
- [ ] The ADR for dashboard write-path extension has been reviewed and merged before
  implementation begins.

---

## Key Entities

- **LocalPipeline**: A git worktree associated with a single feature branch
  (NNN-slug). Attributes: issue number (NNN), branch name, worktree directory
  path, pipeline mode (isolated | shared), creation timestamp, running-agent
  status (boolean).

- **PipelineMode**: An enumeration — `isolated` (a separate git worktree directory
  outside the main working tree) or `shared` (collocated with the main working
  directory structure).

- **PipelineInvocation**: An agent invocation (FR-023) optionally scoped to a
  specific LocalPipeline. Adds a working-directory override to the spawned agent
  process.

---

## Out of Scope

- **Remote pipeline management** — only local git worktrees on the same machine as
  the dashboard server are in scope. Cloud or CI pipeline management belongs to
  the GitHub Actions Orchestrator.
- **Automatic pipeline creation on issue open** — pipeline start is always
  user-initiated from the UI.
- **Pipeline logs or diff views** — displaying git diffs or file contents within
  the pipeline panel is out of scope; the console tab already handles agent logs.
- **Multiple concurrent agents in the same pipeline** — only a single active agent
  per pipeline is tracked in v1.
- **Pipeline-to-pipeline merging or rebasing** — git operations beyond worktree
  creation and removal are out of scope.
- **Persistent pipeline state across server restarts** — the list is re-derived
  from `git worktree list` on each request.
- **Pipeline creation from the GitHub Actions / CI environment** — only local
  development workflows are in scope.

---

## Security and Privacy Considerations

This feature runs on a local developer machine only (same security domain as the
existing `/api/invoke` and `/api/stop` endpoints). No PII is processed. Standard
open-source data classification applies per the constitution.

**Input validation (OWASP A03 — Injection):** All user-supplied strings (issue
number, slug) that are passed to shell commands MUST be validated and sanitised
before dispatch. Issue numbers MUST be constrained to positive integers only.
Slugs MUST match `^[a-z0-9-]{1,50}$` before acceptance. No raw user input may be
interpolated into shell command strings.

**Credential safety:** The pipeline management script does not handle secrets.
No tokens, API keys, or credentials are read from or written to the worktree
during pipeline start/stop.

**Write-path ADR gate:** Because this feature extends the dashboard server's
write-path (filesystem mutation via git worktrees), it falls under the
constitution's Principle IX ADR requirement. The Security Agent MUST review the
ADR and the server-side implementation of FR-176-002 and FR-176-004 before merge.

---

## Assumptions

- The dashboard server (`engine/dashboard/server.js`) runs on the same machine as
  the local git repository.
- `scripts/pipeline.sh` remains the canonical implementation of pipeline
  start/stop/join/status logic; the server delegates to it rather than
  re-implementing worktree management.
- `git` is available on the server's PATH (already required for existing features).
- `gh` CLI is available for slug resolution from issue titles (existing requirement
  from `pipeline.sh`); graceful fallback to `NNN-feature` applies when not present.
- Constitution Principle IX (dashboard read-only) requires an ADR for
  write-path dashboard features; the existing `POST /api/invoke` and
  `POST /api/stop` endpoints (FR-023) provide the architectural precedent.
- The feature targets the local development workflow only; no GitHub Actions
  integration is implied.

---

## Open Questions

> Target: zero unresolved questions before handoff to Developer Agent.

1. **[NEEDS CLARIFICATION] ADR scope** — Should the ADR for dashboard write-path
   extension cover only this feature, or should it retroactively cover the existing
   `POST /api/invoke` / `POST /api/stop` endpoints as well? *Recommended: single ADR
   covering all dashboard write operations including FR-023 precedents.*

2. **[NEEDS CLARIFICATION] VS Code "open in worktree" trigger** — When invoking a
   Copilot agent in isolated mode (FR-176-013), should the server call `code
   <worktree-path>` (opening a new VS Code window) or `code --add <worktree-path>`
   (adding the folder to the current window)? *Impact: user experience and whether
   Copilot context is isolated or shared with main project files.*

3. **[NEEDS CLARIFICATION] Running-agent detection** — The pipeline list
   (FR-176-001) must indicate whether an agent is running in a worktree. Should
   this be detected by checking the in-memory `activeRuns` map in the server
   (process-level) or by scanning for a PID file in the worktree directory
   (persistence across server restarts)? *Recommended: in-memory map for v1.*

4. **[NEEDS CLARIFICATION] Stop behaviour when agent is running** — FR-176-010
   requires a warning when an agent is running. Should the stop action also send
   SIGTERM to the running agent process before removing the worktree, or should
   stop be blocked until the agent exits? *Recommended: SIGTERM + wait with
   configurable timeout.*

5. **[RESOLVED]** Pipeline list endpoint URL — will use `GET /api/local-worktrees`
   to avoid collision with existing `GET /api/pipelines` (which lists
   `.apm/pipelines/` YAML definitions).
