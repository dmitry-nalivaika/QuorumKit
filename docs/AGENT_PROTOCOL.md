# QuorumKit Agent Protocol

> **Canonical source of truth.** Every GitHub label, `apm-msg` (Agent Pipeline
> Message) outcome, and pipeline transition trigger meaningful to the Orchestrator
> is declared here and only here (FR-014, ADR-006 §5).
>
> The orchestrator's pipeline validator and CI `regulation-lint` job reject any
> pipeline YAML or orchestrator source that references an identifier not declared
> here. Introducing a new identifier without updating this document is a Reviewer
> Agent BLOCKER (FR-024).
>
> This document is **human-authored and never generated from source.** Source
> code and pipelines conform to it — not the other way around.

## Who should read this

| Reader | Why |
|--------|-----|
| **Agent authors** | To emit the correct `apm-msg` blocks and comment shapes |
| **Pipeline authors** | To reference only declared labels, outcomes, and triggers |
| **Orchestrator contributors** | To understand the state model and enforce it correctly |
| **Reviewers** | To verify that PRs reference only identifiers declared here |

---

## 1. Labels

The Orchestrator recognises labels in four prefixed namespaces. Labels outside
these namespaces have no routing effect and are ignored by the Orchestrator.

### 1.1 `agent:*` — Active agent

The Orchestrator applies exactly one `agent:*` label at a time to indicate which
agent currently owns the issue or PR.

| Label | Effect |
|-------|--------|
| `agent:triage` | Triage Agent is active. |
| `agent:ba` | BA / Product Agent is active. |
| `agent:architect` | Architect Agent is active. |
| `agent:dev` | Developer Agent is active. |
| `agent:qa` | QA / Test Agent is active. |
| `agent:reviewer` | Reviewer Agent is active. |
| `agent:security` | Security Agent is active. |
| `agent:release` | Release Agent is active. |

### 1.2 `status:*` — Run-level status

| Label | Meaning |
|-------|---------|
| `status:running` | A pipeline run is in progress. |
| `status:awaiting-approval` | An approval gate is open; the pipeline is paused. |
| `status:awaiting-agent` | An agent has been dispatched; waiting for `workflow_run.completed`. |
| `status:completed` | The run finished successfully. |
| `status:failed` | The run terminated with a step failure. |
| `status:timed-out` | A per-step or approval timeout elapsed. |
| `status:loop-budget-exceeded` | A v2 loop budget was exhausted. |
| `status:needs-human` | Human intervention is required. Auto-applied alongside `loop-budget-exceeded`. |

### 1.3 `loop:*` — Loop iteration markers (v2 only)

| Label | Meaning |
|-------|---------|
| `loop:active` | A backward-edge traversal is currently in flight. |

Per-edge counters are stored in the audit comment payload, not as labels — GitHub
labels do not scale to N distinct counters.

### 1.4 `gate:*` — Gate state

| Label | Meaning |
|-------|---------|
| `gate:approval-open` | An approval gate is open and waiting for `/approve`. |

### 1.5 `triaged` and `type:*` — Trigger labels

The Triage Agent applies these labels; the Orchestrator matches them to trigger
pipeline runs. Their full semantics are defined in the Triage Agent's role
definition and reproduced here for completeness.

| Label | Applied by | Purpose |
|-------|-----------|---------|
| `triaged` | Triage Agent | Confirms the issue has been classified. |
| `type:feature` | Triage Agent | Routes to the feature pipeline. |
| `type:bug` | Triage Agent | Routes to the bug-fix pipeline. |
| `type:chore` | Triage Agent | Routes to the chore pipeline. |
| `type:release` | Triage Agent | Routes to the release pipeline. |
| `type:security` | Triage Agent | Routes to the security pipeline. |
| `type:spec` | BA Agent | Applied to spec-only PRs when a new `specs/NNN-slug/spec.md` is published. The Orchestrator uses it to route the Reviewer or Architect Agent to review the spec before implementation begins. |

### 1.6 Pipeline step agent slugs

Agent slugs referenced in `steps[*].agent` inside pipeline YAML files must be
listed here. These slugs map to the identity entries in `src/agent-identities.yml`.

| Slug | Pipeline | Description |
|------|----------|-------------|
| `ba-enrich-agent` | `ba-enrichment-pipeline` | BA Issue Enrichment Agent (Issue #263). Dispatched via `copilot-agent-ba-enrich.yml`; enriches issue body in-place. v1 protocol — no `apm-msg` required. |

---

## 2. `apm-msg` Message Schema (v2)

An `apm-msg` block is a fenced JSON block that every agent embeds in its final
GitHub comment to signal the outcome of a pipeline step. The Orchestrator parses
this block to decide the next pipeline transition.

**Key rules:**
- Every step completion or failure MUST emit exactly one ` ```apm-msg ``` ` block (FR-011).
- `apm-msg` blocks appear only in step-completion comments — never in `agent-start` comments.
- The Orchestrator rejects runs with zero, multiple, or malformed `apm-msg` blocks as `protocol-violation`.

### 2.1 Field reference

All fields marked **required** must be present. Fields introduced in the **v2
extension** (Issue #175, FR-008) are optional — agents that do not yet emit them
continue to pass schema validation.

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `version` | `"2"` | ✓ | Schema version. Only `"2"` is accepted. |
| `runId` | string (UUID) | ✓ | Pipeline run UUID matching the active run. |
| `step` | string | ✓ | Step name exactly as declared in the pipeline YAML. |
| `agent` | string | ✓ | Agent slug (e.g. `"qa-agent"`) matching the identity registry in `src/agent-identities.yml`. |
| `iteration` | integer ≥ 1 | ✓ | 1-based iteration counter for this step on the current edge. |
| `outcome` | enum | ✓ | Declared outcome (see §2.2). `"start"` is **not** a valid value. |
| `summary` | string ≤ 280 chars | ✓ | Single-line human-readable summary of the outcome. |
| `payload` | object | — | Per-outcome structured detail (see §2.3). |
| `event_type` | `"complete"` \| `"fail"` | — | *v2 extension.* Discriminates agent-complete from agent-fail lifecycle events. |
| `pipeline_id` | string \| null | — | *v2 extension.* Zero-padded issue number (e.g. `"155"`); `null` for cloud/CI runs. |
| `issue` | string \| null | — | *v2 extension.* GitHub Issue URL or number string (e.g. `"42"`). |
| `pr` | string \| null | — | *v2 extension.* GitHub PR URL or number string; `null` when no PR is open. |
| `branch` | string | — | *v2 extension.* Git branch name at the time of emission. |
| `timestamp` | string (ISO-8601) | — | *v2 extension.* UTC emission time in `YYYY-MM-DDTHH:MM:SSZ` format. |

### 2.2 Outcomes

The `outcome` field must be one of the values in this table. Pipelines may
declare transitions only on outcomes that the step's agent can produce.

| Outcome | Semantics | Typical producer | Default transition |
|---------|-----------|-----------------|-------------------|
| `success` | The step achieved its declared purpose. | All agents | → next forward step |
| `fail` | The step did not achieve its purpose; do not advance forward. | QA, Reviewer | → backward edge (e.g. `qa → dev`) |
| `blocker` | A blocking defect was found; loop back to the producing role. | Reviewer | → `dev` |
| `spec_gap` | The spec is incomplete; loop back to BA. | Dev, QA | → `ba` |
| `timeout` | Per-step timeout elapsed (FR-019). | Orchestrator (synthetic) | → `on_outcome.timeout` if declared, otherwise `failed` |
| `needs-human` | The agent escalated for human intervention. | Any | Run terminates; `status:needs-human` label applied. |
| `runtime-error` | Runtime adapter exhausted retries (ADR-007 §8, FR-030). | Orchestrator (synthetic) | Run fails; does NOT increment the loop budget. |
| `protocol-violation` | Zero, multiple, or invalid `apm-msg` blocks detected. | Orchestrator (synthetic) | Run fails. |
| `orchestrator-failure` | The Orchestrator workflow threw an uncaught error (ADR-007 §6, FR-029). | Orchestrator (synthetic) | Run fails; audit comment links to the failed Actions run. |
| `spec-ready` | BA Agent published a completed spec to a branch and PR. | BA Agent | → activates next-agent label (`agent:architect` or `agent:dev`) on the spec PR. |

### 2.3 Per-outcome payload schemas

`payload` is optional. When present, its shape should match the outcome.
The Orchestrator lints at the outcome-name level; payload shapes are advisory
(the `payload` field is `additionalProperties: true`).

| Outcome | Expected payload shape |
|---------|----------------------|
| `success` | `{ "artefacts"?: string[], "links"?: string[] }` |
| `fail`, `blocker` | `{ "failed_scenarios"?: string[], "details"?: string }` |
| `spec_gap` | `{ "missing": string[], "ba_input_required": string }` |
| `timeout`, `needs-human`, `runtime-error`, `protocol-violation`, `orchestrator-failure` | `{ "details"?: string, "actions_run_url"?: string }` |
| `spec-ready` | `{ "specPath": string, "branch": string, "prUrl": string }` |

---

## 3. Agent Comment Formats

Every agent posts a structured GitHub comment at the start and end of each
invocation (FR-002, FR-003, FR-004). These are plain GitHub comments — they
are not `apm-msg` blocks. The `apm-msg` block is embedded only in the
completion and failure comments.

Silent termination — ending without posting any comment — is prohibited under
every code path (FR-004).

### 3.1 `agent-start` comment

Post this comment on the Issue or PR before beginning any work.

```markdown
<!-- agent-footprint: start -->
**Agent started:** `<agent-name>`
- **Event type:** `agent-start`
- **Issue / PR:** #NNN (or PR #NNN)
- **Branch:** `NNN-slug`
- **Timestamp:** `YYYY-MM-DDTHH:MM:SSZ`
```

> `agent-start` comments do **not** include an `apm-msg` block. The Orchestrator
> does not parse them for outcomes.

### 3.2 `agent-complete` comment

Post this comment when the step finishes successfully. The `apm-msg` block must
be the final element.

```markdown
<!-- agent-footprint: complete -->
**Agent complete:** `<agent-name>`
- **Event type:** `agent-complete`
- **Issue / PR:** #NNN (or PR #NNN)
- **Branch:** `NNN-slug`
- **Timestamp:** `YYYY-MM-DDTHH:MM:SSZ`
- **Summary:** <one-line outcome summary>
- **Next recommended action:** <e.g. "Reviewer Agent review requested">

\`\`\`apm-msg
{
  "version": "2",
  "runId": "<uuid>",
  "step": "<step-name>",
  "agent": "<agent-slug>",
  "iteration": 1,
  "outcome": "success",
  "summary": "<summary ≤ 280 chars>",
  "event_type": "complete",
  "pipeline_id": "<NNN or null>",
  "issue": "<issue-number-string or null>",
  "pr": "<pr-number-string or null>",
  "branch": "<NNN-slug>",
  "timestamp": "<ISO-8601>"
}
\`\`\`
```

### 3.3 `agent-fail` comment

Post this comment under all abnormal termination conditions. Do not include raw
stack traces in the `Error` field.

```markdown
<!-- agent-footprint: fail -->
**Agent failed:** `<agent-name>`
- **Event type:** `agent-fail`
- **Issue / PR:** #NNN (or PR #NNN)
- **Branch:** `NNN-slug`
- **Timestamp:** `YYYY-MM-DDTHH:MM:SSZ`
- **Error:** <error message — no raw stack trace>
- **Recommended recovery:** <e.g. "Re-run the workflow; if the problem persists, check the Actions log">

\`\`\`apm-msg
{
  "version": "2",
  "runId": "<uuid>",
  "step": "<step-name>",
  "agent": "<agent-slug>",
  "iteration": 1,
  "outcome": "fail",
  "summary": "<error summary ≤ 280 chars>",
  "event_type": "fail",
  "pipeline_id": "<NNN or null>",
  "issue": "<issue-number-string or null>",
  "pr": "<pr-number-string or null>",
  "branch": "<NNN-slug>",
  "timestamp": "<ISO-8601>"
}
\`\`\`
```

---

## 4. `apm-msg` Examples

### Compliant — single fence, end of comment

The entire prose precedes the single `apm-msg` fence, which is the last element
in the comment.

````markdown
I ran the QA suite. 47/50 acceptance scenarios passed; 3 failed.
See PR #42's check run for details.

```apm-msg
{
  "version": "2",
  "runId": "0bb1a67c-3e2f-4a1d-9c8b-7f5d2e1a0c4b",
  "step": "qa",
  "agent": "qa-agent",
  "iteration": 2,
  "outcome": "fail",
  "summary": "3 of 50 acceptance scenarios failed; loop back to dev.",
  "event_type": "fail",
  "pipeline_id": "042",
  "issue": "42",
  "pr": "87",
  "branch": "042-user-auth",
  "timestamp": "2026-05-26T14:30:00Z",
  "payload": { "failed_scenarios": ["AS-12", "AS-19", "AS-31"] }
}
```
````

### Non-compliant — two fenced blocks

Embedding more than one `apm-msg` fence in a single comment triggers a
`protocol-violation`; the run fails immediately.

````markdown
```apm-msg
{ "outcome": "success" }
```
Some additional text.
```apm-msg
{ "outcome": "fail" }
```
````

**Result:** `protocol-violation` audit comment; run fails.

### Non-compliant — wrong code fence tag

The Orchestrator matches the exact tag `apm-msg`. Any other tag (including
`apm`) is treated as plain prose — no message is detected, and the run fails
when the per-step timeout elapses.

````markdown
```apm
{ "outcome": "success" }
```
````

**Result:** No `apm-msg` block detected. Run fails on per-step timeout.

### Non-compliant — `apm-msg` in `agent-start` comment

An `apm-msg` block must not appear in an `agent-start` comment. The Orchestrator
does not expect an outcome signal at step start, and the presence of such a block
may cause unexpected routing.

---

## 5. Transition Triggers

Pipelines may declare triggers using these GitHub event types only. Any event
type not in this table is unsupported and will be rejected by pipeline validation.

| Event type | Used by |
|------------|---------|
| `issues.opened` | Reserved (v1 + v2) |
| `issues.labeled` | Feature, bug, release, and security pipelines (v1 + v2) |
| `issue_comment.created` | Approval gate (`/approve`); `apm-msg` ingestion |
| `pull_request.opened` | PR-driven pipelines (v1 + v2) |
| `pull_request.labeled` | PR-driven pipelines (v1 + v2) |
| `pull_request.synchronize` | PR-driven pipelines (v1 + v2) |
| `pull_request_review_comment.created` | Reserved |
| `workflow_run.completed` | Resume after agent dispatch |
| `repository_dispatch` | Alert-to-issue automation; manual orchestration |
| `workflow_dispatch` | Manual replay — exempt from deduplication (FR-026) |

---

## 6. Orchestrator Comment Rules

The Orchestrator posts exactly three comment shapes on a triggering issue or PR
(ADR-004, FR-015). No other Orchestrator-authored shapes are permitted.

### 6.1 Audit comments

- Contain the embedded HTML payload `<!-- apm-pipeline-state: { … } -->`.
- Are **append-only** — never edited, never deleted.
- Represent the authoritative pipeline state.
- Are posted exactly once per state transition.

### 6.2 Live-status comment (v2 only)

- Contains the embedded HTML marker `<!-- apm-pipeline-status: {"runId":"<uuid>"} -->`.
- Exactly one exists per active v2 run.
- Is edited in place on every state transition.
- Body must include the disclaimer: `_Live view — authoritative state is the audit comments below._`

### 6.3 Agent invocation summary comments

- Are authored by the agent, not the Orchestrator.
- Must have exactly one ` ```apm-msg ``` ` fence as their final element.

Human contributors and other tools may post regular comments freely. The
Orchestrator ignores any comment that lacks a recognised state tag, status
marker, or `apm-msg` block from a registered agent identity.

---

## 7. Rationale and Cross-References

| Requirement | Satisfied by |
|-------------|-------------|
| Constitution §VI (Observable, Auditable Automation) | Audit comment channel (§6.1) |
| ADR-004 (live-status channel) | Supersedes ADR-002; introduces §6.2 |
| ADR-005 (runtime kind allowlist) | Frozen allowlist enforced by pipeline validator |
| ADR-006 (source of truth) | Declares `src/` as the config source; this document governs label and outcome identifiers |
| ADR-007 §6 (Orchestrator self-reporting) | Mandates `outcome: orchestrator-failure` on uncaught Orchestrator errors |

Updating this document requires updating every pipeline and Orchestrator-source
identifier that references it in the same PR. The Reviewer Agent enforces this
(FR-024).

---

## Related topics

- [`src/agent-identities.yml`](../src/agent-identities.yml) — agent slug registry
- [`src/runtimes.yml`](../src/runtimes.yml) — runtime kind allowlist (ADR-005)
- [`docs/architecture/adr-004-orchestrator-state-comment-model-v2.md`](architecture/adr-004-orchestrator-state-comment-model-v2.md) — live-status comment design
- [`docs/architecture/adr-006-dual-runtime-source-of-truth-and-sync.md`](architecture/adr-006-dual-runtime-source-of-truth-and-sync.md) — source-of-truth rules
- [`docs/architecture/adr-007-orchestrator-github-actions-substrate-contract.md`](architecture/adr-007-orchestrator-github-actions-substrate-contract.md) — Orchestrator substrate contract
- [`docs/PIPELINES.md`](PIPELINES.md) — how to author pipeline YAML files
- [`docs/AGENT_PROTOCOL.md`](AGENT_PROTOCOL.md) — this document
