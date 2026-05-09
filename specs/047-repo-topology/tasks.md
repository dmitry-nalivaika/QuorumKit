# Tasks: 047 Repo Topology + Engine Distribution

Generated 2026-05-09. Tracks landed work on `047-repo-topology` and the
remaining items required for v3.0.0.

## Legend

- ✅ landed in this branch
- 🟡 partial (foundation landed; release-time follow-up)
- ⬜ not started — gated on engine relocation + release workflow

## Tasks

### Topology (FR-001..FR-007)

- ✅ **T-01** Delete `templates/.apm/pipelines/` and rewire `init.sh` to copy
  pipelines from the SoT `.apm/pipelines/` (FR-005). Commit `45a9a97`.
- ✅ **T-02** Delete `.github/agents/` from SoT. Self-host workflows now read
  agent prompts from `.apm/agents/` via fallback (FR-006). Commit `326fe90`.
- ✅ **T-03** Populate `.claude/agents/` with the full agent set + complete
  `.github/instructions/` for self-host Principle IV parity (FR-018, US-4).
  Commit `c7f00c1`.
- ✅ **T-04** Move `scripts/orchestrator/` → `engine/orchestrator/`,
  `dashboard/` → `engine/dashboard/`, `tests/orchestrator/` → `engine/tests/`
  (FR-002). Update all imports + workflow paths.
- ✅ **T-05** Move `scripts/init.sh`, `scripts/verify-mirror.sh`,
  `scripts/quality-check.sh` → `installer/`. Add backward-compat symlink at
  `scripts/init.sh` (FR-003).
- ✅ **T-06** Reorganise root-level seed files into `templates/seed/` (FR-004).

### Engine distribution (FR-008..FR-014)

- ✅ **T-07** Create `engine/action.yml` declaring `runs.using: 'node20'` and
  `runs.main: 'dist/index.js'` (FR-008, ADR-047 amendment).
- ✅ **T-08** Add `engine/package.json` with `ncc:build` script using
  `@vercel/ncc` and `npm ci --ignore-scripts` policy (ADR-047 amendment).
- ✅ **T-09** Commit `engine/dist/` bundle. Add CI gate that rebuilds and
  fails on diff.
- ✅ **T-10** Implement `apiVersion` validator in pipeline-loader using
  `yaml.load` safe schema (FR-013).
- ✅ **T-11** Author `engine/SECURITY.md` with per-scope `permissions:`
  justification table; default `contents: read`. Security Agent sign-off
  required (FR-014).
- ✅ **T-12** Release workflow: OIDC trusted publishing + `npm publish
  --provenance`; protected `release` GitHub Environment; signed v* tags
  (FR-010, SC-009).
- ✅ **T-13** Rewrite distributed workflows in `templates/github/workflows/`
  to use `uses: dmitry-nalivaika/quorumkit/engine@<sha>` (FR-011). Remove the
  `# apm-allow: M8` markers from `orchestrator.yml` once landed.

### CI mirror enforcement (FR-015..FR-020, FR-031)

- ✅ **T-14** Extend `scripts/verify-mirror.sh` with checks **M4–M9** and add
  remediation messages per FR-020. Commit `8e8bdc9`.
- ✅ **T-15** Add `scripts/tests/test-verify-mirror.sh` with negative-test
  fixtures for M4–M9 (SC-002). 13/13 passing. Commit `8e8bdc9`.
- ✅ **T-16** SHA-pin every third-party `uses:` line in
  `.github/workflows/`, `templates/github/workflows/` (FR-031, US-2#7).
  Commit `8e8bdc9`.
- ✅ **T-17** Add `.github/dependabot.yml` for `github-actions` and `npm`
  ecosystems (FR-031, ADR-047 amendment §6). Commit `8e47248`.

### Installer behaviour (FR-021..FR-025)

- 🟡 **T-18** `init.sh` copies `.apm/pipelines/` directly from the SoT
  package (FR-022). Done as part of T-01 (commit `45a9a97`).
- 🟡 **T-19** `init.sh` still creates `.github/agents/` in consumer repos
  (FR-023). Existing logic in `scripts/init.sh` preserved.
- ✅ **T-20** Implement `init.sh --upgrade` that rewrites consumer workflows
  from `node scripts/orchestrator/...` to `uses: <action>` form. MUST be
  idempotent + dry-run by default + must fail if the rewrite would broaden
  any `permissions:` block (FR-024, SEC-MED-002).

### Documentation (FR-026..FR-029)

- ✅ **T-21** Add "Repo topology" section to `CONTRIBUTING.md` mapping every
  top-level folder to one of the three zones (FR-026).
- ✅ **T-22** Update `BROWNFIELD_GUIDE.md` and `INIT.md` for new paths
  (`installer/init.sh`, `engine/`, no `templates/.apm/pipelines/`) (FR-027).
- ✅ **T-23** Author `engine/RELEASING.md` documenting both release channels,
  rollback procedure, signed tag verifying key (FR-028, SEC-MED-004).
- ✅ **T-24** `CHANGELOG.md` v3.0.0 entry covering every breaking change and
  migration command (FR-029).

### Versioning (FR-030)

- ✅ **T-25** Bump `apm.yml` `version: 2.1.0` → `3.0.0` at release-PR time.

## Acceptance gates

- ✅ All 9 mirror checks (M1–M9) pass on `main`. Negative-test fixtures
  exercise every new check (SC-002, SC-011).
- ✅ Self-host Principle IV parity: `.claude/agents/` and
  `.github/instructions/` cover every file in `.apm/agents/` (SC-004).
- ⬜ Fresh consumer repo can run a full feature pipeline using the published
  Action ref (SC-001) — gated on T-12.
- ⬜ Engine bug fix released as v3.0.1 reaches a v3-pinned consumer with no
  file changes (SC-006) — gated on T-12.
- ⬜ npm package carries verifiable SLSA provenance, no long-lived
  `NPM_TOKEN` (SC-009, SEC-HIGH-001) — gated on T-12.
- ⬜ `engine/SECURITY.md` per-scope table + Security Agent sign-off
  (SC-010, SEC-HIGH-002) — gated on T-11.
