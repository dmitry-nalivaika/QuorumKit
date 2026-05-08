# APM Agent Protocol — Canonical Regulation Document

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

### 1.6 `pipeline:*` — Pipeline opt-in selectors

| Label | Applied by | Effect |
|---|---|---|
| `pipeline:v2` | Triage Agent | Opt-in marker: routes the issue through `feature-pipeline-v2.yml` instead of the v1 default. Removed automatically when v2 graduates. |

---

## 2. `apm-msg` Outcomes

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

### Per-outcome `payload` schemas

`payload` is optional. When present, its shape SHOULD match the outcome:

- `success`: `{ "artefacts"?: string[], "links"?: string[] }`
- `fail`, `blocker`: `{ "failed_scenarios"?: string[], "details"?: string }`
- `spec_gap`: `{ "missing": string[], "ba_input_required": string }`
- `timeout`, `needs-human`, `runtime-error`, `protocol-violation`,
  `orchestrator-failure`: `{ "details"?: string, "actions_run_url"?: string }`

These shapes are advisory at the schema level (`payload` is `additionalProperties: true`)
because the regulation document is the human-curated source. CI lints
references at the *outcome name* level, not the payload shape.

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
- ADR-006 declares `.apm/` as the source of truth for the configs that
  reference the labels and outcomes above.
- ADR-007 §6 mandates that orchestrator-workflow failures themselves surface
  via an `outcome: orchestrator-failure` audit comment.

Updating this document REQUIRES updating any pipeline / orchestrator-source
identifier that references it in the same PR. The Reviewer Agent enforces
this (FR-024).
