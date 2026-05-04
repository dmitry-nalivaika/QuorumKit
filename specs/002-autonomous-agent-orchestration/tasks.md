# Tasks: Autonomous Agent Orchestration — Issue #2

## Status Legend
- [ ] Not started
- [x] Complete

---

## T-01 — Project scaffolding & test harness
- [ ] Create `scripts/orchestrator/` directory with `package.json` (type: module, vitest)
- [ ] Create `tests/orchestrator/` directory with fixture files
- [ ] Add `vitest` and `ajv` and `@octokit/rest` to `scripts/orchestrator/package.json`

## T-02 — Pipeline JSON schema
- [ ] Write `scripts/orchestrator/schemas/pipeline.schema.json`
- [ ] Write `tests/orchestrator/pipeline-loader.test.js` (red)

## T-03 — `github-client.js` — GitHub API wrapper with retry
- [ ] Write `tests/orchestrator/github-client.test.js` (red)
- [ ] Implement `scripts/orchestrator/github-client.js` (green)

## T-04 — `pipeline-loader.js` — load & validate pipeline YAML
- [ ] Implement `scripts/orchestrator/pipeline-loader.js` (green → pass T-02 tests)

## T-05 — `router.js` — event-to-pipeline matching
- [ ] Write `tests/orchestrator/router.test.js` (red)
- [ ] Implement `scripts/orchestrator/router.js` (green)

## T-06 — `state-manager.js` — GitHub comment state storage
- [ ] Write `tests/orchestrator/state-manager.test.js` (red)
- [ ] Implement `scripts/orchestrator/state-manager.js` (green)

## T-07 — `approval-gate.js` — human-in-the-loop gate
- [ ] Write `tests/orchestrator/approval-gate.test.js` (red)
- [ ] Implement `scripts/orchestrator/approval-gate.js` (green)

## T-08 — `agent-invoker.js` — dual-AI runtime dispatch
- [ ] Write `tests/orchestrator/agent-invoker.test.js` (red)
- [ ] Implement `scripts/orchestrator/agent-invoker.js` (green)

## T-09 — `index.js` — main orchestrator entry point
- [ ] Write `tests/orchestrator/index.test.js` (red)
- [ ] Implement `scripts/orchestrator/index.js` (green)

## T-10 — GHA workflow: `orchestrator.yml`
- [ ] Create `templates/github/workflows/orchestrator.yml`
- [ ] Handles: `issues`, `issue_comment`, `pull_request`, `workflow_run` events
- [ ] Passes `GITHUB_TOKEN`, `DASHBOARD_WEBHOOK_URL` to script

## T-11 — Pipeline templates (FR-012)
- [ ] Create `templates/.apm/pipelines/feature-pipeline.yml`
- [ ] Create `templates/.apm/pipelines/bug-fix-pipeline.yml`
- [ ] Create `templates/.apm/pipelines/release-pipeline.yml` (with `approval: required` before release)

## T-12 — Dashboard webhook endpoint (FR-007)
- [ ] Write `tests/orchestrator/dashboard-webhook.test.js` (red — integration test against server)
- [ ] Add `POST /webhook/pipeline-event` to `dashboard/server.js` (green)

## T-13 — `init.sh` pipeline template installation (FR-012)
- [ ] Add `install_pipelines()` to `scripts/init.sh`
- [ ] Call it from claude, copilot, and both install paths

## T-14 — Run full test suite; confirm all pass
- [ ] `npm test` inside `scripts/orchestrator/` — all green
- [ ] Manual smoke test: valid + invalid YAML loaded by pipeline-loader

## T-15 — Open PR
- [ ] Commit all changes atomically per module
- [ ] Push branch `002-autonomous-agent-orchestration`
- [ ] Open PR with `.github/pull_request_template.md`
