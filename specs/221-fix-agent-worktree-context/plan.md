# Implementation Plan — Issue #221
## Fix Agent Worktree Context and Copilot Chat Mode

## Constitution Check

| Rule | How this plan satisfies it |
|------|---------------------------|
| No direct commits to main | Feature branch: `221-fix-agent-worktree-context` |
| Tests before implementation | TDD: failing tests written per task before each implementation task |
| No hardcoded secrets | N/A — no secrets involved; worktree path is server-side only |
| Input validation at boundaries | `pipeline_id` validated as digits-only string at every HTTP entry point before use |
| Data access scoping | N/A — single-user/no-auth system (confirmed in spec) |
| Coverage threshold | 80% lines required; approach: integration tests via server subprocess + unit test for bridge extension logic |

## Overview

Three compounding defects cause agents to start in the wrong directory, without
pipeline context, and (for Copilot mode) in Ask mode. This plan fixes all three
together across two files:

- `engine/dashboard/server.js` — FR-001 through FR-005, FR-008, FR-009
- `engine/dashboard/extensions/quorumkit-copilot-bridge/extension.js` — FR-006, FR-007

## Design Decisions

### 1. Worktree resolution helper (FR-002, FR-004, FR-005, FR-008)

A shared async helper `resolveWorktreePath(pipelineId, cfg)` is introduced to avoid
duplicating the `listLocalPipelines` lookup in three places (`invokeAgent`, the
Copilot branch, `/api/terminal` non-Copilot branch). It returns the worktree path
when found, or `cfg.localPath` plus a broadcast warning when not found.

### 2. Copilot sentinel workDir override (FR-004)

`buildAgentCmd` resolves `skillFile` / `agentFile` relative to `cfg.localPath`
(main project root) — this is correct since agent definition files live in the
main project's `.github/` directory. Only `workDir` in the returned sentinel
needs to be overridden to the worktree path. We do a shallow clone of the sentinel
object in `invokeAgent` to avoid mutating the original.

### 3. FR-009: global._agentProcesses tracking

`listLocalPipelines` already checks `global._agentProcesses` for the
`runningAgent` indicator. `invokeAgent` will populate this map keyed by `agentId`
with `{ cwd: worktreePath }` on spawn, and delete it on process exit.

### 4. Bridge extension: FR-006 fallback (no workbench.action.chat.open)

The `workbench.action.chat.open` call in the "no mode switched" branch is
replaced by clipboard write + `showInformationMessage` + early return.
This prevents the session being reset to Ask mode.

### 5. Bridge extension: FR-007 polling (no fixed 1200 ms delay)

A bounded polling loop (`waitForAgentModeReady`) replaces the 1200 ms
`setTimeout`. It tries `workbench.action.chat.focusInput` every 150 ms for up
to 5 seconds. On success the loop exits immediately; on timeout it continues
to the submit step (best-effort).

## Files Changed

| File | Change type |
|------|-------------|
| `engine/dashboard/server.js` | Modify — FR-001, FR-002, FR-003, FR-004, FR-005, FR-008, FR-009 |
| `engine/dashboard/extensions/quorumkit-copilot-bridge/extension.js` | Modify — FR-006, FR-007 |
| `engine/tests/dashboard-invoke-worktree.test.js` | New — tests for server.js changes |
| `engine/tests/bridge-submit-prompt.test.js` | New — unit tests for bridge extension logic |

## Task Sequence

1. **TASK-01**: Write failing tests for FR-001, FR-002, FR-003, FR-008
2. **TASK-02**: Implement FR-001 (`/api/invoke` extracts `pipeline_id`)
3. **TASK-03**: Implement FR-002, FR-003, FR-008 (`invokeAgent` worktree + cwd + warning)
4. **TASK-04**: Implement FR-004 (Copilot sentinel `workDir` override)
5. **TASK-05**: Write failing tests for FR-005 (`/api/terminal` worktree)
6. **TASK-06**: Implement FR-005 (`/api/terminal` worktree for both Copilot + non-Copilot)
7. **TASK-07**: Implement FR-009 (`global._agentProcesses` tracking)
8. **TASK-08**: Write failing tests for FR-006 and FR-007 (bridge extension)
9. **TASK-09**: Implement FR-006 (remove `workbench.action.chat.open` fallback)
10. **TASK-10**: Implement FR-007 (polling loop replaces fixed delay)
11. **TASK-11**: Run full test suite — all must pass
