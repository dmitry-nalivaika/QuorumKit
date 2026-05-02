# Initialization Guide

How to set up the full agentic development environment — for **greenfield** (new
projects) and **brownfield** (existing projects), using **Claude Code**,
**GitHub Copilot**, or **both**.

> **Brownfield project?** Jump straight to [BROWNFIELD_GUIDE.md](BROWNFIELD_GUIDE.md)
> for step-by-step guidance on adopting the stack in an existing codebase.

---

## Prerequisites

| Tool | Purpose | Install |
|------|---------|---------|
| Git | Version control | Pre-installed on most systems |
| [GitHub CLI (`gh`)](https://cli.github.com) | Agent workflows, PR/issue commands | `brew install gh` |
| [Node.js ≥ 18](https://nodejs.org) | github-speckit | nodejs.org |
| [Claude Code](https://claude.ai/code) | Claude AI CLI (Claude mode only) | `npm i -g @anthropic-ai/claude-code` |
| GitHub Copilot subscription | Copilot agents (Copilot mode only) | [github.com/features/copilot](https://github.com/features/copilot) |

Install only the tools for the mode(s) you are using.

---

## One-Command Setup

```zsh
# 1. Navigate to your project directory (create it first if greenfield)
mkdir -p /path/to/my-project && cd /path/to/my-project

# 2. Run init — choose your AI mode
bash ~/path/to/agentic-dev-stack/scripts/init.sh                                # Claude only (default)
bash ~/path/to/agentic-dev-stack/scripts/init.sh --ai=copilot                   # Copilot only
bash ~/path/to/agentic-dev-stack/scripts/init.sh --ai=both                      # Both (universal)
bash ~/path/to/agentic-dev-stack/scripts/init.sh --ai=both --domain=industrial  # Both + industrial pack
```

The script is **idempotent** — it skips any file that already exists, making it
safe to re-run on existing projects.

### What each mode installs

| Artifact | `--ai=claude` | `--ai=copilot` | `--ai=both` | `+--domain=industrial` |
|----------|:---:|:---:|:---:|:---:|
| `.claude/agents/` — 11 universal agents | ✓ | — | ✓ | ✓ |
| `.claude/agents/` — 4 industrial agents | — | — | — | ✓ |
| `.claude/skills/` — slash commands | ✓ | — | ✓ | ✓ |
| `CLAUDE.md` | ✓ | — | ✓ | ✓ |
| `.github/agents/` — agent definitions | — | ✓ | ✓ | ✓ |
| `.github/copilot-instructions.md` | — | ✓ | ✓ | ✓ |
| `.github/instructions/*.instructions.md` | — | ✓ | ✓ | ✓ |
| `agent-*.yml` workflows — 11 universal | ✓ | — | ✓ | ✓ |
| `agent-*.yml` workflows — 4 industrial | — | — | — | ✓ |
| `copilot-agent-*.yml` — 11 universal | — | ✓ | ✓ | ✓ |
| `copilot-agent-*.yml` — 4 industrial | — | — | — | ✓ |
| `alert-to-issue.yml` (always) | ✓ | ✓ | ✓ | ✓ |
| PR template, issue templates | ✓ | ✓ | ✓ | ✓ |
| `github-speckit` initialisation | ✓ | — | ✓ | ✓ |

---

## github-speckit — What It Creates

`github-speckit` creates the `.specify/` directory that all agents depend on:

```
.specify/
  memory/
    constitution.md        ← project governance document (you fill this)
  templates/
    spec-template.md       ← spec.md structure template
    plan-template.md       ← plan.md structure template
    tasks-template.md      ← tasks.md structure template
    constitution-template.md
  extensions.yml           ← hook configuration (auto-commit, etc.)
  extensions/
    git/
      git-config.yml       ← git auto-commit settings
  feature.json             ← tracks the currently active feature spec
  scripts/
    bash/                  ← speckit helper scripts (do not edit)
```

### Running github-speckit

```zsh
npx github-speckit@latest
```

Prompts and recommended answers:

| Prompt | Claude mode | Copilot mode | Both |
|--------|-------------|--------------|------|
| AI integration | `claude` | `copilot` | `claude` |
| Branch numbering | `sequential` | `sequential` | `sequential` |
| Context file | `CLAUDE.md` (default) | `.github/copilot-instructions.md` | `CLAUDE.md` (default) |
| Script type | `sh` (macOS/Linux) | `sh` (macOS/Linux) | `sh` (macOS/Linux) |

> **Re-running on an existing project**: speckit detects existing config and
> prompts before overwriting. Answer **no** to preserve your existing constitution.

### The `feature.json` file

Every agent reads `.specify/feature.json` to find the active spec. It looks like:

```json
{
  "featureDir": "specs/042-user-auth",
  "specFile": "specs/042-user-auth/spec.md",
  "branch": "042-user-auth"
}
```

It is updated automatically when you run `/speckit-specify` or `/speckit-git-feature`.
To set it manually:

```zsh
echo '{"featureDir":"specs/042-user-auth","specFile":"specs/042-user-auth/spec.md","branch":"042-user-auth"}' \
  > .specify/feature.json
```

---

## Spec and Branch Naming Convention

The **GitHub Issue number** is the single source of truth for linking specs,
branches, and issues:

| Artifact | Convention | Example (Issue #42) |
|----------|-----------|---------------------|
| Spec directory | `specs/NNN-short-slug/` | `specs/042-user-auth/` |
| Feature branch | `NNN-short-slug` | `042-user-auth` |
| spec.md | `specs/NNN-short-slug/spec.md` | `specs/042-user-auth/spec.md` |
| plan.md | `specs/NNN-short-slug/plan.md` | — |
| tasks.md | `specs/NNN-short-slug/tasks.md` | — |

NNN = Issue number, **zero-padded to 3 digits**.

---

## Manual Setup (Step-by-Step)

### Claude Code

```zsh
# Step 1: Agents and skills
mkdir -p .claude/agents .claude/skills
cp -r /path/to/agentic-dev-stack/.apm/agents/* .claude/agents/
for skill in /path/to/agentic-dev-stack/.apm/skills/*/; do
  skill_name="$(basename "$skill")"
  mkdir -p ".claude/skills/$skill_name"
  cp "$skill/SKILL.md" ".claude/skills/$skill_name/SKILL.md"
done

# Step 2: CLAUDE.md
cp /path/to/agentic-dev-stack/templates/CLAUDE.md CLAUDE.md

# Step 3: GitHub templates
mkdir -p .github/workflows .github/ISSUE_TEMPLATE
cp /path/to/agentic-dev-stack/templates/github/workflows/agent-*.yml .github/workflows/
cp /path/to/agentic-dev-stack/templates/github/pull_request_template.md .github/
cp /path/to/agentic-dev-stack/templates/github/ISSUE_TEMPLATE/* .github/ISSUE_TEMPLATE/
cp /path/to/agentic-dev-stack/templates/CONTRIBUTING.md CONTRIBUTING.md
cp /path/to/agentic-dev-stack/templates/SECURITY.md SECURITY.md

# Step 4: github-speckit
npx github-speckit@latest
# Choose: claude / sequential / CLAUDE.md / sh

# Step 5: Git
git init && git add . && git commit -m "chore: initialize agentic dev stack"
```

### GitHub Copilot

```zsh
# Step 1: Agent definitions
mkdir -p .github/agents
cp -r /path/to/agentic-dev-stack/.apm/agents/* .github/agents/

# Step 2: Copilot context and instructions
mkdir -p .github/instructions
cp /path/to/agentic-dev-stack/templates/copilot-instructions.md .github/copilot-instructions.md
cp /path/to/agentic-dev-stack/templates/github/instructions/*.instructions.md .github/instructions/

# Step 3: GitHub templates
mkdir -p .github/workflows .github/ISSUE_TEMPLATE
cp /path/to/agentic-dev-stack/templates/github/workflows/copilot-agent-*.yml .github/workflows/
cp /path/to/agentic-dev-stack/templates/github/pull_request_template.md .github/
cp /path/to/agentic-dev-stack/templates/github/ISSUE_TEMPLATE/* .github/ISSUE_TEMPLATE/
cp /path/to/agentic-dev-stack/templates/CONTRIBUTING.md CONTRIBUTING.md
cp /path/to/agentic-dev-stack/templates/SECURITY.md SECURITY.md

# Step 4: Git
git init && git add . && git commit -m "chore: initialize agentic dev stack"
```

---

## Post-Initialization Setup

### 1. Add secrets to GitHub

**Claude mode** — add to Settings → Secrets and variables → Actions:
```
ANTHROPIC_API_KEY = <your key from console.anthropic.com>
```

**Copilot mode** — no secrets needed. Workflows use `secrets.GITHUB_TOKEN`
(auto-provided) and `permissions: models: read`. Ensure the repository has a
Copilot license active.

### 2. Write the Project Constitution

```
/speckit-constitution
```

You will be guided through:

| Section | What to provide |
|---------|----------------|
| Project name and vision | What is this system and who uses it? |
| Technology stack | Languages, frameworks, cloud platform |
| Quality standards | Coverage threshold (e.g. 80%), linting tools |
| Authentication / multi-user | Does this project have login / multiple users? |
| Environment names | What are your env names? (e.g. dev / staging / production) |
| Cost limits | Monthly budget limit (if applicable) |
| SLOs | Uptime and response time targets (if applicable) |

The constitution is saved to `.specify/memory/constitution.md`. All agents read
it at every session start and treat it as non-negotiable.

### 3. Copy additional templates to your project root

```zsh
cp /path/to/agentic-dev-stack/templates/CONTRIBUTING.md CONTRIBUTING.md
cp /path/to/agentic-dev-stack/templates/SECURITY.md SECURITY.md
```

Edit `SECURITY.md` to replace `[security@your-domain.com]` with your actual contact.

### 4. Configure Branch Protection (Recommended)

```zsh
gh api repos/:owner/:repo/branches/main/protection \
  --method PUT \
  --field required_pull_request_reviews='{"required_approving_review_count":1}' \
  --field required_status_checks='{"strict":true,"contexts":["CI"]}' \
  --field enforce_admins=false \
  --field restrictions=null
```

Replace `"CI"` with the name of your status check job.

### 5. Enable Auto-Commit Hooks (Optional)

Edit `.specify/extensions/git/git-config.yml`:

```yaml
auto_commit:
  default: false
  after_specify:
    enabled: true
    message: "[Spec Kit] Add specification"
  after_plan:
    enabled: true
    message: "[Spec Kit] Add implementation plan"
```

---

## First Feature Workflow (Greenfield)

### 1. Create a GitHub Issue

Open a Feature Request issue. The Triage Agent classifies it automatically.
Note the issue number — it becomes the NNN prefix for everything below.

### 2. Write the Spec

```
/ba-agent Add user authentication with email/password login
```

The BA Agent creates `specs/042-user-auth/spec.md` (using the issue number).
Review it, then confirm handoff:

```
/ba-agent clarify
```

### 3. Create the Feature Branch

```zsh
git checkout -b 042-user-auth
```

Or via speckit:

```
/speckit-git-feature
```

### 4. Implement

```
/dev-agent Implement the spec at specs/042-user-auth/spec.md
```

The Developer Agent will:
1. Create `specs/042-user-auth/plan.md` (with Constitution Check)
2. Create `specs/042-user-auth/tasks.md`
3. Implement each task using TDD — test first, then code, then commit

### 5. Open a PR

Push the branch and open a PR using the PR template. Link the spec and issue.

### 6. Request Agent Reviews

```
@reviewer-agent      ← spec + constitution compliance
@qa-agent            ← quality gates + acceptance scenarios
@security-agent      ← OWASP review (for auth/data/API changes)
@architect-agent     ← architectural review (for significant design changes)
```

### 7. Merge

Once all agents approve and CI passes, merge. The following then run automatically:

- **Release Agent** — analyses commits since last tag, opens a Version Bump PR (semver + CHANGELOG)
- **Docs Agent** — audits documentation changes, opens a Docs PR if anything needs updating
- **Triage Agent** — any production alert fired via `alert-to-issue.yml` becomes a new routed Issue

### Lifecycle commands (available any time)

```
/release-agent           ← calculate semver + open Version Bump PR
/release-agent minor     ← override bump type (patch | minor | major)
/docs-agent              ← audit and sync all documentation
/docs-agent 42           ← audit docs impact of PR #42
/tech-debt-agent         ← run full codebase health review
/tech-debt-agent complexity   ← focus on one area
/onboard                 ← guided 7-step onboarding wizard (for new team members)
```

---

## Customising Agents

After initialisation, customise agents for your project:

| Mode | Agent location |
|------|---------------|
| Claude | `.claude/agents/<agent-name>.md` |
| Copilot | `.github/agents/<agent-name>.md` |

> The source definitions in `.apm/agents/` are **platform-agnostic and shared**.
> Edits to `.claude/agents/` or `.github/agents/` are local to your project.

Common customisations:
- Add domain-specific rules (`every DB query must include tenant_id`)
- Add project-specific toolchain commands (`cargo test --workspace`, `go test ./...`)
- Reference project architecture docs (`docs/architecture/overview.md`)
- Adjust coverage threshold after establishing a baseline

---

## Updating the Package

```zsh
# Re-run init (skips existing files)
bash /path/to/agentic-dev-stack/scripts/init.sh --ai=both

# Or update a single agent
cp /path/to/agentic-dev-stack/.apm/agents/security-agent.md .claude/agents/
cp /path/to/agentic-dev-stack/.apm/agents/security-agent.md .github/agents/
```

---

## Troubleshooting

### `/speckit-*` commands not working

The speckit commands require the `.specify/` directory. If it is missing:

```zsh
npx github-speckit@latest
```

### Agents not loading in Claude Code

Verify the directories exist at the project root:

```zsh
ls .claude/agents/
ls .claude/skills/
```

Claude Code looks for these relative to where `CLAUDE.md` lives.

### Copilot not following agent instructions

- Ensure `.github/copilot-instructions.md` exists (Copilot reads this automatically)
- For an interactive session, explicitly activate the agent:
  > "Read `.github/agents/developer-agent.md` in full, then help me implement..."

### GitHub Actions workflows not triggering

**Claude workflows**: check `ANTHROPIC_API_KEY` is set in repository secrets.

**Copilot workflows**: check the repository has an active Copilot licence;
check Actions → workflow run logs.

### Constitution not found

```
/speckit-constitution
```

Creates `.specify/memory/constitution.md` from the template.

### feature.json out of sync

If agents cannot find the active spec, reset feature.json:

```zsh
echo '{"featureDir":"specs/NNN-short-slug","specFile":"specs/NNN-short-slug/spec.md","branch":"NNN-short-slug"}' \
  > .specify/feature.json
```

Replace `NNN-short-slug` with your actual spec directory name.

---

## Brownfield Projects

See **[BROWNFIELD_GUIDE.md](BROWNFIELD_GUIDE.md)** for:
- Safe installation on existing codebases
- Handling existing CI pipelines
- Gradual rollout strategy
- Legacy code exemption policy
- Retroactive ADRs and spec backfill

---

## Using with APM CLI (microsoft/apm)

```yaml
# apm.yml in your project
name: my-project
version: 1.0.0
dependencies:
  apm:
    - source: github:<your-username>/agentic-dev-stack
      version: main
```

```zsh
apm install
```

APM installs `.apm/agents/` → `.claude/agents/` and `.apm/skills/` → `.claude/skills/`
automatically. Run `scripts/init.sh` separately for full setup (GitHub templates,
speckit, Copilot files).
