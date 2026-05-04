# APM — Autonomous Agent Pipelines

> **TL;DR** — Drop a YAML file in `.apm/pipelines/`, label a GitHub Issue, and the Orchestrator automatically chains your AI agents from triage through to release.

---

## How It Works

```
GitHub Event (issue opened, comment posted, PR merged…)
        │
        ▼
.github/workflows/orchestrator.yml   ← fires on every relevant event
        │
        ▼
scripts/orchestrator/index.js        ← loads pipelines, matches event, advances state
        │
        ├─ pipeline-loader.js        ← reads .apm/pipelines/*.yml, validates schema
        ├─ router.js                 ← picks the right pipeline for this event
        ├─ state-manager.js          ← saves current step in a GitHub comment
        ├─ agent-invoker.js          ← fires the next agent via workflow_dispatch
        ├─ approval-gate.js          ← waits for /approve before continuing
        └─ github-client.js          ← GitHub REST with auto-retry
```

State is stored as an `<!-- apm-pipeline-state: {...} -->` HTML comment on the Issue.
Every run appends a new comment — full immutable audit trail, no external DB needed.

---

## Quick Start

### 1 — Install the orchestrator workflow (first-time setup)

If you used `scripts/init.sh` this is already done. Otherwise copy manually:

```bash
cp templates/github/workflows/orchestrator.yml .github/workflows/orchestrator.yml
cp -r templates/.apm/pipelines .apm/pipelines
```

Add these secrets to your GitHub repository (`Settings → Secrets → Actions`):

| Secret | Value |
|--------|-------|
| `GITHUB_TOKEN` | Auto-provided by GitHub Actions |
| `DASHBOARD_WEBHOOK_URL` | Optional — URL of your running dashboard, e.g. `http://your-server:4000/webhook/pipeline-event` |

### 2 — Trigger a pipeline

Open a GitHub Issue and add the label that matches a pipeline trigger:

| Label on Issue | Pipeline fired |
|----------------|----------------|
| `type:feature` | `feature-pipeline.yml` (triage → ba → architect → dev → qa → reviewer → release) |
| `type:bug` | `bug-fix-pipeline.yml` (triage → dev → qa → reviewer) |
| `type:release` | `release-pipeline.yml` (qa → security → reviewer → release) |

The Orchestrator posts an audit comment, then dispatches the first agent automatically.

### 3 — Watch progress

Each step posts a comment like:

```
🤖 APM Orchestrator
Pipeline:  feature-pipeline  |  Run: run-abc123
Step 2/7:  ba-product-agent  →  status: running
```

The dashboard (if running) shows a live `pipeline-event` card on the Kanban board.

### 4 — Approve a gated step

Steps with `approval: required` pause and post:

```
⏸ Awaiting approval to proceed to: release-agent
Post /approve to continue (timeout: 72 h)
```

Any collaborator with **write / maintain / admin** permission comments `/approve` and the pipeline resumes.

---

## Pipeline YAML Reference

```yaml
name: my-pipeline          # unique identifier (matches filename)
version: "1"               # schema version — always "1" for now

trigger:
  event: issues.opened     # GitHub event + action, dot-separated
                           # e.g. issues.labeled, pull_request.opened,
                           #      issue_comment.created, workflow_run.completed
  labels:                  # ALL listed labels must be present on the issue/PR
    - type:feature
  state: open              # optional: issue/PR state filter (open | closed)

steps:
  - name: triage                  # human-readable step name (unique in pipeline)
    agent: triage-agent           # matches workflow filename:
                                  #   copilot → copilot-agent-triage-agent.yml
                                  #   claude  → agent-triage-agent.yml

  - name: architect
    agent: architect-agent
    condition: "labels.includes('needs:adr')"   # JS expression; step skipped if false

  - name: release
    agent: release-agent
    approval: required            # pipeline pauses here until /approve
    approval_timeout_hours: 72    # auto-fail after this many hours (default: 48)
```

### Supported `trigger.event` values

| Value | Fires when |
|-------|-----------|
| `issues.opened` | New issue created |
| `issues.labeled` | Label added to issue |
| `issues.closed` | Issue closed |
| `issue_comment.created` | Comment posted on issue or PR |
| `pull_request.opened` | PR opened |
| `pull_request.closed` | PR closed (merged or not) |
| `workflow_run.completed` | A child workflow finishes |

---

## Built-in Pipelines

### `feature-pipeline.yml`
Triggered by: `issues.opened` + label `type:feature`

```
triage-agent → ba-product-agent → architect-agent* → developer-agent
    → qa-test-agent → reviewer-agent → [APPROVE] → release-agent
```
`*` architect step is conditional on label `needs:adr`

---

### `bug-fix-pipeline.yml`
Triggered by: `issues.opened` + label `type:bug`

```
triage-agent → developer-agent → qa-test-agent → reviewer-agent
```

---

### `release-pipeline.yml`
Triggered by: `issues.opened` + label `type:release`

```
qa-test-agent → security-agent → reviewer-agent → [APPROVE] → release-agent
```

---

## Adding a Custom Pipeline

1. Create `.apm/pipelines/my-pipeline.yml` (copy a template as a starting point)
2. Set a unique `name` and the `trigger` that should fire it
3. List your `steps` in order
4. Push — the orchestrator picks up new pipelines on the next run, no restart needed

**Example — documentation-only pipeline:**

```yaml
name: docs-pipeline
version: "1"

trigger:
  event: issues.labeled
  labels:
    - type:docs

steps:
  - name: docs
    agent: docs-agent

  - name: reviewer
    agent: reviewer-agent
```

---

## State Storage

All pipeline state is stored as hidden HTML comments in the Issue timeline:

```html
<!-- apm-pipeline-state: {"runId":"run-abc","pipeline":"feature-pipeline","currentStep":2,"status":"running","updatedAt":"2026-05-04T10:00:00Z"} -->
```

- Every `saveState` call **appends a new comment** — nothing is edited or deleted
- This gives a full, tamper-evident audit log
- The Orchestrator always reads the **most recent** state comment

---

## Dashboard Integration

When `DASHBOARD_WEBHOOK_URL` is set, each state transition POSTs:

```json
POST /webhook/pipeline-event
{
  "runId": "run-abc123",
  "pipeline": "feature-pipeline",
  "status": "running",
  "currentStep": 2,
  "steps": ["triage", "ba", "architect", "dev", "qa", "reviewer", "release"],
  "updatedAt": "2026-05-04T10:00:00Z"
}
```

The dashboard broadcasts this as a `pipeline-event` WebSocket message and shows it on the Kanban board in real time.

---

## Dual AI Runtime

The `aiTool` field in `.apm-project.json` (set via the dashboard ⚙ Settings) controls which workflow is triggered per step:

| `aiTool` | Workflow dispatched |
|----------|-------------------|
| `copilot` (default) | `copilot-agent-{agent-name}.yml` |
| `claude` | `agent-{agent-name}.yml` |

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| No pipeline fires on new issue | Check the issue has the correct label; check `orchestrator.yml` is in `.github/workflows/` |
| Step stuck at `awaiting-approval` | Comment `/approve` on the issue (needs write/maintain/admin permission) |
| Step skipped unexpectedly | Check the `condition` expression — it must evaluate to `true` |
| `INVALID_AI_TOOL` error in comments | Set `aiTool` to `copilot` or `claude` in dashboard Settings |
| Orchestrator not running | Check Actions tab → `APM Orchestrator` workflow; ensure `GITHUB_TOKEN` has `issues: write` and `actions: write` permissions |
| Pipeline YAML rejected | Run `node scripts/orchestrator/pipeline-loader.js` locally — it logs schema validation errors |
