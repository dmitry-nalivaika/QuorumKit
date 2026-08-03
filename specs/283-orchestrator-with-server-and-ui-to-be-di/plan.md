# Implementation Plan — Issue #283
## Orchestrator with Server and UI to Be Distributed Within a Package

### Feature Branch
`283-orchestrator-with-server-and-ui-to-be-di`

---

## Constitution Check

| Rule | How this plan satisfies it |
|------|---------------------------|
| No direct commits to main | Feature branch: `283-orchestrator-with-server-and-ui-to-be-di`; all changes land via PR per Principle II/III workflow |
| Tests before implementation | TDD workflow: new/updated tests written first for each surface — `engine-package.test.js` (npm `files` manifest + `bin` entry point), `dashboard-vendored-scoping.test.js` (project-dir resolution when vendored under `node_modules`), and a `pipeline-install.test.sh` covering the consumer-repo-copied lifecycle scripts — before the corresponding `package.json`/`init.sh` edits |
| No hardcoded secrets | N/A — this is a packaging/distribution change; no new credentials, tokens, or API keys are introduced. The dashboard server continues to require no auth token (Principle IX, project-local single-user tool) |
| Input validation at boundaries | `init.sh` CLI flags (`--engine-ref=`, `--ai=`, etc.) already validated by existing `case` statements — extended, not loosened, for the new dashboard/pipeline install steps; dashboard server's existing input validation (project path, port) is unchanged and re-verified by the existing test suite (FR-007) |
| Data access scoping | Dashboard remains scoped to the single consumer project directory it is launched from (`QUORUMKIT_PROJECT_DIR` / auto-detected `.git` walk-up) — no cross-project data access is introduced; constitution §IX (read-only observability) is preserved |
| Coverage threshold | 80% line coverage (per `engine/orchestrator/vitest.config.js` `thresholds.lines: 80`) maintained; new packaging logic covered by new unit/shell tests before merge |

---

## Problem Summary

Today `quorumkit-engine` is published to npm (ADR-047 Channel B) but its `package.json`
`files` allowlist only includes `dist/`, `action.yml`, `RELEASING.md`, and
`SECURITY.md` — the orchestrator's GitHub Action bundle. `engine/dashboard/` (server,
UI, `start.sh`) is **not** part of the published tarball, so `npm install
quorumkit-engine` does not give a consumer project a runnable dashboard. `src/scripts/init.sh`
confirms this gap explicitly: its final instructions tell the user to run
`bash $QUORUMKIT_PACKAGE_DIR/engine/dashboard/start.sh` — which only works if the full
QuorumKit git clone is still present on disk at a known path. There is no `npx`/`bin`
entry point.

Similarly, `scripts/pipeline.sh` and `scripts/branch-guard.sh` (ADR-175, local parallel
pipelines) are self-host-only: `init.sh` never copies them into a consumer project's own
`scripts/` directory, and they are not part of the npm package either. A consumer
project therefore cannot use local pipelines (US-3) without manually vendoring these
files from the QuorumKit source tree.

`engine/dashboard/server.js` already anticipates being vendored as a dependency — its
`autoDetectProject()` walks up from `DASHBOARD_DIR` looking for `node_modules/quorumkit/dashboard`-style
installs and a `.git` directory — but no packaging or `bin` wiring exists to actually
exercise that path today.

This plan closes those three gaps without changing the dashboard's existing
capabilities, its read-only nature (Principle IX), or the orchestrator's GitHub Action
distribution channel (Channel A, unchanged).

---

## Architecture Decisions

### AD-1 — Reuse Channel B (npm), do not add a Channel C

`quorumkit-engine`'s existing npm package is extended to carry the dashboard and a new
`bin` entry point, rather than publishing a separate package. This keeps one release
pipeline (`engine-release.yml`, `engine/RELEASING.md`), one version number for
orchestrator + dashboard + UI, and satisfies FR-005 (independently versioned single
package) with the least new surface — consistent with Constitution Principle VII
(YAGNI) and ADR-047's two-channel model (this plan does not reopen or amend that ADR).

### AD-2 — `bin/quorumkit-dashboard` as the single start command

Add a `bin` field to `engine/package.json` pointing at a new thin wrapper script
(`engine/bin/quorumkit-dashboard.js`) that:
1. Resolves the consumer project directory as `process.cwd()` (the directory the
   command is invoked from — mirrors `dashboard/start.sh`'s existing
   `QUORUMKIT_PROJECT_DIR` convention, satisfying FR-002).
2. Sets `QUORUMKIT_PROJECT_DIR` (unless already set) and `require()`s
   `../dashboard/server.js` in-process — no shell subprocess, no second copy of
   port/flag-parsing logic.
3. Parses `--port <N>` the same way `dashboard/start.sh` does today, so behaviour is
   unchanged for existing self-host usage.

Consumers run it via `npx quorumkit-engine dashboard` (thin CLI dispatch in
`engine/bin/quorumkit-engine.js`) or, if they add it as a `devDependency`, via an npm
script (`"dashboard": "quorumkit-dashboard"`). `dashboard/start.sh` remains as the
self-host convenience entry point (unchanged) and now delegates its Node invocation to
the same wrapper to avoid drift.

### AD-3 — `files` allowlist grows to include `dashboard/`

`engine/package.json` `files` gains `dashboard/` (excluding `node_modules/` and local
`*.log`/config artefacts via a **`dashboard/.npmignore`** — per npm's own `files`
documentation, a root-level `.npmignore` does *not* override the `files` allowlist,
only a subdirectory `.npmignore` does, so the ignore file must live inside
`dashboard/` itself, not at `engine/`). `dashboard/package.json`'s single runtime
dependency (`ws`) is declared explicitly in `engine/package.json`'s own
`"dependencies"` field (pinned identically, `^8.21.0`), since `engine/`,
`dashboard/`, and `orchestrator/` are three independent npm packages (not an npm
workspace) and there is no implicit hoisting between them. This is what actually
makes `npm install quorumkit-engine` pull `ws` in transitively — no separate `npm
install` step required inside `node_modules/quorumkit-engine/dashboard` at runtime
(this removes the current self-host-only "install deps if needed" step in
`start.sh` for the packaged case, while leaving it as a harmless no-op fallback for
self-host). **Verified end-to-end** by `engine/tests/dashboard-isolated-npm-install.test.js`,
which does a real `npm pack` → `npm install` into an isolated temp directory with no
shared `node_modules` → runs the installed `quorumkit-dashboard` bin → confirms it
serves `/api/config` (catches the class of bug where a dependency only resolves
because it happens to already be present in this repo's own dev checkout).

### AD-4 — Local pipeline scripts become a distributed template, not just self-host tooling

`scripts/pipeline.sh` and `scripts/branch-guard.sh` move under `src/scripts/` templates
(alongside the already-distributed `init.sh`) as the source of truth for what gets
copied into consumer projects, with the existing top-level `scripts/pipeline.sh` /
`scripts/branch-guard.sh` in this repo becoming thin backward-compatible shims (same
pattern already used for `scripts/init.sh` → `src/scripts/init.sh`).
`src/scripts/init.sh` gains a new `install_local_pipelines()` step (parallel to the
existing `install_pipelines()` for `src/pipelines/*.yml`) that copies
`pipeline.sh`/`branch-guard.sh` into the consumer's own `scripts/` directory
(idempotent — skip with a warning if already present, matching every other
`install_*` function's convention). This directly satisfies FR-004 (local-pipeline
capability included in the installed package, operating in the consumer's own worktree
structure) and closes ADR-175's "Developer Agent owns details" migration gap.

### AD-5 — `init.sh` epilogue rewritten to reference the npm-installed dashboard

The closing instructions block in `src/scripts/init.sh` (currently
`bash $QUORUMKIT_PACKAGE_DIR/engine/dashboard/start.sh`) is replaced with:
```
npm install --no-save quorumkit-engine
npx quorumkit-engine dashboard
```
so a consumer project never needs to know the QuorumKit source clone's filesystem
path to run its own dashboard, satisfying US-2 and FR-002. The old clone-relative path
is retained only in `BROWNFIELD_GUIDE.md`/self-host docs as the "running from the
QuorumKit source tree itself" case.

### AD-6 — Versioning and migration (FR-005, FR-009)

No breaking change to the installed file layout is introduced by this feature: existing
consumers who already have `src/pipelines/*.yml`, `.github/workflows/*.yml`, etc.
installed are unaffected — this feature only *adds* new install steps
(`install_local_pipelines`) and a new optional npm dependency. Per Constitution
Principle V, this ships as a MINOR version bump (`3.2.0`), not MAJOR. If a future
change to the packaged file layout becomes breaking, ADR-047's existing
`init.sh --upgrade` mechanism and `MIGRATION.md` are the documented path — this plan
does not need a new migration guide because it introduces no breaking change.

---

## Project Structure — Files Changed

| File | Change type |
|------|-------------|
| `engine/package.json` | Add `bin` field; extend `files` to include `dashboard/` |
| `engine/bin/quorumkit-engine.js` | New — thin CLI dispatcher (`dashboard` subcommand today; extensible) |
| `engine/bin/quorumkit-dashboard.js` | New — resolves `process.cwd()`, sets `QUORUMKIT_PROJECT_DIR`, requires `dashboard/server.js` |
| `engine/dashboard/start.sh` | Minor — delegate Node invocation to `bin/quorumkit-dashboard.js` to avoid duplicated port-parsing logic |
| `engine/dashboard/.npmignore` | New — exclude `node_modules/`, `*.log`, `.apm-project.json` from the published tarball (must live in `dashboard/`, not `engine/`, per npm's `files`-field override rule) |
| `src/scripts/init.sh` | Add `install_local_pipelines()` step; rewrite dashboard epilogue instructions (AD-5) |
| `src/scripts/pipeline.sh` | New canonical location (moved from `scripts/pipeline.sh`) — copied into consumer projects |
| `src/scripts/branch-guard.sh` | New canonical location (moved from `scripts/branch-guard.sh`) — copied into consumer projects |
| `scripts/pipeline.sh` | Becomes a backward-compatible shim delegating to `src/scripts/pipeline.sh` (same pattern as `scripts/init.sh`) |
| `scripts/branch-guard.sh` | Becomes a backward-compatible shim delegating to `src/scripts/branch-guard.sh` |
| `engine/tests/engine-package.test.js` | New — asserts `files`/`bin` manifest correctness and that `dashboard/` is included in `npm pack --dry-run` output |
| `engine/tests/dashboard-vendored-scoping.test.js` | New — asserts `autoDetectProject()`/`bin/quorumkit-dashboard.js` correctly resolves a consumer project directory when invoked from a simulated `node_modules/quorumkit-engine/` install |
| `engine/tests/pipeline-install.test.sh` | New — asserts `install_local_pipelines()` copies both scripts idempotently into a scratch consumer directory |
| `docs/DASHBOARD.md` | Update §4/§5 to document the `npx quorumkit-engine dashboard` install/run path as primary; keep source-clone path as the self-host alternative |
| `docs/LOCAL_PIPELINES.md` | Update to document that `pipeline.sh`/`branch-guard.sh` now ship via `init.sh` into every consumer project |
| `CHANGELOG.md` | Entry for the MINOR version bump (packaging) |
| `quorumkit.yml` | Bump `version` to `3.2.0` |
| `specs/283-orchestrator-with-server-and-ui-to-be-di/plan.md` | This file |

No changes are made to `engine/orchestrator/` internals, the GitHub Action distribution
channel (`action.yml`, `dist/`), the Orchestrator's routing logic, or any dashboard
capability (status/invoke/stop/pipelines/local-pipelines/events) — satisfying FR-006 and
the spec's Out of Scope list unchanged.

---

## Research Notes

- **Existing vendoring heuristic confirmed reusable**: `engine/dashboard/server.js`'s
  `autoDetectProject()` already walks up from the dashboard's own directory looking for
  a `.git` folder and explicitly documents the `node_modules/quorumkit/dashboard`
  vendored case in its comments — no server-side logic changes are needed, only the
  packaging (`files`/`bin`) that lets that code path actually get exercised via npm
  install.
- **`quorumkit-engine` publishing pipeline is transactional today** (`engine/RELEASING.md`):
  Action tag + npm publish happen from the same signed `v*` tag. Adding `dashboard/`
  to `files` requires no change to that release workflow beyond re-verifying
  `npm pack --dry-run` output in CI (already implied by the existing "rebuild
  engine/dist/ via ncc — refuses tag → bundle drift" gate; the new test
  `engine-package.test.js` gives the same drift protection for `dashboard/`).
- **`dashboard/package.json`'s only dependency is `ws`**: hoisting is low-risk; no
  native bindings, no peer dependency conflicts expected with `engine/orchestrator/`'s
  dependencies (`@octokit/rest`, `ajv`, `js-yaml`).
- **Precedent for the shim-move pattern**: `scripts/init.sh` already exists purely as a
  backward-compat wrapper around `src/scripts/init.sh` ("Removal: planned for v4.0.0").
  AD-4 follows this exact, already-reviewed precedent for `pipeline.sh`/`branch-guard.sh`,
  minimizing review risk and avoiding a new ADR (no new architectural pattern is
  introduced, only extension of an accepted one).
- **No new ADR required**: this plan extends ADR-047 (two-channel distribution) and
  ADR-175 (local pipeline scripts) using patterns those ADRs already establish, rather
  than introducing a new distribution mechanism. Per the Architect Agent's "When an ADR
  is Required" rule, an ADR amendment is only needed if a *new* irreversible pattern is
  introduced — it is not, since Channel B already exists and the shim pattern is
  precedented.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Published tarball grows and could accidentally include `dashboard/node_modules/` or local `.apm-project.json` config | New `engine/.npmignore` + `engine-package.test.js` asserting `npm pack --dry-run` file list excludes those paths |
| `bin/quorumkit-dashboard.js` resolving the wrong `cwd` when invoked via `npx` from a nested directory | Existing `QUORUMKIT_PROJECT_DIR` override always takes precedence (unchanged); new test covers the vendored-under-`node_modules` walk-up case explicitly |
| Moving `scripts/pipeline.sh`/`branch-guard.sh` to `src/scripts/` breaks existing CI workflows or agent instructions that reference the old path | Old paths kept as shims (AD-4); `engine/tests/pipeline-install.test.sh` and existing `branch-guard.test.sh`/`pipeline.test.sh` re-run unmodified against the shims to prove behavioural equivalence (FR-007) |
| Consumers on `quorumkit-engine@<3.2.0` see no dashboard/pipeline changes until they bump the npm version | Documented as an additive MINOR bump in `CHANGELOG.md`; no action required from already-installed consumers, consistent with FR-005 |
| Hoisting `ws` into `engine/`'s dependency tree could conflict with `engine/orchestrator`'s `devDependency` on `ws` (used only in orchestrator tests) | `ws` version already pinned identically (`^8.21.0`) in both `dashboard/package.json` and `engine/orchestrator/package.json`; no conflict expected — verified by `npm ci` in the new test |

---

## Complexity Tracking

No Constitution Check violations require justification — this plan reuses existing
accepted patterns (ADR-047 Channel B, the `scripts/init.sh` shim precedent) rather than
introducing new architectural complexity.
