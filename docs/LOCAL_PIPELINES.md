# Local Parallel Pipelines

> Run multiple features simultaneously in fully isolated Git worktrees — no
> stash, no branch juggling, no "oops I was on main" accidents.

This guide covers the two new scripts added in issue #175:

| Script | Purpose |
|--------|---------|
| `scripts/branch-guard.sh` | Idempotent branch create/checkout with GitHub error reporting |
| `scripts/pipeline.sh` | Local parallel pipeline manager (start / join / stop / status) |

---

## Why local pipelines?

GitHub Actions drives *remote* agent pipelines. Local pipelines let you:

- Work on **feature A** and **feature B** simultaneously without interfering
- Give each pipeline its own **clean Git worktree** (isolated mode) so agents
  never touch each other's working directories
- Switch between features instantly with `pipeline.sh join <NNN>`
- Keep full traceability — every lifecycle event posts a comment on the GitHub
  issue so the orchestrator audit trail stays consistent

---

## Prerequisites

```zsh
# Required
brew install gh        # GitHub CLI — used to post lifecycle comments
git --version          # Git ≥ 2.5 for worktree support

# Make the scripts executable (one-time, already done after init.sh)
chmod +x scripts/branch-guard.sh scripts/pipeline.sh
```

You must be authenticated with the GitHub CLI:

```zsh
gh auth login
```

---

## Quick Start — 30 seconds

```zsh
# Start a new isolated pipeline for issue #42
./scripts/pipeline.sh start 42

# Start a second feature in parallel (while first is still running)
./scripts/pipeline.sh start 99 --mode=isolated

# Check what's running
./scripts/pipeline.sh status

# Switch back to issue #42
./scripts/pipeline.sh join 42

# Stop and clean up issue #42's worktree
./scripts/pipeline.sh stop 42
```

---

## `pipeline.sh` Command Reference

### `start <NNN> [--mode=isolated|shared]`

Creates a feature branch and (in isolated mode) a dedicated Git worktree for
issue `NNN`, then switches your shell into it.

```zsh
./scripts/pipeline.sh start 42              # default: isolated
./scripts/pipeline.sh start 42 --mode=isolated   # explicit isolated
./scripts/pipeline.sh start 42 --mode=shared     # shared working tree
```

**Isolated mode** (default):
- Creates a Git worktree at `$QUORUMKIT_PIPELINES_DIR/<NNN>-<slug>/`
  (default dir: `../quorumkit-pipelines/`)
- Each feature lives in its own directory — you can open multiple terminals
- `cd` into the worktree automatically

**Shared mode**:
- Checks out the branch in the *current* working tree (classic behaviour)
- Useful when the tooling cannot follow you across directories

Posts an `agent-start` lifecycle comment on GitHub Issue `#NNN`.

### `join <NNN>`

Switches your working directory to the worktree for issue `NNN`.

```zsh
./scripts/pipeline.sh join 42
```

Prints the `cd` command and the branch name. If the pipeline was started in
shared mode, simply checks out the branch.

### `stop <NNN> [--no-switch]`

Removes the worktree for issue `NNN` and optionally returns to `main`.

```zsh
./scripts/pipeline.sh stop 42             # cleans up, switches to main
./scripts/pipeline.sh stop 42 --no-switch # cleans up, stays in current dir
```

Posts an `agent-complete` lifecycle comment on GitHub Issue `#NNN`.

### `status`

Lists all active local pipelines.

```zsh
./scripts/pipeline.sh status
```

Example output:

```
Active QuorumKit pipelines:
  #42   42-add-login-page         /home/user/../pipelines/42-add-login-page
  #99   99-refactor-db-layer      /home/user/../pipelines/99-refactor-db-layer
```

---

## `branch-guard.sh` Reference

`branch-guard.sh` is called internally by `pipeline.sh`, but you can also
call it directly from any agent workflow.

```zsh
./scripts/branch-guard.sh <issue_number> <branch-slug> [worktree_path]
```

| Argument | Required | Description |
|----------|----------|-------------|
| `issue_number` | yes | GitHub issue number (integer) |
| `branch-slug` | yes | lowercase kebab-case slug, e.g. `42-add-login-page` |
| `worktree_path` | no | Path to an existing worktree; operations run there if provided |

**What it does (FR-011):**

1. `git fetch origin` — ensures the remote is up to date
2. If the branch exists remotely → `git checkout <slug>`
3. If the branch exists locally but not remotely → use it as-is
4. Otherwise → `git checkout -b <slug> origin/main`
5. Verifies the current branch name matches; posts an error comment on the
   issue via `gh` if something is wrong and exits non-zero

**Idempotent**: calling it twice on the same branch is safe.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `QUORUMKIT_PIPELINES_DIR` | `../quorumkit-pipelines` | Directory where worktrees are created |
| `QUORUMKIT_TEST_BRANCH_GUARD` | *(unset)* | Override path to `branch-guard.sh` in tests |

---

## Parallel feature walkthrough

Here is a concrete end-to-end example with two features running simultaneously.

### Terminal 1 — feature #10 (isolated)

```zsh
cd ~/Projects/myapp

./scripts/pipeline.sh start 10
# ✅ Branch 10-search-autocomplete created
# ✅ Worktree ready at ../quorumkit-pipelines/10-search-autocomplete
# ✅ Switched to pipeline #10
# 📝 Posted agent-start comment on Issue #10

# … do your work here …
```

### Terminal 2 — feature #11 (isolated, simultaneous)

```zsh
cd ~/Projects/myapp   # same repo, separate terminal

./scripts/pipeline.sh start 11
# ✅ Branch 11-fix-pagination created
# ✅ Worktree ready at ../quorumkit-pipelines/11-fix-pagination
# ✅ Switched to pipeline #11
# 📝 Posted agent-start comment on Issue #11

# … do your work here, completely isolated from #10 …
```

### Switching between pipelines

```zsh
# From anywhere in the repo, jump to pipeline #10
./scripts/pipeline.sh join 10

# Jump to pipeline #11
./scripts/pipeline.sh join 11

# See everything at once
./scripts/pipeline.sh status
```

### Finishing up

```zsh
# Done with feature #10 — push, open PR, clean up worktree
git push origin 10-search-autocomplete
gh pr create --fill
./scripts/pipeline.sh stop 10
# 📝 Posted agent-complete comment on Issue #10
```

---

## Integration with the Orchestrator

When a remote GitHub Actions pipeline invokes an agent, it now forwards two
extra inputs to `workflow_dispatch` (FR-023):

| Input | Description |
|-------|-------------|
| `pipeline_id` | Issue number of the originating pipeline |
| `worktree_path` | Path to the local worktree (if set by the trigger) |

Agents can read these inputs to operate in the correct worktree directory and
keep local + remote state in sync.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `branch-guard.sh: issue_number must be a positive integer` | Pass a bare number: `42`, not `#42` |
| `branch-guard.sh: branch-slug must match ^[a-z0-9][a-z0-9-]*$` | Use lowercase letters, digits, and hyphens only |
| `git worktree add` fails — branch already checked out | Run `pipeline.sh stop <NNN>` first to remove the stale worktree |
| `gh` command not found | Install GitHub CLI: `brew install gh && gh auth login` |
| Worktree directory missing after `pipeline.sh start` | Check `$QUORUMKIT_PIPELINES_DIR` — the parent directory must be writable |

---

## See also

- [PIPELINES.md](PIPELINES.md) — Remote orchestrated pipelines (GitHub Actions)
- [BROWNFIELD_GUIDE.md](BROWNFIELD_GUIDE.md) — Adopting QuorumKit in existing projects
- [docs/AGENT_PROTOCOL.md](AGENT_PROTOCOL.md) — apm-msg schema, agent footprint formats
- [ADR-175](architecture/adr-175-local-parallel-pipeline-worktree-model.md) — Design decisions for this feature
