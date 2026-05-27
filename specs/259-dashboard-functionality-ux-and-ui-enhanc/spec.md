# Spec: Dashboard Functionality, UX and UI Enhancements — Issue #259

## Overview

The QuorumKit dashboard is the primary observability surface for agent activity,
pipeline runs, and the work board. This feature resolves four concrete usability
gaps: arbitrary agent ordering, cramped bottom-drawer panels, a pipeline panel
with no agent-context guidance, and a board view that provides no actionable
status signal. All changes remain within the read-only observability contract
(constitution §IX).

---

## User Stories

### US-1: SDLC-ordered agent list

As a developer using the QuorumKit dashboard,  
I want agents displayed in their natural SDLC sequence (Triage → BA → Architect → Developer → QA → Reviewer → Security → DevOps → Docs → Release),  
so that I can locate the correct agent for my current stage without visual scanning.

**Acceptance Scenarios:**

- **Given** the dashboard is loaded **When** the agent grid renders **Then** agent cards appear in the order: Triage, BA/Product, Architect, Developer, QA/Test, Reviewer, Security, DevOps, Docs, Release — with any additional agents appended after this sequence.
- **Given** the search/filter bar is used **When** a filter is active that hides some agents **Then** the remaining visible agents preserve their relative SDLC order.
- **Given** a new agent is added to the system **When** it has no explicit SDLC position defined **Then** it is appended at the end of the ordered list rather than inserted at an arbitrary position.

---

### US-2: Expanded board, timeline and pipeline panels

As a developer monitoring in-flight pipelines,  
I want the board, timeline, and pipeline panels to occupy a larger, persistent area of the screen,  
so that I can inspect queued vs. completed work and navigate pipeline history without manual resizing or excessive scrolling.

**Acceptance Scenarios:**

- **Given** the dashboard is opened at the default window size (≥ 1 280 px wide) **When** the layout renders **Then** the board, timeline, and pipeline panels each have a visible content height of at least 300 px without requiring the user to resize anything.
- **Given** any one of the three panels is active **When** the user views it **Then** the panel is fully interactive (scrollable, clickable) within its allocated space.
- **Given** the detail side-panel is open **When** the expanded panels are visible **Then** the detail panel does not overlap or obscure the panel content area.

---

### US-3: Agent suggestions in the pipeline panel

As a developer composing a pipeline run,  
I want the pipeline panel to surface at least the top three recommended next-agent suggestions based on the current issue or pipeline context,  
so that I can quickly identify the correct agent sequence and trigger the next step with pre-populated inputs — without having to recall agent names manually.

**Acceptance Scenarios:**

- **Given** an issue number is set as the active context **When** the pipeline panel is open **Then** at least three agent suggestions are displayed, each showing the agent name, its SDLC role, and the reason it is recommended.
- **Given** the suggestions are displayed **When** the user selects a suggestion **Then** the agent's detail panel opens with the issue context pre-populated in the input field (display only — no automatic invocation).
- **Given** no issue context is set **When** the pipeline panel is open **Then** a neutral prompt guides the user to set an issue number to receive suggestions, and a default ordered list of all agents is shown as a fallback.
- **Given** suggestions are rendered **When** the user reviews them **Then** no write action of any kind is triggered or possible from the suggestion UI (constitution §IX).

---

### US-4: Per-agent status badges on the board view

As a developer monitoring an active pipeline,  
I want the board view to show a clear status badge (queued / running / completed / failed / idle) for each agent in the active pipeline,  
so that I have an immediate, actionable signal about in-flight work without reading log output.

**Acceptance Scenarios:**

- **Given** an active pipeline run exists **When** the board view is open **Then** each agent card displays exactly one of five status badges: `idle`, `queued`, `running`, `completed`, or `failed`, visually differentiated by colour and/or icon.
- **Given** an agent's status changes (e.g. from `queued` to `running`) **When** the dashboard data is refreshed **Then** the badge updates to reflect the new status without a full page reload.
- **Given** the `running` status is displayed **When** the user views the badge **Then** an animated visual indicator (pulse, spinner, or glow) distinguishes it from static badges.
- **Given** the `failed` status is displayed **When** the user views the badge **Then** the badge uses a colour distinct from all other statuses (red / error colour token) to draw attention.
- **Given** no active pipeline exists for an agent **When** the board is rendered **Then** agents default to the `idle` badge with no animation.

---

## Functional Requirements

- **FR-001**: Agent cards in the main grid **must** be ordered by their SDLC sequence position. The canonical sequence is: Triage (1), BA/Product (2), Architect (3), Developer (4), QA/Test (5), Reviewer (6), Security (7), DevOps (8), Docs (9), Release (10). Agents without an assigned position are appended after position 10 in alphabetical order.
- **FR-002**: When a filter or search term is active, the filtered result set **must** preserve the relative SDLC order established by FR-001.
- **FR-003**: The board, timeline, and pipeline panels **must** render with a minimum visible content height of 300 px at a viewport width of 1 280 px or greater, without requiring user interaction to resize.
- **FR-004**: The layout change in FR-003 **must not** require a mandatory backend; the dashboard **must** remain functional as a standalone static app.
- **FR-005**: The pipeline panel **must** display a minimum of three agent suggestions derived from current issue/pipeline context. Each suggestion **must** include: agent name, SDLC role label, and a human-readable reason for the suggestion.
- **FR-006**: Selecting an agent suggestion **must** open the agent detail panel with the current issue context pre-populated. No agent invocation, API call, or GitHub write action may be triggered as a result of this interaction.
- **FR-007**: When no issue context is active, the pipeline panel **must** display a guidance prompt and fall back to showing the full SDLC-ordered agent list.
- **FR-008**: Each agent card in the board view **must** display exactly one status badge selected from the set: `idle`, `queued`, `running`, `completed`, `failed`.
- **FR-009**: The `running` badge **must** include an animated visual indicator (e.g. pulsing dot or spinner).
- **FR-010**: The `failed` badge **must** use the existing `--red` / error colour token, distinct from all other badge colours.
- **FR-011**: Status badges **must** update on each data-refresh cycle without a full page reload.
- **FR-012**: No new UI element introduced by this feature **must** trigger a write action to GitHub or any external system (constitution §IX).

---

## Success Criteria

- [ ] Agent cards render in the canonical SDLC order on first load and after filter/search operations.
- [ ] Board, timeline, and pipeline panels each have ≥ 300 px visible content height at 1 280 px viewport width with no manual resize required.
- [ ] Pipeline panel shows ≥ 3 agent suggestions with name, role, and reason when an issue context is active.
- [ ] Selecting a suggestion opens the detail panel with issue context pre-populated; no write action fires.
- [ ] Every agent card in the board view shows one of five status badges (`idle`, `queued`, `running`, `completed`, `failed`) with correct colour differentiation.
- [ ] `running` badge animates; `failed` badge uses the red/error token.
- [ ] Badges update on data refresh without full page reload.
- [ ] Dashboard loads and functions without any backend process (static-file mode).
- [ ] No new write path to GitHub or any external system is introduced (verified by Security Agent review).

---

## Key Entities

- **Agent Card**: A visual tile representing one QuorumKit agent, displaying its name, role, SDLC position, status badge, and commands. Rendered in the main grid and the board panel.
- **SDLC Position**: An integer (1–10) that defines the canonical ordering of an agent within the software development lifecycle sequence. Stored as metadata on the agent definition.
- **Status Badge**: A labelled, colour-coded indicator attached to an Agent Card showing the agent's current execution state within the active pipeline (`idle` | `queued` | `running` | `completed` | `failed`).
- **Pipeline Panel**: The drawer section that displays the history of pipeline runs, the active run's agent sequence, and (after this feature) contextual next-agent suggestions.
- **Issue Context**: The GitHub Issue number that is currently active in the dashboard session, used to derive agent suggestions in the pipeline panel.
- **Agent Suggestion**: A recommended next-agent entry shown in the pipeline panel, comprising agent name, SDLC role, and recommendation rationale, derived from the current issue context.

---

## Out of Scope

- Adding write capabilities to the dashboard — permanently blocked by constitution §IX.
- Real-time push updates via WebSocket or SSE — separate feature.
- Dark mode or full visual redesign.
- Mobile / responsive layout optimisation.
- Bottom-drawer resize handle (alternative approach explicitly rejected in issue).
- Floating panel variant (alternative approach explicitly rejected in issue).
- Automatic agent invocation from the suggestion UI — display and navigation only.
- Changing the agent definition files (`.github/agents/*.md`) as part of this work.
- Backend API or server-side changes to `engine/dashboard/server.js` beyond what is needed to serve static assets.

---

## Security and Privacy Considerations

The dashboard is a read-only observability surface (constitution §IX). This feature introduces no new data sources beyond what the dashboard already reads (GitHub Events, workflow run data). No PII is handled. The following constraints apply:

- No new outbound network calls beyond those already authorised in the existing dashboard.
- No tokens, secrets, or credentials are introduced or stored in any new UI element.
- The "select a suggestion" interaction (FR-006) is a local client-side navigation only — it **must not** trigger any API call, form submission, or GitHub write.
- Any PR for this feature **must** pass the "Dashboard read-only audit" quality gate (constitution, Quality Gates section).

---

## Assumptions

- The canonical SDLC agent order (Triage → BA → Architect → Developer → QA → Reviewer → Security → DevOps → Docs → Release) is fixed for the scope of this feature; changes to the sequence require a separate issue.
- Agent suggestion logic in the pipeline panel is client-side only, derived from the issue number and statically-defined heuristics (e.g. if the last completed agent was Triage, suggest BA next). No ML or external inference service is required.
- "Current issue context" is set by the user typing an issue number into an existing or new input field in the pipeline panel — it is not automatically inferred from the git branch.
- The minimum viewport for which layout guarantees apply is 1 280 px wide; narrower viewports are out of scope for this issue.
- Existing design tokens (`--red`, `--green`, `--amber`, `--cyan`, etc.) are sufficient for status badge colour differentiation; no new tokens need to be introduced.
- The existing drawer (`#drawer`) height variable (`--drawer-h: 280px`) will be increased or the drawer relocated; the exact implementation approach is delegated to the Developer Agent.

---

## Open Questions

_All questions resolved before handoff. None remaining._
