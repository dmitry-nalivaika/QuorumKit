# Brownfield Adoption Guide

Add QuorumKit to an **existing project** — one with running code, open issues,
an active CI pipeline, and a team that has not used AI agents before — without
disrupting any of it.

---

## Principles

1. **Additive only** — the installer adds files; it never modifies or deletes existing code
2. **Gradual rollout** — apply agents to new features first; legacy code is exempt until you choose otherwise
3. **No disruption** — existing CI pipelines keep running; agent workflows trigger only on demand
4. **Constitution first** — the constitution captures what the project *currently is*, not what it should become

---

## Step 0: Detect Conflicts Before You Install

Run this diagnostic **before** `init.sh`. It scans for every file the installer
might skip or conflict with, so you know exactly what to resolve before you begin.

```zsh
cd /path/to/your-existing-project

# ── Agent definitions ─────────────────────────────────────────────────────
echo "=== Existing agent files ==="
ls .claude/agents/ 2>/dev/null && echo "  → Claude agents found"   || echo "  → No .claude/agents/"
ls .github/agents/ 2>/dev/null && echo "  → Copilot agents found"  || echo "  → No .github/agents/"

# ── github-speckit ────────────────────────────────────────────────────────
echo "=== github-speckit ==="
[ -d .specify ] \
  && echo "  → .specify/ EXISTS — speckit already installed" \
  || echo "  → No .specify/ — speckit not yet installed"
[ -f .specify/memory/constitution.md ] \
  && echo "  → constitution.md EXISTS — will NOT be overwritten" \
  || echo "  → No constitution yet"

# ── GitHub workflows ──────────────────────────────────────────────────────
echo "=== Existing GitHub Actions workflows ==="
ls .github/workflows/ 2>/dev/null || echo "  → No workflows yet"

# ── Copilot instructions ──────────────────────────────────────────────────
echo "=== Copilot context files ==="
[ -f .github/copilot-instructions.md ] \
  && echo "  → copilot-instructions.md EXISTS — will NOT be overwritten" \
  || echo "  → No copilot-instructions.md"
ls .github/instructions/ 2>/dev/null && echo "  → Per-agent instructions found" || true

# ── CLAUDE.md ─────────────────────────────────────────────────────────────
echo "=== Claude context ==="
[ -f CLAUDE.md ] \
  && echo "  → CLAUDE.md EXISTS — will NOT be overwritten" \
  || echo "  → No CLAUDE.md"

# ── Community files ───────────────────────────────────────────────────────
echo "=== Community files ==="
[ -f CONTRIBUTING.md ] && echo "  → CONTRIBUTING.md EXISTS" || echo "  → No CONTRIBUTING.md"
[ -f SECURITY.md ]     && echo "  → SECURITY.md EXISTS"     || echo "  → No SECURITY.md"
```

### Reading the Output

| Output line | Meaning | Action |
|---|---|---|
| `.claude/agents/` or `.github/agents/` found | Existing agent definitions are present | See [Conflict: Existing Agents](#conflict-existing-agents) below |
| `.specify/` already exists | github-speckit is already installed | See [Conflict: Existing Speckit](#conflict-existing-speckit) below |
| `copilot-instructions.md` exists | Custom Copilot context is present | See [Conflict: Existing Copilot Instructions](#conflict-existing-copilot-instructions) below |
| `.github/workflows/` contains `agent-*.yml` | Previous agent workflows are present | See [Conflict: Existing Workflows](#conflict-existing-workflows) below |
| `CLAUDE.md` exists | Custom Claude context is present | See [Conflict: Existing CLAUDE.md](#conflict-existing-claudemd) below |

---

### Conflict: Existing Agents

`init.sh` skips existing agent files — your custom agents are preserved.

After running `init.sh`, compare your agents against the new versions manually:

```zsh
QUORUMKIT=/path/to/quorumkit

# Diff each agent against the latest version shipped with QuorumKit
for agent in ba-product-agent developer-agent qa-test-agent reviewer-agent \
             architect-agent devops-agent security-agent triage-agent; do
  echo ""
  echo "══ $agent ══"
  diff ".claude/agents/$agent.md" "$QUORUMKIT/src/agents/$agent.md" | head -30 \
    && echo "(no diff)" || true
done
```

**Choose a resolution based on your situation:**

| Situation | Resolution |
|-----------|-----------|
| Your version has domain-specific rules not in the new version | Keep your version; cherry-pick new rules manually |
| The new version has significant improvements you want | Copy the new version, then re-append your customisations under `## Project-Specific Extensions` |
| Both versions have the same rules worded differently | Prefer the new version for consistency; re-apply only intentional customisations |

> **Best practice**: keep customisations in a clearly marked `## Project-Specific Extensions`
> section at the bottom of each agent file. This makes future upgrades trivial — copy the
> new base, paste your extensions section back in.

---

### Conflict: Existing Speckit

`init.sh` does not touch `.specify/` — speckit runs separately and interactively.

**If github-speckit is already installed:**

```zsh
# Check the installed speckit version
cat .specify/extensions.yml 2>/dev/null | grep version || echo "No version info"

# Re-run speckit — it detects existing config and prompts before overwriting
npx github-speckit@latest
```

Answer **"no"** to any "overwrite existing file?" prompt to preserve your constitution
and custom templates.

**If your existing constitution is complete**, skip this step — the agents read it as-is.

**If your constitution is outdated or empty**, run `/speckit-constitution` in Claude Code
(or describe it to Copilot) to update it section by section.

---

### Conflict: Existing Copilot Instructions

`init.sh` skips `copilot-instructions.md` when the file already exists. Compare your version against the template:

```zsh
diff .github/copilot-instructions.md \
     /path/to/quorumkit/src/seed/copilot-instructions.md
```

The QuorumKit template adds:
- A pointer to agent definitions in `.github/agents/`
- Standard activation phrases for each agent role

**Resolution**: merge the two files. Prepend the agent pointer block from the template to your existing file, then keep all your existing project context below it.

---

### Conflict: Existing Workflows

`init.sh` skips any workflow file that already exists. Before running the installer,
preview which files it will install versus skip:

```zsh
# Preview: see which workflow files would be installed vs skipped
for wf in /path/to/quorumkit/src/.github/workflows/*.yml; do
  wf_name="$(basename "$wf")"
  [ -f ".github/workflows/$wf_name" ] \
    && echo "SKIP (exists): $wf_name" \
    || echo "INSTALL:       $wf_name"
done
```

**Common scenarios:**

1. **`agent-*.yml` from an older QuorumKit version** — compare and update manually; current versions use a simpler delegation-only model.
2. **A non-QuorumKit workflow with the same name** — rename your file first, run `init.sh`, then reconcile the two versions.
3. **Unrelated workflows (`ci.yml`, `test.yml`, etc.)** — no conflict; agent workflows trigger only on PR comments, not on push or schedule.

---

### Conflict: Existing CLAUDE.md

`init.sh` skips `CLAUDE.md` when the file already exists. The QuorumKit template is
minimal — it only contributes `<!-- SPECKIT START/END -->` tags, which speckit uses
to inject constitution context at runtime.

Check whether your CLAUDE.md already contains these tags:

```zsh
grep -q 'SPECKIT START' CLAUDE.md \
  && echo "Speckit tags present — no action needed" \
  || echo "Speckit tags missing — add them (see below)"
```

If the tags are missing, add them anywhere in your CLAUDE.md:

```markdown
<!-- SPECKIT START -->
<!-- speckit will inject constitution content here at runtime -->
<!-- SPECKIT END -->
```

---

## Step 1: Run the Initialiser

```bash
cd /path/to/your-existing-project

# Pick the mode that matches your team
bash /path/to/quorumkit/scripts/init.sh --ai=both       # Claude Code + GitHub Copilot
bash /path/to/quorumkit/scripts/init.sh --ai=claude     # Claude Code only (default)
bash /path/to/quorumkit/scripts/init.sh --ai=copilot    # GitHub Copilot only

# Optional: add the industrial domain pack (OT/ICS agent extensions)
bash /path/to/quorumkit/scripts/init.sh --ai=both --domain=industrial
```

The installer skips every file that already exists — workflows, PR templates,
`CLAUDE.md`, `copilot-instructions.md`, and all agent definitions.

### Files added to your repository

| Path | Notes |
|------|-------|
| `.claude/agents/` | Agent definitions (Claude mode) |
| `.claude/skills/` | Slash commands (Claude mode) |
| `CLAUDE.md` | Claude Code context (skipped if present) |
| `.github/agents/` | Agent definitions (Copilot mode) |
| `.github/copilot-instructions.md` | Copilot workspace context (skipped if present) |
| `.github/instructions/` | Per-agent Copilot instructions |
| `.github/workflows/agent-*.yml` | Claude agent workflows (skipped if present) |
| `.github/workflows/copilot-agent-*.yml` | Copilot agent workflows (skipped if present) |
| `.github/pull_request_template.md` | PR template (skipped if present) |
| `.github/ISSUE_TEMPLATE/` | Issue templates (individual files skipped if present) |

**The installer never touches `src/`, `lib/`, `app/`, or any existing CI workflow.**

---

## Step 2: Initialise github-speckit

```bash
npx github-speckit@latest
```

When prompted:
- **AI integration**: `claude` (Claude Code) or `copilot` (GitHub Copilot) or `both`
- **Branch numbering**: `sequential` (recommended) or `timestamp`
- **Context file**: accept the default (`CLAUDE.md`)

This creates the `.specify/` directory:

```
.specify/
  memory/
    constitution.md     ← fill this in Step 3
  templates/            ← spec, plan, and tasks templates
  extensions.yml        ← hook configuration (auto-commit, etc.)
  feature.json          ← tracks the active feature spec
  scripts/              ← speckit helper scripts
```

> **Re-running on a project where speckit is already installed**: speckit detects existing
> configuration and prompts before overwriting. Answer **"no"** to preserve your constitution
> and custom templates.

---

## Step 3: Write the Project Constitution

The constitution captures your project's **current** reality — not aspirational targets.
Run:

```
/speckit-constitution
```

The command walks you through each section interactively:

| Section | What to enter for a brownfield project |
|---------|----------------------------------------|
| Project name & vision | Use the existing product description |
| Technology stack | List only what is actually in use — omit aspirational tech |
| Quality standards | Use your current test coverage percentage — you can raise it later |
| Authentication / multi-user | Describe the authentication that actually exists |
| Environment names | Use your existing environment names (prod, staging, dev, etc.) |
| Cost limits | Use current monthly spend as the baseline |
| Agent roles | Accept defaults; add project-specific extensions after setup |

> **Critical**: record current state honestly. An aspirational constitution
> causes every agent review to fail on PRs that touch legacy code.

---

## Step 4: Handle Existing CI Pipelines

**Option A — Run agents alongside existing CI (recommended)**

Agent workflows (`agent-*.yml`, `copilot-agent-*.yml`) trigger only on PR comments
(e.g. `@qa-agent run`). They do not run on push, schedule, or any other event that
would interfere with your existing CI. No changes to your existing pipeline are needed.

**Option B — Replace legacy CI with agent-driven CI**

Proceed only after the DevOps Agent reviews your existing pipeline:

```
/devops-agent Review CI pipeline
```

The DevOps Agent identifies what to preserve and what the agent workflows can replace.

---

## Step 5: Handle Existing GitHub Issues

Existing issues do **not** need specs. Apply the gradual rollout rule:

| Issue type | Action |
|-----------|--------|
| New bug report | The Triage Agent classifies it automatically; skip the spec if the fix is trivial |
| New feature request | Use the full workflow: BA Agent → spec → dev → review |
| Existing open feature | Write a retroactive spec if useful; it is not required |
| Existing open bug | Fix it; reference the issue in the PR; no spec required |

To retroactively link an existing issue to a spec:

```bash
gh issue comment <number> --body "Spec created: specs/NNN-feature/spec.md"
```

---

## Step 6: Gradual Rollout Strategy

### Phase 1 — Week 1–2: Observe

- Run `init.sh` and write the constitution
- Enable the Triage Agent only — it runs automatically on new issues
- Let the team read this guide and grow familiar with the label taxonomy

### Phase 2 — Week 3–4: New features only

- Apply the full workflow (BA Agent → dev → Reviewer + QA) to **new** feature branches
- Exempt legacy bug fixes from spec requirements

### Phase 3 — Month 2 and beyond: Full coverage

- Require Reviewer Agent sign-off on all PRs
- Run the Security Agent on every PR that touches authentication, data access, or API surface
- Incrementally raise the constitution's test coverage threshold (for example, +5% per sprint)

---

## Handling Legacy Code in Agent Reviews

When the Reviewer or QA Agent evaluates a PR that touches legacy code with no spec:

1. Note in the PR description: *"This change touches legacy code — no spec exists. See Issue #N for context."*
2. The Reviewer Agent flags spec-compliance items as `SUGGESTION:` (not `BLOCKER:`) when no `spec.md` is found.
3. The QA Agent skips manual acceptance-scenario checks and notes the omission in the QA Report.

To explicitly exclude a legacy path from spec-compliance enforcement, add a policy block to
your constitution:

```markdown
## Legacy Code Policy

Code in `[module/path]` predates this constitution. Spec compliance is not enforced
for changes to that code unless they introduce new user-facing behaviour.
```

---

## Existing Architecture Without ADRs

The Architect Agent treats **existing patterns as implicit ADRs** — it does not block PRs
that follow established patterns, even undocumented ones.

To document an existing decision as a retroactive ADR:

```
/architect-agent Create ADR for our current authentication approach
```

Retroactive ADRs use status `"Accepted (retroactive)"` and are stored at
`docs/architecture/adr-NNN-<slug>.md`.

---

## Setup Checklist

- [ ] `init.sh` completed without errors
- [ ] `.specify/` directory created by `npx github-speckit@latest`
- [ ] `.specify/memory/constitution.md` filled in and reflecting current project reality
- [ ] `ANTHROPIC_API_KEY` added to GitHub repository secrets (Claude mode)
- [ ] Copilot enabled for the repository (Copilot mode)
- [ ] Team has read this guide and `CONTRIBUTING.md`
- [ ] Triage Agent smoke-tested: open a test issue and confirm labels are applied
- [ ] Phase 1 rollout started: new issues trigger automatic triage

---

## Related Topics

- [Getting started on a new project](INIT.md) — the greenfield setup path
- [Contributing](../CONTRIBUTING.md) — spec-driven development workflow for contributors
- [Agent Protocol](AGENT_PROTOCOL.md) — how agents communicate and hand off work
- [Migration Guide](MIGRATION.md) — upgrading from a previous version of QuorumKit
