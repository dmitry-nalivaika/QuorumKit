---

description: "Task list for Issue #283 — Orchestrator with Server and UI to Be Distributed Within a Package"
---

# Tasks: Orchestrator with Server and UI to Be Distributed Within a Package

**Input**: Design documents from `specs/283-orchestrator-with-server-and-ui-to-be-di/`
**Prerequisites**: [plan.md](./plan.md) (required), [spec.md](./spec.md) (required for user stories)

**Tests**: This project's constitution mandates strict TDD (see plan.md Constitution
Check). Tests are **NOT optional** — every implementation task for a testable unit is
preceded by its own test-writing task, which must be run and observed failing (red)
before the corresponding implementation task turns it green.

**Organization**: Tasks are grouped by user story (US-1..US-4, from spec.md) to enable
independent implementation and testing of each story. Each task cites the Functional
Requirement(s) (FR-001..FR-009) and Architecture Decision(s) (AD-1..AD-6) it satisfies.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- File paths are exact and relative to the repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffolding needed before the package manifest and any user story work

- [X] T001 Create the `engine/bin/` directory to hold the new CLI entry points (AD-2)
- [X] T002 [P] Create `engine/dashboard/.npmignore` excluding `node_modules/`, `*.log`, and local dashboard config artefacts from the published tarball — must live inside `dashboard/`, not `engine/`, since npm's `files` field is only overridden by a subdirectory `.npmignore` (AD-3)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The npm package manifest that every user story depends on — without it,
`dashboard/` and the `bin` command are not part of what `npm install quorumkit-engine`
delivers, blocking US-1, US-2, and (indirectly) US-3.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 [P] Write failing test `engine/tests/engine-package.test.js` asserting `engine/package.json` declares `bin.quorumkit-engine`, that `files` includes `dashboard/`, and that `npm pack --dry-run` output excludes `dashboard/node_modules/`, `*.log`, and local config artefacts (AD-1, AD-3, FR-001, FR-005) — run it and confirm it fails
- [X] T004 Add the `bin` field and extend the `files` array with `dashboard/` in `engine/package.json` (AD-1, AD-3) — makes T003's manifest assertions pass
- [X] T005 Run `npm test` in `engine/` (including T003) and `npm ci` to confirm the hoisted `ws` dependency (pinned `^8.21.0` in both `dashboard/package.json` and `engine/orchestrator/package.json`) resolves with no conflicts (FR-007)

**Checkpoint**: Package manifest ready — `dashboard/` and a `bin` entry point are now
packable via npm. User story implementation can begin.

---

## Phase 3: User Story 1 - Install the packaged dashboard into a consumer project (Priority: P1) 🎯 MVP

**Goal**: A consumer repository installs the orchestrator, dashboard server, and
dashboard UI as a single package by running the existing setup script, with no manual
file edits, and can safely re-run the script later (FR-001, FR-005 baseline, FR-008; AD-1, AD-3, AD-5)

**Independent Test**: From a scratch temporary directory, run `src/scripts/init.sh`
pointed at this package, then `npm install --no-save quorumkit-engine`; confirm the
epilogue's installation instructions are npm-based (no reference to a source-clone
filesystem path) and that re-running the installer does not overwrite any existing
consumer file.

### Tests for User Story 1 ⚠️

> Write these tests FIRST, ensure they FAIL before implementation

- [X] T006 [P] [US1] Extend `scripts/test-external-install.sh` with a failing assertion that the printed "Next steps" epilogue references `npm install --no-save quorumkit-engine` / `npx quorumkit-engine dashboard`, and no longer prints the source-clone-relative `$QUORUMKIT_PACKAGE_DIR/engine/dashboard/start.sh` path as the primary instruction (FR-001, FR-002, AD-5)

### Implementation for User Story 1

- [X] T007 [US1] Rewrite the dashboard epilogue block in `src/scripts/init.sh` to print the npm-installed dashboard instructions per AD-5 — makes T006 pass
- [X] T008 [P] [US1] Update `docs/DASHBOARD.md` §4 "Installing QuorumKit into Your Project" and §5 "Launching the Dashboard" to document the `npx quorumkit-engine dashboard` path as primary, keeping the source-clone path as the self-host alternative (FR-008)
- [X] T009 [US1] Run `bash scripts/test-external-install.sh` for all three `--ai` modes to confirm a consumer repo with no prior installation ends up with the correct npm-based epilogue and no manual file edits, and that re-running the installer is safe (FR-001) — validates US-1 acceptance scenarios 1 and 2

**Checkpoint**: User Story 1 is independently functional — consumer projects installing
via `init.sh` are told exactly how to get a working dashboard via npm, with no
knowledge of QuorumKit's internal source-tree layout required.

---

## Phase 4: User Story 2 - Run a project-scoped dashboard with one command (Priority: P2)

**Goal**: A single command starts the dashboard server and UI, scoped only to the
consumer project's own agents/specs/pipelines, with a clear error (and no orphaned
process) if the port is busy (FR-002, FR-003, FR-006; AD-2)

**Independent Test**: From a simulated consumer project with `quorumkit-engine`
vendored under `node_modules/`, run `npx quorumkit-engine dashboard`; confirm the
server starts, resolves the consumer project's own `.git` root (not QuorumKit's own
repo), and that a pre-occupied port produces a clear, actionable error with a clean exit.

### Tests for User Story 2 ⚠️

> Write these tests FIRST, ensure they FAIL before implementation

- [X] T010 [US2] Write failing tests in `engine/tests/dashboard-vendored-scoping.test.js` covering: (1) vendored-install project-dir resolution via `.git` walk-up, distinct from QuorumKit's own repo; (2) `--port <N>` flag parsing matching `dashboard/start.sh`'s existing behaviour, with `QUORUMKIT_PROJECT_DIR` (if already set) taking precedence over `process.cwd()`; (3) a busy port (`EADDRINUSE`) yielding a clear, actionable error message and a clean process exit with no orphaned background process (FR-002, FR-003, AD-2)

### Implementation for User Story 2

- [X] T011 [US2] Implement `engine/bin/quorumkit-dashboard.js`: resolve `process.cwd()` as the consumer project directory, set `QUORUMKIT_PROJECT_DIR` unless already set, parse `--port <N>` the same way `dashboard/start.sh` does, handle `EADDRINUSE` with a clear error and clean exit, then `require()` `../dashboard/server.js` in-process (AD-2) — makes T010's cases (1)–(3) pass
- [X] T012 [US2] Implement `engine/bin/quorumkit-engine.js`: thin CLI dispatcher routing the `dashboard` subcommand to `bin/quorumkit-dashboard.js`, structured to be extensible for future subcommands (AD-2)
- [X] T013 [US2] Wire the new `bin` entry (`quorumkit-engine: bin/quorumkit-engine.js`) into `engine/package.json`, extending the `bin` field added in T004 (AD-2)
- [X] T014 [US2] Update `engine/dashboard/start.sh` to delegate its Node invocation to `bin/quorumkit-dashboard.js` instead of its own inline port-parsing, avoiding duplicated logic while preserving self-host behaviour (AD-2)
- [X] T015 [US2] Run `npm test` in `engine/` to confirm `dashboard-vendored-scoping.test.js` is green and all pre-existing dashboard tests (`dashboard-259.test.js`, `dashboard-273.test.js`, `dashboard-invoke.test.js`, `dashboard-invoke-worktree.test.js`, `dashboard-local-pipelines.test.js`, `dashboard-timeline.test.js`, `dashboard-webhook.test.js`) still pass unmodified (FR-006, FR-007)

**Checkpoint**: User Stories 1 AND 2 both work — consumer projects install and run the
dashboard with a single command, correctly scoped to their own project.

---

## Phase 5: User Story 3 - Deliver features in parallel using local pipelines (Priority: P3)

**Goal**: The local-pipeline lifecycle (`pipeline.sh`/`branch-guard.sh`) ships inside
the installed package and operates correctly within the consumer project's own
worktree structure, supporting multiple concurrent, independent pipelines (FR-004; AD-4)

**Independent Test**: In a scratch consumer project (post-install), run the
copied `scripts/pipeline.sh start <N>` twice for two different issue numbers; confirm
two independent worktrees are created and each pipeline operates without interfering
with the other.

### Tests for User Story 3 ⚠️

> Write these tests FIRST, ensure they FAIL before implementation

- [X] T016 [US3] Write failing test `engine/tests/pipeline-install.test.sh` asserting `install_local_pipelines()` copies both `pipeline.sh` and `branch-guard.sh` into a scratch consumer directory's own `scripts/`, is idempotent (skip-with-warning, no overwrite, on re-run), and that both scripts remain executable (FR-004, AD-4)

### Implementation for User Story 3

- [X] T017 [P] [US3] Move `scripts/pipeline.sh` to `src/scripts/pipeline.sh` as the new canonical template source (AD-4)
- [X] T018 [P] [US3] Move `scripts/branch-guard.sh` to `src/scripts/branch-guard.sh` as the new canonical template source (AD-4)
- [X] T019 [US3] Replace `scripts/pipeline.sh` with a backward-compatible shim delegating to `src/scripts/pipeline.sh`, following the existing `scripts/init.sh` → `src/scripts/init.sh` shim precedent (AD-4) — depends on T017
- [X] T020 [US3] Replace `scripts/branch-guard.sh` with a backward-compatible shim delegating to `src/scripts/branch-guard.sh` (AD-4) — depends on T018
- [X] T021 [US3] Add `install_local_pipelines()` to `src/scripts/init.sh`, parallel to the existing `install_pipelines()`, copying `pipeline.sh`/`branch-guard.sh` into the consumer's own `scripts/` directory (idempotent, skip-with-warning if a file already exists) (FR-004, AD-4) — makes T016 pass
- [X] T022 [US3] Call `install_local_pipelines` from all three install paths (`claude`, `copilot`, `both`) in `src/scripts/init.sh`, matching the existing `install_pipelines` call sites (FR-004)
- [X] T023 [US3] Update `docs/LOCAL_PIPELINES.md` to document that `pipeline.sh`/`branch-guard.sh` now ship via `init.sh` into every consumer project, rather than requiring manual vendoring from the QuorumKit source tree (FR-004, FR-008)
- [X] T024 [US3] Run `bash engine/tests/pipeline-install.test.sh`, `bash engine/tests/pipeline.test.sh`, and `bash engine/tests/branch-guard.test.sh` unmodified against the new shim locations to confirm behavioural equivalence (FR-004, FR-006, FR-007)

**Checkpoint**: User Stories 1, 2, and 3 are all independently functional — local
pipelines are installed and usable in any consumer project's own worktree structure.

---

## Phase 6: User Story 4 - Upgrade the package without losing project configuration (Priority: P4)

**Goal**: Upgrading to a newer package version preserves the consumer project's own
configuration; any future breaking file-layout change is accompanied by a documented
migration guide and a version signal (FR-005, FR-009; AD-6)

**Independent Test**: Install the package at the current version in a scratch consumer
project with project-specific configuration (e.g. a hand-edited `src/pipelines/custom.yml`
and a hand-edited `scripts/pipeline.sh`), then re-run the installer simulating an
upgrade; confirm both hand-edited files remain untouched and the dashboard/orchestrator
continue to work.

### Tests for User Story 4 ⚠️

> Write these tests FIRST, ensure they FAIL before implementation

- [X] T025 [US4] Extend `scripts/test-external-install.sh` with a failing assertion: after a second `init.sh` run over an existing install (simulating an upgrade) where `src/pipelines/custom.yml` and `scripts/pipeline.sh` have been hand-edited by the consumer, both files remain byte-identical to the hand-edited version — never overwritten (FR-005; US-4 acceptance scenario 1)

### Implementation for User Story 4

- [X] T026 [US4] Verify/adjust `install_pipelines()` and the new `install_local_pipelines()` in `src/scripts/init.sh` so both consistently skip-with-warning (never overwrite) when the target file already exists (FR-005) — makes T025 pass
- [X] T027 [P] [US4] Bump `quorumkit.yml` `version` from `3.1.0` to `3.2.0` — additive MINOR bump per Constitution Principle V, no breaking file-layout change (AD-6, FR-005)
- [X] T028 [P] [US4] Bump `engine/package.json` `version` from `3.1.0` to `3.2.0` to match (AD-6, FR-005)
- [X] T029 [US4] Add a `[3.2.0]` entry to `CHANGELOG.md` under `[Unreleased]` documenting the dashboard/local-pipeline packaging changes (FR-005, FR-009, AD-6)
- [X] T030 [US4] Confirm `docs/MIGRATION.md` documents the existing `init.sh --upgrade` mechanism as the path for any *future* breaking file-layout change, and add a short note that this release is additive only and requires no new migration entry (FR-009, AD-6)

**Checkpoint**: All four user stories are independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Full-suite regression and documentation completeness across all stories

- [X] T031 [P] Run the full `engine/` automated test suite (`engine/`, `engine/orchestrator/`, `engine/dashboard/`) unmodified to confirm every pre-existing test plus the new tests from T003, T010, and T016 pass (FR-007)
- [X] T032 [P] Manually verify every previously-existing dashboard capability (agent status, invoke/stop, list pipelines, trigger/approve pipeline runs, manage local pipelines, receive pipeline events) still works when the dashboard is launched via `npx quorumkit-engine dashboard` from a vendored install (FR-006)
- [X] T033 [P] Documentation completeness pass: confirm `docs/DASHBOARD.md` and `docs/LOCAL_PIPELINES.md` can be followed end-to-end by a new maintainer with no prior QuorumKit-internal knowledge (FR-008)
- [X] T034 Cross-check that `engine/package.json` and `quorumkit.yml` report the same `3.2.0` version number (release-agent convention; AD-6)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories (US-1 through US-4)
- **User Story 1 (Phase 3)**: Depends on Foundational only
- **User Story 2 (Phase 4)**: Depends on Foundational only; independent of US-1, but naturally follows it since AD-5's epilogue (US-1) is what tells consumers to invoke the command US-2 implements
- **User Story 3 (Phase 5)**: Depends on Foundational only; independent of US-1/US-2
- **User Story 4 (Phase 6)**: Depends on Foundational only; exercises the install paths built in US-1 and US-3, so it is sequenced last
- **Polish (Phase 7)**: Depends on all four user stories being complete

### User Story Dependencies

- **US-1 (P1)**: No dependency on other stories — MVP
- **US-2 (P2)**: No hard dependency on US-1; independently testable via a simulated vendored install
- **US-3 (P3)**: No dependency on US-1/US-2; independently testable via the copied pipeline scripts
- **US-4 (P4)**: Exercises the `init.sh` install paths from US-1 and US-3 to prove upgrade-safety, but does not require their tasks to be "done" first — only requires Foundational

### Within Each User Story

- Tests MUST be written and observed FAILING before implementation (strict TDD)
- File moves/renames before the shims that delegate to them (US-3: T017→T019, T018→T020)
- Manifest/bin wiring before the scripts that depend on it (US-2: T011→T012→T013)
- Implementation before the story's regression-run task

### Parallel Opportunities

- T001 and T002 (Setup) can run in parallel — different files
- T027 and T028 (US-4 version bumps) can run in parallel — different files
- T017 and T018 (US-3 file moves) can run in parallel — different source files
- T006 and T008 (US-1 test + docs) can run in parallel once T004/T005 (Foundational) are done
- T031, T032, T033 (Polish) can run in parallel — independent verification activities
- Once Phase 2 (Foundational) is complete, US-1, US-2, and US-3 phases can be staffed and worked in parallel; US-4 is best sequenced after US-1 and US-3 since its test exercises their install paths

---

## Parallel Example: Phase 1 + Phase 2

```bash
# Setup — run together:
Task: "Create the engine/bin/ directory to hold the new CLI entry points"
Task: "Create engine/.npmignore excluding dashboard/node_modules/, dashboard/*.log, local config"

# Foundational — test first, alone (single file, must fail before T004):
Task: "Write failing test engine/tests/engine-package.test.js"
```

## Parallel Example: User Story 3

```bash
# Launch both canonical-location moves together:
Task: "Move scripts/pipeline.sh to src/scripts/pipeline.sh"
Task: "Move scripts/branch-guard.sh to src/scripts/branch-guard.sh"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: run `scripts/test-external-install.sh`, confirm epilogue and idempotent re-run behaviour
5. Deploy/demo if ready — a consumer can now discover the npm-based install path

### Incremental Delivery

1. Setup + Foundational → package manifest ready
2. Add User Story 1 → validate independently → MVP: installable package
3. Add User Story 2 → validate independently → single-command, correctly-scoped dashboard
4. Add User Story 3 → validate independently → parallel local pipelines
5. Add User Story 4 → validate independently → safe upgrades, versioned release
6. Polish → full regression + documentation completeness pass

### Parallel Team Strategy

With multiple developers, once Foundational (Phase 2) is done:
- Developer A: User Story 1 (init.sh epilogue + docs)
- Developer B: User Story 2 (bin wrappers)
- Developer C: User Story 3 (pipeline script distribution)
- User Story 4 picked up by whoever finishes first, since it exercises US-1/US-3's install paths

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story (US1–US4) for traceability
- FR-006 and FR-007 are cross-cutting (verified at the end of each story's phase and again in Polish) rather than owned by a single story
- FR-008 (documentation) is satisfied incrementally per story (T008, T023) and confirmed complete in Polish (T033)
- Verify each test fails before implementing its corresponding task
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently
