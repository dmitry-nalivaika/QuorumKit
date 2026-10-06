# Changelog

All notable changes to QuorumKit are documented in this file.

Format: [Keep a Changelog 1.0.0](https://keepachangelog.com/en/1.0.0/)  
Versioning: [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html)

---

## [Unreleased]

### ✨ Added

- **Per-feature and per-agent LLM cost and token visibility** (#335). Every agent that calls `chat/completions` (Developer runner plus the triage, ba, ba-enrich, architect, qa, reviewer, security, docs, release and tech-debt workflows) records the response `usage` (`prompt_tokens`, `completion_tokens`, `total_tokens`) and an `estimated_cost_usd` in its `apm-msg` block. Agents without a pipeline outcome append a usage-only block. Rates live in the maintainer-editable `src/model-pricing.yml`; a model with no entry reports tokens and a `null` cost, and pricing problems never fail a run. Costs are estimates, not billing data.
- **Dashboard "Cost & Tokens"** view: a main-nav tab backed by `GET /api/cost-tokens` (per-feature and per-agent tables, partial and not-tracked indicators), plus a summary panel in the per-issue Timeline. Only bot or OWNER/MEMBER/COLLABORATOR comments are counted, so a pasted `apm-msg` block cannot forge totals.
- `init.sh` installs `src/model-pricing.yml`, `src/runtimes.yml` and `src/agent-identities.yml` into consumer repos without overwriting maintainer edits.
- Documented in `docs/AGENT_PROTOCOL.md` (`usage` field) and `docs/DASHBOARD.md` (`/api/cost-tokens`). Known limit: `release`, `tech-debt` and `docs` (no-issue path) post report issues the dashboard does not read, so their usage is auditable in GitHub but not aggregated.

### 🐛 Fixed

- **Eight agent workflows called the retired GitHub Models host** (#326, #327, #328). GitHub Models was retired on 2026-07-30 and `models.inference.ai.azure.com` no longer resolves. Architect, BA, Docs, QA, Release, Reviewer, Security and Tech-Debt fell back to it whenever no `runtime_endpoint` input was given, which is every push, schedule and comment trigger (the Docs and Release failures on the #324 merge, the Tech-Debt scheduled run, and the QA `ENOTFOUND` seen in the v3.3.2 smoke test). They now resolve `default_runtime` from `src/runtimes.yml` exactly as Triage and BA-Enrich already did, use its `credential_ref` (`AZURE_OPENAI_API_KEY`), and no longer default `RUNTIME_CREDENTIAL` to `GITHUB_TOKEN`.
- **No silent fallback.** If no endpoint resolves, the agent workflows and `dev-agent-runner.cjs` now fail loudly (ADR-332 section 5) instead of calling a hardcoded host. The dead fallback is removed from Triage, BA-Enrich and the dev runner too.
- `models.github.ai` is not a replacement: it is also retired and answers `200 OK` (`text/plain`) on every path, including `/inference/chat/completions`, so pointing at it would turn a clear failure into an empty-output one. The `copilot-default` runtime entry is annotated accordingly.

### 🧪 Tests

- `engine/tests/agent-workflow-runtime.test.js` guards every inline agent workflow: no executable reference to the retired host, runtime resolved from the registry, abort when no endpoint resolves, and `.github/` identical to the `src/.github/` mirror.

---

## [3.3.2] — 2026-10-06 · Issue #378 follow-up

### ✨ Added

- **Scheduled reconciler** (#378). `orchestrator.yml` gains a `schedule:` trigger (every 5 minutes). The engine finds issues labelled `status:awaiting-agent` and settles each one: if the agent's result marker is present and its workflow run has finished, the outcome goes through the normal transition code; if the run ended `failure`/`cancelled`/`timed_out` without reporting, the run ends with `runtime-error` (the run is found with `listWorkflowRuns` by workflow file, creation time ≥ dispatch, and the `#<issue>` run-name); otherwise the step's `timeout_minutes` is enforced. Before this, `maybeTimeoutStep` only ran when an event arrived, so a silent agent never timed out. Latency is up to ~5-10 minutes because scheduled runs are best-effort; the sweep is a no-op when nothing is awaiting.
- The engine now applies/removes `status:awaiting-agent` as a run enters/leaves `awaiting-agent`, and records `dispatchedAt` in the run state. A `workflow_run` created before the current dispatch is ignored, so a late event from an earlier iteration cannot end a re-dispatched run.
- **One reporter for every agent message** (#378 follow-up). New `.github/scripts/agent-report.cjs` builds the `agent-start|complete|fail` footprints, the `apm-msg` block and the `apm:run_id=…` result marker, and posts them through the REST API. The Developer runner, all ten inline workflow agents (triage, ba, ba-enrich, architect, qa, reviewer, security, docs, release, tech-debt) and local agents (`node .github/scripts/agent-report.cjs start|complete|fail …`, documented in every manifest) use it, so the message looks the same from every trigger source. See `docs/AGENT_PROTOCOL.md` section 3.0.
- Inline agents declare their verdict with `SUMMARY:` / `OUTCOME:` lines. A missing or invalid `OUTCOME` becomes `needs-human`; it is never guessed. A final `if: always()` step posts exactly one footprint, so a crash anywhere still leaves a `fail` footprint.
- The QA, Reviewer, Security and Architect workflows load the pull request diff (the PR named by the dispatched issue, matched by `Refs/Closes/Fixes #N` or an `NNN-` branch) instead of judging with no context.

### 🐛 Fixed

- **No agent other than Developer posted the `apm:run_id=…` marker** (#378). A dispatched QA, Reviewer or Architect run that succeeded waited until it timed out, and a failed one ended as `runtime-error`. Every inline agent now posts the marker with the verdict it declared.
- **Dispatched runs were skipped.** The job guards of the comment-driven agent workflows (QA, Reviewer, Security, Architect, ...) only matched `@agent` comments, so a `workflow_dispatch` from the Orchestrator started no job. They now let dispatched runs through, and every inline agent declares `issue_number`, `run_id`, `step`, `iteration`, `runtime_name`.
- **Placeholder footprints.** Triage stamps carried `runId 00000000-…` and `T00:00:00Z` because the model copied the manifest template. The footprint sections are removed from the model's prompt and code fills every field from the run.
- **Forged verdicts.** Model text is stripped of footprint comments, result markers and `apm-msg` fences before posting; all agent workflows share one bot login, so an echoed marker could otherwise forge a verdict.
- **Agent footprint stamps were empty and had no `apm-msg` block** (#378). The Developer Agent manifest told the model to post `agent-start|complete|fail` comments with `gh issue comment "…"` through `run_command`, i.e. through `/bin/sh`, where every backtick in the body is command substitution. `` `developer-agent` ``, `` `agent-start` `` and the `` ```apm-msg `` fence all expanded to nothing. The runner now builds and posts the footprints itself via the REST API with the real run id, step, iteration, branch and timestamp; the manifest's footprint sections are removed from the model's prompt and replaced with an instruction to call `signal_outcome` only.

### ⚠️ Upgrade notes

- Pin `engine@v3.3.2` in `orchestrator.yml`. Runs already stuck in `awaiting-agent` have no label: add `status:awaiting-agent` to each such issue once, and the next sweep settles it.
- Create the `status:awaiting-agent` label in the repository if label creation on first use is restricted.

---

## [3.3.1] — 2026-10-06 · Issue #378

### 🐛 Fixed

- **Orchestrator no longer stalls in `awaiting-agent` when a dispatched agent finishes** (#378). Three defects stacked: (1) the `workflow_run` payload carries no inputs, so the issue number was never recovered and the event matched no pipeline; (2) the "is this the awaited agent" check compared the workflow's display name (`Developer Agent (Copilot)`) to the slug (`dev-agent`) and could never match; (3) agents report their result in a bot-authored comment, which the orchestrator workflow skips by design, so no transition was ever applied. Agent workflows now set `run-name` ending in `#<issue>`; the engine reads it, matches by workflow file path, and applies the outcome from the agent's `<!-- apm:run_id=… outcome=… -->` marker (run, step, iteration and author identity all verified) through the pipeline's transition table. A run that crashes without reporting still ends as `runtime-error`.
- **Shared bot login no longer breaks result-marker authorship check** (#378). `github-actions[bot]` is listed under every agent in `src/agent-identities.yml`, but the login lookup keeps one agent per login, so the dev agent's own marker was rejected with the shipped registry. Added `loginMapsToAgent`, which honours every agent a login maps to.
- **All orchestrator-dispatched agent workflows now declare `run_id`, `step`, `iteration` and `runtime_name` inputs** (#378). The runtime adapters send them to every agent, but only the dev workflow declared them, so GitHub would reject the dispatch of any other agent with `Unexpected inputs provided`. The dev agent's result marker now reports the runtime the Orchestrator actually resolved instead of a hardcoded `copilot-default`.

---

## [3.3.0] — 2026-10-06 · Issues #332, #359, #371

### ✨ Added

- **`azure-openai` runtime kind enabled** (Issue #332, ADR-332): maintainers can register their own Azure AI Foundry / Azure OpenAI deployment as a named runtime in `src/runtimes.yml` and assign it per-agent via `agent_defaults`, alongside the existing `claude` and `copilot` kinds. Credentials are referenced by name (e.g. `AZURE_OPENAI_API_KEY`) and resolved from GitHub Actions secrets at dispatch time; a missing/invalid credential or unreachable endpoint fails the run visibly with no silent fallback to another provider. See `docs/architecture/adr-332-enable-azure-openai-runtime-kind.md` and the new step-by-step `docs/AZURE_FOUNDRY_GUIDE.md` (includes creating models in Azure AI Foundry).
- **Orchestrator `workflow_dispatch` support** (#370): the engine re-reads the issue's live labels and routes it like `issues.labeled`, so issues labelled by the Triage Agent (via `GITHUB_TOKEN`, which emits no label events) now enter the bug-fix / feature pipelines. Triage dispatches `orchestrator.yml` after labelling.
- **Agent inventory and invocation docs** (#359): generated `docs/AGENT_INVENTORY.md`, `docs/AGENT_INVOCATION.md`, CI drift check, and the `ba-enrich-agent` definition.

### 🐛 Fixed

- Runtime registry no longer rejects `agent_defaults: null` (a key with only commented-out entries) with `SCHEMA_INVALID`; it is treated as empty (#372). `src/runtimes.yml` now uses `agent_defaults: {}`.
- Azure AI Foundry host allowed and Responses API supported in agent runtimes.
- Bug-fix pipeline `dev` step uses the default runtime instead of a pinned one.

### 🔧 Changed

- Package version bumped to `3.3.0` in `engine/package.json` and `quorumkit.yml` — additive MINOR release.

---

## [3.2.0] — 2026-08-03 · Issues #283, #273

### ✨ Added

- **`quorumkit-engine` npm package now ships the dashboard server and UI** (FR-001, AD-1, AD-3): `engine/package.json` `files` extended to include `dashboard/`, published tarball excludes `dashboard/node_modules/`, `*.log`, and local config artefacts via `engine/dashboard/.npmignore`.
- **New `bin` entry points** (FR-002, FR-003, AD-2): `npx quorumkit-engine dashboard` starts a project-scoped dashboard server from any consumer project with `quorumkit-engine` installed — no source checkout required. Resolves the consumer project's own `.git` root, supports `--port <N>`, and exits cleanly with a clear error on `EADDRINUSE`. `engine/dashboard/start.sh` (self-host path) now delegates to the same bin wrapper.
- **`init.sh` epilogue updated** (FR-001, FR-008, AD-5): consumers are now told to `npm install --no-save quorumkit-engine && npx quorumkit-engine dashboard` instead of referencing a QuorumKit source-clone path. `docs/DASHBOARD.md` updated accordingly, with the source-clone self-host path documented as an alternative.
- **Local pipeline scripts now ship automatically** (FR-004, AD-4): `pipeline.sh` and `branch-guard.sh` moved to `src/scripts/` as the canonical source (with backward-compatible shims left at their old `scripts/` locations) and are now copied into every consumer project's own `scripts/` directory by `init.sh` via a new `install_local_pipelines()` function — idempotent, skip-with-warning on re-run. `docs/LOCAL_PIPELINES.md` updated.

### 🔧 Changed

- Package version bumped to `3.2.0` in `engine/package.json` and `quorumkit.yml` — additive MINOR release, no breaking file-layout change.

### 🐛 Fixed

- **`npx quorumkit-engine dashboard` crashed with `Cannot find module 'ws'` on every real consumer install** (Reviewer Agent finding on PR #324, FR-002/FR-003/FR-006): `engine/package.json` declared no `dependencies`, so `ws` — a hard runtime dependency of `dashboard/server.js` — was never installed for consumers, even though `dashboard/node_modules/` is (correctly) excluded from the published tarball. Fixed by adding `"dependencies": { "ws": "^8.21.0" }` to `engine/package.json`. Guarded against regression by `engine/tests/dashboard-isolated-npm-install.test.js`, which does a real `npm pack` → `npm install` into an isolated directory with no shared `node_modules` before exercising the installed bin.
- **Stop/Join buttons invisible on Local Pipelines rows** (Issue #273, PR #284): `.lp-row`'s `align-items: center` sized the `hdr` flex child to its intrinsic content width, overflowing the card bounds and clipping the ■ Stop / ⎇ Join buttons off-screen under `overflow: hidden`. Fixed with `width:100%; box-sizing:border-box; min-width:0` on `hdr`, `min-width:0` on `.lp-branch`, and `align-items:stretch` on the card container. Left pipeline column widened from 280px to 380px for readability.

### 🔧 Chores & Maintenance

- Dependency bumps merged via Dependabot: `ws` 8.21.0 → 8.21.1 (`engine/dashboard`, `engine/orchestrator`), `vitest` (`engine/orchestrator`), `actions/setup-node` 4.4.0 → 6.4.0 (CI workflows) (#280, #315, #319, #320).
- Routine dashboard agent-data auto-sync commits from `.github/agents` (`[skip ci]`).

---

## [3.1.0] — 2026-05-25 · Issue #175

### ✨ Added

- **Agent Footprint protocol** (FR-001–009): all 15 agent definition files in `src/agents/` now include an `## Agent Footprint` section specifying the exact GitHub comments each agent posts at start and completion.
- **`apm-msg` v2 schema** (FR-008, FR-024): `engine/orchestrator/schemas/apm-msg.schema.json` extended with optional fields `event_type`, `pipeline_id`, `issue`, `pr`, `branch`, `timestamp`; `additionalProperties` relaxed to `true`. `docs/AGENT_PROTOCOL.md` Section 2 updated with v2 field reference table.
- **`scripts/branch-guard.sh`** (FR-010–014): reusable idempotent shell script that validates and creates the correct feature branch before any agent file operation. Includes full unit test suite at `engine/tests/branch-guard.test.sh`.
- **`scripts/pipeline.sh`** (FR-015–022): local pipeline lifecycle manager with subcommands `start`, `join`, `stop`, and `status`. Supports `--mode=isolated` (git worktrees) and `--mode=shared`. Respects `QUORUMKIT_PIPELINES_DIR`. Includes full unit test suite at `engine/tests/pipeline.test.sh`.
- **Orchestrator `pipeline_id` / `worktree_path` context** (FR-023): `engine/orchestrator/index.js` now forwards optional `pipeline_id` and `worktree_path` fields from the event context through to agent invocations. Tested in `engine/tests/index-pipeline.test.js`.
- **Dashboard — Local Pipeline UI** (FR-176): `engine/dashboard/` extended with live worktree list (`GET /api/local-pipelines`), pipeline lifecycle routes (`POST /start`, `POST /stop`, `GET /:n/join`), slug auto-derivation from GitHub Issue title, WebSocket `pipelineListChanged` push, and a full Pipelines tab in the SPA with Start/Stop/Join modals.
- **Dashboard — Timeline UI** (FR-177): `GET /api/timeline/:n` endpoint parses `apm-msg` and `agent-footprint` comments into a structured event stream. SPA Timeline tab renders per-agent events with type/timestamp/summary, click-to-expand body, "↗ View on GitHub" link, 30 s auto-refresh (append-only, visibility-aware), agent filter, and status badge.
- **ADR-176** (`docs/architecture/adr-176-dashboard-pipeline-lifecycle-write-path.md`): architecture decision record gating all dashboard write-path endpoints.

---

## [3.0.0] — 2026-05-09 · Issues #47, #61, #67

> **Breaking change.** This release rebrands the project to **QuorumKit** (Issue #67),
> restructures the repository into three zones (Package payload / Engine / Self-host),
> and ships the orchestrator engine as a versioned GitHub Action and npm package
> (`quorumkit-engine`) (Issue #47). npm package published in Issue #61.
>
> See [`MIGRATION.md`](docs/MIGRATION.md) for the complete before/after reference table.  
> See [`docs/architecture/adr-047-repo-topology-and-engine-distribution.md`](docs/architecture/adr-047-repo-topology-and-engine-distribution.md)
> and [`specs/047-repo-topology/spec.md`](specs/047-repo-topology/spec.md) for the full topology rationale.

### ⚠️ Breaking Changes

- **Project renamed to QuorumKit.** `apm-engine` → `quorumkit-engine`, `apm-orchestrator` → `quorumkit-orchestrator`. No backward-compatible alias published (Issue #67, FR-002/FR-003).
- **`apm.yml` renamed to `quorumkit.yml`** — v3 does not accept the old filename. `scripts/init.sh` exits non-zero with a migration notice when `apm.yml` is detected (FR-004/FR-005, ADR-067).
- **GitHub repository renamed**: `agentic-dev-stack` → `quorumkit`. Consumer `uses:` paths must be updated to `uses: dmitry-nalivaika/quorumkit/engine@v3`.
- **VS Code extension renamed**: `apm-copilot-bridge` → `quorumkit-copilot-bridge`; command prefix changed from `apm.` to `quorumkit.`.
- **Wire-format tokens unchanged** — `apm-msg`, `apm-state`, and `apm-pipeline-state` are intentionally not renamed (FR-013, FR-014).
- **`src/` directory unchanged** — renaming is deferred to a future major version with a full migration strategy.
- **Engine directory moved.** `scripts/orchestrator/` → `engine/orchestrator/`,
  `tests/orchestrator/` → `engine/tests/`, `dashboard/` → `engine/dashboard/`.
  Consumer workflows that ran `node scripts/orchestrator/index.js` must
  switch to `uses: dmitry-nalivaika/quorumkit/engine@v3` (or a SHA pin).
  To migrate: `bash scripts/init.sh --upgrade --apply --engine-ref=v3`.
- **Installer scripts moved.** `scripts/{init,verify-mirror,quality-check}.sh` →
  `src/scripts/`. Backward-compatible shims at `scripts/*.sh` exec the new
  path; shims are removed in v4.0.0.
- **Seed files moved.** `templates/{CLAUDE,CONTRIBUTING,SECURITY,copilot-instructions}.md`
  → `src/seed/`. The installer copies from the new location;
  update any external scripts that reference the old path.
- **`apm.yml` `version: 2.1.0` → `3.0.0`** (T-25).
- **`templates/src/pipelines/` removed.** Pipelines live only at
  `src/pipelines/`; `scripts/init.sh` copies them straight from the
  SoT (FR-005, mirror gate M4).
- **`.github/agents/` removed from this repo.** That directory is created
  in *consumer* repos by the installer; in the SoT, agent definitions
  live only at `src/agents/` (FR-006, mirror gate M6).
- **Pipelines must declare a compatible `apiVersion: 'X.Y'`.** The engine rejects
  pipelines whose `apiVersion` is newer than its own (FR-013).
  `ENGINE_API_VERSION` is `1.0` in this release.

### ✨ Added

- **Three-zone repo topology** documented in `CONTRIBUTING.md` →
  *Repo Topology* (FR-026). Mirror surfaces M4–M9 added to
  `src/scripts/verify-mirror.sh` with negative-test fixtures
  (`src/scripts/tests/test-verify-mirror.sh` — 13/13).
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
- **`scripts/init.sh --upgrade`** rewrites consumer `.github/workflows/*.yml`
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
  `src/.github/workflows/` (T-16, FR-031, mirror gate M9).
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
  `README.md`, `CONTRIBUTING.md` — path references updated to `src/scripts/`,
  `engine/`, `src/seed/`.
- `docs/architecture/adr-047-repo-topology-and-engine-distribution.md`
  + `docs/architecture/adr-047-action-runtime.md` — design record and
  runtime amendment.

### 🧪 Upgrading from v2.x

```bash
# 1. Pull the latest QuorumKit package.
cd /path/to/quorumkit-clone && git pull --ff-only

# 2. From the consumer repo, dry-run the upgrade.
cd /path/to/your-project
bash /path/to/quorumkit-clone/scripts/init.sh --upgrade --engine-ref=v3
# Review the diff. The script exits non-zero if any existing 'permissions:'
# blocks lack required engine scopes — fix those manually, then re-run.

# 3. Apply the upgrade.
bash /path/to/quorumkit-clone/scripts/init.sh --upgrade --apply --engine-ref=v3

# 4. Commit and open a PR. Branch protection runs verify-mirror;
#    the PR must pass all checks before merging.
```

---

## [2.2.0] — 2026-05-07 · Issue #44

### ✨ Added

- **v2 dispatch** wired into `runOrchestrator`: declarative `entry` / `transitions` graph with backward edges (loops), replacing v1's linear `steps[]` chain.
- **Runtime registry** (`src/runtimes.yml`, ADR-005): pluggable adapters; v2 ships with `claude` and `copilot` kinds enabled. `azure-openai`, `bedrock`, `ollama`, `custom` are reserved pending per-kind ADRs.
- **Two-channel state** (ADR-004): public append-only timeline comments + a single idempotent `<!-- apm-state -->` block per Issue/PR. Timeline reconstructor rebuilds run history on resume.
- **`apm-msg` protocol**: agents emit `<!-- apm-msg v="1" outcome="…" -->…<!-- /apm-msg -->` blocks; outcomes drive transitions (FR-014).
- **Loop budget** (FR-018): per-pipeline cap (`loop_budget`) prevents infinite ping-pongs; over-budget runs halt with a regulator comment.
- **Per-step timeout** (FR-019): `timeout_minutes` enforced on every step; expiry triggers an `orchestrator-failure` fallback transition.
- **Regulation lint** (`scripts/orchestrator/regulation-lint.js`): validates that every label / outcome / trigger referenced by pipelines is declared in `docs/AGENT_PROTOCOL.md`.
- **`verify-mirror.sh`** + CI gate: enforces ADR-006 — `src/` is canonical, Copilot tree is mirrored and verified.
- **Pipeline validator CLI** (`pipeline-validator-cli.js`): JSON Schema validation of v2 pipelines; failures fail PR CI.
- **Dedup-key** module: stable hash for transition idempotency; safe replay on workflow restarts.

### 🔄 Changed

- All shipped pipelines (`feature-pipeline.yml`, `bug-fix-pipeline.yml`, `release-pipeline.yml`) rewritten in the v2 schema. The `feature-pipeline-v2.yml` worked example was merged into the canonical `feature-pipeline.yml`.
- Removed the `pipeline:v2` opt-in label from `docs/AGENT_PROTOCOL.md`; v2 is the only schema in shipped pipelines.
- The v1 backward-compat adapter remains in code but is unused by shipped pipelines.

### 🧪 Tests

- 175/175 orchestrator tests green (vitest): adds `agent-invoker-v2`, `apm-msg-parser`, `dedup-key`, `index-v2`, `loop-budget`, `regulation`, `retry`, `router-v2`, `runtime-adapters`, `runtime-registry`, `state-manager-v2`, `timeline-reconstructor`, `worked-example`.
- 4 CI quality gates pass: `quality-check.sh`, `verify-mirror.sh`, pipeline-validator, regulation-lint.

### � Documentation

- **`docs/AGENT_PROTOCOL.md`** (FR-014): single canonical regulation document declaring every label, `apm-msg` outcome, and transition trigger.
- **`PIPELINES.md`** rewritten for v2: how-it-works diagram, full YAML reference, runtime registry, two-channel state, `apm-msg` protocol with worked example, CI gates, troubleshooting.
- **`README.md`** trimmed and restructured around the v2 orchestrator; added a documentation map.
- **Renamed `ORCHESTRATOR.md` → `DASHBOARD.md`** to eliminate the naming collision with the GHA Orchestrator. Content unchanged; new title clarifies scope.
- **`ENHANCEMENTS.md`** deduplicated — the bottom half repeated the upper Gap Analysis / Roadmap content.
- **ADR-004 / 005 / 006 / 007** authored under #44; ADR-002 marked Superseded by ADR-004 with corrupted header fixed.
- Spec and plan: `specs/044-orchestrator-v2-design/{spec,plan,tasks}.md`.

---

## [2.1.0] — 2026-05-04

### ✨ Added

- **Autonomous Agent Orchestration** (#2): Orchestrator GitHub Actions workflow that automatically sequences agents in response to repository events — no manual slash-commands required for routine SDLC work.
- **Declarative Pipeline Configuration** (#2): YAML pipeline files at `src/pipelines/*.yml` validated against JSON schema on load; malformed files are rejected gracefully while others remain active.
- **Human-in-the-Loop Approval Gates** (#2): `approval: required` gate on any pipeline step; pauses execution, posts comment, resumes on an authorised `/approve`; times out after 72 hours by default.
- **Pipeline State Persistence** (#2): full pipeline run state serialised as a tagged HTML comment in GitHub Issues/PRs; the orchestrator reconstructs in-progress state after a restart without local memory.
- **Dashboard Pipeline Webhook** (#2): `POST /webhook/pipeline-event` endpoint on `dashboard/server.js` with WebSocket broadcast within 5 seconds; silently skipped when `DASHBOARD_WEBHOOK_URL` is unset.
- **Dual-AI Runtime Dispatch** (#2): `agent-invoker.js` routes to Claude Code (`agent-*.yml`) or Copilot (`copilot-agent-*.yml`) based on `aiTool` in `.apm-project.json`; defaults to `copilot` when absent.
- **Default Pipeline Templates** (#2): `feature-pipeline.yml`, `bug-fix-pipeline.yml`, and `release-pipeline.yml` installed by `init.sh`; `release-pipeline.yml` includes `approval: required` before the release step.
- **Dashboard Pipelines Tab** (#8): live trigger, progress tracking, and board mirroring for pipeline runs.
- **Dashboard Project Name** (#8): current project name shown in the topbar and browser tab title.
- **Copilot Bridge Agent Mode** (#3): `apm-copilot-bridge` VS Code extension opens Copilot Chat in Agent mode automatically (v0.1.1 → v0.1.5).
- **Orchestrator Backend Server** (#3): real Node.js + WebSocket backend for live agent orchestration.
- **Dashboard UI Redesign** (#3): office-style UI with console, Kanban board, and auto-sync.

### 🐛 Fixed

- **Orchestrator workflow permissions** (#2): removed invalid `members` permission key (GHA schema violation).
- **Security blockers** (#8): resolved BLOCKER-1, BLOCKER-2, SEC-HIGH-001, SEC-HIGH-002, and SEC-HIGH-003 from PR #8 review — webhook secret authentication, input validation, error exposure.
- **Copilot workflows** (#8): replaced non-existent `github/copilot-actions/ask@v1` with the GitHub Models API.
- **Orchestrator cascade prevention** (#8): stop triggering on every `workflow_run` event.
- **Orchestrator graceful skip** (#8): no-op when the orchestrator is not installed in the consuming repo.
- **Orchestrator audit guard** (#8): guard `postAuditEntry` when `issueNumber` is undefined.
- **Dashboard port handling** (#7): fixed port conflicts and pipeline template installation on start.
- **Spec-002 architect review** (#7): addressed ARCH-BLOCKER-1, ARCH-BLOCKER-2, and ARCH-CONCERN-1..4.
- **SECURITY.md dead link** (#4): fixed relative link `../README.md` → `README.md`.
- **CI markdown link check** (#4): replaced deprecated `gaurav-nelson/github-action-markdown-link-check` with a direct `npx` call.
- **Copilot window management** (#3): fixed per-agent VS Code windows, `--new-window` flash, and `code` PATH resolution on macOS.
- **Copilot Bridge submissions** (#3): fixed clipboard paste submit, Agent mode switching, and cold-start retry.

### 🧪 Tests

- Orchestrator unit test suite: 42 tests, 100% passing (vitest, no live GitHub API required).
- Modules covered: `pipeline-loader`, `router`, `state-manager`, `approval-gate`, `agent-invoker`, `github-client`, `index`, `dashboard-webhook`.

### 📚 Documentation

- Added `ORCHESTRATOR.md` — complete usage guide for the autonomous orchestrator.
- Added `docs/architecture/adr-002-orchestrator-state-storage.md` — state storage design decision.
- Added `docs/architecture/adr-003-copilot-workflow-github-models-migration.md`.
- Updated `README.md` — added Autonomous Orchestrator section.

---

## [2.0.0] — 2026-04-01 *(initial published release)*

### ✨ Added

- 15 specialised AI agents (BA, Developer, QA, Reviewer, Architect, DevOps, Security, Triage, Release, Docs, Tech-Debt + 4 Industrial domain agents).
- 25 GitHub Actions workflows (12 Claude + 12 Copilot + `alert-to-issue`).
- Spec Kit integration (`/speckit-*` skills).
- NNN traceability convention.
- Brownfield adoption support with conflict detection.
- Dark Factory guide for lights-out industrial projects.
- APM Constitution enforcement across all agents.
- `init.sh` zero-config installer with `--ai=claude|copilot|both` and `--domain=industrial`.
- Dashboard: browser-based agent control centre with Kanban, live logs, and terminal integration.
- `apm-copilot-bridge` VS Code extension for Copilot Agent mode auto-invocation.

---

[Unreleased]: https://github.com/dmitry-nalivaika/quorumkit/compare/v3.1.0...HEAD
[3.1.0]: https://github.com/dmitry-nalivaika/quorumkit/compare/v3.0.0...v3.1.0
[3.0.0]: https://github.com/dmitry-nalivaika/quorumkit/compare/v2.2.0...v3.0.0
[2.2.0]: https://github.com/dmitry-nalivaika/quorumkit/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/dmitry-nalivaika/quorumkit/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/dmitry-nalivaika/quorumkit/releases/tag/v2.0.0
