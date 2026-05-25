# ADR-175: Local Parallel Development Pipelines — git worktree Isolation Model

| Field | Value |
|---|---|
| **ADR Number** | 175 |
| **Issue** | #175 — Comprehensive Agent Consistency & Parallel Local Pipelines |
| **Status** | Proposed |
| **Date** | 2026-05-25 |
| **Deciders** | Architect Agent |
| **Supersedes** | — |
| **Related** | ADR-002 (state storage), ADR-004 (state comment model), ADR-007 (GHA substrate contract) |

---

## Context

Spec #175 introduces the concept of **local development pipelines** — the ability for
a developer to work on multiple QuorumKit features simultaneously in a local VS Code
environment, with each feature running in an isolated working directory so that
concurrent agent file operations do not conflict.

Two working modes are required:

- **Isolated mode**: each feature pipeline has its own working directory on its own
  branch; editing files for feature A cannot affect feature B's working tree.
- **Shared mode**: multiple agent sessions work on the same feature inside the same
  local repository clone (the current default behaviour).

This requirement introduces a new local filesystem convention, changes the assumed
developer invocation model from "single local clone" to "potentially many worktrees",
and touches `scripts/`, agent definition files, and the Orchestrator interface
(`pipeline_id` / `worktree_path` context fields, FR-023). These are irreversible
changes once published in a released version of the package, which triggers the ADR
requirement under Constitution §VII and the Architect Agent's "When an ADR is Required"
rules.

Three candidate approaches were evaluated: `git worktree`, separate full clones, and
a local coordination daemon with a shared state file.

---

## Decision

**Local parallel development pipelines are implemented as `git worktree` instances,
one worktree per NNN-slug feature, managed by a new `scripts/pipeline.sh` lifecycle
script. All pipeline state is stored in GitHub Issue comments. No local state files
are written.**

### Worktree naming and location

```
${QUORUMKIT_PIPELINES_DIR:-../$(basename "$PWD")-NNN-slug}/
```

- Default: a sibling directory of the main repo clone, named
  `<repo-name>-NNN-slug/` (e.g. `../QuorumKit-175-agents-review/`).
- Override: `QUORUMKIT_PIPELINES_DIR` environment variable (user-scoped; not
  committed to the repo).
- **The NNN prefix is mandatory** — directory names that do not start with the
  zero-padded issue number are not a valid pipeline. This preserves Constitution
  Principle II (NNN Traceability) in the local environment.

### Lifecycle script

`scripts/pipeline.sh` exposes four subcommands:

| Subcommand | Effect |
|---|---|
| `start <NNN> [--mode=isolated\|shared]` | Create worktree + checkout branch (isolated), or checkout branch in place (shared). Post `pipeline-started` GitHub comment. Default: `--mode=isolated`. |
| `join <NNN>` | Locate existing pipeline worktree; print path. Does NOT create a second worktree. |
| `stop <NNN>` | Remove worktree (isolated) / offer branch switch (shared). Post `pipeline-stopped` GitHub comment with final commit SHA. Does NOT delete the remote branch. |
| `status` | Enumerate local worktrees via `git worktree list`; join with latest `apm-msg` status from each issue's GitHub comments. Degrades gracefully when GitHub is unreachable. |

### State model

Pipeline state (mode, worktree path, current agent step, timestamps) is stored
exclusively as structured JSON comments on the GitHub Issue — the same mechanism
already used by the Orchestrator (ADR-004). The local machine is stateless; all
derived state comes from reading GitHub. This is a direct extension of Constitution
Principle VIII and ADR-004's guarantee.

### Branch Guard

A shared `scripts/branch-guard.sh` script encapsulates the branch
validate-or-create logic for all agents. It is worktree-aware: when called from
inside a worktree it operates on that worktree's path and never touches the main
checkout. All write-capable agents (BA, Developer, Architect) invoke it before any
file operation.

### Orchestrator interface extension

The Orchestrator accepts two optional context fields (`pipeline_id`,
`worktree_path`) and passes them through to agents so agents can correctly resolve
their working directory. Cloud/CI (GitHub Actions) runners always omit these fields
and are unaffected — they remain single-checkout, ephemeral environments.

---

## Rationale

### Why git worktree over separate full clones

`git worktree` is the purpose-built git primitive for exactly this use case. Each
worktree has its own independent working directory and index but shares the object
store with the main clone, which means:

- No duplication of the `.git` object store (relevant for repos with large history)
- `git fetch` in the main clone propagates to all worktrees automatically
- Worktree creation is fast (no network round-trip after initial clone)
- `git worktree remove` cleanly deallocates without leaving orphaned `.git` directories

Separate full clones would work but consume twice the disk space, require separate
`git fetch` invocations per clone, and provide no mechanism to prevent accidental
`git checkout` of the same branch in two independent clones (which git worktree
prevents by design).

### Why no local coordination daemon / state file

A local daemon or state file that sequences agent steps outside GitHub Actions would
directly violate **Constitution Principle VIII** ("The Orchestrator is the sole
component permitted to sequence, trigger, and coordinate agents"). The `pipeline.sh`
script is intentionally scoped to workspace isolation (creating / removing worktrees)
and audit posting (GitHub comments). It does not sequence agents, maintain a job
queue, or track intermediate step results — that is the Orchestrator's exclusive
domain.

### Why sibling-directory default over `~/.quorumkit/pipelines/`

The sibling-directory default (`../$(basename "$PWD")-NNN-slug/`) keeps pipelines
immediately discoverable alongside the main clone without requiring home-directory
setup or documentation of a tool-specific directory convention. A developer running
`ls ..` sees all active pipelines at a glance. The `QUORUMKIT_PIPELINES_DIR` override
accommodates the `~/.quorumkit/pipelines/` layout for developers who prefer it.

### Constitution alignment

| Principle | How this decision satisfies it |
|---|---|
| I — Agent-First Design | `branch-guard.sh` and `pipeline.sh` are agent-callable scripts with deterministic inputs/outputs |
| II — NNN Traceability | Worktree path enforces NNN prefix; `pipeline_id` = NNN propagated through `apm-msg` v2 |
| V — Zero-Config Defaults | Default worktree root requires no configuration; `QUORUMKIT_PIPELINES_DIR` is optional |
| VI — Observable, Auditable | All lifecycle events (`pipeline-started`, `pipeline-stopped`) posted as GitHub comments |
| VII — Simplicity / YAGNI | `git worktree` is a native git feature; no new external dependency introduced |
| VIII — Orchestrator as Single Control Plane | `pipeline.sh` is isolation-only; it never sequences agents or maintains a local task queue |

---

## Consequences

**Positive**:
- Developers can run two or more feature pipelines simultaneously with zero
  working-tree conflicts.
- `git worktree` is a native git feature — no new runtime dependency.
- All pipeline state remains in GitHub; losing the local machine loses no information.
- Cloud/CI behaviour is completely unchanged.

**Negative**:
- Developers must have Git ≥ 2.5 (worktree support). This is already assumed in the
  `dev-setup.sh` prerequisites; the constraint is not new.
- Some git operations behave differently in worktrees: `git stash` is per-worktree;
  git hooks fire per-worktree; submodules may require re-initialisation in each
  worktree. Agent definitions must document this.
- The `basename "$PWD"` default path formula breaks if the repo root directory has
  been renamed since cloning. Mitigation: `QUORUMKIT_PIPELINES_DIR` override is
  always available.

**Risks**:

| Risk | Likelihood | Mitigation |
|---|---|---|
| speckit scripts use repo-root-relative paths and fail in worktree mode | Medium | Integration test: run `speckit.specify`, `branch-guard.sh`, and `pipeline.sh start` from a worktree path; fix any path assumptions before merge |
| Developer checks out the same branch in two worktrees | Low | `git worktree add` fails with a clear error if the branch is already checked out elsewhere; `pipeline.sh` surfaces this error and recommends `pipeline join <NNN>` |
| `QUORUMKIT_PIPELINES_DIR` set to a path inside the repo | Low | `pipeline.sh` must validate that the target path is not inside the main repo's working tree to avoid nested git repository confusion |
| `pipeline_id` / `worktree_path` added to Orchestrator context breaks v1 pipelines | Low | Fields are optional; v1 pipelines that omit them continue to work unchanged (FR-023 uses `null` defaults) |

---

## Alternatives Considered

| Option | Pro | Con | Rejected Because |
|---|---|---|---|
| **Separate full clones** | Simple mental model; complete isolation including `.git` | 2× disk space; separate fetch per clone; no git-level protection against same-branch double-checkout | `git worktree` provides identical working-tree isolation with lower overhead and built-in branch exclusivity |
| **Local coordination daemon** | Could offer richer pipeline scheduling | Violates Constitution Principle VIII; introduces a second control plane alongside the Orchestrator; local state can diverge from GitHub state | Hard violation of the constitution's single-control-plane rule |
| **`~/.quorumkit/pipelines/` as fixed default** | Predictable, tool-specific location | Requires documenting a home-directory convention; not discoverable without knowing the path | Sibling-directory default is more immediately discoverable; `QUORUMKIT_PIPELINES_DIR` provides the same layout for those who prefer it |
| **Status quo (single clone, branch switching)** | No new complexity | Cannot run two features in parallel; switching branches loses working-directory context for the previous feature | Does not satisfy the core requirement of simultaneous parallel local pipelines |
