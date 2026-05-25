# Spec: Fix Local Pipeline Creation Bugs — Issue #223

## Overview

`scripts/pipeline.sh start` allows two dangerous scenarios: (A) creating duplicate pipelines for the same issue number, and (B) creating a pipeline whose resolved branch is `main`/`master` or whose worktree path resolves to the repository root. Both must be detected and rejected with a clear, non-zero-exit error before any filesystem or git state is modified.

## User Stories

### US-1: Prevent duplicate pipeline creation

As a developer using the local pipeline manager,
I want `pipeline.sh start NNN` to refuse if a pipeline already exists for issue `NNN`,
so that I do not accidentally create multiple conflicting worktrees or branches for the same issue.

Acceptance Scenarios:
- Given a pipeline (isolated worktree) already exists for issue #42, When I run `pipeline.sh start 42`, Then the command exits non-zero and prints `Pipeline already exists for issue #042 — use 'pipeline.sh join 042' or 'pipeline.sh stop 042' first.`
- Given a shared-mode pipeline is active on branch `042-my-feature`, When I run `pipeline.sh start 42`, Then the command exits non-zero with the same message.
- Given no pipeline exists for issue #42, When I run `pipeline.sh start 42`, Then the pipeline is created normally (existing behaviour preserved).

### US-2: Block pipeline creation against protected branches or root directory

As a developer using the local pipeline manager,
I want `pipeline.sh start NNN` to refuse if the resolved branch slug would equal `main`, `master`, or any default-branch equivalent, and to refuse if the resolved worktree path equals the repository root,
so that I cannot accidentally overwrite the main working tree.

Acceptance Scenarios:
- Given the resolved branch slug for issue #NNN equals `main` or `master`, When I run `pipeline.sh start NNN`, Then the command exits non-zero and prints `ERROR: Refusing to create a pipeline on protected branch 'main'. Change the issue title or branch to a non-protected name.`
- Given the resolved worktree path equals the current repository root directory, When I run `pipeline.sh start NNN`, Then the command exits non-zero and prints `ERROR: Resolved worktree path equals the repository root — cannot create pipeline at root.`
- Given a valid issue number with a non-protected slug and a valid worktree path, When I run `pipeline.sh start NNN`, Then the pipeline is created normally.

## Functional Requirements

- FR-001: Before creating any worktree or branch, `pipeline.sh start <NNN>` must check whether an isolated pipeline worktree for `<NNN>` already exists in the worktree list (`git worktree list`). If found, exit 1 with message: `Pipeline already exists for issue #NNN — use 'pipeline.sh join NNN' or 'pipeline.sh stop NNN' first.`
- FR-002: Before creating any worktree or branch, `pipeline.sh start <NNN>` must check whether a shared-mode pipeline branch for `<NNN>` is already checked out in the main worktree. If found, exit 1 with the same message as FR-001.
- FR-003: The resolved branch slug must be validated against a list of protected names: `main`, `master`, `develop`, `trunk`. If the slug matches any protected name (case-insensitive), exit 1 with message: `ERROR: Refusing to create a pipeline on protected branch '<slug>'.`
- FR-004: The resolved worktree path must be validated to ensure it does not equal the canonical path of the repository root (`git rev-parse --show-toplevel`). If equal, exit 1 with message: `ERROR: Resolved worktree path equals the repository root — cannot create pipeline at root.`
- FR-005: All guard checks (FR-001–FR-004) must run before any git or filesystem mutation. No partial state may be left on failure.
- FR-006: Guard failure messages must be written to stderr. Exit code must be 1.
- FR-007: Existing behaviour for valid inputs must not be changed.

## Success Criteria

- [ ] Running `pipeline.sh start <NNN>` twice without stopping exits non-zero on the second call with the duplicate-pipeline message.
- [ ] Running `pipeline.sh start` with an issue whose title resolves to a protected branch name exits non-zero with the protected-branch message.
- [ ] Running `pipeline.sh start` in an environment where the worktree path resolves to the repo root exits non-zero with the root-path message.
- [ ] All existing pipeline tests pass unchanged.
- [ ] New unit tests cover all four guard paths (FR-001–FR-004).

## Key Entities

- **Pipeline**: A local development context for a single GitHub Issue, consisting of a git worktree (isolated mode) or a checked-out branch in the main worktree (shared mode), identified by the issue's NNN prefix.
- **Protected Branch**: Any branch name in the set `{main, master, develop, trunk}` that must never serve as a pipeline working branch.
- **Worktree Path**: The filesystem path at which the isolated pipeline worktree is created; must never equal the repository root.

## Out of Scope

- Changing pipeline start/stop/join/status behaviour for valid inputs.
- Adding new pipeline modes.
- Modifying the branch-guard script (`scripts/branch-guard.sh`) beyond what is needed for the new guards.
- Remote branch deletion or PR management.

## Security and Privacy Considerations

Preventing pipeline creation on `main`/root directly reduces the risk of an automated agent corrupting the default branch working tree. This is a security-relevant guard: it prevents accidental `write_file` or `git push` operations from landing on `main` without a PR review.

No PII is involved. Standard open-source data classification applies per the constitution.

## Assumptions

- The project uses `main` as the default protected branch; `master`, `develop`, and `trunk` are also blocked as a defensive default.
- `git worktree list` reliably enumerates all active worktrees, including isolated pipeline worktrees.
- The script already has access to `git rev-parse --show-toplevel`.

## Open Questions

_None — all requirements are derivable from the code and the issue report. Ready for handoff._
