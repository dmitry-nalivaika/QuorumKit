# Agent-by-Agent Comprehensive Review
## Issue #359 - Phase 6: Quality Review & Synchronization

**Goal**: Ensure all 14 universal + special agents have complete, consistent artifacts and work identically in local/workflow modes.

---

## Review Checklist Per Agent

### Artifact Completeness
- [ ] **Definition** (`src/agents/*.md`) - comprehensive, includes agent footprint templates
- [ ] **Instruction** (`src/.github/instructions/*.instructions.md`) - concise, points to definition
- [ ] **Prompt** (`src/.github/prompts/*.prompt.md`) - for Claude local mode
- [ ] **Skill** (`src/skills/*/SKILL.md`) - for Claude local skills system
- [ ] **Workflow** (`.github/workflows/copilot-agent-*.yml`) - for GitHub Actions invocation
- [ ] **Identity** (`src/agent-identities.yml`) - GitHub logins mapped
- [ ] **Runtime** (`src/runtimes.yml`) - default or override configured

### Content Quality
- [ ] Definition has standard sections (Identity, Capabilities, Tools, Constraints, Workflow, Agent Footprint, Examples)
- [ ] Agent footprint templates follow spec #268 format (start, complete, fail with apm-msg)
- [ ] Instruction file points to correct definition path (`.github/agents/*.md`)
- [ ] Prompt activates role correctly for local Claude mode
- [ ] Skill YAML frontmatter is valid
- [ ] Workflow uses correct agent slug and definition path

### Local/Workflow Parity
- [ ] Agent works in Claude Code local mode (via prompt)
- [ ] Agent works in GitHub Copilot local mode (via instruction)
- [ ] Agent works in GitHub Actions workflow mode (via workflow file)
- [ ] All three modes produce identical agent footprint comments
- [ ] No mode-specific hacks or workarounds

### Mirror Consistency (ADR-006)
- [ ] Definition mirrored: `src/agents/*.md` → `.github/agents/*.md`
- [ ] Instruction mirrored: `src/.github/instructions/*.instructions.md` → `.github/instructions/*.instructions.md`
- [ ] Prompt mirrored: `src/.github/prompts/*.prompt.md` → `.github/prompts/*.prompt.md` (if exists)
- [ ] Skill mirrored: `src/skills/*/SKILL.md` → `.claude/skills/*/SKILL.md` (if exists)
- [ ] Workflow mirrored: `src/.github/workflows/*.yml` → `.github/workflows/*.yml`

---

## Agent 1: architect-agent

### Status: ✅ REVIEW COMPLETE

#### Artifact Inventory
- ✅ Definition: `src/agents/architect-agent.md` (400 lines, comprehensive)
- ✅ Instruction: `src/.github/instructions/architect-agent.instructions.md` (12 lines, minimal)
- ✅ Prompt: `src/.github/prompts/architect-agent.prompt.md` (15 lines, good)
- ✅ Skill: `src/skills/architect-agent/SKILL.md` (39 lines, comprehensive)
- ✅ Workflow: `.github/workflows/copilot-agent-architect.yml` (156 lines, ADR-332 compliant)
- ✅ Identity: `github-actions[bot]`, `apm-architect-bot`
- ✅ Runtime: `azure-foundry-standard` (ADR-332 override)

#### Quality Assessment

**Definition (architect-agent.md)**:
- ✅ Has all required sections (Identity, Capabilities, Tools, Constraints, Workflow, Examples)
- ✅ Agent footprint templates present (start, complete, fail)
- ✅ apm-msg schema v2 compliant
- ✅ Comprehensive ADR format documented
- ✅ Architecture review checklist included
- ⚠️ Could use more real-world examples

**Instruction (architect-agent.instructions.md)**:
- ✅ Minimal and correct (points to `.github/agents/architect-agent.md`)
- ✅ Includes `applyTo` frontmatter for Copilot workspace filtering
- ✅ References constitution and ADRs

**Prompt (architect-agent.prompt.md)**:
- ✅ Correct mode: `agent`
- ✅ Activates role correctly
- ✅ Waits for instructions (no auto-execution)
- ✅ References definition path correctly

**Skill (architect-agent/SKILL.md)**:
- ✅ Valid YAML frontmatter
- ✅ `user-invocable: true`
- ✅ Clear argument hints
- ✅ References `.claude/agents/architect-agent.md` (correct for local Claude)

**Workflow (copilot-agent-architect.yml)**:
- ✅ ADR-332 compliant (runtime overrides, security checks)
- ✅ Trigger: `issue_comment`, `pull_request_review_comment`, `workflow_dispatch`
- ✅ Reads `.github/agents/architect-agent.md`
- ✅ Reads `.specify/memory/constitution.md`
- ✅ Security: endpoint allowlist + src/runtimes.yml validation
- ⚠️ No agent footprint comments (workflow_run completion only)

#### Issues Found

1. **Workflow doesn't post agent footprint** - uses `workflow_run.completed` (schema v1), doesn't post structured apm-msg
2. **Skill references `.claude/agents/` instead of `.github/agents/`** - path inconsistency

#### Recommended Fixes

1. ❌ **Skip workflow footprint fix** - architect is rarely invoked by orchestrator (manual review agent)
2. ✅ **Fix skill path**: Update `src/skills/architect-agent/SKILL.md` line 8 to reference `.github/agents/architect-agent.md`

#### Action Items
- [ ] Fix skill definition path inconsistency

---

## Agent 2: ba-agent (ba-product-agent)

### Status: 🔄 REVIEW IN PROGRESS

#### Artifact Inventory
- ✅ Definition: `src/agents/ba-product-agent.md`
- ✅ Instruction: `src/.github/instructions/ba-agent.instructions.md`
- ✅ Prompt: `src/.github/prompts/ba-product-agent.prompt.md`
- ✅ Skill: `src/skills/ba-agent/SKILL.md`
- ✅ Workflow: `.github/workflows/copilot-agent-ba.yml`
- ✅ Identity: `github-actions[bot]`, `apm-ba-bot`
- ✅ Runtime: `copilot-default`

#### Quality Assessment
[To be filled after reading all artifacts]

---

## Agent 3: ba-enrich-agent

### Status: ⏳ PENDING

---

## Agent 4: dev-agent (developer-agent)

### Status: ⏳ PENDING

---

## Agent 5: devops-agent

### Status: ⏳ PENDING
**Note**: No workflow file - manual invocation only (expected)

---

## Agent 6: docs-agent

### Status: ⏳ PENDING
**Note**: Direct webhook trigger (PR quality gate)

---

## Agent 7: qa-agent (qa-test-agent)

### Status: ⏳ PENDING

---

## Agent 8: release-agent

### Status: ⏳ PENDING

---

## Agent 9: reviewer-agent

### Status: ⏳ PENDING

---

## Agent 10: security-agent

### Status: ⏳ PENDING

---

## Agent 11: tech-debt-agent

### Status: ⏳ PENDING

---

## Agent 12: triage-agent

### Status: ⏳ PENDING
**Note**: Direct webhook trigger (entry point)

---

## Summary

### Total Agents Reviewed: 1/14
### Issues Found: 2
### Fixes Applied: 0
### Estimated Time: 3-4 hours for full review + fixes

---

## Next Steps

1. Complete review of remaining 13 agents
2. Create missing prompts (8 agents: ba-enrich, docs, release, tech-debt, and 4 others)
3. Fix all path inconsistencies
4. Ensure all agent footprint templates are v2 compliant
5. Regenerate inventory
6. Test local mode for all agents
7. Commit all fixes

---

**End of Review Document**
