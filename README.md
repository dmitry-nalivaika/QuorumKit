# Agentic Dev Stack

A reusable **APM (Agent Package Manager)** package that initializes a **fully
autonomous, lights-out software development cycle** in any project. One command
sets up 15 specialised AI agents, 25 GitHub Actions workflows, Spec Kit
integration, and issue/PR templates.

> **"Dark Factory" = the software factory runs itself.** The loop is:
> Triage → Spec → Plan → Implement → Test → Review → Security → Merge →
> Release → Document → Deploy → Monitor → Feedback → new Issue.
> Humans set strategy and approve escalations. Agents handle all execution.

Works with **Claude Code**, **GitHub Copilot**, or **both** simultaneously.

## What You Get

### Universal Agents (core — always installed)

| Agent | Slash Command | GitHub Trigger | Role |
|-------|--------------|----------------|------|
| BA/Product | `/ba-agent` | — | Write & refine feature specs (user-facing + data pipeline templates) |
| Developer | `/dev-agent` | — | Implement features (TDD, Constitution Check) |
| QA/Test | `/qa-agent` | `@qa-agent` in PR | Quality gates + SLO + mutation testing gate |
| Reviewer | `/reviewer-agent` | `@reviewer-agent` in PR | Spec compliance, migration checklist, API contract governance |
| Architect | `/architect-agent` | `@architect-agent` in PR/Issue | ADRs, cross-spec consistency, constitution review |
| DevOps | `/devops-agent` | — | CI/CD, ring deployment gate, infracost, observability loop |
| Security | `/security-agent` | `@security-agent` in PR | OWASP + dependency update review |
| Triage | `/triage-agent` | Auto on new issues | Classify, route, deduplicate GitHub Issues |
| **Release** | `/release-agent` | Auto on push to main | Semver bump, CHANGELOG, GitHub Release |
| **Docs** | `/docs-agent` | `@docs-agent` in PR / auto on merge | README, API ref, inline comments, architecture doc sync |
| **Tech-Debt** | `/tech-debt-agent` | Monthly schedule | Complexity hotspots, dead code, dep freshness, mutation score |

### Domain Extension Pack — Industrial (opt-in: `--domain=industrial`)

| Agent | Slash Command | GitHub Trigger | Role |
|-------|--------------|----------------|------|
| OT Integration | `/ot-integration-agent` | `@ot-integration-agent` in PR | IT/OT boundary: protocols, data fidelity, safe failure, OPC-UA scan |
| Digital Twin | `/digital-twin-agent` | `@digital-twin-agent` in PR | Model drift, historian schema, simulation coverage, schema diff |
| Compliance | `/compliance-agent` | `@compliance-agent` in PR | IEC 62443, ISA-95, SIL / functional safety |
| Incident | `/incident-agent` | `@incident-agent` or `incident` label | SEV auto-classify, mitigation → RCA → post-mortem → follow-up issues |

### Guided Workflows (skills)

| Skill | What it does |
|-------|-------------|
| `/onboard` | 7-step interactive onboarding wizard for new team members |
| `/release-agent [patch\|minor\|major]` | Trigger release with optional bump override |
| `/docs-agent` | Audit + update all documentation |
| `/tech-debt-agent [focus]` | Run codebase health review |

### Spec Kit Integration (via github-speckit)

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

### Autonomous Orchestration (Issue #2)

The **APM Orchestrator** is a GitHub Actions workflow that automatically sequences agents
in response to repository events — no slash-commands needed for routine SDLC work.

| Capability | Details |
|------------|---------|
| Event-driven pipelines | Issues, PRs, labels, `workflow_run` completions trigger the right agent chain automatically |
| Declarative YAML rules | Pipeline definitions live in `.apm/pipelines/*.yml`, version-controlled and PR-reviewable |
| Human approval gates | `approval: required` on any step; resumes on `/approve` from a `write`+ collaborator |
| Stateless & restartable | All state stored in GitHub Issue/PR comments — survives Orchestrator restarts |
| Dual-AI dispatch | Routes to Claude (`agent-*.yml`) or Copilot (`copilot-agent-*.yml`) based on `aiTool` in `.apm-project.json` |
| Full audit trail | Every state transition posts a human-readable comment on the triggering Issue/PR |
| Dashboard broadcast | Pipeline status pushed to dashboard via `POST /webhook/pipeline-event` within 5 seconds |

**Default pipelines installed by `init.sh`:**
- `feature-pipeline.yml` — triage → ba → architect → dev → qa → reviewer → release
- `bug-fix-pipeline.yml` — triage → dev → qa → reviewer
- `release-pipeline.yml` — qa → reviewer → **[approval gate]** → release

**Full guide:** [PIPELINES.md](PIPELINES.md)

### GitHub Templates

- **26 GitHub Actions workflows** — 12 Claude + 12 Copilot + `orchestrator` + `alert-to-issue` observability webhook
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

# 3d. With industrial domain extension pack
bash ~/agentic-dev-stack/scripts/init.sh --ai=both --domain=industrial
```

See [INIT.md](INIT.md) for detailed initialization instructions.  
Adopting in an existing project? See [BROWNFIELD_GUIDE.md](BROWNFIELD_GUIDE.md).  
Industrial/IoT domain projects? See [DARK_FACTORY_GUIDE.md](DARK_FACTORY_GUIDE.md).

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
│   ├── agents/                     # Agent definitions — single source of truth
│   │   ├── ba-product-agent.md     ─┐
│   │   ├── developer-agent.md       │
│   │   ├── qa-test-agent.md         │  Universal core
│   │   ├── reviewer-agent.md        │  (always installed)
│   │   ├── architect-agent.md       │
│   │   ├── devops-agent.md          │
│   │   ├── security-agent.md        │
│   │   ├── triage-agent.md          │
│   │   ├── release-agent.md         │
│   │   ├── docs-agent.md            │
│   │   ├── triage-agent.md         ─┘
│   │   ├── ot-integration-agent.md ─┐
│   │   ├── digital-twin-agent.md    │  Industrial domain pack
│   │   ├── compliance-agent.md      │  (--domain=industrial)
│   │   └── incident-agent.md       ─┘
│   └── skills/                     # Claude Code slash command wrappers
│       ├── ba-agent/SKILL.md
│       ├── release-agent/SKILL.md
│       ├── docs-agent/SKILL.md
│       ├── tech-debt-agent/SKILL.md
│       ├── onboard/SKILL.md
│       ├── ...agent wrappers...
│       └── speckit-*/SKILL.md
│
├── templates/
│   ├── CLAUDE.md
│   ├── copilot-instructions.md
│   ├── CONTRIBUTING.md
│   ├── SECURITY.md
│   └── github/
│       ├── instructions/           # Copilot per-agent instruction files (14 total)
│       ├── workflows/              # GitHub Actions workflows (25 total)
│       │   ├── agent-*.yml             Claude — 12 workflows
│       │   ├── copilot-agent-*.yml     Copilot — 12 workflows
│       │   └── alert-to-issue.yml      Observability → Issue feedback loop
│       ├── ISSUE_TEMPLATE/
│       └── pull_request_template.md
│
└── scripts/
    ├── init.sh           # One-command init (--ai=claude|copilot|both [--domain=industrial])
    └── quality-check.sh  # 12-gate library CI (agents, skills, workflows, spec lint)
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
    ## The Closed-Loop SDLC

```
GitHub Issue created
        │
        ▼
Triage Agent  ──── auto on every new issue ────► labels, routes, deduplicates
        │
        ▼
BA Agent  ──── /ba-agent ────► spec.md  (Template A: user-facing / B: pipeline)
        │
        ▼
Architect Agent ── cross-spec consistency check ── ARCH-CONFLICT if needed
        │
        ▼
Developer Agent  ── /dev-agent ──► plan → tasks → TDD implementation → PR
        │
        ▼  (all run in parallel on the PR)
  QA Agent           coverage + SLO + mutation testing gate
  Reviewer Agent     spec compliance + API contract diff + migration checklist
  Security Agent     OWASP + dependency scan + secrets scan
  Docs Agent         README + API ref + architecture doc sync
        │
        ▼  (all gates pass)
     Merge to main
        │
        ├──► Release Agent  ── semver bump → CHANGELOG → GitHub Release → tag
        │
        └──► DevOps Agent   ── ring deploy (canary soak → pilot → full fleet)
                                infracost gate, rollback on RING-BLOCKER
        │
        ▼  (production)
  Observability alert ──► alert-to-issue.yml ──► GitHub Issue ──► Triage Agent
        │                                                               │
        └───────────────────────────── loop continues ◄────────────────┘

  Scheduled:
    Tech-Debt Agent  ── first Monday of month ──► health report + chore issues
    Architect Agent  ── every 10 merges ──────────► constitution review
```

## Agent Interaction Reference

### In Claude Code (local slash commands)

```bash
# Core workflow
/ba-agent Add user authentication
/dev-agent                          # picks up spec from .specify/feature.json
/qa-agent                           # validate current PR
/reviewer-agent                     # review current PR
/architect-agent                    # design decision or cross-spec check
/devops-agent                       # CI/CD review
/security-agent                     # security review
/triage-agent                       # triage open issues

# Lifecycle
/release-agent                      # auto semver + CHANGELOG + GitHub Release
/release-agent minor                # override bump type
/docs-agent                         # audit + update documentation
/tech-debt-agent                    # codebase health review
/tech-debt-agent complexity         # focus on one area

# Guided
/onboard                            # 7-step new-team-member wizard
```

### In GitHub (automated — PR comments / issue labels)

```
@qa-agent              — QA + mutation testing review on PR
@reviewer-agent        — spec compliance + API contract review on PR
@architect-agent       — ADR + cross-spec consistency check
@security-agent        — OWASP + dependency review on PR
@docs-agent            — documentation audit on PR

(triage runs automatically on every new issue)
(release runs automatically on every push to main)
(tech-debt runs on first Monday of each month)

# Industrial domain pack only:
@ot-integration-agent  — IT/OT boundary review on PR
@digital-twin-agent    — digital twin drift + schema diff review on PR
@compliance-agent      — IEC 62443 / ISA-95 / SIL review on PR
@incident-agent        — incident response (label issue 'incident')
```

## Prerequisites

For **Claude Code** mode:
- [Claude Code](https://claude.ai/code) CLI installed
- `ANTHROPIC_API_KEY` set in GitHub repository secrets
- [Node.js](https://nodejs.org) (for github-speckit)

For **GitHub Copilot** mode:
- Active GitHub Copilot subscription (Business or Enterprise recommended for Actions)
- `permissions: models: read` — no additional secrets required

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

## Orchestrator Dashboard

The **Orchestrator** turns the 15 agents from static definitions into a live, interactive
control centre — a browser-based dashboard with real agent invocation, live log streaming,
a Kanban board, and native terminal integration.

```zsh
# Start the orchestrator (from this repo root):
bash dashboard/start.sh
# → opens http://localhost:3131
```

1. Click **⚙** → enter your project's local path + GitHub URL + AI tool (Claude Code / Copilot / custom)
2. Click **▶ Invoke** on any agent card to run it in the background
3. Click **⬜ Terminal** to open an interactive native terminal for that agent
4. Watch the **📋 Board** tab update in real time as agents move through Queue → In Progress → Done

**Full guide:** [ORCHESTRATOR.md](ORCHESTRATOR.md) — architecture, all API endpoints,
configuration reference, keyboard shortcuts, and a complete worked example (Todo API,
zero to deployed).

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
