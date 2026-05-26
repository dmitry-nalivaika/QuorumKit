# QuorumKit Pipelines (v2)

> **TL;DR** — Add a `src/pipelines/` YAML file, label a GitHub issue, and the
> Orchestrator drives the right AI agents through your SDLC loop — including
> rework cycles, runtime selection, approval gates, and automatic timeouts.

A **pipeline** is a YAML file that declares which agents run in what order,
under what conditions, and how failure causes rework rather than a hard stop.
The **Orchestrator** is the GitHub Actions engine that executes pipelines by
reading issue events, resolving runtimes, dispatching agents, and recording
every state transition as an audit trail directly on the issue.

The current schema is **version 2** (introduced in issue #44). Version 1 files
still load via a backward-compatibility adapter, but all shipped pipelines are v2.

---

## How the Orchestrator works

```
GitHub event ─► .github/workflows/orchestrator.yml ─► engine/orchestrator/index.js
                                                              │
               ┌──────────────────────────────────────────────┤
               ▼                                              │
      pipeline-loader  ──► validates + normalises YAML        │
      router-v2        ──► matches event → pipeline           │
      runtime-registry ──► resolves runtime per step          │
      agent-invoker-v2 ──► dispatches workflow_dispatch       │
               ▲                                              │
               │     (agent posts an apm-msg comment)         │
               │                                              ▼
      apm-msg-parser   ◄── identity check, schema check, outcome
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

The Orchestrator stores all state on the triggering issue or PR as two
complementary channels ([ADR-004]):

- **Audit channel** — an `<!-- apm-pipeline-state: {…} -->` hidden comment
  appended on every transition. Append-only and tamper-evident; this is the
  authoritative record.
- **Live-status channel** — a single mutable comment showing the current
  state in human-readable form. Fully re-derivable from the audit channel.

Because state lives on the issue, the Orchestrator requires no external
database and is fully restartable from any point.

---

## Quick start

### 1. Install

`scripts/init.sh` installs everything the Orchestrator needs:

- `.github/workflows/orchestrator.yml` — the GitHub Actions entry point
- `src/pipelines/feature-pipeline.yml`, `bug-fix-pipeline.yml`, `release-pipeline.yml` — three ready-to-use v2 pipelines
- `src/runtimes.yml` — runtime registry (Claude and Copilot enabled by default)
- `src/agent-identities.yml` — maps GitHub login names to agent slugs (FR-013)

See [INIT.md](INIT.md) for the full setup guide.

### 2. Trigger a pipeline

Apply labels to any issue and the matching pipeline starts automatically:

| Labels (all must be present) | Pipeline |
|------------------------------|----------|
| `triaged` + `type:feature`   | `feature-pipeline` |
| `triaged` + `type:bug`       | `bug-fix-pipeline` |
| `triaged` + `type:release`   | `release-pipeline` |

The Orchestrator posts a "Pipeline started" audit comment, resolves the
runtime for the entry step, and dispatches the first agent.

### 3. Approve a release gate

Steps with `approval: required` pause the pipeline and apply
`status:awaiting-approval` to the issue. Any collaborator with `write`,
`maintain`, or `admin` permission unblocks the pipeline by commenting:

```
/approve
```

If no approval arrives within `approval_timeout_hours` (default: 72), the
Orchestrator synthesises a `timeout` outcome and transitions accordingly.

---

## Built-in pipelines

| Pipeline file | Trigger labels | Step chain |
|---------------|----------------|------------|
| `feature-pipeline.yml` | `triaged` + `type:feature` | `ba → architect¹ → dev → qa → reviewer → release` ² |
| `bug-fix-pipeline.yml` | `triaged` + `type:bug`     | `dev → qa → reviewer` ³ |
| `release-pipeline.yml` | `triaged` + `type:release` | `qa → security → reviewer → release` ⁴ |

¹ The `architect` step runs only when the issue also carries `needs:adr` (`condition` field).  
² `release` requires `/approve`. QA and Reviewer can loop back to Dev; Reviewer can loop back to BA.  
³ QA and Reviewer can loop back to Dev.  
⁴ `release` requires `/approve`. All steps self-loop on failure.

---

## Pipeline YAML reference (v2)

```yaml
name: feature-pipeline             # unique identifier — must match the file name (without .yml)
schema_version: "2"                # required; omit and the loader rejects the file

trigger:
  event: issues.labeled            # GitHub event type and action, dot-separated
  labels: [triaged, type:feature]  # ALL labels must be present simultaneously (case-sensitive)

entry: ba                          # name of the first step to execute

loop_budget:                       # prevents runaway rework cycles (FR-005)
  max_iterations_per_edge: 3       # how many times a single backward edge can fire
  max_total_steps: 30              # total step dispatches across the entire run
  max_wallclock_minutes: 720       # hard wall-clock cap (12 hours)

steps:
  - name: ba                       # step name — referenced by transitions and audit comments
    agent: ba-agent                # agent slug → resolves to a workflow file in .github/workflows/
    timeout_minutes: 60            # per-step timeout; synthesises `timeout` outcome on expiry (FR-019)

  - name: architect
    agent: architect-agent
    condition: "labels.includes('needs:adr')"  # step is skipped unless this evaluates to true
    timeout_minutes: 60
    runtime: claude-default        # optional: overrides the registry default for this step only

  - name: release
    agent: release-agent
    approval: required             # pipeline pauses here until a collaborator posts /approve
    approval_timeout_hours: 72     # synthesises `timeout` if no approval arrives within 72 h
    timeout_minutes: 30

transitions:
  # Forward edges (do not count against loop budget)
  - { from: ba,       outcome: success,    to: architect }
  - { from: architect,outcome: success,    to: dev }
  - { from: dev,      outcome: success,    to: qa }
  - { from: qa,       outcome: success,    to: reviewer }

  # Backward edges (each fires count against max_iterations_per_edge)
  - { from: qa,       outcome: fail,       to: dev }     # QA failure → rework
  - { from: reviewer, outcome: spec_gap,   to: ba }      # spec gap → back to start
```

### Allowed `outcome` values

`docs/AGENT_PROTOCOL.md` is the single source of truth for valid outcomes:

| Outcome | Meaning |
|---------|---------|
| `success` | Step completed successfully |
| `fail` | Step found issues; rework required |
| `blocker` | Hard blocker; cannot proceed without human resolution |
| `spec_gap` | Specification is incomplete or ambiguous |
| `timeout` | Step did not complete within `timeout_minutes` |
| `needs-human` | Agent requires human judgment to continue |
| `runtime-error` | Unhandled error in the agent's execution environment |
| `protocol-violation` | Agent posted a malformed or unauthorised `apm-msg` |
| `orchestrator-failure` | Internal Orchestrator error |

Any pipeline referencing an outcome not declared in `AGENT_PROTOCOL.md` is
rejected by `regulation-lint` at CI time (FR-014, FR-024).

### Forward vs backward edges

A transition is **backward** when the target step appears at the same position
or earlier in the `steps` list than the source step. Backward edges increment
the `max_iterations_per_edge` counter for that specific edge. Forward edges do
not. The `max_total_steps` and `max_wallclock_minutes` ceilings apply to all
transitions regardless of direction.

---

## The `apm-msg` protocol

**apm-msg** (Agent Protocol Message) is the machine-readable signal every agent
posts at the end of its step. The Orchestrator reads the last fenced `apm-msg`
block in any new issue comment:

````markdown
The QA suite found 2 regressions and a missing acceptance criterion.

```apm-msg
{
  "version": "2",
  "runId": "550e8400-e29b-41d4-a716-446655440000",  // matches the run initiated by the Orchestrator
  "step": "qa",                                       // must match the currently active step
  "agent": "qa-agent",
  "iteration": 1,                                     // increments on each backward-edge rework cycle
  "outcome": "fail",
  "summary": "2 regressions in cart checkout; missing AC for guest flow.",
  "payload": { "failed_tests": ["cart.spec.ts:42", "guest.spec.ts:17"] }
}
```
````

When a new comment arrives, the Orchestrator:

1. **Verifies identity** — confirms the comment author's login is mapped to the
   active step's agent in `src/agent-identities.yml` (FR-013). Comments from
   unmapped logins are silently ignored.
2. **Validates the message** — checks the JSON against `apm-msg.schema.json`.
   Malformed or mismatched messages produce a `protocol-violation` audit entry.
3. **Resolves the transition** — looks up `(currentStep, outcome)` in the
   pipeline's `transitions` list.
4. **Evaluates the loop budget** — increments the per-edge counter for backward
   transitions and checks all three budget ceilings.
5. **Advances the pipeline** — appends an audit state comment and dispatches
   the next agent, or terminates the run if a budget or terminal state is reached.

Full schema and worked examples: [AGENT_PROTOCOL.md](AGENT_PROTOCOL.md).

---

## Runtime registry

`src/runtimes.yml` ([ADR-005]) declares the named runtimes available to
pipelines. The Orchestrator resolves the runtime for each step using this
precedence order:

1. `step.runtime` — explicit override on the step
2. `agent_defaults[agent-slug]` — per-agent default in `runtimes.yml`
3. `default_runtime` — the global fallback

```yaml
default_runtime: copilot-default   # used when no step or agent override matches

# Per-agent defaults (FR-008). Override here to use Claude for specific agents.
# Example: qa-agent: claude-default
agent_defaults: {}

runtimes:
  copilot-default:
    kind: copilot                  # only `claude` and `copilot` are enabled in v2
    endpoint: https://models.github.ai/inference
    credential_ref: GITHUB_TOKEN   # referenced by name; the Orchestrator reads process.env at runtime

  claude-default:
    kind: claude
    endpoint: https://api.anthropic.com/v1
    credential_ref: ANTHROPIC_API_KEY
```

`azure-openai`, `bedrock`, `ollama`, and `custom` are **reserved** kinds. The
validator emits `RUNTIME_KIND_NOT_ENABLED` for any pipeline that references one
until a per-kind ADR is merged ([ADR-005]).

---

## Adding your own pipeline

1. Copy any built-in pipeline as a starting point:

   ```zsh
   cp src/pipelines/feature-pipeline.yml src/pipelines/my-pipeline.yml
   ```

2. Edit `my-pipeline.yml`. Confirm that every label in `trigger.labels`, every
   `outcome` in `transitions`, and every agent slug in `steps` is declared in
   `docs/AGENT_PROTOCOL.md` — otherwise `regulation-lint` fails in CI.

3. Validate locally before pushing:

   ```zsh
   # Validate the pipeline schema and all referenced identifiers
   node engine/orchestrator/pipeline-validator-cli.js src/pipelines/my-pipeline.yml

   # Check all pipelines against AGENT_PROTOCOL.md (regulation lint)
   node engine/orchestrator/regulation-lint.js
   ```

   A clean run produces no output and exits `0`.

4. Commit and push. The Orchestrator picks up new pipelines on the next
   qualifying event — no restart or redeployment required.

---

## CI gates

All four checks are required status checks on `main`, wired into
`.github/workflows/quality.yml`:

| Check | Command | Enforces |
|-------|---------|----------|
| `pipeline-validator` | `node engine/orchestrator/pipeline-validator-cli.js` | FR-020 — schema validity |
| `regulation-lint`    | `node engine/orchestrator/regulation-lint.js`         | FR-014 — AGENT_PROTOCOL.md compliance |
| `orchestrator-tests` | `cd engine/orchestrator && npm test`                  | FR-023 — unit + integration tests |
| `verify-mirror`      | `bash scripts/verify-mirror.sh`                       | [ADR-006] — `src/` is canonical |

Run all four locally with:

```zsh
bash scripts/quality-check.sh
```

---

## Troubleshooting

| Symptom | Cause and fix |
|---------|---------------|
| No pipeline fires on label | Issue is missing one of the required `trigger.labels`; confirm all labels are applied. Also verify `orchestrator.yml` is present in `.github/workflows/`. |
| `RUNTIME_KIND_NOT_ENABLED` error | Pipeline references a reserved runtime kind. Change it to `claude` or `copilot`. |
| `protocol-violation` audit comment | The agent's `apm-msg` block is missing, malformed, or has a mismatched `runId`, `step`, or `iteration`. Check the agent's workflow log. |
| `status:loop-budget-exceeded` label applied | A backward edge crossed `max_iterations_per_edge`. Human intervention is required; increase the budget in the pipeline YAML or resolve the underlying issue manually. |
| Step stuck at `status:awaiting-approval` | Post `/approve` on the issue. Requires `write`, `maintain`, or `admin` permission on the repository. |
| Step stuck at `status:awaiting-agent` past `timeout_minutes` | The next GitHub event auto-synthesises a `timeout` outcome (FR-019). If no event is imminent, re-trigger by adding a comment or label. |
| Agent comment ignored | The comment author's login is not listed in `src/agent-identities.yml` for that agent slug. Add the login or correct the agent's workflow to post under the expected identity. |
| `dedup hit … skipping` in workflow logs | The same GitHub webhook delivery was received more than once. This is expected behaviour — the Orchestrator deduplicates by delivery ID (FR-016, FR-026). |

---

## Related topics

| Resource | What it covers |
|----------|---------------|
| [AGENT_PROTOCOL.md](AGENT_PROTOCOL.md) | Canonical list of labels, outcomes, and transition triggers |
| [INIT.md](INIT.md) | Installing the Orchestrator and initial setup |
| [LOCAL_PIPELINES.md](LOCAL_PIPELINES.md) | Running pipelines locally without GitHub Actions |
| [ADR-004][ADR-004] | Two-channel state storage model |
| [ADR-005][ADR-005] | Pluggable runtime registry interface |
| [ADR-006][ADR-006] | `src/` as the canonical runtime source of truth |
| [ADR-007](architecture/adr-007-orchestrator-github-actions-substrate-contract.md) | Concurrency, deduplication, and timeout contracts |
| [specs/044-orchestrator-v2-design/spec.md](../specs/044-orchestrator-v2-design/spec.md) | Full v2 functional specification |

[ADR-004]: architecture/adr-004-orchestrator-state-comment-model-v2.md
[ADR-005]: architecture/adr-005-pluggable-runtime-registry-interface.md
[ADR-006]: architecture/adr-006-dual-runtime-source-of-truth-and-sync.md
