# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

(no entries)

---

## [3.0.0] — 2026-05-09 (Issues #47, #61, #67)

> **Breaking change.** Full rebranding to **QuorumKit** (Issue #67), repository topology
> rewritten into three zones (Package payload / Engine / Self-host), and the orchestrator
> engine is now distributed as a versioned GitHub Action + npm package (`quorumkit-engine`)
> (Issue #47). v3 NPM release (Issue #61).
> See `MIGRATION.md` for the complete before/after reference table.
> See `docs/architecture/adr-047-repo-topology-and-engine-distribution.md`
> and `specs/047-repo-topology/spec.md` for the full topology rationale.

### ⚠️ Breaking changes

- **Project renamed to QuorumKit.** `apm-engine` → `quorumkit-engine`, `apm-orchestrator` → `quorumkit-orchestrator`. No backward-compatible alias published (Issue #67, FR-002/FR-003).
- **`apm.yml` renamed to `quorumkit.yml`** — v3 does not accept the old filename. `installer/init.sh` exits non-zero with a migration notice if `apm.yml` is detected (FR-004/FR-005, ADR-067).
- **GitHub repository renamed**: `agentic-dev-stack` → `quorumkit`. Consumer `uses:` paths must be updated to `uses: dmitry-nalivaika/quorumkit/engine@v3`.
- **VS Code extension renamed**: `apm-copilot-bridge` → `quorumkit-copilot-bridge`; command prefix changed from `apm.` to `quorumkit.`.
- **Wire-format tokens unchanged** — `apm-msg`, `apm-state`, `apm-pipeline-state` are intentionally NOT renamed (FR-013, FR-014).
- **`.apm/` directory unchanged** — renaming deferred to a future major with full migration strategy.
- **Engine moved.** `scripts/orchestrator/` → `engine/orchestrator/`,
  `tests/orchestrator/` → `engine/tests/`, `dashboard/` → `engine/dashboard/`.
  Consumer workflows that ran `node scripts/orchestrator/index.js` MUST
  switch to `uses: dmitry-nalivaika/quorumkit/engine@v3` (or a SHA pin).
  Migration: `bash installer/init.sh --upgrade --apply --engine-ref=v3`.
- **Installer moved.** `scripts/{init,verify-mirror,quality-check}.sh` →
  `installer/`. Backward-compatible shims at `scripts/*.sh` `exec` the new
  path; they will be removed in v4.0.0.
- **Seed files moved.** `templates/{CLAUDE,CONTRIBUTING,SECURITY,copilot-instructions}.md`
  → `templates/seed/`. The installer copies them from the new location;
  external scripts that reference the old path must be updated.
- **`apm.yml` `version: 2.1.0` → `3.0.0`** (T-25).
- **`templates/.apm/pipelines/` removed.** Pipelines live only at
  `.apm/pipelines/`; `installer/init.sh` copies them straight from the
  SoT (FR-005, mirror gate M4).
- **`.github/agents/` removed from this repo.** That directory is created
  in *consumer* repos by the installer; in the SoT, agent definitions
  live only at `.apm/agents/` (FR-006, mirror gate M6).
- **Pipelines may now declare `apiVersion: 'X.Y'`.** The engine refuses
  to load a pipeline whose `apiVersion` is newer than its own (FR-013).
  `ENGINE_API_VERSION` is `1.0` in this release.

### ✨ Features

- **Three-zone repo topology** documented in `CONTRIBUTING.md` →
  *Repo Topology* (FR-026). Mirror surfaces M4–M9 added to
  `installer/verify-mirror.sh` with negative-test fixtures
  (`installer/tests/test-verify-mirror.sh` — 13/13).
- **Engine GitHub Action** (`engine/action.yml`) — `runs.using: 'node20'`,
  `runs.main: 'dist/index.js'`. Bundle built via `@vercel/ncc` and committed
  to `engine/dist/`. `.github/workflows/engine-build-gate.yml` rebuilds on
  every PR and rejects bundle drift (T-09, FR-009).
- **OIDC-trusted npm publishing.** `.github/workflows/engine-release.yml`
  triggers on signed `v*` tags, runs in a protected `release` Environment,
  verifies the tag signature, rebuilds `dist/`, and publishes
  `quorumkit-engine` with `--provenance` — no `NPM_TOKEN` ever read
  (T-12, FR-010, SC-009, SEC-HIGH-001).
- **Per-scope `engine/SECURITY.md`** with permission justification table,
  threat-model snapshot, and change-control rules. Default consumer-side
  permission posture is `contents: read` + `issues: write` +
  `pull-requests: write` (T-11, FR-014, SEC-MED-001).
- **`installer/init.sh --upgrade`** rewrites consumer `.github/workflows/*.yml`
  from `node engine/orchestrator/index.js` to the Action `uses:` form.
  Dry-run by default; refuses to broaden any `permissions:` block
  (T-20, FR-024, SEC-MED-002).
- **Dependabot** for `github-actions` (root) and `npm` (`/engine`,
  `/engine/orchestrator`, `/engine/dashboard`) ecosystems
  (T-17, FR-031, ADR-047 §6).
- **Safe YAML loading** pinned to `js-yaml`'s `CORE_SCHEMA` across the
  engine. Tag-aware loaders (`!!js/function`) are forbidden and
  exercised in a regression test (T-10, FR-013).

### 🔒 Security

- **All third-party `uses:` SHA-pinned** in `.github/workflows/` and
  `templates/github/workflows/` (T-16, FR-031, mirror gate M9).
- **Engine release path is reproducible**: signed tag → rebuilt bundle
  → provenance-attested npm tarball. Verifying GPG fingerprint published
  in `docs/architecture/adr-047-action-runtime.md` and rotation procedure
  in `engine/RELEASING.md` (T-23, SEC-MED-004).
- **Pipeline `apiVersion` gate** prevents a newer-DSL pipeline from
  triggering cryptic engine crashes (FR-013, T-10).

### 📚 Documentation

- `engine/RELEASING.md` — both channels, signed-tag procedure, rollback
  via `npm deprecate` + dist-tag swap, fallback-token disaster recovery.
- `engine/SECURITY.md` — per-scope permissions table + threat model.
- `BROWNFIELD_GUIDE.md`, `INIT.md`, `PIPELINES.md`, `DASHBOARD.md`,
  `README.md`, `CONTRIBUTING.md` — path references updated to `installer/`,
  `engine/`, `templates/seed/`.
- `docs/architecture/adr-047-repo-topology-and-engine-distribution.md`
  + `docs/architecture/adr-047-action-runtime.md` — design record and
  runtime amendment.

### 🧪 Migration cheatsheet for consumer repos

```bash
# 1. Pull the QuorumKit package.
cd /path/to/quorumkit-clone && git pull --ff-only

# 2. From the consumer repo, dry-run the upgrade.
cd /path/to/your-project
bash /path/to/quorumkit-clone/installer/init.sh --upgrade --engine-ref=v3
# Review the diff. The script refuses if existing 'permissions:' blocks
# lack required engine scopes — fix those by hand and re-run.

# 3. Apply.
bash /path/to/quorumkit-clone/installer/init.sh --upgrade --apply --engine-ref=v3

# 4. Commit + open a PR. Branch protection runs verify-mirror; the PR
#    must be green before merge.
```

---



### ✨ Features — Orchestrator v2 (#44)

- **v2 dispatch** wired into `runOrchestrator`: declarative `entry` / `transitions` graph with backward edges (loops), replacing v1's linear `steps[]` chain.
- **Runtime registry** (`.apm/runtimes.yml`, ADR-005): pluggable adapters; v2 ships with `claude` and `copilot` kinds enabled. `azure-openai`, `bedrock`, `ollama`, `custom` are reserved pending per-kind ADRs.
- **Two-channel state** (ADR-004): public append-only timeline comments + a single idempotent `<!-- apm-state -->` block per Issue/PR. Timeline reconstructor rebuilds run history on resume.
- **`apm-msg` protocol**: agents emit `<!-- apm-msg v="1" outcome="…" -->…<!-- /apm-msg -->` blocks; outcomes drive transitions (FR-014).
- **Loop budget** (FR-018): per-pipeline cap (`loop_budget`) prevents infinite ping-pongs; over-budget runs halt with a regulator comment.
- **Per-step timeout** (FR-019): `timeout_minutes` enforced on every step; expiry triggers an `orchestrator-failure` fallback transition.
- **Regulation lint** (`scripts/orchestrator/regulation-lint.js`): validates that every label / outcome / trigger referenced by pipelines is declared in `docs/AGENT_PROTOCOL.md`.
- **`verify-mirror.sh`** + CI gate: enforces ADR-006 — `.apm/` is canonical, Copilot tree is mirrored and verified.
- **Pipeline validator CLI** (`pipeline-validator-cli.js`): JSON Schema validation of v2 pipelines; failures fail PR CI.
- **Dedup-key** module: stable hash for transition idempotency; safe replay on workflow restarts.

### 🔄 Cutover

- All shipped pipelines (`feature-pipeline.yml`, `bug-fix-pipeline.yml`, `release-pipeline.yml`) rewritten in the v2 schema. The `feature-pipeline-v2.yml` worked example was folded into the canonical `feature-pipeline.yml`.
- Removed the `pipeline:v2` opt-in label from `docs/AGENT_PROTOCOL.md`; v2 is the only schema in shipped pipelines.
- The v1 backward-compat adapter remains in code but is unused by shipped pipelines.

### 🧪 Tests

- 175/175 orchestrator tests green (vitest): adds `agent-invoker-v2`, `apm-msg-parser`, `dedup-key`, `index-v2`, `loop-budget`, `regulation`, `retry`, `router-v2`, `runtime-adapters`, `runtime-registry`, `state-manager-v2`, `timeline-reconstructor`, `worked-example`.
- 4 CI quality gates pass: `quality-check.sh`, `verify-mirror.sh`, pipeline-validator, regulation-lint.

### 📖 Documentation

- **`docs/AGENT_PROTOCOL.md`** (FR-014): single canonical regulation document declaring every label, `apm-msg` outcome, and transition trigger.
- **`PIPELINES.md`** rewritten for v2: how-it-works diagram, full YAML reference, runtime registry, two-channel state, `apm-msg` protocol with worked example, CI gates, troubleshooting.
- **`README.md`** trimmed and restructured around the v2 orchestrator; added a documentation map.
- **Renamed `ORCHESTRATOR.md` → `DASHBOARD.md`** to remove the name collision with the GHA Orchestrator. Content unchanged; new title clarifies scope.
- **`ENHANCEMENTS.md`** de-duplicated (the bottom half repeated the upper Gap Analysis / Roadmap content).
- **ADR-004 / 005 / 006 / 007** authored under #44; ADR-002 marked Superseded by ADR-004 with corrupted header fixed.
- Spec & plan: `specs/044-orchestrator-v2-design/{spec,plan,tasks}.md`.

---

## [2.1.0] — 2026-05-04

### ✨ Features

- **Autonomous Agent Orchestration** (#2): Orchestrator GitHub Actions workflow that automatically sequences agents in response to repository events — no manual slash-commands required for routine SDLC work
- **Declarative Pipeline Configuration** (#2): YAML pipeline files at `.apm/pipelines/*.yml` validated against JSON schema on load; malformed files are rejected gracefully while others remain active
- **Human-in-the-Loop Approval Gates** (#2): `approval: required` gate on any pipeline step; pauses execution, posts comment, resumes on authorised `/approve`; times out after 72 hours by default
- **Pipeline State Persistence** (#2): Full pipeline run state serialised as tagged HTML comment in GitHub Issues/PRs; Orchestrator reconstructs in-progress state after restart without local memory
- **Dashboard Pipeline Webhook** (#2): `POST /webhook/pipeline-event` endpoint on `dashboard/server.js` + WebSocket broadcast within 5 seconds; skipped silently when `DASHBOARD_WEBHOOK_URL` is unset
- **Dual-AI Runtime Dispatch** (#2): `agent-invoker.js` routes to Claude Code (`agent-*.yml`) or Copilot (`copilot-agent-*.yml`) based on `aiTool` in `.apm-project.json`; defaults to `copilot` when absent
- **Default Pipeline Templates** (#2): `feature-pipeline.yml`, `bug-fix-pipeline.yml`, and `release-pipeline.yml` installed by `init.sh`; `release-pipeline.yml` includes `approval: required` before the release step
- **Dashboard Pipelines Tab** (#8): Live trigger, progress tracking, and board mirroring for pipeline runs
- **Dashboard Project Name** (#8): Current project name shown in topbar and browser tab title
- **Copilot Bridge Agent Mode** (#3): `apm-copilot-bridge` VS Code extension opens Copilot Chat in Agent mode automatically (v0.1.1 → v0.1.5)
- **Orchestrator Backend Server** (#3): Real Node.js + WebSocket backend for live agent orchestration
- **Dashboard UI Redesign** (#3): Office-style UI with console, Kanban board, and auto-sync

### 🐛 Bug Fixes

- **Orchestrator workflow permissions** (#2): Removed invalid `members` permission key (GHA schema violation)
- **Security blockers** (#8): Resolved BLOCKER-1, BLOCKER-2, SEC-HIGH-001, SEC-HIGH-002, SEC-HIGH-003 from PR #8 review — webhook secret authentication, input validation, error exposure
- **Copilot workflows** (#8): Replaced non-existent `github/copilot-actions/ask@v1` with GitHub Models API
- **Orchestrator cascade prevention** (#8): Stop triggering on every `workflow_run` event
- **Orchestrator graceful skip** (#8): No-op when orchestrator is not installed in the consuming repo
- **Orchestrator audit guard** (#8): Guard `postAuditEntry` when `issueNumber` is undefined
- **Dashboard port handling** (#7): Fixed port conflicts and pipeline template installation on start
- **Spec-002 architect review** (#7): Addressed ARCH-BLOCKER-1, ARCH-BLOCKER-2, ARCH-CONCERN-1..4
- **SECURITY.md dead link** (#4): Fixed relative link `../README.md` → `README.md`
- **CI markdown link check** (#4): Replaced deprecated `gaurav-nelson/github-action-markdown-link-check` with direct `npx` call
- **Copilot window management** (#3): Fixed per-agent VS Code windows, `--new-window` flash, `code` PATH resolution on macOS
- **Copilot Bridge submissions** (#3): Fixed clipboard paste submit, Agent mode switching, cold-start retry

### 🧪 Tests

- Orchestrator unit test suite: 42 tests, 100% passing (vitest, no live GitHub API required)
- Modules covered: `pipeline-loader`, `router`, `state-manager`, `approval-gate`, `agent-invoker`, `github-client`, `index`, `dashboard-webhook`

### 📖 Documentation

- Added `ORCHESTRATOR.md` — complete usage guide for the autonomous orchestrator
- Added `docs/architecture/adr-002-orchestrator-state-storage.md` — state storage design decision
- Added `docs/architecture/adr-003-copilot-workflow-github-models-migration.md`
- Updated `README.md` — Autonomous Orchestrator section added

---

## [2.0.0] — 2026-04-01 *(retroactive — initial published release)*

### ✨ Features

- 15 specialised AI agents (BA, Developer, QA, Reviewer, Architect, DevOps, Security, Triage, Release, Docs, Tech-Debt + 4 Industrial domain agents)
- 25 GitHub Actions workflows (12 Claude + 12 Copilot + `alert-to-issue`)
- Spec Kit integration (`/speckit-*` skills)
- NNN traceability convention
- Brownfield adoption support with conflict detection
- Dark Factory guide for lights-out industrial projects
- APM Constitution enforcement across all agents
- `init.sh` zero-config installer with `--ai=claude|copilot|both` and `--domain=industrial`
- Dashboard: browser-based agent control centre with Kanban, live logs, terminal integration
- `apm-copilot-bridge` VS Code extension for Copilot Agent mode auto-invocation
