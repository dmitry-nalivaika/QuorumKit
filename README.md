# Agentic Dev Stack

A reusable **APM (Agent Package Manager)** package that initializes a fully agentic
development environment in any project. One command sets up eight specialized AI agents,
GitHub Actions workflows, Spec Kit integration, and issue/PR templates.

## What You Get

### 8 Specialized Agents

| Agent | Slash Command | GitHub Trigger | Role |
|-------|--------------|----------------|------|
| BA/Product | `/ba-agent` | — | Write & refine feature specs |
| Developer | `/dev-agent` | — | Implement features (TDD) |
| QA/Test | `/qa-agent` | `@qa-agent` in PR | Run quality gates, produce QA Report |
| Reviewer | `/reviewer-agent` | `@reviewer-agent` in PR | Review PRs vs spec & constitution |
| Architect | `/architect-agent` | `@architect-agent` in PR/Issue | Design decisions & ADRs |
| DevOps | `/devops-agent` | — | CI/CD & infrastructure |
| Security | `/security-agent` | `@security-agent` in PR | OWASP security review |
| Triage | `/triage-agent` | Auto on new issues | Classify & route GitHub Issues |

### Spec Kit Integration (via github-speckit)

Full Spec-Driven Development workflow:

| Skill | What it does |
|-------|-------------|
| `/speckit-specify` | Create feature spec from description |
| `/speckit-clarify` | Resolve ambiguities in a spec |
| `/speckit-plan` | Generate implementation plan |
| `/speckit-tasks` | Generate ordered task list |
| `/speckit-implement` | Execute tasks (TDD) |
| `/speckit-analyze` | Cross-artifact consistency check |
| `/speckit-checklist` | "Unit tests for requirements" |
| `/speckit-constitution` | Create/update project constitution |
| `/speckit-taskstoissues` | Push tasks to GitHub Issues |
| `/speckit-git-feature` | Create feature branch |
| `/speckit-git-commit` | Auto-commit hook |
| `/speckit-git-initialize` | Initialize git repo |
| `/speckit-git-remote` | Detect GitHub remote |
| `/speckit-git-validate` | Validate branch naming |

### GitHub Templates

- **5 GitHub Actions workflows** — automated agent invocation on mentions/events
- **PR template** — with agent sign-off checklists and constitution compliance
- **Issue templates** — bug report, feature request, with auto-triage setup

## Quick Start (New Project)

```bash
# 1. Clone this repo
git clone <this-repo-url> ~/agentic-dev-stack

# 2. Navigate to your new project
cd /path/to/my-new-project

# 3. Run init
bash ~/agentic-dev-stack/scripts/init.sh
```

See [INIT.md](INIT.md) for detailed initialization instructions.

## Directory Structure

```
.
├── apm.yml                         # APM package manifest
├── CLAUDE.md                       # Claude Code context file
├── README.md                       # This file
├── INIT.md                         # Initialization guide
│
├── .apm/                           # APM package content (installed to .claude/)
│   ├── agents/                     # Agent definitions
│   │   ├── ba-product-agent.md
│   │   ├── developer-agent.md
│   │   ├── qa-test-agent.md
│   │   ├── reviewer-agent.md
│   │   ├── architect-agent.md
│   │   ├── devops-agent.md
│   │   ├── security-agent.md
│   │   └── triage-agent.md
│   └── skills/                     # Slash command implementations
│       ├── ba-agent/SKILL.md
│       ├── dev-agent/SKILL.md
│       ├── qa-agent/SKILL.md
│       ├── reviewer-agent/SKILL.md
│       ├── architect-agent/SKILL.md
│       ├── devops-agent/SKILL.md
│       ├── security-agent/SKILL.md
│       ├── triage-agent/SKILL.md
│       ├── speckit-*/SKILL.md      # Spec Kit skills (×14)
│       └── speckit-git-*/SKILL.md  # Git extension skills (×5)
│
├── templates/
│   ├── CLAUDE.md                   # CLAUDE.md template for new projects
│   └── github/
│       ├── workflows/              # GitHub Actions workflow templates
│       │   ├── agent-qa.yml
│       │   ├── agent-reviewer.yml
│       │   ├── agent-architect.yml
│       │   ├── agent-security.yml
│       │   └── agent-triage.yml
│       ├── ISSUE_TEMPLATE/         # Issue templates
│       │   ├── bug_report.md
│       │   ├── feature_request.md
│       │   └── config.yml
│       └── pull_request_template.md
│
└── scripts/
    └── init.sh                     # One-command project initializer
```

## The Development Workflow

```
GitHub Issue
    │
    ▼
/ba-agent          → spec.md (what to build)
    │
    ▼
/speckit-clarify   → refined spec (resolve ambiguities)
    │
    ▼
/dev-agent         → plan.md + tasks.md + implementation (TDD)
    │
    ▼
PR opened ──────────────────────────────────────────────────┐
    │                                                        │
    ▼                                                        ▼
@reviewer-agent          @qa-agent              @security-agent
(spec compliance)     (quality gates)           (OWASP review)
    │                        │                       │
    └────────────────────────┴───────────────────────┘
                             │
                        All approved
                             │
                             ▼
                       Merge to main
                             │
                             ▼
                       CI/CD deploys
```

## Agent Interaction Reference

### In Claude Code (local)

```bash
/ba-agent Add user authentication with email and password
/dev-agent Implement the spec at specs/001-user-auth/spec.md
/qa-agent Validate PR #5
/reviewer-agent Review PR #5
/architect-agent Review plan at specs/001-user-auth
/devops-agent Review CI pipeline
/security-agent Review PR #5
/triage-agent Triage issue #12
```

### In GitHub (automated)

Comment on a PR or issue:
```
@qa-agent          # triggers QA review on the PR
@reviewer-agent    # triggers code review on the PR
@architect-agent   # triggers architecture review
@security-agent    # triggers security review
```

New issues are automatically triaged (no mention needed).

## Prerequisites

- [Claude Code](https://claude.ai/code) CLI installed
- `ANTHROPIC_API_KEY` set in GitHub repository secrets
- [Node.js](https://nodejs.org) (for github-speckit)
- [GitHub CLI](https://cli.github.com) (`gh`) for agent workflows
- Git repository connected to GitHub

## APM Installation (Alternative)

If you have [APM](https://github.com/microsoft/apm) installed:

```yaml
# apm.yml in your project
name: my-project
version: 1.0.0
dependencies:
  apm:
    - source: github:<your-username>/agentic-dev-stack
      version: main
```

```bash
apm install
```

## Customization

After initialization, customize for your project:

1. **Run `/speckit-constitution`** — define your project's non-negotiable rules,
   tech stack, quality thresholds, and cost limits
2. **Edit agent definitions** in `.claude/agents/` — add domain-specific rules
   (e.g., data model requirements, security requirements specific to your domain)
3. **Edit `.specify/extensions/git/git-config.yml`** — enable/disable auto-commits
4. **Edit GitHub workflows** in `.github/workflows/` — adjust `claude_args` or
   add project-specific setup steps (install dependencies, configure test environment)
