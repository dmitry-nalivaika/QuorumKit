# Local Parallel Pipelines

Run multiple features simultaneously in fully isolated Git worktrees — no
stash, no branch juggling, no risk of accidentally editing the wrong feature.

Two scripts implement this capability:

| Script | Purpose |
|--------|---------|
| `scripts/pipeline.sh` | Lifecycle manager: `start`, `join`, `stop`, `status` |
| `scripts/branch-guard.sh` | Idempotent branch create/checkout, called internally by `pipeline.sh` |

---

## How it works

GitHub Actions drives *remote* agent pipelines. Local pipelines complement them
by letting you work on multiple features at the same time on your local machine.

In **isolated mode** (the default), each pipeline gets its own
[Git worktree](https://git-scm.com/docs/git-worktree) — a separate directory
on disk that shares the same repository object store but has an independent
working tree and branch. Editing files in one pipeline never affects another.

In **shared mode**, the branch is checked out in the current working tree, which
is the classic single-clone approach. Use this only when your tooling cannot
follow you across directories.

Every lifecycle event (`start`, `stop`) posts a structured comment on the
corresponding GitHub Issue so the Orchestrator audit trail stays consistent with
your local work.

---

## Prerequisites

```zsh
# Install the GitHub CLI (used to derive branch slugs and post lifecycle comments)
brew install gh

# Authenticate — required before running any pipeline command
gh auth login

# Git ≥ 2.5 is required for worktree support
git --version
```

The scripts are executable after running `scripts/init.sh`. If you cloned
manually, make them executable once:

```zsh
chmod +x scripts/branch-guard.sh scripts/pipeline.sh
```

---

## Quick start

```zsh
# Start an isolated pipeline for issue #42
./scripts/pipeline.sh start 42
# [pipeline] Resolved branch slug: 042-add-login-page
# [pipeline] Creating worktree at ../MyApp-042-add-login-page...
# [pipeline] Pipeline started (isolated) at ../MyApp-042-add-login-page
#
# IMPORTANT: Open VS Code in the worktree to work on this feature:
#   code "../MyApp-042-add-login-page"

# In a second terminal — start a concurrent feature while #42 is still running
./scripts/pipeline.sh start 99
# [pipeline] Resolved branch slug: 099-refactor-db-layer
# [pipeline] Creating worktree at ../MyApp-099-refactor-db-layer...

# Check what is currently running
./scripts/pipeline.sh status

# Locate the worktree for issue #42 (e.g. to open a new terminal there)
./scripts/pipeline.sh join 42

# Finish feature #42 — push, open a PR, remove the worktree
git -C ../MyApp-042-add-login-page push origin 042-add-login-page
gh pr create --fill --repo <owner>/<repo>
./scripts/pipeline.sh stop 42
```

---

## `pipeline.sh` command reference

### `start <NNN> [--mode=isolated|shared]`

Creates a feature branch and, in isolated mode, a dedicated Git worktree for
issue `NNN`.

```zsh
./scripts/pipeline.sh start 42                   # isolated (default)
./scripts/pipeline.sh start 42 --mode=isolated   # explicit isolated
./scripts/pipeline.sh start 42 --mode=shared     # shared working tree
```

**Isolated mode** (default):

- Derives a zero-padded branch slug from the GitHub Issue title, e.g.
  `042-add-login-page`. Falls back to `042-feature` if the `gh` CLI is
  unavailable.
- Creates a Git worktree at `../<repo-name>-<slug>/`
  (e.g. `../MyApp-042-add-login-page/`).
- Prints instructions to open VS Code in the new worktree directory. Agents
  must run inside the worktree; opening the main clone in VS Code causes agents
  to read and write the wrong branch.
- If `QUORUMKIT_PIPELINES_DIR` is set, worktrees are created at
  `$QUORUMKIT_PIPELINES_DIR/<slug>/` instead.

**Shared mode**:

- Checks out the branch in the current working tree.
- Warns and prompts for confirmation if another shared pipeline is already
  active, because two shared pipelines in the same directory will conflict.

**Safety guards**:

- Refuses to start a second pipeline for an issue that already has one. Use
  `join <NNN>` or `stop <NNN>` first.
- Refuses to create a pipeline on a protected branch (`main`, `master`,
  `develop`, `trunk`).

Posts a `<!-- pipeline: started -->` comment on GitHub Issue `#NNN`.

---

### `join <NNN>`

Locates the worktree for an existing pipeline and prints its path.

```zsh
./scripts/pipeline.sh join 42
# Pipeline for issue #42 found at: /Users/you/Projects/MyApp-042-add-login-page
# Use 'cd /Users/you/Projects/MyApp-042-add-login-page' to switch to the pipeline worktree.
```

`join` does not change your current directory — it tells you where the worktree
is so you can `cd` or open a new terminal there. For shared-mode pipelines, it
confirms the current branch name and working directory.

---

### `stop <NNN> [--no-switch]`

Removes the worktree for issue `NNN` and cleans up.

```zsh
./scripts/pipeline.sh stop 42             # removes worktree, offers to switch to main
./scripts/pipeline.sh stop 42 --no-switch # removes worktree, stays in current directory
```

- **Isolated mode**: removes the worktree directory with `git worktree remove`.
- **Shared mode**: optionally switches back to `main` (prompts interactively;
  defaults to yes).
- Does **not** delete the remote branch. Merge or delete the branch from GitHub
  after the PR is approved.

Posts a `<!-- pipeline: stopped -->` comment on GitHub Issue `#NNN` with the
final commit SHA.

---

### `status`

Lists all active local pipelines by querying `git worktree list`.

```zsh
./scripts/pipeline.sh status
```

Example output:

```
Active QuorumKit pipelines:
  #42   042-add-login-page      /Users/you/Projects/MyApp-042-add-login-page
  #99   099-refactor-db-layer   /Users/you/Projects/MyApp-099-refactor-db-layer
```

---

## `branch-guard.sh` reference

`pipeline.sh` calls `branch-guard.sh` automatically. You can also invoke it
directly from agent workflows when you need precise branch control.

```zsh
./scripts/branch-guard.sh <issue_number> <branch_slug> [worktree_path]
```

| Argument | Required | Description |
|----------|----------|-------------|
| `issue_number` | yes | GitHub issue number (positive integer, e.g. `42`) |
| `branch_slug` | yes | Zero-padded kebab-case slug, e.g. `042-add-login-page` |
| `worktree_path` | no | Absolute path to an existing worktree. All git operations run inside it when provided. |

**What it does:**

1. Fetches `origin` to ensure remote refs are current.
2. If the branch exists remotely → checks it out locally.
3. If the branch exists locally only → uses it as-is.
4. Otherwise → creates a new branch from `origin/main`.
5. Verifies the current branch name matches `branch_slug`. On mismatch, posts
   an error comment on the GitHub Issue and exits non-zero.

**Idempotent**: running it twice on the same branch is safe.

**Exit codes**: `0` — branch verified and checked out; `1` — validation error,
git error, or branch mismatch.

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `QUORUMKIT_PIPELINES_DIR` | *(unset)* — worktrees go at `../<repo-name>-<slug>/` | Override the parent directory for all worktrees. When set, worktrees are created at `$QUORUMKIT_PIPELINES_DIR/<slug>/`. |
| `QUORUMKIT_TEST_BRANCH_GUARD` | *(unset)* | Override path to `branch-guard.sh`. Used by tests to inject a stub. |

---

## Parallel workflow walkthrough

This example shows two features developed simultaneously on the same machine.

### Step 1 — Start both pipelines (from the main clone)

```zsh
cd ~/Projects/MyApp

# Feature #10
./scripts/pipeline.sh start 10
# [pipeline] Resolved branch slug: 010-search-autocomplete
# [pipeline] Creating worktree at ../MyApp-010-search-autocomplete...
# [pipeline] Pipeline started (isolated) at ../MyApp-010-search-autocomplete
#
# IMPORTANT: Open VS Code in the worktree to work on this feature:
#   code "../MyApp-010-search-autocomplete"

# Feature #11 — runs completely independently
./scripts/pipeline.sh start 11
# [pipeline] Resolved branch slug: 011-fix-pagination
# [pipeline] Creating worktree at ../MyApp-011-fix-pagination...
# [pipeline] Pipeline started (isolated) at ../MyApp-011-fix-pagination
#
# IMPORTANT: Open VS Code in the worktree to work on this feature:
#   code "../MyApp-011-fix-pagination"
```

### Step 2 — Work on each feature in its own VS Code window

Open two VS Code windows:

```zsh
code ~/Projects/MyApp-010-search-autocomplete
code ~/Projects/MyApp-011-fix-pagination
```

Each window is a fully independent worktree. Agent file operations in one
window cannot affect the other.

### Step 3 — Check on both pipelines

```zsh
# From the main clone (or either worktree):
./scripts/pipeline.sh status
# Active QuorumKit pipelines:
#   #10   010-search-autocomplete   /Users/you/Projects/MyApp-010-search-autocomplete
#   #11   011-fix-pagination        /Users/you/Projects/MyApp-011-fix-pagination

# Locate pipeline #10 if you need to open a terminal there:
./scripts/pipeline.sh join 10
# Pipeline for issue #10 found at: /Users/you/Projects/MyApp-010-search-autocomplete
```

### Step 4 — Finish feature #10

```zsh
# From the MyApp-010-search-autocomplete worktree (or using -C):
git -C ~/Projects/MyApp-010-search-autocomplete push origin 010-search-autocomplete

# Open a pull request
gh pr create --fill --repo <owner>/MyApp

# Remove the worktree (branch is NOT deleted from origin)
./scripts/pipeline.sh stop 10
# [pipeline] Pipeline stopped. Worktree removed.
# Posts <!-- pipeline: stopped --> comment on Issue #10
```

---

## Managing pipelines from the dashboard

The dashboard provides a browser UI for all four pipeline operations, so you can
manage local pipelines without a terminal. Open it at `http://localhost:3131`
(requires the dashboard server: `cd engine/dashboard && node server.js`).

### Pipelines tab

Click the **🌿 Pipelines** tab in the dashboard to see the **Local feature
worktrees** panel. It lists every active pipeline with its branch name, worktree
path, and mode. Use the **↺** button to refresh the list after external changes.

### Starting a pipeline

1. Click **＋ Start** in the Pipelines panel.
2. In the modal, enter the **issue number** (required). The server derives the
   branch slug from the GitHub Issue title automatically — enter a custom slug
   only if you want to override it.
3. Select **Mode**: `isolated` (recommended) or `shared`.
4. Click **▶ Start**. The panel updates and a new row appears when the worktree
   is ready.

The dashboard server calls `scripts/pipeline.sh start` on your behalf, so the
same branch naming, worktree creation, and GitHub Issue comment behaviour
described in the CLI reference above applies.

### Stopping a pipeline

Each pipeline row has a **Stop** button. Clicking it calls `pipeline.sh stop
<NNN> --no-switch` and removes the row from the list. The remote branch is not
deleted.

### Locating a worktree (join)

Click the **⎇ Join** button on a pipeline row to open a modal showing the
worktree's absolute path. Copy the path to open a new terminal there or pass it
to `code "<path>"` to open a VS Code window.

> The dashboard cannot change your shell's working directory — it can only tell
> you where the worktree is.

---

## Integration with the Orchestrator

When a remote GitHub Actions pipeline invokes an agent, it forwards two
additional inputs to `workflow_dispatch` (FR-023):

| Input | Description |
|-------|-------------|
| `pipeline_id` | Issue number of the originating pipeline |
| `worktree_path` | Absolute path to the local worktree, if the trigger set one |

Agents read these inputs to operate in the correct worktree and keep local and
remote state in sync. See [PIPELINES.md](PIPELINES.md) for the full
`workflow_dispatch` input schema.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `ERROR: '${ISSUE_NUMBER}' — must be a positive integer` | Issue number passed as `#42` | Pass a bare integer: `42`, not `#42` |
| `Invalid branch slug … must match [a-z0-9][a-z0-9-]*` | Uppercase or special characters in slug | Use only lowercase letters, digits, and hyphens |
| `Pipeline already exists for issue #NNN` | A worktree or shared branch for this issue is still active | Run `pipeline.sh join NNN` to attach, or `pipeline.sh stop NNN` to clean up first |
| `Refusing to create a pipeline on protected branch` | Branch slug resolved to `main`, `master`, `develop`, or `trunk` | Verify the GitHub Issue title does not contain those words, or pass a custom slug |
| `git worktree add` fails — branch already checked out | The branch is checked out in another worktree | Run `pipeline.sh stop NNN` to remove the stale worktree entry |
| `gh: command not found` | GitHub CLI not installed | `brew install gh && gh auth login` |
| Worktree directory missing after `pipeline.sh start` | Parent directory of the worktree path is not writable | Check write permissions on the directory above your repo, or set `QUORUMKIT_PIPELINES_DIR` to a writable path |
| Agents read/write files on `main` instead of the feature branch | VS Code is open in the main clone, not the worktree | Open VS Code with `code "<worktree_path>"` as printed by `pipeline.sh start` |

---

## Known limitations

- `pipeline.sh join` prints the worktree path but does not change your shell's
  working directory. Copy the printed path and `cd` to it, or open it in a new
  terminal.
- `pipeline.sh status` derives pipeline state from local `git worktree list`.
  Worktrees created outside of `pipeline.sh` (e.g. manually) appear in the list
  without a `#NNN` prefix and are not recognised as QuorumKit pipelines.
- In non-interactive environments (CI, piped input), `pipeline.sh stop` in
  shared mode stays on the current branch instead of switching to `main`.

---

## Related topics

- [PIPELINES.md](PIPELINES.md) — Remote orchestrated pipelines via GitHub Actions
- [BROWNFIELD_GUIDE.md](BROWNFIELD_GUIDE.md) — Adopting QuorumKit in an existing repository
- [AGENT_PROTOCOL.md](AGENT_PROTOCOL.md) — `apm-msg` schema and agent footprint formats
- [ADR-175](architecture/adr-175-local-parallel-pipeline-worktree-model.md) — Design rationale for the worktree isolation model
