# Spec: Stop Button for Pipeline Disappeared from UI — Issue #273

## Overview

The **Stop** and **Join** action buttons on pipeline rows in the Local Pipelines panel of the QuorumKit dashboard became unreachable after the split-panel navigation rework (#259). The buttons were left inside a collapsible body `div` (`display:none`) that is never expanded in the new layout, effectively hiding them from users. This spec covers restoring both buttons to the always-visible pipeline row header so that users can stop or join a running pipeline directly from the panel.

## User Stories

### US-1: Stop a running pipeline from the Local Pipelines panel

As a developer using the QuorumKit dashboard,
I want a visible **■ Stop** button on every pipeline row in the Local Pipelines panel,
so that I can stop a running pipeline without navigating away or using the command line.

Acceptance Scenarios:
- **Given** the Local Pipelines panel lists at least one active pipeline, **When** I view the pipeline row, **Then** a **■ Stop** button is visible in the row header without requiring any expand/click action.
- **Given** I click the **■ Stop** button for pipeline #NNN, **When** the stop request completes, **Then** the pipeline is stopped and the row updates to reflect the stopped state.
- **Given** the dashboard is loaded and pipelines are polled/refreshed, **When** the pipeline list reloads, **Then** the Stop button remains visible on every row (it is not lost between poll cycles).

### US-2: Join a running pipeline from the Local Pipelines panel

As a developer using the QuorumKit dashboard,
I want a visible **⎇ Join** button on every pipeline row in the Local Pipelines panel,
so that I can open the pipeline worktree directly from the dashboard.

Acceptance Scenarios:
- **Given** the Local Pipelines panel lists at least one pipeline, **When** I view the pipeline row, **Then** a **⎇ Join** button is visible in the row header alongside the Stop button.
- **Given** I click the **⎇ Join** button for pipeline #NNN, **When** the action completes, **Then** the pipeline worktree is opened (existing join behaviour is preserved).

## Functional Requirements

- **FR-001**: The **■ Stop** button must be rendered in the pipeline card's always-visible header row, not inside any collapsible or hidden container.
- **FR-002**: The **⎇ Join** button must be rendered in the pipeline card's always-visible header row, adjacent to the Stop button.
- **FR-003**: Both buttons must remain visible after any dashboard polling/reload cycle (not just on initial render).
- **FR-004**: Clicking **■ Stop** must invoke the existing `stopLocalPipeline` function with the pipeline's issue number and running agent, preserving the existing backend `/api/local-pipelines/stop` call.
- **FR-005**: Clicking **⎇ Join** must invoke the existing `joinLocalPipeline` function, preserving existing behaviour.
- **FR-006**: The collapsible body structure (expand/collapse mechanic) that hid the buttons must be removed from the pipeline card render path. The always-visible header approach is the sole layout.
- **FR-007**: No regression to the right-panel detail view (`openPipelineDetail`) when selecting a pipeline row.

## Success Criteria

- [ ] Opening the dashboard with at least one active pipeline shows the **■ Stop** button visibly on the pipeline row header without any user interaction.
- [ ] Opening the dashboard with at least one active pipeline shows the **⎇ Join** button visibly on the pipeline row header.
- [ ] The buttons persist after the polling interval refreshes the pipeline list.
- [ ] Clicking **■ Stop** triggers the stop API call (network request to `/api/local-pipelines/stop`) and the button enters a loading/disabled state.
- [ ] Clicking **⎇ Join** triggers the join action for the correct pipeline.
- [ ] No collapsible body div is rendered per pipeline card (the dead expand mechanic is removed).
- [ ] The right-panel detail view opens correctly when a pipeline row is clicked.

## Key Entities

- **Pipeline Card**: A UI row in the Local Pipelines panel representing a single active local pipeline, identified by its issue number and branch name.
- **Stop Button (pipeline)**: The **■ Stop** action button that sends a stop request for the pipeline via `/api/local-pipelines/stop`. CSS class `lp-btn lp-btn-stop`.
- **Join Button (pipeline)**: The **⎇ Join** action button that opens the pipeline worktree. CSS class `lp-btn lp-btn-join`.
- **Header Row (`hdr`)**: The always-visible top bar of a pipeline card containing issue number, branch name, mode badge, and action buttons.
- **Collapsible Body**: The hidden `div` (`display:none`) formerly used to house action buttons; to be removed as part of this fix.
- **Split-Panel Layout**: The current dashboard layout introduced in #259 where pipelines are the root view with a left list and right detail panel; the old expand mechanic is incompatible with this layout.

## Out of Scope

- Adding new pipeline actions beyond Stop and Join (e.g. Timeline button is excluded from this fix).
- Changes to the `/api/local-pipelines/stop` or `/api/local-pipelines/join` backend endpoints.
- Changes to the agent Stop button (`.d-stop-btn`) in the agent detail panel — that is a separate control.
- Changes to pipeline creation, listing, or status-reporting logic.
- Any change to the `server.js` file.

## Security and Privacy Considerations

This is a pure UI regression fix. No new data is exposed and no authentication or authorisation logic is modified. The Stop button already existed and its backend endpoint is unchanged. No PII is involved.

## Assumptions

- The split-panel layout (pipelines as root view) is the current and intended layout; the collapsible expand mechanic is definitively removed.
- The `stopLocalPipeline` and `joinLocalPipeline` JavaScript functions exist in `engine/dashboard/index.html` and their signatures are unchanged.
- The right-panel `openPipelineDetail` behaviour should be preserved when clicking the card body (not the buttons).
- Polling interval for the pipeline list is handled by `loadLocalPipelines()`; the buttons must survive re-renders triggered by polling.

## Open Questions

_None — root cause is fully identified from code history and the fix approach is unambiguous. Ready for handoff._
