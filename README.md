# QuorumKit

**QuorumKit** sets up a fully autonomous software-development cycle in any GitHub repository — one command installs 15 specialised AI agents, a declarative orchestrator, Spec Kit integration, and 26 GitHub Actions workflows.

> **"Dark Factory"** — the software factory runs itself.
> The loop: Triage → Spec → Plan → Implement → Test → Review → Security → Merge → Release → Document → Deploy → Monitor → Feedback → new Issue.
> Humans set strategy and approve escalations. Agents handle execution.

Works with **Claude Code**, **GitHub Copilot**, or **both** simultaneously.

---

## Prerequisites

| Requirement | Needed for |
|-------------|-----------|
| [Claude Code](https://claude.ai/code) CLI + `ANTHROPIC_API_KEY` repo secret | Claude-mode agents |
| Active Copilot subscription (Business / Enterprise recommended) + `permissions: models: read` | Copilot-mode agents |
| [GitHub CLI](https://cli.github.com) | Both modes |
| Node.js | Spec Kit integration |

---

## Quick start

```bash
# Clone QuorumKit once
git clone <this-repo-url> ~/quorumkit

# Go to your project
cd /path/to/my-project

# Claude Code only (default)
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

### Spec Kit

Nine guided commands walk agents through spec-driven development:
`/speckit-specify`, `/speckit-clarify`, `/speckit-plan`, `/speckit-tasks`,
`/speckit-implement`, `/speckit-analyze`, `/speckit-checklist`,
`/speckit-constitution`, `/speckit-taskstoissues`.

### Orchestrator

The orchestrator drives agent chains automatically from declarative pipeline YAML — no slash commands needed for routine SDLC work.

| Capability | Detail |
|------------|--------|
| Event-driven | Issues, PRs, labels, `workflow_run` |
| Pipeline schema | `entry` / `transitions` / `loop_budget` |
| Runtimes | `claude`, `copilot` — selected per step (`src/runtimes.yml`) |
| State | Public timeline comments + idempotent `<!-- apm-state -->` block |
| Protocol | Agents emit `<!-- apm-msg v="1" outcome="…" -->` tokens |
| Loop budget | Per-pipeline cap prevents infinite ping-pong |
| Timeouts | `timeout_minutes` per step; failure fallback runs |
| Approval gates | `approval: required` resumes on `/approve` from a `write`+ collaborator |
| Dashboard | Pipeline state visible in the browser dashboard within ~5 s |

**Built-in pipelines** (`src/pipelines/`):

| Pipeline | Stages |
|----------|--------|
| Feature | triage → ba → architect → dev → qa → reviewer → release |
| Bug-fix | triage → dev → qa → reviewer |
| Release | qa → reviewer → **[approval]** → release |

Full reference: [`docs/PIPELINES.md`](docs/PIPELINES.md).

### GitHub templates

- 26 GitHub Actions workflows (12 Claude + 12 Copilot + `orchestrator` + `alert-to-issue`)
- PR template with agent sign-off checklists
- Issue templates: bug report, feature request, security vulnerability
- `CONTRIBUTING.md`, `SECURITY.md`

---

## NNN naming convention

A single number — the GitHub issue number — ties every artifact together:

| Artifact | Pattern | Example |
|----------|---------|---------|
| GitHub issue | auto-assigned | `#42` |
| Spec dir | `specs/NNN-short-slug/` | `specs/042-user-auth/` |
| Git branch | `NNN-short-slug` | `042-user-auth` |
| ADR | `docs/architecture/adr-NNN-slug.md` | `adr-042-jwt-vs-opaque.md` |

`NNN` is the issue number zero-padded to 3 digits. No separate counter.

---

## Agent invocation

### Claude Code (slash commands)

```bash
/ba-agent Add user authentication
/dev-agent                          # picks up spec from .specify/feature.json
/qa-agent                           # validate current PR
/reviewer-agent                     # review current PR
/architect-agent                    # ADR or cross-spec check
/devops-agent                       # CI/CD review
/security-agent                     # security review
/triage-agent                       # triage open issues
/release-agent [patch|minor|major]
/docs-agent
/tech-debt-agent [focus]
/onboard                            # interactive guided setup
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

A browser control centre for live agent invocation, log streaming, Kanban board, and per-agent terminal.

```bash
bash engine/dashboard/start.sh    # opens http://localhost:3131
```

Full guide: [`docs/DASHBOARD.md`](docs/DASHBOARD.md).

---

## Customisation

After initialisation, tune QuorumKit to your project:

1. **Run `/speckit-constitution`** — define your non-negotiable rules, tech stack, quality thresholds, and cost limits.
2. **Edit agent definitions** in `.claude/agents/` (or `.github/agents/` for Copilot) to add domain-specific rules.
3. **Edit `src/pipelines/*.yml`** to customise agent chains, loop budgets, approvals, and timeouts (see [`docs/PIPELINES.md`](docs/PIPELINES.md)).
4. **Edit `.specify/extensions/git/git-config.yml`** to toggle auto-commits.
5. **Edit `.github/workflows/`** for project-specific CI/CD steps.

---

## Repository layout

```
.
├── quorumkit.yml               # QuorumKit package manifest
│
├── src/                        # Source — what init.sh reads and distributes
│   ├── agents/                 # Agent definitions (single source of truth)
│   ├── skills/                 # Slash-command wrappers
│   ├── pipelines/              # Orchestrator pipelines
│   ├── runtimes.yml            # Runtime registry (claude, copilot)
│   ├── agent-identities.yml    # Agent → runtime defaults
│   ├── seed/                   # Seed docs deployed to consumer repos
│   ├── .github/                # Template workflows, instructions, issue/PR templates
│   └── scripts/                # init.sh, quality-check.sh, verify-mirror.sh
│
├── engine/                     # Orchestrator runtime + dashboard (not distributed)
│   ├── orchestrator/           # v2 orchestrator (Node.js)
│   └── dashboard/              # Local browser control centre
│
├── docs/                       # Guides and ADRs
└── scripts/                    # Dev-setup and backward-compat shims
```

---

## Alternative install: APM

If you use [APM](https://github.com/microsoft/apm) (Microsoft's Agent Package Manager), declare QuorumKit as a dependency instead of cloning:

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
