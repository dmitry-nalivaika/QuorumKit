# Tasks: Autonomous Agent Orchestration — Issue #2

## Status Legend
- [ ] Not started
- [x] Complete

---

## T-01 — Project scaffolding & test harness
- [x] Create `scripts/orchestrator/` directory with `package.json` (type: module, vitest)
- [x] Create `tests/orchestrator/` directory with fixture files
- [x] Add `vitest` and `ajv` and `@octokit/rest` to `scripts/orchestrator/package.json`

## T-02 — Pipeline JSON schema
- [x] Write `scripts/orchestrator/schemas/pipeline.schema.json`
- [x] Write `tests/orchestrator/pipeline-loader.test.js` (red)

## T-03 — `github-client.js` — GitHub API wrapper with retry
- [x] Write `tests/orchestrator/github-client.test.js` (red)
- [x] Implement `scripts/orchestrator/github-client.js` (green)

## T-04 — `pipeline-loader.js` — load & validate pipeline YAML
- [x] Implement `scripts/orchestrator/pipeline-loader.js` (green → pass T-02 tests)

## T-05 — `router.js` — event-to-pipeline matching
- [x] Write `tests/orchestrator/router.test.js` (red)
- [x] Implement `scripts/orchestrator/router.js` (green)

## T-06 — `state-manager.js` — GitHub comment state storage
- [x] Write `tests/orchestrator/state-manager.test.js` (red)
- [x] Implement `scripts/orchestrator/state-manager.js` (green)

## T-07 — `approval-gate.js` — human-in-the-loop gate
- [x] Write `tests/orchestrator/approval-gate.test.js` (red)
- [x] Implement `scripts/orchestrator/approval-gate.js` (green)

## T-08 — `agent-invoker.js` — dual-AI runtime dispatch
- [x] Write `tests/orchestrator/agent-invoker.test.js` (red)
- [x] Implement `scripts/orchestrator/agent-invoker.js` (green)

## T-09 — `index.js` — main orchestrator entry point
- [x] Write `tests/orchestrator/index.test.js` (red)
- [x] Implement `scripts/orchestrator/index.js` (green)

## T-10 — GHA workflow: `orchestrator.yml`
- [x] Create `templates/github/workflows/orchestrator.yml`
- [x] Handles: `issues`, `issue_comment`, `pull_request`, `workflow_run` events
- [x] Passes `GITHUB_TOKEN`, `DASHBOARD_WEBHOOK_URL` to script

## T-11 — Pipeline templates (FR-012)
- [x] Create `templates/.apm/pipelines/feature-pipeline.yml`
- [x] Create `templates/.apm/pipelines/bug-fix-pipeline.yml`
- [x] Create `templates/.apm/pipelines/release-pipeline.yml` (with `approval: required` before release)

## T-12 — Dashboard webhook endpoint (FR-007)
- [x] Write `tests/orchestrator/dashboard-webhook.test.js` (red — integration test against server)
- [x] Add `POST /webhook/pipeline-event` to `dashboard/server.js` (green)

## T-13 — `init.sh` pipeline template installation (FR-012)
- [x] Add `install_pipelines()` to `scripts/init.sh`
- [x] Call it from claude, copilot, and both install paths

## T-14 — Run full test suite; confirm all pass
- [x] `npm test` inside `scripts/orchestrator/` — all green (40/40)
- [x] Manual smoke test: valid + invalid YAML loaded by pipeline-loader

## T-15 — Open PR
- [x] Commit all changes atomically per module
- [x] Push branch `002-autonomous-agent-orchestration`
- [x] Open PR with `.github/pull_request_template.md`
