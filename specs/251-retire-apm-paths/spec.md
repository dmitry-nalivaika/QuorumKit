# Spec: Retire `.apm/` Path References — Issue #251

## Overview

The `.apm/` directory was a legacy artefact from the pre-QuorumKit era. Its functional role has been superseded: pipelines, runtimes, and identities live in `src/`; agent and skill definitions live in `.github/agents/` and `.github/skills/`. Stale `.apm/` references in documentation, specs, ADRs, orchestrator source, and shell scripts create confusion for contributors, cause `verify-mirror.sh` checks to fail, and violate the constitutional principle that the agent protocol documentation is the single source of truth. This spec defines the requirements for retiring all stale `.apm/` references while preserving legitimate historical uses and existing implemented behaviour (spec-132 FR-001 and FR-003).

## User Stories

### US-1: Contributor finds correct paths in documentation

As a contributor setting up QuorumKit in a new project,
I want all documentation to reference `src/pipelines/`, `src/runtimes.yml`, `src/agent-identities.yml`, `.github/agents/`, and `.github/skills/` when referring to installed file locations,
so that I copy the right paths and do not create a stale `.apm/` directory.

Acceptance Scenarios:
- Given I follow `docs/INIT.md` step-by-step, When I run `init.sh`, Then the directories created match the paths shown in the documentation.
- Given I read `docs/DASHBOARD.md`, When I run the example `bash ~/.quorumkit/scripts/init.sh` commands, Then the paths shown reference `~/.quorumkit/` as the QuorumKit clone prefix (not `~/src/`).

### US-2: Orchestrator reads from correct paths at runtime

As a consumer project running the QuorumKit orchestrator,
I want the orchestrator to load pipelines from `src/pipelines/`, runtime config from `src/runtimes.yml`, and identities from `src/agent-identities.yml`,
so that the engine finds the files that `init.sh` installed and runs correctly.

Acceptance Scenarios:
- Given a consumer project with `src/pipelines/feature-pipeline.yml`, When the orchestrator runs, Then it loads the pipeline without error.
- Given a consumer project that has no `src/pipelines/` directory, When the orchestrator runs, Then it logs a clear error identifying the missing directory.

### US-3: Existing consumer can migrate from `.apm/` to `src/`

As an operator of an existing consumer project that was initialised before this change,
I want a documented migration path from the `.apm/` layout to the `src/` layout,
so that I can upgrade without silently losing my pipeline configuration.

Acceptance Scenarios:
- Given `docs/MIGRATION.md` is open, When I search for the upgrade path from `.apm/` to `src/`, Then I find an explicit section with the rename commands required.
- Given I follow the migration guide, When I run the orchestrator after migration, Then all previously working pipelines continue to work.

### US-4: Dashboard generator retains spec-132 behaviour

As a maintainer running `generate-dashboard.js`,
I want the generator to read the version from `engine/package.json` and skip the write when `index.html` is already up-to-date,
so that spec-132 FR-001 and FR-003 are not reverted and the CI does not produce spurious commits.

Acceptance Scenarios:
- Given `engine/package.json` has `"version": "3.1.0"`, When `generate-dashboard.js` runs, Then `QUORUMKIT_VERSION` in `index.html` is set to `"3.1.0"` sourced from `package.json` (not from `quorumkit.yml`).
- Given `index.html` already has the correct version, When `generate-dashboard.js` runs, Then no write to `index.html` occurs and the log shows `✅ already up to date`.

### US-5: Historical spec audit trail is preserved

As a future contributor reading the commit history,
I want specs that document previously-fixed issues (including spec-132) to remain in the repository,
so that the NNN traceability chain required by the constitution is intact.

Acceptance Scenarios:
- Given I run `ls specs/132-fix-dashboard-version-constant/`, When I look at the result, Then `spec.md` is present and unmodified.
- Given I look at `specs/153-fix-update-dashboard-stale-paths/spec.md`, When I read FR-001, Then the "before" path still reads `.apm/agents/**` (the historical stale path being fixed in that spec).

## Functional Requirements

- FR-001: All references to `.apm/pipelines/` in runtime code (`engine/orchestrator/`) MUST be replaced with `src/pipelines/`.
- FR-002: All references to `.apm/runtimes.yml` and `.apm/agent-identities.yml` in runtime code MUST be replaced with `src/runtimes.yml` and `src/agent-identities.yml`.
- FR-003: All references to `.apm/agents/` and `.apm/skills/` in runtime code, CI workflows, and installation scripts MUST be replaced with `.github/agents/` and `.github/skills/`.
- FR-004: `src/scripts/init.sh` MUST install pipeline templates to `src/pipelines/` (not `.apm/pipelines/`) and agent definitions to `.github/agents/` (not `.apm/agents/`) in consumer projects.
- FR-005: `engine/dashboard/generate-dashboard.js` MUST retain `engine/package.json` as the canonical version source (spec-132 FR-001). The `PACKAGE_JSON` constant and the `JSON.parse(fs.readFileSync(PACKAGE_JSON)).version` read MUST NOT be removed.
- FR-006: `engine/dashboard/generate-dashboard.js` MUST retain the idempotency write guard (spec-132 FR-003). If the generated content equals the current `index.html`, no write must occur.
- FR-007: `docs/MIGRATION.md` MUST include a consumer upgrade section documenting the manual steps to move an existing `.apm/` installation to the `src/` layout.
- FR-008: Historical `.apm/` references that appear as the **before state** in migration guides, historical specs (`specs/153-*/`, `specs/172-*/`), or ADRs describing defects that existed at the time MUST be preserved unchanged.
- FR-009: `specs/132-fix-dashboard-version-constant/spec.md` MUST NOT be deleted. Spec files are permanent audit trail (Constitution §II).
- FR-010: `docs/MIGRATION.md`'s "frozen identifiers" table MUST correctly list `.apm/` wire-format tokens and protocol identifiers as frozen — not `src/` paths which are the new canonical location.
- FR-011: `~/.quorumkit/` references in user-facing documentation (`docs/DASHBOARD.md`, `docs/INIT.md`) that represent the user's local QuorumKit clone path MUST NOT be replaced with `~/src/`; they are unrelated to the internal `.apm/` SoT rename.

## Success Criteria

- [ ] `grep -r '\.apm/' engine/orchestrator/` returns zero results.
- [ ] `grep -r '\.apm/' .github/workflows/` returns zero results.
- [ ] `bash src/scripts/verify-mirror.sh` passes all M1–M7 checks.
- [ ] `node engine/dashboard/generate-dashboard.js` reads version from `engine/package.json` (verified by log output `(from package.json)`).
- [ ] Running `node engine/dashboard/generate-dashboard.js` twice produces the message `already up to date` on the second run.
- [ ] `docs/MIGRATION.md` contains a consumer upgrade section with explicit `mv .apm/ src/` commands or equivalent.
- [ ] `ls specs/132-fix-dashboard-version-constant/spec.md` exists and is unmodified.
- [ ] `grep 'apm/agents' specs/153-fix-update-dashboard-stale-paths/spec.md` returns the historical before-state lines.
- [ ] All existing engine tests pass (`npm test` in `engine/`).

## Key Entities

- **`.apm/` directory**: Legacy installation directory superseded by `src/` (for pipelines/runtimes/identities) and `.github/agents/` (for agents/skills). Must not exist in consumer projects after migration.
- **`src/pipelines/`**: New canonical consumer-project location for QuorumKit pipeline YAML files (installed by `init.sh`).
- **`src/runtimes.yml`**: New canonical consumer-project location for the runtime registry (replaces `.apm/runtimes.yml`).
- **`src/agent-identities.yml`**: New canonical consumer-project location for agent identity mappings (replaces `.apm/agent-identities.yml`).
- **`.github/agents/`**: New canonical consumer-project location for agent definition Markdown files (replaces `.apm/agents/`).
- **Historical `.apm/` reference**: An occurrence of `.apm/` in a spec, ADR, or migration guide that documents the **before state** of a previously completed fix. Must be preserved as-is.
- **`PACKAGE_JSON` constant**: The `const PACKAGE_JSON = path.join(ROOT, 'package.json')` declaration in `generate-dashboard.js`, required by spec-132 FR-001.

## Out of Scope

- Renaming `src/` to a dedicated tool-specific path is a major breaking change (Constitution §V) and requires a separate ADR and MAJOR version bump.
- Wire-format protocol tokens (`apm-msg`, `apm-state`, `apm-pipeline-state`) are frozen; they are not renamed by this spec.
- Renaming the npm package `@dmitry-nalivaika/apm-orchestrator`.
- Changes to dashboard UI, agent definitions content, or pipeline YAML structure.

## Security and Privacy Considerations

N/A — this spec involves path renames in documentation and configuration files only. No authentication, no PII, no sensitive data involved. Single-user / no-auth system per the constitution.

## Assumptions

- `quorumkit.yml` (at repo root) retains its `version:` field; `generate-dashboard.js` still parses it for `workflowCount`, `universal`, and `domain` — but version is read from `engine/package.json`, not from `quorumkit.yml`.
- Consumer projects do not rely on the presence of a `src/` directory for anything other than QuorumKit files after running `init.sh`. Projects that have a pre-existing `src/` with their own source code should be documented in the migration guide.
- `verify-mirror.sh` M4 check uses the path `src/.github/pipelines` (as stated in the `h1` heading), not `templates/src/pipelines/`. The comment in that check must be corrected to match the heading.
- PR #250 (`rename-apm-to-quorumkit`) implements the majority of this spec; the remaining work is fixing the regressions identified in the Reviewer Agent's review of that PR.

## Open Questions

_None — fully scoped for handoff._
