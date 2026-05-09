# Spec: QuorumKit Full Rebranding — Issue #67

## Overview

Rename the project from **APM / Agentic Dev Stack** to **QuorumKit** across every
consumer-visible surface: repository name, NPM package identity, documentation,
configuration file names, and the VS Code extension. This rebranding is a
prerequisite gate for the v3 engine NPM release (Issue #61) — the NPM package must
ship under the QuorumKit identity from day one.

Internal protocol wire-format tokens (`apm-msg`, `apm-state`, `apm-pipeline-state`)
are **out of scope** for this spec; they are a separate breaking-change feature
requiring their own ADR and migration guide.

---

## User Stories

### US-1: Consumer discovers the package under the new name
As a **developer adopting QuorumKit**, I want every public-facing surface
(GitHub repository, NPM registry, README, docs) to consistently say "QuorumKit",
so that there is no confusion with the old APM / Agentic Dev Stack branding.

Acceptance Scenarios:
- Given the GitHub repository has been renamed
  When a developer navigates to `github.com/dmitry-nalivaika/quorumkit`
  Then they reach the canonical repository with no redirects required from old URLs within the codebase
- Given the NPM package is published as `quorumkit-engine`
  When a developer runs `npm install quorumkit-engine`
  Then the package installs successfully and its `package.json` `name` field reads `quorumkit-engine`
- Given the README and all root-level docs have been updated
  When a developer opens the repository landing page
  Then they see "QuorumKit" (not "APM" or "Agentic Dev Stack") in every heading, title, and description

### US-2: Existing consumer projects can migrate with a clear upgrade path
As a **maintainer of a project already using the APM stack**, I want a migration
guide that tells me exactly which file names and references to update,
so that my project keeps working after I pull the new package version.

Acceptance Scenarios:
- Given an existing consumer project with `uses: dmitry-nalivaika/agentic-dev-stack/engine@v2`
  When the maintainer follows the migration guide
  Then they update the reference to `uses: dmitry-nalivaika/quorumkit/engine@v3` and all workflows pass
- Given the `apm.yml` configuration file is renamed to `quorumkit.yml`
  When `installer/init.sh` runs on an existing project
  Then it detects the old `apm.yml`, prints a migration notice, and exits non-zero until the file is renamed
- Given the `.apm/` directory is NOT renamed in this release (see Out of Scope)
  When a consumer project runs `init.sh --upgrade`
  Then no `.apm/` path changes occur and existing pipelines, agents, and runtimes continue to work without modification

### US-3: Maintainer releases the engine to NPM under the QuorumKit name
As the **project maintainer**, I want the CI/CD publish workflow to release the
engine as `quorumkit-engine` to the NPM public registry,
so that the v3 release (Issue #61) ships with the correct package identity.

Acceptance Scenarios:
- Given `engine/package.json` declares `"name": "quorumkit-engine"` and `"private": false`
  When the publish workflow runs on a `v3.x.x` tag
  Then the package appears on `npmjs.com` as `quorumkit-engine`
- Given `engine/orchestrator/package.json` declares `"name": "quorumkit-orchestrator"`
  When any downstream consumer imports from the package
  Then imports resolve correctly with no leftover `apm-orchestrator` references in published artefacts

### US-4: VS Code extension reflects the new brand
As a **developer using the QuorumKit VS Code extension**, I want the extension
displayed as "QuorumKit Copilot Bridge" (not "APM Copilot Bridge"),
so that the extension marketplace listing and command palette are consistent
with the new brand.

Acceptance Scenarios:
- Given `engine/dashboard/extensions/apm-copilot-bridge/package.json` is updated
  When the extension is installed from VSIX or the marketplace
  Then its display name reads "QuorumKit Copilot Bridge" and commands are prefixed `quorumkit.`
- Given the extension folder has been renamed `quorumkit-copilot-bridge`
  When the build pipeline builds the VS Code extension artefact
  Then the output VSIX is named `quorumkit-copilot-bridge-*.vsix`

---

## Functional Requirements

- **FR-001**: The GitHub repository MUST be renamed from `agentic-dev-stack` to `quorumkit` before the v3 NPM release tag is pushed.
- **FR-002**: `engine/package.json` `name` field MUST be changed from `"apm-engine"` to `"quorumkit-engine"` and `"private": true` MUST be removed so the package can be published.
- **FR-003**: `engine/orchestrator/package.json` `name` field MUST be changed from `"apm-orchestrator"` to `"quorumkit-orchestrator"`.
- **FR-004**: `apm.yml` (root-level consumer configuration manifest) MUST be renamed to `quorumkit.yml`; all scripts and workflows that reference `apm.yml` MUST be updated to reference `quorumkit.yml`. This is a **hard break** — v3 does not accept the old filename.
- **FR-005**: `installer/init.sh` MUST detect the presence of a legacy `apm.yml` file in a consumer project, emit a human-readable migration warning naming `quorumkit.yml` as the required replacement, and exit non-zero if `quorumkit.yml` is absent.
- **FR-006**: All references in `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `CLAUDE.md`, `INIT.md`, `PIPELINES.md`, `DASHBOARD.md`, `ENHANCEMENTS.md`, `DARK_FACTORY_GUIDE.md`, `BROWNFIELD_GUIDE.md`, and `SECURITY.md` to "APM", "Agentic Dev Stack", and `agentic-dev-stack` MUST be replaced with "QuorumKit", "QuorumKit", and `quorumkit` respectively, except where the old name appears in historical CHANGELOG entries (which MUST remain unchanged as an audit trail).
- **FR-007**: `.specify/memory/constitution.md` header and all self-referential "APM" mentions MUST be updated to "QuorumKit".
- **FR-008**: `apm.yml` `name` field MUST be updated from `"agentic-dev-stack"` to `"quorumkit"` prior to file rename.
- **FR-009**: `engine/dashboard/extensions/apm-copilot-bridge/` directory MUST be renamed to `quorumkit-copilot-bridge/`; its `package.json` `name`, `displayName`, `publisher`, and command IDs MUST be updated to use the `quorumkit` namespace.
- **FR-010**: All `.github/workflows/` files that hardcode `dmitry-nalivaika/agentic-dev-stack` as the `uses:` repository path MUST be updated to `dmitry-nalivaika/quorumkit`.
- **FR-011**: `docs/architecture/` ADRs and `specs/` files MUST have their `uses:` path references updated; prose references to "APM" as the product name MUST be updated; historical spec NNN numbers and ADR numbers MUST NOT be changed.
- **FR-012**: A `MIGRATION.md` file MUST be created at the repository root documenting every renamed file, every changed package name, and every updated `uses:` path, with before/after examples for consumer project upgrade.
- **FR-013**: The internal wire-format tokens (`apm-msg`, `apm-state`, `apm-pipeline-state`, `<!-- apm-state -->`) MUST NOT be changed in this release (see Out of Scope).
- **FR-014**: The `.apm/` configuration directory path MUST NOT be changed in this release (see Out of Scope).
- **FR-015**: After all renames, `installer/quality-check.sh` and `installer/verify-mirror.sh` MUST pass with zero errors.

---

## Success Criteria

- [ ] GitHub repository is accessible at `github.com/dmitry-nalivaika/quorumkit`
- [ ] `npm pack` on `engine/package.json` produces an artefact named `quorumkit-engine-*.tgz` with `"name": "quorumkit-engine"`
- [ ] `grep -r "apm-engine\|agentic-dev-stack\|\"APM\"\|displayName.*APM" . --include="*.json" --include="*.yml" --include="*.md"` (excluding `CHANGELOG.md` historical entries and `node_modules`) returns zero matches outside of `.apm/` internal protocol tokens
- [ ] `installer/quality-check.sh` exits 0
- [ ] `installer/verify-mirror.sh` exits 0
- [ ] `MIGRATION.md` exists at repository root with complete before/after reference table
- [ ] All 175+ orchestrator vitest tests pass after package name changes
- [ ] `quorumkit.yml` is present in the root; `apm.yml` is absent
- [ ] VS Code extension VSIX builds successfully as `quorumkit-copilot-bridge`

---

## Key Entities

- **QuorumKit**: The product name — the reusable agentic SDLC engine and agent stack, formerly "APM / Agentic Dev Stack".
- **`quorumkit-engine`**: The NPM package published from `engine/` — the GitHub Action runtime.
- **`quorumkit-orchestrator`**: The internal orchestrator module published from `engine/orchestrator/`).
- **`quorumkit.yml`**: The renamed consumer configuration manifest (replaces `apm.yml`; hard break in v3).
- **`quorumkit-copilot-bridge`**: The renamed VS Code extension (replaces `apm-copilot-bridge`).
- **`MIGRATION.md`**: The consumer-facing upgrade guide documenting all breaking renames.
- **Wire-format tokens**: `apm-msg`, `apm-state`, `apm-pipeline-state` — internal protocol identifiers intentionally NOT renamed in this release.

---

## Out of Scope

- **`.apm/` directory rename** — renaming `.apm/` to `.quorumkit/` is a major breaking change for all consumer projects. This is deferred to a future spec with a full migration strategy and a MAJOR version bump.
- **Wire-format token rename** (`apm-msg`, `apm-state`, `apm-pipeline-state`) — changing embedded HTML comment tokens would silently break all existing consumer issue timelines and state recovery. Deferred to a dedicated protocol-migration spec with an ADR.
- **VS Code Marketplace publisher account rename** — the `publisher` field change in `package.json` requires a new marketplace publisher account or transfer. Scope is limited to updating the `package.json` fields; marketplace re-publishing logistics are handled by the release agent.
- **GitHub Pages / website domain changes** — out of scope.
- **Backward-compatible NPM alias** — no deprecation shim for `apm-engine`; consumers must update directly.
- **v3 feature development** — this spec covers identity/branding only; v3 functional features are tracked under Issue #61.

---

## Security and Privacy Considerations

N/A — this is a rename/branding operation with no changes to authentication, authorisation, data access, or secrets handling. The existing `SECURITY.md` policy carries over unchanged to the new repository name; the maintainer must update any GitHub repository security settings (branch protection rules, secrets) that reference the old repository name after the rename.

---

## Assumptions

- The GitHub repository rename (`agentic-dev-stack` → `quorumkit`) is performed by the maintainer via GitHub Settings before any new `uses:` path references are merged.
- Historical CHANGELOG entries intentionally retain old names for auditability — this is not a defect.
- The `.apm/` directory remains in place for all consumer projects; no migration of pipeline YAML, agent definitions, or runtime configs is required.
- Wire-format backward compatibility is preserved: existing GitHub Issues with embedded `<!-- apm-state -->` and `<!-- apm-msg -->` blocks continue to be parsed correctly.
- `engine/package.json` changing from `"private": true` to `"private": false` is gated on this spec being complete and the v3 release spec (Issue #61) being approved.

---

## Open Questions

None — all questions resolved. Ready for handoff to Developer Agent.

| # | Question | Resolution |
|---|----------|------------|
| OQ-1 | GitHub Issue number | **#67** — spec directory, branch, and references updated |
| OQ-2 | GitHub repository slug | **`quorumkit`** — `github.com/dmitry-nalivaika/quorumkit` |
| OQ-3 | `quorumkit.yml` compatibility | **Hard break** — v3 accepts only `quorumkit.yml`; installer emits error on legacy `apm.yml` |
| OQ-4 | NPM package name | **`quorumkit-engine`** (unscoped) — no NPM org required |
| OQ-5 | VS Code Marketplace publisher | Maintainer will create `quorumkit` publisher before publishing; unblocks implementation |
