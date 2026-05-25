# Implementation Plan: Issue #175 — Comprehensive Agent Consistency

**Branch:** `175-comprehensive-agents-review`
**Spec:** `specs/175-comprehensive-agents-review/spec.md`
**ADR:** `docs/architecture/adr-175-local-parallel-pipeline-worktree-model.md`

---

## Constitution Check

| Rule | How this plan satisfies it |
|------|---------------------------|
| No direct commits to main | Feature branch: `175-comprehensive-agents-review` |
| Tests before implementation | TDD: test file written and confirmed failing before implementation for every code artefact |
| No hardcoded secrets | Shell scripts use env vars only; no tokens written to disk |
| Input validation at boundaries | `branch-guard.sh` validates issue number as integer and branch slug as `[a-z0-9-]+`; `pipeline.sh` validates all CLI arguments before any git or gh operation |
| Data access scoping | N/A — no user authentication required per constitution §Security |
| Coverage threshold | All new shell scripts covered by unit tests; orchestrator change covered by vitest unit test |

---

## Architecture Overview

Three interlocking deliverables defined by the spec:

```
Theme 1 — Agent Footprint
  docs/AGENT_PROTOCOL.md              updated (FR-024 — MUST happen first)
  engine/orchestrator/schemas/        updated (FR-008 — MUST happen second)
    apm-msg.schema.json
  src/agents/*.md (15 files)          Agent Footprint sections added

Theme 2 — Branch Guard
  scripts/branch-guard.sh             new reusable script (FR-010 to FR-014)
  engine/tests/branch-guard.test.sh   unit tests (TDD)

Theme 3 — Local Pipeline Manager
  scripts/pipeline.sh                 new lifecycle script (FR-015 to FR-022)
  engine/tests/pipeline.test.sh       unit tests (TDD)
  engine/orchestrator/index.js        extended with pipeline_id/worktree_path (FR-023)
  engine/tests/index-pipeline.test.js orchestrator unit test (TDD)
```

### Sequencing constraints

1. `AGENT_PROTOCOL.md` Section 2 update (FR-024) **must** precede any agent definition change — required by regulation-lint CI.
2. `apm-msg.schema.json` update (FR-008) **must** precede any agent definition that emits new fields — schema validation would otherwise fail.
3. Tests **must** be written and confirmed failing (red) before implementation (green) per TDD.

---

## Implementation Phases

### Phase 0 — Pre-requisites (documentation and schema)

These changes unblock all subsequent work. No tests needed (doc/schema only).

**P0-A**: Update `docs/AGENT_PROTOCOL.md` Section 2 — add the six new `apm-msg` v2
fields (`event_type`, `pipeline_id`, `issue`, `pr`, `branch`, `timestamp`) to the
schema reference table and add FR-002/FR-003 comment format specifications.

**P0-B**: Update `engine/orchestrator/schemas/apm-msg.schema.json` — add all new
fields as optional properties and change `additionalProperties: false` to
`additionalProperties: true` (per FR-008 backward-compatibility constraint).

---

### Phase 1 — Branch Guard (TDD)

**P1-A (RED)**: Write `engine/tests/branch-guard.test.sh` — test suite covering:
- Existing local branch → checked out without creating new branch
- Existing remote-only branch → checked out tracking origin
- No branch → created from `origin/main` and pushed
- Mismatched branch after checkout → exits non-zero and posts error comment
- Idempotency — calling twice produces same end state
- Worktree context — operates inside worktree path, not main checkout

**P1-B (GREEN)**: Implement `scripts/branch-guard.sh`:
- Args: `<issue_number> <branch_slug> [worktree_path]`
- Validates: `issue_number` is integer, `branch_slug` matches `[a-z0-9][a-z0-9-]*`
- Steps per FR-011: fetch → check → create/checkout → verify
- Posts error comment via `gh` on mismatch
- Idempotent

---

### Phase 2 — Pipeline Manager (TDD)

**P2-A (RED)**: Write `engine/tests/pipeline.test.sh` — test suite covering:
- `start <NNN> --mode=isolated` → worktree created at correct path
- `start <NNN> --mode=shared` → branch checked out in current dir
- `start <NNN>` (no flag) → defaults to isolated
- `join <NNN>` → prints worktree path, does NOT create second worktree
- `stop <NNN>` isolated → removes worktree, posts comment
- `stop <NNN>` shared → offers branch switch (no-switch flag suppresses)
- `status` with active worktrees → formatted table
- `status` with no worktrees → "No active pipelines"
- `status` with GitHub unreachable → falls back to local data + warning
- Two simultaneous isolated pipelines → no working-tree conflicts
- `--mode=shared` when another shared pipeline active → warning + prompt
- `QUORUMKIT_PIPELINES_DIR` override → worktree at custom path

**P2-B (GREEN)**: Implement `scripts/pipeline.sh`:
- Subcommands: `start`, `join`, `stop`, `status`
- Input validation for all arguments
- No shell injection (quoted variables, no eval)
- State via GitHub Issue comments only (no local state files)
- All lifecycle events post GitHub comments via `gh`

---

### Phase 3 — Orchestrator Extension (TDD)

**P3-A (RED)**: Write `engine/tests/index-pipeline.test.js` — vitest test for
`runOrchestrator` accepting `pipeline_id` and `worktree_path` in event context and
passing them through to `invokeAgent`.

**P3-B (GREEN)**: Update `engine/orchestrator/index.js` to extract optional
`pipeline_id` and `worktree_path` from event context and forward to `invokeAgent`/
`invokeAgentV2`.

---

### Phase 4 — Agent Footprint Sections

For each of the 15 agent files in `src/agents/`, add an `## Agent Footprint`
section defining:
- `agent-start` comment structure (plain structured comment, no `apm-msg`)
- `agent-complete` comment structure (with `apm-msg` v2 block)
- `agent-fail` comment structure (with `apm-msg` v2 block, `outcome: "fail"`)
- Which GitHub entity receives each comment (Issue vs PR)

Agents that perform file or GitHub operations also receive a **Branch Guard
invocation** note (BA, Developer, Architect, QA, Reviewer).

Triage Agent additionally gets an `apm-msg` block added to its existing triage
comment format (FR-009).

---

## File Change Summary

| File | Change type | FR |
|------|-------------|-----|
| `docs/AGENT_PROTOCOL.md` | Update Section 2 | FR-024 |
| `engine/orchestrator/schemas/apm-msg.schema.json` | Add optional fields, `additionalProperties: true` | FR-008 |
| `scripts/branch-guard.sh` | New file | FR-010–014 |
| `engine/tests/branch-guard.test.sh` | New test file | FR-010–014 |
| `scripts/pipeline.sh` | New file | FR-015–022 |
| `engine/tests/pipeline.test.sh` | New test file | FR-015–022 |
| `engine/orchestrator/index.js` | Accept pipeline_id/worktree_path | FR-023 |
| `engine/tests/index-pipeline.test.js` | New vitest test | FR-023 |
| `src/agents/architect-agent.md` | Add Agent Footprint section | FR-001, FR-012 |
| `src/agents/ba-product-agent.md` | Add Agent Footprint section | FR-001, FR-012 |
| `src/agents/compliance-agent.md` | Add Agent Footprint section | FR-001 |
| `src/agents/developer-agent.md` | Add Agent Footprint section | FR-001, FR-012 |
| `src/agents/devops-agent.md` | Add Agent Footprint section | FR-001 |
| `src/agents/digital-twin-agent.md` | Add Agent Footprint section | FR-001 |
| `src/agents/docs-agent.md` | Add Agent Footprint section | FR-001 |
| `src/agents/incident-agent.md` | Add Agent Footprint section | FR-001 |
| `src/agents/ot-integration-agent.md` | Add Agent Footprint section | FR-001 |
| `src/agents/qa-test-agent.md` | Add Agent Footprint section | FR-001, FR-006, FR-012 |
| `src/agents/release-agent.md` | Add Agent Footprint section | FR-001 |
| `src/agents/reviewer-agent.md` | Add Agent Footprint section | FR-001, FR-005, FR-012 |
| `src/agents/security-agent.md` | Add Agent Footprint section | FR-001, FR-007 |
| `src/agents/tech-debt-agent.md` | Add Agent Footprint section | FR-001 |
| `src/agents/triage-agent.md` | Add Agent Footprint section + apm-msg | FR-001, FR-009 |

---

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Shell injection in branch slug/issue number args | Validate with regex before use; no eval; all variables double-quoted |
| `git worktree add` fails (branch already checked out) | Branch Guard detects condition; pipeline.sh aborts and posts error comment recommending `pipeline join` |
| `gh` CLI not authenticated | Both scripts check `gh auth status` at startup and exit with clear message |
| Regulation-lint rejects new schema fields | AGENT_PROTOCOL.md update in Phase 0 ensures compliance before any agent emits new fields |
| Test shell runner not available | Tests written as self-contained shell assertions; no external test framework required |
