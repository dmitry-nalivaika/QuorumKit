# Implementation Plan: Autonomous Agent Orchestration System — Issue #2

## Constitution Check

| Rule | How this plan satisfies it |
|------|---------------------------|
| No direct commits to main | Feature branch: `002-autonomous-agent-orchestration` |
| Tests before implementation | TDD workflow enforced per task; `tests/orchestrator/` written before `scripts/orchestrator/` |
| No hardcoded secrets | All tokens via `GITHUB_TOKEN` env var; `DASHBOARD_WEBHOOK_URL` via GHA secret |
| Input validation at boundaries | Pipeline YAML validated against JSON schema on load; webhook payloads validated before processing |
| Data access scoping | N/A — no user auth; all GitHub API calls use scoped token passed via environment |
| Coverage threshold | 80% line coverage required; approach: unit tests with test-double GitHub client + integration snapshot tests |

---

## Architecture Overview

The Orchestrator is implemented as a **stateless GitHub Actions workflow** that calls a
Node.js script (`scripts/orchestrator/index.js`). All state lives in GitHub Issue/PR
comments (ADR-002). The script is fully unit-testable without live GitHub API calls.

```
GitHub Event
    │
    ▼
.github/workflows/orchestrator.yml   ← GHA entry point (all event types)
    │
    ▼
scripts/orchestrator/index.js        ← main entry point
    ├── pipeline-loader.js           ← load + validate .apm/pipelines/*.yml
    ├── router.js                    ← match event → pipeline rule
    ├── state-manager.js             ← read/write state in GitHub comments
    ├── agent-invoker.js             ← dispatch to claude / copilot runtime
    ├── approval-gate.js             ← handle /approve, timeout checks
    └── github-client.js             ← GitHub REST wrapper (retry, pagination)

dashboard/server.js                  ← add POST /webhook/pipeline-event endpoint

templates/.apm/pipelines/           ← 3 default pipeline YAML templates
scripts/init.sh                      ← install pipeline templates
tests/orchestrator/                  ← unit tests (vitest)
```

---

## Module Responsibilities

### `github-client.js`
- Thin wrapper around GitHub REST API using `@octokit/rest`
- Implements retry with exponential back-off (max 3 attempts, FR-005)
- Respects `Retry-After` headers
- All methods accept owner/repo/token — no global state

### `pipeline-loader.js`
- Reads all `*.yml` files from `.apm/pipelines/`
- Validates each against `schemas/pipeline.schema.json` using `ajv`
- Returns `{ valid: Pipeline[], errors: ValidationError[] }` — invalid files are skipped, not fatal

### `router.js`
- Stateless function: `matchEvent(event, pipelines) → Pipeline | null`
- Evaluates `trigger.event`, `trigger.labels`, `trigger.state` predicates
- Returns `null` + logs `no-rule-match` when no pipeline matches (FR-014)

### `state-manager.js`
- `loadState(issueNumber)` — paginate all comments, find latest `<!-- apm-pipeline-state: {...} -->`, parse JSON
- `saveState(issueNumber, state)` — post a new comment with updated state (immutable history)
- `postAuditEntry(issueNumber, message)` — post human-readable comment

### `agent-invoker.js`
- Reads `aiTool` from `.apm-project.json` (default: `copilot`)
- `copilot` path: triggers `copilot-agent-{name}.yml` via `workflow_dispatch`
- `claude` path: triggers `agent-{name}.yml` via `workflow_dispatch`
- Validates `aiTool`; marks run `failed` if unrecognised (FR-011)

### `approval-gate.js`
- `checkApprovalComment(comment, issueNumber)` — detect `/approve` command
- `verifyPermission(username)` — call `GET /repos/{owner}/{repo}/collaborators/{username}/permission`
- `checkTimeout(approvalGate)` — compare `timeoutAt` to `now`

### `index.js`
- Orchestrates the above modules
- Entry point for GHA workflow: reads `GITHUB_EVENT_NAME`, `GITHUB_EVENT_PATH`
- Main loop: load pipelines → route event → load state → advance pipeline → save state → post audit

---

## Pipeline YAML Schema

```yaml
# .apm/pipelines/feature-pipeline.yml
name: feature-pipeline
version: "1"
trigger:
  event: issues.opened        # github event type
  labels:                     # ALL must be present
    - type:feature
steps:
  - name: triage
    agent: triage-agent
  - name: ba
    agent: ba-product-agent
  - name: architect
    agent: architect-agent
    condition: "labels contains 'needs:adr'"
  - name: dev
    agent: developer-agent
  - name: qa
    agent: qa-test-agent
  - name: reviewer
    agent: reviewer-agent
  - name: release
    agent: release-agent
    approval: required
    approval_timeout_hours: 72
```

---

## Dashboard Integration (FR-007)

Add `POST /webhook/pipeline-event` to `dashboard/server.js`:
- Accepts `{ runId, pipelineName, status, currentStepIndex, steps, updatedAt }`
- Validates payload shape
- Broadcasts over existing WebSocket channel as `{ type: 'pipeline-event', payload }`
- Returns `204` on success, `400` on invalid payload

---

## File Layout

```
scripts/
  orchestrator/
    index.js
    pipeline-loader.js
    router.js
    state-manager.js
    agent-invoker.js
    approval-gate.js
    github-client.js
    schemas/
      pipeline.schema.json
templates/
  .apm/
    pipelines/
      feature-pipeline.yml
      bug-fix-pipeline.yml
      release-pipeline.yml
templates/github/workflows/
  orchestrator.yml
tests/
  orchestrator/
    router.test.js
    pipeline-loader.test.js
    state-manager.test.js
    approval-gate.test.js
    agent-invoker.test.js
    index.test.js
    fixtures/
      valid-pipeline.yml
      invalid-pipeline.yml
      feature-pipeline.yml
```

---

## Init.sh Changes

Add a `install_pipelines()` function that copies `templates/.apm/pipelines/*.yml`
to `.apm/pipelines/` in the target project. Called from all three AI mode cases.
