# Spec: Autonomous Agent Orchestration System — Issue #2

## Overview

The APM stack currently provides 15 AI agents invocable only via manual slash-commands
or individually-triggered GitHub Actions workflows. This feature introduces an
**Orchestrator** that automatically sequences and coordinates those agents in response
to repository events — without human intervention for routine work — while preserving
full observability and optional human-approval gates for critical decisions.

The Orchestrator is the single control plane that routes events to agents, enforces
pipeline rules, records every action, and surfaces real-time status through the
existing dashboard.

---

## User Stories

### US-1: Event-Driven Pipeline Trigger

As a **developer**, I want an incoming GitHub event (issue opened, PR raised, label
applied, workflow completed) to automatically invoke the correct agent pipeline,
so that routine SDLC work starts without me typing a slash-command.

Acceptance Scenarios:
- Given a new GitHub Issue is opened with label `type:feature`  
  When the Orchestrator receives the event  
  Then the `triage-agent` is invoked automatically, and a pipeline run record is created
- Given the `triage-agent` completes and adds label `agent:ba`  
  When the Orchestrator receives the label-added event  
  Then the `ba-agent` is invoked automatically in the same pipeline run
- Given an event arrives but no pipeline rule matches  
  When the Orchestrator evaluates the rules  
  Then no agent is invoked and the unmatched event is logged with reason `no-rule-match`
- Given a GitHub API call inside the Orchestrator fails with a 5xx error  
  When the retry limit (3 attempts, exponential back-off) is exhausted  
  Then the pipeline run is marked `failed`, a GitHub Issue comment is posted with the error, and no further agents are invoked

### US-2: Declarative Pipeline Configuration

As a **project maintainer**, I want to define agent pipelines in YAML files committed
to the repository, so that pipeline behaviour is version-controlled, reviewable in PRs,
and portable across projects.

Acceptance Scenarios:
- Given a valid pipeline YAML file exists at `.apm/pipelines/<name>.yml`  
  When the Orchestrator starts  
  Then it loads all pipeline files from that directory and activates their rules
- Given a pipeline YAML file contains a syntax error or fails schema validation  
  When the Orchestrator loads the file  
  Then it rejects that file with a clear validation error message, leaves other pipelines active, and logs the error
- Given a pipeline file is added, modified, or removed in a merged PR  
  When the Orchestrator next starts (or hot-reloads, if supported)  
  Then only the updated pipeline rules are affected; all other running pipelines continue uninterrupted

### US-3: Human-in-the-Loop Approval Gate

As a **team lead**, I want to insert an approval gate before certain agent actions
(e.g. before the `release-agent` publishes a release), so that critical decisions
require explicit human sign-off rather than proceeding automatically.

Acceptance Scenarios:
- Given a pipeline step is configured with `approval: required`  
  When the Orchestrator reaches that step  
  Then it pauses the pipeline, posts a GitHub Issue/PR comment requesting approval, and waits
- Given an authorised approver posts a comment containing `/approve`  
  When the Orchestrator detects the comment  
  Then it resumes the pipeline from the paused step
- Given no approval is received within the configured timeout (default: 72 hours)  
  When the timeout expires  
  Then the pipeline run is marked `timed-out`, a comment is posted explaining the expiry, and no further agents are invoked
- Given an unauthorised user posts `/approve`  
  When the Orchestrator checks the approver's permission level  
  Then the approval is rejected, a comment explains the rejection, and the gate remains open

### US-4: Observability and Audit Trail

As a **developer or team lead**, I want every Orchestrator action to be recorded in a
human-readable audit trail, so that I can understand what ran, when, why, and what the
outcome was — without inspecting raw logs.

Acceptance Scenarios:
- Given any pipeline run starts, progresses, or ends  
  When the Orchestrator transitions state  
  Then a structured event is posted as a GitHub Issue comment on the triggering issue/PR
- Given the dashboard is open  
  When any pipeline run transitions state  
  Then the dashboard reflects the updated status within 5 seconds (via existing WebSocket broadcast)
- Given a pipeline run has completed (success or failure)  
  When a developer inspects the triggering GitHub Issue  
  Then they can see a full timeline: trigger event → each agent invoked → outcome → any approval gates → final status
- Given the Orchestrator itself crashes or is restarted  
  When it restarts  
  Then it reconstructs in-progress pipeline run state from GitHub Issue/PR state (not from local memory)

### US-5: Out-of-the-Box Pipeline Templates

As a **new project adopter**, I want a set of ready-made pipeline templates for common
SDLC scenarios installed by `init.sh`, so that I get useful automation immediately
without writing pipeline YAML from scratch.

Acceptance Scenarios:
- Given `init.sh` has been run on a project  
  When the developer lists `.apm/pipelines/`  
  Then at least three template pipelines exist: `feature-pipeline.yml`, `bug-fix-pipeline.yml`, and `release-pipeline.yml`
- Given the `feature-pipeline.yml` template is active  
  When a new feature-type Issue is opened  
  Then triage → ba → architect (if ADR needed) → dev → qa → reviewer → release is the default chain
- Given a template pipeline is present  
  When a developer edits it and commits the change  
  Then the customised version takes effect without requiring any changes outside `.apm/pipelines/`

### US-6: Dual-AI Runtime Compatibility

As a **developer using either Claude Code or GitHub Copilot**, I want the Orchestrator
to invoke agents correctly regardless of which AI runtime is active, so that pipeline
behaviour is consistent across both runtimes as required by the Constitution.

Acceptance Scenarios:
- Given the project is configured with `aiTool: claude`  
  When the Orchestrator invokes an agent  
  Then it uses the Claude Code invocation command from `.apm/agents/`
- Given the project is configured with `aiTool: copilot`  
  When the Orchestrator invokes an agent  
  Then it triggers the corresponding `copilot-agent-*.yml` GitHub Actions workflow
- Given the AI tool configuration is changed in `.apm-project.json`  
  When the Orchestrator next invokes an agent  
  Then it uses the updated runtime without requiring a restart

---

## Functional Requirements

- **FR-001**: The Orchestrator MUST be the sole component permitted to sequence, trigger, and coordinate agents — no agent may directly invoke another agent.
- **FR-002**: The Orchestrator MUST be stateless between runs; all persistent state MUST reside in GitHub Issues, PRs, and spec files — not in local memory or local files.
- **FR-003**: Pipeline rules MUST be expressed as declarative YAML files (not imperative scripts) located at `.apm/pipelines/*.yml`.
- **FR-004**: The Orchestrator MUST validate all pipeline YAML files against a published schema on load and reject malformed files with actionable error messages.
- **FR-005**: The Orchestrator MUST retry failed GitHub API calls up to 3 times with exponential back-off before marking a pipeline run as failed.
- **FR-006**: Every pipeline state transition MUST produce a human-readable audit entry posted as a GitHub Issue or PR comment on the triggering entity.
- **FR-007**: Pipeline run status MUST be broadcast to the dashboard via the existing WebSocket mechanism within 5 seconds of any state change.
- **FR-008**: The Orchestrator MUST support an `approval: required` gate on any pipeline step; the gate MUST pause execution and resume only on an authorised `/approve` comment.
- **FR-009**: Approval gates MUST enforce a configurable timeout (default: 72 hours); on expiry the run MUST be marked `timed-out` with a posted explanation.
- **FR-010**: Approval gate `/approve` commands MUST be accepted only from users with at least `write` permission on the repository.
- **FR-011**: The Orchestrator MUST support both Claude Code and GitHub Copilot agent invocation paths, controlled by the `aiTool` setting in `.apm-project.json`.
- **FR-012**: `init.sh` MUST install exactly three default pipeline templates: `feature-pipeline.yml`, `bug-fix-pipeline.yml`, and `release-pipeline.yml`. `release-pipeline.yml` MUST include an `approval: required` gate before the release step by default.
- **FR-013**: Pipeline templates MUST be overridable by editing the installed `.apm/pipelines/*.yml` files with no changes required outside that directory.
- **FR-014**: The Orchestrator MUST log every unmatched event with reason `no-rule-match` and take no further action on that event.
- **FR-015**: On restart, the Orchestrator MUST reconstruct in-progress pipeline state from GitHub Issue/PR state without relying on local memory.
- **FR-016**: The Orchestrator routing logic MUST be covered by automated tests that validate each routing rule without requiring live GitHub API calls (test doubles permitted).

---

## Success Criteria

- [ ] A new GitHub Issue with label `type:feature` automatically triggers triage → ba pipeline chain end-to-end with no manual slash-command
- [ ] A malformed `.apm/pipelines/*.yml` file causes a validation error at load time; other pipelines continue operating
- [ ] An `approval: required` gate pauses a pipeline run; `/approve` from an authorised user resumes it; timeout marks it `timed-out`
- [ ] Every pipeline state transition produces a GitHub Issue comment visible to a non-technical stakeholder
- [ ] The dashboard reflects pipeline run status changes within 5 seconds
- [ ] All three default pipeline templates are present after a fresh `init.sh` run
- [ ] The Orchestrator invokes agents correctly for both `aiTool: claude` and `aiTool: copilot` configurations
- [ ] Orchestrator routing rules are covered by automated tests executable without a live GitHub connection
- [ ] After an Orchestrator restart, in-progress pipelines resume from their last recorded state

---

## Key Entities

- **Pipeline**: A named, versioned YAML definition describing the sequence of agents to invoke and the conditions that trigger each step. Identified by its filename under `.apm/pipelines/`.
- **Pipeline Run**: A single execution instance of a Pipeline, tied to a triggering GitHub Issue or PR. Has a unique run ID, a current status (`pending`, `running`, `awaiting-approval`, `timed-out`, `failed`, `completed`), and a sequential list of step results.
- **Pipeline Step**: One agent invocation within a Pipeline Run. Records the agent name, start time, end time, outcome, and any output summary.
- **Pipeline Rule**: A conditional expression within a Pipeline definition that maps a trigger event (type + label/state predicates) to the first step of a Pipeline.
- **Approval Gate**: A Pipeline Step configuration that halts execution and waits for an authorised human comment before proceeding.
- **Trigger Event**: A GitHub webhook payload (issue opened, label applied, PR opened, workflow completed, etc.) that the Orchestrator evaluates against all loaded Pipeline Rules.
- **Audit Entry**: A human-readable GitHub Issue or PR comment posted by the Orchestrator recording a state transition, including timestamp, agent name, step outcome, and next action.

---

## Out of Scope

- Building a new UI for pipeline definition — pipelines are YAML files edited in a code editor; the dashboard remains read-only (Constitution §IX)
- Direct agent-to-agent invocation bypassing the Orchestrator (Constitution §VIII prohibits this)
- Support for non-GitHub SCM providers (GitLab, Bitbucket, Azure DevOps) — GitHub only for this issue
- Real-time streaming of agent output within the GitHub Issue comment thread — output is summarised post-completion
- Multi-repository or cross-repo pipeline coordination
- Paid/licensed approval workflow tooling — GitHub native primitives only (comments + permission checks)
- Persistent Orchestrator backend service — execution is stateless, driven by GitHub Actions webhooks
- Machine learning-based auto-routing or dynamic pipeline generation

---

## Security and Privacy Considerations

- The Orchestrator MUST use least-privilege GitHub token scopes: `issues:write`, `pull-requests:write`, `contents:read`, `actions:write` — no broader scopes.
- Approval gate authorisation MUST use GitHub repository permission levels (`write` or above) — no custom role system.
- No secrets, tokens, or credentials may be written to pipeline YAML files or any committed file (Constitution Security §1).
- Pipeline YAML files are committed code and subject to standard PR review — any change to pipeline routing is auditable via git history.
- The Security Agent (`/security-agent`) MUST review any PR that modifies Orchestrator routing rules or GitHub Actions workflow permissions (Constitution Security §4).
- This feature handles no PII — standard open-source data classification applies.
- Agent invocation commands MUST NOT pass user-controlled input directly to shell commands without sanitisation.

---

## Assumptions

- **A1**: Pipelines are defined in YAML files in `.apm/pipelines/` (not via a UI) — consistent with Constitution §VII (simplicity, existing GitHub primitives) and the triage recommendation. *Reporter confirmation not required.*
- **A2**: Human-in-the-loop approval uses GitHub Issue/PR comments (`/approve`) checked against repository write permission — GitHub Environment approvals are not used, as they require GitHub Actions execution context and add external dependency. *Reporter confirmation not required.*
- **A3**: The Orchestrator works with **both** Claude Code and GitHub Copilot simultaneously, controlled by per-project `aiTool` config — Constitution §IV (Dual-AI Compatibility) requires this. *Reporter confirmation not required.*
- **A4**: Three out-of-the-box pipeline templates are provided: `feature-pipeline.yml`, `bug-fix-pipeline.yml`, `release-pipeline.yml`. No additional templates are required for initial release; further templates are a future enhancement. `release-pipeline.yml` includes an `approval: required` gate before the release step by default — confirmed by reporter.
- **A5**: The Orchestrator is implemented as a stateless GitHub Actions workflow (not a long-running server process) — consistent with Constitution §VIII (stateless between runs) and the existing `agent-*.yml` / `copilot-agent-*.yml` pattern.
- **A6**: The existing `dashboard/server.js` WebSocket broadcast mechanism is reused for real-time status updates — no new observability infrastructure is required.

---

## Open Questions

> All open questions resolved. Spec is ready for handoff to the Developer Agent.

| # | Question | Owner | Status |
|---|----------|-------|--------|
| OQ-1 | Should `release-pipeline.yml` include the approval gate by default, or should gates be opt-in only? | Reporter (@dmitry-nalivaika) | ✅ RESOLVED — approval gate is **on by default** in `release-pipeline.yml` |
| OQ-2 | Are there additional out-of-the-box pipeline templates beyond the three defaults required for initial release? | Reporter (@dmitry-nalivaika) | ✅ RESOLVED — **no** additional templates; three defaults only |
