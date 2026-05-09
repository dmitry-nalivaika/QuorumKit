# Implementation Plan — Issue #67: QuorumKit Full Rebranding

## Constitution Check

| Rule | How this plan satisfies it |
|------|---------------------------|
| No direct commits to main | Feature branch: `067-quorumkit-rebranding` |
| Tests before implementation | Quality-check and vitest suite run before each commit; vitest suite is existing (175+ tests that must stay green) |
| No hardcoded secrets | N/A — rename/branding operation; no secrets involved |
| Input validation at boundaries | N/A — no new API or user-input surfaces introduced |
| Data access scoping | N/A — no auth required |
| Coverage threshold | 175+ existing vitest tests must pass; no new functions added requiring additional coverage |

**Constitution conflict flag:** FR-007 (constitution amendment) is required to be
implemented in a **dedicated PR, separate from all other rename work** per ADR-067 §Decision 3.
This plan implements FR-007 in a separate isolated commit so it can be cherry-picked
to its own PR. No other tasks in this plan depend on FR-007.

---

## Approach

This is a mechanical rename/rebranding operation. All file renames and text substitutions
are grouped by risk level and executed in a fixed order to keep each intermediate state
consistent (no broken references between steps).

### Phase 1 — Package manifests (engine)
- FR-002: `engine/package.json` — rename `apm-engine` → `quorumkit-engine`, remove `"private": true`
- FR-003: `engine/orchestrator/package.json` — rename `apm-orchestrator` → `quorumkit-orchestrator`

### Phase 2 — Consumer configuration manifest
- FR-008: Update `apm.yml` `name` field to `quorumkit`
- FR-004: Rename `apm.yml` → `quorumkit.yml`; update all scripts/workflows that reference `apm.yml`

### Phase 3 — Installer legacy detection
- FR-005: Add legacy `apm.yml` detection + non-zero exit to `installer/init.sh`

### Phase 4 — VS Code extension
- FR-009: Rename `engine/dashboard/extensions/apm-copilot-bridge/` → `quorumkit-copilot-bridge/`;
  update `package.json` name, displayName, publisher, command IDs

### Phase 5 — GitHub Actions workflow `uses:` paths
- FR-010: Update `.github/workflows/*.yml` comment references from `dmitry-nalivaika/agentic-dev-stack` → `dmitry-nalivaika/quorumkit`
- FR-011: Update `docs/architecture/` ADRs and `specs/` `uses:` path references and prose

### Phase 6 — Root-level documentation
- FR-006: Update README.md, CHANGELOG.md (new entries only), CONTRIBUTING.md, CLAUDE.md, INIT.md,
  PIPELINES.md, DASHBOARD.md, ENHANCEMENTS.md, DARK_FACTORY_GUIDE.md, BROWNFIELD_GUIDE.md, SECURITY.md

### Phase 7 — Constitution amendment (dedicated commit / PR)
- FR-007: Update `.specify/memory/constitution.md` header and self-referential mentions
  (implemented in isolated commit; cherry-pick to separate PR for human approval)

### Phase 8 — Migration guide
- FR-012: Create `MIGRATION.md` at repository root

---

## Hard Constraints Reminder

- Wire-format tokens (`apm-msg`, `apm-state`, `apm-pipeline-state`) MUST NOT be changed (FR-013)
- `.apm/` directory path MUST NOT be changed (FR-014)
- Historical CHANGELOG entries MUST remain unchanged (FR-006)
- MUST NOT merge — PR opened for Reviewer + QA sign-off
