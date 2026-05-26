# Contributing to QuorumKit

This guide is for contributors who want to **enhance the QuorumKit library itself** —
adding new agents, improving existing ones, updating workflows, or extending the
framework for new domains (e.g. dark factory, fintech, healthcare).

> **Using QuorumKit in your own project?** See `src/seed/CONTRIBUTING.md` — that file
> covers contributions to projects that _consume_ this library, not the library itself.

---

## Quick Reference

| You want to… | Go to |
|---|---|
| Improve an existing agent | [Agent Enhancement Workflow](#agent-enhancement-workflow) |
| Add a new universal agent | [Adding a New Agent](#adding-a-new-agent) |
| Add a domain extension pack | [Adding a Domain Pack](#adding-a-domain-pack) |
| Improve a workflow or template | Open issue → BA Agent spec → PR |
| Add a domain guide (e.g. fintech) | [Adding a Domain Guide](#adding-a-domain-guide) |
| Report a bug | Open a GitHub Issue using the Bug Report template |
| Propose a breaking change | Open a Discussion first — breaking changes require consensus |

---

## Core Principles

These principles are non-negotiable. Every change must respect them.

1. **Single source of truth** — every agent rule lives in exactly one place:
   `src/agents/<agent>.md`. Skills, workflow prompts, and Copilot instruction
   files are thin wrappers that delegate to the agent definition. Never duplicate
   rules across surfaces.
2. **Universal agents** — `src/agents/` contains no project-specific content.
   Domain-specific guidance belongs in dedicated guides and domain extension packs.
3. **Conditional rules** — any rule that does not apply to all project types must
   carry the qualifier `(if applicable per constitution)` or `(if auth required)`.
4. **No regressions** — every change to an agent definition must be reviewed for
   consistency against all agents before merge.
5. **Quality gates apply here too** — the agents review their own changes.

---

## Repo Topology

This repository has three distinct zones (defined in ADR-047). Every top-level
folder belongs to exactly one zone.

| Zone | Folders | Purpose |
|---|---|---|
| **Package source** | `src/` | The single canonical directory that `src/scripts/init.sh` reads and installs. Contains agents, skills, pipelines, registry files, template workflows, instructions, and seed docs. Source of truth for everything distributed to consumers. |
| **Engine** | `engine/orchestrator/`, `engine/dashboard/`, `engine/tests/`, `engine/dist/` | Orchestrator runtime, dashboard, tests, and the committed `ncc` bundle. Distributed as a reusable GitHub Action (`uses: dmitry-nalivaika/quorumkit/engine@<ref>`) and as an npm package. Never copied into a consumer repo. |
| **Self-host** | `.github/`, `specs/`, `docs/`, `scripts/` | Files that exist solely so this repo can dogfood itself. `.claude/` and `.specify/` are generated locally by `scripts/dev-setup.sh` and are gitignored. `scripts/*.sh` are thin wrappers around `src/scripts/*.sh`. |

### Where to put new work

| What you're adding | Where it goes |
|---|---|
| New agent definition | `src/agents/<slug>-agent.md`. Re-run `src/scripts/init.sh` to regenerate the `src/.github/instructions/` mirror. `verify-mirror.sh` (M1 + M7) enforces parity with `.claude/agents/` and `.github/instructions/`. |
| Orchestrator bug fix | `engine/orchestrator/`. Tests under `engine/tests/`. Run `cd engine && npm run build` and commit the `engine/dist/` diff — the `engine-build-gate` workflow rejects PRs whose bundle is out of sync. |
| Installer enhancement | `src/scripts/init.sh`. The shim at `scripts/init.sh` delegates via `exec` to that path and is removed in v4.0.0. |
| Seed file (`CLAUDE.md`, `CONTRIBUTING.md`, `SECURITY.md`, `copilot-instructions.md`) | `src/seed/` (FR-004). |

### What must not exist here

The following are enforced by `src/scripts/verify-mirror.sh`:

- **No `src/.github/pipelines/`** — pipelines are read directly from `src/pipelines/`
  per ADR-006 §3 (M4).
- **No divergence between `.github/agents/` and `src/agents/`** — when `.github/agents/`
  is present (it is, for Copilot parity), it must be byte-identical to `src/agents/` (M6).
  Run `bash scripts/dev-setup.sh` to sync.

### Mirror invariants

| ID | Source of truth | Mirror / constraint |
|---|---|---|
| M1 | `src/agents/<x>.md` | `src/.github/instructions/<short>.instructions.md` — must be in parity |
| M5 | `src/.github/workflows/<wf>.yml` | `.github/workflows/<wf>.yml` — byte-identical (add `# apm-allow-divergence:` to exempt an intentional split) |
| M6 | `src/agents/<x>.md` | `.github/agents/<x>.md` — byte-identical when `.github/agents/` is present |
| M7 | `src/agents/<x>.md` | `.claude/agents/<x>.md` AND `.github/instructions/<short>.instructions.md` |
| M8 | — | No `node (scripts\|engine)/orchestrator/` in distributed workflows — invoke the engine via `uses:` only |
| M9 | — | Every third-party `uses:` must be SHA-pinned (40 hex characters) |

> **`# apm-allow: <reason>`** — add this marker to a `uses:` or `run:` line to
> document a deliberate, time-boxed exception (e.g. an Action whose stable release
> has not yet shipped). Remove the line as soon as the underlying condition resolves.

---

## Prerequisites

```zsh
# Clone and enter the repo
git clone <this-repo-url> ~/quorumkit-dev && cd ~/quorumkit-dev

# Install the package into itself for agent-assisted development (mandatory).
# Generates .specify/, .claude/, and all other local artifacts (gitignored).
# Re-run any time to recreate the environment.
bash scripts/dev-setup.sh

# Install Claude Code (recommended for library contributions)
npm i -g @anthropic-ai/claude-code
export ANTHROPIC_API_KEY=<your-api-key>

# Confirm agents and skills are present
ls src/agents/   # expect: ba-product-agent.md, developer-agent.md, …
ls src/skills/   # expect: one directory per agent skill
```

---

## Agent Enhancement Workflow

Use this workflow to improve an existing agent definition. It is the most common
contribution path.

### Step 1 — Open a GitHub Issue

Use the **Feature Request** template. The Triage Agent labels it automatically.
Note the issue number — it becomes `NNN` throughout this workflow.

If you already know what you want, start directly with the BA Agent:

```
/ba-agent Improve the Security Agent to include supply chain attack vectors (SLSA)
```

### Step 2 — BA Agent writes the spec

The BA Agent creates `specs/NNN-<slug>/spec.md`. For agent enhancements, the spec
must address:

- **Which agents are affected** — all agents must be checked for consistency
- **What is changing** — new section, amended rule, or removed duplication
- **Conditional qualifier** — does the new rule need `(if applicable per constitution)`?
- **Duplication check** — is the rule already expressed in another agent, a `SKILL.md`,
  a workflow prompt, or a Copilot instructions file?

### Step 3 — Run the Consistency Checklist

Before opening a PR, run the [Agent Consistency Checklist](#agent-consistency-checklist)
via the Reviewer Agent:

```zsh
# Open a PR draft, then post a comment:
@reviewer-agent
```

To run the check manually in Claude Code:

```
/reviewer-agent Review my changes to .github/agents/ for consistency across all agents
```

### Step 4 — Open a PR

Name the branch `NNN-<short-slug>` (e.g. `042-security-slsa`).

PR checklist (in addition to the PR template):

- [ ] Rule lives in the agent definition only — not copied into `SKILL.md`, a workflow, or an instructions file
- [ ] Conditional qualifier added if the rule is not universal
- [ ] All agents checked — no related rules in other files that also need updating
- [ ] `init.sh` syntax passes: `bash -n scripts/init.sh`
- [ ] `README.md` updated if the change affects the public-facing feature set

### Step 5 — Agent reviews

Post on the PR:

```
@reviewer-agent    — consistency, duplication, and conditional checks
@qa-agent          — does the spec's acceptance criteria pass?
```

For significant changes (new agent, restructured conventions):

```
@architect-agent   — structural integrity of the agent framework
```

---

## Agent Consistency Checklist

Every PR that touches `.github/agents/` must pass all of these checks. The
Reviewer Agent applies them automatically; you can also run them manually.

### No-Duplication Rules

- [ ] The changed rule exists **only** in the agent definition file
- [ ] The corresponding `SKILL.md` is a pure activation wrapper (≤ 10 lines, no rules)
- [ ] The corresponding Copilot `.instructions.md` file is a thin pointer (≤ 15 lines)
- [ ] The corresponding GitHub Actions workflow prompt contains only delegation — no inline rules

### Universality Rules

- [ ] The agent contains no project-specific technology names (no "React", "Django", "AWS")
- [ ] Any auth/multi-user rule carries the qualifier: `(if applicable per constitution)`
- [ ] Any tool command is conditioned: `(if available)` or discovered from the constitution
- [ ] SLO and threshold values reference the constitution, not hardcoded numbers

### Consistency Rules (across all agents)

- [ ] NNN convention reference matches `ba-product-agent.md`
- [ ] Branch naming reference matches `developer-agent.md`
- [ ] Severity label format (`BLOCKER:`, `SUGGESTION:`, `ARCH-BLOCKER:`, etc.) matches
      the existing pattern for that agent type
- [ ] "Context Files to Read at Session Start" section is present (or explicitly absent
      for agents that don't need it)

### Format Rules

- [ ] No `# filepath:` or `<!-- filepath: -->` comment at the top of the file
- [ ] Sections follow the canonical order: Role → Responsibilities → Permitted Commands
      → [Domain-specific checklists] → Reporting Format → Hard Constraints → Context Files
- [ ] Hard Constraints use `MUST` / `MUST NOT` language

---

## Adding a New Agent

New agents are rare. Exhaust all enhancement options for existing agents before
proposing a new one. Determine whether the agent is **universal** (applies to all
software projects) or **domain-specific** (belongs in a domain extension pack).

### Checklist for a new universal agent

- [ ] Open a GitHub Issue and write a spec via the BA Agent
- [ ] Spec justifies why no existing agent can cover this responsibility
- [ ] Create `src/agents/<name>-agent.md` following the canonical section order
- [ ] Create `src/skills/<name>-agent/SKILL.md` (activation wrapper only, ≤ 45 lines)
- [ ] Create `src/.github/instructions/<name>-agent.instructions.md` (pointer only, ≤ 20 lines)
- [ ] Create `src/.github/workflows/agent-<name>.yml` (Claude Actions)
- [ ] Create `src/.github/workflows/copilot-agent-<name>.yml` (Copilot Actions)
- [ ] Add agent to `UNIVERSAL_AGENTS` array in `src/scripts/init.sh` (both `install_claude` and `install_copilot` functions)
- [ ] Add agent to `required_agents` array in `src/scripts/quality-check.sh`
- [ ] Add skill to `UNIVERSAL_SKILLS` / `required_skills` arrays in both scripts
- [ ] Add workflows to `required_workflows` in `src/scripts/quality-check.sh`
- [ ] Add agent to `agents.universal` list in `quorumkit.yml`
- [ ] Add agent to the universal agent table in `README.md`
- [ ] Add slash command to the quick reference in `docs/INIT.md`
- [ ] Request `@architect-agent` review — this is a structural change to the framework

---

## Adding a Domain Pack

Domain extension packs add opt-in agents for a specific industry vertical.

### Checklist for a new domain pack (`--domain=<pack>`)

- [ ] Open a GitHub Issue with the domain scope definition
- [ ] Create all agent, skill, and workflow files using the [new-agent checklist](#checklist-for-a-new-universal-agent) above
- [ ] Add a `--domain=<pack>` case to the argument parser in `src/scripts/init.sh`
- [ ] Add domain agent arrays (`DOMAIN_AGENTS`, `DOMAIN_SKILLS`, `DOMAIN_WF_PATTERNS`) to both install functions
- [ ] Add domain entry to `agents.domain/<pack>` in `quorumkit.yml`
- [ ] Create or update `docs/<DOMAIN>_GUIDE.md`
- [ ] Add the domain pack to the domain table and Quick Start examples in `README.md`
- [ ] Add the domain pack to the Phase 5/6 table in `docs/ENHANCEMENTS.md`
- [ ] Request `@architect-agent` review

---

## Adding a Domain Guide

Domain guides (such as `docs/DARK_FACTORY_GUIDE.md`) provide project-type-specific
guidance without adding project-specific content to the universal agent definitions.

### Rules for domain guides

1. **No new agent rules** — if the domain needs custom agent behaviour, document it in
   the guide as an instruction for users to add to their agent's `## Project-Specific Extensions` section.
2. **Self-contained** — the guide must be usable without reading any other guide.
3. **Reference the constitution** — domain-specific constitution sections belong in
   the guide as templates that users copy into their own project constitution.
4. **End with a checklist** — close with a "Project Ready to Build" checklist.

```zsh
# Create a new domain guide, then invoke the BA Agent to draft the content
touch docs/FINTECH_GUIDE.md
# /ba-agent Write a domain guide for fintech projects using this QuorumKit stack
```

---

## File Map: What to Change for Common Tasks

| Task | Files to change |
|------|----------------|
| Add a rule to an existing agent | `src/agents/<agent>.md` only |
| Change agent section order | `src/agents/<agent>.md` only |
| Add a new slash command | `src/skills/<name>/SKILL.md` + update `docs/INIT.md` |
| Add a new GitHub Actions trigger | `src/.github/workflows/agent-<name>.yml` + `copilot-agent-<name>.yml` |
| Add a new universal agent | See [Adding a New Agent](#adding-a-new-agent) |
| Add a domain extension pack | See [Adding a Domain Pack](#adding-a-domain-pack) |
| Change the NNN convention | `src/agents/ba-product-agent.md`, `developer-agent.md`, `qa-test-agent.md`, `reviewer-agent.md`, `docs/INIT.md`, `src/seed/CONTRIBUTING.md`, `README.md` |
| Add a new issue template | `src/.github/ISSUE_TEMPLATE/<name>.md` + update `config.yml` |
| Update `init.sh` | `src/scripts/init.sh` — always run `bash -n src/scripts/init.sh` after editing |
| Add a domain guide | New `docs/<DOMAIN>_GUIDE.md` + entry in `README.md` |
| Update agent/skill/workflow counts | `src/scripts/quality-check.sh` arrays + `quorumkit.yml` + `README.md` + `CONTRIBUTING.md` |

---

## Quality Gates

Run these checks before pushing any branch. CI runs them on every PR.

```zsh
# 1. Validate shell script syntax
bash -n src/scripts/init.sh && echo "init.sh syntax OK"

# 2. Confirm no filepath headers in agent or template files
grep -rn '^# filepath:\|^<!-- filepath:' src/ \
  && echo "FAIL — remove filepath headers" || echo "OK"

# 3. Check skill files are still thin wrappers (warn if > 20 lines)
for f in src/skills/*/SKILL.md; do
  lines=$(wc -l < "$f")
  [ "$lines" -gt 20 ] && echo "WARN: $f has $lines lines — may contain duplicated rules"
done

# 4. Confirm no project-specific technology names in agent definitions
grep -rn '\bReact\b\|\bDjango\b\|\bRails\b\|\bSpring\b\|\bLaravel\b' src/agents/ \
  && echo "FAIL — project-specific technology found in agents" || echo "OK"

# 5. Confirm all auth/multi-user rules carry the conditional qualifier
grep -n 'scope.*authenticated\|auth.*required\|multi.user' src/agents/*.md | \
  grep -v 'if applicable\|if auth\|per constitution\|constitution requires' \
  && echo "WARN — unconditional auth rule found" || echo "OK"
```

Run the full suite in one step:

```zsh
bash src/scripts/quality-check.sh
```

> If `src/scripts/quality-check.sh` is missing, generate it with:
> `/devops-agent Create quality-check.sh script that runs all library quality gates`

---

## Commit Convention

```
<type>(<scope>): <summary>

[body — what changed and why]

Refs: #<issue-number>
```

**Types:** `feat`, `fix`, `refactor`, `docs`, `chore`, `ci`

**Scopes:** `agents`, `skills`, `workflows`, `templates`, `scripts`, `docs`, `guides`

**Examples:**

```
feat(agents): add SLSA supply chain checks to security agent

Adds a new "Supply Chain" section to the Security Agent covering
SLSA levels 1–3. Existing OWASP checks are unchanged.

Refs: #42

fix(scripts): restore community files copy in install_github_templates()

The SECURITY.md copy step was removed in refactor #38. Re-adds it
and adds a regression test.

Refs: #51

refactor(agents): make auth rules conditional in all agents

Replaces hardcoded auth assumptions with (if applicable per constitution)
qualifiers across all agent definitions.

Refs: #67
```

---

## Getting Help

- **GitHub Issues** — open one and the Triage Agent will classify it
- **PR design questions** — comment `@architect-agent` on the PR
- **Canonical reference** — read `src/agents/` directly; the agent definitions
  are the authoritative source of truth for all agent behaviour

---

## Related Topics

- `src/seed/CONTRIBUTING.md` — contributing to a project that consumes QuorumKit
- `docs/INIT.md` — full slash-command and pipeline reference
- `docs/ENHANCEMENTS.md` — planned features and domain pack roadmap
- `docs/architecture/` — architectural decision records (ADRs)
