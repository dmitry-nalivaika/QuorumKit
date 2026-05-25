#!/usr/bin/env bash
# engine/tests/branch-guard.test.sh
# Unit tests for scripts/branch-guard.sh (FR-010 to FR-014, Issue #175)
#
# Usage: bash engine/tests/branch-guard.test.sh
# Exit code: 0 = all passed, non-zero = at least one failure
#
# These tests use git repos created in TMPDIR so no network access is needed.
# gh CLI calls are stubbed via PATH manipulation.

set -uo pipefail

# ─── Test runner helpers ─────────────────────────────────────────────────────

RESULTS_FILE="$(mktemp)"
trap 'rm -f "$RESULTS_FILE"' EXIT

pass() { echo "PASS $1" >> "$RESULTS_FILE"; echo "  PASS  $1"; }
fail() { echo "FAIL $1" >> "$RESULTS_FILE"; echo "  FAIL  $1"; }
skip() { echo "SKIP $1" >> "$RESULTS_FILE"; echo "  SKIP  $1"; }

# Export RESULTS_FILE so subshells can write to it
export RESULTS_FILE

assert_exit_zero() {
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then
    pass "$label"
  else
    fail "$label (expected exit 0, got $?)"
  fi
}

assert_exit_nonzero() {
  local label="$1"; shift
  if ! "$@" >/dev/null 2>&1; then
    pass "$label"
  else
    fail "$label (expected non-zero exit, got 0)"
  fi
}

assert_output_contains() {
  local label="$1" pattern="$2"; shift 2
  local out
  out=$("$@" 2>&1) || true
  if echo "$out" | grep -qF "$pattern"; then
    pass "$label"
  else
    fail "$label (output did not contain: '$pattern')"
  fi
}

# ─── Setup — locate script under test ────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/branch-guard.sh"

# ─── gh CLI stub ─────────────────────────────────────────────────────────────
# Placed in a temp stub dir prepended to PATH so real gh is not required.

STUB_DIR="$(mktemp -d)"
GH_CALLS_FILE="$STUB_DIR/gh_calls"
cat > "$STUB_DIR/gh" << 'GHSTUB'
#!/usr/bin/env bash
# Record invocations; simulate success for all gh calls
echo "$@" >> "${GH_CALLS_FILE:-/dev/null}"
exit 0
GHSTUB
chmod +x "$STUB_DIR/gh"
export GH_CALLS_FILE
export PATH="$STUB_DIR:$PATH"

# ─── Helper: create a bare origin + working clone in TMPDIR ─────────────────

make_test_env() {
  # Returns the path to a fresh working clone in $WORK_DIR
  # Sets ORIGIN_DIR and WORK_DIR in caller scope
  local base
  base="$(mktemp -d)"
  ORIGIN_DIR="$base/origin.git"
  WORK_DIR="$base/work"

  git init --bare "$ORIGIN_DIR" -q
  git init "$WORK_DIR" -q
  git -C "$WORK_DIR" remote add origin "$ORIGIN_DIR"

  # Seed an initial commit so origin/main exists
  git -C "$WORK_DIR" commit --allow-empty -m "init" -q
  git -C "$WORK_DIR" branch -M main 2>/dev/null || true
  git -C "$WORK_DIR" push origin main -q

  # Configure git identity for the test repo
  git -C "$WORK_DIR" config user.email "test@test.local"
  git -C "$WORK_DIR" config user.name "Test"
}

cleanup_test_env() {
  rm -rf "${ORIGIN_DIR%/origin.git}"
}

# ─── Tests ───────────────────────────────────────────────────────────────────

echo ""
echo "branch-guard.sh unit tests"
echo "================================"

# T-04-00: Script exists and is executable
if [[ -x "$SCRIPT" ]]; then
  pass "script exists and is executable"
else
  fail "script does not exist or is not executable: $SCRIPT"
fi

# T-04-01: Missing arguments → non-zero exit
assert_exit_nonzero "missing arguments exits non-zero" \
  bash "$SCRIPT"

# T-04-02: Invalid issue number (non-integer) → non-zero exit
assert_exit_nonzero "non-integer issue number rejected" \
  bash "$SCRIPT" "abc" "042-test-slug"

# T-04-03: Invalid branch slug (uppercase) → non-zero exit
assert_exit_nonzero "uppercase branch slug rejected" \
  bash "$SCRIPT" "42" "042-Test-Slug"

# T-04-04: Invalid branch slug (special chars) → non-zero exit
assert_exit_nonzero "branch slug with special chars rejected" \
  bash "$SCRIPT" "42" "042-test_slug!"

# T-04-05: Branch does not exist → created from origin/main and pushed
(
  make_test_env
  cd "$WORK_DIR"
  result=$(bash "$SCRIPT" "42" "042-new-branch" 2>&1)
  exit_code=$?
  current=$(git branch --show-current)
  cleanup_test_env
  if [[ $exit_code -eq 0 && "$current" == "042-new-branch" ]]; then
    pass "non-existent branch created from origin/main and checked out"
  else
    fail "non-existent branch not created correctly (exit=$exit_code, branch=$current)"
  fi
)

# T-04-06: Branch already exists locally → checked out without creating new branch
(
  make_test_env
  cd "$WORK_DIR"
  git checkout -b "042-existing-local" -q
  git checkout main -q
  result=$(bash "$SCRIPT" "42" "042-existing-local" 2>&1)
  exit_code=$?
  current=$(git branch --show-current)
  cleanup_test_env
  if [[ $exit_code -eq 0 && "$current" == "042-existing-local" ]]; then
    pass "existing local branch checked out without creating new branch"
  else
    fail "existing local branch not checked out correctly (exit=$exit_code, branch=$current)"
  fi
)

# T-04-07: Branch exists on origin only → checked out tracking origin
(
  make_test_env
  cd "$WORK_DIR"
  # Create branch on origin directly
  git push origin main:refs/heads/042-remote-only -q
  result=$(bash "$SCRIPT" "42" "042-remote-only" 2>&1)
  exit_code=$?
  current=$(git branch --show-current)
  cleanup_test_env
  if [[ $exit_code -eq 0 && "$current" == "042-remote-only" ]]; then
    pass "remote-only branch checked out tracking origin"
  else
    fail "remote-only branch not checked out correctly (exit=$exit_code, branch=$current)"
  fi
)

# T-04-08: Idempotency — calling twice produces same end state without error
(
  make_test_env
  cd "$WORK_DIR"
  bash "$SCRIPT" "42" "042-idempotent-branch" >/dev/null 2>&1
  result=$(bash "$SCRIPT" "42" "042-idempotent-branch" 2>&1)
  exit_code=$?
  current=$(git branch --show-current)
  cleanup_test_env
  if [[ $exit_code -eq 0 && "$current" == "042-idempotent-branch" ]]; then
    pass "idempotent — second call succeeds with same end state"
  else
    fail "idempotency failed (exit=$exit_code, branch=$current)"
  fi
)

# T-04-09: Branch mismatch after checkout → exits non-zero and records error
# Simulate by providing a branch slug that cannot be created (e.g. invalid git ref).
# We test the mismatch detection by using a worktree path that doesn't exist.
(
  make_test_env
  cd "$WORK_DIR"
  # Pass a non-existent worktree path — guard should detect CWD is not in that path
  result=$(bash "$SCRIPT" "42" "042-mismatch-test" "/nonexistent/worktree/path" 2>&1)
  exit_code=$?
  cleanup_test_env
  # Should exit non-zero because worktree path doesn't exist
  if [[ $exit_code -ne 0 ]]; then
    pass "non-existent worktree path → non-zero exit"
  else
    fail "expected non-zero exit for non-existent worktree path, got 0"
  fi
)

# T-04-10: Worktree context — script works inside worktree directory
(
  make_test_env
  cd "$WORK_DIR"
  # Create a worktree
  git checkout -b "042-worktree-branch" -q
  git checkout main -q
  WORKTREE_PATH="$(mktemp -d)/042-worktree-branch"
  git worktree add "$WORKTREE_PATH" "042-worktree-branch" -q 2>/dev/null || true
  if [[ -d "$WORKTREE_PATH" ]]; then
    result=$(bash "$SCRIPT" "42" "042-worktree-branch" "$WORKTREE_PATH" 2>&1)
    exit_code=$?
    # Main checkout should still be on main
    main_branch=$(git branch --show-current)
    # Worktree branch should be correct
    wt_branch=$(git -C "$WORKTREE_PATH" branch --show-current 2>/dev/null || echo "unknown")
    git worktree remove "$WORKTREE_PATH" -q 2>/dev/null || true
    cleanup_test_env
    if [[ $exit_code -eq 0 && "$main_branch" == "main" && "$wt_branch" == "042-worktree-branch" ]]; then
      pass "worktree context — operates in worktree, main checkout unchanged"
    else
      fail "worktree context failed (exit=$exit_code, main=$main_branch, wt=$wt_branch)"
    fi
  else
    skip "git worktree add not available or failed — skipping worktree test"
    cleanup_test_env
  fi
)

# T-04-11: Error output contains issue number reference
(
  make_test_env
  cd "$WORK_DIR"
  output=$(bash "$SCRIPT" "abc" "042-test" 2>&1 || true)
  cleanup_test_env
  if echo "$output" | grep -qi "issue\|invalid\|integer\|error"; then
    pass "error message mentions issue/invalid/integer on bad input"
  else
    fail "error message not informative for bad input: '$output'"
  fi
)

# ─── Summary ─────────────────────────────────────────────────────────────────

PASS=$(grep -c "^PASS " "$RESULTS_FILE" 2>/dev/null) || true
FAIL=$(grep -c "^FAIL " "$RESULTS_FILE" 2>/dev/null) || true
SKIP=$(grep -c "^SKIP " "$RESULTS_FILE" 2>/dev/null) || true
PASS="${PASS:-0}"
FAIL="${FAIL:-0}"
SKIP="${SKIP:-0}"

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed, ${SKIP} skipped"
echo ""

if [[ "$FAIL" -gt 0 ]]; then
  echo "Failures:"
  grep "^FAIL " "$RESULTS_FILE" | sed 's/^FAIL /  FAIL: /'
  echo ""
fi

# Cleanup stub dir
rm -rf "$STUB_DIR"

[[ "$FAIL" -eq 0 ]]
