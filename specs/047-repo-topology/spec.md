# Spec: Three-Zone Repo Topology + Engine Distribution — Issue #47

**Feature Branch**: `047-repo-topology`
**Created**: 2026-05-09
**Status**: Draft (security blockers resolved 2026-05-09)
**Linked ADR**: `docs/architecture/adr-047-repo-topology-and-engine-distribution.md`
**Extends**: ADR-006 (SoT + mirroring), ADR-007 (GH Actions substrate)
**Issue**: [#47](https://github.com/dmitry-nalivaika/agentic-dev-stack/issues/47)

## Overview

The QuorumKit repo currently serves three roles (distributable package, engine, and self-hosted consumer) without clear separation, causing two defects:

1. **Mirror drift across uncovered surfaces** — `templates/.apm/pipelines/`, `.github/agents/`, and 14 overlapping workflows have no parity gate; one surface has already drifted.
2. **Engine is not distributed** — `init.sh` copies pipeline DSL files but not the orchestrator that executes them, so consumer projects receive an inert harness that cannot run pipelines.

This feature reorganises the repo into three explicit zones (Package / Engine / Self-host), distributes the engine via a reusable GitHub Action + npm package, and extends `verify-mirror.sh` to mechanically prevent every drift surface.

## User Stories

### US-1: Consumer gets a working agentic environment from one install (Priority: P1)

As a **developer adopting QuorumKit in a new project**, I want `init.sh` to produce a repo where pipelines actually execute and agents actually route, so that I get the full agentic environment advertised by Constitution Principle V — not just inert prompts.

**Why this priority**: This is the headline value of v3.0.0 and the primary motivation for the issue. Without it, every consumer project today is silently broken.

**Independent Test**: In an empty repo, run `installer/init.sh --ai=both`, open a GitHub Issue with `type:feature` label, and confirm the orchestrator routes it through `triage → ba → architect (if ADR) → dev → qa → reviewer → release` with each step producing a workflow run, comment, or PR. No engine source files were copied — only an Action `uses:` reference.

**Acceptance Scenarios**:

1. **Given** a fresh consumer repo and QuorumKit v3.0.0 installed, **When** a maintainer opens an Issue with `type:feature`, **Then** the orchestrator workflow runs to completion using the published Action and posts pipeline state comments on the Issue.
2. **Given** a consumer repo on v3.0.0, **When** QuorumKit publishes v3.1.0 with an engine bug fix, **Then** the consumer receives the fix by bumping the Action ref tag (no re-running of `init.sh`, no copied files to update).
3. **Given** a consumer running `installer/init.sh --ai=both`, **When** the install finishes, **Then** zero engine source files (`engine/orchestrator/**`, `engine/dashboard/**`) exist in the consumer repo, but `.apm/`, `.claude/`, `.github/`, and seed docs are present.
4. **Given** a consumer behind a strict supply-chain policy, **When** they pin the Action by SHA, **Then** Dependabot recognises it and proposes upgrades.

---

### US-2: Maintainer cannot accidentally let mirror trees drift (Priority: P1)

As a **maintainer of the QuorumKit package**, I want CI to fail fast on any unsynchronised mirror surface, so that consumers never inherit stale pipelines, agents, or workflows.

**Why this priority**: Drift is the root cause that ADR-006 set out to eliminate; this completes the job for the three remaining surfaces and is required for the topology change to be safe long-term.

**Independent Test**: Make a deliberate edit that creates drift in any one of the four covered surfaces; observe `verify-mirror.sh` fails with a clear, actionable diff message. Revert, observe it passes.

**Acceptance Scenarios**:

1. **Given** a PR that edits `.apm/agents/developer-agent.md` without regenerating the Copilot mirror, **When** CI runs, **Then** `verify-mirror.sh` check **M1** fails with the exact missing/diverged file path.
2. **Given** a PR that creates `templates/.apm/pipelines/foo.yml`, **When** CI runs, **Then** check **M4** fails with message *"`templates/.apm/pipelines/` MUST NOT exist (ADR-006 §3 — pipelines are not mirrored)"*.
3. **Given** a PR that edits `.github/workflows/orchestrator.yml` but not `templates/github/workflows/orchestrator.yml` (or vice versa), **When** CI runs, **Then** check **M5** fails with a unified diff of the two files.
4. **Given** a PR that re-creates `.github/agents/` in the SoT repo, **When** CI runs, **Then** check **M6** fails.
5. **Given** a PR that adds `.apm/agents/new-agent.md` without populating `.claude/agents/new-agent.md` and `.github/instructions/new-agent.instructions.md`, **When** CI runs, **Then** check **M7** fails (Principle IV self-host parity).
6. **Given** a PR that introduces `run: node scripts/orchestrator/...` in any distributed workflow, **When** CI runs, **Then** check **M8** fails (engine must be invoked via `uses:` Action).
7. **Given** a PR that adds `uses: actions/checkout@v4` (tag, not SHA) to any workflow under `engine/`, `templates/github/workflows/`, or `.github/workflows/`, **When** CI runs, **Then** check **M9** fails with the message *"third-party Actions MUST be pinned by full commit SHA (FR-031)"*.

---

### US-3: New contributor can orient in the codebase in under five minutes (Priority: P2)

As a **first-time contributor**, I want the top-level folder names to immediately reveal which files are package payload, which are engine code, and which are self-hosting artifacts, so that I can find what I need without reading every README.

**Why this priority**: Reduces onboarding friction and prevents the historical confusion that caused the drift problem. Important but not on the critical path for v3.0.0 functional correctness.

**Independent Test**: Show the post-migration root directory listing to someone who has never seen the repo and ask them where they would put (a) a new agent definition, (b) an orchestrator bug fix, (c) an `init.sh` enhancement. Three correct answers without coaching = pass.

**Acceptance Scenarios**:

1. **Given** the post-migration repo root, **When** a contributor lists top-level folders, **Then** they see `engine/`, `installer/`, `templates/`, `.apm/`, `.claude/`, `.github/`, `specs/`, `docs/` with no ambiguous names like `scripts/` containing both engine and installer code.
2. **Given** the post-migration `CONTRIBUTING.md`, **When** a contributor reads the "Repo topology" section, **Then** each top-level folder is mapped to one of the three zones (Package, Engine, Self-host).

---

### US-4: Self-hosted dogfooding works for both AI runtimes (Priority: P2)

As a **maintainer using either Claude Code or Copilot to develop QuorumKit itself**, I want both `.claude/agents/` and `.github/instructions/` to be populated in the SoT repo, so that Constitution Principle IV is upheld where it matters most — in the project that defines the principle.

**Why this priority**: Required by Principle IV but not user-visible for consumers; medium priority because today's de-facto Copilot-only dogfooding still works.

**Acceptance Scenarios**:

1. **Given** the post-migration SoT repo, **When** a maintainer runs `claude /dev-agent ...`, **Then** Claude reads the agent definition from `.claude/agents/developer-agent.md`.
2. **Given** the same repo, **When** a maintainer runs `/dev-agent ...` in Copilot Chat, **Then** Copilot resolves the role via `.github/instructions/dev-agent.instructions.md`.
3. **Given** every file in `.apm/agents/`, **When** check **M7** runs, **Then** it confirms a counterpart exists in both `.claude/agents/` and `.github/instructions/`.

---

### US-5: Existing v2.x consumers can upgrade without manual rewrites (Priority: P2)

As a **maintainer of a project already on QuorumKit v2.x**, I want a single `installer/init.sh --upgrade` command to migrate my installed workflows from `node scripts/orchestrator/...` references to the v3 Action-based form, so that the breaking change is operationally absorbable.

**Why this priority**: Required because v3.0.0 is a breaking change for installed workflows. Medium because affected user count today is small, but operational pain is high if absent.

**Acceptance Scenarios**:

1. **Given** a consumer repo on v2.1.0 with workflows referencing `node scripts/orchestrator/`, **When** they run `installer/init.sh --upgrade`, **Then** their `.github/workflows/*.yml` files are rewritten to use `uses: <action-ref>@v3` and the change is staged for commit (not auto-committed).
2. **Given** the upgrade has run, **When** the consumer opens an Issue, **Then** the rewritten workflows execute end-to-end against the published Action.
3. **Given** the consumer chooses NOT to upgrade, **When** they continue using v2.1.0, **Then** their existing setup keeps working until they explicitly opt in.

---

### Edge Cases

- **Action publishing fails mid-release**: tag is pushed but npm publish errors → release workflow MUST be transactional (publish npm first, then tag the Action) OR clearly document the rollback procedure.
- **Pipeline DSL feature added in v3.1.0 used by consumer pinned to v3.0.0**: the engine MUST validate `apiVersion:` in pipeline YAML and fail with a clear "your pinned engine v3.0.0 does not support `apiVersion: 3.1`; bump the Action ref" message — not a cryptic stack trace.
- **Consumer in air-gapped environment** cannot reach `actions/runner` to download the Action: documented as not supported in v3.0.0; vendor-copy mode may be considered for a future v3.x but is **out of scope** here.
- **`installer/init.sh --upgrade` run twice**: must be idempotent — second run detects already-migrated workflows and reports "no changes needed".
- **`.github/agents/` deleted from SoT repo, but a contributor pulls an older branch where it still exists**: branch protection rules should require `verify-mirror.sh` to pass before merge; the M6 check catches this.
- **Workflow file present in `.github/workflows/` but not in `templates/github/workflows/`** (e.g. `quality.yml`, `update-dashboard.yml`): M5 MUST treat these as self-host-only and not require a template counterpart. M5 only enforces parity for files present in **both** trees.
- **Engine release workflow itself has a bug**: a manual rollback path (yank npm version, delete tag) MUST be documented in `engine/RELEASING.md`.

## Functional Requirements

### Topology

- **FR-001**: Repository MUST organise files into exactly three zones — *Package payload*, *Engine*, *Self-host* — with each top-level folder unambiguously belonging to one zone.
- **FR-002**: Engine source code (orchestrator, dashboard, engine tests) MUST live under a dedicated `engine/` top-level directory.
- **FR-003**: Installer scripts (`init.sh`, `verify-mirror.sh`, `quality-check.sh`) MUST live under a dedicated `installer/` top-level directory; a backward-compatible symlink from `scripts/init.sh` MAY be retained for one minor version.
- **FR-004**: First-time-init seed files (e.g. `CLAUDE.md`, `CONTRIBUTING.md`, `SECURITY.md`, `copilot-instructions.md`) MUST live under `templates/seed/`, separated from generated mirrors at `templates/github/`.
- **FR-005**: `templates/.apm/pipelines/` MUST NOT exist; pipelines are read directly from `.apm/pipelines/` per ADR-006 §3.
- **FR-006**: `.github/agents/` MUST NOT exist in the SoT repo; consumer repos still receive it, generated by `init.sh`.
- **FR-007**: `.apm-workspaces/` MUST be listed in `.gitignore`.

### Engine distribution

- **FR-008**: The orchestrator engine MUST be distributable as a reusable GitHub Action invocable via `uses:` syntax with a versioned ref (tag or SHA).
- **FR-009**: The orchestrator engine MUST also be distributable as an npm package, so the dashboard, VS Code extension, and any future CLI can consume the same source.
- **FR-010**: Both distribution channels MUST be released atomically from the same `engine/` source on tag push (one CI release workflow, one source of truth). The npm publish step MUST use **OIDC trusted publishing** (`npm publish --provenance`) and MUST NOT depend on any long-lived `NPM_TOKEN` in the steady state. If a fallback token is required for disaster recovery, it MUST be a granular, per-package, publish-only token with ≤90-day expiry, stored in a `release` GitHub Environment with required reviewer, and its rotation procedure MUST be documented in `engine/RELEASING.md`. Published artefacts (Action tag + npm tarball) MUST carry SLSA provenance attestations. *(Resolves SEC-HIGH-001.)*
- **FR-011**: Distributed workflows in `templates/github/workflows/` MUST invoke the engine via `uses:` rather than `run: node scripts/orchestrator/...` or any path that depends on engine source being copied into the consumer repo.
- **FR-012**: The Action MUST read pipeline DSL, runtime registry, and identity registry from the consumer's local `.apm/` directory at runtime; no engine state may be embedded in the Action itself.
- **FR-013**: The engine MUST validate the `apiVersion:` declared in any pipeline YAML and fail fast with an actionable error if the engine version is older than the declared `apiVersion`. The validator MUST use a safe YAML loader (e.g. `yaml.load` with the default `js-yaml` safe schema); tag-aware loading (`!!js/function`, custom constructors) is forbidden.
- **FR-014**: The Action's required `permissions:` block MUST be documented in `engine/SECURITY.md` as a per-scope table — one row per scope (`issues`, `pull-requests`, `actions`, `contents`, etc.) listing (a) the exact GitHub API call that requires the scope, (b) the minimal alternative considered, (c) the justification. `contents:` MUST default to `read` and MAY only be elevated to `write` if a documented call requires it (none does in the current code path). Template workflows in `templates/github/workflows/` MUST declare `permissions:` at the **job** level (never workflow level) so reusable-Action consumers retain least privilege. The Security Agent MUST review and sign off on `engine/SECURITY.md` before the first v3.0.0 publish. *(Resolves SEC-HIGH-002.)*

### CI mirror enforcement (`installer/verify-mirror.sh` extensions)

- **FR-015 (M4)**: CI MUST fail if `templates/.apm/pipelines/` exists.
- **FR-016 (M5)**: CI MUST fail if any workflow filename present in **both** `.github/workflows/` and `templates/github/workflows/` is not byte-identical between the two trees. Workflows present in only one tree are not subject to M5.
- **FR-017 (M6)**: CI MUST fail if `.github/agents/` exists in the SoT repo.
- **FR-018 (M7)**: CI MUST fail if any `.apm/agents/<x>.md` lacks a counterpart in `.claude/agents/` OR `.github/instructions/` (self-host Principle IV parity).
- **FR-019 (M8)**: CI MUST fail if any file under `templates/github/workflows/` or `.github/workflows/` contains a literal `node scripts/orchestrator/` reference (engine must be invoked via `uses:`).
- **FR-020**: Each mirror-check failure message MUST include (a) the rule ID (M1–M9), (b) the offending file path, (c) the exact remediation command or steps.
- **FR-031 (M9)**: All third-party Actions referenced by `engine/action.yml`, any workflow under `engine/`, and any workflow under `templates/github/workflows/` or `.github/workflows/` MUST be pinned by full 40-character commit SHA (tag-only or `@vN` references are forbidden); a comment naming the human-readable tag MAY follow the SHA. The repository MUST contain a `.github/dependabot.yml` entry for `package-ecosystem: github-actions` covering both `/` and `/engine/` so SHA pins receive proposed upgrades. CI check **M9** in `installer/verify-mirror.sh` MUST fail if any `uses:` line in the listed paths references an Action without a 40-character SHA. *(Resolves SEC-HIGH-003.)*

### Installer behaviour

- **FR-021**: `installer/init.sh --ai={claude|copilot|both}` MUST produce a consumer repo whose installed workflows execute end-to-end without further manual edits.
- **FR-022**: `installer/init.sh` MUST copy `.apm/pipelines/` directly from the SoT package; no intermediate template tree is involved.
- **FR-023**: `installer/init.sh` MUST still create `.github/agents/` in consumer repos (only the SoT-repo copy is removed).
- **FR-024**: `installer/init.sh --upgrade` MUST detect a pre-v3.0.0 installation in the current directory and rewrite installed workflows to reference the v3 Action; the rewrite MUST be idempotent and MUST NOT auto-commit.
- **FR-025**: `installer/init.sh` MUST remain idempotent: re-running on an existing project skips files that already exist (current behaviour preserved).

### Documentation

- **FR-026**: `CONTRIBUTING.md` MUST contain a "Repo topology" section mapping every top-level folder to one of the three zones.
- **FR-027**: `BROWNFIELD_GUIDE.md` and `INIT.md` MUST be updated to reflect new paths (`installer/init.sh`, `engine/`, no `templates/.apm/pipelines/`).
- **FR-028**: `engine/RELEASING.md` MUST document the release process for both channels (Action tag + npm publish), including rollback procedure for a partially-failed release.
- **FR-029**: `CHANGELOG.md` v3.0.0 entry MUST document every breaking change and link to the migration command.

### Versioning

- **FR-030**: The release that ships this feature MUST bump `apm.yml` `version:` to **3.0.0** (MAJOR) per Constitution Principle V (breaking change to installed file layout).

## Success Criteria

- **SC-001**: A fresh consumer repo on v3.0.0 can run a full `feature` pipeline (triage → ba → architect → dev → qa → reviewer → release) end-to-end without any engine source files being copied into the consumer repo. Verified by automated end-to-end test.
- **SC-002**: All nine `verify-mirror.sh` checks (M1–M9) pass on `main` after migration; introducing a deliberate violation in any of M4–M9 causes CI to fail with a message that names the rule ID and the offending file. Verified by negative-test fixtures in `installer/tests/`.
- **SC-003**: The post-migration top-level directory listing is unambiguous: 100% of top-level folders map to exactly one of the three zones, validated by a static check in `installer/verify-mirror.sh`.
- **SC-004**: Both `.claude/agents/` and `.github/instructions/` in the SoT repo contain a counterpart for every file in `.apm/agents/` (Principle IV self-host parity).
- **SC-005**: A v2.x → v3.0.0 upgrade via `installer/init.sh --upgrade` completes in under 30 seconds on a typical consumer repo, is idempotent on a second run, and produces workflows that execute successfully against the published Action.
- **SC-006**: An engine bug fix released as v3.0.1 reaches a consumer pinned to `@v3` by changing zero files in their repo (Action ref auto-resolves the patch).
- **SC-007**: A new contributor, given the post-migration root directory listing and `CONTRIBUTING.md`, correctly identifies the destination folder for an agent definition, an orchestrator bug fix, and an installer enhancement on the first try.
- **SC-008**: The release CI workflow publishing both Action and npm package is atomic — either both succeed or the release is rolled back automatically; no state where one channel is on v3.x and the other is on v3.(x-1).
- **SC-009**: The first v3.0.0 npm publish carries a verifiable SLSA provenance attestation (visible on the npm package page) and was produced via OIDC trusted publishing without any long-lived `NPM_TOKEN` being read in CI. Verified by inspecting the published package metadata.
- **SC-010**: `engine/SECURITY.md` exists, contains a per-scope justification table for every entry in the Action's `permissions:` block, has been signed off by the Security Agent (PR comment + label), and the `contents:` scope is `read` (not `write`) unless an explicitly listed call requires write. Verified by Security Agent review on the v3.0.0 release PR.
- **SC-011**: Zero `uses:` lines under `engine/`, `templates/github/workflows/`, or `.github/workflows/` reference a third-party Action by tag or `@vN`; every entry is pinned by a 40-character commit SHA, and `.github/dependabot.yml` includes a `package-ecosystem: github-actions` entry so SHA pins receive upgrade PRs. Verified by check M9 on `main`.

## Key Entities

- **Package payload**: The set of files and directories that `installer/init.sh` copies into a consumer repo. Includes `.apm/`, `templates/seed/`, `templates/github/`, and select root-level docs. Does NOT include `engine/`, `installer/`, `dashboard/` source.
- **Engine**: The orchestrator runtime + dashboard + their tests. Lives at `engine/` in the SoT repo. Distributed as (a) a reusable GitHub Action and (b) an npm package. Never copied into consumer repos.
- **Self-host artifacts**: Files in `.github/`, `.claude/`, `.specify/`, `specs/` that exist solely so this repo can dogfood itself. These are NOT distributed.
- **Mirror surface**: A directory pair where one is the canonical source of truth and the other is a generated mirror. The four surfaces post-migration: (1) `.apm/agents/` ↔ `.github/instructions/`, (2) `.apm/agents/` ↔ `.claude/agents/`, (3) `templates/github/workflows/` ↔ `.github/workflows/` (overlapping subset only), (4) `.apm/agents/` ↔ enforcement that `.github/agents/` does NOT exist.
- **Pipeline `apiVersion`**: A declarative version string in each pipeline YAML used by the engine to refuse incompatible runs. New entity introduced by FR-013.
- **Action ref**: A versioned reference (tag, branch, or SHA) used in `uses:` syntax to invoke the engine from a consumer workflow. The unit of distribution.

## Out of Scope

- **Splitting the repo into multiple repos** (Architect Option A): rejected in ADR-008 in favour of three-zone topology in one repo.
- **Air-gapped / offline-capable engine distribution**: future v3.x consideration; v3.0.0 requires GitHub Actions reachability.
- **Rewriting the orchestrator implementation**: the engine source is moved (`scripts/orchestrator/` → `engine/orchestrator/`), not refactored. ADR-007 substrate contract is unchanged.
- **Renaming `.apm/` itself**: the SoT root stays `.apm/` per ADR-006.
- **Migrating away from npm or GitHub Actions** as distribution targets: explicitly out of scope.
- **Adding new agents, pipelines, or runtime adapters**: this spec is purely structural.
- **Dashboard UI changes** beyond the path move and npm-import refactor.
- **Backward-compatible v2.x maintenance branch**: the focus is forward migration via `--upgrade`; long-term v2.x patches are not in scope.

## Security and Privacy Considerations

- **No PII handled** — standard open-source data classification applies (per Constitution Security & Privacy section).
- **Action permissions surface (FR-014)**: publishing the engine as a reusable Action exposes its `permissions:` requirements to every consumer. `engine/SECURITY.md` MUST contain a per-scope justification table (one row per scope: exact API call, minimal alternative considered, justification). `contents:` defaults to `read` and may only be elevated to `write` if a documented API call requires it. Template workflows MUST declare `permissions:` at the **job** level, never at workflow level. The Security Agent MUST sign off before the first v3.0.0 publish. *(Addresses SEC-HIGH-002.)*
- **Supply-chain integrity — third-party Actions (FR-031 / M9)**: every Action referenced under `engine/`, `templates/github/workflows/`, or `.github/workflows/` MUST be pinned by 40-character commit SHA. Dependabot `package-ecosystem: github-actions` MUST be configured for both `/` and `/engine/`. CI check M9 enforces this on every PR. *(Addresses SEC-HIGH-003.)*
- **Supply-chain integrity — consumer pinning**: consumers MUST be able to pin the QuorumKit Action by SHA; documentation MUST recommend SHA-pinning over tag-pinning for security-sensitive deployments. Dependabot compatibility MUST be verified.
- **npm package supply chain (FR-010)**: the npm publish step MUST use OIDC trusted publishing with `npm publish --provenance`. No long-lived `NPM_TOKEN` is used in the steady state. If a fallback token is ever required, it MUST be a granular, package-scoped, publish-only token with ≤90-day expiry, stored in a `release` GitHub Environment with required reviewer; rotation is documented in `engine/RELEASING.md`. *(Addresses SEC-HIGH-001.)*
- **Pipeline YAML loader (FR-013)**: the `apiVersion` validator MUST use a safe YAML loader; tag-aware loading is forbidden.
- **Release environment**: the release job MUST run inside a protected `release` GitHub Environment with a required reviewer; tag-protection rules MUST forbid force-push or deletion of `v*` tags; release tags MUST be signed (`git tag -s`) with the verifying key documented in `engine/RELEASING.md`.
- **Workflow permissions in consumer repos**: distributed workflow templates MUST declare minimum `permissions:` per job; the Security Agent will validate this before publish (Constitution Quality Gates).

## Assumptions

- The current GitHub Actions substrate (ADR-007) remains the only orchestrator runtime target. No multi-cloud or self-hosted runner support is added here.
- The npm package will be published under a scope owned by the project maintainer (`@dmitry-nalivaika/apm-orchestrator` is the working name; final scope confirmed at release time).
- The Action will be published either as a sub-action of this repo (`dmitry-nalivaika/quorumkit/engine@v3`) or as a sibling repo. The choice is a release-time detail; the spec is satisfied by either.
- Consumers have Node.js available in their CI (already required by current installed workflows).
- The 14 currently-overlapping workflows in `.github/workflows/` and `templates/github/workflows/` are intended to be identical; any divergence today is unintentional drift, not deliberate self-host customisation.
- `quality.yml` and `update-dashboard.yml` in `.github/workflows/` are self-host-only and have no template counterpart by design.
- Existing v2.x consumer count is small enough that a single `--upgrade` flag is sufficient migration support; no long-running v2.x support branch is required.
- The project follows semver strictly; any breaking change to installed file layout justifies a MAJOR bump (Constitution Principle V).

## Open Questions

*(All open questions must be resolved to zero before handoff to Developer Agent. Architect Agent decisions on each item below are required during ADR-008 finalisation.)*

- *(none currently — Architect Agent has resolved all topology and distribution questions in ADR-047. Security Agent's three SEC-HIGH blockers from the 2026-05-09 review are resolved by FR-010 (provenance/OIDC), FR-014 (per-scope `engine/SECURITY.md`), and FR-031/M9 (third-party SHA-pinning). Re-run `/speckit-clarify` to confirm zero markers persist before Developer Agent starts step 8.)*

---

## Constitution Compliance Notes

| Principle | How this spec complies |
|---|---|
| I. Agent-First Design | Every change is expressible as agent behaviour (BA writes spec, Architect commits ADR, Dev migrates, Reviewer enforces M4–M8). |
| II. NNN Traceability | Issue #47 → `specs/047-repo-topology/` → branch `047-repo-topology` → ADR-047 → PR (one chain). |
| III. Spec-Before-Code | This spec exists before any code in the migration plan; `/speckit-checklist` must pass before Dev starts. |
| IV. Dual-AI Compatibility | FR-018 (M7) and US-4 explicitly enforce this in the SoT repo. |
| V. Reusability / Zero-Config | US-1, FR-008–FR-014, FR-021 are the entire reason this spec exists. |
| VI. Observable, Auditable Automation | Every check (M1–M8) produces a CI log entry; release workflow comments on the release Issue. |
| VII. Simplicity / YAGNI | Three folders deleted (`templates/.apm/pipelines/`, `.github/agents/`); no new abstractions introduced. |
| VIII. Orchestrator as Single Control Plane | One engine, two distribution channels, one source. Routing logic unchanged. |
| IX. Dashboard Read-Only | Dashboard moves to `engine/dashboard/`; no functional change; read-only contract preserved. |
