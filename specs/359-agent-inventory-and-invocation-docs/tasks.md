# Tasks: Agent Inventory and Invocation Documentation

**Input**: Design documents from `specs/359-agent-inventory-and-invocation-docs/`  
**Prerequisites**: spec.md (✅), plan.md (✅)

**Tests**: Not applicable - this feature produces documentation. Validation is manual per constitution §VIII.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Create spec directory `specs/359-agent-inventory-and-invocation-docs/`
- [x] T002 Create `spec.md` with user stories, FRs, acceptance scenarios
- [x] T003 Create `plan.md` with implementation approach, constitution check
- [ ] T004 Create `tasks.md` (this file)

---

## Phase 2: User Story 1 - Complete Agent Inventory Table (Priority: P1) 🎯 MVP

**Goal**: Generate `docs/AGENT_INVENTORY.md` from scattered YAML/markdown files

**Independent Test**: Run `node scripts/generate-agent-inventory.js` and verify table contains all agents with correct artifact links

### Implementation for User Story 1

- [ ] T005 [P] [US1] Create `scripts/generate-agent-inventory.js` with ES module structure, imports (fs, path, js-yaml)
- [ ] T006 [US1] Implement slug-mapping heuristic function (ba-product-agent → ba-agent, developer-agent → dev-agent, qa-test-agent → qa-agent)
- [ ] T007 [US1] Implement parser for `quorumkit.yml` to extract agents.universal + agents.domain/industrial
- [ ] T008 [P] [US1] Implement parser for `src/agent-identities.yml` to build slug → logins map
- [ ] T009 [P] [US1] Implement parser for `src/runtimes.yml` to build slug → runtime map (default_runtime + agent_defaults)
- [ ] T010 [US1] Implement scanner for `src/pipelines/*.yml` to collect unique agent slugs from steps[].agent
- [ ] T011 [US1] Implement union logic to merge all discovered agent slugs (quorumkit + identities + runtimes + pipelines)
- [ ] T012 [US1] Implement artifact checker: for each slug, check existence of definition, instruction, prompt, skill, workflows
- [ ] T013 [US1] Implement missing-marker logic: mark non-existent files with `❌ MISSING`
- [ ] T014 [US1] Implement pipeline-usage aggregator: scan all pipelines, report which steps use each agent
- [ ] T015 [US1] Implement markdown table renderer with columns: slug, definition, instruction, prompt, skill, Claude workflow, Copilot workflow, identity logins, runtime, pipeline usage
- [ ] T016 [US1] Add ISO timestamp header "Last updated: [timestamp]" to generated markdown
- [ ] T017 [US1] Write output to `docs/AGENT_INVENTORY.md`
- [ ] T018 [US1] Add script usage instructions in comments at top of `scripts/generate-agent-inventory.js`
- [ ] T019 [US1] Add executable shebang `#!/usr/bin/env node` to script
- [ ] T020 [US1] Make script executable: `chmod +x scripts/generate-agent-inventory.js`

**Checkpoint**: At this point, running `node scripts/generate-agent-inventory.js` should produce `docs/AGENT_INVENTORY.md` with a complete inventory table

---

## Phase 3: User Story 2 - Invocation Flow Documentation (Priority: P2)

**Goal**: Write `docs/AGENT_INVOCATION.md` explaining the orchestrator flow end-to-end

**Independent Test**: A new contributor can read the doc and trace a feature-pipeline run from GitHub event to agent invocation

### Implementation for User Story 2

- [ ] T021 [P] [US2] Create `docs/AGENT_INVOCATION.md` with frontmatter and overview section
- [ ] T022 [P] [US2] Write "GitHub Event Flow" section: event → orchestrator.yml → index.js → pipeline-loader → router-v2 → entry step
- [ ] T023 [P] [US2] Write "Runtime Resolution" section: runtime-registry.js reads runtimes.yml, resolves slug → runtime → workflow filename
- [ ] T024 [P] [US2] Write "Agent Invocation" section: agent-invoker-v2.js dispatches workflow_dispatch, workflow runs, agent posts apm-msg
- [ ] T025 [P] [US2] Write "Comment Processing" section: issue_comment trigger, apm-msg-parser, identity-registry validation
- [ ] T026 [P] [US2] Write "Transition Resolution" section: router-v2 resolves (step, outcome) → next step, loop-budget check, state-manager updates
- [ ] T027 [P] [US2] Write "Local Dashboard Invocations" section: contrast with GitHub flow (WebSocket bridge, no orchestrator.yml, direct workflow_dispatch)
- [ ] T028 [P] [US2] Write "Claude vs. Copilot" section: explain workflow filename convention (agent-*.yml vs. copilot-agent-*.yml), runtime kind selection
- [ ] T029 [US2] Create ASCII or Mermaid diagram showing full invocation flow (GitHub event → orchestrator → runtime → workflow → apm-msg → transition)
- [ ] T030 [US2] Add references section with links to: engine/orchestrator/*.js files, ADR-004, ADR-005, ADR-006, ADR-007, docs/PIPELINES.md
- [ ] T031 [US2] Add table of contents to `docs/AGENT_INVOCATION.md` for navigation

**Checkpoint**: At this point, `docs/AGENT_INVOCATION.md` should comprehensively explain the orchestrator flow with examples and diagrams

---

## Phase 4: User Story 3 - Automated Drift Detection (Priority: P3)

**Goal**: Add CI check to fail when inventory is stale

**Independent Test**: Add a dummy agent file, run CI check, verify it fails with clear message

### Implementation for User Story 3

- [ ] T032 [US3] Create `scripts/verify-agent-inventory.sh` with bash shebang and error handling
- [ ] T033 [US3] Implement temp file generation: run `node scripts/generate-agent-inventory.js` to temp file
- [ ] T034 [US3] Implement diff check: compare temp file to `docs/AGENT_INVENTORY.md`
- [ ] T035 [US3] If diff found, print diff output and exit 1 with message: "Agent inventory is stale. Run `node scripts/generate-agent-inventory.js` and commit the result."
- [ ] T036 [US3] If no diff, print "✅ Agent inventory is up-to-date" and exit 0
- [ ] T037 [US3] Add cleanup: remove temp file on exit (trap EXIT)
- [ ] T038 [US3] Make script executable: `chmod +x scripts/verify-agent-inventory.sh`
- [ ] T039 [US3] Open `.github/workflows/quality.yml` for editing
- [ ] T040 [US3] Add new step "Verify agent inventory is up-to-date" after existing checks, run `bash scripts/verify-agent-inventory.sh`
- [ ] T041 [US3] Test locally: run generator, commit, then add dummy file, run verify script, confirm it fails
- [ ] T042 [US3] Test locally: remove dummy file, run verify script, confirm it passes

**Checkpoint**: At this point, CI will block PRs if `docs/AGENT_INVENTORY.md` is out of sync

---

## Phase 5: Fix Discovered Gaps (FR-010)

**Goal**: Fix all gaps identified during inventory generation

**Independent Test**: Re-run generator after fixes, verify no more `❌ MISSING` markers for fixable gaps

### Gap Fix 1: Missing ba-enrich-agent.md

- [ ] T043 [P] [GAP1] Read `.github/workflows/copilot-agent-ba-enrich.yml` to understand ba-enrich-agent behavior
- [ ] T044 [GAP1] Create `src/agents/ba-enrich-agent.md` with standard agent definition structure:
  - Agent Identity section
  - Capabilities section
  - Tools section
  - Constraints section
  - Workflow section
  - Agent Footprint templates (start, complete, fail)
- [ ] T045 [GAP1] Populate agent definition based on ba-enrichment-pipeline.yml purpose: "Automatically enrich sparse issue body with structured sections after triage"
- [ ] T046 [GAP1] Mirror agent definition to `.github/agents/ba-enrich-agent.md` (run `bash src/scripts/init.sh` or copy manually)

### Gap Fix 2: Workflow Mirroring Verification

- [ ] T047 [P] [GAP2] Run `bash scripts/verify-mirror.sh` to check if all src/.github/workflows/ files are mirrored to .github/workflows/
- [ ] T048 [GAP2] If verify-mirror.sh fails, run `bash src/scripts/init.sh --ai=both` to sync workflows
- [ ] T049 [GAP2] Re-run `bash scripts/verify-mirror.sh` to confirm sync completed

### Gap Fix 3: Slug Naming Documentation

- [ ] T050 [P] [GAP3] Add comment block in `scripts/generate-agent-inventory.js` documenting slug-mapping heuristic with examples
- [ ] T051 [P] [GAP3] Add note to `docs/AGENT_INVENTORY.md` header explaining slug aliases (ba-product-agent → ba-agent, etc.)

**Checkpoint**: All fixable gaps are resolved; inventory regeneration shows only intentional MISSING markers (e.g., agents with no prompt or skill)

---

## Phase 6: Polish & Validation

**Purpose**: Final validation, documentation updates, commit message

- [ ] T052 [P] Run `node scripts/generate-agent-inventory.js` and commit generated `docs/AGENT_INVENTORY.md`
- [ ] T053 [P] Run `bash scripts/verify-agent-inventory.sh` locally, confirm it passes
- [ ] T054 Review `docs/AGENT_INVENTORY.md` table, verify all 15+ agents are listed
- [ ] T055 Review `docs/AGENT_INVOCATION.md`, verify all 9 sections are complete
- [ ] T056 Check all links in both docs (agent definitions, workflows, ADRs) are valid (optional: run markdown-link-check)
- [ ] T057 Update issue #359 body with acceptance criteria (if needed)
- [ ] T058 Commit all changes with conventional commit message: `feat: add agent inventory generator and invocation docs (#359)`
- [ ] T059 Push branch `359-agent-inventory-and-invocation-docs` to remote
- [ ] T060 Open PR, verify quality.yml CI check runs and passes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **User Story 1 (Phase 2)**: Depends on Setup → T001-T004 complete
- **User Story 2 (Phase 3)**: Can run in parallel with User Story 1 after Setup complete
- **User Story 3 (Phase 4)**: Depends on User Story 1 complete (T005-T020) because CI check runs the generator
- **Gap Fixes (Phase 5)**: Can run in parallel with User Stories 2 and 3
- **Polish (Phase 6)**: Depends on all previous phases complete

### Task-Level Dependencies

**User Story 1 (P1) - Inventory Generator**:
- T005 (script skeleton) must complete before T006-T020
- T006-T015 (parsers, checkers, renderers) can run in parallel if tasks touch different functions
- T016-T020 (output, docs, permissions) depend on T015 (renderer complete)

**User Story 2 (P2) - Invocation Docs**:
- T021 (file creation) must complete before T022-T031
- T022-T028 (section writing) can run in parallel (different sections of same file)
- T029 (diagram) can run in parallel with sections
- T030-T031 (references, TOC) depend on all sections complete

**User Story 3 (P3) - CI Drift Check**:
- T032 (script skeleton) must complete before T033-T038
- T039-T040 (quality.yml integration) can run in parallel with T032-T038
- T041-T042 (local testing) depend on T032-T040 complete

**Gap Fixes (Phase 5)**:
- T043-T046 (ba-enrich-agent.md) are sequential (read workflow → write definition → mirror)
- T047-T049 (workflow mirroring) are sequential (verify → sync → re-verify)
- T050-T051 (slug naming docs) can run in parallel (different files)

### Parallel Opportunities

- After T004 (setup complete):
  - T005 (inventory script) + T021 (invocation doc) + T043 (ba-enrich agent) + T047 (mirror verify) can all start in parallel
- Within User Story 1:
  - T006-T009 (parsers) can run in parallel
  - T012-T014 (artifact checks) can run in parallel after T011
- Within User Story 2:
  - T022-T029 (all sections + diagram) can run in parallel after T021
- Within Gap Fixes:
  - T043 (ba-enrich), T047 (mirror), T050 (slug docs) can all start in parallel

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: Inventory Generator (T005-T020)
3. **STOP and VALIDATE**: Run generator, inspect output table
4. Merge if P1 delivers enough value

### Incremental Delivery

1. Setup → Inventory Generator (P1) → Test independently → Merge/Deploy
2. Add Invocation Docs (P2) → Test independently → Merge/Deploy
3. Add CI Drift Check (P3) → Test independently → Merge/Deploy
4. Each story adds value without breaking previous stories

### Single-Pass Full Delivery (Recommended)

1. Setup (Phase 1)
2. Inventory Generator (Phase 2) + Invocation Docs (Phase 3) + Gap Fixes (Phase 5) in parallel
3. CI Drift Check (Phase 4) after Inventory Generator complete
4. Polish (Phase 6) after all phases complete
5. Submit single PR with all features

---

## Notes

- **[P] tasks** = different files or different functions in same file, no dependencies
- **[Story] label** maps task to specific user story (US1, US2, US3) or gap fix (GAP1, GAP2, GAP3) for traceability
- **Manual validation**: No executable tests per constitution §VIII; acceptance validation is by inspection
- **Performance**: T005-T020 (generator) reads ~120 files synchronously, completes in <5 seconds
- **Idempotent**: Running generator twice produces identical output (deterministic)
- **Commit after each phase**: T020 (P1 done), T031 (P2 done), T042 (P3 done), T051 (gaps done), T058 (all done)
