# Spec: Pipeline Progress Timeline UI — Issue #177

**Issue:** #177
**Branch:** `177-pipeline-timeline-ui`
**Type:** feature
**Status:** draft

---

## Overview

When an end-to-end pipeline run spans multiple agents across hours or days,
developers and maintainers currently have no single view of what happened, in what
order, and who did it — they must scroll through dozens of GitHub Issue comments
manually. This spec defines a **Pipeline Timeline panel** in the dashboard browser
UI that surfaces a structured, filterable, auto-refreshing visual timeline of all
agent events for any GitHub Issue, reconstructed from the `apm-msg` blocks and
`agent-footprint` structured comments already written by agents.

---

## User Stories

### US-1: View the Event Timeline for an Issue

As a **developer or project maintainer**, I want to select any GitHub Issue number
in the dashboard and immediately see a vertical timeline of every agent event
associated with that issue, so that I understand the full history of the pipeline
run without manually reading raw comments.

**Acceptance Scenarios:**

- Given I enter issue number 42 in the timeline panel's search field and submit
  When the server fetches and parses the issue's comments
  Then a vertical timeline is displayed showing one row per agent event, ordered
  chronologically from oldest (top) to newest (bottom)
  And each row shows: the agent's emoji and name, the event type
  (start / complete / fail / approval-request), a human-readable timestamp,
  and a one-line summary

- Given issue 42 has no `apm-msg` or `agent-footprint` comments
  When the timeline is requested
  Then the panel shows an empty-state message: "No agent events found for #42"

- Given the GitHub API is unreachable (no `gh` CLI or no network)
  When the timeline is requested
  Then the panel shows a clear error message describing the failure (e.g. "Could
  not reach GitHub API — check that `gh` is authenticated") rather than an empty
  list

- Given issue number input is not a positive integer
  When the user attempts to load the timeline
  Then the form shows a validation error and does not submit a server request

### US-2: Expand a Timeline Row to See Full Comment Detail

As a **developer**, I want to click any event row in the timeline to see the full
text of the underlying GitHub comment, so that I can read the agent's reasoning or
output without leaving the dashboard.

**Acceptance Scenarios:**

- Given the timeline is displayed with multiple rows
  When I click a row
  Then it expands inline to show the full comment body (rendered as plain text
  or sanitised markdown)
  And a direct link to the comment on GitHub is provided

- Given an expanded row is clicked again
  When the click is processed
  Then the row collapses back to its single-line summary

### US-3: Auto-Refresh the Timeline

As a **developer** watching a live pipeline run, I want the timeline to refresh
automatically every 30 seconds, so that I see new agent events as they are posted
without having to manually reload.

**Acceptance Scenarios:**

- Given a timeline is loaded for an active issue
  When 30 seconds have elapsed since the last fetch
  Then the panel silently re-fetches the timeline and appends any new events at
  the bottom, without resetting the scroll position or collapsing expanded rows

- Given a new event has arrived during auto-refresh
  When the panel updates
  Then a subtle visual indicator (e.g. "1 new event") appears near the top of
  the timeline to draw attention

- Given the server cannot reach GitHub during an auto-refresh cycle
  When the refresh fails
  Then the existing timeline remains visible with a "Last updated X minutes ago"
  indicator and a non-blocking error toast; auto-refresh continues on the next
  scheduled cycle

### US-4: Filter the Timeline by Agent

As a **project maintainer** reviewing a multi-agent pipeline, I want to filter
the timeline to show only events from a specific agent (e.g. "Developer Agent"
only), so that I can focus on one agent's contribution without distraction.

**Acceptance Scenarios:**

- Given the timeline shows events from multiple agents
  When I select "Developer Agent" from the agent filter dropdown
  Then only rows where the agent name is "Developer Agent" remain visible
  And a row-count badge shows "Showing 3 of 11 events"

- Given a filter is active
  When I clear the filter
  Then all events are shown again

- Given I apply a filter while an auto-refresh cycle is running
  When the refresh completes
  Then the filter is preserved across the refresh

### US-5: See the Overall Pipeline Status

As a **developer**, I want a prominent status indicator at the top of the timeline
panel showing the current overall state of the pipeline (running, success, failed,
or awaiting-approval), so that I can assess the pipeline health at a glance.

**Acceptance Scenarios:**

- Given the most recent `apm-msg` event on the issue has `outcome: "running"`
  When the timeline is displayed
  Then the status indicator shows "Running" with a pulsing indicator

- Given the most recent terminal event has `outcome: "success"` or
  `outcome: "spec-ready"` (or similar completion outcome)
  When the timeline is displayed
  Then the status indicator shows "Success" in green

- Given any event has `outcome: "fail"` and no subsequent `outcome: "success"`
  When the timeline is displayed
  Then the status indicator shows "Failed" in red with the failing agent's name

- Given an `approval-request` event is present and no subsequent `approval-granted`
  event exists
  When the timeline is displayed
  Then the status indicator shows "Awaiting Approval" with an amber indicator

### US-6: Manually Refresh the Timeline

As a **developer**, I want a manual refresh button in the timeline panel so that
I can fetch the latest events immediately, without waiting for the 30-second
auto-refresh cycle.

**Acceptance Scenarios:**

- Given the timeline is loaded
  When I click the "Refresh" button
  Then the panel immediately re-fetches the timeline from the server
  And the "Last updated" timestamp resets to now

---

## Functional Requirements

- **FR-177-001**: The system MUST expose an endpoint that accepts a GitHub Issue
  number, fetches all comments on that issue via the `gh` CLI, and returns a
  structured list of parsed agent events. The endpoint MUST proxy all GitHub API
  calls server-side; the browser MUST NOT call GitHub directly.

- **FR-177-002**: The server MUST parse `apm-msg` fenced blocks from comment bodies
  using the existing `apm-msg-parser.js` logic. Each successfully parsed `apm-msg`
  block MUST be surfaced as a timeline event with fields: agent name, step, outcome,
  summary, timestamp (from the comment's `created_at`), and raw comment body.

- **FR-177-003**: The server MUST also parse `<!-- agent-footprint: ... -->` HTML
  comment markers from comment bodies. Each footprint found MUST be surfaced as a
  timeline event with: agent name, event type (start / complete / fail),
  timestamp, and summary. The footprint format is defined in the `agent-footprint`
  protocol (Issue #175).

- **FR-177-004**: Comments that contain neither an `apm-msg` block nor an
  `agent-footprint` marker MUST be silently excluded from the timeline (not
  surfaced as events). All excluded comments MUST still be counted in a
  "N comments processed, M events found" meta-field in the endpoint response.

- **FR-177-005**: The timeline endpoint response MUST include a derived overall
  pipeline status field with one of four values: `running`, `success`, `failed`,
  `awaiting-approval`. The status MUST be derived by scanning events in reverse
  chronological order using the precedence rules defined in the acceptance
  scenarios for US-5.

- **FR-177-006**: The dashboard UI MUST display a "Pipeline Timeline" panel
  containing: an issue-number input field, a submit button, the status indicator
  (FR-177-005), an agent filter dropdown, a manual refresh button, and the
  vertical event list.

- **FR-177-007**: Each timeline event row MUST display: agent emoji and name,
  event type label, human-readable relative timestamp (e.g. "3 hours ago"), and
  a one-line summary (truncated at 120 characters with ellipsis).

- **FR-177-008**: Clicking a timeline event row MUST toggle an expanded view that
  shows the full comment body (sanitised to prevent script injection) and a direct
  link to the comment on GitHub (`html_url` from the GitHub API response).

- **FR-177-009**: The panel MUST auto-refresh by re-fetching the timeline endpoint
  every 30 seconds while an issue number is loaded. The auto-refresh interval
  MUST be reset each time a manual refresh is triggered.

- **FR-177-010**: When new events arrive during auto-refresh, the panel MUST
  append them to the bottom of the event list without resetting scroll position or
  collapsing any expanded rows. A "N new event(s)" notification badge MUST appear.

- **FR-177-011**: The agent filter dropdown MUST be populated dynamically from the
  distinct set of agent names present in the currently loaded timeline. Selecting
  an agent name MUST hide all rows from other agents. Clearing the filter MUST
  restore all rows.

- **FR-177-012**: The overall pipeline status indicator MUST be displayed
  prominently above the event list. Its visual style MUST differ for each status:
  pulsing for `running`, green for `success`, red for `failed`, amber for
  `awaiting-approval`.

- **FR-177-013**: All issue-number inputs MUST be validated as positive integers
  on the client side before any server request is dispatched.

- **FR-177-014**: If the timeline endpoint returns an error (GitHub unreachable,
  `gh` unauthenticated, issue not found), the panel MUST display a human-readable
  error message. The error MUST NOT clear a previously loaded timeline (stale
  data is preferable to an empty panel).

- **FR-177-015**: The expanded comment body MUST be sanitised before rendering in
  the browser to prevent cross-site scripting (XSS). No raw HTML from the GitHub
  comment body may be injected directly into the DOM.

---

## Non-Functional Requirements

- **NFR-177-001**: The timeline endpoint MUST respond within 5 seconds for issues
  with up to 100 comments under normal network conditions.
- **NFR-177-002**: Auto-refresh MUST be paused (timer cleared) when the browser
  tab becomes hidden (Page Visibility API), and resumed when the tab becomes
  visible again, to avoid unnecessary GitHub API calls.
- **NFR-177-003**: The panel MUST handle up to 200 timeline events without
  degrading scroll performance (virtual scrolling or pagination may be used for
  lists exceeding 100 visible rows).
- **NFR-177-004**: The `gh` CLI calls on the server MUST NOT block the Node.js
  event loop; they MUST be executed asynchronously.

---

## Success Criteria

- [ ] A developer can enter any issue number and see a chronological timeline
  of all `apm-msg` and `agent-footprint` events within 5 seconds.
- [ ] The overall pipeline status indicator correctly reflects `running`,
  `success`, `failed`, and `awaiting-approval` states across at least 4 test
  issues with known comment histories.
- [ ] Clicking any row expands the full comment body with a working GitHub link.
- [ ] The agent filter correctly hides/shows rows when an agent is
  selected/cleared.
- [ ] Auto-refresh appends new events without resetting scroll or collapsing
  expanded rows, confirmed by a manual test with a live pipeline run.
- [ ] Expanded comment bodies containing `<script>` tags are rendered as plain
  text (XSS mitigation confirmed).
- [ ] Auto-refresh pauses when the browser tab is hidden and resumes when it
  returns to the foreground.
- [ ] Invalid issue number inputs (non-integer, empty, negative) are rejected
  client-side with a clear error, confirmed by attempting each invalid value.
- [ ] The panel shows a clear error (not an empty list) when `gh` is
  unauthenticated, confirmed by revoking `gh` auth and loading a timeline.

---

## Key Entities

- **TimelineEvent**: A single structured event derived from one GitHub comment.
  Attributes: event type (start / complete / fail / approval-request), agent name,
  agent emoji, timestamp, one-line summary, full comment body, GitHub comment URL,
  source (apm-msg | agent-footprint).

- **PipelineStatus**: The derived overall state of an issue's pipeline run. One of:
  `running`, `success`, `failed`, `awaiting-approval`. Derived from the ordered set
  of TimelineEvents.

- **AgentFootprint**: A structured marker embedded in a GitHub comment by an agent
  to record that it acted on the issue. Contains: agent name, event type, timestamp,
  and a brief summary. Format defined by the agent-footprint protocol (Issue #175).

- **TimelineQuery**: A user's request to view the timeline for a specific issue
  number, optionally filtered to a single agent name.

---

## Out of Scope

- **Creating, editing, or closing GitHub Issues or comments** — the timeline panel
  is read-only; no write operations to GitHub are performed from this feature.
- **PR timelines** — only Issue comment threads are in scope for v1; PR review
  comments and PR check runs are excluded.
- **Cross-issue timelines** — the panel shows events for a single issue number
  at a time; aggregated multi-issue views are out of scope.
- **Exporting timeline data** — CSV, JSON, or PDF export is not in scope.
- **Real-time push updates via WebSocket** — GitHub push delivery is not in scope;
  polling at 30-second intervals is the only update mechanism.
- **Parsing non-structured comments** — plain human-written comments that do not
  contain `apm-msg` or `agent-footprint` markers are excluded from the timeline.
- **Historical replay or step-through** — the timeline is a flat list, not an
  interactive replayer.

---

## Security and Privacy Considerations

**Read-only, constitution-compliant:** This feature is a read-only observability
surface consistent with Constitution Principle IX. No write operations to GitHub
or any external system are performed. No ADR is required.

**No PII:** GitHub Issue comments in this project contain code, agent summaries,
and structured data. No personally identifiable information is processed beyond
the GitHub username embedded in comment metadata (publicly visible on GitHub).
Standard open-source data classification applies.

**XSS prevention (OWASP A03):** GitHub comment bodies are fetched server-side and
returned as plain text. The browser UI MUST sanitise all comment content before
inserting it into the DOM (FR-177-015). No raw HTML from the GitHub API may be
injected directly.

**`gh` authentication scope:** The `gh` CLI call to fetch issue comments requires
only `repo:read` (public) or `issues: read` scope. No elevated permissions are
needed. The server MUST NOT expose the `gh` auth token to the browser.

**Injection prevention (OWASP A03):** The issue number accepted by the timeline
endpoint MUST be validated as a positive integer before being interpolated into
any `gh api` command string.

---

## Assumptions

- `gh` CLI is installed and authenticated on the machine running the dashboard
  server (already required by existing pipeline and agent workflows).
- `apm-msg-parser.js` remains the canonical parser for `apm-msg` blocks; the
  timeline endpoint will import or re-use its parsing logic without duplication.
- The `agent-footprint` comment format is stable as defined by Issue #175
  (spec.md); if the format changes, FR-177-003 must be updated accordingly.
- GitHub Issue comments are fetched in pages of up to 100 per API call; the
  server MUST paginate until all comments are retrieved.
- The dashboard server is Node.js ≥ 18, consistent with existing requirements.
- The dashboard UI is a single-page app served by the same backend; no separate
  build step is required for this feature.
- The 30-second auto-refresh interval is a fixed default; making it user-configurable is out of scope for v1.

---

## Open Questions

> Target: zero unresolved questions before handoff to Developer Agent.

1. **[NEEDS CLARIFICATION] `agent-footprint` format** — The footprint format is
   defined in Issue #175 / spec `specs/175-comprehensive-agents-review/spec.md`
   but the implementation of footprint writing by agents may not yet be complete.
   Should FR-177-003 be gated on Issue #175 being fully implemented, or should
   the timeline parser be written defensively to handle missing/malformed
   footprints and surface only `apm-msg` events in v1? *Recommended: defensive
   parsing; footprints are optional enrichment.*

2. **[NEEDS CLARIFICATION] Sanitisation library** — FR-177-015 requires XSS
   sanitisation of comment bodies. The constitution's simplicity principle
   (Principle VII) prefers no new dependencies; plain-text rendering (stripping
   all HTML tags) may be sufficient. Should the UI render comment bodies as plain
   text only (no markdown), or is lightweight markdown rendering (e.g. via a
   small trusted library) acceptable? *Impact: dependency ADR may be needed if a
   markdown library is chosen.*

3. **[NEEDS CLARIFICATION] Pagination handling** — Issues with very active
   pipelines may have more than 100 comments. Should the server always paginate
   through all pages (potentially slow), or cap at a configurable maximum (e.g.
   200 comments) with a UI indicator that older events are truncated? *Recommended:
   cap at 200 with a "showing last 200 comments" notice.*

4. **[NEEDS CLARIFICATION] `apm-msg` version compatibility** — The
   `apm-msg-parser.js` validates against `schemas/apm-msg.schema.json`. Version 2
   of the schema is current. Comments written by older agents may use version 1.
   Should the timeline parser accept both schema versions (silently downgrading
   v1 to best-effort), or reject v1 comments and surface them as
   "unrecognised format" events?
