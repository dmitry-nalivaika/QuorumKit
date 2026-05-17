#!/usr/bin/env bash
# =============================================================================
# scripts/test-dev-init.sh — Self-hosting init smoke test
#
# Removes all generated/gitignored artifacts, runs scripts/dev-setup.sh,
# then verifies every expected file/directory is present.
#
# Usage (from repo root):
#   bash scripts/test-dev-init.sh [--ai=claude|copilot|both]
#
# Defaults to --ai=claude (matches dev-setup.sh default).
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$REPO_ROOT"

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $*"; }
fail() { echo -e "${RED}✗${NC} $*"; FAILURES=$((FAILURES + 1)); }
warn() { echo -e "${YELLOW}⚠${NC}  $*"; }
h1()   { echo -e "\n${BOLD}$*${NC}"; }

# ── Arguments ─────────────────────────────────────────────────────────────────
AI_MODE="claude"
for arg in "$@"; do
  case "$arg" in
    --ai=claude)  AI_MODE="claude"  ;;
    --ai=copilot) AI_MODE="copilot" ;;
    --ai=both)    AI_MODE="both"    ;;
    *)
      echo "Usage: $0 [--ai=claude|copilot|both]"
      exit 1
      ;;
  esac
done

FAILURES=0

# ── Step 1: Backup and clean all generated artifacts ─────────────────────────
h1 "Step 1: Backing up and cleaning generated artifacts"
BACKUP_DIR="$(bash "$SCRIPT_DIR/cleanup.sh")"
ok "Artifacts backed up to: $BACKUP_DIR"

# ── Step 2: Run dev-setup.sh ──────────────────────────────────────────────────
h1 "Step 2: Running scripts/dev-setup.sh --ai=$AI_MODE"
bash "$SCRIPT_DIR/dev-setup.sh" "--ai=$AI_MODE"

# ── Step 3: Verify ────────────────────────────────────────────────────────────
h1 "Step 3: Verifying installation (mode: $AI_MODE)"

check_dir()  {
  local path="$1" min="${2:-1}"
  local count
  # Count all entries (files + subdirectories) at depth 1
  # Skills dirs use <name>/SKILL.md layout, so subdirs count as entries
  if [ ! -d "$path" ]; then
    fail "$path/ missing (directory does not exist)"
    return
  fi
  count=$(find "$path" -mindepth 1 -maxdepth 1 2>/dev/null | wc -l | tr -d ' ')
  if [ "$count" -ge "$min" ]; then
    ok "$path/ ($count entries)"
  else
    fail "$path/ missing or empty (found $count, expected >= $min)"
  fi
}
check_file() {
  local path="$1"
  if [ -e "$path" ]; then ok "$path"; else fail "MISSING: $path"; fi
}
check_speckit() {
  if [ -d ".specify" ]; then
    ok ".specify/ (specify-cli initialized)"
    if [ -f ".specify/memory/constitution.md" ]; then
      ok ".specify/memory/constitution.md present"
    else
      fail ".specify/memory/constitution.md MISSING"
    fi
  else
    warn ".specify/ not present — specify-cli may not be installed (non-fatal)"
  fi
}

# ── Claude mode checks ────────────────────────────────────────────────────────
if [[ "$AI_MODE" == "claude" || "$AI_MODE" == "both" ]]; then
  check_dir  ".claude/agents"  11
  check_dir  ".claude/skills"  16
  check_file "CLAUDE.md"
fi

# ── Copilot mode checks ───────────────────────────────────────────────────────
if [[ "$AI_MODE" == "copilot" || "$AI_MODE" == "both" ]]; then
  check_file ".github/copilot-instructions.md"
  check_dir  ".github/instructions"  11
fi

# ── Shared checks (all modes) ─────────────────────────────────────────────────
check_file ".github/workflows/orchestrator.yml"
check_file ".github/workflows/alert-to-issue.yml"
check_dir  ".github/ISSUE_TEMPLATE"          4
check_file ".github/pull_request_template.md"

# ── QuorumKit-internal files (installed by dev-setup.sh only) ────────────────
check_file ".github/copilot-instructions.md"
check_file ".github/dependabot.yml"
check_file ".github/mlc-config.json"
check_file ".github/workflows/engine-build-gate.yml"
check_file ".github/workflows/engine-release.yml"
check_file ".github/workflows/quality.yml"
check_file ".github/workflows/update-dashboard.yml"

# ── Agent workflows ───────────────────────────────────────────────────────────
if [[ "$AI_MODE" == "claude" || "$AI_MODE" == "both" ]]; then
  for wf in agent-architect agent-docs agent-qa agent-release agent-reviewer agent-security agent-tech-debt agent-triage; do
    check_file ".github/workflows/${wf}.yml"
  done
fi
if [[ "$AI_MODE" == "copilot" || "$AI_MODE" == "both" ]]; then
  for wf in copilot-agent-architect copilot-agent-ba copilot-agent-docs copilot-agent-qa copilot-agent-release copilot-agent-reviewer copilot-agent-security copilot-agent-tech-debt copilot-agent-triage; do
    check_file ".github/workflows/${wf}.yml"
  done
fi

# ── .apm/ must NOT exist (self-hosting: --skip-pipelines is passed) ───────────
if [ -d ".apm" ]; then
  fail ".apm/ exists — --skip-pipelines not working"
else
  ok ".apm/ absent (correct — self-hosting uses src/pipelines/)"
fi

# ── .specify/ (non-fatal: depends on specify-cli being installed) ─────────────
check_speckit

# ── Git status must be clean (all generated files gitignored) ─────────────────
h1 "Step 4: Verifying git status is clean"
DIRTY=$(git status --short 2>/dev/null || true)
if [ -z "$DIRTY" ]; then
  ok "git status is clean — all generated files are gitignored"
else
  fail "git status is dirty — some generated files are not gitignored:"
  echo "$DIRTY"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Backup:${NC} $BACKUP_DIR"
if [ "$FAILURES" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}All checks passed (mode: $AI_MODE)${NC}"
else
  echo -e "${RED}${BOLD}$FAILURES check(s) failed (mode: $AI_MODE)${NC}"
  exit 1
fi
