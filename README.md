# Agentic Dev Stack

A reusable **APM (Agent Package Manager)** package that initialises a
**fully autonomous, lights-out software development cycle** in any project.
One command sets up 15 specialised AI agents, 26 GitHub Actions workflows
(including a v2 declarative orchestrator), Spec Kit integration, and
issue/PR templates.

> **"Dark Factory" = the software factory runs itself.** The loop is:
> Triage → Spec → Plan → Implement → Test → Review → Security → Merge →
> Release → Document → Deploy → Monitor → Feedback → new Issue. Humans set
> strategy and approve escalations; agents handle all execution.

Works with **Claude Code**, **GitHub Copilot**, or **both** simultaneously.

---

## Documentation map

| Doc | Purpose |
|-----|---------|
| `README.md` *(this file)* | What you get, agent catalogue, quick start |
| [`INIT.md`](INIT.md) | Initialisation guide (`init.sh` flags, examples) |
| [`PIPELINES.md`](PIPELINES.md) | v2 orchestrator: pipeline YAML, runtime registry, two-channel state, apm-msg protocol |
| [`docs/AGENT_PROTOCOL.md`](docs/AGENT_PROTOCOL.md) | Agent contract: outcomes, apm-msg framing, `<!-- apm-state -->` |
| [`DASHBOARD.md`](DASHBOARD.md) | Local browser dashboard for live agent invocation |
| [`BROWNFIELD_GUIDE.md`](BROWNFIELD_GUIDE.md) | Adopting APM in an existing repo (conflict detection, gradual rollout) |
| [`DARK_FACTORY_GUIDE.md`](DARK_FACTORY_GUIDE.md) | Greenfield industrial / lights-out manufacturing guide |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Contributing to this library (NNN convention, quality gates) |
| [`ENHANCEMENTS.md`](ENHANCEMENTS.md) | Gap analysis & roadmap |
| [`CHANGELOG.md`](CHANGELOG.md) | Released changes |

---

## What you get

### Universal agents (always installed)

| Agent | Slash command | GitHub trigger | Role |
|-------|--------------|----------------|------|
| BA / Product | `/ba-agent` | — | Write & refine feature specs |
| Developer | `/dev-agent` | — | Implement features (TDD, Constitution Check) |
| QA / Test | `/qa-agent` | `@qa-agent` in PR | Quality gates + SLO + mutation testing |
| Reviewer | `/reviewer-agent` | `@reviewer-agent` in PR | Spec compliance, API contract governance |
| Architect | `/architect-agent` | `@architect-agent` | ADRs, cross-spec consistency |
| DevOps | `/devops-agent` | — | CI/CD, ring deploy, infracost, observability |
| Security | `/security-agent` | `@security-agent` in PR | OWASP + dependency review |
| Triage | `/triage-agent` | Auto on new issues | Classify, route, deduplicate |
| Release | `/release-agent` | Auto on push to `main` | Semver bump, CHANGELOG, GitHub Release |
| Docs | `/docs-agent` | `@docs-agent` / on merge | README, API ref, doc sync |
| Tech-Debt | `/tech-debt-agent` | Monthly schedule | Hotspots, dead code, dep freshness |

### Industrial domain pack (`--domain=industrial`)

| Agent | Role |
|-------|------|
| OT Integration (`/ot-integration-agent`) | IT/OT boundary, protocols, OPC-UA scan |
| Digital Twin (`/digital-twin-agent`) | Model drift, historian schema, simulation coverage |
| Compliance (`/compliance-agent`) | IEC 62443, ISA-95, SIL / functional safety |
| Incident (`/incident-agent`) | SEV classify → mitigate → RCA → post-mortem |

### Spec Kit integration

`/speckit-specify`, `/speckit-clarify`, `/speckit-plan`, `/speckit-tasks`,
`/speckit-implement`, `/speckit-analyze`, `/speckit-checklist`,
`/speckit-constitution`, `/speckit-taskstoissues`.

### Autonomous orchestration (v2)

The **APM Orchestrator** is a single GitHub Actions workflow that drives
agent chains from declarative pipeline YAML — no slash commands needed for
routine SDLC work.

| Capability | Notes |
|------------|-------|
| Event-driven pipelines | Issues, PRs, labels, `workflow_run` events |
| v2 schema | `entry` / `transitions` / `loop_budget`; runtime selected per step |
| Runtime registry | `.apm/runtimes.yml` — supported: `claude`, `copilot` (ADR-005) |
| Two-channel state | Public timeline comments + idempotent `<!-- apm-state -->` block (ADR-004) |
| apm-msg protocol | Agents emit `<!-- apm-msg v="1" outcome="…" -->…<!-- /apm-msg -->` |
| Loop budget | Per-pipeline cap stops infinite ping-pongs (FR-018) |
| Per-step timeout | `timeout_minutes` enforced; orchestrator-failure fallback runs (FR-019) |
| Approval gates | `approval: required` resumes on `/approve` from a `write`+ collaborator |
| Dashboard broadcast | Pipeline state pushed to the dashboard within ~5 s |

**Built-in pipelines** (`.apm/pipelines/*.yml`):

| Pipeline | Path |
|----------|------|
| Feature pipeline | triage → ba → architect → dev → qa → reviewer → release |
| Bug-fix pipeline | triage → dev → qa → reviewer |
| Release pipeline | qa → reviewer → **[approval]** → release |

Full reference: **[PIPELINES.md](PIPELINES.md)**.

### GitHub templates

- 26 GitHub Actions workflows — 12 Claude + 12 Copilot + `orchestrator` + `alert-to-issue`
- PR template with agent sign-off checklists
- Issue templates: bug report, feature request, security vulnerability
- `CONTRIBUTING.md`, `SECURITY.md`

---

## NNN naming convention

A single number ties everything together:

| Artifact | Pattern | Example |
|----------|---------|---------|
| GitHub issue | auto-assigned | `#42` |
| Spec dir | `specs/NNN-short-slug/` | `specs/042-user-auth/` |
| Git branch | `NNN-short-slug` | `042-user-auth` |
| ADR | `docs/architecture/adr-NNN-slug.md` | `adr-042-jwt-vs-opaque.md` |

`NNN` = the GitHub issue number, zero-padded to 3 digits. No separate counter.

---

## Quick start

```bash
# 1. Clone this repo
git clone <this-repo-url> ~/agentic-dev-stack

# 2. Navigate to your new project
cd /path/to/my-new-project

# 3a. Claude Code only (default)
bash ~/agentic-dev-stack/scripts/init.sh

# 3b. GitHub Copilot only
bash ~/agentic-dev-stack/scripts/init.sh --ai=copilot

# 3c. Both
bash ~/agentic-dev-stack/scripts/init.sh --ai=both

# 3d. With industrial domain pack
bash ~/agentic-dev-stack/scripts/init.sh --ai=both --domain=industrial
```

Detailed flags: [`INIT.md`](INIT.md). Adding to an existing repo:
[`BROWNFIELD_GUIDE.md`](BROWNFIELD_GUIDE.md). Industrial / OT projects:
[`DARK_FACTORY_GUIDE.md`](DARK_FACTORY_GUIDE.md).

---

## Repository layout

```
.
├── apm.yml                         # APM package manifest
├── README.md / INIT.md / PIPELINES.md / DASHBOARD.md / …
│
├── .apm/                           # APM package content (platform-agnostic)
│   ├── agents/                     # Agent definitions (single source of truth)
│   ├── skills/                     # Slash-command wrappers
│   ├── pipelines/                  # v2 orchestrator pipelines
│   ├── runtimes.yml                # Runtime registry (claude, copilot)
│   └── agent-identities.yml        # Agent → runtime defaults
│
├── templates/
│   ├── CLAUDE.md / copilot-instructions.md / CONTRIBUTING.md / SECURITY.md
│   └── github/
│       ├── instructions/           # Copilot per-agent instructions
│       ├── workflows/              # 26 GitHub Actions workflows
│       └── ISSUE_TEMPLATE/, pull_request_template.md
│
├── orchestrator/                   # v2 orchestrator runtime (Node)
├── dashboard/                      # Local browser control centre
└── scripts/
    ├── init.sh                     # One-command init
    ├── quality-check.sh            # Library CI gates
    └── verify-mirror.sh            # `.apm/` ↔ `templates/` parity check
```

---

## Agent invocation reference

### Claude Code (local slash commands)

```bash
/ba-agent Add user authentication
/dev-agent                          # picks up spec from .specify/feature.json
/qa-agent                           # validate current PR
/reviewer-agent                     # review current PR
/architect-agent                    # ADR or cross-spec check
/devops-agent                       # CI/CD review
/security-agent                     # security review
/triage-agent                       # triage open issues

# Lifecycle
/release-agent [patch|minor|major]
/docs-agent
/tech-debt-agent [focus]

# Guided
/onboard
```

### GitHub (automated via PR comments / labels)

```
@qa-agent              # QA + mutation testing on PR
@reviewer-agent        # spec compliance + API contract on PR
@architect-agent       # ADR + cross-spec check
@security-agent        # OWASP + deps on PR
@docs-agent            # docs audit on PR

# Industrial domain pack:
@ot-integration-agent  @digital-twin-agent  @compliance-agent  @incident-agent
```

`triage-agent` runs on every new issue, `release-agent` on every push to
`main`, and `tech-debt-agent` on the first Monday each month.

---

## Prerequisites

For **Claude Code**: [Claude Code](https://claude.ai/code) CLI, `ANTHROPIC_API_KEY`
in repo secrets, and Node.js (for github-speckit).

For **GitHub Copilot**: Active Copilot subscription (Business / Enterprise
recommended for Actions); `permissions: models: read` — no extra secrets.

For both: [GitHub CLI](https://cli.github.com) and a Git repo connected to GitHub.

---

## APM installation (alternative)

If you have [APM](https://github.com/microsoft/apm) installed, declare it as
a dependency:

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

---

## Local dashboard

A browser-based control centre for live agent invocation, log streaming,
a Kanban board, and a native terminal per agent.

```zsh
bash dashboard/start.sh    # opens http://localhost:3131
```

Full guide: [`DASHBOARD.md`](DASHBOARD.md).

---

## Customisation

After initialisation:

1. **`/speckit-constitution`** — define your project's non-negotiable rules,
   tech stack, quality thresholds, and cost limits.
2. **Edit agent definitions** in `.claude/agents/` (or
   `.github/instructions/` for Copilot) to add domain-specific rules.
3. **Edit `.apm/pipelines/*.yml`** to customise agent chains, loop budgets,
   approvals, and per-step timeouts (see [`PIPELINES.md`](PIPELINES.md)).
4. **Edit `.specify/extensions/git/git-config.yml`** to toggle auto-commits.
5. **Edit `.github/workflows/`** for project-specific setup steps.

---

## Contributing & roadmap

- Contributing to this library: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- Gap analysis & roadmap: [`ENHANCEMENTS.md`](ENHANCEMENTS.md)
- Released changes: [`CHANGELOG.md`](CHANGELOG.md)
