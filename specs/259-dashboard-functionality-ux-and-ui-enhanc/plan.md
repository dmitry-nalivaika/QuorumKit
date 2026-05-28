# Implementation Plan — Issue #259
# Dashboard Functionality, UX and UI Enhancements

## Constitution Check

| Rule | How this plan satisfies it |
|------|---------------------------|
| No direct commits to main | Feature branch: `259-dashboard-functionality-ux-and-ui-enhanc` |
| Tests before implementation | TDD workflow enforced per task; test file created before index.html edits |
| No hardcoded secrets | No secrets in dashboard HTML/JS — all data is read-only observability output |
| Input validation at boundaries | Issue number inputs: validated as positive integer before use (`/^\d+$/`); all DOM output via `esc()` helper |
| Data access scoping | N/A — dashboard is read-only per constitution §IX; no auth required |
| Coverage threshold | Unit tests cover all 4 user stories' acceptance scenarios; no server infrastructure changes |

---

## Approach Summary

All changes are **client-side only** (HTML/CSS/JS in `engine/dashboard/index.html`) plus a minor ordering change in `engine/dashboard/generate-dashboard.js`. No backend modifications are needed and the dashboard remains functional as a standalone static app (FR-004).

### US-1 — SDLC-ordered agent list (FR-001, FR-002)
- Add `SDLC_POSITIONS` constant (triage=1 … release=10) to the inline `<script>`.
- Add `sdlcSort(agents)` function; unknown agents sorted alphabetically after position 10.
- Modify `renderGrid()` to call `sdlcSort()` on the visible agent list before rendering each domain group.
- Update `generate-dashboard.js` to sort the `agents` array by SDLC position before writing to `index.html`, so the initial `AGENTS` array already reflects SDLC order.

### US-2 — Pipelines as root view / right-side detail panel (FR-003, FR-004)

> **Note (reviewer SUGGESTION-1):** The original plan described a simple `--drawer-h` increase. During implementation the spec was updated to make Pipelines the root view (spec commit `2a5087a`/`23039e8`). The changed approach is documented here.

- Add a `#main-nav` bar with four top-level tabs: **Pipelines** (default) · **Agents** · **Timeline** · **Board**.
- Replace the bottom-drawer pipeline panel with a split-layout `#pm-view`:
  - **Left column** `#pl-col` (280 px fixed): pipeline list + "Start New Pipeline" button.
  - **Right detail panel** `#pl-detail` (fills remaining width, `overflow-y: auto`): opens alongside the list when a pipeline row is clicked.
- The right panel provides well over 300 px of vertical content space at any viewport width ≥ 1280 px, satisfying FR-003 without a height magic-number.
- **FR-003 verification:** The detail panel height equals `viewport height − topbar − console bar`. At the minimum supported viewport of 1280 × 800 the available height exceeds 500 px, far above the 300 px requirement. This is a structural guarantee rather than a fixed CSS value, so no additional unit test is required beyond confirming the layout rule exists in CSS.
- **FR-004 verification:** No backend call is made for the layout itself. The suggestions section (`renderSuggestions`) runs entirely client-side. The timeline section calls `/api/timeline/:issue` only when a pipeline is selected — this is an optional enhancement that degrades gracefully when the server is absent (shows empty state). The core layout and agent grid function as a standalone static app.
- `#workspace.drawer-closed` is the default CSS class; the drawer is hidden on load.
- `switchMainView(view)` function manages class toggling (`view-agents`, `view-timeline`, `view-board`) on `#workspace`.

### US-3 — Agent suggestions in pipeline panel (FR-005, FR-006, FR-007)
- Add a "💡 Next Agent Suggestions" section at the top of `#lpanel` (pipeline panel) in HTML.
- Add `computeAgentSuggestions(agents, issueCtx)` pure function:
  - `issueCtx === null` → returns `null` (no-context signal).
  - Otherwise returns first 3 universal agents in SDLC order not yet completed, each with `{ agent, reason }`.
- Add `renderSuggestions()` that renders a guidance prompt + fallback list when no context, or top-3 suggestion cards when context is active.
- Each suggestion card: clicking opens `openDetail(agent, issueCtx)` — display only, no write action (FR-012).
- `openDetail()` gains optional second argument `issueCtx`; when present, a read-only context pill is shown at the top of the detail panel body.
- Add `_activeIssueCtx` state variable; wire `#lp-ctx-btn` and `#lp-ctx-issue` input.

### US-4 — Per-agent status badges on board view (FR-008..FR-012)
- Add `agentStatuses` map (`id → status`) initialised to `'idle'` for all agents.
- Add `getStatusBadgeConfig(status)` pure function returning `{ label, cssClass, animated }` for each of the 5 states.
- Add `updateAgentStatus(agentId, status)` function that:
  - Updates `agentStatuses[agentId]`.
  - Updates the badge element in the agent card (if visible).
  - Updates the badge element in the Board strip (if visible).
- Add agent status strip `#k-agent-strip` at the top of `#kanban-panel`, rendered by `renderBoardAgentStrip()`.
- Update `setAgentBusy()` to call `updateAgentStatus()` with the appropriate 5-state value.
- Update `handleServerMsg()` `agentStatus` case to map server status strings to 5-state badges.
- Add CSS: `.status-badge`, `.status-badge-idle/queued/running/completed/failed`, `@keyframes badge-pulse`.
- `running` badge animates via `badge-pulse` keyframe (FR-009); `failed` uses `--red` colour token (FR-010).

---

## Files Changed

| File | Change type |
|------|-------------|
| `engine/dashboard/index.html` | Primary — navigation tabs, split-layout pipelines view, side detail panel, JS logic |
| `engine/dashboard/generate-dashboard.js` | Minor — SDLC sort before writing `AGENTS` |
| `engine/dashboard/server.js` | Minor — `parseCommentToEvent` extended for pipeline-start/stop markers |
| `engine/tests/dashboard-259.test.js` | New — unit tests for all 4 user stories |
| `engine/tests/dashboard-timeline.test.js` | Updated — pipeline-start event parsing |
| `scripts/pipeline.sh` | Fix — cd to main repo root when invoked from a linked worktree |
| `specs/259-dashboard-functionality-ux-and-ui-enhanc/spec.md` | Updated — navigation rework spec |
| `specs/259-dashboard-functionality-ux-and-ui-enhanc/plan.md` | This file |
| `specs/259-dashboard-functionality-ux-and-ui-enhanc/tasks.md` | Updated |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Right-side panel too narrow on small viewports | `#pl-col` has a fixed 280 px basis; `#pl-detail` fills remaining space. At the minimum 1280 px viewport the detail panel is ≥1000 px wide — layout verified visually and by structural CSS guarantee. |
| Suggestion click could be mistaken as an invocation | `openDetail()` is display-only; `invokeAgent()` is NOT called from suggestion card click; enforced by test |
| SDLC sort changes order in existing tests | `generate-dashboard.js` already builds the AGENTS array; sort is idempotent; existing snapshot/order-dependent tests reviewed and none depend on agent array order |
