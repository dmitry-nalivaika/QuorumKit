#!/usr/bin/env bash
# scripts/pipeline.sh
# Local Parallel Pipeline Manager for QuorumKit (FR-015 to FR-022, Issue #175).
#
# Usage:
#   pipeline.sh start <NNN> [--mode=isolated|shared]
#   pipeline.sh join  <NNN>
#   pipeline.sh stop  <NNN> [--no-switch]
#   pipeline.sh status
#
# Environment variables:
#   QUORUMKIT_PIPELINES_DIR  Override default worktree parent directory.
#                            Default: ../$(basename "$PWD")-NNN-slug/
#   QUORUMKIT_TEST_BRANCH_GUARD  Override branch-guard script path (for testing).
#
# Security:
#   All NNN arguments are validated as positive integers.
#   Mode is validated against the allowed enum.
#   All variables are double-quoted. No eval is used.

set -uo pipefail

# ─── Constants and helpers ───────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRANCH_GUARD="${QUORUMKIT_TEST_BRANCH_GUARD:-"$SCRIPT_DIR/branch-guard.sh"}"

log()  { echo "[pipeline] $*" >&2; }
err()  { echo "[pipeline] ERROR: $*" >&2; }

# Resolve branch slug for a given issue number.
# Tries, in order:
#   1. Existing local or remote branch matching NNN-*
#   2. gh issue title to derive slug
#   3. Falls back to NNN-feature
resolve_branch_slug() {
  local nnn="$1"
  local padded
  padded="$(printf '%03d' "$nnn")"

  # Check for existing branch
  local existing
  existing="$(git branch -a 2>/dev/null | sed 's|remotes/origin/||' | tr -d ' *' | grep "^${padded}-" | head -1 || true)"
  if [[ -n "$existing" ]]; then
    echo "$existing"
    return
  fi

  # Try gh CLI
  if command -v gh >/dev/null 2>&1; then
    local title slug
    title="$(gh issue view "$nnn" --json title --jq '.title' 2>/dev/null || echo "")"
    if [[ -n "$title" ]]; then
      # Slugify: lowercase, replace spaces/underscores with hyphens, strip non-alnum-hyphen
      slug="$(echo "$title" | tr '[:upper:]' '[:lower:]' | tr ' _' '-' | sed 's/[^a-z0-9-]//g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//' | cut -c1-40)"
      if [[ -n "$slug" ]]; then
        echo "${padded}-${slug}"
        return
      fi
    fi
  fi

  echo "${padded}-feature"
}

# Derive default worktree path for a given branch slug
default_worktree_path() {
  local branch_slug="$1"
  local repo_name
  repo_name="$(basename "$(pwd)")"
  local base_dir="${QUORUMKIT_PIPELINES_DIR:-"$(dirname "$(pwd)")/${repo_name}-${branch_slug}"}"
  # When QUORUMKIT_PIPELINES_DIR is set, append the branch slug
  if [[ -n "${QUORUMKIT_PIPELINES_DIR:-}" ]]; then
    echo "${QUORUMKIT_PIPELINES_DIR%/}/${branch_slug}"
  else
    echo "$(dirname "$(pwd)")/${repo_name}-${branch_slug}"
  fi
}

# Detect active shared pipeline: branch name matching NNN-* that is not a worktree
active_shared_pipeline() {
  local current
  current="$(git branch --show-current 2>/dev/null || echo "")"
  if [[ "$current" =~ ^[0-9]{3}-.+ ]]; then
    echo "$current"
  fi
}

# Post a GitHub Issue comment (non-fatal if gh unavailable)
post_comment() {
  local issue_number="$1" body="$2"
  if command -v gh >/dev/null 2>&1; then
    gh issue comment "$issue_number" --body "$body" 2>/dev/null || \
      log "Warning: could not post comment to issue #${issue_number}"
  else
    log "Warning: gh CLI not available — cannot post comment to issue #${issue_number}"
  fi
}

# ─── Argument parsing ─────────────────────────────────────────────────────────

SUBCOMMAND="${1:-}"
shift || true

usage() {
  cat >&2 << 'EOF'
Usage:
  pipeline.sh start <NNN> [--mode=isolated|shared]
  pipeline.sh join  <NNN>
  pipeline.sh stop  <NNN> [--no-switch]
  pipeline.sh status
EOF
}

if [[ -z "$SUBCOMMAND" ]]; then
  err "Subcommand required."
  usage
  exit 1
fi

# ─── Subcommand: start ───────────────────────────────────────────────────────

cmd_start() {
  local issue_raw="${1:-}"
  shift || true

  # Validate issue number
  if ! [[ "$issue_raw" =~ ^[0-9]+$ ]]; then
    err "Invalid issue number: '${issue_raw}' — must be a positive integer"
    exit 1
  fi
  local issue_number="$issue_raw"
  local padded
  padded="$(printf '%03d' "$issue_number")"

  # Parse --mode flag
  local mode="isolated"
  for arg in "$@"; do
    case "$arg" in
      --mode=isolated) mode="isolated" ;;
      --mode=shared)   mode="shared" ;;
      --mode=*)
        err "Invalid mode: '$arg' — must be --mode=isolated or --mode=shared"
        exit 1
        ;;
    esac
  done

  # Resolve branch slug
  local branch_slug
  branch_slug="$(resolve_branch_slug "$issue_number")"
  log "Resolved branch slug: ${branch_slug}"

  # ── Bug B guard: refuse if slug resolves to a protected branch ──────────────
  local slug_lower
  slug_lower="$(echo "$branch_slug" | tr '[:upper:]' '[:lower:]')"
  if [[ "$slug_lower" == "main" || "$slug_lower" == "master" || "$slug_lower" == "develop" || "$slug_lower" == "trunk" ]]; then
    err "ERROR: Refusing to create a pipeline on protected branch '${branch_slug}'."
    exit 1
  fi

  # ── Bug A guard: refuse if a pipeline for this issue already exists ──────────
  local padded_check
  padded_check="$(printf '%03d' "$issue_number")"
  # Check for an existing isolated worktree
  local existing_worktree
  existing_worktree="$(git worktree list 2>/dev/null | tail -n +2 | grep "\[${padded_check}-\|/${padded_check}-" | head -1 || true)"
  if [[ -n "$existing_worktree" ]]; then
    err "Pipeline already exists for issue #${issue_number} — use 'pipeline.sh join ${issue_number}' or 'pipeline.sh stop ${issue_number}' first."
    exit 1
  fi
  # Check for an existing shared pipeline on this exact branch
  local current_branch
  current_branch="$(git branch --show-current 2>/dev/null || echo "")"
  if [[ "$current_branch" == "$branch_slug" ]]; then
    err "Pipeline already exists for issue #${issue_number} — use 'pipeline.sh join ${issue_number}' or 'pipeline.sh stop ${issue_number}' first."
    exit 1
  fi

  # Check for existing shared pipeline conflict (FR-022)
  if [[ "$mode" == "shared" ]]; then
    local existing_shared
    existing_shared="$(active_shared_pipeline)"
    if [[ -n "$existing_shared" && "$existing_shared" != "$branch_slug" ]]; then
      log "WARNING: A shared pipeline for '${existing_shared}' is already active."
      log "Running two shared pipelines simultaneously may cause working-tree conflicts."
      log "Recommendation: use --mode=isolated instead."
      echo ""
      echo "WARNING: Shared pipeline '${existing_shared}' is already active." >&2
      echo "Recommendation: use --mode=isolated for parallel development." >&2
      echo ""
      # Prompt for confirmation if stdin is a terminal
      if [[ -t 0 ]]; then
        read -r -p "Continue with shared mode anyway? [y/N] " confirm
        if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
          log "Aborted by user."
          exit 1
        fi
      fi
      # In non-interactive mode (piped input), continue but warn
    fi
  fi

  local timestamp
  timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u +"%Y-%m-%dT%H:%M:%SZ")"

  if [[ "$mode" == "isolated" ]]; then
    local wt_path
    wt_path="$(default_worktree_path "$branch_slug")"

    # ── Bug B guard: worktree path must not equal the repo root ─────────────
    local repo_root_real
    repo_root_real="$(cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)" && pwd)"
    local wt_real
    wt_real="$(realpath "$wt_path" 2>/dev/null || echo "$wt_path")"
    if [[ "$wt_real" == "$repo_root_real" ]]; then
      err "ERROR: Resolved worktree path equals the repository root — cannot create pipeline at root."
      exit 1
    fi

    # Ensure branch exists on origin (branch-guard may checkout the branch in main;
    # we go back to main afterward so git worktree add can proceed — FR-014)
    bash "$BRANCH_GUARD" "$issue_number" "$branch_slug" 2>/dev/null || true
    git checkout main -q 2>/dev/null || git checkout "$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|origin/||')" -q 2>/dev/null || true

    if [[ -d "$wt_path" ]]; then
      log "Worktree already exists at ${wt_path} — use 'pipeline.sh join ${issue_number}' to attach."
      exit 0
    fi

    log "Creating worktree at ${wt_path}..."
    mkdir -p "$(dirname "$wt_path")"
    if git worktree add "$wt_path" "$branch_slug" -q 2>/dev/null; then
      log "Worktree created at ${wt_path}"
    else
      # Branch may not exist locally yet — create it
      git worktree add -b "$branch_slug" "$wt_path" "origin/main" -q 2>/dev/null || {
        err "Failed to create worktree at ${wt_path}"
        exit 1
      }
      git -C "$wt_path" push origin "$branch_slug" -q 2>/dev/null || true
    fi

    post_comment "$issue_number" "$(printf \
      '<!-- pipeline: started -->\n**Pipeline started** for issue #%s\n\n- **Mode:** isolated\n- **Branch:** `%s`\n- **Worktree path:** `%s`\n- **Timestamp:** %s\n\n_Use `scripts/pipeline.sh join %s` to attach to this pipeline._' \
      "$issue_number" "$branch_slug" "$wt_path" "$timestamp" "$issue_number")"
    log "Pipeline started (isolated) at ${wt_path}"
    echo ""
    echo "[pipeline] IMPORTANT: Open VS Code in the worktree to work on this feature:"
    echo "  code \"${wt_path}\""
    echo "  (Copilot agents operate relative to the VS Code workspace root — staying in the main"
    echo "   checkout means agents read/write the wrong branch.)"
    echo ""

  else
    # shared mode — checkout in current directory
    bash "$BRANCH_GUARD" "$issue_number" "$branch_slug" || {
      err "Branch guard failed for issue #${issue_number}"
      exit 1
    }
    # Ensure we are on the feature branch (branch-guard should have done this;
    # be explicit in case a stub or wrapper did not perform the checkout)
    local current_branch
    current_branch="$(git branch --show-current 2>/dev/null || echo "")"
    if [[ "$current_branch" != "$branch_slug" ]]; then
      git checkout "$branch_slug" -q 2>/dev/null || {
        err "Could not checkout branch '${branch_slug}'"
        exit 1
      }
    fi

    post_comment "$issue_number" "$(printf \
      '<!-- pipeline: started -->\n**Pipeline started** for issue #%s\n\n- **Mode:** shared\n- **Branch:** `%s`\n- **Working directory:** current repo\n- **Timestamp:** %s' \
      "$issue_number" "$branch_slug" "$timestamp")"
    log "Pipeline started (shared) on branch ${branch_slug}"
  fi
}

# ─── Subcommand: join ────────────────────────────────────────────────────────

cmd_join() {
  local issue_raw="${1:-}"

  if ! [[ "$issue_raw" =~ ^[0-9]+$ ]]; then
    err "Invalid issue number: '${issue_raw}' — must be a positive integer"
    exit 1
  fi
  local issue_number="$issue_raw"
  local padded
  padded="$(printf '%03d' "$issue_number")"

  # Search worktrees for NNN prefix
  local wt_line wt_path
  wt_line="$(git worktree list 2>/dev/null | grep "\[${padded}-\|/${padded}-" | head -1 || true)"
  if [[ -n "$wt_line" ]]; then
    wt_path="$(echo "$wt_line" | awk '{print $1}')"
    echo "Pipeline for issue #${issue_number} found at: ${wt_path}"
    log "Use 'cd ${wt_path}' to switch to the pipeline worktree."
    return 0
  fi

  # Check shared mode (current branch matches NNN-)
  local current
  current="$(git branch --show-current 2>/dev/null || echo "")"
  if [[ "$current" == "${padded}-"* ]]; then
    echo "Pipeline for issue #${issue_number} is running in shared mode on branch: ${current}"
    echo "Current directory: $(pwd)"
    return 0
  fi

  err "No active pipeline found for issue #${issue_number}"
  echo "Use 'pipeline.sh start ${issue_number}' to create one." >&2
  exit 1
}

# ─── Subcommand: stop ────────────────────────────────────────────────────────

cmd_stop() {
  local issue_raw="${1:-}"
  shift || true

  if ! [[ "$issue_raw" =~ ^[0-9]+$ ]]; then
    err "Invalid issue number: '${issue_raw}' — must be a positive integer"
    exit 1
  fi
  local issue_number="$issue_raw"
  local padded
  padded="$(printf '%03d' "$issue_number")"

  local no_switch=false
  for arg in "$@"; do
    [[ "$arg" == "--no-switch" ]] && no_switch=true
  done

  # Resolve branch slug
  local branch_slug
  branch_slug="$(resolve_branch_slug "$issue_number")"

  # Check for linked worktrees (isolated mode) — skip the main worktree (first line)
  local wt_line wt_path=""
  wt_line="$(git worktree list 2>/dev/null | tail -n +2 | grep "\[${padded}-\|/${padded}-" | head -1 || true)"
  if [[ -n "$wt_line" ]]; then
    wt_path="$(echo "$wt_line" | awk '{print $1}')"
    local final_sha=""
    final_sha="$(git -C "$wt_path" rev-parse --short HEAD 2>/dev/null || echo "unknown")"
    log "Removing worktree at ${wt_path}..."
    git worktree remove "$wt_path" 2>/dev/null || git worktree remove --force "$wt_path" 2>/dev/null || {
      err "Failed to remove worktree at ${wt_path}"
      exit 1
    }
    local timestamp
    timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    post_comment "$issue_number" "$(printf \
      '<!-- pipeline: stopped -->\n**Pipeline stopped** for issue #%s\n\n- **Mode:** isolated\n- **Branch:** `%s`\n- **Final commit:** `%s`\n- **Timestamp:** %s\n\n_Branch not deleted — run `gh pr merge` to close the branch after PR approval._' \
      "$issue_number" "$branch_slug" "$final_sha" "$timestamp")"
    log "Pipeline stopped. Worktree removed."
    return 0
  fi

  # Shared mode — check current branch
  local current
  current="$(git branch --show-current 2>/dev/null || echo "")"
  if [[ "$current" == "${padded}-"* ]]; then
    local final_sha=""
    final_sha="$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")"
    local timestamp
    timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

    if [[ "$no_switch" == "false" ]]; then
      if [[ -t 0 ]]; then
        read -r -p "Switch back to main? [Y/n] " confirm
        if [[ ! "$confirm" =~ ^[Nn]$ ]]; then
          git checkout main -q
          log "Switched back to main."
        fi
      else
        log "Non-interactive mode: staying on ${current}. Use --no-switch to suppress this message."
      fi
    fi

    post_comment "$issue_number" "$(printf \
      '<!-- pipeline: stopped -->\n**Pipeline stopped** for issue #%s\n\n- **Mode:** shared\n- **Branch:** `%s`\n- **Final commit:** `%s`\n- **Timestamp:** %s\n\n_Branch not deleted — run `gh pr merge` to close the branch after PR approval._' \
      "$issue_number" "$branch_slug" "$final_sha" "$timestamp")"
    log "Pipeline stopped."
    return 0
  fi

  err "No active pipeline found for issue #${issue_number}"
  exit 1
}

# ─── Subcommand: status ──────────────────────────────────────────────────────

cmd_status() {
  local worktrees
  worktrees="$(git worktree list 2>/dev/null || true)"

  # Filter to linked worktrees (skip main — first line) with NNN- branch pattern
  local pipeline_lines
  pipeline_lines="$(echo "$worktrees" | tail -n +2 | grep -E '\[[0-9]{3}-[a-z0-9-]+\]' 2>/dev/null || true)"

  # Also check if current branch in main worktree is a pipeline
  local current_branch
  current_branch="$(git branch --show-current 2>/dev/null || echo "")"
  local shared_pipeline=""
  if [[ "$current_branch" =~ ^[0-9]{3}-.+ ]]; then
    shared_pipeline="$current_branch"
  fi

  if [[ -z "$pipeline_lines" && -z "$shared_pipeline" ]]; then
    echo "No active pipelines."
    return 0
  fi

  # Print table header
  printf "\n%-8s  %-40s  %-12s  %s\n" "ISSUE" "BRANCH" "MODE" "PATH"
  printf "%-8s  %-40s  %-12s  %s\n" "--------" "----------------------------------------" "------------" "--------------------------------------"

  # Print isolated pipeline rows
  if [[ -n "$pipeline_lines" ]]; then
    while IFS= read -r line; do
      local wt_path branch_field issue_num
      wt_path="$(echo "$line" | awk '{print $1}')"
      branch_field="$(echo "$line" | grep -o '\[[a-z0-9-]*\]' | tr -d '[]')"
      issue_num="${branch_field:0:3}"

      # Try to get latest apm-msg status from GitHub (non-fatal if unavailable)
      local gh_status="unknown"
      if command -v gh >/dev/null 2>&1; then
        gh_status="$(gh issue view "$((10#$issue_num))" --json comments \
          --jq '[.comments[].body | select(test("apm-msg")) | split("\n") | .[] | select(test("outcome"))] | last // "unknown"' \
          2>/dev/null | head -1 | sed 's/.*"outcome":[[:space:]]*"\([^"]*\)".*/\1/' || echo "unknown")"
      fi

      printf "%-8s  %-40s  %-12s  %s\n" "#${issue_num}" "$branch_field" "isolated" "$wt_path"
    done <<< "$pipeline_lines"
  fi

  # Print shared pipeline row
  if [[ -n "$shared_pipeline" ]]; then
    local issue_num="${shared_pipeline:0:3}"
    printf "%-8s  %-40s  %-12s  %s\n" "#${issue_num}" "$shared_pipeline" "shared" "$(pwd)"
  fi

  echo ""
}

# ─── Dispatch ────────────────────────────────────────────────────────────────

case "$SUBCOMMAND" in
  start)  cmd_start "$@" ;;
  join)   cmd_join "$@" ;;
  stop)   cmd_stop "$@" ;;
  status) cmd_status ;;
  *)
    err "Unknown subcommand: '${SUBCOMMAND}'"
    usage
    exit 1
    ;;
esac
