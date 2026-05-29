# Spec: Agents Must Post Agent-Footprint Comments — Issue #268

## Overview

Agent definitions already contain `agent-footprint` comment templates in their "Agent Footprint" section, and the dashboard parser already handles those formats correctly. However, when agents run as local Copilot Chat sessions they post plain-text prose instead of structured footprint comments, leaving the Agent Execution Timeline empty. This spec mandates that every affected agent definition prominently and imperatively instructs the agent to post structured `agent-start`, `agent-complete`, and `agent-fail` comments via `gh issue comment` at the precise moments required.

## User Stories

### US-1: Agent posts a structured start comment before beginning work

As a project maintainer watching the Agent Execution Timeline,
I want to see a structured `agent-start` event appear as soon as an agent begins work on an issue,
so that I have real-time visibility into which agent is active and when it started.

Acceptance Scenarios:
- Given any of the affected agents is invoked on a GitHub issue, When the agent begins its session, Then it posts an `<!-- agent-footprint: start -->` comment on the issue containing agent-id, event type, issue number, branch, and timestamp before performing any other work.
- Given an agent has posted the start comment, When the Agent Execution Timeline is loaded for that issue, Then at least one structured event is visible in the timeline (no empty state).

### US-2: Agent posts a structured complete comment after finishing work

As a project maintainer auditing completed work,
I want to see a structured `agent-complete` event (including the `apm-msg` JSON block) as the final action of each agent session,
so that I can confirm work was completed, read a one-line summary, and know what the next recommended action is.

Acceptance Scenarios:
- Given an agent has successfully completed its assigned task on an issue, When the agent finishes its session, Then it posts an `<!-- agent-footprint: complete -->` comment with a filled `apm-msg` JSON block and a "Next recommended action" field.
- Given the `apm-msg` block is present, When the dashboard parser processes the comment, Then the event appears as a `complete` entry on the Agent Execution Timeline.

### US-3: Agent posts a structured fail comment on error

As a project maintainer investigating a failed agent run,
I want to see a structured `agent-fail` event (including the `apm-msg` JSON block) whenever an agent session ends in error,
so that I can read the error summary and follow the recommended recovery steps without inspecting the raw Copilot Chat transcript.

Acceptance Scenarios:
- Given an agent encounters an unrecoverable error during its session, When the agent's session ends, Then it posts an `<!-- agent-footprint: fail -->` comment with the error message and a `apm-msg` JSON block with `"outcome": "fail"` — and does NOT post a plain-text prose summary instead.
- Given an agent cannot post the fail comment (e.g. no network access), Then the error is logged to the session output and the plain-text transcript must note the failure to post.

### US-4: Dashboard shows non-empty timeline after any affected-agent run

As a project maintainer using the dashboard,
I want every issue where an affected agent ran to show at least one structured event in the Agent Execution Timeline,
so that the "0 structured events" empty state observed on issue #259 is eliminated for all future agent runs.

Acceptance Scenarios:
- Given issue #259 (or any issue) has had an affected agent run after this change is deployed, When the timeline is viewed, Then at least one structured event entry is visible.
- Given an issue has 5 plain-text prose comments and 0 footprint comments (the pre-fix state), Then the timeline correctly shows an empty state (the parser is not changed; only the agent instructions are changed).

## Functional Requirements

- FR-001: `src/agents/ba-product-agent.md` MUST include an explicit, imperative "Before You Start" checklist step that instructs the agent to run `gh issue comment` with the `agent-start` template from its "Agent Footprint" section immediately before beginning any work.
- FR-002: `src/agents/ba-product-agent.md` MUST include an explicit, imperative "Before You Finish" checklist step that instructs the agent to run `gh issue comment` with the `agent-complete` template (including a filled `apm-msg` block) as the final action of every successful session.
- FR-003: `src/agents/ba-product-agent.md` MUST include an explicit, imperative instruction that if any unrecoverable error occurs, the agent MUST post the `agent-fail` template (with `apm-msg`) instead of a prose summary.
- FR-004: FR-001 through FR-003 apply identically to `src/agents/developer-agent.md`.
- FR-005: FR-001 through FR-003 apply identically to `src/agents/qa-test-agent.md`.
- FR-006: FR-001 through FR-003 apply identically to `src/agents/reviewer-agent.md`.
- FR-007: FR-001 through FR-003 apply identically to `src/agents/security-agent.md`.
- FR-008: The imperative posting instructions must appear in a prominent, consistently named section in each agent definition — either as a "Mandatory First Step" / "Mandatory Last Step" block, or as numbered steps at the top of the existing workflow section — so that the instruction is impossible to miss regardless of how much of the file the agent reads before acting.
- FR-009: The existing "Agent Footprint" section and comment templates in each agent definition MUST NOT be altered; only imperative invocation instructions are added.
- FR-010: Both the `src/agents/` copy and the corresponding `.github/agents/` copy of each affected agent definition MUST be updated identically, keeping the two copies in sync.
- FR-011: No change to the dashboard parser, orchestrator, or any other file outside `src/agents/` and `.github/agents/` is permitted — this is an agent-instruction enforcement gap, not a parser bug.
- FR-012: The `apm-msg` JSON block in `agent-complete` and `agent-fail` comments MUST use the existing schema (`version: "2"`, with `runId`, `step`, `agent`, `iteration`, `outcome`, `summary`, `event_type`, `pipeline_id`, `issue`, `pr`, `branch`, `timestamp` fields) without modification.
- FR-013: Silent termination (session ends without any footprint comment posted) is prohibited under any code path. If the agent cannot post a footprint comment, it must log the failure explicitly.

## Success Criteria

- [ ] Each of the 5 affected agent definition files (`ba-product-agent.md`, `developer-agent.md`, `qa-test-agent.md`, `reviewer-agent.md`, `security-agent.md`) in `src/agents/` contains explicit imperative instructions to post `agent-start` before work begins.
- [ ] Each of the 5 affected agent definition files in `src/agents/` contains explicit imperative instructions to post `agent-complete` (with `apm-msg`) after successful completion.
- [ ] Each of the 5 affected agent definition files in `src/agents/` contains explicit imperative instructions to post `agent-fail` (with `apm-msg`) on error instead of prose.
- [ ] All 5 corresponding `.github/agents/` copies are updated identically.
- [ ] After this change is deployed, the Agent Execution Timeline for an issue where any affected agent ran shows at least one structured event (no empty state).
- [ ] No changes to the dashboard parser, orchestrator, or files outside the 10 affected agent definition files.

## Key Entities

- **Agent Footprint Comment**: A structured GitHub Issue comment containing an HTML comment marker (`<!-- agent-footprint: start|complete|fail -->`) and, for complete/fail variants, an `apm-msg` JSON fenced code block. Parsed by the dashboard to produce Agent Execution Timeline events.
- **apm-msg block**: A fenced code block with language tag `apm-msg` containing a JSON object conforming to the existing schema (version 2). Required in `agent-complete` and `agent-fail` comments only.
- **Affected Agent**: One of `ba-product-agent`, `developer-agent`, `qa-test-agent`, `reviewer-agent`, `security-agent` — agents that run as local Copilot Chat sessions and were observed not to post footprint comments.
- **Agent Execution Timeline**: The dashboard view (feature #259) that parses issue comments for `agent-footprint` markers and `apm-msg` blocks to display a chronological list of agent activity.

## Out of Scope

- Changes to the dashboard parser or Agent Execution Timeline rendering logic (FR-011).
- Changes to agents not in the affected list (`architect-agent`, `compliance-agent`, `devops-agent`, `digital-twin-agent`, `docs-agent`, `incident-agent`, `ot-integration-agent`, `release-agent`, `tech-debt-agent`, `triage-agent`).
- Retroactively patching past plain-text comments on closed issues.
- Adding new fields to the `apm-msg` schema.
- Changes to GitHub Actions workflows (the posting is done by the agent via `gh` CLI, not a separate workflow step).
- Testing the fix against the historical issue #259 comments (pre-fix comments will not be re-parsed).

## Security and Privacy Considerations

N/A — this change is confined to agent definition documentation files. The `gh issue comment` command uses the existing `GITHUB_TOKEN` with `issues:write` scope already required by all affected agents. No new permissions, no PII, no secrets.

## Assumptions

- The `gh` CLI is available in the Copilot Chat agent execution environment (already verified by existing BA agent `gh issue edit` usage).
- The existing "Agent Footprint" comment templates in each agent definition are correct and do not need modification.
- The dashboard parser already handles `<!-- agent-footprint: start|complete|fail -->` and `` ```apm-msg `` blocks correctly (confirmed: feature #177 / #259).
- The `status:confirmed` label and other labels used in the issue are already present in the repository label set.
- Both `src/agents/` and `.github/agents/` must be kept in sync; updating only one copy is not acceptable.

## Open Questions

_None — the problem, root cause, expected behavior, affected files, and acceptance criteria are all fully specified. Ready for handoff to Developer Agent._
