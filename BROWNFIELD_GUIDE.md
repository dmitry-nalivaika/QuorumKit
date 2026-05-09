# Brownfield Adoption Guide

How to introduce the QuorumKit into a **project that already exists** —
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

## Step 0: Detect Conflicts Before You Install

Run this diagnostic **before** `init.sh` to understand exactly what already exists
in your project. This prevents surprises and tells you which conflicts need manual
resolution.

```zsh
cd /path/to/your-existing-project

# ── Agent definitions ──────────────────────────────────────────────────────
echo "=== Existing agent files ==="
ls .claude/agents/ 2>/dev/null && echo "  → Claude agents found" || echo "  → No .claude/agents/"
ls .github/agents/ 2>/dev/null && echo "  → Copilot agents found" || echo "  → No .github/agents/"

# ── github-speckit ─────────────────────────────────────────────────────────
echo "=== github-speckit ==="
[ -d .specify ] && echo "  → .specify/ directory EXISTS — speckit already installed" \
               || echo "  → No .specify/ — speckit not yet installed"
[ -f .specify/memory/constitution.md ] && echo "  → constitution.md EXISTS — will NOT be overwritten" \
                                       || echo "  → No constitution yet"

# ── GitHub workflows ────────────────────────────────────────────────────────
echo "=== Existing GitHub Actions workflows ==="
ls .github/workflows/ 2>/dev/null || echo "  → No workflows yet"

# ── Copilot instructions ────────────────────────────────────────────────────
echo "=== Copilot context files ==="
[ -f .github/copilot-instructions.md ] \
  && echo "  → copilot-instructions.md EXISTS — will NOT be overwritten" \
  || echo "  → No copilot-instructions.md"
ls .github/instructions/ 2>/dev/null && echo "  → Per-agent instructions found" || true

# ── CLAUDE.md ───────────────────────────────────────────────────────────────
echo "=== Claude context ==="
[ -f CLAUDE.md ] && echo "  → CLAUDE.md EXISTS — will NOT be overwritten" \
               || echo "  → No CLAUDE.md"

# ── Community files ─────────────────────────────────────────────────────────
echo "=== Community files ==="
[ -f CONTRIBUTING.md ] && echo "  → CONTRIBUTING.md EXISTS" || echo "  → No CONTRIBUTING.md"
[ -f SECURITY.md ]      && echo "  → SECURITY.md EXISTS"     || echo "  → No SECURITY.md"
```

### Reading the Conflict Report

| What you see | What it means | What to do |
|---|---|---|
| `.claude/agents/` or `.github/agents/` found | You have existing agent definitions | See [Existing Agents](#conflict-existing-agents) below |
| `.specify/` already exists | github-speckit is already installed | See [Existing Speckit](#conflict-existing-speckit) below |
| `copilot-instructions.md` exists | Custom Copilot context exists | See [Existing Copilot Instructions](#conflict-existing-copilot-instructions) below |
| Existing `.github/workflows/` with `agent-*.yml` | Previous agent workflows exist | See [Existing Workflows](#conflict-existing-workflows) below |
| `CLAUDE.md` exists | Custom Claude context exists | See [Existing CLAUDE.md](#conflict-existing-claudemd) below |

---

### Conflict: Existing Agents {#conflict-existing-agents}

`init.sh` **skips** existing agent files — your custom agents are safe.

After running `init.sh`, compare manually:

```zsh
APM=/path/to/quorumkit

# Show diff between your current agent and the new version
for agent in ba-product-agent developer-agent qa-test-agent reviewer-agent \
             architect-agent devops-agent security-agent triage-agent; do
  echo ""
  echo "══ $agent ══"
  diff ".claude/agents/$agent.md" "$APM/.apm/agents/$agent.md" | head -30 \
    && echo "(no diff)" || true
done
```

**Resolution options:**

| Situation | Resolution |
|-----------|-----------|
| Your version has domain-specific rules not in the new version | Keep your version — it has valuable customisation; cherry-pick specific new rules manually |
| New version has significant improvements you want | Copy new version, then re-add your customisations at the bottom under `## Project-Specific Extensions` |
| Both have the same rules but worded differently | Prefer the new version for consistency; update only the sections you intentionally customised |

> **Best practice**: keep customisations in a clearly marked `## Project-Specific Extensions`
> section at the bottom of each agent file. This makes future upgrades trivial — copy the
> new base, paste your extensions section back in.

---

### Conflict: Existing Speckit {#conflict-existing-speckit}

`init.sh` does not touch `.specify/` — speckit is run separately and is interactive.

**If you already have github-speckit installed:**

```zsh
# Check the existing speckit version
cat .specify/extensions.yml 2>/dev/null | grep version || echo "No version info"

# Re-run speckit — it will detect existing config and ask before overwriting
npx github-speckit@latest
```

Answer **"no"** to any "overwrite existing file?" prompt to preserve your constitution
and custom templates.

**If your existing constitution is complete:** you do not need to re-run speckit at
all — the agents will read it as-is.

**If your constitution is outdated or empty:** run `/speckit-constitution` in Claude
Code (or describe it to Copilot) to update it section by section.

---

### Conflict: Existing Copilot Instructions {#conflict-existing-copilot-instructions}

`init.sh` skips `copilot-instructions.md` if it exists. Compare manually:

```zsh
diff .github/copilot-instructions.md \
     /path/to/quorumkit/templates/seed/copilot-instructions.md
```

The APM template `copilot-instructions.md` adds:
- A pointer to the agent definitions in `.github/agents/`
- Standard activation phrases for each agent role

**Resolution**: merge the two files. Add the agent pointer block from the template
to the top of your existing file, then keep all your existing project context below.

---

### Conflict: Existing Workflows {#conflict-existing-workflows}

`init.sh` skips any workflow file that already exists.

Scenarios:
1. **You have `agent-*.yml` from a previous version of APM** — compare and update
   manually; the new versions are delegation-only (simpler).
2. **You have a non-APM workflow with the same name** — rename yours first, then run
   `init.sh`, then reconcile.
3. **You have a `ci.yml` or `test.yml`** — no conflict; agent workflows are
   independently triggered by PR comments.

```zsh
# See which workflows would be skipped
for wf in /path/to/quorumkit/templates/github/workflows/*.yml; do
  wf_name="$(basename "$wf")"
  [ -f ".github/workflows/$wf_name" ] \
    && echo "SKIP (exists): $wf_name" \
    || echo "INSTALL:       $wf_name"
done
```

---

### Conflict: Existing CLAUDE.md {#conflict-existing-claudemd}

`init.sh` skips `CLAUDE.md` if it exists. The APM template CLAUDE.md is minimal —
it only adds `<!-- SPECKIT START/END -->` tags for constitution injection.

Check whether your existing CLAUDE.md has the speckit tags:

```zsh
grep -q 'SPECKIT START' CLAUDE.md \
  && echo "Speckit tags present — no action needed" \
  || echo "Add speckit tags — see below"
```

If tags are missing, add them anywhere in your CLAUDE.md:

```markdown
<!-- SPECKIT START -->
[speckit will inject constitution content here]
<!-- SPECKIT END -->
```

---

## Step 1: Run the Initialiser

```bash
cd /path/to/your-existing-project

# Choose the mode that matches your team
bash /path/to/quorumkit/installer/init.sh --ai=both     # Claude + Copilot
bash /path/to/quorumkit/installer/init.sh --ai=claude   # Claude Code only
bash /path/to/quorumkit/installer/init.sh --ai=copilot  # GitHub Copilot only
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
