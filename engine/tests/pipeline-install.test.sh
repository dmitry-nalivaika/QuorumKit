#!/usr/bin/env bash
# engine/tests/pipeline-install.test.sh
# Tests for install_local_pipelines() in src/scripts/init.sh (Issue #283,
# US-3, AD-4, FR-004).
#
# Verifies that pipeline.sh and branch-guard.sh are copied into a consumer
# project's own scripts/ directory by running init.sh end-to-end (mirroring
# the pattern used by scripts/test-external-install.sh), idempotently
# (skip-with-warning on re-run, no overwrite), and remain executable.
#
# Usage: bash engine/tests/pipeline-install.test.sh
# Exit code: 0 = all passed, non-zero = at least one failure

set -uo pipefail

RESULTS_FILE="$(mktemp)"
trap 'rm -f "$RESULTS_FILE"' EXIT

pass() { echo "PASS $1" >> "$RESULTS_FILE"; echo "  PASS  $1"; }
fail() { echo "FAIL $1" >> "$RESULTS_FILE"; echo "  FAIL  $1"; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo ""
echo "install_local_pipelines() unit tests"
echo "================================"

CONSUMER_DIR="$(mktemp -d)"
trap 'rm -rf "$CONSUMER_DIR"' EXIT
git -C "$CONSUMER_DIR" init -q
git -C "$CONSUMER_DIR" config user.email "test@quorumkit.local"
git -C "$CONSUMER_DIR" config user.name "QuorumKit Test"

# ─── Fresh install: run init.sh once ─────────────────────────────────────────
(
  cd "$CONSUMER_DIR"
  QUORUMKIT_PACKAGE_DIR="$REPO_ROOT" \
    bash "$REPO_ROOT/src/scripts/init.sh" --ai=copilot > install_1.log 2>&1
)

if [[ -f "$CONSUMER_DIR/scripts/pipeline.sh" && -f "$CONSUMER_DIR/scripts/branch-guard.sh" ]]; then
  pass "fresh install copies both pipeline.sh and branch-guard.sh into consumer scripts/"
else
  fail "fresh install missing scripts/pipeline.sh or scripts/branch-guard.sh"
fi

if [[ -x "$CONSUMER_DIR/scripts/pipeline.sh" && -x "$CONSUMER_DIR/scripts/branch-guard.sh" ]]; then
  pass "copied scripts remain executable"
else
  fail "copied scripts are not executable"
fi

# ─── Idempotent re-run: hand-edit, then re-run init.sh ──────────────────────
echo "# hand-edited sentinel" >> "$CONSUMER_DIR/scripts/pipeline.sh"

(
  cd "$CONSUMER_DIR"
  QUORUMKIT_PACKAGE_DIR="$REPO_ROOT" \
    bash "$REPO_ROOT/src/scripts/init.sh" --ai=copilot > install_2.log 2>&1
)

if grep -q "# hand-edited sentinel" "$CONSUMER_DIR/scripts/pipeline.sh"; then
  pass "existing scripts/pipeline.sh is not overwritten on re-run"
else
  fail "existing scripts/pipeline.sh was overwritten"
fi

if grep -qi "already exists" "$CONSUMER_DIR/install_2.log"; then
  pass "re-run prints a skip-with-warning message for local pipeline scripts"
else
  fail "re-run did not print an 'already exists' warning"
fi

# ─── Summary ───────────────────────────────────────────────────────────────
echo ""
PASSED=$(grep -c '^PASS' "$RESULTS_FILE" || true)
FAILED=$(grep -c '^FAIL' "$RESULTS_FILE" || true)
echo "Results: $PASSED passed, $FAILED failed, 0 skipped"

if [[ "$FAILED" -gt 0 ]]; then
  exit 1
fi
