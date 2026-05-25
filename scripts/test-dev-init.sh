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
DOMAIN=""
for arg in "$@"; do
  case "$arg" in
    --ai=claude)         AI_MODE="claude"      ;;
    --ai=copilot)        AI_MODE="copilot"     ;;
    --ai=both)           AI_MODE="both"        ;;
    --domain=industrial) DOMAIN="industrial"   ;;
    *)
      echo "Usage: $0 [--ai=claude|copilot|both] [--domain=industrial]"
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
DOMAIN_ARG="${DOMAIN:+--domain=$DOMAIN}"
h1 "Step 2: Running scripts/dev-setup.sh --ai=$AI_MODE${DOMAIN:+ --domain=$DOMAIN}"
bash "$SCRIPT_DIR/dev-setup.sh" "--ai=$AI_MODE" ${DOMAIN_ARG:+"$DOMAIN_ARG"}

# ── Step 3: Verify ────────────────────────────────────────────────────────────
h1 "Step 3: Verifying installation (mode: $AI_MODE${DOMAIN:+, domain: $DOMAIN})"

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
  if [[ "$DOMAIN" == "industrial" ]]; then
    check_dir  ".claude/agents"  15
    check_dir  ".claude/skills"  20
  else
    check_dir  ".claude/agents"  11
    check_dir  ".claude/skills"  16
  fi
  check_file "CLAUDE.md"
fi

# ── Copilot mode checks ───────────────────────────────────────────────────────
if [[ "$AI_MODE" == "copilot" || "$AI_MODE" == "both" ]]; then
  check_file ".github/copilot-instructions.md"
  if [[ "$DOMAIN" == "industrial" ]]; then
    check_dir  ".github/instructions"  15
    check_dir  ".github/prompts"        8
  else
    check_dir  ".github/instructions"  11
    check_dir  ".github/prompts"        8
  fi
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
  if [[ "$DOMAIN" == "industrial" ]]; then
    for wf in agent-ot-integration agent-digital-twin agent-compliance agent-incident; do
      check_file ".github/workflows/${wf}.yml"
    done
  fi
fi
if [[ "$AI_MODE" == "copilot" || "$AI_MODE" == "both" ]]; then
  for wf in copilot-agent-architect copilot-agent-ba copilot-agent-docs copilot-agent-qa copilot-agent-release copilot-agent-reviewer copilot-agent-security copilot-agent-tech-debt copilot-agent-triage; do
    check_file ".github/workflows/${wf}.yml"
  done
  if [[ "$DOMAIN" == "industrial" ]]; then
    for wf in copilot-agent-ot-integration copilot-agent-digital-twin copilot-agent-compliance copilot-agent-incident; do
      check_file ".github/workflows/${wf}.yml"
    done
  fi
fi

# ── src/pipelines/ must already exist (QuorumKit self-hosting: pipelines ship ──
# ── in src/pipelines/ and are read from there directly by the orchestrator) ────
if [ -d "src/pipelines" ]; then
  ok "src/pipelines/ present (correct — self-hosting uses src/pipelines/ directly)"
else
  fail "src/pipelines/ missing — self-hosting requires this directory"
fi

# ── .specify/ (non-fatal: depends on specify-cli being installed) ─────────────
check_speckit

# ── Git status must be clean (all generated files gitignored) ─────────────────
h1 "Step 4: Verifying git status is clean"
# Check only for NEW untracked files that are not gitignored.
# We don't check for deletions/modifications of tracked files because:
#   • cleanup.sh intentionally removes tracked copilot-specific files (agents,
#     instructions, prompts) that a claude-only install does not restore.
#   • init.sh may legitimately rewrite committed files such as
#     .specify/init-options.json and .github/copilot-instructions.md.
# The meaningful signal is: did the install create new committed files that
# should have been gitignored instead?
DIRTY=$(git ls-files --others --exclude-standard 2>/dev/null || true)
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
  echo -e "${GREEN}${BOLD}All checks passed (mode: $AI_MODE${DOMAIN:+, domain: $DOMAIN})${NC}"
else
  echo -e "${RED}${BOLD}$FAILURES check(s) failed (mode: $AI_MODE${DOMAIN:+, domain: $DOMAIN})${NC}"
  exit 1
fi
