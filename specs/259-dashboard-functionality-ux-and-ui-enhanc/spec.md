# Spec: Dashboard Navigation Rework — Pipelines as Root View — Issue #259

## Overview

The QuorumKit dashboard is the primary observability surface for agent activity,
pipeline runs, and the work board. This revision establishes **Pipelines as the
root view** of the dashboard, reflecting that pipeline execution is the central
workflow in QuorumKit.

The dashboard has four primary navigation tabs plus a persistent console:

| Tab | Purpose |
|-----|---------|
| **Pipelines** | Central view — list of pipelines with inline right-panel expansion |
| **Agents** | All agent widgets in SDLC order for ad-hoc invocations |
| **Timeline** | Historic read-only review of completed pipeline runs |
| **Board** | Work board — deferred to a future issue |

**Console** persists as a fixed panel at the bottom of the screen across all tabs.

When a pipeline is selected in the Pipelines tab it **expands to the right** within
the same view — the left column retains the pipeline list and a "Start New Pipeline"
button, while the right panel shows (top to bottom): the pipeline's agent execution
timeline fetched from GitHub, context-aware next-agent suggestions, and the full
list of invocable agents. The **Timeline tab** is a standalone historic view for
reviewing runs of any pipeline or feature that has already ended.

All changes remain within the read-only observability contract (constitution §IX).

---

## User Stories

### US-1: Pipelines tab as the central view

As a developer using the QuorumKit dashboard,  
I want pipelines to be the first thing I see when the dashboard loads,  
so that I immediately understand the current state of work without having to navigate away from the default screen.

**Acceptance Scenarios:**

- **Given** the dashboard is loaded **When** the page renders **Then** the Pipelines tab is active by default, showing a scrollable list of pipelines and a "Start New Pipeline" button.
- **Given** the Pipelines tab is active and pipelines exist **When** the view renders **Then** each pipeline row shows its ID/name, current status, and the last-updated time.
- **Given** the Pipelines tab is active and no pipelines exist **When** the view renders **Then** a clear empty state is shown with a prominent "Start New Pipeline" button.
- **Given** the user is on any other tab **When** they click the Pipelines tab **Then** the Pipelines tab becomes active and the right panel is collapsed (no pipeline selected).

---

### US-2: Pipeline row expands to the right

As a developer reviewing a pipeline run,  
I want clicking a pipeline row to reveal a right-hand detail panel within the same view,  
so that I can inspect its history and next steps without leaving the pipeline list.

**Acceptance Scenarios:**

- **Given** the Pipelines tab is active **When** I click a pipeline row **Then** a right-hand panel slides open alongside the pipeline list (split layout), and the selected row is visually highlighted.
- **Given** the right panel is open **When** I click a different pipeline row **Then** the right panel updates to reflect the newly selected pipeline without a full reload.
- **Given** the right panel is open **When** I click the same row again (or a close/collapse control) **Then** the right panel collapses and the pipeline list returns to full width.
- **Given** the right panel is open **When** the panel renders **Then** it contains three stacked sections in order: (1) Agent Execution Timeline, (2) Next-Agent Suggestions, (3) All Invocable Agents.

---

### US-3: Agent execution timeline in the right panel

As a developer reviewing an active or completed pipeline,  
I want to see a chronological stack of every agent that has already run in that pipeline,  
so that I have a clear record of what has been done.

**Acceptance Scenarios:**

- **Given** a pipeline is selected and its right panel is open **When** the timeline section renders **Then** it shows each agent that has run, in chronological order (oldest at the top), with its name, SDLC role, run time, and outcome (`completed` / `failed` / `skipped`).
- **Given** the timeline section is rendered and the pipeline is still in progress **When** the view renders **Then** completed agents appear in the stack and the in-progress agent is visually indicated (e.g. animated badge).
- **Given** no agents have run yet **When** the timeline section renders **Then** an empty-state message is shown (e.g. "No agents have run yet for this pipeline").
- **Given** the timeline section is present **When** next-agent suggestions are computed **Then** agents already completed in this pipeline are excluded or visually deprioritised in the suggestions section below.

---

### US-4: Context-aware next-agent suggestions (timeline-informed)

As a developer composing the next step in a pipeline,  
I want the next-agent suggestions to be informed by both the issue context and the pipeline's execution timeline,  
so that suggestions reflect what has already been done and do not repeat completed stages.

**Acceptance Scenarios:**

- **Given** a pipeline is selected and its timeline shows completed agents **When** next-agent suggestions are displayed in the right panel **Then** at least three suggestions are shown, deprioritising agents already completed in this timeline.
- **Given** no agents have run yet in the selected pipeline **When** suggestions are displayed **Then** the full SDLC-ordered list is shown as a starting point, filtered by the issue context where available.
- **Given** a suggestion is selected **When** the user interacts with it **Then** the agent's detail panel opens with the issue context pre-populated; no automatic invocation occurs.
- **Given** no issue context is set **When** suggestions are displayed **Then** a guidance prompt asks the user to set an issue number, and a default SDLC-ordered fallback list is shown.
- **Given** suggestions are rendered **When** the user reviews them **Then** no write action of any kind is triggered or possible from the suggestion UI (constitution §IX).

---

### US-5: All invocable agents at the bottom of the right panel

As a developer who wants to invoke any agent from within a pipeline context,  
I want a complete list of all available agents shown at the bottom of the pipeline's right panel,  
so that I can invoke any agent even if it is not in the top suggestions.

**Acceptance Scenarios:**

- **Given** a pipeline is selected and the right panel is open **When** I scroll to the bottom of the right panel **Then** a full list of all invocable agents is shown in SDLC order, below the suggestions section.
- **Given** the all-agents list is visible **When** I interact with an agent entry **Then** the agent's detail panel opens with the current pipeline and issue context pre-populated; no write action fires.
- **Given** the all-agents list is visible and the current pipeline's completed agents are known **When** the list renders **Then** agents already completed in this pipeline are visually distinguished (e.g. dimmed or labelled "already run") but remain selectable.

---

### US-6: Agents tab for ad-hoc invocations

As a developer who wants to invoke a specific agent outside of a pipeline,  
I want a dedicated Agents tab that shows all agent widgets in SDLC order,  
so that I can quickly find and open any agent for a one-off task without creating a formal pipeline.

**Acceptance Scenarios:**

- **Given** the user navigates to the Agents tab **When** it renders **Then** agent cards are displayed in the canonical SDLC order: Triage, BA/Product, Architect, Developer, QA/Test, Reviewer, Security, DevOps, Docs, Release — with additional agents appended after.
- **Given** the Agents tab is active **When** a search/filter is applied **Then** the filtered results preserve the relative SDLC order.
- **Given** the Agents tab is active and a pipeline run exists **When** the view renders **Then** each agent card displays a status badge (`idle` | `queued` | `running` | `completed` | `failed`) reflecting its state in the active pipeline.
- **Given** the `running` status badge is displayed **When** the user views it **Then** an animated visual indicator (pulse, spinner, or glow) distinguishes it from static badges.
- **Given** the `failed` status badge is displayed **When** the user views it **Then** the badge uses the red/error colour token, distinct from all other badge colours.
- **Given** no active pipeline exists **When** the Agents tab renders **Then** all agent cards default to the `idle` badge with no animation.
- **Given** a new agent is added to the system **When** it has no explicit SDLC position defined **Then** it is appended at the end of the ordered list rather than inserted at an arbitrary position.

---

### US-7: Timeline tab for historic pipeline review

As a developer who wants to review a pipeline or feature that has already ended,  
I want a standalone Timeline tab that lets me browse the execution history of any pipeline run,  
so that I can conduct post-mortems, learn from past runs, and compare outcomes across features.

**Acceptance Scenarios:**

- **Given** the user navigates to the Timeline tab **When** it renders **Then** a list of all completed (ended) pipeline runs is shown, filterable by feature/issue number.
- **Given** the user selects a pipeline run in the Timeline tab **When** the detail loads **Then** the full chronological agent execution log for that run is displayed, with agent name, SDLC role, run time, and final status.
- **Given** the Timeline tab is active **When** a pipeline run is currently in progress **Then** in-progress runs are excluded from the Timeline tab list (they appear in the Pipelines tab instead).
- **Given** the Timeline tab detail is shown **When** the user views it **Then** no agent invocation, suggestion, or write action is possible — it is strictly read-only.

---

## Functional Requirements

- **FR-001**: The Pipelines tab **must** be the default active tab when the dashboard loads.
- **FR-002**: The Pipelines tab **must** display a scrollable, vertically-stacked list of pipeline runs (most recent first) and a prominent "Start New Pipeline" button.
- **FR-003**: Clicking a pipeline row **must** open a right-hand detail panel within the same Pipelines tab view (split layout). The pipeline list **must** remain visible in the left column. Only one pipeline may be expanded at a time.
- **FR-004**: The right panel **must** contain exactly three stacked sections rendered in this top-to-bottom order: (1) **Agent Execution Timeline**, (2) **Next-Agent Suggestions**, (3) **All Invocable Agents**.
- **FR-005**: The Agent Execution Timeline section **must** list every agent that has run in the selected pipeline in chronological order (oldest at top), showing agent name, SDLC role, run time, and final status (`completed` / `failed` / `skipped`). An in-progress agent **must** carry an animated indicator.
- **FR-006**: The Agent Execution Timeline data **must** be fetched from GitHub (workflow run / check run API) and displayed without a full page reload.
- **FR-007**: Next-agent suggestions **must** be computed from both the issue context (if set) and the pipeline timeline. Agents already completed in the timeline **must** be excluded or visually deprioritised.
- **FR-008**: The suggestion list **must** display a minimum of three entries. Each entry **must** include: agent name, SDLC role label, and a human-readable reason for the suggestion.
- **FR-009**: Selecting a suggestion **must** open the agent detail panel with the current pipeline and issue context pre-populated. No agent invocation, API call, or GitHub write action may be triggered.
- **FR-010**: When no issue context is active, the suggestion list **must** show a guidance prompt and fall back to the full SDLC-ordered agent list.
- **FR-011**: The All Invocable Agents section at the bottom of the right panel **must** list every available agent in SDLC order. Agents already completed in the current pipeline run **must** be visually distinguished (e.g. dimmed or labelled) but remain interactive.
- **FR-012**: The dashboard **must** include a dedicated Agents tab accessible from primary navigation, showing all agent widgets in SDLC order: Triage (1), BA/Product (2), Architect (3), Developer (4), QA/Test (5), Reviewer (6), Security (7), DevOps (8), Docs (9), Release (10). Agents without an assigned position are appended after position 10 in alphabetical order.
- **FR-013**: When a filter or search is active in the Agents tab, the filtered result set **must** preserve the relative SDLC order.
- **FR-014**: Each agent card in the Agents tab **must** display exactly one status badge from the set: `idle`, `queued`, `running`, `completed`, `failed`.
- **FR-015**: The `running` badge **must** include an animated visual indicator (pulsing dot or spinner).
- **FR-016**: The `failed` badge **must** use the existing `--red` / error colour token, distinct from all other badge colours.
- **FR-017**: Status badges **must** update on each data-refresh cycle without a full page reload.
- **FR-018**: The dashboard **must** include a standalone Timeline tab accessible from primary navigation. The Timeline tab **must** list completed (ended) pipeline runs for historic review. In-progress runs are excluded from this tab.
- **FR-019**: The Board tab **must** remain present in primary navigation but **may** display a "coming soon" placeholder for this release.
- **FR-020**: The Console **must** remain a persistent panel fixed to the bottom of the screen, visible across all tabs.
- **FR-021**: The layout **must not** require a mandatory backend; the dashboard **must** remain functional as a standalone static app.
- **FR-022**: No new UI element introduced by this feature **must** trigger a write action to GitHub or any external system (constitution §IX).

---

## Success Criteria

- [ ] Dashboard loads with the Pipelines tab active by default.
- [ ] Pipelines tab shows a list of pipeline runs and a "Start New Pipeline" button.
- [ ] Clicking a pipeline row opens a right-hand detail panel without leaving the Pipelines tab; the pipeline list remains visible.
- [ ] Right panel shows three sections in order: Agent Execution Timeline → Next-Agent Suggestions → All Invocable Agents.
- [ ] Agent Execution Timeline lists agents in chronological order with name, role, time, and status; in-progress agent has an animated indicator.
- [ ] Next-agent suggestions account for timeline history — completed agents are excluded or deprioritised.
- [ ] Suggestion list shows ≥ 3 entries with name, role, and reason when issue context is set.
- [ ] Selecting a suggestion opens the agent detail panel with context pre-populated; no write action fires.
- [ ] All Invocable Agents section lists every agent in SDLC order; already-completed agents are visually distinguished.
- [ ] A dedicated Agents tab is accessible from primary navigation.
- [ ] Agent cards in the Agents tab render in canonical SDLC order on first load and after filter/search.
- [ ] Every agent card displays one of five status badges with correct colour differentiation.
- [ ] `running` badge animates; `failed` badge uses the red/error token.
- [ ] Badges update on data refresh without full page reload.
- [ ] A standalone Timeline tab is accessible from primary navigation and shows completed pipeline runs for historic review; in-progress runs excluded.
- [ ] Board tab is present in navigation (placeholder acceptable for this release).
- [ ] Console panel is visible and functional at the bottom of the screen across all tabs.
- [ ] Dashboard loads and functions without any backend process (static-file mode).
- [ ] No new write path to GitHub or any external system is introduced (verified by Security Agent review).

---

## Key Entities

- **Pipelines Tab**: The root/default tab of the dashboard. Contains a left column (pipeline list + "Start New Pipeline" button) and a right-hand detail panel that opens when a pipeline row is clicked.
- **Pipeline List**: A scrollable, vertically-stacked list of pipeline runs shown in the left column of the Pipelines tab.
- **Right Detail Panel**: A panel that slides open to the right of the pipeline list when a row is selected. Contains three stacked sections: Agent Execution Timeline, Next-Agent Suggestions, All Invocable Agents.
- **Agent Execution Timeline**: The first section of the right detail panel. A chronological stack of every agent that has already run in the selected pipeline, fetched from GitHub. Feeds data to the suggestion engine.
- **Next-Agent Suggestions**: The second section of the right detail panel. A ranked list of recommended agents for the next step, derived from the issue context and the pipeline timeline.
- **All Invocable Agents**: The third (bottom) section of the right detail panel. A complete list of all available agents in SDLC order. Already-completed agents in the current run are visually distinguished but remain selectable.
- **Agents Tab**: A dedicated tab showing all agent widgets in SDLC order. Used for ad-hoc agent invocations outside a formal pipeline.
- **Timeline Tab**: A standalone tab for historic, read-only review of completed (ended) pipeline runs. In-progress runs are not shown here.
- **Board Tab**: A tab reserved for the work board. Displays a placeholder for this release; full implementation deferred.
- **Console**: A persistent panel fixed to the bottom of the screen, visible across all tabs.
- **Agent Card**: A visual tile representing one QuorumKit agent, displaying its name, role, SDLC position, status badge, and commands.
- **SDLC Position**: An integer (1–10) defining the canonical ordering of an agent within the software development lifecycle sequence.
- **Status Badge**: A labelled, colour-coded indicator on an Agent Card showing the agent's current execution state (`idle` | `queued` | `running` | `completed` | `failed`).
- **Issue Context**: The GitHub Issue number currently active in the dashboard session, used to derive agent suggestions.

---

## Out of Scope

- Adding write capabilities to the dashboard — permanently blocked by constitution §IX.
- Real-time push updates via WebSocket or SSE — separate feature.
- Dark mode or full visual redesign.
- Mobile / responsive layout optimisation.
- Automatic agent invocation from the suggestion UI — display and navigation only.
- Changing the agent definition files (`.github/agents/*.md`) as part of this work.
- Backend API or server-side changes to `engine/dashboard/server.js` beyond what is needed to serve static assets.
- Full implementation of the Board tab — deferred to a future issue.
- Start New Pipeline write flow — the button may be present but the implementation of any write action is out of scope for this issue.

---

## Security and Privacy Considerations

The dashboard is a read-only observability surface (constitution §IX). This feature introduces no new data sources beyond what the dashboard already reads (GitHub Events, workflow run data). No PII is handled. The following constraints apply:

- No new outbound network calls beyond those already authorised in the existing dashboard.
- No tokens, secrets, or credentials are introduced or stored in any new UI element.
- The "select a suggestion" interaction (FR-007) is a local client-side navigation only — it **must not** trigger any API call, form submission, or GitHub write.
- Any PR for this feature **must** pass the "Dashboard read-only audit" quality gate (constitution, Quality Gates section).

---

## Assumptions

- The canonical SDLC agent order (Triage → BA → Architect → Developer → QA → Reviewer → Security → DevOps → Docs → Release) is fixed for the scope of this feature; changes to the sequence require a separate issue.
- The pipeline list and right detail panel share the horizontal space of the main content area in a split-column layout. The exact column widths (e.g. 35 % / 65 %) are delegated to the Developer Agent.
- Agent suggestion logic in the right panel is client-side only, derived from the issue number and statically-defined heuristics (e.g. if the last completed agent was Triage, suggest BA next). No ML or external inference service is required.
- "Current issue context" is set by the user typing an issue number into an existing or new input field — it is not automatically inferred from the git branch.
- The minimum viewport for which layout guarantees apply is 1 280 px wide; narrower viewports are out of scope for this issue.
- Existing design tokens (`--red`, `--green`, `--amber`, `--cyan`, etc.) are sufficient for status badge colour differentiation; no new tokens need to be introduced.
- The existing Console / drawer panel will be retained at the bottom; its exact height adjustment is delegated to the Developer Agent.
- The Timeline tab shows only completed runs (runs where the pipeline has reached a terminal state). What constitutes a "terminal state" is to be determined by the Developer Agent based on the available GitHub data.

---

## Open Questions

_All questions resolved before handoff. None remaining._
