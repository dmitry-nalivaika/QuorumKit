# QuorumKit

**QuorumKit** sets up a fully autonomous software-development cycle in any GitHub repository — one command installs 15 specialised AI agents, an event-driven workflow orchestrator, Spec Kit (a guided spec-to-code workflow), and the GitHub Actions automation that wires them all together.

> **"Dark Factory"** — the software factory runs itself.
> The loop: Triage → Spec → Plan → Implement → Test → Review → Security → Merge → Release → Document → Deploy → Monitor → Feedback → new Issue.
> Humans set strategy and approve escalations. Agents handle execution.

Works with **Claude Code**, **GitHub Copilot**, or **both** simultaneously. You do not need both — pick the AI platform you already use.

---

## Prerequisites

| Requirement | Needed for |
|-------------|-----------|
| [Claude Code](https://claude.ai/code) CLI + `ANTHROPIC_API_KEY` added as a GitHub repo secret | Claude-mode agents |
| Active GitHub Copilot subscription (Business / Enterprise recommended for Actions use) | Copilot-mode agents |
| `permissions: models: read` added to your workflow YAML | Copilot-mode agents |
| [GitHub CLI](https://cli.github.com) (`gh`) | Both modes |
| Node.js v18+ | Spec Kit integration |

---

## Quick start

```bash
# Clone QuorumKit once to a convenient location
git clone <this-repo-url> ~/quorumkit

# Go to the project you want to set up
cd /path/to/my-project

# Claude Code only (default when no --ai flag is given)
bash ~/quorumkit/scripts/init.sh

# GitHub Copilot only
bash ~/quorumkit/scripts/init.sh --ai=copilot

# Both runtimes
bash ~/quorumkit/scripts/init.sh --ai=both

# Both + industrial domain pack
bash ~/quorumkit/scripts/init.sh --ai=both --domain=industrial
```

All flags and options: [`docs/INIT.md`](docs/INIT.md).
Adding to an existing repo: [`docs/BROWNFIELD_GUIDE.md`](docs/BROWNFIELD_GUIDE.md).
Industrial / OT projects: [`docs/DARK_FACTORY_GUIDE.md`](docs/DARK_FACTORY_GUIDE.md).

---

## What you get

### Universal agents (always installed)

**Slash command** — type in the Claude Code chat to invoke the agent locally.
**GitHub trigger** — mention in a PR comment (e.g. `@qa-agent`) or use an automated event.

| Agent | Slash command | GitHub trigger | Role |
|-------|--------------|----------------|------|
| BA / Product (Business Analyst) | `/ba-agent` | — | Write & refine feature specs |
| Developer | `/dev-agent` | — | Implement features using TDD; validates output against the project constitution |
| QA / Test | `/qa-agent` | `@qa-agent` in PR | Quality gates, SLO checks, mutation testing |
| Reviewer | `/reviewer-agent` | `@reviewer-agent` in PR | Spec compliance, API contract review |
| Architect | `/architect-agent` | `@architect-agent` | Produce Architecture Decision Records (ADRs), cross-spec consistency checks |
| DevOps | `/devops-agent` | — | CI/CD pipelines, staged ring deployments, cost estimates (infracost), observability |
| Security | `/security-agent` | `@security-agent` in PR | OWASP Top 10 review + dependency vulnerability scan |
| Triage | `/triage-agent` | Auto on new issues | Classify, label, route, and deduplicate incoming issues |
| Release | `/release-agent` | Auto on push to `main` | Semantic version bump, CHANGELOG update, GitHub Release creation |
| Docs | `/docs-agent` | `@docs-agent` / on merge | README updates, API reference, documentation sync |
| Tech-Debt | `/tech-debt-agent` | Monthly schedule | Identify hotspots, dead code, and outdated dependencies |

### Industrial domain pack (`--domain=industrial`)

Four additional agents for manufacturing, industrial IoT, and OT (Operational Technology) environments.

| Agent | Role |
|-------|------|
| OT Integration (`/ot-integration-agent`) | IT/OT network boundary review, industrial protocol checks, OPC-UA (OPC Unified Architecture) connectivity scan |
| Digital Twin (`/digital-twin-agent`) | Detect model drift between the twin and real asset, historian (time-series DB) schema validation, simulation coverage |
| Compliance (`/compliance-agent`) | IEC 62443 (industrial cybersecurity), ISA-95 (enterprise–control integration), SIL (Safety Integrity Level) / functional safety review |
| Incident (`/incident-agent`) | Severity classification → mitigation → Root Cause Analysis → post-mortem document |

### Spec Kit

Spec Kit is a structured workflow that takes a feature idea through to a working implementation via AI-guided steps: write a spec → clarify ambiguities → produce a design plan → generate tasks → implement them.

| Command | What it does |
|---------|-------------|
| `/speckit-specify` | Turn a feature description into a structured `spec.md` |
| `/speckit-clarify` | Identify and resolve ambiguities in the spec |
| `/speckit-plan` | Produce a design plan and architecture decisions |
| `/speckit-tasks` | Break the plan into an ordered task list |
| `/speckit-implement` | Execute the tasks one by one (TDD) |
| `/speckit-analyze` | Cross-check spec, plan, and tasks for consistency |
| `/speckit-checklist` | Generate a custom review checklist for the feature |
| `/speckit-constitution` | Define project-wide rules all agents must follow |
| `/speckit-taskstoissues` | Convert the task list into GitHub Issues |

### Orchestrator

The orchestrator sequences agents automatically from declarative pipeline YAML files — no manual slash commands needed for routine SDLC work. When a GitHub event fires (e.g. a new issue is opened), the orchestrator reads the matching pipeline, invokes each agent in order, and passes results to the next step.

| Capability | Detail |
|------------|--------|
| Event-driven | Triggered by GitHub events: new issues, PRs opened/updated, labels applied, or upstream workflow completions |
| Pipeline schema | Each pipeline YAML defines an `entry` step, `transitions` between steps, and a `loop_budget` (max invocations) |
| Runtimes | Each step can run on `claude` or `copilot`; defaults come from `src/runtimes.yml` |
| State | Pipeline progress is written to a hidden HTML comment (`<!-- apm-state -->`) and a visible timeline entry is posted for human observers |
| Protocol | Agents report their outcome to the orchestrator using a structured comment token (`<!-- apm-msg v="1" outcome="…" -->`) |
| Loop budget | A per-pipeline invocation cap prevents runaway agent loops |
| Timeouts | Each step has a `timeout_minutes` limit; if exceeded, a failure-fallback step runs |
| Approval gates | Mark any step `approval: required`; the pipeline pauses until a repo collaborator with write access posts `/approve` |
| Dashboard | Pipeline state is pushed to the local browser dashboard within ~5 s |

**Built-in pipelines** (`src/pipelines/`):

| Pipeline | Stages |
|----------|--------|
| Feature | triage → ba → architect → dev → qa → reviewer → release |
| Bug-fix | triage → dev → qa → reviewer |
| Release | qa → reviewer → **[human approval required]** → release |

Full reference: [`docs/PIPELINES.md`](docs/PIPELINES.md).

### GitHub templates

- 26 GitHub Actions workflows (12 for Claude agents + 12 for Copilot agents + the `orchestrator` workflow + an `alert-to-issue` converter)
- PR template with per-agent review checklists confirming each agent has signed off
- Issue templates: bug report, feature request, security vulnerability
- Starter `CONTRIBUTING.md` and `SECURITY.md` for the target repo

---

## NNN naming convention

Every feature starts with a GitHub Issue. The issue number (`NNN`, zero-padded to 3 digits) is used as a prefix on every related artifact — spec folder, branch, and ADR. This means you can find everything belonging to a feature by searching for its number.

| Artifact | Pattern | Example |
|----------|---------|---------|
| GitHub issue | auto-assigned by GitHub | `#42` |
| Spec directory | `specs/NNN-short-slug/` | `specs/042-user-auth/` |
| Git branch | `NNN-short-slug` | `042-user-auth` |
| Architecture Decision Record | `docs/architecture/adr-NNN-slug.md` | `adr-042-jwt-vs-opaque.md` |

No separate counter to maintain — the GitHub issue number is the single source of truth.

---

## Agent invocation

### Claude Code (slash commands)

```bash
/ba-agent Add user authentication    # the text becomes the feature description
/dev-agent                          # picks up the active feature spec automatically
/qa-agent                           # validate current PR
/reviewer-agent                     # review current PR
/architect-agent                    # produce an ADR or run a cross-spec check
/devops-agent                       # CI/CD and infrastructure review
/security-agent                     # OWASP security review
/triage-agent                       # classify and route open issues
/release-agent [patch|minor|major]  # bump version and publish release
/docs-agent                         # update documentation
/tech-debt-agent [focus]            # e.g. /tech-debt-agent dependencies
/onboard                            # interactive first-time setup wizard
```

### GitHub (PR comments and labels)

```
@qa-agent              # QA + mutation testing on PR
@reviewer-agent        # spec compliance + API contract on PR
@architect-agent       # ADR + cross-spec check
@security-agent        # OWASP + deps on PR
@docs-agent            # docs audit on PR

# Industrial domain pack:
@ot-integration-agent  @digital-twin-agent  @compliance-agent  @incident-agent
```

`triage-agent` runs automatically on every new issue, `release-agent` on every push to `main`, and `tech-debt-agent` on the first Monday of each month.

---

## Local dashboard

A browser control centre for monitoring autonomous agent runs and triggering agents manually. Features: real-time log streaming, a Kanban board showing pipeline state across all active features, and an embedded terminal for each agent.

```bash
bash engine/dashboard/start.sh    # opens http://localhost:3131
```

Full guide: [`docs/DASHBOARD.md`](docs/DASHBOARD.md).

---

## Customisation

After initialisation, tune QuorumKit to your project:

1. **Run `/speckit-constitution`** — define your project's non-negotiable rules: technology choices, coding standards, quality thresholds, cost limits, and any constraints all agents must respect. This creates `.specify/memory/constitution.md`, which every agent reads before acting.
2. **Edit agent definitions** in `.claude/agents/` (or `.github/agents/` for Copilot) to give agents domain-specific context, rules, or constraints for your project. Each agent is a single Markdown file.
3. **Edit `src/pipelines/*.yml`** to customise agent sequences, loop budgets, approval gates, and per-step timeouts (see [`docs/PIPELINES.md`](docs/PIPELINES.md)).
4. **Edit `.specify/extensions/git/git-config.yml`** to control whether agents automatically commit their changes or hold for human review.
5. **Edit `.github/workflows/`** for project-specific CI/CD steps.

---

## Repository layout

```
.
├── quorumkit.yml               # QuorumKit package manifest
│
├── src/                        # Everything init.sh copies into the target repo
│   ├── agents/                 # Agent definitions — the single source of truth
│   ├── skills/                 # Slash-command activation wrappers
│   ├── pipelines/              # Orchestrator pipeline definitions
│   ├── runtimes.yml            # Maps each agent to its runtime (claude / copilot)
│   ├── agent-identities.yml    # Per-agent runtime defaults
│   ├── seed/                   # Starter files written into the target repo (CLAUDE.md, CONTRIBUTING.md, SECURITY.md, …)
│   ├── .github/                # Template workflows, Copilot instructions, issue/PR templates
│   └── scripts/                # init.sh, quality-check.sh, verify-mirror.sh
│
├── engine/                     # Orchestrator runtime + dashboard — stays in this repo, not distributed
│   ├── orchestrator/           # v2 orchestrator (Node.js)
│   └── dashboard/              # Local browser control centre
│
├── docs/                       # Guides, how-tos, and Architecture Decision Records
└── scripts/                    # QuorumKit development utilities (not deployed to consumer repos)
```

---

## Alternative install: APM

This is an alternative to the `git clone` approach in Quick Start. If you use [APM](https://github.com/microsoft/apm) (Microsoft's Agent Package Manager), declare QuorumKit as a dependency and let APM handle fetching and installation:

```yaml
# quorumkit.yml in your project
dependencies:
  apm:
    - source: github:<your-username>/quorumkit
      version: main
```

```bash
apm install
```

---

## Further reading

| Doc | Purpose |
|-----|---------|
| [`docs/INIT.md`](docs/INIT.md) | All `init.sh` flags and examples |
| [`docs/PIPELINES.md`](docs/PIPELINES.md) | Pipeline YAML reference, runtime registry, apm-msg protocol |
| [`docs/AGENT_PROTOCOL.md`](docs/AGENT_PROTOCOL.md) | Agent contract: outcomes, apm-msg framing, state tokens |
| [`docs/DASHBOARD.md`](docs/DASHBOARD.md) | Local browser dashboard |
| [`docs/BROWNFIELD_GUIDE.md`](docs/BROWNFIELD_GUIDE.md) | Adopting QuorumKit in an existing repo |
| [`docs/DARK_FACTORY_GUIDE.md`](docs/DARK_FACTORY_GUIDE.md) | Greenfield industrial / lights-out guide |
| [`docs/ENHANCEMENTS.md`](docs/ENHANCEMENTS.md) | Gap analysis & roadmap |
| [`CHANGELOG.md`](CHANGELOG.md) | Release history |

---

Contributing to this library: [`CONTRIBUTING.md`](CONTRIBUTING.md).
