# Task List — Issue #67: QuorumKit Full Rebranding

## Phase 1 — Package manifests

- [ ] T-01 `engine/package.json`: change `"name"` to `"quorumkit-engine"`, remove `"private": true`, update `"description"` (FR-002)
- [ ] T-02 `engine/orchestrator/package.json`: change `"name"` to `"quorumkit-orchestrator"`, update `"description"` (FR-003)

## Phase 2 — Consumer configuration manifest

- [ ] T-03 `apm.yml`: update `name` field to `quorumkit` (FR-008)
- [ ] T-04 Rename `apm.yml` → `quorumkit.yml`; update all scripts/workflows referencing `apm.yml` (FR-004)

## Phase 3 — Installer legacy detection

- [ ] T-05 `installer/init.sh`: add legacy `apm.yml` detection block + non-zero exit with migration warning (FR-005)

## Phase 4 — VS Code extension

- [ ] T-06 Rename extension dir `apm-copilot-bridge/` → `quorumkit-copilot-bridge/` (FR-009)
- [ ] T-07 `quorumkit-copilot-bridge/package.json`: update `name`, `displayName`, `publisher`, command IDs (FR-009)

## Phase 5 — GitHub Actions workflow paths

- [ ] T-08 `.github/workflows/orchestrator.yml`: update comment reference (FR-010)
- [ ] T-09 `.github/workflows/engine-release.yml`: update comment reference (FR-010)
- [ ] T-10 `.github/workflows/engine-build-gate.yml`: update comment reference (FR-010)
- [ ] T-11 `docs/architecture/` ADRs + `specs/`: update `uses:` path refs and prose "APM" product name (FR-011)

## Phase 6 — Root-level documentation

- [ ] T-12 `README.md`: replace "APM", "Agentic Dev Stack", `agentic-dev-stack` → "QuorumKit", "QuorumKit", `quorumkit` (FR-006)
- [ ] T-13 `CONTRIBUTING.md`, `CLAUDE.md`, `INIT.md`, `PIPELINES.md`, `DASHBOARD.md`, `ENHANCEMENTS.md`, `DARK_FACTORY_GUIDE.md`, `BROWNFIELD_GUIDE.md`, `SECURITY.md`: same substitutions (FR-006)
- [ ] T-14 `CHANGELOG.md`: add new entry for v3.0.0 rebranding; leave historical entries untouched (FR-006)

## Phase 7 — Constitution amendment (separate PR)

- [ ] T-15 `.specify/memory/constitution.md`: update header + self-referential "APM" → "QuorumKit" (FR-007) — **commit in isolation; cherry-pick to dedicated PR**

## Phase 8 — Migration guide

- [ ] T-16 Create `MIGRATION.md` at repo root with before/after table (FR-012)

## Verification

- [ ] T-17 Run `bash installer/quality-check.sh` — must exit 0
- [ ] T-18 Run `cd engine/orchestrator && npm test` — all 175+ tests must pass
- [ ] T-19 Run `grep -r "apm-engine\|agentic-dev-stack" . --include="*.json" --include="*.yml" --include="*.md" --exclude-dir=node_modules` — verify zero matches outside `.apm/` internal tokens and historical CHANGELOG entries
