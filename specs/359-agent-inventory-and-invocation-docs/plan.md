# Implementation Plan: Agent Inventory and Invocation Documentation

**Branch**: `359-agent-inventory-and-invocation-docs` | **Date**: 2026-01-08 | **Spec**: [spec.md](./spec.md)

## Summary

Build a complete agent inventory system that generates a single-table view of all QuorumKit agents (15 total: 11 universal + 4 domain-specific) with their associated artifacts (definitions, instructions, prompts, skills, workflows, identities, runtimes, pipeline usage). Add comprehensive invocation flow documentation explaining the GitHub event → orchestrator → pipeline → runtime → workflow → apm-msg cycle. Implement automated drift detection in CI to prevent inventory staleness. Fix all discovered gaps (missing agent definitions, workflow mirrors, slug inconsistencies).

## Technical Context

**Language/Version**: Node.js (JavaScript ES modules), Bash shell scripts  
**Primary Dependencies**: js-yaml (already in engine/orchestrator/package.json), node:fs, node:path  
**Storage**: File-based (YAML config files in `src/`, generated markdown in `docs/`)  
**Testing**: Manual verification against acceptance scenarios (no executable tests per constitution §IV)  
**Target Platform**: macOS/Linux (CI runs on ubuntu-latest)  
**Project Type**: Documentation generator + CI validation script  
**Performance Goals**: Generator completes in <5 seconds; CI check adds <10 seconds to workflow  
**Constraints**: Must handle missing files gracefully (FR-003); must match init.sh slug-mapping heuristic (FR-004)  
**Scale/Scope**: 15 agents × ~8 artifact types = ~120 file checks per run

## Constitution Check

| Rule | How this plan satisfies it |
|------|---------------------------|
| **I. Agent-First Design** | N/A — this feature documents existing agent infrastructure; does not introduce new agent behaviors |
| **II. NNN Traceability** | ✅ Anchored to Issue #359 → `specs/359-*/` → branch `359-agent-inventory-and-invocation-docs` |
| **III. Spec-Before-Code** | ✅ This plan follows spec.md which defines FRs, user stories, acceptance scenarios |
| **IV. Dual-AI Compatibility** | N/A — generator script is not AI-invoked; output docs are for human consumption |
| **V. Reusability** | ✅ Generator script is reusable by adopters; output is regenerated on every repo change |
| **VI. Observable** | ✅ Inventory table makes agent landscape observable at a glance; CI check makes drift observable |
| **VII. Secure by Default** | ✅ No secrets, no external API calls, no user input (reads only YAML/markdown files) |
| **VIII. Testable** | ⚠️ Manual validation only (per constitution §IV, no executable tests unless requested) |
| **IX. Lean Delivery** | ✅ P1 (inventory table) is MVP; P2 (invocation docs) and P3 (CI check) are incremental |
| **X. Maintenance Cost** | ✅ Automated inventory generation reduces maintenance cost vs. hand-written docs |

## Project Structure

### Documentation (this feature)

```text
specs/359-agent-inventory-and-invocation-docs/
├── spec.md              # ✅ Created
├── plan.md              # ✅ This file
└── tasks.md             # Next: created by follow-up task list generation
```

### Source Code (repository root)

```text
scripts/
├── generate-agent-inventory.js   # NEW: Node.js script to build inventory table
└── verify-agent-inventory.sh     # NEW: CI drift check (similar to verify-mirror.sh)

docs/
├── AGENT_INVENTORY.md            # NEW: Generated inventory table (FR-001)
└── AGENT_INVOCATION.md           # NEW: Prose doc explaining invocation flow (FR-005)

src/agents/
└── ba-enrich-agent.md            # NEW: Missing definition for ba-enrich-agent (FR-010a)

.github/workflows/quality.yml     # MODIFIED: Add verify-agent-inventory.sh check (FR-009)
```

**Structure Decision**: Scripts go in `scripts/` (existing convention). Generated docs go in `docs/` (existing convention for prose documentation). New agent definition goes in `src/agents/` per ADR-006 source-of-truth model.

## Implementation Approach

### Phase 1: Inventory Generator Script (User Story 1 - P1)

**Goal**: Generate `docs/AGENT_INVENTORY.md` from scattered YAML and markdown files.

**Inputs**:
- `quorumkit.yml` → list of official agents (11 universal + 4 domain)
- `src/agent-identities.yml` → agent slugs + GitHub logins
- `src/runtimes.yml` → default_runtime + agent_defaults overrides
- `src/pipelines/*.yml` → steps[].agent references
- `src/agents/*.md` → agent definition files
- `src/.github/instructions/*.instructions.md` → Copilot instruction files
- `src/.github/prompts/*.prompt.md` → agent prompt files
- `src/skills/*/SKILL.md` → agent skill directories
- `.github/workflows/agent-*.yml` → Claude workflow files
- `.github/workflows/copilot-agent-*.yml` → Copilot workflow files

**Algorithm**:
1. Parse `quorumkit.yml` to extract official agent list (agents.universal + agents.domain/industrial).
2. Parse `src/agent-identities.yml` to build a slug → logins map.
3. Parse `src/runtimes.yml` to build a slug → runtime map (default or override).
4. Scan `src/pipelines/*.yml` and collect unique agent slugs from steps[].agent.
5. Union all discovered slugs (quorumkit + identities + runtimes + pipelines).
6. For each slug:
   - Map to canonical form using init.sh heuristic (ba-product-agent → ba-agent, developer-agent → dev-agent, qa-test-agent → qa-agent).
   - Check existence of: definition, instruction, prompt, skill, Claude workflow, Copilot workflow.
   - Mark missing artifacts with `❌ MISSING`.
   - Lookup runtime from step 3.
   - Lookup identity logins from step 2.
   - Scan pipelines for which steps reference this agent.
7. Render markdown table with columns per FR-001.
8. Write to `docs/AGENT_INVENTORY.md`.

**Output Format**:
```markdown
# QuorumKit Agent Inventory

> **Auto-generated** by `scripts/generate-agent-inventory.js`. Do not edit manually.
> Last updated: [ISO timestamp]

| Agent Slug | Definition | Instruction | Prompt | Skill | Claude Workflow | Copilot Workflow | Identity Logins | Default Runtime | Pipeline Usage |
|------------|------------|-------------|--------|-------|-----------------|------------------|-----------------|-----------------|----------------|
| ba-agent   | ✅ [src/agents/ba-product-agent.md](../src/agents/ba-product-agent.md) | ✅ [src/.github/instructions/ba-agent.instructions.md](../src/.github/instructions/ba-agent.instructions.md) | ✅ [src/.github/prompts/ba-product-agent.prompt.md](../src/.github/prompts/ba-product-agent.prompt.md) | ❌ MISSING | ❌ MISSING | ✅ [.github/workflows/copilot-agent-ba.yml](../.github/workflows/copilot-agent-ba.yml) | `github-actions[bot]`, `apm-ba-bot` | `copilot-default` | feature-pipeline (ba), bug-fix-pipeline (dev→qa→reviewer), ... |
| ... | ... | ... | ... | ... | ... | ... | ... | ... | ... |
```

**Slug Mapping Heuristic** (matches `src/scripts/init.sh` lines 195-207):
- `ba-product-agent.md` → `ba-agent`
- `developer-agent.md` → `dev-agent`
- `qa-test-agent.md` → `qa-agent`
- All others: strip `.md` suffix, keep as-is.

**Error Handling**:
- If a YAML file fails to parse, log warning and skip (don't crash).
- If a pipeline references a non-existent agent slug, include it in the table with all artifacts marked MISSING.
- If an agent in `quorumkit.yml` has no definition file, mark it MISSING.

---

### Phase 2: Invocation Flow Documentation (User Story 2 - P2)

**Goal**: Write `docs/AGENT_INVOCATION.md` explaining the orchestrator flow.

**Content Outline**:
1. **Overview**: What is the orchestrator, what problem does it solve?
2. **GitHub Event Flow**:
   - GitHub event (issue labeled, PR opened, comment created) → `orchestrator.yml` trigger
   - `engine/orchestrator/index.js` entry point
   - `pipeline-loader.js` reads `src/pipelines/*.yml`
   - `router-v2.js` matches event to pipeline via trigger rules
   - Pipeline entry step identified
3. **Runtime Resolution**:
   - `runtime-registry.js` reads `src/runtimes.yml`
   - Resolves agent slug → runtime (default or agent_defaults override)
   - Runtime kind (copilot, claude, azure-openai) determines workflow filename
4. **Agent Invocation**:
   - `agent-invoker-v2.js` dispatches `workflow_dispatch` to the resolved workflow file
   - Workflow file (e.g., `copilot-agent-ba.yml`) runs
   - Agent reads definition from `.github/agents/<slug>.md` (mirrored from `src/agents/`)
   - Agent performs work, posts `apm-msg` comment
5. **Comment Processing**:
   - Orchestrator triggers on `issue_comment.created`
   - `apm-msg-parser.js` extracts outcome from comment body
   - `identity-registry.js` validates comment author against `src/agent-identities.yml`
   - If invalid author, comment ignored (security gate)
6. **Transition Resolution**:
   - `router-v2.js` resolves `(current_step, outcome)` → next step via pipeline transitions
   - `loop-budget.js` checks for runaway loops
   - `state-manager.js` appends audit comment + updates live-status comment
   - Next agent invoked (repeat from step 3)
7. **Local Dashboard Invocations** (contrast with GitHub flow):
   - User clicks "Run Agent" in dashboard UI
   - WebSocket message sent to dashboard server
   - Server calls `agent-invoker-v2.js` directly (no orchestrator.yml)
   - Rest of flow identical (runtime resolution → workflow_dispatch → apm-msg → transition)
8. **Claude vs. Copilot**:
   - Claude: `agent-<slug>.yml` workflows in `.github/workflows/`
   - Copilot: `copilot-agent-<slug>.yml` workflows in `.github/workflows/`
   - Selected by `runtime-registry.js` based on `src/runtimes.yml` kind field
9. **Diagram** (optional ASCII or Mermaid):
   ```
   GitHub Event → orchestrator.yml
       ↓
   pipeline-loader → router-v2 (match event)
       ↓
   runtime-registry (resolve agent → runtime)
       ↓
   agent-invoker-v2 (workflow_dispatch)
       ↓
   Workflow File (agent-*.yml or copilot-agent-*.yml)
       ↓
   Agent Execution (reads .github/agents/<slug>.md)
       ↓
   apm-msg Comment Posted
       ↓
   orchestrator.yml (issue_comment trigger)
       ↓
   apm-msg-parser + identity-registry (validate)
       ↓
   router-v2 (resolve transition)
       ↓
   state-manager (append audit, update live-status)
       ↓
   Next Agent Invoked (loop)
   ```

**References**: Link to relevant source files and ADRs (ADR-004 state model, ADR-005 runtime registry, ADR-006 dual-tree topology, ADR-007 orchestrator contract).

---

### Phase 3: CI Drift Detection (User Story 3 - P3)

**Goal**: Add `scripts/verify-agent-inventory.sh` and integrate into `.github/workflows/quality.yml`.

**Script Logic**:
1. Run `node scripts/generate-agent-inventory.js` to a temp file.
2. Compare temp file to `docs/AGENT_INVENTORY.md` (byte-for-byte or line-by-line diff).
3. If identical, exit 0.
4. If different, print diff and exit 1 with message: "Agent inventory is stale. Run `node scripts/generate-agent-inventory.js` and commit the result."

**quality.yml Integration**:
Add a step after existing checks:
```yaml
- name: Verify agent inventory is up-to-date
  run: bash scripts/verify-agent-inventory.sh
```

**Example** (modeled after `scripts/verify-mirror.sh`):
```bash
#!/usr/bin/env bash
set -euo pipefail
TMPFILE=$(mktemp)
node scripts/generate-agent-inventory.js > "$TMPFILE"
if ! diff -u docs/AGENT_INVENTORY.md "$TMPFILE"; then
  echo "❌ Agent inventory is stale. Run: node scripts/generate-agent-inventory.js"
  exit 1
fi
echo "✅ Agent inventory is up-to-date"
```

---

### Phase 4: Fix Discovered Gaps (FR-010)

**Gap 1: Missing ba-enrich-agent.md**

Problem: `ba-enrich-agent` appears in `src/agent-identities.yml` and `src/pipelines/ba-enrichment-pipeline.yml` but has no definition in `src/agents/`.

Fix: Create `src/agents/ba-enrich-agent.md` by extracting content from the Copilot workflow that implements it (`.github/workflows/copilot-agent-ba-enrich.yml`).

**Gap 2: Workflow Mirroring**

Problem: Some workflows in `src/.github/workflows/` may not be mirrored to `.github/workflows/`.

Fix: Verify all `src/.github/workflows/*.yml` files exist in `.github/workflows/` (this is covered by `verify-mirror.sh` already, so no new code needed — just run `bash scripts/init.sh` to sync).

**Gap 3: Slug Naming Inconsistencies**

Problem: Agent definitions use long names (`developer-agent.md`), instructions use short names (`dev-agent.instructions.md`), workflows use both.

Fix: Document the mapping heuristic in the generator script comments and in `docs/AGENT_INVENTORY.md` header. The generator handles this via the init.sh mapping (FR-004).

---

## Complexity Tracking

No constitution violations. This feature:
- Does not add a new agent (no Agent-First violation).
- Follows NNN traceability (issue #359 → spec → branch).
- Has spec before code (this plan).
- Generates documentation (no AI runtime compatibility concerns).
- Is reusable by adopters (auto-generates on every run).
- Is observable (inventory table + CI check).
- Has no security surface (reads local files only).
- Lean delivery (P1 → P2 → P3 incremental).

---

## Acceptance Validation

### User Story 1 (P1) - Inventory Table
- [ ] Run `node scripts/generate-agent-inventory.js`
- [ ] Open `docs/AGENT_INVENTORY.md`
- [ ] Verify table has 15+ rows (11 universal + 4 domain + discovered agents like ba-enrich)
- [ ] Verify columns: slug, definition, instruction, prompt, skill, Claude workflow, Copilot workflow, identity logins, runtime, pipeline usage
- [ ] Verify missing artifacts marked `❌ MISSING`
- [ ] Verify `ba-enrich-agent` row exists with MISSING definition (until gap fix is merged)

### User Story 2 (P2) - Invocation Docs
- [ ] Open `docs/AGENT_INVOCATION.md`
- [ ] Read from top to bottom
- [ ] Verify all 9 sections from Phase 2 outline are present
- [ ] Verify diagram (ASCII or Mermaid) is included
- [ ] Verify links to source files (`engine/orchestrator/*.js`) and ADRs are correct

### User Story 3 (P3) - CI Drift Detection
- [ ] Run `node scripts/generate-agent-inventory.js` and commit result
- [ ] Run `bash scripts/verify-agent-inventory.sh` → should pass (exit 0)
- [ ] Add a dummy agent file `src/agents/dummy-agent.md`
- [ ] Run `bash scripts/verify-agent-inventory.sh` → should fail (exit 1) with diff output
- [ ] Remove dummy file
- [ ] Push branch and verify quality.yml CI step runs and passes

### Gap Fixes (FR-010)
- [ ] Verify `src/agents/ba-enrich-agent.md` exists and contains valid agent definition sections
- [ ] Verify all workflows in `src/.github/workflows/` are mirrored to `.github/workflows/` (run `bash scripts/verify-mirror.sh`)
- [ ] Verify slug mapping in generator script matches `init.sh` lines 195-207

---

## Notes

- **No executable tests**: Per constitution §IV, this feature produces documentation. Validation is manual inspection against acceptance scenarios.
- **Incremental delivery**: P1 (inventory) is the MVP. P2 (invocation docs) and P3 (CI check) add value independently.
- **Performance**: Generator script reads ~120 files (15 agents × 8 artifact types). With node:fs synchronous reads, this takes <1 second on modern hardware. CI overhead is negligible.
- **Idempotent**: Running the generator twice produces identical output (deterministic, no timestamps except "Last updated" header).
- **Compatibility**: Script uses ES modules (node 16+). CI runs ubuntu-latest which ships node 18+.
