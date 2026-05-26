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
| [uv](https://docs.astral.sh/uv/) | Installs `specify-cli` | `brew install uv` |
| [Claude Code](https://claude.ai/code) | Claude AI CLI (Claude mode only) | `npm i -g @anthropic-ai/claude-code` |
| GitHub Copilot subscription | Copilot agents (Copilot mode only) | [github.com/features/copilot](https://github.com/features/copilot) |

Install only the tools for the mode(s) you are using. If `uv` is unavailable,
`pipx` works as a substitute for installing `specify-cli`.

---

## One-Command Setup

```zsh
# 1. Navigate to your project directory (create it first if greenfield)
mkdir -p ~/projects/my-project && cd ~/projects/my-project

# 2. Clone or download QuorumKit, then run init — choose your AI mode
QUORUMKIT=/path/to/quorumkit

bash "$QUORUMKIT/scripts/init.sh"                                # Claude only (default)
bash "$QUORUMKIT/scripts/init.sh" --ai=copilot                   # Copilot only
bash "$QUORUMKIT/scripts/init.sh" --ai=both                      # Both (universal)
bash "$QUORUMKIT/scripts/init.sh" --ai=both --domain=industrial  # Both + industrial pack
```

The script is **idempotent** — it skips any file that already exists, so it is
safe to re-run on an existing project.

> `scripts/init.sh` is a backward-compatibility shim. It forwards to the canonical
> installer at `src/scripts/init.sh`. Both invocation paths are equivalent.

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
| `.github/prompts/*.prompt.md` | — | ✓ | ✓ | ✓ |
| `agent-*.yml` workflows — 11 universal | ✓ | — | ✓ | ✓ |
| `agent-*.yml` workflows — 4 industrial | — | — | — | ✓ |
| `copilot-agent-*.yml` — 11 universal | — | ✓ | ✓ | ✓ |
| `copilot-agent-*.yml` — 4 industrial | — | — | — | ✓ |
| `alert-to-issue.yml` (always) | ✓ | ✓ | ✓ | ✓ |
| PR template, issue templates | ✓ | ✓ | ✓ | ✓ |
| `.specify/` via `specify-cli` | ✓ | — | ✓ | ✓ |

---

## specify-cli — What It Creates

`specify-cli` (from [github/spec-kit](https://github.com/github/spec-kit)) creates
the `.specify/` directory that all agents depend on:

```
.specify/
  memory/
    constitution.md        ← project governance document (you edit this)
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

`init.sh` installs `specify-cli` automatically (via `uv`, `pipx`, or `pip3`,
whichever is available) and runs it non-interactively. To run it manually:

```zsh
# Install specify-cli
uv tool install specify-cli          # preferred
# pipx install specify-cli           # alternative

# Initialise .specify/ for Claude mode
specify init . --integration claude --script sh

# Initialise .specify/ for Copilot mode
specify init . --integration copilot --script sh

# Add Copilot integration to an existing Claude setup
specify integration install copilot --force --script sh
```

### The `feature.json` file

Every agent reads `.specify/feature.json` to find the active spec. It looks like:

```json
{
  "featureDir": "specs/042-user-auth",
  "specFile": "specs/042-user-auth/spec.md",
  "branch": "042-user-auth"
}
```

`feature.json` is updated automatically when you run `/speckit-specify` or
`/speckit-git-feature`. To set it manually:

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

Use this section when you cannot run `init.sh` directly — for example, in a CI
environment or when installing into a monorepo sub-directory.

### Claude Code

```zsh
QUORUMKIT=/path/to/quorumkit

# Step 1: Agents and skills
mkdir -p .claude/agents .claude/skills
cp "$QUORUMKIT/src/agents/"*.md .claude/agents/
for skill in "$QUORUMKIT/src/skills/"/*/; do
  skill_name="$(basename "$skill")"
  mkdir -p ".claude/skills/$skill_name"
  cp "$skill/SKILL.md" ".claude/skills/$skill_name/SKILL.md"
done

# Step 2: CLAUDE.md
cp "$QUORUMKIT/src/seed/CLAUDE.md" CLAUDE.md

# Step 3: GitHub templates
mkdir -p .github/workflows .github/ISSUE_TEMPLATE
cp "$QUORUMKIT/src/.github/workflows/agent-"*.yml .github/workflows/
cp "$QUORUMKIT/src/.github/pull_request_template.md" .github/
cp "$QUORUMKIT/src/.github/ISSUE_TEMPLATE/"* .github/ISSUE_TEMPLATE/
cp "$QUORUMKIT/src/seed/CONTRIBUTING.md" CONTRIBUTING.md
cp "$QUORUMKIT/src/seed/SECURITY.md" SECURITY.md

# Step 4: specify-cli
uv tool install specify-cli
specify init . --integration claude --script sh

# Step 5: Git
git init && git add . && git commit -m "chore: initialize QuorumKit"
```

### GitHub Copilot

```zsh
QUORUMKIT=/path/to/quorumkit

# Step 1: Agent definitions
mkdir -p .github/agents
cp "$QUORUMKIT/src/agents/"*.md .github/agents/

# Step 2: Copilot context, instructions, and prompt files
mkdir -p .github/instructions .github/prompts
cp "$QUORUMKIT/src/seed/copilot-instructions.md" .github/copilot-instructions.md
cp "$QUORUMKIT/src/.github/instructions/"*.instructions.md .github/instructions/
cp "$QUORUMKIT/src/.github/prompts/"*.prompt.md .github/prompts/

# Step 3: GitHub templates
mkdir -p .github/workflows .github/ISSUE_TEMPLATE
cp "$QUORUMKIT/src/.github/workflows/copilot-agent-"*.yml .github/workflows/
cp "$QUORUMKIT/src/.github/pull_request_template.md" .github/
cp "$QUORUMKIT/src/.github/ISSUE_TEMPLATE/"* .github/ISSUE_TEMPLATE/
cp "$QUORUMKIT/src/seed/CONTRIBUTING.md" CONTRIBUTING.md
cp "$QUORUMKIT/src/seed/SECURITY.md" SECURITY.md

# Step 4: Git
git init && git add . && git commit -m "chore: initialize QuorumKit"
```

---

## Post-Initialization Setup

### 1. Add secrets to GitHub

**Claude mode** — add to Settings → Secrets and variables → Actions:
```
ANTHROPIC_API_KEY = <your key from console.anthropic.com>
```

**Copilot mode** — no secrets needed. Workflows use `secrets.GITHUB_TOKEN`
(auto-provided) and `permissions: models: read`. Ensure the repository has an
active Copilot licence.

### 2. Write the Project Constitution

```
/speckit-constitution
```

This guided command populates `.specify/memory/constitution.md`. Provide answers
for each section:

| Section | What to provide |
|---------|----------------|
| Project name and vision | What is this system and who uses it? |
| Technology stack | Languages, frameworks, cloud platform |
| Quality standards | Coverage threshold (e.g. 80%), linting tools |
| Authentication / multi-user | Does this project have login / multiple users? |
| Environment names | What are your env names? (e.g. dev / staging / production) |
| Cost limits | Monthly budget limit (if applicable) |
| SLOs | Uptime and response time targets (if applicable) |

All agents read `.specify/memory/constitution.md` at the start of every session
and treat it as non-negotiable.

### 3. Edit project-root templates

Edit `SECURITY.md` to replace `[security@your-domain.com]` with your actual
security contact address.

### 4. Configure branch protection (recommended)

```zsh
gh api repos/:owner/:repo/branches/main/protection \
  --method PUT \
  --field required_pull_request_reviews='{"required_approving_review_count":1}' \
  --field required_status_checks='{"strict":true,"contexts":["CI"]}' \
  --field enforce_admins=false \
  --field restrictions=null
```

Replace `"CI"` with the name of your status-check job.

### 5. Enable auto-commit hooks (optional)

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

### 2. Write the spec

```
/ba-agent Add user authentication with email/password login
```

The BA Agent creates `specs/042-user-auth/spec.md` (using the issue number).
Review it, then ask for clarification if needed:

```
/ba-agent clarify
```

### 3. Create the feature branch

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

### 6. Request agent reviews

```
@reviewer-agent      ← spec + constitution compliance
@qa-agent            ← quality gates + acceptance scenarios
@security-agent      ← OWASP review (for auth/data/API changes)
@architect-agent     ← architectural review (for significant design changes)
```

### 7. Merge

Once all agents approve and CI passes, merge. The following run automatically:

- **Release Agent** — analyses commits since last tag, opens a Version Bump PR (semver + CHANGELOG)
- **Docs Agent** — audits documentation, opens a Docs PR if anything needs updating
- **Triage Agent** — any production alert fired via `alert-to-issue.yml` becomes a new routed Issue

### Lifecycle commands (available any time)

```
/release-agent                ← calculate semver + open Version Bump PR
/release-agent minor          ← override bump type (patch | minor | major)
/docs-agent                   ← audit and sync all documentation
/docs-agent 42                ← audit docs impact of PR #42
/tech-debt-agent              ← run full codebase health review
/tech-debt-agent complexity   ← focus on one area
/onboard                      ← guided 7-step onboarding wizard (for new team members)
```

---

## Customising Agents

After initialisation, customise agents for your project by editing the installed
copies:

| Mode | Agent location |
|------|---------------|
| Claude | `.claude/agents/<agent-name>.md` |
| Copilot | `.github/agents/<agent-name>.md` |

> The source definitions in `src/agents/` are **platform-agnostic and shared**.
> Edits to `.claude/agents/` or `.github/agents/` are local to your project.

Common customisations:
- Add domain-specific rules (e.g. "every DB query must include `tenant_id`")
- Add project-specific toolchain commands (`cargo test --workspace`, `go test ./...`)
- Reference project architecture docs (`docs/architecture/overview.md`)
- Adjust the coverage threshold after establishing a baseline

---

## Updating QuorumKit

```zsh
# Re-run init — skips files that already exist, updates new artifacts
QUORUMKIT=/path/to/quorumkit
bash "$QUORUMKIT/scripts/init.sh" --ai=both

# Update a single agent
cp "$QUORUMKIT/src/agents/security-agent.md" .claude/agents/
cp "$QUORUMKIT/src/agents/security-agent.md" .github/agents/
```

### Upgrading consumer workflows to the Action runtime

If your consumer project still invokes the orchestrator directly via
`node engine/orchestrator/index.js`, upgrade to the `uses:` Action syntax:

```zsh
# Preview changes (dry-run)
bash "$QUORUMKIT/scripts/init.sh" --upgrade

# Apply changes
bash "$QUORUMKIT/scripts/init.sh" --upgrade --apply

# Pin to a specific engine release
bash "$QUORUMKIT/scripts/init.sh" --upgrade --apply --engine-ref=v3.1.0
```

The `--upgrade` flag rewrites matching workflow files in `.github/workflows/`
in place. It refuses to broaden existing `permissions:` blocks automatically —
add any missing scopes manually before re-running.

---

## Troubleshooting

### `/speckit-*` commands not working

The speckit slash commands require the `.specify/` directory to exist. If it
is missing, initialise it manually:

```zsh
uv tool install specify-cli
specify init . --integration claude --script sh   # or: --integration copilot
```

### Agents not loading in Claude Code

Verify both directories exist at the project root:

```zsh
ls .claude/agents/
ls .claude/skills/
```

Claude Code resolves these paths relative to the directory that contains `CLAUDE.md`.

### Copilot not following agent instructions

- Ensure `.github/copilot-instructions.md` exists (Copilot reads this automatically).
- For an interactive session, explicitly activate the agent:
  > "Read `.github/agents/developer-agent.md` in full, then help me implement..."

### GitHub Actions workflows not triggering

**Claude workflows**: confirm `ANTHROPIC_API_KEY` is set under Settings →
Secrets and variables → Actions.

**Copilot workflows**: confirm the repository has an active Copilot licence,
then inspect Actions → workflow run logs for details.

### Constitution not found

```
/speckit-constitution
```

This creates `.specify/memory/constitution.md` from the seed template.

### feature.json out of sync

If agents cannot find the active spec, reset `feature.json` manually:

```zsh
echo '{"featureDir":"specs/NNN-short-slug","specFile":"specs/NNN-short-slug/spec.md","branch":"NNN-short-slug"}' \
  > .specify/feature.json
```

Replace `NNN-short-slug` with your actual spec directory name.

### Legacy `apm.yml` detected

QuorumKit v3 requires `quorumkit.yml`. If the installer exits with
`Legacy configuration file detected: apm.yml`, migrate:

```zsh
mv apm.yml quorumkit.yml
# Edit quorumkit.yml: update the 'name' field if it still reads
# 'agentic-dev-stack' or 'quorumkit'
bash "$QUORUMKIT/scripts/init.sh" --ai=both
```

See [MIGRATION.md](MIGRATION.md) for the full before/after reference.

---

## Brownfield Projects

See **[BROWNFIELD_GUIDE.md](BROWNFIELD_GUIDE.md)** for:
- Safe installation on existing codebases
- Handling existing CI pipelines
- Gradual rollout strategy
- Legacy code exemption policy
- Retroactive ADRs and spec backfill

---

## Next Steps

| Goal | Where to go |
|------|------------|
| Understand the full agent workflow | [AGENT_PROTOCOL.md](AGENT_PROTOCOL.md) |
| Set up the local pipeline runner | [LOCAL_PIPELINES.md](LOCAL_PIPELINES.md) |
| Install into an existing project | [BROWNFIELD_GUIDE.md](BROWNFIELD_GUIDE.md) |
| Migrate from an earlier version | [MIGRATION.md](MIGRATION.md) |
| View the live pipeline dashboard | [DASHBOARD.md](DASHBOARD.md) |
