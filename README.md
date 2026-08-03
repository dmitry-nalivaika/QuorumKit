# QuorumKit

QuorumKit installs a complete autonomous development workflow into any GitHub repository. One command sets up 15 specialised AI agents, an event-driven orchestrator, and 26 GitHub Actions workflows. Once running, the full SDLC (Software Development Lifecycle) — triage, spec writing, implementation, testing, security review, and release — proceeds without human intervention on routine work.

> **"Dark Factory"** — the software factory runs itself.
> The loop: Triage → Spec → Plan → Implement → Test → Review → Security → Merge → Release → Document → Deploy → Monitor → Feedback → new Issue.
> Humans set strategy and approve releases. Agents handle execution.

QuorumKit works with **Claude Code**, **GitHub Copilot**, or both. You need only one — choose the platform you already use.

---

## How it works

Every unit of work starts as a GitHub Issue. From there, the cycle runs automatically:

1. **Triage** — `triage-agent` classifies the issue, applies labels, and routes it to the right pipeline.
2. **Spec** — `ba-agent` (Business Analyst) turns the issue into a structured `spec.md` that describes exactly what to build.
3. **Design** — `architect-agent` reviews the spec, records key decisions as ADRs (Architecture Decision Records), and flags cross-feature conflicts.
4. **Implement** — `dev-agent` implements the spec using TDD (Test-Driven Development), constrained by your project constitution.
5. **Validate** — `qa-agent`, `reviewer-agent`, and `security-agent` check the PR for quality, spec compliance, and OWASP Top 10 vulnerabilities.
6. **Release** — `release-agent` bumps the semantic version, updates CHANGELOG, and publishes a GitHub Release on merge.

You can also invoke any agent on demand — with a slash command in Claude Code, an `@mention` in a GitHub PR comment, or from the local browser dashboard.

---

## Prerequisites

| Requirement | How to set it up |
|-------------|-----------------|
| [Claude Code](https://claude.ai/code) CLI | Download from claude.ai/code. Add `ANTHROPIC_API_KEY` as a GitHub Actions secret in your repository **Settings → Secrets → Actions**. |
| GitHub Copilot subscription (Business or Enterprise recommended) | Required for Copilot-mode agents in GitHub Actions. Add `permissions: models: read` to your workflow YAML. |
| [GitHub CLI](https://cli.github.com) (`gh`) | `brew install gh` (macOS) or see the [install guide](https://cli.github.com). Then run `gh auth login`. |
| Node.js v18+ | [nodejs.org](https://nodejs.org) or `brew install node` |

> **You do not need both Claude Code and Copilot.** Install only the row that matches your platform.

---

## Quick start

```bash
# Step 1 — Clone QuorumKit to a local directory (one-time setup)
git clone https://github.com/your-org/quorumkit.git ~/quorumkit

# Step 2 — Move into the project you want to set up
cd /path/to/my-project

# Step 3 — Run the installer with the appropriate flag

# Claude Code only (default — no --ai flag needed)
bash ~/quorumkit/scripts/init.sh

# GitHub Copilot only
bash ~/quorumkit/scripts/init.sh --ai=copilot

# Both runtimes simultaneously
bash ~/quorumkit/scripts/init.sh --ai=both

# Both runtimes + the four industrial domain agents
bash ~/quorumkit/scripts/init.sh --ai=both --domain=industrial
```

`init.sh` copies the following into your repository without touching your existing source code:

- Agent definitions for all selected agents
- 26 GitHub Actions workflows (12 for Claude + 12 for Copilot + the `orchestrator` + an `alert-to-issue` converter)
- Orchestrator pipeline YAML files (feature, bug-fix, release)
- PR template with per-agent sign-off checklists
- Issue templates: bug report, feature request, security vulnerability
- Starter `CONTRIBUTING.md` and `SECURITY.md`

After it completes, commit and push the generated files. `init.sh` never touches
existing source code, so it's safe to stage everything in one go — this also
picks up `CLAUDE.md`, `CONTRIBUTING.md`, `SECURITY.md`, the reference guides,
`scripts/` (local pipeline runner), and `src/pipelines/` (orchestrator pipeline
definitions), not just `.github/`/`.claude/`/`.specify/`:

```bash
git add -A
git commit -m "chore: install QuorumKit"
git push
```

For all available flags and post-install steps: [`docs/INIT.md`](docs/INIT.md).
Adding QuorumKit to an existing repo with existing CI/CD: [`docs/BROWNFIELD_GUIDE.md`](docs/BROWNFIELD_GUIDE.md).
Industrial / OT (Operational Technology) projects: [`docs/DARK_FACTORY_GUIDE.md`](docs/DARK_FACTORY_GUIDE.md).

---

## Agents

### Universal agents

These 11 agents are installed in every QuorumKit project.

> **Slash command** — type in the Claude Code chat to invoke the agent locally.
> **GitHub trigger** — post as a PR comment (e.g. `@qa-agent`) or let the orchestrator fire it automatically.

| Agent | Slash command | GitHub trigger | What it does |
|-------|--------------|----------------|-------------|
| BA / Product *(Business Analyst)* | `/ba-agent` | — | Turns an issue into a structured `spec.md` |
| Developer | `/dev-agent` | — | Implements the active spec using TDD; validates output against the project constitution |
| QA / Test | `/qa-agent` | `@qa-agent` in PR | Runs quality gates, SLO (Service Level Objective) checks, and mutation testing |
| Reviewer | `/reviewer-agent` | `@reviewer-agent` in PR | Checks spec compliance and API contract conformance |
| Architect | `/architect-agent` | `@architect-agent` in PR | Writes ADRs and checks cross-feature consistency |
| DevOps | `/devops-agent` | — | Reviews CI/CD pipelines, staged ring deployments, cost estimates (Infracost), and observability config |
| Security | `/security-agent` | `@security-agent` in PR | Runs an OWASP Top 10 scan and checks for known dependency vulnerabilities |
| Triage | `/triage-agent` | Auto on new issues | Classifies, labels, routes, and deduplicates incoming issues |
| Release | `/release-agent` | Auto on push to `main` | Bumps semantic version, updates CHANGELOG, creates a GitHub Release |
| Docs | `/docs-agent` | `@docs-agent` / on merge | Updates README, API reference, and syncs documentation |
| Tech-Debt | `/tech-debt-agent` | Monthly schedule | Identifies code hotspots, dead code, and outdated dependencies |

### Industrial domain agents

Install with `--domain=industrial`. These four agents are designed for manufacturing, industrial IoT, and OT (Operational Technology) environments.

| Agent | Slash command | What it does |
|-------|--------------|-------------|
| OT Integration | `/ot-integration-agent` | Reviews the IT/OT network boundary, checks industrial protocol usage, scans OPC-UA (OPC Unified Architecture) connectivity |
| Digital Twin | `/digital-twin-agent` | Detects drift between the digital model and the real asset, validates historian (time-series database) schema, checks simulation coverage |
| Compliance | `/compliance-agent` | Reviews against IEC 62443 (industrial cybersecurity), ISA-95 (enterprise–control integration), and SIL (Safety Integrity Level) / functional safety standards |
| Incident | `/incident-agent` | Runs severity classification → active mitigation → Root Cause Analysis (RCA) → post-mortem document |

---

## Spec Kit

Spec Kit is the guided spec-to-code workflow. Run the five core commands in order to take a feature from an initial description to a working, tested implementation.

| Step | Command | Output |
|------|---------|--------|
| 1 | `/speckit-specify` | `specs/NNN-slug/spec.md` — structured feature description |
| 2 | `/speckit-clarify` | Resolved ambiguities written back into `spec.md` |
| 3 | `/speckit-plan` | `specs/NNN-slug/plan.md` — design decisions and implementation approach |
| 4 | `/speckit-tasks` | `specs/NNN-slug/tasks.md` — ordered implementation task list |
| 5 | `/speckit-implement` | Code and tests, written task by task |

Additional commands (run at any point):

| Command | What it does |
|---------|-------------|
| `/speckit-analyze` | Cross-checks spec, plan, and tasks for consistency gaps |
| `/speckit-checklist` | Generates a custom review checklist for the current feature |
| `/speckit-constitution` | Defines project-wide rules that all agents must follow |
| `/speckit-taskstoissues` | Converts the task list into individual GitHub Issues |

---

## Orchestrator

The orchestrator runs agent sequences automatically from pipeline YAML configuration files. When a GitHub event fires, the orchestrator reads the matching pipeline, calls each agent in turn, and forwards the result to the next step. No manual commands are needed for routine SDLC work.

**Capabilities:**

| Capability | Detail |
|------------|--------|
| Event-driven | Triggered by GitHub events: new issues, PRs opened or updated, labels applied, or upstream workflow completions (`workflow_run`) |
| Pipeline schema | Each pipeline YAML defines an `entry` step, `transitions` (what step runs next and under what conditions), and a `loop_budget` (maximum agent invocations per run) |
| Per-step runtime | Each step can run on `claude` or `copilot`; defaults come from `src/runtimes.yml` |
| State tracking | Progress is stored in a hidden HTML comment (`<!-- apm-state -->`) on the orchestrator comment; a human-readable summary is also posted to the issue timeline |
| Agent protocol | Each agent reports its outcome with a structured comment token: `<!-- apm-msg v="1" outcome="success/failure/escalate" -->` |
| Loop budget | If the invocation count for a run exceeds the budget, the run halts to prevent runaway loops |
| Step timeouts | Each step has a `timeout_minutes` limit; if exceeded, a configurable failure-fallback step runs |
| Approval gates | Set `approval: required` on any step; the pipeline pauses until a repository collaborator with write access posts `/approve` as a comment |
| Dashboard | Live pipeline state is pushed to the local browser dashboard within ~5 seconds |

**Built-in pipelines** (in `src/pipelines/`):

| Pipeline | Trigger | Stages |
|----------|---------|--------|
| Feature | New issue opened | triage → ba → architect → dev → qa → reviewer → release |
| Bug-fix | Issue labelled `bug` | triage → dev → qa → reviewer |
| Release | Push to `main` | qa → reviewer → **[human approval]** → release |

Full pipeline YAML reference: [`docs/PIPELINES.md`](docs/PIPELINES.md).

---

## NNN naming convention

Every feature starts as a GitHub Issue. The issue number becomes the `NNN` prefix (zero-padded to three digits) on every related artifact. This makes it trivial to find everything for a given feature: search `042` across the repository and you immediately find the issue, branch, spec directory, and any ADRs.

| Artifact | Pattern | Example |
|----------|---------|---------|
| GitHub issue | Auto-assigned by GitHub | `#42` |
| Spec directory | `specs/NNN-slug/` | `specs/042-user-auth/` |
| Git branch | `NNN-slug` | `042-user-auth` |
| Architecture Decision Record | `docs/architecture/adr-NNN-slug.md` | `adr-042-jwt-vs-opaque.md` |

No separate counter needed — the GitHub issue number is the single source of truth.

---

## Invoking agents

### Claude Code — slash commands

Type these in the Claude Code chat. Each agent reads your project constitution and the active spec before acting.

```bash
# Start a new feature
/ba-agent Add OAuth2 login via GitHub    # the description text seeds the spec

# Implement the active spec
/dev-agent                               # picks up the current spec automatically

# Review a PR
/qa-agent                                # quality gates on the current PR
/reviewer-agent                          # spec compliance review
/security-agent                          # OWASP scan + dependency check

# Architecture
/architect-agent                         # write an ADR or check cross-spec consistency

# Operations
/devops-agent                            # CI/CD and infrastructure review
/triage-agent                            # classify and route open issues
/docs-agent                              # update documentation

# Cut a release — choose the appropriate version bump
/release-agent patch                     # bug fix:         1.2.3 → 1.2.4
/release-agent minor                     # new feature:     1.2.3 → 1.3.0
/release-agent major                     # breaking change: 1.2.3 → 2.0.0

# Tech debt — optionally scope the scan to a specific area
/tech-debt-agent                         # full scan
/tech-debt-agent dependencies            # focus on outdated packages
/tech-debt-agent security                # focus on vulnerable dependencies

# First time
/onboard                                 # interactive setup wizard
```

### GitHub — PR comments

Post these as comments on a pull request. The corresponding GitHub Actions workflow picks them up within seconds.

```
@qa-agent              # QA review + mutation testing on this PR
@reviewer-agent        # spec compliance + API contract review on this PR
@architect-agent       # ADR or cross-spec consistency check
@security-agent        # OWASP Top 10 + dependency scan on this PR
@docs-agent            # documentation audit on this PR

# Industrial domain agents (requires --domain=industrial):
@ot-integration-agent
@digital-twin-agent
@compliance-agent
@incident-agent
```

### Automatic triggers

These agents fire without any manual action:

| Agent | Fires when |
|-------|----------|
| `triage-agent` | Any new issue is opened |
| `release-agent` | Any commit is pushed to `main` |
| `tech-debt-agent` | First Monday of every month |

---

## Local dashboard

The dashboard is a browser-based control centre for monitoring agent runs and triggering agents without typing commands.

**Features:**
- Real-time log streaming per agent
- Kanban board showing the pipeline state of every active feature
- Manual agent invocation — click to trigger instead of typing a slash command
- Embedded terminal per agent for direct interaction

```bash
# Run from the quorumkit/ directory
bash engine/dashboard/start.sh    # opens http://localhost:3131
```

Full guide: [`docs/DASHBOARD.md`](docs/DASHBOARD.md).

---

## Customisation

After running `init.sh`, personalise QuorumKit for your project.

**1. Define your project constitution**

Run `/speckit-constitution` in Claude Code. This creates `.specify/memory/constitution.md`, which every agent reads before acting. Use it to define your technology stack, coding standards, quality thresholds, cost limits, and any hard constraints specific to your project.

**2. Adjust agent behaviour**

Edit the agent files in `.claude/agents/` (Claude Code) or `.github/agents/` (Copilot). Each agent is a single Markdown file. Add domain-specific rules, restrict what the agent may do, or inject project context that all runs of that agent should be aware of.

**3. Customise pipelines**

Edit the pipeline YAML files in `src/pipelines/`. Change the agent sequence, adjust loop budgets, add or remove approval gates, or set per-step timeouts. Full reference: [`docs/PIPELINES.md`](docs/PIPELINES.md).

**4. Control auto-commits**

Edit `.specify/extensions/git/git-config.yml`. Choose whether agents commit their changes automatically or stage them and wait for human review.

**5. Add project-specific CI/CD steps**

Edit `.github/workflows/` to add any setup steps your project requires before agents run — for example, installing dependencies or starting a test database.

---

## Repository layout

The diagram below shows the QuorumKit source repository. `init.sh` reads from `src/` and copies the relevant files into your target project.

```
quorumkit/
│
├── quorumkit.yml                 # Package metadata: name, version, description
│
├── src/                          # Everything init.sh distributes to target repos
│   ├── agents/                   # Agent definitions — single source of truth
│   ├── skills/                   # Slash-command activation wrappers
│   ├── pipelines/                # Orchestrator pipeline YAML files
│   ├── runtimes.yml              # Maps each agent to its default runtime (claude / copilot)
│   ├── agent-identities.yml      # Per-agent runtime overrides
│   ├── seed/                     # Starter files written to the target repo on init
│   │                             # (CLAUDE.md, CONTRIBUTING.md, SECURITY.md, …)
│   ├── .github/                  # Template workflows, Copilot instructions, issue/PR templates
│   └── scripts/                  # init.sh, quality-check.sh, verify-mirror.sh
│
├── engine/                       # Stays in this repo — not distributed to target repos
│   ├── orchestrator/             # Orchestrator runtime (Node.js)
│   └── dashboard/                # Local browser control centre
│
├── docs/                         # Guides, how-tos, and Architecture Decision Records (ADRs)
├── specs/                        # QuorumKit's own feature specs
└── scripts/                      # Development utilities for this repository
```

---

## Alternative install: APM

This is an alternative to the `git clone` approach above. If your team uses [APM](https://github.com/microsoft/apm) (Microsoft's Agent Package Manager), declare QuorumKit as a dependency in your project's `quorumkit.yml` and run `apm install`.

```yaml
# quorumkit.yml in your project
dependencies:
  apm:
    - source: github:your-org/quorumkit    # replace with the actual repository path
      version: main                        # or pin to a release tag, e.g. v3.1.0
```

```bash
apm install
```

---

## Further reading

| Document | Read this when… |
|----------|----------------|
| [`docs/INIT.md`](docs/INIT.md) | You need all `init.sh` flags, environment variables, and post-install verification steps |
| [`docs/PIPELINES.md`](docs/PIPELINES.md) | You want to understand or customise pipeline YAML, the runtime registry, or the `apm-msg` protocol |
| [`docs/AGENT_PROTOCOL.md`](docs/AGENT_PROTOCOL.md) | You are building or debugging an agent and need to understand outcome tokens and state framing |
| [`docs/DASHBOARD.md`](docs/DASHBOARD.md) | You want to configure the dashboard or run it in development mode |
| [`docs/BROWNFIELD_GUIDE.md`](docs/BROWNFIELD_GUIDE.md) | You are adding QuorumKit to an existing repo that already has CI/CD |
| [`docs/DARK_FACTORY_GUIDE.md`](docs/DARK_FACTORY_GUIDE.md) | You are setting up a greenfield industrial or lights-out project |
| [`docs/ENHANCEMENTS.md`](docs/ENHANCEMENTS.md) | You want to contribute a new feature or review the roadmap |
| [`CHANGELOG.md`](CHANGELOG.md) | You want to see what changed in a specific release |

---

Contributing to QuorumKit itself: [`CONTRIBUTING.md`](CONTRIBUTING.md).
