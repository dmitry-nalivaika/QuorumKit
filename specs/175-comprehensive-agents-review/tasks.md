# Tasks: Issue #175 — Comprehensive Agent Consistency

**Branch:** `175-comprehensive-agents-review`
**Plan:** `specs/175-comprehensive-agents-review/plan.md`

All tasks follow TDD order: test (red) → implement (green) → commit (atomic).

---

## Phase 0 — Pre-requisites (no tests required — doc/schema changes)

- [x] **T-01** Update `docs/AGENT_PROTOCOL.md` Section 2 with extended `apm-msg` v2 field reference table and FR-002/FR-003 comment format specification *(FR-024)*
- [x] **T-02** Update `engine/orchestrator/schemas/apm-msg.schema.json`: add optional properties `event_type`, `pipeline_id`, `issue`, `pr`, `branch`, `timestamp`; change `additionalProperties: false` → `additionalProperties: true` *(FR-008)*
- [x] **T-03** Commit: `docs(protocol): extend apm-msg v2 schema fields and AGENT_PROTOCOL Section 2 (FR-024, FR-008)`

---

## Phase 1 — Branch Guard

- [x] **T-04** *(RED)* Create `engine/tests/branch-guard.test.sh` with test cases:
  - `test_existing_local_branch_checked_out`
  - `test_existing_remote_only_branch_checked_out_tracking`
  - `test_no_branch_creates_from_main_and_pushes`
  - `test_mismatch_after_checkout_exits_nonzero`
  - `test_idempotency_second_call_succeeds`
  - `test_worktree_context_does_not_touch_main_checkout`
  - `test_invalid_issue_number_rejected`
  - `test_invalid_branch_slug_rejected`
  Confirm: `bash engine/tests/branch-guard.test.sh` fails (script does not exist yet)
- [x] **T-05** *(GREEN)* Implement `scripts/branch-guard.sh`:
  - Args: `<issue_number> <branch_slug> [worktree_path]`
  - Validate: `issue_number` is integer, `branch_slug` matches `^[a-z0-9][a-z0-9-]*$`
  - Steps per FR-011 (fetch → check existence → create/checkout → verify)
  - Post error comment via `gh issue comment` on branch mismatch
  - Idempotent
  - Worktree-aware: uses `worktree_path` as CWD if provided
  Make executable: `chmod +x scripts/branch-guard.sh`
  Confirm: `bash engine/tests/branch-guard.test.sh` passes
- [x] **T-06** Commit: `feat(scripts): add branch-guard.sh with unit tests (FR-010–014)`

---

## Phase 2 — Pipeline Manager

- [x] **T-07** *(RED)* Create `engine/tests/pipeline.test.sh` with test cases:
  - `test_start_isolated_creates_worktree_at_default_path`
  - `test_start_isolated_custom_pipelines_dir`
  - `test_start_shared_checks_out_branch_in_place`
  - `test_start_defaults_to_isolated`
  - `test_join_prints_path_no_second_worktree`
  - `test_stop_isolated_removes_worktree`
  - `test_stop_shared_offers_branch_switch`
  - `test_stop_shared_no_switch_flag`
  - `test_status_lists_active_worktrees`
  - `test_status_no_pipelines_message`
  - `test_status_github_unreachable_fallback`
  - `test_two_isolated_pipelines_independent_working_trees`
  - `test_second_shared_pipeline_warns_and_prompts`
  - `test_invalid_issue_number_rejected`
  Confirm: `bash engine/tests/pipeline.test.sh` fails (script does not exist yet)
- [x] **T-08** *(GREEN)* Implement `scripts/pipeline.sh`:
  - Subcommands: `start <NNN> [--mode=isolated|shared]`, `join <NNN>`, `stop <NNN> [--no-switch]`, `status`
  - Input validation: NNN is integer, mode is `isolated` or `shared`
  - `start`: run branch guard, then create worktree or checkout in place, post `pipeline-started` comment
  - `join`: find existing worktree, print path
  - `stop`: remove worktree or offer switch, post `pipeline-stopped` comment with commit SHA
  - `status`: `git worktree list` + GitHub comment lookup, formatted table output
  - No local state files written; all state from GitHub Issue comments
  - Shell injection prevention: all variables quoted, no eval, args validated before use
  Make executable: `chmod +x scripts/pipeline.sh`
  Confirm: `bash engine/tests/pipeline.test.sh` passes
- [x] **T-09** Commit: `feat(scripts): add pipeline.sh lifecycle manager with unit tests (FR-015–022)`

---

## Phase 3 — Orchestrator Extension (FR-023)

- [x] **T-10** *(RED)* Create `engine/tests/index-pipeline.test.js` (vitest):
  - Test: `runOrchestrator` with event containing `pipeline_id` and `worktree_path` passes them to `invokeAgent`
  - Test: `runOrchestrator` without those fields still works (backward-compatible)
  Confirm: `cd engine && npm test -- tests/index-pipeline.test.js` fails
- [x] **T-11** *(GREEN)* Update `engine/orchestrator/index.js`:
  - Extract optional `pipeline_id` and `worktree_path` from event context
  - Forward to `invokeAgent` / `invokeAgentV2` call
  Confirm: `cd engine && npm test -- tests/index-pipeline.test.js` passes
- [x] **T-12** Confirm full orchestrator test suite still green: `cd engine && npm test`
- [x] **T-13** Commit: `feat(orchestrator): accept pipeline_id and worktree_path context fields (FR-023)`

---

## Phase 4 — Agent Footprint Sections (15 agent files)

Each sub-task: add `## Agent Footprint` section to the agent file per FR-001 to FR-009.

- [x] **T-14** `src/agents/triage-agent.md` — Footprint section + `apm-msg` block in triage comment *(FR-001, FR-009)*
- [x] **T-15** `src/agents/ba-product-agent.md` — Footprint section + Branch Guard invocation note *(FR-001, FR-012)*
- [x] **T-16** `src/agents/developer-agent.md` — Footprint section + Branch Guard invocation note *(FR-001, FR-012)*
- [x] **T-17** `src/agents/architect-agent.md` — Footprint section + Branch Guard invocation note *(FR-001, FR-012)*
- [x] **T-18** `src/agents/reviewer-agent.md` — Footprint section (full review posted as PR review, summary on linked issue) + Branch Guard invocation note *(FR-001, FR-005, FR-012)*
- [x] **T-19** `src/agents/qa-test-agent.md` — Footprint section (QA Report posted as PR comment, summary on issue) + Branch Guard invocation note *(FR-001, FR-006, FR-012)*
- [x] **T-20** `src/agents/security-agent.md` — Footprint section (summary on PR; HIGH/CRITICAL also on issue) *(FR-001, FR-007)*
- [x] **T-21** `src/agents/devops-agent.md` — Footprint section *(FR-001)*
- [x] **T-22** `src/agents/compliance-agent.md` — Footprint section *(FR-001)*
- [x] **T-23** `src/agents/release-agent.md` — Footprint section *(FR-001)*
- [x] **T-24** `src/agents/docs-agent.md` — Footprint section *(FR-001)*
- [x] **T-25** `src/agents/tech-debt-agent.md` — Footprint section *(FR-001)*
- [x] **T-26** `src/agents/incident-agent.md` — Footprint section *(FR-001)*
- [x] **T-27** `src/agents/digital-twin-agent.md` — Footprint section *(FR-001)*
- [x] **T-28** `src/agents/ot-integration-agent.md` — Footprint section *(FR-001)*
- [x] **T-29** Commit: `feat(agents): add Agent Footprint sections to all 15 agent definitions (FR-001–009)`

---

## Phase 5 — Handoff

- [x] **T-30** Run full test suite: `cd engine && npm test` — confirm all green ✅ 229/229
- [x] **T-31** Run markdown link check on all modified `.md` files
- [x] **T-32** Verify no hardcoded secrets or tokens in any committed file ✅
- [x] **T-33** Push branch and confirm Draft PR exists (or open one): title `[WIP] #175 — Comprehensive Agent Consistency`
- [x] **T-34** Verify success criteria checklist in `specs/175-comprehensive-agents-review/spec.md` — mark completed items

---

## Task Dependencies

```
T-01 → T-02 → T-03
              ↓
         T-04 → T-05 → T-06
                        ↓
                   T-07 → T-08 → T-09
                                   ↓
                             T-10 → T-11 → T-12 → T-13
                                                     ↓
                                          T-14 through T-29
                                                     ↓
                                          T-30 through T-34
```
