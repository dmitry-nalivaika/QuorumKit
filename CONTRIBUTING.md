# Contributing to QuorumKit

This guide is for contributors who want to **enhance the QuorumKit library itself** —
adding new agents, improving existing ones, updating workflows, or extending the
framework for new domains (e.g. dark factory, fintech, healthcare).

> **Using QuorumKit in your own project?** See `templates/seed/CONTRIBUTING.md` — that file
> is for contributors to projects that _use_ this library, not for this library itself.

---

## Principles

1. **Single source of truth** — every rule lives in exactly one place:
   `.apm/agents/<agent>.md`. Skills, workflow prompts, and Copilot instruction
   files are thin wrappers that delegate to agent definitions. Never duplicate.
2. **Universal agents** — no project-specific content in `.apm/agents/`. Domain
   guidance belongs in dedicated guides and domain extension packs, not in
   universal agent definitions.
3. **Conditional rules** — any rule that does not apply to all project types must
   be conditioned: `(if applicable per constitution)` or `(if auth required)`.
4. **No regressions** — every change to an agent definition must be reviewed for
   consistency against all **15 agents** before merge.
5. **Quality gates apply to this repo too** — the agents review their own changes.

---

## Quick Reference

| You want to… | Do this |
|---|---|
| Improve an existing agent | [Agent Enhancement Workflow](#agent-enhancement-workflow) |
| Add a new universal agent | [Adding a New Agent](#adding-a-new-agent) |
| Add a domain extension pack | [Adding a Domain Pack](#adding-a-domain-pack) |
| Improve a workflow or template | Open issue → BA Agent spec → PR |
| Add a domain guide (e.g. fintech) | [Adding a Domain Guide](#adding-a-domain-guide) |
| Report a bug in the library | Open a GitHub Issue using the Bug Report template |
| Propose a breaking change | Open a Discussion first — breaking changes require consensus |

---

## Repo Topology

This repository plays **three** roles. Every top-level folder belongs to
exactly one zone (ADR-047, FR-001).

| Zone | Top-level folders | Purpose |
|---|---|---|
| **1. Package payload** | `.apm/`, `templates/`, `installer/` | Files that `installer/init.sh` copies into a consumer repo. SoT for agents, skills, pipelines, runtime registry, identity registry, seed docs, template workflows. |
| **2. Engine** | `engine/orchestrator/`, `engine/dashboard/`, `engine/tests/`, `engine/dist/` | Orchestrator runtime + dashboard + their tests + the committed ncc bundle. Distributed as (a) a reusable GitHub Action (`uses: dmitry-nalivaika/quorumkit/engine@<ref>`) and (b) an npm package. **Never copied** into a consumer repo. |
| **3. Self-host** | `.github/`, `.claude/`, `.specify/`, `specs/`, `docs/`, `scripts/` (BC shims) | Files that exist solely so this repo can dogfood itself. **Not distributed.** `scripts/*.sh` are thin wrappers around `installer/*.sh` for one major version of backward compatibility. |

Where to put what:

- **A new agent definition** → `.apm/agents/<slug>-agent.md`. Re-run
  `installer/init.sh` to regenerate the `templates/github/instructions/`
  mirror. `verify-mirror.sh` (M1 + M7) enforces parity to `.claude/agents/`
  and `.github/instructions/`.
- **An orchestrator bug fix** → `engine/orchestrator/`. Tests under
  `engine/tests/`. Re-run `cd engine && npm run build` and commit the
  `engine/dist/` diff (the `engine-build-gate` workflow rejects PRs whose
  bundle is out of sync).
- **An installer enhancement** → `installer/init.sh`. The shim at
  `scripts/init.sh` simply `exec`s the new path and is removed in v4.0.0.
- **A first-time-init seed file** (`CLAUDE.md`, `CONTRIBUTING.md`,
  `SECURITY.md`, `copilot-instructions.md`) → `templates/seed/` (FR-004).

What **MUST NOT** exist in this repo (enforced by `installer/verify-mirror.sh`):

- `templates/.apm/pipelines/` — pipelines are read directly from
  `.apm/pipelines/` per ADR-006 §3 (M4).
- `.github/agents/` — that directory is generated in *consumer* repos by
  `installer/init.sh`; in this SoT repo, agent definitions live only at
  `.apm/agents/` (M6).

Mirror surfaces:

| ID | SoT | Mirror / invariant |
|---|---|---|
| M1 | `.apm/agents/<x>.md` | `templates/github/instructions/<short>.instructions.md` parity |
| M5 | `templates/github/workflows/<wf>.yml` | `.github/workflows/<wf>.yml` byte-identity (if both exist; `# apm-allow-divergence:` exempts an intentional split) |
| M7 | `.apm/agents/<x>.md` | `.claude/agents/<x>.md` AND `.github/instructions/<short>.instructions.md` |
| M8 | — | no `node (scripts\|engine)/orchestrator/` in distributed workflows (engine invoked via `uses:` only) |
| M9 | — | every third-party `uses:` SHA-pinned (40 hex) |

The marker `# apm-allow: <reason>` on a `uses:` or `run:` line documents a
deliberate, time-boxed exemption (e.g. an Action whose stable release has not
yet shipped). Use sparingly and remove the line as soon as the underlying
condition resolves.

---

## Prerequisites

```zsh
git clone <this-repo-url> ~/apm-dev && cd ~/apm-dev

# Claude Code (recommended for library contributions)
npm i -g @anthropic-ai/claude-code
export ANTHROPIC_API_KEY=<your key>

# Verify agents load correctly
ls .apm/agents/
ls .apm/skills/
```

---

## Agent Enhancement Workflow

This is the standard path for improving an existing agent definition.

### 1. Open a GitHub Issue

Use the **Feature Request** template. The Triage Agent will label it automatically.
Note the Issue number — it becomes NNN throughout this workflow.

Or start with the BA Agent directly if you already know what you want:

```
/ba-agent Improve the Security Agent to include supply chain attack vectors (SLSA)
```

### 2. BA Agent writes the spec

The BA Agent creates `specs/NNN-<slug>/spec.md`. For agent enhancements, the spec
must include:

- **Which agent(s) are affected** (all 8 must be checked for consistency)
- **What rule/section is changing** — new section, amended rule, removed duplication
- **Consistency check** — does the new rule need a conditional
  `(if applicable per constitution)` qualifier?
- **Duplication check** — is this rule already expressed anywhere else
  (another agent, a SKILL.md, a workflow prompt, a Copilot instructions file)?

### 3. Self-review using the Consistency Checklist

Before opening a PR, run the consistency check manually or via the Reviewer Agent:

```zsh
# Open a PR draft, then comment:
@reviewer-agent
```

The Reviewer Agent will apply the [Agent Consistency Checklist](#agent-consistency-checklist).

Or run it manually in Claude Code:

```
/reviewer-agent Review my changes to .apm/agents/ for consistency across all 15 agents
```

### 4. PR and review

Branch name: `NNN-<short-slug>` (e.g. `042-security-slsa`).

PR checklist (in addition to the PR template):
- [ ] Rule is in the agent definition only — not copied into SKILL.md, workflow, or instructions file
- [ ] Conditional qualifier added if rule is not universal
- [ ] All 8 agents checked — no related rules elsewhere that need updating
- [ ] `init.sh` syntax still passes: `bash -n scripts/init.sh`
- [ ] `README.md` updated if the change affects the public-facing feature set

### 5. Agent reviews

Comment on the PR:
```
@reviewer-agent    — consistency, duplication, conditional checks
@qa-agent          — does the spec's acceptance criteria pass?
```

For significant changes (new agent, restructured conventions):
```
@architect-agent   — structural integrity of the agent framework
```

---

## Agent Consistency Checklist

Every PR that touches `.apm/agents/` **must** pass all of these checks.
The Reviewer Agent applies these automatically; you can also run them manually.

### No-Duplication Rules
- [ ] The changed rule exists **only** in the agent definition file
- [ ] The corresponding `SKILL.md` is a pure activation wrapper (≤ 10 lines, no rules)
- [ ] The corresponding Copilot `.instructions.md` file is a thin pointer (≤ 15 lines)
- [ ] The corresponding GitHub Actions workflow prompt is delegation-only (no inline rules)

### Universality Rules
- [ ] The agent contains no project-specific technology names (no "React", "Django", "AWS")
- [ ] Any auth/multi-user rule is conditioned: `(if applicable per constitution)`
- [ ] Any tool command is conditioned: `(if available)` or discovered from constitution
- [ ] SLO/threshold values reference the constitution, not hardcoded numbers

### Consistency Rules (across all 15 agents)
- [ ] NNN convention reference is consistent with `ba-product-agent.md`
- [ ] Branch naming reference is consistent with `developer-agent.md`
- [ ] Severity label format (`BLOCKER:`, `SUGGESTION:`, `ARCH-BLOCKER:`, etc.) matches
      the existing pattern for that agent type
- [ ] "Context Files to Read at Session Start" section present (or explicitly absent
      for agents that don't need it)

### Format Rules
- [ ] No `# filepath:` or `<!-- filepath: -->` comment at the top of the file
- [ ] Sections follow the existing order: Role → Responsibilities → Permitted Commands
      → [Domain-specific checklists] → Reporting Format → Hard Constraints →
      Context Files
- [ ] Hard Constraints use `MUST` / `MUST NOT` language

---

## Adding a New Agent

New agents are rare — exhaust enhancements to existing agents first. Decide whether
the new agent is **universal** (applies to all software projects) or **domain-specific**
(belongs in a domain extension pack). If genuinely needed:

### Checklist for a new universal agent

- [ ] Open a GitHub Issue and write a spec via BA Agent
- [ ] Spec must justify why existing agents cannot cover this responsibility
- [ ] Create `.apm/agents/<name>-agent.md` following the section order above
- [ ] Create `.apm/skills/<name>-agent/SKILL.md` (activation wrapper only, ≤ 45 lines)
- [ ] Create `templates/github/instructions/<name>-agent.instructions.md` (pointer only, ≤ 20 lines)
- [ ] Create `templates/github/workflows/agent-<name>.yml` (Claude Actions)
- [ ] Create `templates/github/workflows/copilot-agent-<name>.yml` (Copilot Actions)
- [ ] Add agent to `UNIVERSAL_AGENTS` array in `scripts/init.sh` (both `install_claude` and `install_copilot`)
- [ ] Add agent to `required_agents` array in `scripts/quality-check.sh`
- [ ] Add skill to `UNIVERSAL_SKILLS` / `required_skills` arrays in both scripts
- [ ] Add workflows to `required_workflows` in `scripts/quality-check.sh`
- [ ] Add agent to `agents.universal` list in `quorumkit.yml`
- [ ] Add agent to `README.md` universal agent table
- [ ] Add slash command to `INIT.md` quick reference
- [ ] `@architect-agent` review required — structural change to the framework

---

## Adding a Domain Pack

Domain extension packs add opt-in agents for a specific industry vertical.

### Checklist for a new domain pack (`--domain=<pack>`)

- [ ] Open a GitHub Issue with domain scope definition
- [ ] Create all agent/skill/workflow files following the new-agent checklist above
- [ ] Add a `--domain=<pack>` case to the argument parser in `scripts/init.sh`
- [ ] Add domain agent arrays (`DOMAIN_AGENTS`, `DOMAIN_SKILLS`, `DOMAIN_WF_PATTERNS`) to both install functions
- [ ] Add domain entry to `agents.domain/<pack>` in `quorumkit.yml`
- [ ] Create or update `<DOMAIN>_GUIDE.md` at repo root
- [ ] Add domain pack to `README.md` domain table and Quick Start examples
- [ ] Add domain pack to `ENHANCEMENTS.md` Phase 5/6 table
- [ ] `@architect-agent` review required

---

## Adding a Domain Guide

Domain guides (like `DARK_FACTORY_GUIDE.md`) provide project-type-specific
guidance without polluting the universal agent definitions.

### Rules for domain guides

1. **No new rules in agent definitions** — if the domain needs custom agent
   behaviour, document it in the guide as "add to your agent's
   `## Project-Specific Extensions` section"
2. **Self-contained** — the guide must work without reading any other guide
3. **Reference the constitution** — domain-specific constitution sections belong
   in the guide as templates the user copies into their own project constitution
4. **Include a checklist** — end with a "Project Ready to Build" checklist

```zsh
# Create a new domain guide
touch FINTECH_GUIDE.md   # or HEALTHCARE_GUIDE.md, etc.
# Then: /ba-agent Write a domain guide for fintech projects using this QuorumKit stack
```

---

## File Map: What to Change for Common Tasks

| Task | Files to change |
|------|----------------|
| Add a new rule to an agent | `.apm/agents/<agent>.md` only |
| Change agent section order | `.apm/agents/<agent>.md` only |
| Add a new slash command | `.apm/skills/<name>/SKILL.md` + update `INIT.md` |
| Add a new GitHub Actions trigger | `templates/github/workflows/agent-<name>.yml` + `copilot-agent-<name>.yml` |
| Add a new universal agent | See [Adding a New Agent](#adding-a-new-agent) |
| Add a domain extension pack | See [Adding a Domain Pack](#adding-a-domain-pack) |
| Change NNN convention | `ba-product-agent.md`, `developer-agent.md`, `qa-test-agent.md`, `reviewer-agent.md`, `INIT.md`, `templates/seed/CONTRIBUTING.md`, `README.md` |
| Add a new issue template | `templates/github/ISSUE_TEMPLATE/<name>.md` + update `config.yml` |
| Update init.sh | `scripts/init.sh` → always run `bash -n scripts/init.sh` after |
| Add a domain guide | New `<DOMAIN>_GUIDE.md` at root + entry in `README.md` |
| Update agent/skill/workflow counts | `scripts/quality-check.sh` arrays + `quorumkit.yml` + `README.md` + `CONTRIBUTING.md` |

---

## Quality Gates for Library Changes

Before pushing any branch:

```zsh
# 1. Shell script syntax
bash -n scripts/init.sh && echo "init.sh OK"

# 2. No filepath headers in agent/template files
grep -rn '^# filepath:\|^<!-- filepath:' .apm/ templates/ && echo "FAIL — remove filepath headers" || echo "OK"

# 3. No duplication — skills are wrappers
for f in .apm/skills/*/SKILL.md; do
  lines=$(wc -l < "$f")
  [ "$lines" -gt 20 ] && echo "WARN: $f has $lines lines — may contain duplicated rules"
done

# 4. No project-specific tech in agent definitions
grep -rn '\bReact\b\|\bDjango\b\|\bRails\b\|\bSpring\b\|\bLaravel\b' .apm/agents/ \
  && echo "FAIL — project-specific tech found in agents" || echo "OK"

# 5. Conditional check — auth rules must have qualifier
grep -n 'scope.*authenticated\|auth.*required\|multi.user' .apm/agents/*.md | \
  grep -v 'if applicable\|if auth\|per constitution\|constitution requires' \
  && echo "WARN — unconditional auth rule found" || echo "OK"
```

Run the full suite:
```zsh
cd /path/to/apm && bash scripts/quality-check.sh
```

> `scripts/quality-check.sh` is created automatically — see [Automation](#automation) below.

---

## Automation

The `scripts/quality-check.sh` script bundles all checks above. It is run by
CI on every PR. To generate it if missing:

```
/devops-agent Create quality-check.sh script that runs all library quality gates
```

---

## Commit Convention

```
<type>(<scope>): <summary>

[body — what changed and why]

Refs: #<issue-number>
```

Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `ci`  
Scopes: `agents`, `skills`, `workflows`, `templates`, `scripts`, `docs`, `guides`

Examples:
```
feat(agents): add SLSA supply chain checks to security agent
fix(scripts): restore community files copy in install_github_templates()
refactor(agents): make auth rules conditional in all 8 agents
docs(guides): add dark factory project guide
```

---

## Getting Help

- Open a GitHub Issue — Triage Agent will classify it
- Comment `@architect-agent` on a PR for framework design questions
- Read the agent definitions in `.apm/agents/` — they are the canonical reference
