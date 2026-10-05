# QuorumKit Agent Inventory

> **Auto-generated** by `scripts/generate-agent-inventory.js`. Do not edit manually.
> Last updated: 2026-10-05T19:42:53.879Z

This table shows all QuorumKit agents and their associated artifacts.

| Agent Slug | Definition | Instruction | Prompt | Skill | Claude Workflow | Copilot Workflow | Identity Logins | Default Runtime | Pipeline Usage |
|------------|------------|-------------|--------|-------|-----------------|------------------|-----------------|-----------------|----------------|
| architect-agent | ✅ [architect-agent.md](../src/agents/architect-agent.md) | ✅ [architect-agent.instructions.md](../src/.github/instructions/architect-agent.instructions.md) | ✅ [architect-agent.prompt.md](../src/.github/prompts/architect-agent.prompt.md) | ✅ [SKILL.md](../src/skills/architect-agent/SKILL.md) | ❌ MISSING | ✅ [copilot-agent-architect.yml](../.github/workflows/copilot-agent-architect.yml) | `github-actions[bot]`, `apm-architect-bot` | `azure-foundry-standard` | feature-pipeline (architect) |
| ba-agent | ✅ [ba-product-agent.md](../src/agents/ba-product-agent.md) | ✅ [ba-agent.instructions.md](../src/.github/instructions/ba-agent.instructions.md) | ✅ [ba-product-agent.prompt.md](../src/.github/prompts/ba-product-agent.prompt.md) | ✅ [SKILL.md](../src/skills/ba-agent/SKILL.md) | ❌ MISSING | ✅ [copilot-agent-ba.yml](../.github/workflows/copilot-agent-ba.yml) | `github-actions[bot]`, `apm-ba-bot` | `copilot-default` | feature-pipeline (ba) |
| ba-enrich-agent | ✅ [ba-enrich-agent.md](../src/agents/ba-enrich-agent.md) | ✅ [ba-enrich-agent.instructions.md](../src/.github/instructions/ba-enrich-agent.instructions.md) | ✅ [ba-enrich-agent.prompt.md](../src/.github/prompts/ba-enrich-agent.prompt.md) | ✅ [SKILL.md](../src/skills/ba-enrich-agent/SKILL.md) | ❌ MISSING | ✅ [copilot-agent-ba-enrich.yml](../.github/workflows/copilot-agent-ba-enrich.yml) | `github-actions[bot]` | `copilot-default` | ba-enrichment-pipeline (ba-enrich) |
| compliance-agent | ✅ [compliance-agent.md](../src/agents/compliance-agent.md) | ✅ [compliance-agent.instructions.md](../src/.github/instructions/compliance-agent.instructions.md) | ❌ MISSING | ✅ [SKILL.md](../src/skills/compliance-agent/SKILL.md) | ❌ MISSING | ❌ MISSING | N/A | `copilot-default` | N/A |
| dev-agent | ✅ [developer-agent.md](../src/agents/developer-agent.md) | ✅ [dev-agent.instructions.md](../src/.github/instructions/dev-agent.instructions.md) | ✅ [developer-agent.prompt.md](../src/.github/prompts/developer-agent.prompt.md) | ✅ [SKILL.md](../src/skills/dev-agent/SKILL.md) | ❌ MISSING | ✅ [copilot-agent-dev.yml](../.github/workflows/copilot-agent-dev.yml) | `github-actions[bot]`, `apm-dev-bot` | `azure-foundry-standard` | bug-fix-pipeline (dev); feature-pipeline (dev) |
| devops-agent | ✅ [devops-agent.md](../src/agents/devops-agent.md) | ✅ [devops-agent.instructions.md](../src/.github/instructions/devops-agent.instructions.md) | ✅ [devops-agent.prompt.md](../src/.github/prompts/devops-agent.prompt.md) | ✅ [SKILL.md](../src/skills/devops-agent/SKILL.md) | ❌ MISSING | ❌ MISSING | N/A | `copilot-default` | N/A |
| digital-twin-agent | ✅ [digital-twin-agent.md](../src/agents/digital-twin-agent.md) | ✅ [digital-twin-agent.instructions.md](../src/.github/instructions/digital-twin-agent.instructions.md) | ❌ MISSING | ✅ [SKILL.md](../src/skills/digital-twin-agent/SKILL.md) | ❌ MISSING | ❌ MISSING | N/A | `copilot-default` | N/A |
| docs-agent | ✅ [docs-agent.md](../src/agents/docs-agent.md) | ✅ [docs-agent.instructions.md](../src/.github/instructions/docs-agent.instructions.md) | ✅ [docs-agent.prompt.md](../src/.github/prompts/docs-agent.prompt.md) | ✅ [SKILL.md](../src/skills/docs-agent/SKILL.md) | ❌ MISSING | ✅ [copilot-agent-docs.yml](../.github/workflows/copilot-agent-docs.yml) | `github-actions[bot]`, `apm-docs-bot` | `azure-foundry-standard` | N/A |
| incident-agent | ✅ [incident-agent.md](../src/agents/incident-agent.md) | ✅ [incident-agent.instructions.md](../src/.github/instructions/incident-agent.instructions.md) | ❌ MISSING | ✅ [SKILL.md](../src/skills/incident-agent/SKILL.md) | ❌ MISSING | ❌ MISSING | N/A | `copilot-default` | N/A |
| ot-integration-agent | ✅ [ot-integration-agent.md](../src/agents/ot-integration-agent.md) | ✅ [ot-integration-agent.instructions.md](../src/.github/instructions/ot-integration-agent.instructions.md) | ❌ MISSING | ✅ [SKILL.md](../src/skills/ot-integration-agent/SKILL.md) | ❌ MISSING | ❌ MISSING | N/A | `copilot-default` | N/A |
| qa-agent | ✅ [qa-test-agent.md](../src/agents/qa-test-agent.md) | ✅ [qa-agent.instructions.md](../src/.github/instructions/qa-agent.instructions.md) | ✅ [qa-test-agent.prompt.md](../src/.github/prompts/qa-test-agent.prompt.md) | ✅ [SKILL.md](../src/skills/qa-agent/SKILL.md) | ❌ MISSING | ✅ [copilot-agent-qa.yml](../.github/workflows/copilot-agent-qa.yml) | `github-actions[bot]`, `apm-qa-bot` | `copilot-default` | bug-fix-pipeline (qa); feature-pipeline (qa); release-pipeline (qa) |
| release-agent | ✅ [release-agent.md](../src/agents/release-agent.md) | ✅ [release-agent.instructions.md](../src/.github/instructions/release-agent.instructions.md) | ✅ [release-agent.prompt.md](../src/.github/prompts/release-agent.prompt.md) | ✅ [SKILL.md](../src/skills/release-agent/SKILL.md) | ❌ MISSING | ✅ [copilot-agent-release.yml](../.github/workflows/copilot-agent-release.yml) | `github-actions[bot]`, `apm-release-bot` | `copilot-default` | feature-pipeline (release); release-pipeline (release) |
| reviewer-agent | ✅ [reviewer-agent.md](../src/agents/reviewer-agent.md) | ✅ [reviewer-agent.instructions.md](../src/.github/instructions/reviewer-agent.instructions.md) | ✅ [reviewer-agent.prompt.md](../src/.github/prompts/reviewer-agent.prompt.md) | ✅ [SKILL.md](../src/skills/reviewer-agent/SKILL.md) | ❌ MISSING | ✅ [copilot-agent-reviewer.yml](../.github/workflows/copilot-agent-reviewer.yml) | `github-actions[bot]`, `apm-reviewer-bot` | `copilot-default` | bug-fix-pipeline (reviewer); feature-pipeline (reviewer); release-pipeline (reviewer) |
| security-agent | ✅ [security-agent.md](../src/agents/security-agent.md) | ✅ [security-agent.instructions.md](../src/.github/instructions/security-agent.instructions.md) | ✅ [security-agent.prompt.md](../src/.github/prompts/security-agent.prompt.md) | ✅ [SKILL.md](../src/skills/security-agent/SKILL.md) | ❌ MISSING | ✅ [copilot-agent-security.yml](../.github/workflows/copilot-agent-security.yml) | `github-actions[bot]`, `apm-security-bot` | `azure-foundry-standard` | release-pipeline (security) |
| tech-debt-agent | ✅ [tech-debt-agent.md](../src/agents/tech-debt-agent.md) | ✅ [tech-debt-agent.instructions.md](../src/.github/instructions/tech-debt-agent.instructions.md) | ✅ [tech-debt-agent.prompt.md](../src/.github/prompts/tech-debt-agent.prompt.md) | ✅ [SKILL.md](../src/skills/tech-debt-agent/SKILL.md) | ❌ MISSING | ✅ [copilot-agent-tech-debt.yml](../.github/workflows/copilot-agent-tech-debt.yml) | N/A | `copilot-default` | N/A |
| triage-agent | ✅ [triage-agent.md](../src/agents/triage-agent.md) | ✅ [triage-agent.instructions.md](../src/.github/instructions/triage-agent.instructions.md) | ✅ [triage-agent.prompt.md](../src/.github/prompts/triage-agent.prompt.md) | ✅ [SKILL.md](../src/skills/triage-agent/SKILL.md) | ❌ MISSING | ✅ [copilot-agent-triage.yml](../.github/workflows/copilot-agent-triage.yml) | `github-actions[bot]`, `apm-triage-bot` | `azure-foundry-standard` | N/A |

---

## Legend

- ✅ File exists (click link to view)
- ❌ MISSING: File does not exist (may need to be created)
- N/A: Not applicable (agent doesn't use this artifact type)

## Naming Conventions

Agent slugs may differ from filenames due to historical naming:

- `ba-agent` → definition: `ba-product-agent.md`, instruction: `ba-agent.instructions.md`
- `dev-agent` → definition: `developer-agent.md`, instruction: `dev-agent.instructions.md`
- `qa-agent` → definition: `qa-test-agent.md`, instruction: `qa-agent.instructions.md`

These mappings are handled automatically by the generator script.
