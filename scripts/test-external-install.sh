#!/usr/bin/env bash
# =============================================================================
# scripts/test-external-install.sh — External consumer install smoke test
#
# Creates a temporary directory, initialises it as a git repo, then runs
# src/scripts/init.sh pointing QUORUMKIT_PACKAGE_DIR at this repo.
# Verifies that all expected files are installed and the directory is a
# fully working QuorumKit-enabled project.
#
# Usage (from repo root):
#   bash scripts/test-external-install.sh [--ai=claude|copilot|both] [--domain=industrial]
#
# Tests all three modes if no --ai flag is given.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $*"; }
fail() { echo -e "${RED}✗${NC} $*"; FAILURES=$((FAILURES + 1)); }
warn() { echo -e "${YELLOW}⚠${NC}  $*"; }
h1()   { echo -e "\n${BOLD}$*${NC}"; }

# ── Arguments ─────────────────────────────────────────────────────────────────
MODES=()
DOMAIN=""
for arg in "$@"; do
  case "$arg" in
    --ai=claude)         MODES+=("claude")    ;;
    --ai=copilot)        MODES+=("copilot")   ;;
    --ai=both)           MODES+=("both")      ;;
    --domain=industrial) DOMAIN="industrial"  ;;
    *)
      echo "Usage: $0 [--ai=claude|copilot|both] [--domain=industrial]"
      echo "  (Omit --ai to run all three modes sequentially)"
      exit 1
      ;;
  esac
done

# Default: test all three modes
if [ "${#MODES[@]}" -eq 0 ]; then
  MODES=("claude" "copilot" "both")
fi

# ── Per-mode test function ────────────────────────────────────────────────────
run_mode_test() {
  local ai_mode="$1"
  local domain="${2:-}"
  FAILURES=0

  h1 "════════════════════════════════════════"
  h1 " External install test  —  --ai=$ai_mode${domain:+ --domain=$domain}"
  h1 "════════════════════════════════════════"

  # Create a fresh temp directory and initialise git
  local tmpdir
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"' RETURN

  echo "  Temp dir: $tmpdir"
  git -C "$tmpdir" init -q
  git -C "$tmpdir" config user.email "test@quorumkit.local"
  git -C "$tmpdir" config user.name  "QuorumKit Test"

  # ── Run init.sh ───────────────────────────────────────────────────────────
  h1 "Running src/scripts/init.sh --ai=$ai_mode${domain:+ --domain=$domain}"
  cd "$tmpdir"
  local init_output
  init_output="$(QUORUMKIT_PACKAGE_DIR="$REPO_ROOT" \
    bash "$REPO_ROOT/src/scripts/init.sh" "--ai=$ai_mode" ${domain:+"--domain=$domain"} 2>&1)"
  echo "$init_output"
  cd "$REPO_ROOT"

  # ── Verify helpers ────────────────────────────────────────────────────────
  check_dir() {
    local path="$tmpdir/$1" min="${2:-1}"
    local count
    # Count all entries (files + subdirectories) at depth 1
    # Skills dirs use <name>/SKILL.md layout, so subdirs count as entries
    count=$(find "$path" -mindepth 1 -maxdepth 1 2>/dev/null | wc -l | tr -d ' ')
    if [ "$count" -ge "$min" ]; then
      ok "$1/ ($count entries)"
    else
      fail "$1/ missing or empty (found $count, expected >= $min)"
    fi
  }
  check_file() {
    local path="$tmpdir/$1"
    if [ -e "$path" ]; then ok "$1"; else fail "MISSING: $1"; fi
  }
  check_absent() {
    local path="$tmpdir/$1"
    if [ -e "$path" ]; then fail "SHOULD NOT EXIST: $1"; else ok "(absent) $1"; fi
  }

  # ── Verify: Claude files ──────────────────────────────────────────────────
  if [[ "$ai_mode" == "claude" || "$ai_mode" == "both" ]]; then
    h1 "Claude Code files"
    if [[ "$domain" == "industrial" ]]; then
      check_dir  ".claude/agents"  15
      check_dir  ".claude/skills"  20
    else
      check_dir  ".claude/agents"  11
      check_dir  ".claude/skills"  16
    fi
    check_file "CLAUDE.md"
  fi

  # ── Verify: Copilot files ─────────────────────────────────────────────────
  if [[ "$ai_mode" == "copilot" || "$ai_mode" == "both" ]]; then
    h1 "Copilot files"
    check_file ".github/copilot-instructions.md"
    if [[ "$domain" == "industrial" ]]; then
      check_dir  ".github/instructions"  15
    else
      check_dir  ".github/instructions"  11
    fi
  fi

  # ── Verify: Shared GitHub templates ──────────────────────────────────────
  h1 "Shared GitHub templates"
  check_file ".github/workflows/orchestrator.yml"
  check_file ".github/workflows/alert-to-issue.yml"
  check_dir  ".github/ISSUE_TEMPLATE"          4
  check_file ".github/pull_request_template.md"

  # ── Verify: Agent workflows ───────────────────────────────────────────────
  if [[ "$ai_mode" == "claude" || "$ai_mode" == "both" ]]; then
    h1 "Claude agent workflows"
    for wf in agent-architect agent-docs agent-qa agent-release agent-reviewer agent-security agent-tech-debt agent-triage; do
      check_file ".github/workflows/${wf}.yml"
    done
    if [[ "$domain" == "industrial" ]]; then
      for wf in agent-ot-integration agent-digital-twin agent-compliance agent-incident; do
        check_file ".github/workflows/${wf}.yml"
      done
    fi
  fi
  if [[ "$ai_mode" == "copilot" || "$ai_mode" == "both" ]]; then
    h1 "Copilot agent workflows"
    for wf in copilot-agent-architect copilot-agent-ba copilot-agent-docs copilot-agent-qa copilot-agent-release copilot-agent-reviewer copilot-agent-security copilot-agent-tech-debt copilot-agent-triage; do
      check_file ".github/workflows/${wf}.yml"
    done
    if [[ "$domain" == "industrial" ]]; then
      for wf in copilot-agent-ot-integration copilot-agent-digital-twin copilot-agent-compliance copilot-agent-incident; do
        check_file ".github/workflows/${wf}.yml"
      done
    fi
  fi

  # ── Verify: Pipeline templates (installed for external consumers) ─────────
  h1 "Pipeline templates"
  check_dir  "src/pipelines"   3
  check_file "src/pipelines/feature-pipeline.yml"
  check_file "src/pipelines/bug-fix-pipeline.yml"
  check_file "src/pipelines/release-pipeline.yml"

  # ── Verify: Guide copies at root ─────────────────────────────────────────
  h1 "Root-level guide docs"
  check_file "BROWNFIELD_GUIDE.md"
  check_file "DARK_FACTORY_GUIDE.md"
  check_file "ENHANCEMENTS.md"

  # ── Verify: .specify/ (non-fatal — depends on specify-cli) ───────────────
  h1 ".specify/ constitution"
  if [ -d "$tmpdir/.specify" ]; then
    ok ".specify/ (specify-cli initialized)"
  else
    warn ".specify/ absent — specify-cli may not be installed (non-fatal)"
  fi

  # ── Verify: NO QuorumKit-internal files in consumer project ──────────────
  h1 "Sanity: QuorumKit-internal files must NOT be present"
  check_absent ".github/workflows/engine-build-gate.yml"
  check_absent ".github/workflows/engine-release.yml"
  check_absent ".github/workflows/agent-dev.yml"
  check_absent "engine/"
  check_absent "src/scripts/"

  # ── Verify: epilogue documents the npm-based dashboard install (AD-5) ────
  h1 "Epilogue: npm-based dashboard instructions"
  if echo "$init_output" | grep -q "npm install --no-save quorumkit-engine"; then
    ok "epilogue mentions 'npm install --no-save quorumkit-engine'"
  else
    fail "epilogue MISSING 'npm install --no-save quorumkit-engine'"
  fi
  if echo "$init_output" | grep -q "npx quorumkit-engine dashboard"; then
    ok "epilogue mentions 'npx quorumkit-engine dashboard'"
  else
    fail "epilogue MISSING 'npx quorumkit-engine dashboard'"
  fi
  if echo "$init_output" | grep -q "engine/dashboard/start.sh"; then
    fail "epilogue SHOULD NOT reference source-clone path 'engine/dashboard/start.sh' as primary instruction"
  else
    ok "epilogue does not reference source-clone 'engine/dashboard/start.sh' path"
  fi

  # ── Verify: upgrade-safety — hand-edited files survive a re-run (FR-005) ──
  h1 "Upgrade safety: hand-edited files are never overwritten"
  local custom_pipeline_sentinel="# hand-edited sentinel $(date +%s)"
  local custom_script_sentinel="# hand-edited script sentinel $(date +%s)"
  echo "$custom_pipeline_sentinel" >> "$tmpdir/src/pipelines/feature-pipeline.yml"
  echo "$custom_script_sentinel" >> "$tmpdir/scripts/pipeline.sh"

  cd "$tmpdir"
  QUORUMKIT_PACKAGE_DIR="$REPO_ROOT" \
    bash "$REPO_ROOT/src/scripts/init.sh" "--ai=$ai_mode" ${domain:+"--domain=$domain"} > /dev/null 2>&1
  cd "$REPO_ROOT"

  if grep -qF "$custom_pipeline_sentinel" "$tmpdir/src/pipelines/feature-pipeline.yml"; then
    ok "hand-edited src/pipelines/feature-pipeline.yml survives re-run (byte-identical)"
  else
    fail "hand-edited src/pipelines/feature-pipeline.yml was OVERWRITTEN by re-run"
  fi
  if grep -qF "$custom_script_sentinel" "$tmpdir/scripts/pipeline.sh"; then
    ok "hand-edited scripts/pipeline.sh survives re-run (byte-identical)"
  else
    fail "hand-edited scripts/pipeline.sh was OVERWRITTEN by re-run"
  fi

  # ── Summary ───────────────────────────────────────────────────────────────
  echo ""
  if [ "$FAILURES" -eq 0 ]; then
    echo -e "${GREEN}${BOLD}PASS  --ai=$ai_mode${domain:+ --domain=$domain}${NC}"
  else
    echo -e "${RED}${BOLD}FAIL  --ai=$ai_mode${domain:+ --domain=$domain}  ($FAILURES failures)${NC}"
  fi

  return "$FAILURES"
}

# ── Run all requested modes ───────────────────────────────────────────────────
TOTAL_FAILURES=0
for mode in "${MODES[@]}"; do
  run_mode_test "$mode" "$DOMAIN" || TOTAL_FAILURES=$((TOTAL_FAILURES + $?))
done

echo ""
if [ "$TOTAL_FAILURES" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}All external install tests passed (modes: ${MODES[*]}${DOMAIN:+, domain: $DOMAIN})${NC}"
else
  echo -e "${RED}${BOLD}$TOTAL_FAILURES total failure(s) across modes: ${MODES[*]}${DOMAIN:+, domain: $DOMAIN}${NC}"
  exit 1
fi
