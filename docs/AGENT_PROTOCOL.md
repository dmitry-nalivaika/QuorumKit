# QuorumKit Agent Protocol — Canonical Regulation Document

> **Source of truth.** This document is the **single canonical declaration** of
> every label, `apm-msg` outcome, and transition trigger meaningful to the
> Orchestrator (FR-014, ADR-006 §5).
>
> The orchestrator's pipeline validator and CI `regulation-lint` job will
> **reject** any pipeline YAML or orchestrator source code that references an
> identifier not declared here. Adding a new identifier without updating this
> document is a Reviewer Agent BLOCKER (FR-024).
>
> This document is **human-authored**. It is never generated from source.
> Source code and pipelines must conform to it, not the other way around.

---

## 1. Labels

All orchestrator-meaningful labels live in one of four prefixed namespaces.
Anything outside these namespaces is *not* meaningful to routing.

### 1.1 `agent:*` — Currently active agent

| Label | Applied by | Effect |
|---|---|---|
| `agent:triage` | Orchestrator | Indicates the Triage Agent is active on the issue. |
| `agent:ba` | Orchestrator | Indicates the BA / Product Agent is active. |
| `agent:architect` | Orchestrator | Architect Agent is active. |
| `agent:dev` | Orchestrator | Developer Agent is active. |
| `agent:qa` | Orchestrator | QA / Test Agent is active. |
| `agent:reviewer` | Orchestrator | Reviewer Agent is active. |
| `agent:security` | Orchestrator | Security Agent is active. |
| `agent:release` | Orchestrator | Release Agent is active. |

### 1.2 `status:*` — Run-level status

| Label | Applied by | Effect |
|---|---|---|
| `status:running` | Orchestrator | A pipeline run is in progress. |
| `status:awaiting-approval` | Orchestrator | Approval gate is open; pipeline paused. |
| `status:awaiting-agent` | Orchestrator | Agent dispatched, awaiting `workflow_run.completed`. |
| `status:completed` | Orchestrator | Run finished successfully. |
| `status:failed` | Orchestrator | Run terminated with a step failure. |
| `status:timed-out` | Orchestrator | A timeout (per-step or approval) elapsed. |
| `status:loop-budget-exceeded` | Orchestrator | A v2 loop budget was exhausted. |
| `status:needs-human` | Orchestrator | Human intervention required (auto-applied with `loop-budget-exceeded`). |

### 1.3 `loop:*` — Loop iteration markers (v2 only)

| Label | Applied by | Effect |
|---|---|---|
| `loop:active` | Orchestrator | A backward-edge traversal is currently in flight. |

(Per-edge counters are recorded in the audit comment payload, not in labels —
labels do not scale to N counters.)

### 1.4 `gate:*` — Gate state markers

| Label | Applied by | Effect |
|---|---|---|
| `gate:approval-open` | Orchestrator | An approval gate is open and awaiting `/approve`. |

### 1.5 `triaged` and `type:*` — Trigger labels (already in v1)

`triaged`, `type:feature`, `type:bug`, `type:chore`, `type:release`,
`type:security` — applied by the Triage Agent and matched by pipeline triggers.
Their semantics are owned by the Triage Agent's role definition and reproduced
here for completeness.

`type:spec` — applied by the BA Agent to spec-only PRs opened when a new
`specs/NNN-slug/spec.md` is published. The orchestrator may use this label to
route the Reviewer or Architect Agent to review the spec PR before implementation
begins.

---

## 2. `apm-msg` Schema (v2)

### 2.0 Extended field reference

Every `apm-msg` block carries the following fields. All fields introduced in
**v2 extension** (Issue #175, FR-008) are **optional** — existing agents that
do not yet emit them continue to pass schema validation.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | `"2"` | ✓ | Schema version. Only `"2"` is accepted. |
| `runId` | string (UUID) | ✓ | Pipeline run UUID matching the active run. |
| `step` | string | ✓ | Step name as declared in the pipeline. |
| `agent` | string | ✓ | Agent slug (e.g. `"qa-agent"`) matching the identity registry. |
| `iteration` | integer ≥ 1 | ✓ | 1-based iteration counter for the step on the current edge. |
| `outcome` | enum (see §2.1) | ✓ | Declared outcome. `"start"` is NOT a valid value — `apm-msg` blocks are emitted only at step completion or failure. |
| `summary` | string ≤ 280 chars | ✓ | Single-line human summary. |
| `payload` | object | — | Optional per-outcome payload (see §2.2). |
| `event_type` | `"complete"` \| `"fail"` | — | *v2 extension* — discriminates agent-complete vs agent-fail lifecycle events. |
| `pipeline_id` | string \| null | — | *v2 extension* — NNN zero-padded issue number; `null` for cloud/CI runs. |
| `issue` | string \| null | — | *v2 extension* — GitHub Issue URL or number string (e.g. `"42"`). |
| `pr` | string \| null | — | *v2 extension* — GitHub PR URL or number string; `null` when no PR is open. |
| `branch` | string | — | *v2 extension* — Git branch name at the time of emission. |
| `timestamp` | string (ISO-8601) | — | *v2 extension* — UTC timestamp of emission (`YYYY-MM-DDTHH:MM:SSZ`). |

> **`event_type` in `agent-start` comments**: `apm-msg` blocks are emitted
> only at step completion or failure — they are **not** included in
> `agent-start` comments. `agent-start` comments use a plain structured GitHub
> comment (no `apm-msg` block). See §2.3 for the full comment formats.

### 2.1 `apm-msg` Outcomes

Every agent ends a step by emitting exactly one fenced ` ```apm-msg ``` ` block
(FR-011). The `outcome` field MUST be one of the values below. Pipelines may
declare transitions only on outcomes that the source step's agent can produce.

| Outcome | Semantics | Typical producer | Default-pipeline transition |
|---|---|---|---|
| `success` | The step achieved its declared purpose. | All agents | → next forward step |
| `fail` | The step did not achieve its purpose; the run should NOT advance forward. | QA, Reviewer | → backward edge (e.g. `qa→dev`) |
| `blocker` | A blocking defect was found; loop back to the producing role. | Reviewer | → `dev` |
| `spec_gap` | The step revealed the spec is incomplete; loop back to BA. | Dev, QA | → `ba` |
| `timeout` | Per-step timeout elapsed (FR-019). | Orchestrator (synthetic) | → `on_outcome.timeout` if declared, else `failed` |
| `needs-human` | Agent escalated for human intervention. | Any | Run terminates; label `status:needs-human`. |
| `runtime-error` | Runtime adapter retry-exhausted (ADR-007 §8, FR-030). | Orchestrator (synthetic) | Run fails; does NOT increment loop budget. |
| `protocol-violation` | Zero / multiple / invalid `apm-msg` blocks. | Orchestrator (synthetic) | Run fails. |
| `orchestrator-failure` | Orchestrator workflow itself threw uncaught (ADR-007 §6, FR-029). | Orchestrator (synthetic) | Run fails; audit comment links to failed Actions run. |
| `spec-ready` | BA Agent finished writing/refining a spec and published it to a branch + PR; orchestrator routes to next-agent label (`agent:architect` or `agent:dev`). | BA Agent | → activate next-agent label on the spec PR. |

### Per-outcome `payload` schemas

`payload` is optional. When present, its shape SHOULD match the outcome:

- `success`: `{ "artefacts"?: string[], "links"?: string[] }`
- `fail`, `blocker`: `{ "failed_scenarios"?: string[], "details"?: string }`
- `spec_gap`: `{ "missing": string[], "ba_input_required": string }`
- `timeout`, `needs-human`, `runtime-error`, `protocol-violation`,
  `orchestrator-failure`: `{ "details"?: string, "actions_run_url"?: string }`
- `spec-ready`: `{ "specPath": string, "branch": string, "prUrl": string }`

These shapes are advisory at the schema level (`payload` is `additionalProperties: true`)
because the regulation document is the human-curated source. CI lints
references at the *outcome name* level, not the payload shape.

### 2.3 Agent Footprint Comment Formats

All agents MUST post structured comments on the relevant GitHub Issue or PR at
the start and end of every invocation (FR-002, FR-003, FR-004). This section
defines the canonical comment shapes. **These are GitHub comments — not
`apm-msg` blocks.**

#### `agent-start` comment (posted on the Issue or PR before any work begins)

```markdown
<!-- agent-footprint: start -->
**Agent started:** `<agent-name>`
- **Event type:** `agent-start`
- **Issue / PR:** #NNN (or PR #NNN)
- **Branch:** `NNN-slug`
- **Timestamp:** `YYYY-MM-DDTHH:MM:SSZ`
```

No `apm-msg` block is included in `agent-start` comments.

#### `agent-complete` comment (posted on the Issue or PR when work finishes successfully)

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

#### `agent-fail` comment (posted under ALL abnormal termination conditions)

```markdown
<!-- agent-footprint: fail -->
**Agent failed:** `<agent-name>`
- **Event type:** `agent-fail`
- **Issue / PR:** #NNN (or PR #NNN)
- **Branch:** `NNN-slug`
- **Timestamp:** `YYYY-MM-DDTHH:MM:SSZ`
- **Error:** <error message — no raw stack trace>
- **Recommended recovery:** <e.g. "Re-run the workflow; if problem persists, check Actions log">

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

Silent termination (no comment posted) is prohibited under any code path (FR-004).

---

## 3. Compliant `apm-msg` Examples

### Compliant — single fence at the end of the comment

````markdown
I ran the QA suite. 47/50 acceptance scenarios passed; 3 failed.
See PR #N's check run for details.

```apm-msg
{
  "version": "2",
  "runId": "0bb1a67c-…",
  "step": "qa",
  "agent": "qa-agent",
  "iteration": 2,
  "outcome": "fail",
  "summary": "3 of 50 acceptance scenarios failed; loop back to dev.",
  "payload": { "failed_scenarios": ["AS-12", "AS-19", "AS-31"] }
}
```
````

### Non-compliant — two fenced blocks

````markdown
```apm-msg
{ … one message … }
```
some text
```apm-msg
{ … another message … }
```
````
→ `protocol-violation` audit comment, run fails.

### Non-compliant — wrong tag

````markdown
```apm
{ "outcome": "success" }
```
````
→ Treated as no message (no fence with the exact `apm-msg` tag). Run fails on
the per-step timeout.

---

## 4. Transition Triggers (orchestrator inputs)

Pipelines may declare triggers using these GitHub event types only:

| Event | Used by |
|---|---|
| `issues.opened` | (Reserved; v1+v2) |
| `issues.labeled` | Feature / bug / release / security pipelines (v1+v2) |
| `issue_comment.created` | Approval gate (`/approve`); `apm-msg` ingestion |
| `pull_request.opened` | PR-driven pipelines (v1+v2) |
| `pull_request.labeled` | PR-driven pipelines (v1+v2) |
| `pull_request.synchronize` | PR-driven pipelines (v1+v2) |
| `pull_request_review_comment.created` | (Reserved) |
| `workflow_run.completed` | Resume after agent dispatch |
| `repository_dispatch` | Alert→issue, manual orchestration |
| `workflow_dispatch` | Manual replay (exempt from dedup, FR-026) |

---

## 5. Comment-Thread Etiquette

The orchestrator owns three (and only three) comment shapes on a triggering
issue / PR (ADR-004, FR-015):

1. **Audit comments** — contain the embedded HTML payload
   `<!-- apm-pipeline-state: { … } -->`. **Append-only**, **never edited**,
   **never deleted**. The authoritative state. Posted exactly once per state
   transition.
2. **Live-status comment (v2 only)** — contains the embedded HTML marker
   `<!-- apm-pipeline-status: {"runId":"<uuid>"} -->`. **Exactly one per active
   v2 run**, edited in place on every transition. Body MUST include the
   disclaimer `_Live view — authoritative state is the audit comments below._`.
3. **Agent invocation summary comments** — author is the agent (not the
   orchestrator), final element is exactly one fenced ` ```apm-msg ``` ` block.

No other orchestrator-authored shapes are permitted.

Human contributors and other agents are free to post regular comments; the
orchestrator ignores any comment lacking a state tag, status marker, or
recognised `apm-msg` block from a registered agent identity.

---

## 6. Rationale and Cross-References

- §VI of the constitution (Observable, Auditable Automation) is satisfied by
  the audit channel.
- ADR-004 supersedes ADR-002 to introduce the live-status channel.
- ADR-005 freezes the runtime kind allowlist.
- ADR-006 declares `src/` as the source of truth for the configs that
  reference the labels and outcomes above.
- ADR-007 §6 mandates that orchestrator-workflow failures themselves surface
  via an `outcome: orchestrator-failure` audit comment.

Updating this document REQUIRES updating any pipeline / orchestrator-source
identifier that references it in the same PR. The Reviewer Agent enforces
this (FR-024).
