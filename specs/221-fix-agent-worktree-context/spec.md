# Spec: Fix Agent Worktree Context and Copilot Chat Mode — Issue #221

## Overview

When a user invokes an agent from the dashboard and selects a local feature
worktree, three compounding defects cause the agent to start in the wrong
directory, without pipeline context, and (for Copilot mode) in Ask mode rather
than Agent mode. This spec defines the correct behaviour and acceptance criteria
for fixing all three defects together.

## User Stories

### US-1: Agent starts inside the selected feature worktree

As a developer using the QuorumKit dashboard,
I want the agent I invoke to start with its working directory set to the feature worktree I selected,
so that all file edits and git operations are scoped to the correct feature branch.

Acceptance Scenarios:
- Given a local feature worktree exists for issue #NNN, When I select it in the Invoke modal and confirm, Then the spawned agent process has `cwd` equal to that worktree's path
- Given a local feature worktree exists, When the agent is invoked in Copilot mode, Then VS Code opens the worktree directory (not the main project root) and the context file is written inside the worktree
- Given no worktree is selected (the "none" option), When I confirm, Then the agent starts in the main project root as before (no regression)

### US-2: Agent receives pipeline context via environment

As a developer using the QuorumKit dashboard,
I want the agent to receive `QUORUMKIT_PIPELINE_ID` set to the selected issue number,
so that it scopes all work to the correct feature pipeline.

Acceptance Scenarios:
- Given a pipeline (issue number) is selected in the Invoke modal, When the agent is spawned, Then `QUORUMKIT_PIPELINE_ID` is present in its environment and equals the selected issue number
- Given no pipeline is selected, When the agent is spawned, Then `QUORUMKIT_PIPELINE_ID` is not set (existing behaviour preserved)

### US-3: Copilot Chat opens in Agent mode

As a developer using the QuorumKit dashboard with `aiTool: copilot`,
I want Copilot Chat to open in Agent mode when an agent is invoked,
so that the submitted prompt is processed with full tool access rather than limited Ask mode.

Acceptance Scenarios:
- Given VS Code is running and the bridge extension is installed, When an agent is invoked, Then Copilot Chat opens in Agent mode and the prompt is submitted to that Agent-mode session
- Given the preferred `openAgent` commands are unavailable (older VS Code), When an agent is invoked, Then the bridge falls back gracefully and still opens Agent mode without reverting to Ask mode
- Given the mode switch succeeds, When the prompt is submitted, Then the submission does not race against the mode switch (mode is confirmed before submit)

## Functional Requirements

- FR-001: The `/api/invoke` endpoint MUST extract `pipeline_id` from the request body and forward it to `invokeAgent()`.
- FR-002: `invokeAgent()` MUST resolve the worktree path for the given `pipeline_id` by calling `listLocalPipelines()` and MUST use that path as `cwd` when spawning the agent process.
- FR-003: When a worktree path is resolved, `invokeAgent()` MUST set `QUORUMKIT_PIPELINE_ID` in the spawned process environment.
- FR-004: `handleCopilotInvoke()` MUST receive and use the resolved worktree path: the `.code-workspace` file and `.copilot-agent-context.md` MUST be written inside the worktree, and VS Code MUST be opened pointing at the worktree directory.
- FR-005: The `/api/terminal` endpoint MUST apply the same worktree resolution for non-Copilot terminal launches (set `cwd` to worktree path, not `cfg.localPath`).
- FR-006: The bridge extension's `submitPrompt()` MUST NOT call `workbench.action.chat.open` as a fallback when `openAgent`/`setMode` commands fail, as this resets the mode to Ask. If no Agent-mode command succeeds, the fallback MUST use an approach that does not degrade to Ask mode (e.g. clipboard + user notification only).
- FR-007: The bridge extension MUST wait for confirmation that Agent mode is active before submitting the prompt — a fixed 1200 ms delay is not sufficient; the extension MUST poll for mode state or use a command-availability signal.
- FR-008: When no worktree is found for the given `pipeline_id`, `invokeAgent()` MUST fall back to `cfg.localPath` and log a warning (no silent failure).
- FR-009: The running-agent indicator in the Local Pipelines panel MUST light up for the correct worktree after a dashboard-initiated invocation (depends on FR-002 fixing the `cwd`).

## Success Criteria

- [ ] Invoking an agent with a selected worktree results in the agent process `cwd` matching the worktree path (verified by log output or process inspection)
- [ ] `QUORUMKIT_PIPELINE_ID` is present in the spawned agent's environment when a pipeline is selected
- [ ] VS Code opens the worktree directory in Copilot mode (window title / workspace folder reflects the worktree, not the main repo)
- [ ] Copilot Chat opens in Agent mode on first invocation with a clean VS Code window (no manual mode switch required)
- [ ] The running-agent dot indicator lights up against the correct worktree row in the Local Pipelines panel
- [ ] Invoking without a worktree selected is unaffected (no regression on existing behaviour)
- [ ] All existing dashboard server unit tests continue to pass

## Key Entities

- **Worktree**: A git worktree checked out for a specific feature branch; identified by its filesystem path and associated issue number. Not a new concept — already tracked by `listLocalPipelines()`.
- **Pipeline context**: The combination of `pipeline_id` (issue number) and `worktree_path` needed to scope an agent invocation to a specific feature.
- **Bridge extension**: The `quorumkit-copilot-bridge` VS Code extension that intercepts the context file and submits the agent prompt to Copilot Chat in Agent mode.

## Out of Scope

- Changes to how worktrees are created or deleted (`scripts/pipeline.sh`)
- Changes to the pipeline selector UI in the Invoke modal (the dropdown already sends `pipeline_id` correctly)
- Support for remote (non-local) worktrees
- Changes to the orchestrator's GitHub Actions–based agent invocation path (`engine/orchestrator/agent-invoker.js`)

## Security and Privacy Considerations

N/A — single-user/no-auth system. The worktree path is server-side only; it is never exposed to or accepted from the browser client (the client sends only the `pipeline_id` / issue number, and the server resolves the path internally via `listLocalPipelines()`). This ensures a path-traversal attack via a crafted `worktree_path` in the request body is not possible.

## Assumptions

- `listLocalPipelines()` is already correct and returns the right worktree path for a given issue number; no changes to that function are required.
- The bridge extension is already installed via `ensureBridgeExtensionInstalled()` before `handleCopilotInvoke()` runs.
- VS Code 1.96+ is the minimum supported version (the `workbench.action.chat.openAgent` command exists from that version).

## Open Questions

_None — all defects are fully traced to specific code paths and all requirements are unambiguous. Ready for handoff to Developer Agent._
