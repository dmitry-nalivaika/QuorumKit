# Brownfield Adoption Guide

How to introduce the Agentic Dev Stack into a **project that already exists** —
with existing code, existing issues, possibly an existing CI pipeline, and a team
that has not used AI agents before.

---

## Principles

1. **Additive only** — the stack adds files; it does not modify or delete existing code
2. **Gradual rollout** — apply agents to new features first; legacy code is exempt
3. **No disruption** — existing CI pipelines are not replaced; agents integrate alongside them
4. **Constitution first** — the constitution captures what the project already is,
   not what it should become

---

## Step 1: Run the Initialiser

```bash
cd /path/to/your-existing-project

# Choose the mode that matches your team
bash /path/to/agentic-dev-stack/scripts/init.sh --ai=both     # Claude + Copilot
bash /path/to/agentic-dev-stack/scripts/init.sh --ai=claude   # Claude Code only
bash /path/to/agentic-dev-stack/scripts/init.sh --ai=copilot  # GitHub Copilot only
```

The script is safe to run on existing projects — it **skips any file that already
exists** (workflows, PR templates, CLAUDE.md, etc.).

### What changes in your repository

| Added | Notes |
|-------|-------|
| `.claude/agents/` | Agent definitions (Claude mode) |
| `.claude/skills/` | Slash commands (Claude mode) |
| `CLAUDE.md` | Claude Code context (only if absent) |
| `.github/agents/` | Agent definitions (Copilot mode) |
| `.github/copilot-instructions.md` | Copilot workspace context (only if absent) |
| `.github/instructions/` | Per-agent Copilot instructions |
| `.github/workflows/agent-*.yml` | Claude agent workflows (skipped if exist) |
| `.github/workflows/copilot-agent-*.yml` | Copilot agent workflows (skipped if exist) |
| `.github/pull_request_template.md` | PR template (skipped if exists) |
| `.github/ISSUE_TEMPLATE/` | Issue templates (individual files skipped if exist) |

**Nothing in `src/`, `lib/`, `app/`, or existing CI workflows is touched.**

---

## Step 2: Initialise github-speckit (Claude mode only)

```bash
npx github-speckit@latest
```

When prompted:
- **AI integration**: `claude` (or `copilot` if Copilot-only mode)
- **Branch numbering**: `sequential` (recommended) or `timestamp`
- **Context file**: accept default (`CLAUDE.md`)

This creates the `.specify/` directory:

```
.specify/
  memory/
    constitution.md        ← you will fill this in Step 3
  templates/               ← spec, plan, tasks templates
  extensions.yml           ← hook configuration (auto-commit, etc.)
  feature.json             ← tracks the active feature spec
  scripts/                 ← speckit helper scripts
```

> **If `.specify/` already exists** (re-running on a project that already has
> speckit): speckit will detect existing configuration and prompt before overwriting.
> Answer "no" to overwrite prompts to preserve your existing constitution.

---

## Step 3: Write the Project Constitution

The constitution captures your project's **current** reality — not aspirational targets.
Run:

```
/speckit-constitution
```

You will be guided through:

| Section | Guidance for brownfield |
|---------|------------------------|
| Project name & vision | Use the existing product description |
| Technology stack | List what is actually in use (don't add aspirational tech) |
| Quality standards | Use your **current** coverage % as the threshold — raise it later |
| Authentication / multi-user | Describe what actually exists |
| Environment names | Use your existing names (prod, staging, dev, or whatever you have) |
| Cost limits | Use current monthly spend as baseline |
| Agent roles | Accept defaults; customise later |

> **Key rule**: be honest about the current state. An aspirational constitution
> causes every agent review to block PRs that touch legacy code.

---

## Step 4: Handle Existing CI Pipelines

If you already have CI workflows in `.github/workflows/`:

**Option A — Run agents alongside existing CI** (recommended)
The agent workflows (`agent-*.yml`, `copilot-agent-*.yml`) are triggered by PR
comments (`@qa-agent`, etc.) — they do not conflict with always-on CI pipelines.
No changes needed.

**Option B — Replace legacy CI with agent-driven CI**
Only do this after the DevOps Agent has reviewed the existing pipeline:
```
/devops-agent Review CI pipeline
```
The DevOps Agent will identify what to preserve and what can be replaced.

---

## Step 5: Handle Existing GitHub Issues

Existing issues do **not** need specs. Apply the gradual rollout rule:

| Issue type | What to do |
|-----------|-----------|
| New bug report | Triage Agent handles automatically; fix may skip spec if trivial |
| New feature request | Full workflow: BA Agent → spec → dev → review |
| Existing open feature | Optionally write a retroactive spec; not required |
| Existing open bug | Fix it; reference the issue in the PR; no spec required |

To retroactively link an existing issue to a spec you've created:
```
gh issue comment <number> --body "Spec created: specs/NNN-feature/spec.md"
```

---

## Step 6: Gradual Rollout Strategy

### Phase 1 (Week 1–2): Observe
- Install the stack (`init.sh`)
- Write the constitution
- Enable triage agent only (it auto-runs on new issues)
- Let the team get familiar with the label taxonomy

### Phase 2 (Week 3–4): New features only
- Apply full workflow (BA → dev → reviewer + QA) to **new** feature branches
- Legacy bug fixes exempt

### Phase 3 (Month 2+): Full coverage
- All PRs reviewed by Reviewer Agent
- Security Agent on every PR touching auth/data/API
- Raise constitution coverage threshold gradually (e.g., +5% per sprint)

---

## Handling Legacy Code in Agent Reviews

When the Reviewer or QA Agent reviews a PR that touches legacy code without a spec:

1. The PR description should note: *"This change touches legacy code — no spec exists.
   See Issue #N for context."*
2. The Reviewer Agent will flag spec-compliance items as `SUGGESTION:` (not `BLOCKER:`)
   when no spec.md is found
3. The QA Agent will skip manual acceptance scenario checks if no spec.md is found
   and note this in the QA Report

You can also add a note to the constitution:
```
## Legacy Code Policy
Code in [module/path] predates this constitution. Spec compliance is not enforced
for changes to legacy code unless they introduce new user-facing behaviour.
```

---

## Existing Architecture Without ADRs

When the Architect Agent reviews a PR on a brownfield project:

1. It treats **existing patterns as implicit ADRs** — it will not block PRs for
   following existing patterns, even undocumented ones
2. If you ask it to document existing decisions:
   ```
   /architect-agent Create ADR for our current authentication approach
   ```
3. Retroactive ADRs use status `"Accepted (retroactive)"` and are stored at
   `docs/architecture/adr-NNN-<slug>.md`

---

## Checklist: Brownfield Setup Complete

- [ ] `init.sh` run successfully
- [ ] `.specify/` directory created by `npx github-speckit@latest`
- [ ] `.specify/memory/constitution.md` filled and reflecting current project reality
- [ ] `ANTHROPIC_API_KEY` added to GitHub repository secrets (Claude mode)
- [ ] Copilot enabled for the repository (Copilot mode)
- [ ] Team has read this guide and `CONTRIBUTING.md`
- [ ] Triage Agent tested: open a test issue and verify labels are applied
- [ ] Phase 1 rollout started (new issues trigger triage)
