# Tasks — Issue #221
## Fix Agent Worktree Context and Copilot Chat Mode

---

## TASK-01 — Write failing tests: FR-001, FR-002, FR-003, FR-008
**Status**: not-started  
**File**: `engine/tests/dashboard-invoke-worktree.test.js` (new)

Tests to write (all should FAIL before implementation):
- `POST /api/invoke with pipeline_id forwards it to invokeAgent` — returns `{ok:true}` (not an error) when `pipeline_id: '42'` is included
- `POST /api/invoke ignores non-numeric pipeline_id` — `pipeline_id: '../etc/passwd'` is sanitised (response still `{ok:true}`)
- `invokeAgent uses worktree path as cwd when pipeline_id matches a worktree` — process runs with cwd = worktree path
- `invokeAgent falls back to localPath and logs warning when no worktree found for pipeline_id` — cwd = localPath, warning in log
- `invokeAgent sets QUORUMKIT_PIPELINE_ID in env when pipeline_id provided` — env var present in spawned process

---

## TASK-02 — Implement FR-001: /api/invoke extracts pipeline_id
**Status**: not-started  
**File**: `engine/dashboard/server.js`

Changes:
- In `POST /api/invoke` handler: extract `pipeline_id` from body
- Validate: accept only string matching `/^\d+$/`; treat anything else as `null`
- Pass validated `pipeline_id` as fifth arg to `invokeAgent()`

---

## TASK-03 — Implement FR-002, FR-003, FR-008: invokeAgent worktree cwd + warning
**Status**: not-started  
**File**: `engine/dashboard/server.js`

Changes:
- Add `async resolveWorktreePath(pipelineId, cfg, agentId)` helper that calls `listLocalPipelines` and returns `{ worktreePath, found }`.  When not found, broadcasts a `warn` log and returns `{ worktreePath: cfg.localPath, found: false }`.
- In `invokeAgent()`: after existing checks, call `resolveWorktreePath` when `pipelineId` is set
- Change `spawn` `cwd` from `cfg.localPath` to `worktreePath`
- `QUORUMKIT_PIPELINE_ID` env injection already exists; ensure it still fires

---

## TASK-04 — Implement FR-004: Copilot sentinel workDir override
**Status**: not-started  
**File**: `engine/dashboard/server.js`

Changes:
- In `invokeAgent()` Copilot branch: override `cmd.workDir` with `worktreePath` before calling `handleCopilotInvoke()`
- Use shallow clone (`{ ...cmd, workDir: worktreePath }`) to avoid mutating `buildAgentCmd` return value
- In `/api/terminal` Copilot branch: same override before calling `handleCopilotInvoke()`

---

## TASK-05 — Write failing tests: FR-005
**Status**: not-started  
**File**: `engine/tests/dashboard-invoke-worktree.test.js` (append)

Tests to write (should FAIL before TASK-06):
- `POST /api/terminal (non-Copilot) uses worktree path as cwd when pipeline_id matches` — terminal command's `cwd` arg matches worktree path
- `POST /api/terminal (non-Copilot) falls back to localPath when pipeline_id has no worktree`

---

## TASK-06 — Implement FR-005: /api/terminal worktree resolution
**Status**: not-started  
**File**: `engine/dashboard/server.js`

Changes:
- In `POST /api/terminal` handler: extract `pipeline_id` from body (same digit validation as FR-001)
- For non-Copilot path: call `resolveWorktreePath` and pass result as `cwd` to `buildTerminalCmd`
- For Copilot path: call `resolveWorktreePath` and override `cmd.workDir` before `handleCopilotInvoke`

---

## TASK-07 — Implement FR-009: global._agentProcesses tracking
**Status**: not-started  
**File**: `engine/dashboard/server.js`

Changes:
- In `invokeAgent()`, after `running.set(agentId, info)`:
  - Initialise `global._agentProcesses` if falsy
  - `global._agentProcesses.set(agentId, { cwd: worktreePath })`
- In `proc.on('exit')`:
  - `global._agentProcesses && global._agentProcesses.delete(agentId)`

---

## TASK-08 — Write failing tests: FR-006, FR-007 (bridge extension)
**Status**: not-started  
**File**: `engine/tests/bridge-submit-prompt.test.js` (new)

Strategy: extract the pure `submitPrompt` logic into a testable function by passing a mock `vscode` object. Tests:
- `submitPrompt does not call workbench.action.chat.open when no agent-mode command succeeds`
- `submitPrompt writes prompt to clipboard and shows informationMessage when no mode command succeeds`
- `submitPrompt does not call setTimeout(fn, 1200) — uses polling instead`
- `submitPrompt calls focusInput polling after mode switch`

---

## TASK-09 — Implement FR-006: remove workbench.action.chat.open fallback
**Status**: not-started  
**File**: `engine/dashboard/extensions/quorumkit-copilot-bridge/extension.js`

Changes:
- Remove block: `if (!modeSwitched) { await tryCmd('workbench.action.chat.open', { mode: 'agent' }); }`
- Replace with: write prompt to clipboard, show `informationMessage` asking user to open Agent mode manually, return `true` early

---

## TASK-10 — Implement FR-007: polling loop replaces fixed delay
**Status**: not-started  
**File**: `engine/dashboard/extensions/quorumkit-copilot-bridge/extension.js`

Changes:
- Add `async function waitForAgentModeReady(maxMs)` that polls `workbench.action.chat.focusInput` every 150 ms, returning `true` when it succeeds or `false` after `maxMs`
- Replace `await new Promise(r => setTimeout(r, 1200))` with `await waitForAgentModeReady(5000)`

---

## TASK-11 — Run full test suite; all must pass
**Status**: not-started

Command: `cd engine && npm test`  
Expected: all 229+ tests pass, zero failures.
