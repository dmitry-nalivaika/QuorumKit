# Spec: Orchestrator v2 — Pluggable Runtimes, SDLC Loops & Agent Message Protocol — Issue #44

## Overview

Replace the current single-pass orchestrator (issue #2) with a v2 design that
models the SDLC as a **state machine with backward edges**, exposes a **pluggable
agent runtime registry** (bring your own model deployment), enforces a **strict
inter-agent message protocol** carried in fenced comment blocks, and consolidates
all label / comment / transition rules into one canonical, lintable contract
("regulamin"). The goal is a best-in-class agentic SDLC engine that remains
GitHub-native, stateless between runs, fully audited via comments, and compatible
with constitution §VIII (orchestrator as sole control plane), §IV (multi-runtime),
and §IX (dashboard read-only).

## User Stories

### US-1: Author a pipeline with backward loops
As a **project maintainer**, I want to declare backward transitions in a pipeline
(e.g. `qa.fail → dev`, `reviewer.blocker → dev`, `dev.spec_gap → ba`), so that the
orchestrator automatically loops through agents the way a real SDLC does, without
me re-labelling the issue every time.

Acceptance Scenarios:
- Given a pipeline declares `dev → qa` with transitions `qa.success → reviewer` and `qa.fail → dev`
  When the QA Agent emits a message with `outcome: "fail"`
  Then the orchestrator invokes the Developer Agent again on the same issue, increments the loop counter for the `qa→dev` edge, and posts a single audit comment naming the loop iteration
- Given the same `qa→dev` edge has been traversed `loop_budget.max_iterations` times (e.g. 3)
  When QA emits `outcome: "fail"` a fourth time
  Then the run terminates with status `loop-budget-exceeded`, posts a comment listing the iteration history, and applies label `status:needs-human`
- Given a pipeline graph contains an unreachable step (no transition leads to it from the entry step)
  When the orchestrator validates the pipeline at load time
  Then the file is rejected with a schema error naming the unreachable step, and other pipelines remain active

### US-2: Bring your own model deployment per agent
As a **team lead**, I want to register custom model runtimes (e.g. an Azure OpenAI
GPT-5 deployment in EU, a self-hosted Ollama endpoint, a Bedrock Claude profile) in
one config file and assign different runtimes to different agents in the same
pipeline run, so that each agent uses the model best suited to its job and our
compliance/region constraints.

Acceptance Scenarios:
- Given a runtime registry file declares a runtime named `gpt5-azure-eu` with the necessary endpoint reference and a credential reference resolved from secrets (no plaintext)
  When a pipeline step sets `runtime: gpt5-azure-eu`
  Then the orchestrator invokes that step using the registered runtime and records the runtime name in the audit comment for that step
- Given a pipeline assigns `runtime: gpt5-azure-eu` to BA, `runtime: claude-opus` to DEV, and `runtime: ollama-qwen3-local` to QA
  When the pipeline executes
  Then each agent invocation uses its assigned runtime and the run timeline shows the runtime per step
- Given a pipeline references a runtime name not present in the registry
  When the orchestrator validates the pipeline at load time
  Then the file is rejected with an error naming the missing runtime
- Given a runtime declaration references a credential that cannot be resolved at invocation time
  When the orchestrator attempts to invoke that step
  Then the step (not the whole engine) fails with status `runtime-credential-missing`, a comment names the missing reference (never the secret value), and the run is marked `failed`
- Given no `runtime` is set on a step
  When the orchestrator invokes that step
  Then it falls back to the agent's default runtime declared in the registry, and if that is also absent, to the project-level default runtime

### US-3: Strict agent-to-orchestrator message protocol
As a **developer reading an issue thread**, I want every machine-meaningful agent
output to be a single fenced `apm-msg` JSON block at the end of the agent's
comment, with everything else free-form for human readability, so that the
orchestrator parses exactly one well-defined surface and the thread stays clean.

Acceptance Scenarios:
- Given an agent's final comment contains exactly one fenced block of the form ` ```apm-msg\n{...}\n``` ` and the JSON validates against the published message schema
  When the orchestrator processes the comment
  Then it advances the pipeline using the message's declared `outcome` and ignores all surrounding prose
- Given an agent's comment contains no `apm-msg` block, or more than one, or one that fails schema validation
  When the orchestrator processes the comment
  Then the step is marked `failed` with reason `protocol-violation`, the run is marked `failed`, and a comment names the violation (with the offending block redacted to its first 200 characters)
- Given a human user posts a comment that happens to contain ` ```apm-msg ``` ` text
  When the orchestrator processes the comment
  Then the comment is ignored for routing because the comment author is not a recognised agent identity (audited as `protocol-ignored: non-agent-author`)

### US-4: Single canonical label & comment regulation
As a **new contributor**, I want one document that lists every orchestrator-meaningful
label, every message type, every transition trigger, and the comment etiquette
(who posts what, when, in what format), so that I never have to read source code
to understand how the system communicates.

Acceptance Scenarios:
- Given the regulation document exists at the canonical path (e.g. `docs/AGENT_PROTOCOL.md`)
  When a contributor reads it
  Then they find: (a) every label name with description, applier, and effect; (b) every `apm-msg` message type with JSON schema; (c) every state transition trigger; (d) the comment-thread etiquette rules; (e) examples of compliant vs non-compliant comments
- Given a pipeline YAML file references a label or message type not declared in the regulation document
  When the orchestrator validates the pipeline at load time
  Then the file is rejected with an error naming the undeclared identifier
- Given a contributor opens a PR that adds a new label, message type, or transition trigger to source code without updating the regulation document
  When the Reviewer Agent processes the PR
  Then it raises a BLOCKER comment requiring the document update before approval

### US-5: Clean comment thread (no garbage)
As an **issue reader**, I want the comment thread on a pipeline-driven issue to
contain only meaningful entries — exactly one mutable "live status" comment from
the orchestrator plus one append-only audit entry per state transition — so that
duplicate banners, stale state, and parser noise are eliminated.

Acceptance Scenarios:
- Given a pipeline run is in progress
  When the orchestrator updates state
  Then it edits one designated "live status" comment in place (run ID, current step, current iteration, ETA-of-loop-budget) AND appends one audit entry comment per transition, never more
- Given the same GitHub event is delivered twice (webhook retry, manual replay)
  When the orchestrator processes the second delivery
  Then it detects the duplicate via the event's unique ID, takes no action, and (in debug mode only) logs the suppression
- Given an agent crashes mid-step and no `apm-msg` is ever posted
  When the step's per-step timeout elapses
  Then the orchestrator posts a single timeout entry, marks the step failed, and applies the configured `on_outcome.timeout` transition (or terminates the run if none is declared)

### US-6: Stable, versioned, dry-runnable pipeline contract
As a **maintainer changing a pipeline**, I want pipelines to declare a schema
version and to be validatable offline (without running them), so that I can catch
unreachable steps, missing runtimes, undeclared labels, and infinite loops in CI
before merging the YAML.

Acceptance Scenarios:
- Given a pipeline declares `schema_version: "2"`
  When the orchestrator loads it
  Then it applies the v2 validator; pipelines with `schema_version: "1"` continue to load via a backward-compatible adapter (degenerate forward-only graph)
- Given a contributor runs the pipeline validator locally on a YAML file
  When the file declares an unreachable step, an undeclared label, an undeclared runtime, an undeclared message outcome, or omits a `loop_budget` on a graph containing any backward edge
  Then the validator exits non-zero and prints an error per defect
- Given a PR modifies any file under `.apm/pipelines/`
  When CI runs
  Then the validator runs against every pipeline file and the PR is blocked if any pipeline is invalid

### US-7: Backwards compatibility with v1 pipelines
As an **existing project that adopted issue #2's orchestrator**, I want my
existing `feature-pipeline.yml`, `bug-fix-pipeline.yml`, and `release-pipeline.yml`
to keep working untouched after the v2 upgrade, so that adoption of v2 is
incremental and risk-free.

Acceptance Scenarios:
- Given a v1 pipeline file (no `schema_version`, linear `steps:` list) is present after v2 ships
  When the orchestrator loads it
  Then it is interpreted as a forward-only graph with implicit `success → next-step` transitions and a default loop budget of zero backward edges
- Given an existing `release-pipeline.yml` v1 file uses `approval: required`
  When v2 runs it
  Then the gate behaviour is identical to v1 (pause, wait for `/approve` from authorised user, default 72 h timeout)
- Given a project upgrades a single pipeline file to `schema_version: "2"` while leaving others on v1
  When the orchestrator runs
  Then v1 and v2 pipelines coexist in the same project

### US-8: Per-event idempotency
As an **operator**, I want the orchestrator to be idempotent under duplicate
webhook deliveries and manual workflow re-runs, so that retries never invoke an
agent twice or produce duplicate comments.

Acceptance Scenarios:
- Given the orchestrator processed event with a given delivery ID
  When the same delivery ID arrives again (within the deduplication window)
  Then no agent is invoked, no comment is posted, and the suppression is recorded only in the run's internal audit (not as a new public comment)
- Given a contributor manually re-runs a previously-completed orchestrator workflow
  When the orchestrator loads state from the issue
  Then it sees the run is already `completed` / `failed` / `timed-out` and exits without action

### US-9: Observable loops in the dashboard
As a **dashboard viewer** (read-only per constitution §IX), I want loop iterations
visible alongside step status, so that I can see "DEV → QA (iteration 2 of 3)" at
a glance.

Acceptance Scenarios:
- Given a pipeline run is in a backward-edge loop
  When the dashboard receives the standard webhook update
  Then the loop edge identifier and iteration count are present in the broadcast payload and rendered next to the step name
- Given the dashboard webhook URL is not configured
  When the orchestrator transitions state
  Then state transitions still occur and audit comments are still posted; the broadcast step is silently skipped (dashboard is optional, not a dependency)

## Functional Requirements

- **FR-001**: The orchestrator MUST remain the sole component permitted to sequence, trigger and coordinate agents. Agents MUST NOT directly invoke other agents.
- **FR-002**: Pipelines MUST be declared as YAML files under `.apm/pipelines/*.yml` and MUST carry an explicit `schema_version` field. Files lacking the field MUST be interpreted as `schema_version: "1"` and processed via the v1 backward-compatibility adapter.
- **FR-003**: The v2 schema MUST model a pipeline as a directed graph: a set of named **steps** (each binding an agent and an optional runtime), an **entry step**, and a set of **transitions** of the form `step.outcome → next-step` where `outcome` matches a declared message outcome of the source step's agent.
- **FR-004**: The v2 schema MUST allow backward transitions (a transition whose target step appears earlier in topological order than its source). Any pipeline containing one or more backward transitions MUST declare a `loop_budget` block specifying at minimum: `max_iterations_per_edge`, `max_total_steps`, and `max_wallclock_minutes`. Pipelines with backward edges but no `loop_budget` MUST fail validation.
- **FR-005**: The orchestrator MUST enforce every declared loop budget at runtime. Exceeding any budget MUST terminate the run with status `loop-budget-exceeded`, post a single audit comment listing the offending edge and iteration history, and apply label `status:needs-human`.
- **FR-006**: The orchestrator MUST validate every pipeline file at load time against the v2 schema and reject any file that: (a) references a step that has no incoming transition (other than the entry step); (b) references a runtime not present in the runtime registry; (c) references a label or `apm-msg` outcome not declared in the regulation document; (d) declares a backward edge without a `loop_budget`. Rejection of one file MUST NOT disable other valid pipelines.
- **FR-007**: A **runtime registry** file (canonical path: `.apm/runtimes.yml`) MUST allow declaring named runtimes. Each runtime declaration MUST include: a unique `name`, a `kind` discriminator (e.g. `claude`, `copilot`, `azure-openai`, `bedrock`, `ollama`, `custom`), an `endpoint` reference, a `credential_ref` pointing to a secret name (never an inline secret), and optional `model`, `region`, and free-form `parameters` block.
- **FR-008**: The runtime registry MUST support a project-level `default_runtime` and a per-agent `default_runtime` override map. The runtime selected for a step MUST follow the precedence: step-level `runtime` → agent-level default → project-level default. If none resolves, the run MUST fail at invocation time with status `runtime-unresolved` and a comment naming the agent and missing levels.
- **FR-009**: All credentials referenced by a runtime MUST be resolved from the host secret store (e.g. GitHub Actions secrets / repository variables) at invocation time. The orchestrator MUST NEVER write a credential value to any comment, log, or audit entry. If a credential cannot be resolved, the step MUST fail with status `runtime-credential-missing` and a comment naming the secret reference (not its value).
- **FR-010**: Every agent invocation MUST be parameterised with at least: the issue/PR number, the run ID, the step name, the loop iteration number for that step, and the resolved runtime descriptor (excluding credentials).
- **FR-011**: Each agent MUST end its work for a step by posting exactly one comment whose final element is a fenced code block tagged ` ```apm-msg ` containing a JSON object that validates against the v2 message schema. The orchestrator MUST treat the most recent such block authored by the expected agent identity as the step's outcome. Zero, multiple, or invalid blocks MUST cause the step to fail with status `protocol-violation` and a redacted excerpt in the audit comment.
- **FR-012**: The v2 message schema MUST at minimum require: `version`, `runId`, `step`, `agent`, `iteration`, `outcome` (an enum declared in the regulation document), `summary` (single-line, ≤ 280 chars), and an optional `payload` object whose schema is per-outcome.
- **FR-013**: The orchestrator MUST recognise an agent's identity by mapping the comment author to a configured agent identity registry (a many-to-one map from GitHub usernames / app installation IDs to agent slugs). Comments authored by identities not in the registry MUST be ignored for routing, regardless of `apm-msg` content.
- **FR-014**: All orchestrator-meaningful labels (`agent:*`, `status:*`, `loop:*`, `gate:*`, etc.), all message outcomes, and all transition triggers MUST be declared in a single canonical regulation document at a stable path (e.g. `docs/AGENT_PROTOCOL.md`). The orchestrator MUST refuse to process any pipeline file that references an identifier not declared there.
- **FR-015**: The orchestrator MUST maintain exactly one mutable **live status comment** per active run on the triggering issue/PR, edited in place on each state transition, plus one append-only **audit comment** per transition. No other orchestrator-authored comment shapes are permitted on the issue thread.
- **FR-016**: The orchestrator MUST be idempotent per webhook delivery: it MUST persist a hash or ID of each processed event delivery within the run's state and MUST take no action on a duplicate delivery within a deduplication window of at least 24 hours.
- **FR-017**: The orchestrator MUST remain stateless between runs; all run state (current step, iteration counters, loop history, processed-delivery IDs, runtime selections, message history) MUST live in the GitHub issue/PR comment thread, encoded in the live status comment and the audit comments. On restart or replay, the orchestrator MUST reconstruct the run state by reading those comments alone.
- **FR-018**: The orchestrator MUST support an `approval: required` gate on any step (preserving v1 behaviour). The gate MUST pause execution, post a request comment, and resume only when an authorised user (write/maintain/admin permission) posts a `/approve` comment, subject to a configurable timeout (default 72 hours). On timeout the run MUST be marked `timed-out`.
- **FR-019**: The orchestrator MUST enforce a per-step timeout (default configurable per pipeline, fallback default 60 minutes). On timeout it MUST mark the step failed and follow the step's `on_outcome.timeout` transition if declared, else terminate the run with status `step-timeout`.
- **FR-020**: A standalone **pipeline validator** MUST be runnable offline (without a GitHub connection) against any pipeline file or directory. It MUST exit non-zero and print one error per defect for: schema violations, unreachable steps, missing runtimes, undeclared identifiers, missing loop budgets on graphs with backward edges, and any other rule listed in FR-006.
- **FR-021**: The orchestrator MUST broadcast each state transition (including loop iteration counters and active runtime per step) to the dashboard via the existing webhook mechanism. If the webhook URL is not configured, transitions MUST still occur and audit comments MUST still be posted; the broadcast MUST be silently skipped.
- **FR-022**: The orchestrator MUST emit, for every run, a structured **run timeline** reconstructible solely from the issue's comments — listing trigger event, every step entered, runtime used, iteration number, outcome, and final status — without any external state store.
- **FR-023**: The orchestrator MUST be covered by automated tests (no live GitHub calls required) that exercise at minimum: a pipeline with one backward edge running to budget exhaustion; a pipeline with three different runtimes across three agents; an `apm-msg` protocol violation; a duplicate event delivery; a loaded v1 pipeline executing as a degenerate v2 graph; a runtime referencing an unresolved credential.
- **FR-024**: The Reviewer Agent MUST raise a BLOCKER on any PR that adds a label, message outcome, or transition identifier to source code or pipeline YAML without a corresponding update to the regulation document (FR-014).
- **FR-025**: The orchestrator's behaviour MUST NOT depend on which AI runtime is selected. The same pipeline graph, message protocol, label semantics, loop budgets, and audit format MUST apply identically across every registered runtime.

## Success Criteria

- [ ] A worked example issue is provided in which a pipeline executes the loop `BA → DEV → QA → DEV → QA → DEV → BA → DEV → QA → REVIEWER → RELEASE` end-to-end, driven entirely by `apm-msg` outcomes, with no human re-labelling and no human comments required between steps.
- [ ] The same example is re-run with all loop budgets reduced; the run terminates with `loop-budget-exceeded`, posts the iteration history, and applies `status:needs-human`.
- [ ] A user can register an Azure OpenAI runtime in `.apm/runtimes.yml`, assign it to one agent, and observe in the audit timeline that the agent invocation used that runtime — without editing any GitHub Actions workflow file.
- [ ] Three different runtimes are exercised by three different agents in one pipeline run; the run timeline shows the runtime per step.
- [ ] The pipeline validator catches: an unreachable step, a missing runtime, an undeclared label, a backward edge with no loop budget, and a malformed `apm-msg` reference.
- [ ] An agent comment lacking a valid `apm-msg` block fails the run with status `protocol-violation` and posts a clear, redacted audit entry.
- [ ] A duplicate webhook delivery produces no extra agent invocation and no extra public comment.
- [ ] An existing v1 pipeline file (no `schema_version`) executes unchanged as a degenerate v2 forward-only graph.
- [ ] A completed pipeline issue thread contains exactly one mutable orchestrator status comment plus one audit comment per transition; no duplicates, no stale banners.
- [ ] The regulation document at the canonical path declares every label, message outcome, and transition trigger referenced anywhere in `.apm/pipelines/` and the orchestrator source; a CI check enforces this.
- [ ] Automated tests cover all scenarios in FR-023 and execute without a live GitHub connection.
- [ ] The dashboard receives loop iteration counters and per-step runtime in its broadcast payload (verified by a captured payload sample in the spec's worked example).

## Key Entities

- **Pipeline (v2)**: Versioned YAML graph definition. Carries `schema_version`, declared `steps` (each binding an agent, optional runtime, optional approval gate, optional per-step timeout), an `entry` step, a set of `transitions` (`step.outcome → step`), and a `loop_budget` block when backward edges exist.
- **Pipeline Run**: One execution instance of a Pipeline, anchored to one GitHub issue or PR. Has a unique `runId`, a current step, per-edge iteration counters, a processed-event-delivery ID set, and an overall status (`pending | running | awaiting-approval | awaiting-agent | timed-out | failed | completed | loop-budget-exceeded | step-timeout`).
- **Step**: A node in the pipeline graph. Binds an `agent` slug and an optional `runtime` reference. May declare `approval: required`, a per-step timeout, and outcome-keyed transitions.
- **Transition**: A directed edge `(source step, source outcome) → target step`. Outcomes are drawn from the message schema enum declared in the regulation document.
- **Loop Budget**: A bounded resource declaration on a pipeline with backward edges: `max_iterations_per_edge`, `max_total_steps`, `max_wallclock_minutes`. Exceeding any value terminates the run.
- **Runtime**: A named entry in the runtime registry binding a model deployment (kind + endpoint + credential reference + parameters). Runtimes are referenced by name from pipeline steps and from per-agent defaults.
- **Runtime Registry**: A single project-level configuration file declaring all available runtimes, the project-level default, and per-agent default overrides.
- **Agent Identity**: A declared mapping from GitHub user/app identities to agent slugs. The orchestrator only honours `apm-msg` blocks authored by recognised identities for the expected agent of the current step.
- **`apm-msg` Message**: The single machine-readable surface emitted by an agent at the end of a step. A fenced JSON block carrying `version`, `runId`, `step`, `agent`, `iteration`, `outcome`, `summary`, and an optional per-outcome `payload`.
- **Live Status Comment**: The single mutable comment per run, edited in place on every state transition. Carries the latest snapshot view (run ID, current step, iteration, runtime, ETA-to-budget, last outcome).
- **Audit Comment**: An append-only comment posted exactly once per state transition, recording the transition's timestamp, source step, outcome, target step, runtime used, and iteration number.
- **Regulation Document**: The single canonical source listing every label, message outcome, and transition trigger meaningful to the orchestrator. Pipelines and source code may reference only identifiers declared here; CI enforces this.
- **Run Timeline**: A reconstructible, deterministic ordered list of all steps and transitions in a run, derivable solely from the issue's audit comments.

## Out of Scope

- The implementation of the v2 orchestrator itself (handed off to the Developer Agent under a separate task derived from this spec's `plan.md`).
- Migration off GitHub as the state store — comments-as-DB is preserved (constitution §VIII).
- Non-GitHub SCM providers (GitLab, Bitbucket, Azure DevOps).
- A write-capable dashboard surface — dashboard remains read-only (constitution §IX).
- Replacing GitHub Actions as the agent execution substrate.
- Multi-repository or cross-repo pipeline coordination.
- A graphical pipeline editor — pipelines remain code-reviewed YAML.
- Real-time streaming of agent token-by-token output into issue comments — agents post a single comment per step (with an optional final `apm-msg` block).
- Automatic generation of the regulation document from source — the regulation document is human-authored and source/CI must conform to it (not the other way around).

## Security and Privacy Considerations

- **Secrets must never appear in comments, logs, or audit entries.** Runtime declarations reference credentials by *name* only; the orchestrator resolves names against the host secret store at invocation time and emits only the reference name (not the value) in any failure message.
- **Identity verification on routing.** Only comments authored by identities present in the agent identity registry may drive transitions. This prevents an external commenter from forging an `apm-msg` block to advance a pipeline.
- **Approval gate authorisation** preserves the v1 rule: `/approve` is honoured only from users with `write`, `maintain`, or `admin` permission, verified against the GitHub permissions API at the moment of approval.
- **Least-privilege workflow tokens.** Orchestrator GitHub Actions workflows must request only the scopes required (issues:write, actions:write, contents:read; plus the additional read scope needed to verify approver permissions).
- **Custom-runtime traffic.** When a user-registered runtime calls a third-party endpoint (Azure OpenAI, Bedrock, etc.), the issue body and any agent-shared context may be transmitted to that endpoint. The regulation document MUST warn users to ensure their chosen runtime's data handling matches their compliance posture; the orchestrator does not make this decision for them.
- **No PII handled by APM itself.** Standard open-source data classification applies (constitution Security and Privacy Constraints). Custom-runtime usage may introduce PII concerns out of APM's control; this is the user's responsibility and is called out in the regulation document.
- **Regulation linting** (FR-024) prevents undocumented labels or message types from silently expanding the orchestrator's attack surface.

## Assumptions

- The constitution's existing rules (§II NNN traceability, §IV dual-AI compatibility generalised here to N-runtime, §VI auditable automation, §VIII orchestrator-as-control-plane, §IX dashboard read-only) apply unchanged.
- GitHub Actions remains the agent execution substrate; v2 changes *how* workflows are selected and parameterised, not the substrate itself.
- GitHub's webhook delivery model (delivery ID, at-least-once, occasional retry) holds; the deduplication design depends on the delivery ID being available in the workflow context.
- The host secret store (GitHub Actions secrets / repository variables / OIDC-federated cloud credentials) is the trust root for runtime credentials; APM does not introduce its own secret store.
- The dashboard remains optional; absence of the webhook URL silently disables broadcast (constitution §IX read-only stance preserved).
- Existing v1 pipelines (`feature-pipeline.yml`, `bug-fix-pipeline.yml`, `release-pipeline.yml`) and their consumers continue to function unchanged via the v1 backward-compatibility adapter (US-7).

## Open Questions

_None. All decisions captured above are intended for handoff to the Architect Agent (cross-cutting design — runtime registry, message schema, regulation contract) and then to the Developer Agent for implementation planning._
