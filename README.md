# Agentic Dev Stack

A reusable **APM (Agent Package Manager)** package that initializes a fully agentic
development environment in any project. One command sets up eight specialized AI agents,
GitHub Actions workflows, Spec Kit integration, and issue/PR templates.

Works with **Claude Code**, **GitHub Copilot**, or **both** simultaneously.

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

- **10 GitHub Actions workflows** — 5 Claude + 5 Copilot, triggered by PR comments/events
- **PR template** — agent sign-off checklists referencing the constitution by path
- **Issue templates** — bug report, feature request, security vulnerability, with auto-triage
- **CONTRIBUTING.md** — human contributor guide (NNN convention, commit style, brownfield policy)
- **SECURITY.md** — responsible disclosure policy with SLAs and scope

### NNN Naming Convention

Every feature flows through a single number that ties everything together:

| Artifact | Pattern | Example |
|----------|---------|---------|
| GitHub Issue | auto-assigned by GitHub | `#42` |
| Spec directory | `specs/NNN-short-slug/` | `specs/042-user-auth/` |
| Git branch | `NNN-short-slug` | `042-user-auth` |
| ADR file | `docs/adr/NNN-title.md` | `docs/adr/042-jwt-vs-opaque.md` |

`NNN` = the GitHub Issue number (zero-padded to 3 digits). No separate counter needed.

## Quick Start (New Project)

```bash
# 1. Clone this repo
git clone <this-repo-url> ~/agentic-dev-stack

# 2. Navigate to your new project
cd /path/to/my-new-project

# 3a. Claude Code only (default)
bash ~/agentic-dev-stack/scripts/init.sh

# 3b. GitHub Copilot only
bash ~/agentic-dev-stack/scripts/init.sh --ai=copilot

# 3c. Both — universal setup
bash ~/agentic-dev-stack/scripts/init.sh --ai=both
```

See [INIT.md](INIT.md) for detailed initialization instructions.  
Adopting in an existing project? See [BROWNFIELD_GUIDE.md](BROWNFIELD_GUIDE.md).  
Starting a dark factory project? See [DARK_FACTORY_GUIDE.md](DARK_FACTORY_GUIDE.md).

## Directory Structure

```
.
├── apm.yml                         # APM package manifest
├── CLAUDE.md                       # Claude Code context (this repo)
├── README.md                       # This file
├── INIT.md                         # Initialization guide
├── BROWNFIELD_GUIDE.md             # Adopting in an existing project (with conflict detection)
├── DARK_FACTORY_GUIDE.md           # Dark factory / lights-out manufacturing guide
├── CONTRIBUTING.md                 # Contributing to the APM library itself
├── ENHANCEMENTS.md                 # Gap analysis and roadmap
│
├── .apm/                           # APM package content (platform-agnostic)
│   ├── agents/                     # Shared agent definitions (Claude + Copilot)
│   │   ├── ba-product-agent.md
│   │   ├── developer-agent.md
│   │   ├── qa-test-agent.md
│   │   ├── reviewer-agent.md
│   │   ├── architect-agent.md
│   │   ├── devops-agent.md
│   │   ├── security-agent.md
│   │   └── triage-agent.md
│   └── skills/                     # Claude Code slash command implementations
│       ├── ba-agent/SKILL.md
│       ├── dev-agent/SKILL.md
│       ├── ...
│       └── speckit-*/SKILL.md
│
├── templates/
│   ├── CLAUDE.md                   # CLAUDE.md template (Claude Code)
│   ├── copilot-instructions.md     # .github/copilot-instructions.md template
│   ├── CONTRIBUTING.md             # Human contributor guide template
│   ├── SECURITY.md                 # Security policy template
│   └── github/
│       ├── instructions/           # Copilot per-agent instruction files
│       │   ├── ba-agent.instructions.md
│       │   ├── dev-agent.instructions.md
│       │   ├── reviewer-agent.instructions.md
│       │   ├── security-agent.instructions.md
│       │   ├── architect-agent.instructions.md
│       │   ├── devops-agent.instructions.md
│       │   └── triage-agent.instructions.md
│       ├── workflows/
│       │   ├── agent-qa.yml            # Claude Code GitHub Actions
│       │   ├── agent-reviewer.yml
│       │   ├── agent-architect.yml
│       │   ├── agent-security.yml
│       │   ├── agent-triage.yml
│       │   ├── copilot-agent-qa.yml        # Copilot GitHub Actions
│       │   ├── copilot-agent-reviewer.yml
│       │   ├── copilot-agent-architect.yml
│       │   ├── copilot-agent-security.yml
│       │   └── copilot-agent-triage.yml
│       ├── ISSUE_TEMPLATE/
│       │   ├── bug_report.md
│       │   ├── feature_request.md
│       │   ├── security_vulnerability.md
│       │   └── config.yml
│       └── pull_request_template.md
│
└── scripts/
    ├── init.sh                     # One-command project initializer (--ai=claude|copilot|both)
    └── quality-check.sh            # Library quality gates (run on every PR to this repo)
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

### In GitHub Copilot Chat (local / VS Code / github.com)

Explicitly activate the agent role by naming it:

```
Act as the BA Agent — read .github/agents/ba-product-agent.md then write a spec for user authentication
Act as the Developer Agent — implement specs/001-user-auth/spec.md using TDD
Act as the Reviewer Agent — review the current PR diff against the spec
Act as the Security Agent — review this code for OWASP Top 10 issues
Act as the Architect Agent — should we use JWT or opaque tokens? Write an ADR
```

### In GitHub (automated — both Claude and Copilot modes)

Comment on a PR or issue:
```
@qa-agent          # triggers QA review on the PR
@reviewer-agent    # triggers code review on the PR
@architect-agent   # triggers architecture review
@security-agent    # triggers security review
```

New issues are automatically triaged (no mention needed).

## Prerequisites

For **Claude Code** mode:
- [Claude Code](https://claude.ai/code) CLI installed
- `ANTHROPIC_API_KEY` set in GitHub repository secrets
- [Node.js](https://nodejs.org) (for github-speckit)

For **GitHub Copilot** mode:
- Active GitHub Copilot subscription (Business or Enterprise recommended for Actions)
- `permissions: models: read` is enabled — no additional secrets required

For both:
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

## Brownfield Adoption

Adding APM to an existing project? The `init.sh` script is safe to run on any repo — it never overwrites existing files. See **[BROWNFIELD_GUIDE.md](BROWNFIELD_GUIDE.md)** for:

- **Conflict detection** — a diagnostic script to run _before_ `init.sh` that shows every existing agent, speckit install, workflow, and Copilot instruction that would be skipped, with per-conflict resolution guidance
- Safe installation without disrupting existing CI
- Gradual rollout phases (observe → assist → automate)
- Legacy code exemption policy
- Retroactive ADR process for undocumented past decisions

## Dark Factory Projects

See **[DARK_FACTORY_GUIDE.md](DARK_FACTORY_GUIDE.md)** for a complete greenfield guide covering:

- Dark factory constitution template (real-time SLOs, OT/IT boundary, SIL classification, IEC 62443)
- Repository structure for edge + cloud + OT layers
- Domain-specific spec considerations (latency SLOs, safety functions, data pipelines)
- 5 foundational ADRs to write before any feature work
- CI/CD pipeline with simulation and edge stages
- IEC 62443 / OT security checklist additions

## Contributing to This Library

See **[CONTRIBUTING.md](CONTRIBUTING.md)** for:

- Agent enhancement workflow (Issue → BA spec → PR → agent reviews)
- Agent Consistency Checklist (no duplication, conditional rules, MUST language)
- Adding a new agent (complete checklist)
- Adding a domain guide
- File map: what to change for common tasks
- Quality gates: `bash scripts/quality-check.sh` (runs as CI on every PR)

## What's Next

See **[ENHANCEMENTS.md](ENHANCEMENTS.md)** for a deep gap analysis and prioritised roadmap — including proposed OT Integration Agent, Digital Twin Agent, Compliance Agent (IEC 62443 / SIL), Incident Agent, and 8 smaller enhancements ready to be opened as issues.

## Customization

After initialization, customize for your project:

1. **Run `/speckit-constitution`** — define your project's non-negotiable rules,
   tech stack, quality thresholds, and cost limits
2. **Edit agent definitions** in `.claude/agents/` — add domain-specific rules
   (e.g., data model requirements, security requirements specific to your domain)
3. **Edit `.specify/extensions/git/git-config.yml`** — enable/disable auto-commits
4. **Edit GitHub workflows** in `.github/workflows/` — adjust `claude_args` or
   add project-specific setup steps (install dependencies, configure test environment)
