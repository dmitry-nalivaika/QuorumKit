# Initialization Guide

How to set up the full agentic development environment in a new project using
this APM package.

---

## Prerequisites

Install these tools before starting:

| Tool | Purpose | Install |
|------|---------|---------|
| [Claude Code](https://claude.ai/code) | AI agent CLI | `npm i -g @anthropic-ai/claude-code` |
| [Node.js ≥ 18](https://nodejs.org) | github-speckit | nodejs.org |
| [GitHub CLI](https://cli.github.com) | Agent workflows | `brew install gh` |
| Git | Version control | Pre-installed on most systems |

---

## One-Command Setup

```bash
# Navigate to your project directory
cd /path/to/my-new-project

# Run init (adjust path to where you cloned this repo)
bash ~/path/to/agentic-dev-stack/scripts/init.sh
```

The script will:
1. Copy all agents to `.claude/agents/`
2. Copy all skills to `.claude/skills/`
3. Create `CLAUDE.md`
4. Copy GitHub Actions workflows to `.github/workflows/`
5. Copy PR template and issue templates to `.github/`
6. Run `npx github-speckit@latest` (requires Node.js)
7. Initialize a git repository (if not already one)

---

## Manual Setup (Step-by-Step)

If you prefer to set up manually or the script fails:

### Step 1: Copy agents and skills

```bash
# Create directories
mkdir -p .claude/agents .claude/skills

# Copy agents
cp -r /path/to/agentic-dev-stack/.apm/agents/* .claude/agents/

# Copy skills (each skill needs its own subdirectory)
for skill in /path/to/agentic-dev-stack/.apm/skills/*/; do
  skill_name="$(basename "$skill")"
  mkdir -p ".claude/skills/$skill_name"
  cp "$skill/SKILL.md" ".claude/skills/$skill_name/SKILL.md"
done
```

### Step 2: Create CLAUDE.md

```bash
cp /path/to/agentic-dev-stack/templates/CLAUDE.md CLAUDE.md
```

### Step 3: Copy GitHub templates

```bash
mkdir -p .github/workflows .github/ISSUE_TEMPLATE

# Workflows
cp /path/to/agentic-dev-stack/templates/github/workflows/*.yml .github/workflows/

# PR template
cp /path/to/agentic-dev-stack/templates/github/pull_request_template.md .github/

# Issue templates
cp /path/to/agentic-dev-stack/templates/github/ISSUE_TEMPLATE/* .github/ISSUE_TEMPLATE/
```

### Step 4: Initialize github-speckit

```bash
npx github-speckit@latest
```

When prompted:
- **AI integration**: choose `claude`
- **Branch numbering**: choose `sequential` (recommended) or `timestamp`
- **Context file**: accept default (`CLAUDE.md`)
- **Script**: `sh` (macOS/Linux) or `powershell` (Windows)

### Step 5: Initialize git (if needed)

```bash
git init
git add .
git commit -m "chore: initialize agentic dev stack"
```

---

## Post-Initialization Setup

### 1. Add ANTHROPIC_API_KEY to GitHub

The GitHub Actions agent workflows require your Anthropic API key:

1. Go to your GitHub repository
2. Settings → Secrets and variables → Actions
3. New repository secret: `ANTHROPIC_API_KEY` = your key from [console.anthropic.com](https://console.anthropic.com)

### 2. Create your Project Constitution

The constitution is the governance document that all agents follow. Run:

```
/speckit-constitution
```

You will be prompted for:
- **Project name and vision** (what is this system?)
- **Technology stack** (languages, frameworks, cloud platform)
- **Quality standards** (test coverage threshold, linting tools)
- **Data/security requirements** (multi-user? authentication? data isolation rules?)
- **Cost limits** (if applicable)
- **Agent roles** (customize per your team structure)

The constitution is saved to `.specify/memory/constitution.md`. All agents read it
at session start and treat it as non-negotiable.

> **Tip**: Base your constitution on `.specify/memory/constitution.md` from an
> existing project and adapt it, rather than creating from scratch.

### 3. Configure Branch Protection (Recommended)

Require the CI pipeline to pass before merging:

```bash
# Run this after pushing to GitHub (requires GitHub Pro or public repo)
gh api repos/:owner/:repo/branches/main/protection \
  --method PUT \
  --field required_pull_request_reviews='{"required_approving_review_count":1}' \
  --field required_status_checks='{"strict":true,"contexts":["CI Gate"]}' \
  --field enforce_admins=false \
  --field restrictions=null
```

Adapt `"CI Gate"` to match the name of your CI aggregation job.

### 4. Enable Auto-Commit Hooks (Optional)

By default, all auto-commits are disabled. To enable them:

Edit `.specify/extensions/git/git-config.yml`:

```yaml
auto_commit:
  default: false
  after_specify:
    enabled: true        # Auto-commit after /speckit-specify
    message: "[Spec Kit] Add specification"
  after_plan:
    enabled: true        # Auto-commit after /speckit-plan
    message: "[Spec Kit] Add implementation plan"
```

---

## First Feature Workflow

Once initialized, follow this workflow for every feature:

### 1. Create a GitHub Issue

Describe the feature in a GitHub Issue. The Triage Agent will automatically
classify it.

### 2. Write the Spec

```
/ba-agent <your feature description from the issue>
```

Or more explicitly:

```
/ba-agent Add user authentication with email/password login and session management
```

The BA Agent will:
- Run `/speckit-specify` to create `specs/NNN-feature/spec.md`
- Ask up to 3 clarifying questions (if needed)
- Run `/speckit-clarify` to resolve any ambiguities
- Hand off to the Developer Agent when spec is complete

### 3. Implement the Feature

```
/dev-agent Implement the spec at specs/001-user-auth/spec.md
```

The Developer Agent will:
- Run `/speckit-plan` → creates `plan.md`, `data-model.md`, `contracts/`
- Run `/speckit-tasks` → creates `tasks.md` with ordered task list
- Run `/speckit-implement` → implements all tasks using TDD
- Open a PR when all tasks complete and tests pass

### 4. Review the PR

Comment on the PR:

```
@reviewer-agent Review PR #5
```

```
@qa-agent Validate PR #5
```

```
@security-agent Review PR #5   (for security-sensitive features)
```

```
@architect-agent Review PR #5  (for major architectural changes)
```

### 5. Merge

Once all agents approve (no BLOCKERs, no failing gates), merge to `main`.

---

## Customizing Agents

After initialization, you can customize any agent for your project:

**Location**: `.claude/agents/<agent-name>.md`

Common customizations:
- Add domain-specific rules (e.g., "every DB query must include `tenant_id`")
- Add project-specific toolchain commands (e.g., `cargo test`, `go test ./...`)
- Add mandatory review items specific to your architecture
- Reference project-specific documents (e.g., architecture diagrams, runbooks)

Changes to agents in `.claude/agents/` are local to your project. To update the
shared package for all projects, edit `.apm/agents/` in this repo.

---

## Updating the Package

To pull latest changes into an existing project:

```bash
# Re-run the init script (it skips files that already exist)
bash /path/to/agentic-dev-stack/scripts/init.sh

# Or selectively update specific agents
cp /path/to/agentic-dev-stack/.apm/agents/security-agent.md .claude/agents/
```

---

## Using with APM (microsoft/apm)

If you have [APM CLI](https://github.com/microsoft/apm) installed, you can
declare this package as a dependency:

```yaml
# apm.yml in your project
name: my-project
version: 1.0.0
description: My project
author: Your Name
license: MIT

dependencies:
  apm:
    - source: github:<your-github-username>/agentic-dev-stack
      version: main   # or pin to a tag: v1.0.0
  mcp: []
```

Then install:

```bash
apm install
```

APM will copy `.apm/agents/` to `.claude/agents/` and `.apm/skills/` to
`.claude/skills/` automatically.

> Note: APM does not install GitHub templates or run github-speckit. Run
> `scripts/init.sh` for the full setup, or use APM for agent/skill updates only.

---

## Troubleshooting

### Agents not appearing in Claude Code

Make sure `.claude/agents/` and `.claude/skills/` exist in your project root.
Claude Code looks for these relative to the project root (where `CLAUDE.md` lives).

Verify:
```bash
ls .claude/agents/
ls .claude/skills/
```

### GitHub workflows not triggering

1. Ensure `ANTHROPIC_API_KEY` is set in GitHub repository secrets
2. Ensure the workflow files are in `.github/workflows/`
3. Check that the `anthropics/claude-code-action@v1` action is accessible

### github-speckit commands not working

The `/speckit-*` commands require the `.specify/` directory created by
`npx github-speckit@latest`. If you skipped that step:

```bash
npx github-speckit@latest
```

Choose `claude` as the AI integration.

### Constitution not found

If agents report they can't find the constitution, create it:

```
/speckit-constitution
```

This creates `.specify/memory/constitution.md`.
