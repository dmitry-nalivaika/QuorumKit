#!/usr/bin/env bash
# =============================================================================
# scripts/cleanup.sh — Back up and remove all init-generated artifacts
#
# Moves every file/directory produced by scripts/dev-setup.sh (or init.sh)
# to a timestamped backup folder in /tmp/, then removes them from the repo
# working tree so the next init run starts from a clean state.
#
# Usage (from repo root):
#   bash scripts/cleanup.sh
#
# The backup path is printed to stdout so it can be saved by callers.
# Exit code is always 0 (missing paths are silently skipped).
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$REPO_ROOT"

BACKUP_DIR="/tmp/quorumkit-cleanup-$$"
mkdir -p "$BACKUP_DIR"

# Helper: move src to backup if it exists (preserves directory structure)
_bak() {
  local src="$1"
  if [ -e "$src" ]; then
    local dest="$BACKUP_DIR/$src"
    mkdir -p "$(dirname "$dest")"
    mv "$src" "$dest"
  fi
}

# ── Claude Code artifacts ─────────────────────────────────────────────────────
_bak .claude/agents
_bak .claude/skills
_bak CLAUDE.md

# ── Orchestrator pipelines + runtime/identity configs ────────────────────────
# NOTE: src/pipelines/, src/runtimes.yml, and src/agent-identities.yml are
# committed source-of-truth files in the QuorumKit repo — not generated
# artifacts. Do NOT clean them here. For consumer projects they are generated
# by init.sh, but consumers use test-external-install.sh (a separate temp dir),
# not this cleanup script.

# ── Speckit / project constitution ───────────────────────────────────────────
_bak .specify


# ── .github/ installed directories ───────────────────────────────────────────
_bak .github/agents
_bak .github/copilot-instructions.md
_bak .github/dependabot.yml
_bak .github/mlc-config.json
_bak .github/instructions
_bak .github/scripts
_bak .github/prompts
_bak .github/ISSUE_TEMPLATE
_bak .github/pull_request_template.md

# ── .github/workflows/ installed files ───────────────────────────────────────
# agent-*.yml and copilot-agent-*.yml (all modes)
for f in .github/workflows/agent-*.yml .github/workflows/copilot-agent-*.yml; do
  [ -e "$f" ] && _bak "$f" || true
done
_bak .github/workflows/orchestrator.yml
_bak .github/workflows/alert-to-issue.yml
# QuorumKit-internal CI workflows
_bak .github/workflows/engine-build-gate.yml
_bak .github/workflows/engine-release.yml
_bak .github/workflows/quality.yml
_bak .github/workflows/update-dashboard.yml

echo "$BACKUP_DIR"
