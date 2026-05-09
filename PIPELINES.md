# APM Pipelines (v2)

> **TL;DR** — Drop a YAML file in `.apm/pipelines/`, label a GitHub issue, and the
> Orchestrator drives the right AI agents through your SDLC loop — including
> rework cycles, runtime selection, approval gates, and timeouts.

The Orchestrator is **schema-version 2** as of issue #44. v1 files still load via a
backward-compat adapter, but every shipped pipeline is now v2.

---

## How it works

```
GitHub event ─► .github/workflows/orchestrator.yml ─► engine/orchestrator/index.js
                                                            │
              ┌─────────────────────────────────────────────┤
              ▼                                             │
     pipeline-loader  ──► validates + normalises YAML       │
     router-v2       ──► matches event → pipeline           │
     runtime-registry─► resolves runtime per step           │
     agent-invoker-v2─► dispatches workflow_dispatch        │
              ▲                                             │
              │      (agent posts an apm-msg comment)       │
              │                                             ▼
     apm-msg-parser  ◄── identity check, schema check, outcome
              │
              ▼
     router-v2.resolveTransition  ──► next step (forward or backward)
              │
              ▼
     loop-budget.evaluate  ──► gate runaway loops
              │
              ▼
     state-manager  ──► append audit comment + upsert live-status
```

State is stored on the triggering issue/PR as **two channels** ([ADR-004]):

- **Audit channel** — `<!-- apm-pipeline-state: {…} -->` appended on every
  transition. Authoritative, append-only, tamper-evident.
- **Live-status channel** — single mutable comment that mirrors the latest
  state for humans. Re-derivable from the audit channel.

No external database. The orchestrator is fully restartable.

---

## Quick start

### 1. Install (greenfield or brownfield)

`scripts/init.sh` ships:

- `.github/workflows/orchestrator.yml` — the Actions entry point
- `.apm/pipelines/{feature,bug-fix,release}-pipeline.yml` — three v2 pipelines
- `.apm/runtimes.yml` — runtime registry (claude + copilot enabled)
- `.apm/agent-identities.yml` — login → agent slug map (FR-013)

### 2. Trigger a pipeline

Label any issue and the matching pipeline starts:

| Label combination | Pipeline |
|---|---|
| `triaged` + `type:feature` | `feature-pipeline` |
| `triaged` + `type:bug` | `bug-fix-pipeline` |
| `triaged` + `type:release` | `release-pipeline` |

The orchestrator posts a "Pipeline started" audit comment, resolves the runtime
for the entry step, and dispatches the agent.

### 3. Approve the release gate

Steps with `approval: required` pause until any user with `write`/`maintain`/`admin`
permission comments `/approve`. Times out after `approval_timeout_hours` (default 72).

---

## Built-in pipelines

| File | Trigger | Chain |
|---|---|---|
| `feature-pipeline.yml` | `triaged` + `type:feature` | `ba → architect? → dev → qa → reviewer → release[approve]` with QA→DEV and reviewer→BA backward edges |
| `bug-fix-pipeline.yml` | `triaged` + `type:bug` | `dev → qa → reviewer` with QA/reviewer→DEV backward edges |
| `release-pipeline.yml` | `triaged` + `type:release` | `qa → security → reviewer → release[approve]` with self-loops on failure |

The `architect` step in `feature-pipeline.yml` runs only when the issue also
carries the `needs:adr` label (`condition`).

---

## Pipeline YAML reference (v2)

```yaml
name: my-pipeline                  # unique identifier (matches the file)
schema_version: "2"                # required for v2

trigger:
  event: issues.labeled            # GitHub event . action
  labels: [triaged, type:feature]  # ALL must be present (case-sensitive)

entry: ba                          # step name to start at

loop_budget:                       # caps backward-edge spirals (FR-005)
  max_iterations_per_edge: 3
  max_total_steps: 30
  max_wallclock_minutes: 720

steps:
  - name: ba                       # step name (referenced by transitions)
    agent: ba-agent                # agent slug → workflow file lookup
    timeout_minutes: 60            # FR-019, ADR-007 §4

  - name: architect
    agent: architect-agent
    condition: "labels.includes('needs:adr')"
    runtime: claude-default        # optional override of registry default

  - name: release
    agent: release-agent
    approval: required             # pause for /approve
    approval_timeout_hours: 72
    timeout_minutes: 30

transitions:
  - { from: ba,        outcome: success,    to: architect }
  - { from: architect, outcome: success,    to: dev }
  - { from: qa,        outcome: fail,       to: dev }    # backward edge
  - { from: reviewer,  outcome: spec_gap,   to: ba }     # cross-chain rework
```

### Allowed `outcome` values

Declared in `docs/AGENT_PROTOCOL.md` §2 (single source of truth):

`success`, `fail`, `blocker`, `spec_gap`, `timeout`, `needs-human`,
`runtime-error`, `protocol-violation`, `orchestrator-failure`.

Any pipeline referencing an outcome **not** declared there is rejected by
`regulation-lint` (FR-014, FR-024).

### Forward vs backward edges

A transition is **backward** iff the target step's index in `steps[]` is
≤ the source step's index. Backward edges count against
`max_iterations_per_edge`; forward edges don't. The wallclock and
total-step ceilings apply to all transitions.

---

## The `apm-msg` protocol

Agents end every step by posting a comment whose final fenced block is the
machine-readable result:

````markdown
The QA suite found 2 regressions and a missing acceptance criterion.

```apm-msg
{
  "version": "2",
  "runId": "550e8400-e29b-41d4-a716-446655440000",
  "step": "qa",
  "agent": "qa-agent",
  "iteration": 1,
  "outcome": "fail",
  "summary": "2 regressions in cart checkout; missing AC for guest flow.",
  "payload": { "failed_tests": ["cart.spec.ts:42", "guest.spec.ts:17"] }
}
```
````

The orchestrator:

1. Verifies the comment author maps to the active step's agent (FR-013, via
   `.apm/agent-identities.yml`). Comments from unmapped logins are ignored.
2. Validates the JSON against `apm-msg.schema.json`. Malformed → `protocol-violation`.
3. Resolves the transition for `(currentStep, outcome)`.
4. Increments the per-edge counter if backward, evaluates loop budget.
5. Appends an audit state and dispatches the next agent (or stops).

Full schema and worked examples in [`docs/AGENT_PROTOCOL.md`](docs/AGENT_PROTOCOL.md).

---

## Runtime registry (FR-007/008, [ADR-005])

`.apm/runtimes.yml` declares the named runtimes available to pipelines:

```yaml
default_runtime: copilot-default
agent_defaults:
  qa-agent: claude-default        # use claude for QA across all pipelines

runtimes:
  copilot-default:
    kind: copilot                 # only `claude` and `copilot` are enabled
    endpoint: https://api.github.com
    credential_ref: GITHUB_TOKEN  # secret name — never an inline value

  claude-default:
    kind: claude
    endpoint: https://api.anthropic.com
    credential_ref: ANTHROPIC_API_KEY
```

**Resolution precedence per step**: `step.runtime` → `agent_defaults[agent]`
→ `default_runtime`.

`azure-openai`, `bedrock`, `ollama`, `custom` are **reserved** kinds — the
validator emits `RUNTIME_KIND_NOT_ENABLED` until each gets its own ADR.

---

## Adding your own pipeline

1. Drop `.apm/pipelines/my-pipeline.yml` (v2 schema; copy any built-in as a
   starting point).
2. Make sure every label in `trigger.labels`, every `outcome` in `transitions`,
   and every agent slug in `steps` is declared in `docs/AGENT_PROTOCOL.md` —
   otherwise `regulation-lint` will fail in CI.
3. Run the validator locally:

   ```zsh
   node engine/orchestrator/pipeline-validator-cli.js .apm/pipelines/my-pipeline.yml
   node engine/orchestrator/regulation-lint.js
   ```

4. Commit. The orchestrator picks up new pipelines on the next event — no
   restart needed.

---

## CI gates (required status checks on `main`)

| Check | Command | Reference |
|---|---|---|
| `pipeline-validator` | `node engine/orchestrator/pipeline-validator-cli.js` | FR-020 |
| `verify-mirror` | `bash scripts/verify-mirror.sh` | [ADR-006] |
| `orchestrator-tests` | `cd engine/orchestrator && npm test` | FR-023 |
| `regulation-lint` | `node engine/orchestrator/regulation-lint.js` | FR-014 |

All four are wired into `.github/workflows/quality.yml`.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| No pipeline fires | Issue is missing one of the trigger labels; or `orchestrator.yml` is not installed |
| `RUNTIME_KIND_NOT_ENABLED` | Pipeline references a reserved kind; pick `claude` or `copilot` |
| `protocol-violation` audit comment | Agent's apm-msg block is missing, malformed, or has the wrong `runId`/`step`/`iteration` |
| `loop-budget-exceeded` label applied | Backward edge crossed `max_iterations_per_edge` — humans must intervene |
| Step stuck `awaiting-approval` | Post `/approve`; requires `write`+ permission |
| Step stuck `awaiting-agent` past `timeout_minutes` | Next event arrival auto-synthesises a `timeout` outcome (FR-019) |
| Agent comment ignored | Author login isn't in `.apm/agent-identities.yml` for that agent slug |
| `dedup hit … skipping` in logs | Same GitHub delivery received twice — by design (FR-016, FR-026) |

---

## See also

- `docs/AGENT_PROTOCOL.md` — labels, outcomes, transition triggers (regulation)
- `docs/architecture/adr-004-orchestrator-state-comment-model-v2.md` — two-channel state
- `docs/architecture/adr-005-pluggable-runtime-registry-interface.md` — runtime kinds
- `docs/architecture/adr-006-dual-runtime-source-of-truth-and-sync.md` — `.apm/` is canonical
- `docs/architecture/adr-007-orchestrator-github-actions-substrate-contract.md` — concurrency, dedup, timeouts
- `specs/044-orchestrator-v2-design/spec.md` — full v2 functional spec

[ADR-004]: docs/architecture/adr-004-orchestrator-state-comment-model-v2.md
[ADR-005]: docs/architecture/adr-005-pluggable-runtime-registry-interface.md
[ADR-006]: docs/architecture/adr-006-dual-runtime-source-of-truth-and-sync.md
