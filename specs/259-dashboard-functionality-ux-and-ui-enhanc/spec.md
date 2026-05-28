# Spec: Dashboard Navigation Rework — Pipelines as Root View — Issue #259

## Overview

The QuorumKit dashboard is the primary observability surface for agent activity,
pipeline runs, and the work board. This revision establishes **Pipelines as the
root view** of the dashboard, reflecting that pipeline execution is the central
workflow in QuorumKit. The **Timeline** becomes a sub-view within each pipeline,
showing what agents have already executed and directly informing next-agent
suggestions. The **Agent widgets** are preserved in a dedicated "Agents" view for
ad-hoc invocations. All changes remain within the read-only observability contract
(constitution §IX).

---

## User Stories

### US-1: Pipelines as the root view

As a developer using the QuorumKit dashboard,  
I want pipelines to be the first thing I see when the dashboard loads,  
so that I immediately understand the current state of work without having to navigate away from the default screen.

**Acceptance Scenarios:**

- **Given** the dashboard is loaded **When** the page renders **Then** the Pipelines view is displayed by default, showing the active pipeline (if any) and a list of recent pipeline runs.
- **Given** the dashboard is on the Pipelines view and there is an active pipeline **When** the view renders **Then** the active pipeline's status and agent sequence are clearly visible.
- **Given** the dashboard is on the Pipelines view and there is no active pipeline **When** the view renders **Then** a clear empty state guides the user toward recent runs.
- **Given** the user is on any other view **When** they navigate to Pipelines **Then** it is reachable via a primary navigation element (tab, sidebar item, or equivalent).

---

### US-2: Timeline as a pipeline sub-view

As a developer reviewing a pipeline run,  
I want to see a timeline of every agent execution within the selected pipeline,  
so that I understand what has already been done and can make informed decisions about what comes next.

**Acceptance Scenarios:**

- **Given** a pipeline is selected in the Pipelines view **When** the pipeline detail opens **Then** a Timeline sub-view shows each agent that has run, in chronological order, with its outcome (`completed` / `failed` / `skipped`).
- **Given** the Timeline sub-view is open **When** I view an agent entry **Then** I can see the agent name, its SDLC role, the time it ran, and its final status.
- **Given** the Timeline sub-view is open and the pipeline is still in progress **When** the view renders **Then** completed agents appear in the timeline and the in-progress agent is visually indicated (e.g. animated badge).
- **Given** the timeline data is present **When** next-agent suggestions are computed **Then** agents already completed in this pipeline are excluded from or deprioritised in the suggestion list.

---

### US-3: Context-aware next-agent suggestions (timeline-informed)

As a developer composing the next step in a pipeline,  
I want the next-agent suggestions to be informed by both the issue context and the pipeline's execution timeline,  
so that suggestions reflect what has already been done and do not repeat completed stages.

**Acceptance Scenarios:**

- **Given** a pipeline is selected and its timeline shows completed agents **When** next-agent suggestions are displayed **Then** at least three suggestions are shown, deprioritising agents already completed in this timeline.
- **Given** no agents have run yet in the selected pipeline **When** suggestions are displayed **Then** the full SDLC-ordered list is shown as a starting point, filtered by the issue context where available.
- **Given** a suggestion is selected **When** the user interacts with it **Then** the agent's detail panel opens with the issue context pre-populated; no automatic invocation occurs.
- **Given** no issue context is set **When** suggestions are displayed **Then** a guidance prompt asks the user to set an issue number, and a default SDLC-ordered fallback list is shown.
- **Given** suggestions are rendered **When** the user reviews them **Then** no write action of any kind is triggered or possible from the suggestion UI (constitution §IX).

---

### US-4: Agents view for ad-hoc invocations

As a developer who wants to invoke a specific agent outside of a pipeline,  
I want a dedicated "Agents" view that shows all agent widgets in SDLC order,  
so that I can quickly find and open any agent for a one-off task without creating a formal pipeline.

**Acceptance Scenarios:**

- **Given** the user navigates to the Agents view **When** it renders **Then** agent cards are displayed in the canonical SDLC order: Triage, BA/Product, Architect, Developer, QA/Test, Reviewer, Security, DevOps, Docs, Release — with additional agents appended after.
- **Given** the Agents view is active **When** a search/filter is applied **Then** the filtered results preserve the relative SDLC order.
- **Given** the Agents view is active and a pipeline run exists **When** the view renders **Then** each agent card displays a status badge (`idle` | `queued` | `running` | `completed` | `failed`) reflecting its state in the active pipeline.
- **Given** the `running` status badge is displayed **When** the user views it **Then** an animated visual indicator (pulse, spinner, or glow) distinguishes it from static badges.
- **Given** the `failed` status badge is displayed **When** the user views it **Then** the badge uses the red/error colour token, distinct from all other badge colours.
- **Given** no active pipeline exists **When** the Agents view renders **Then** all agent cards default to the `idle` badge with no animation.
- **Given** a new agent is added to the system **When** it has no explicit SDLC position defined **Then** it is appended at the end of the ordered list rather than inserted at an arbitrary position.

---

## Functional Requirements

- **FR-001**: The Pipelines view **must** be the default view shown on dashboard load.
- **FR-002**: The Pipelines view **must** display the active pipeline (if any), its current status, and a list of recent pipeline runs.
- **FR-003**: Each pipeline **must** have a detail view accessible from the pipeline list. The pipeline detail **must** include a Timeline sub-view.
- **FR-004**: The Timeline sub-view **must** list every agent execution in the selected pipeline run in chronological order, showing agent name, SDLC role, run time, and final status.
- **FR-005**: Next-agent suggestions **must** be computed from both the issue context (if set) and the pipeline timeline (agents already executed). Agents already completed in the timeline **must** be excluded or visually deprioritised in the suggestion list.
- **FR-006**: The suggestion list **must** display a minimum of three entries. Each entry **must** include: agent name, SDLC role label, and a human-readable reason for the suggestion.
- **FR-007**: Selecting a suggestion **must** open the agent detail panel with the current issue context pre-populated. No agent invocation, API call, or GitHub write action may be triggered as a result of this interaction.
- **FR-008**: When no issue context is active, the suggestion list **must** show a guidance prompt and fall back to the full SDLC-ordered agent list.
- **FR-009**: The dashboard **must** include a dedicated "Agents" view accessible from primary navigation, showing all agent widgets in SDLC order: Triage (1), BA/Product (2), Architect (3), Developer (4), QA/Test (5), Reviewer (6), Security (7), DevOps (8), Docs (9), Release (10). Agents without an assigned position are appended after position 10 in alphabetical order.
- **FR-010**: When a filter or search is active in the Agents view, the filtered result set **must** preserve the relative SDLC order.
- **FR-011**: Each agent card in the Agents view **must** display exactly one status badge from the set: `idle`, `queued`, `running`, `completed`, `failed`.
- **FR-012**: The `running` badge **must** include an animated visual indicator (pulsing dot or spinner).
- **FR-013**: The `failed` badge **must** use the existing `--red` / error colour token, distinct from all other badge colours.
- **FR-014**: Status badges **must** update on each data-refresh cycle without a full page reload.
- **FR-015**: The layout change **must not** require a mandatory backend; the dashboard **must** remain functional as a standalone static app.
- **FR-016**: No new UI element introduced by this feature **must** trigger a write action to GitHub or any external system (constitution §IX).

---

## Success Criteria

- [ ] Dashboard loads with the Pipelines view as the default screen.
- [ ] Pipelines view shows active pipeline status and a list of recent runs.
- [ ] Pipeline detail view includes a Timeline sub-view listing agent executions in order with name, role, time, and status.
- [ ] Next-agent suggestions account for timeline history — completed agents are excluded or deprioritised.
- [ ] Suggestion list shows ≥ 3 entries with name, role, and reason when issue context is set.
- [ ] Selecting a suggestion opens the agent detail panel with issue context pre-populated; no write action fires.
- [ ] A dedicated "Agents" view is accessible from primary navigation.
- [ ] Agent cards in the Agents view render in canonical SDLC order on first load and after filter/search.
- [ ] Every agent card displays one of five status badges with correct colour differentiation.
- [ ] `running` badge animates; `failed` badge uses the red/error token.
- [ ] Badges update on data refresh without full page reload.
- [ ] Dashboard loads and functions without any backend process (static-file mode).
- [ ] No new write path to GitHub or any external system is introduced (verified by Security Agent review).

---

## Key Entities

- **Pipelines View**: The root/default view of the dashboard. Displays the active pipeline and a list of recent pipeline runs.
- **Pipeline Detail**: A detailed view of a single pipeline run, accessible from the Pipelines view. Contains the Timeline sub-view and next-agent suggestions.
- **Timeline Sub-View**: A chronological log of every agent execution within a selected pipeline run, showing agent name, SDLC role, run time, and final status. Feeds data to the next-agent suggestion engine.
- **Next-Agent Suggestions**: A ranked list of recommended agents for the next step in a pipeline, derived from both the issue context and the pipeline timeline (what has already executed).
- **Agents View**: A secondary, dedicated view showing all agent widgets in SDLC order. Used for ad-hoc agent invocations outside a formal pipeline.
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
- Agent suggestion logic in the pipeline panel is client-side only, derived from the issue number and statically-defined heuristics (e.g. if the last completed agent was Triage, suggest BA next). No ML or external inference service is required.
- "Current issue context" is set by the user typing an issue number into an existing or new input field in the pipeline panel — it is not automatically inferred from the git branch.
- The minimum viewport for which layout guarantees apply is 1 280 px wide; narrower viewports are out of scope for this issue.
- Existing design tokens (`--red`, `--green`, `--amber`, `--cyan`, etc.) are sufficient for status badge colour differentiation; no new tokens need to be introduced.
- The existing drawer (`#drawer`) height variable (`--drawer-h: 280px`) will be increased or the drawer relocated; the exact implementation approach is delegated to the Developer Agent.

---

## Open Questions

_All questions resolved before handoff. None remaining._
