# Tasks — Issue #259
# Dashboard Functionality, UX and UI Enhancements

## Task List

### T-01 · Write unit tests (TDD red phase)
**File:** `engine/tests/dashboard-259.test.js`  
**Status:** [ ]

Create a new vitest test file with the following test suites:
- `US-1: SDLC ordering` — `sdlcSort()` behaviour (5 test cases)
- `US-4: Status badge config` — `getStatusBadgeConfig()` behaviour (5 test cases)
- `US-3: Agent suggestions` — `computeAgentSuggestions()` behaviour (5 test cases)

Tests must **fail** before implementation begins.

---

### T-02 · Add SDLC ordering to index.html (US-1)
**File:** `engine/dashboard/index.html`  
**Status:** [ ]

1. Add `SDLC_POSITIONS` constant near the top of the `<script>` block.
2. Add `sdlcSort(agents)` function.
3. Modify `renderGrid()` to call `sdlcSort()` on each domain's visible agent list before rendering.

---

### T-03 · Add SDLC ordering to generate-dashboard.js (US-1)
**File:** `engine/dashboard/generate-dashboard.js`  
**Status:** [ ]

After all agents are pushed to the `agents` array, sort by SDLC position so the generated `AGENTS` block in `index.html` is already in canonical order.

---

### T-04 · Increase drawer height (US-2)
**File:** `engine/dashboard/index.html`  
**Status:** [ ]

Change CSS custom property `--drawer-h` from `280px` to `360px`. Content area becomes 322 px ≥ 300 px.

---

### T-05 · Add agent suggestions to pipeline panel (US-3)
**File:** `engine/dashboard/index.html`  
**Status:** [ ]

1. Add HTML for `#lp-suggestions-wrap` section inside `#lpanel` (before existing worktrees toolbar).
2. Add CSS: `.suggestions-list`, `.suggestion-card`, `.suggestion-name`, `.suggestion-role`, `.suggestion-reason`, `.suggestion-no-ctx`.
3. Add JS: `_activeIssueCtx` state, `computeAgentSuggestions()`, `renderSuggestions()`, `setIssueContext()`.
4. Wire `#lp-ctx-btn` and `#lp-ctx-issue` input in `DOMContentLoaded`.
5. Call `renderSuggestions()` on init and when pipeline tab opened.
6. Update `openDetail(a, issueCtx)` to accept optional issue context and render a read-only context pill.

---

### T-06 · Add per-agent status badges to board view (US-4)
**File:** `engine/dashboard/index.html`  
**Status:** [ ]

1. Add CSS: `.status-badge`, `.status-badge-idle/queued/running/completed/failed`, `@keyframes badge-pulse`, `#k-agent-strip`, `.k-agent-item`.
2. Add JS: `agentStatuses` map, `getStatusBadgeConfig()`, `updateAgentStatus()`, `renderBoardAgentStrip()`.
3. Add `<div id="k-agent-strip"></div>` before `<div id="kpanel">` in the kanban panel HTML.
4. Update `setAgentBusy()` to call `updateAgentStatus()`.
5. Update `handleServerMsg()` `agentStatus` case to map to 5-state values.
6. Call `renderBoardAgentStrip()` in `init()` and when switching to the Board tab.

---

### T-07 · Run tests (TDD green phase) and verify
**Status:** [ ]

1. Run `npm test` in `engine/orchestrator/`.
2. All tests in `dashboard-259.test.js` must pass.
3. All pre-existing tests must still pass (no regressions).

---

## Completion Checklist

- [ ] All tasks marked complete
- [ ] `npm test` passes with zero failures
- [ ] No hardcoded secrets
- [ ] No write actions introduced in dashboard
- [ ] `--drawer-h` is 360px (panel content ≥ 300px)
- [ ] Agent grid renders in SDLC order on load and after filter
- [ ] Pipeline panel shows suggestions section
- [ ] Board panel shows agent status strip with 5-state badges
- [ ] `running` badge animates; `failed` badge uses red token
