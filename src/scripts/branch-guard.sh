#!/usr/bin/env bash
# scripts/branch-guard.sh
# Reusable Branch Guard for all QuorumKit agents (FR-010 to FR-014, Issue #175).
#
# Usage:
#   scripts/branch-guard.sh <issue_number> <branch_slug> [worktree_path]
#
# Arguments:
#   issue_number  GitHub Issue number (positive integer, e.g. 42)
#   branch_slug   Feature branch name (e.g. 042-user-auth); must match [a-z0-9][a-z0-9-]*
#   worktree_path Optional absolute path to a git worktree. When supplied the
#                 script operates entirely within that path and never touches the
#                 main checkout.
#
# Exit codes:
#   0  Branch is verified and checked out
#   1  Validation error, git error, or branch mismatch
#
# Security:
#   issue_number is validated as a positive integer.
#   branch_slug is validated against [a-z0-9][a-z0-9-]* (no shell injection).
#   All variables are double-quoted throughout.
#   No eval is used.

set -euo pipefail

# ─── Helpers ─────────────────────────────────────────────────────────────────

log()  { echo "[branch-guard] $*" >&2; }
err()  { echo "[branch-guard] ERROR: $*" >&2; }

post_error_comment() {
  local issue_number="$1" message="$2"
  if command -v gh >/dev/null 2>&1; then
    gh issue comment "$issue_number" --body "$(printf \
      '<!-- agent-footprint: fail -->\n**Branch Guard error** on issue #%s\n\n%s\n\nPlease run `scripts/branch-guard.sh %s <branch_slug>` again after resolving the conflict.' \
      "$issue_number" "$message" "$issue_number")" 2>/dev/null || \
      log "Warning: could not post error comment to issue #${issue_number} (gh auth may be needed)"
  else
    log "Warning: gh CLI not available — cannot post error comment to issue #${issue_number}"
  fi
}

# ─── Argument validation ──────────────────────────────────────────────────────

if [[ $# -lt 2 ]]; then
  err "Usage: $0 <issue_number> <branch_slug> [worktree_path]"
  exit 1
fi

ISSUE_NUMBER="$1"
BRANCH_SLUG="$2"
WORKTREE_PATH="${3:-}"

# Validate issue_number is a positive integer
if ! [[ "$ISSUE_NUMBER" =~ ^[0-9]+$ ]]; then
  err "Invalid issue number: '${ISSUE_NUMBER}' — must be a positive integer"
  exit 1
fi

# Validate branch_slug matches [a-z0-9][a-z0-9-]*
if ! [[ "$BRANCH_SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  err "Invalid branch slug: '${BRANCH_SLUG}' — must match [a-z0-9][a-z0-9-]* (lowercase, digits, hyphens only)"
  exit 1
fi

# ─── Worktree context ─────────────────────────────────────────────────────────

if [[ -n "$WORKTREE_PATH" ]]; then
  if [[ ! -d "$WORKTREE_PATH" ]]; then
    err "Worktree path does not exist: '${WORKTREE_PATH}'"
    post_error_comment "$ISSUE_NUMBER" "Worktree path \`${WORKTREE_PATH}\` does not exist. Create the worktree first with \`scripts/pipeline.sh start ${ISSUE_NUMBER}\`."
    exit 1
  fi
  # Change into the worktree for all subsequent git operations
  cd "$WORKTREE_PATH"
  log "Operating in worktree: ${WORKTREE_PATH}"
fi

# Verify we are inside a git repository
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  err "Not inside a git repository (cwd: $(pwd))"
  exit 1
fi

# ─── Step 1: Fetch origin ─────────────────────────────────────────────────────

log "Fetching origin..."
git fetch origin -q 2>/dev/null || {
  err "Failed to fetch from origin"
  post_error_comment "$ISSUE_NUMBER" "Branch Guard failed to fetch from \`origin\`. Check network connectivity and repository permissions."
  exit 1
}

# ─── Step 2: Determine branch existence ──────────────────────────────────────

LOCAL_EXISTS=false
REMOTE_EXISTS=false
CURRENT_BRANCH=""

CURRENT_BRANCH="$(git branch --show-current 2>/dev/null || echo "")"

if git show-ref --verify --quiet "refs/heads/${BRANCH_SLUG}" 2>/dev/null; then
  LOCAL_EXISTS=true
fi

if git show-ref --verify --quiet "refs/remotes/origin/${BRANCH_SLUG}" 2>/dev/null; then
  REMOTE_EXISTS=true
fi

# ─── Step 3/4/5: Create or checkout the branch ───────────────────────────────

if [[ "$CURRENT_BRANCH" == "$BRANCH_SLUG" ]]; then
  log "Already on branch '${BRANCH_SLUG}' — nothing to do."

elif [[ "$LOCAL_EXISTS" == "true" ]]; then
  log "Checking out existing local branch '${BRANCH_SLUG}'..."
  git checkout "$BRANCH_SLUG" -q

elif [[ "$REMOTE_EXISTS" == "true" ]]; then
  log "Checking out remote branch 'origin/${BRANCH_SLUG}'..."
  git checkout -b "$BRANCH_SLUG" --track "origin/${BRANCH_SLUG}" -q

else
  log "Branch '${BRANCH_SLUG}' does not exist — creating from origin/main..."
  if ! git show-ref --verify --quiet "refs/remotes/origin/main" 2>/dev/null; then
    err "origin/main does not exist — cannot create branch '${BRANCH_SLUG}'"
    post_error_comment "$ISSUE_NUMBER" "Branch Guard could not create \`${BRANCH_SLUG}\` because \`origin/main\` does not exist."
    exit 1
  fi
  git checkout -b "$BRANCH_SLUG" "origin/main" -q
  log "Pushing '${BRANCH_SLUG}' to origin..."
  git push origin "$BRANCH_SLUG" -q
fi

# ─── Step 6: Verify current branch ───────────────────────────────────────────

VERIFIED_BRANCH="$(git branch --show-current 2>/dev/null || echo "")"

if [[ "$VERIFIED_BRANCH" != "$BRANCH_SLUG" ]]; then
  err "Branch mismatch after checkout: expected '${BRANCH_SLUG}', got '${VERIFIED_BRANCH}'"
  post_error_comment "$ISSUE_NUMBER" \
    "Branch Guard detected a mismatch: expected \`${BRANCH_SLUG}\` but current branch is \`${VERIFIED_BRANCH}\`. No file operations were performed. Resolve the branch conflict and re-run."
  exit 1
fi

log "Branch guard passed — on branch '${BRANCH_SLUG}'"
exit 0
