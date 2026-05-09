#!/usr/bin/env bash
# =============================================================================
# test-verify-mirror.sh — negative-test fixtures for M4–M9
#
# Each test seeds a controlled violation in a temporary clone of the repo,
# runs verify-mirror.sh, asserts it exits non-zero with a message naming the
# rule ID, then reverts and asserts it exits zero again. (FR-020, SC-002.)
#
# Run with:  bash scripts/tests/test-verify-mirror.sh
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_REL="scripts/verify-mirror.sh"
WORK="$(mktemp -d)"
PASS=0; FAIL=0
trap 'rm -rf "$WORK"' EXIT

log()  { printf '[%s] %s\n' "$1" "$2"; }
pass() { PASS=$((PASS+1)); log PASS "$1"; }
fail() { FAIL=$((FAIL+1)); log FAIL "$1"; }

# Snapshot the repo (excluding heavy/derived dirs).
rsync -a --exclude='.git' --exclude='node_modules' \
      --exclude='.apm-workspaces' --exclude='dashboard/node_modules' \
      "$ROOT/" "$WORK/repo/"

run_check() {
  # Run the snapshot's own copy of verify-mirror.sh so its `cd "$ROOT"` lands
  # in the temp clone (not the source tree).
  ( cd "$WORK/repo" && bash "$SCRIPT_REL" ) >"$WORK/out.log" 2>&1
  echo $?
}

assert_baseline_passes() {
  local rc; rc=$(run_check)
  if [ "$rc" -eq 0 ]; then pass "baseline: verify-mirror passes on clean tree"
  else fail "baseline: verify-mirror failed on clean tree (rc=$rc)"; cat "$WORK/out.log"; fi
}

assert_violation() {
  local rule="$1" prep="$2" undo="$3"
  ( cd "$WORK/repo" && eval "$prep" )
  local rc; rc=$(run_check)
  if [ "$rc" -ne 0 ] && grep -q "$rule" "$WORK/out.log"; then
    pass "$rule: violation detected and named in output"
  else
    fail "$rule: expected non-zero exit + message containing '$rule' (rc=$rc)"
    sed 's/^/    /' "$WORK/out.log" | tail -10
  fi
  ( cd "$WORK/repo" && eval "$undo" )
  rc=$(run_check)
  if [ "$rc" -eq 0 ]; then pass "$rule: passes again after revert"
  else fail "$rule: still failing after revert"; fi
}

assert_baseline_passes

assert_violation "M4" \
  "mkdir -p templates/.apm/pipelines && touch templates/.apm/pipelines/foo.yml" \
  "rm -rf templates/.apm"

assert_violation "M5" \
  "perl -i -pe 's/timeout-minutes: 30/timeout-minutes: 31/' .github/workflows/copilot-agent-dev.yml" \
  "perl -i -pe 's/timeout-minutes: 31/timeout-minutes: 30/' .github/workflows/copilot-agent-dev.yml"

assert_violation "M6" \
  "mkdir -p .github/agents && touch .github/agents/x.md" \
  "rm -rf .github/agents"

assert_violation "M7" \
  "echo '# stray' > .apm/agents/test-stray-agent.md" \
  "rm -f .apm/agents/test-stray-agent.md"

assert_violation "M8" \
  "echo '        run: node scripts/orchestrator/foo.js' >> .github/workflows/copilot-agent-dev.yml" \
  "perl -i -pe 'undef \$_ if /run: node scripts.orchestrator.foo.js/' .github/workflows/copilot-agent-dev.yml"

assert_violation "M9" \
  "echo '      - uses: actions/foo@v1' >> .github/workflows/copilot-agent-dev.yml" \
  "perl -i -pe 'undef \$_ if /uses: actions.foo.v1/' .github/workflows/copilot-agent-dev.yml"

echo
echo "──────────────────────────────────"
echo "  PASS: $PASS   FAIL: $FAIL"
echo "──────────────────────────────────"
[ "$FAIL" -eq 0 ]
