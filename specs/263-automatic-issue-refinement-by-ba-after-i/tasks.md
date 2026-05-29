# Task List: Automatic Issue Refinement by BA After Triage

**Issue**: #263
**Plan**: [plan.md](./plan.md)

---

## Tasks

- [x] **T-1** — Write `engine/tests/issue-enrichment.test.js` (TDD: red first)
  - US-1 scenario 1: `triaged + agent:ba` → BA enrichment dispatched
  - US-1 scenario 2: `triaged` without `agent:ba` → no dispatch
  - US-1 scenario 3: `agent:ba` without `triaged` → no dispatch
  - US-1 scenario 4: issue_number passed as workflow input
  - Edge: `triaged + agent:ba + type:feature` → enrichment (not feature pipeline)

- [x] **T-2** — Create `src/pipelines/ba-enrichment-pipeline.yml`
  - Trigger: `issues.labeled` with labels `[triaged, agent:ba]`
  - Single step: `ba-enrich-agent`
  - Schema version: `1` (v1, workflow_run.completed handshake)

- [x] **T-3** — Create `.github/workflows/copilot-agent-ba-enrich.yml`
  - `workflow_dispatch` with `issue_number` required input
  - Step 1: Call GitHub Models API to infer missing sections
  - Step 2: If all sections inferred → update body, swap labels, post success comment
  - Step 3: If cannot infer → retain `status:needs-info`, post clarification comment
  - Step 4: If already enriched → post "no changes" confirmation comment

- [x] **T-4** — Update `.github/workflows/orchestrator.yml`
  - Add `"BA Issue Enrichment Agent (Copilot)"` to `workflow_run.workflows` watch list

- [x] **T-5** — Update `.github/agents/ba-product-agent.md` (FR-011)
  - Add "Issue-Refinement Mode" section documenting trigger, inputs, outputs, constraints

- [x] **T-6** — Update `src/agents/ba-product-agent.md` (FR-012)
  - Apply identical update to the mirrored file

- [x] **T-7** — Run tests (`npm test` in `engine/`) and confirm all pass

- [x] **T-8** — Run markdown link check on all modified `.md` files
