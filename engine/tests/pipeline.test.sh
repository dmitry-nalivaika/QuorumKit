#!/usr/bin/env bash
# engine/tests/pipeline.test.sh
# Unit tests for scripts/pipeline.sh (FR-015 to FR-022, Issue #175)
#
# Usage: bash engine/tests/pipeline.test.sh
# Exit code: 0 = all passed, non-zero = at least one failure

set -uo pipefail

# ─── Test runner helpers ─────────────────────────────────────────────────────

RESULTS_FILE="$(mktemp)"
trap 'rm -f "$RESULTS_FILE"' EXIT
export RESULTS_FILE

pass() { echo "PASS $1" >> "$RESULTS_FILE"; echo "  PASS  $1"; }
fail() { echo "FAIL $1" >> "$RESULTS_FILE"; echo "  FAIL  $1"; }
skip() { echo "SKIP $1" >> "$RESULTS_FILE"; echo "  SKIP  $1"; }

# ─── Locate scripts under test ────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PIPELINE_SCRIPT="$REPO_ROOT/scripts/pipeline.sh"
BRANCH_GUARD_SCRIPT="$REPO_ROOT/scripts/branch-guard.sh"

# ─── gh CLI and branch-guard stubs ───────────────────────────────────────────

STUB_DIR="$(mktemp -d)"
GH_CALLS_FILE="$STUB_DIR/gh_calls"
BG_CALLS_FILE="$STUB_DIR/bg_calls"
export GH_CALLS_FILE BG_CALLS_FILE

# Stub gh: records calls, simulates success
cat > "$STUB_DIR/gh" << 'GHSTUB'
#!/usr/bin/env bash
echo "gh $*" >> "${GH_CALLS_FILE:-/dev/null}"
# Simulate 'gh issue view NNN --json title --jq .title' → returns "042-test-feature"
if [[ "$*" == *"issue view"* && "$*" == *"--json title"* ]]; then
  echo "test-feature"
fi
# Simulate 'gh issue comment' → success
exit 0
GHSTUB
chmod +x "$STUB_DIR/gh"

# Stub branch-guard: records calls, always succeeds (tested separately)
cat > "$STUB_DIR/branch-guard-stub.sh" << 'BGSTUB'
#!/usr/bin/env bash
echo "branch-guard $*" >> "${BG_CALLS_FILE:-/dev/null}"
exit 0
BGSTUB
chmod +x "$STUB_DIR/branch-guard-stub.sh"

export PATH="$STUB_DIR:$PATH"

# ─── Helper: create a test git repo ──────────────────────────────────────────

make_test_env() {
  local base
  base="$(mktemp -d)"
  ORIGIN_DIR="$base/origin.git"
  WORK_DIR="$base/work"
  git init --bare "$ORIGIN_DIR" -q
  git init "$WORK_DIR" -q
  git -C "$WORK_DIR" remote add origin "$ORIGIN_DIR"
  git -C "$WORK_DIR" commit --allow-empty -m "init" -q
  git -C "$WORK_DIR" branch -M main 2>/dev/null || true
  git -C "$WORK_DIR" push origin main -q
  git -C "$WORK_DIR" config user.email "test@test.local"
  git -C "$WORK_DIR" config user.name "Test"
  export ORIGIN_DIR WORK_DIR
}

cleanup_test_env() {
  rm -rf "${ORIGIN_DIR%/origin.git}" 2>/dev/null || true
  if [[ -n "${PIPELINE_WT:-}" && -d "${PIPELINE_WT:-}" ]]; then
    rm -rf "$PIPELINE_WT" 2>/dev/null || true
  fi
}

# ─── Tests ───────────────────────────────────────────────────────────────────

echo ""
echo "pipeline.sh unit tests"
echo "================================"

# T-07-00: Script exists and is executable
if [[ -x "$PIPELINE_SCRIPT" ]]; then
  pass "script exists and is executable"
else
  fail "script does not exist or is not executable: $PIPELINE_SCRIPT"
fi

# T-07-01: No subcommand → usage error, non-zero exit
(
  set +e
  result=$(bash "$PIPELINE_SCRIPT" 2>&1)
  exit_code=$?
  set -e
  if [[ $exit_code -ne 0 ]]; then
    pass "no subcommand → non-zero exit"
  else
    fail "no subcommand should exit non-zero, got 0"
  fi
)

# T-07-02: Unknown subcommand → non-zero exit
(
  set +e
  result=$(bash "$PIPELINE_SCRIPT" unknown-cmd 2>&1)
  exit_code=$?
  set -e
  if [[ $exit_code -ne 0 ]]; then
    pass "unknown subcommand exits non-zero"
  else
    fail "unknown subcommand should exit non-zero, got 0"
  fi
)

# T-07-03: start with non-integer issue number → non-zero exit
(
  set +e
  result=$(bash "$PIPELINE_SCRIPT" start "abc" 2>&1)
  exit_code=$?
  set -e
  if [[ $exit_code -ne 0 ]]; then
    pass "start with non-integer issue number exits non-zero"
  else
    fail "start with non-integer issue number should exit non-zero, got 0"
  fi
)

# T-07-04: start --mode=invalid → non-zero exit
(
  set +e
  result=$(bash "$PIPELINE_SCRIPT" start 42 --mode=invalid 2>&1)
  exit_code=$?
  set -e
  if [[ $exit_code -ne 0 ]]; then
    pass "start with invalid mode exits non-zero"
  else
    fail "start with invalid mode should exit non-zero, got 0"
  fi
)

# T-07-05: start <NNN> --mode=isolated creates worktree at default path
(
  make_test_env
  cd "$WORK_DIR"
  REPO_BASENAME="$(basename "$WORK_DIR")"
  EXPECTED_WT_PARENT="$(dirname "$WORK_DIR")"
  # Override BRANCH_GUARD to avoid real git operations; override pipeline script's branch-guard path
  export QUORUMKIT_TEST_BRANCH_GUARD="$STUB_DIR/branch-guard-stub.sh"
  # Set QUORUMKIT_PIPELINES_DIR to a controlled temp location for this test
  PIPELINES_DIR="$(mktemp -d)"
  export QUORUMKIT_PIPELINES_DIR="$PIPELINES_DIR"

  # Create the feature branch first so worktree add works
  git checkout -b "042-test-feature" -q
  git checkout main -q
  git push origin "042-test-feature" -q

  result=$(bash "$PIPELINE_SCRIPT" start 42 --mode=isolated 2>&1)
  exit_code=$?

  # Check: worktree directory was created under PIPELINES_DIR
  WT_PATH="$PIPELINES_DIR/042-test-feature"
  if [[ $exit_code -eq 0 && -d "$WT_PATH" ]]; then
    pass "start --mode=isolated creates worktree at QUORUMKIT_PIPELINES_DIR path"
    git worktree remove "$WT_PATH" -q 2>/dev/null || true
  else
    fail "start --mode=isolated did not create worktree (exit=$exit_code, expected_path=$WT_PATH). Output: $result"
  fi
  rm -rf "$PIPELINES_DIR"
  cleanup_test_env
)

# T-07-06: start --mode=isolated uses QUORUMKIT_PIPELINES_DIR when set
(
  make_test_env
  cd "$WORK_DIR"
  CUSTOM_DIR="$(mktemp -d)"
  export QUORUMKIT_PIPELINES_DIR="$CUSTOM_DIR"
  export QUORUMKIT_TEST_BRANCH_GUARD="$STUB_DIR/branch-guard-stub.sh"

  git checkout -b "042-custom-dir" -q
  git checkout main -q
  git push origin "042-custom-dir" -q

  result=$(bash "$PIPELINE_SCRIPT" start 42 --mode=isolated 2>&1)
  exit_code=$?

  WT_PATH="$CUSTOM_DIR/042-custom-dir"
  if [[ $exit_code -eq 0 && -d "$WT_PATH" ]]; then
    pass "start --mode=isolated respects QUORUMKIT_PIPELINES_DIR"
    git worktree remove "$WT_PATH" -q 2>/dev/null || true
  else
    fail "QUORUMKIT_PIPELINES_DIR not respected (exit=$exit_code, expected=$WT_PATH). Output: $result"
  fi
  rm -rf "$CUSTOM_DIR"
  cleanup_test_env
)

# T-07-07: start defaults to isolated mode
(
  make_test_env
  cd "$WORK_DIR"
  CUSTOM_DIR="$(mktemp -d)"
  export QUORUMKIT_PIPELINES_DIR="$CUSTOM_DIR"
  export QUORUMKIT_TEST_BRANCH_GUARD="$STUB_DIR/branch-guard-stub.sh"

  git checkout -b "042-default-mode" -q
  git checkout main -q
  git push origin "042-default-mode" -q

  result=$(bash "$PIPELINE_SCRIPT" start 42 2>&1)  # no --mode flag
  exit_code=$?

  WT_PATH="$CUSTOM_DIR/042-default-mode"
  if [[ $exit_code -eq 0 && -d "$WT_PATH" ]]; then
    pass "start without --mode defaults to isolated (worktree created)"
    git worktree remove "$WT_PATH" -q 2>/dev/null || true
  else
    fail "default mode should be isolated (exit=$exit_code, expected=$WT_PATH). Output: $result"
  fi
  rm -rf "$CUSTOM_DIR"
  cleanup_test_env
)

# T-07-08: start --mode=shared checks out branch in current dir (no new worktree)
(
  make_test_env
  cd "$WORK_DIR"
  export QUORUMKIT_TEST_BRANCH_GUARD="$STUB_DIR/branch-guard-stub.sh"

  git checkout -b "042-shared-test" -q
  git checkout main -q
  git push origin "042-shared-test" -q

  INITIAL_WT_COUNT=$(git worktree list | wc -l | tr -d ' ')
  result=$(bash "$PIPELINE_SCRIPT" start 42 --mode=shared 2>&1)
  exit_code=$?
  current_branch=$(git branch --show-current)
  FINAL_WT_COUNT=$(git worktree list | wc -l | tr -d ' ')

  if [[ $exit_code -eq 0 && "$current_branch" == "042-shared-test" && "$FINAL_WT_COUNT" -eq "$INITIAL_WT_COUNT" ]]; then
    pass "start --mode=shared checks out branch in place, no new worktree"
  else
    fail "start --mode=shared failed (exit=$exit_code, branch=$current_branch, wt_count=$FINAL_WT_COUNT). Output: $result"
  fi
  cleanup_test_env
)

# T-07-09: join <NNN> prints worktree path and does not create second worktree
(
  make_test_env
  cd "$WORK_DIR"
  CUSTOM_DIR="$(mktemp -d)"
  export QUORUMKIT_PIPELINES_DIR="$CUSTOM_DIR"
  export QUORUMKIT_TEST_BRANCH_GUARD="$STUB_DIR/branch-guard-stub.sh"

  git checkout -b "042-join-test" -q
  git checkout main -q
  git push origin "042-join-test" -q

  # Start pipeline first
  bash "$PIPELINE_SCRIPT" start 42 --mode=isolated >/dev/null 2>&1 || true
  WT_PATH="$CUSTOM_DIR/042-join-test"

  WT_COUNT_BEFORE=$(git worktree list | wc -l | tr -d ' ')
  set +e
  join_output=$(bash "$PIPELINE_SCRIPT" join 42 2>&1)
  exit_code=$?
  set -e
  WT_COUNT_AFTER=$(git worktree list | wc -l | tr -d ' ')

  if [[ $exit_code -eq 0 && "$WT_COUNT_AFTER" -eq "$WT_COUNT_BEFORE" && "$join_output" == *"042"* ]]; then
    pass "join prints worktree path and does not create second worktree"
  else
    fail "join failed (exit=$exit_code, wt_before=$WT_COUNT_BEFORE, wt_after=$WT_COUNT_AFTER, output=$join_output)"
  fi
  git worktree remove "$WT_PATH" 2>/dev/null || true
  rm -rf "$CUSTOM_DIR"
  cleanup_test_env
)

# T-07-10: stop <NNN> isolated removes worktree and posts comment
(
  make_test_env
  cd "$WORK_DIR"
  CUSTOM_DIR="$(mktemp -d)"
  export QUORUMKIT_PIPELINES_DIR="$CUSTOM_DIR"
  export QUORUMKIT_TEST_BRANCH_GUARD="$STUB_DIR/branch-guard-stub.sh"
  > "$GH_CALLS_FILE"  # reset gh call log

  git checkout -b "042-stop-test" -q
  git checkout main -q
  git push origin "042-stop-test" -q

  bash "$PIPELINE_SCRIPT" start 42 --mode=isolated >/dev/null 2>&1 || true
  WT_PATH="$CUSTOM_DIR/042-stop-test"

  set +e
  result=$(bash "$PIPELINE_SCRIPT" stop 42 2>&1)
  exit_code=$?
  set -e
  gh_calls=$(cat "$GH_CALLS_FILE" 2>/dev/null || echo "")

  if [[ $exit_code -eq 0 && ! -d "$WT_PATH" && "$gh_calls" == *"issue comment"* ]]; then
    pass "stop isolated removes worktree and posts gh comment"
  else
    fail "stop isolated failed (exit=$exit_code, wt_exists=$(test -d "$WT_PATH" && echo yes || echo no), gh=$gh_calls)"
  fi
  rm -rf "$CUSTOM_DIR"
  cleanup_test_env
)

# T-07-11: stop <NNN> shared with --no-switch does not prompt and exits 0
(
  make_test_env
  cd "$WORK_DIR"
  export QUORUMKIT_TEST_BRANCH_GUARD="$STUB_DIR/branch-guard-stub.sh"

  git checkout -b "042-stop-shared" -q
  git checkout main -q
  git push origin "042-stop-shared" -q
  bash "$PIPELINE_SCRIPT" start 42 --mode=shared >/dev/null 2>&1 || true

  set +e
  result=$(bash "$PIPELINE_SCRIPT" stop 42 --no-switch 2>&1)
  exit_code=$?
  set -e

  if [[ $exit_code -eq 0 ]]; then
    pass "stop shared --no-switch exits 0 without prompt"
  else
    fail "stop shared --no-switch failed (exit=$exit_code). Output: $result"
  fi
  cleanup_test_env
)

# T-07-12: status with no active pipelines prints "No active pipelines"
(
  make_test_env
  cd "$WORK_DIR"
  output=$(bash "$PIPELINE_SCRIPT" status 2>&1)
  exit_code=$?
  if echo "$output" | grep -qi "no active\|no pipeline"; then
    pass "status with no pipelines prints 'No active pipelines'"
  else
    fail "status output did not indicate no pipelines: '$output'"
  fi
  cleanup_test_env
)

# T-07-13: status with active worktree lists it
(
  make_test_env
  cd "$WORK_DIR"
  CUSTOM_DIR="$(mktemp -d)"
  export QUORUMKIT_PIPELINES_DIR="$CUSTOM_DIR"
  export QUORUMKIT_TEST_BRANCH_GUARD="$STUB_DIR/branch-guard-stub.sh"

  git checkout -b "042-status-test" -q
  git checkout main -q
  git push origin "042-status-test" -q
  bash "$PIPELINE_SCRIPT" start 42 --mode=isolated >/dev/null 2>&1 || true
  WT_PATH="$CUSTOM_DIR/042-status-test"

  output=$(bash "$PIPELINE_SCRIPT" status 2>&1)
  exit_code=$?

  if echo "$output" | grep -q "042"; then
    pass "status lists active worktree with issue number"
  else
    fail "status did not list active worktree (exit=$exit_code). Output: $output"
  fi
  git worktree remove "$WT_PATH" -q 2>/dev/null || true
  rm -rf "$CUSTOM_DIR"
  cleanup_test_env
)

# T-07-14: Two isolated pipelines are independent (modifying one does not affect other)
(
  make_test_env
  cd "$WORK_DIR"
  CUSTOM_DIR="$(mktemp -d)"
  export QUORUMKIT_PIPELINES_DIR="$CUSTOM_DIR"
  export QUORUMKIT_TEST_BRANCH_GUARD="$STUB_DIR/branch-guard-stub.sh"

  git checkout -b "042-parallel-a" -q && git checkout main -q
  git checkout -b "055-parallel-b" -q && git checkout main -q
  git push origin "042-parallel-a" "055-parallel-b" -q

  bash "$PIPELINE_SCRIPT" start 42 --mode=isolated >/dev/null 2>&1 || true
  bash "$PIPELINE_SCRIPT" start 55 --mode=isolated >/dev/null 2>&1 || true

  WT_A="$CUSTOM_DIR/042-parallel-a"
  WT_B="$CUSTOM_DIR/055-parallel-b"

  # Write a file in worktree A
  if [[ -d "$WT_A" && -d "$WT_B" ]]; then
    echo "test-content-a" > "$WT_A/test-isolation.txt"
    # File should NOT appear in worktree B
    if [[ ! -f "$WT_B/test-isolation.txt" ]]; then
      pass "two isolated pipelines have independent working trees"
    else
      fail "file written in worktree A appeared in worktree B (isolation broken)"
    fi
    git worktree remove "$WT_A" -q 2>/dev/null || true
    git worktree remove "$WT_B" -q 2>/dev/null || true
  else
    skip "could not set up dual worktrees for isolation test"
  fi
  rm -rf "$CUSTOM_DIR"
  cleanup_test_env
)

# T-07-15: Second --mode=shared pipeline warns user
(
  make_test_env
  cd "$WORK_DIR"
  export QUORUMKIT_TEST_BRANCH_GUARD="$STUB_DIR/branch-guard-stub.sh"

  git checkout -b "042-shared-warn" -q && git checkout main -q
  git checkout -b "055-shared-warn" -q && git checkout main -q
  git push origin "042-shared-warn" "055-shared-warn" -q

  # Start first shared pipeline
  bash "$PIPELINE_SCRIPT" start 42 --mode=shared >/dev/null 2>&1 || true

  # Start second shared pipeline — should warn
  output=$(echo "n" | bash "$PIPELINE_SCRIPT" start 55 --mode=shared 2>&1) || true

  if echo "$output" | grep -qi "warn\|shared.*active\|already.*shared\|multiple.*shared\|isolated"; then
    pass "second --mode=shared pipeline warns user"
  else
    fail "no warning issued for second shared pipeline. Output: $output"
  fi
  cleanup_test_env
)

# T-223-01: Bug A — duplicate isolated pipeline is rejected
(
  make_test_env
  cd "$WORK_DIR"
  export QUORUMKIT_TEST_BRANCH_GUARD="$STUB_DIR/branch-guard-stub.sh"

  git checkout -b "042-test-feature" -q && git checkout main -q
  git push origin "042-test-feature" -q

  # Start the pipeline once (isolated)
  bash "$PIPELINE_SCRIPT" start 42 --mode=isolated >/dev/null 2>&1 || true

  # Try to start the same pipeline a second time
  output=$(bash "$PIPELINE_SCRIPT" start 42 --mode=isolated 2>&1)
  rc=$?

  if [[ $rc -ne 0 ]] && echo "$output" | grep -qi "already exists\|join\|stop"; then
    pass "Bug A: duplicate isolated pipeline start exits non-zero with clear message"
  else
    fail "Bug A: second start should fail with 'already exists' message. rc=$rc output=$output"
  fi
  cleanup_test_env
)

# T-223-02: Bug A — duplicate shared pipeline is rejected
(
  make_test_env
  cd "$WORK_DIR"
  export QUORUMKIT_TEST_BRANCH_GUARD="$STUB_DIR/branch-guard-stub.sh"

  git checkout -b "042-test-feature" -q && git checkout main -q
  git push origin "042-test-feature" -q

  # Start the pipeline once (shared) — puts us on the feature branch
  bash "$PIPELINE_SCRIPT" start 42 --mode=shared >/dev/null 2>&1 || true

  # Try to start the same pipeline a second time (shared)
  output=$(bash "$PIPELINE_SCRIPT" start 42 --mode=shared 2>&1)
  rc=$?

  if [[ $rc -ne 0 ]] && echo "$output" | grep -qi "already exists\|join\|stop"; then
    pass "Bug A: duplicate shared pipeline start exits non-zero with clear message"
  else
    fail "Bug A: second shared start should fail with 'already exists' message. rc=$rc output=$output"
  fi
  cleanup_test_env
)

# T-223-03: Bug B — pipeline refused when slug resolves to main
(
  make_test_env
  cd "$WORK_DIR"
  export QUORUMKIT_TEST_BRANCH_GUARD="$STUB_DIR/branch-guard-stub.sh"

  # Patch pipeline.sh to return 'main' from resolve_branch_slug for issue 0.
  PATCHED="$STUB_DIR/pipeline-patched.sh"
  # Insert early return of 'main' for issue 0 at the start of resolve_branch_slug
  python3 - "$PIPELINE_SCRIPT" "$PATCHED" << 'PYEOF'
import sys
src = open(sys.argv[1]).read()
# Insert at the top of resolve_branch_slug function body
patched = src.replace(
    'resolve_branch_slug() {\n  local nnn="$1"',
    'resolve_branch_slug() {\n  local nnn="$1"\n  if [[ "$nnn" == "0" ]]; then echo "main"; return; fi',
    1,
)
open(sys.argv[2], 'w').write(patched)
PYEOF
  chmod +x "$PATCHED"

  output=$(bash "$PATCHED" start 0 2>&1)
  rc=$?

  if [[ $rc -ne 0 ]] && echo "$output" | grep -qi "protected\|refused\|main"; then
    pass "Bug B: pipeline refused when branch slug resolves to 'main'"
  else
    fail "Bug B: expected refusal for main slug. rc=$rc output=$output"
  fi
  cleanup_test_env
)

# T-223-04: FR-003 — pipeline refused when slug resolves to develop or trunk (case-insensitive)
(
  for protected_slug in "develop" "Develop" "DEVELOP" "trunk" "Trunk" "TRUNK"; do
    make_test_env
    cd "$WORK_DIR"
    export QUORUMKIT_TEST_BRANCH_GUARD="$STUB_DIR/branch-guard-stub.sh"

    # Patch pipeline.sh to return the protected slug from resolve_branch_slug for issue 0
    PATCHED="$STUB_DIR/pipeline-patched-${protected_slug}.sh"
    python3 - "$PIPELINE_SCRIPT" "$PATCHED" "$protected_slug" << 'PYEOF'
import sys
src = open(sys.argv[1]).read()
slug = sys.argv[3]
patched = src.replace(
    'resolve_branch_slug() {\n  local nnn="$1"',
    f'resolve_branch_slug() {{\n  local nnn="$1"\n  if [[ "$nnn" == "0" ]]; then echo "{slug}"; return; fi',
    1,
)
open(sys.argv[2], 'w').write(patched)
PYEOF
    chmod +x "$PATCHED"

    output=$(bash "$PATCHED" start 0 2>&1)
    rc=$?

    if [[ $rc -ne 0 ]] && echo "$output" | grep -qi "protected\|refused\|ERROR"; then
      pass "FR-003: pipeline refused for protected slug '${protected_slug}'"
    else
      fail "FR-003: expected refusal for protected slug '${protected_slug}'. rc=$rc output=$output"
    fi
    cleanup_test_env
  done
)

# T-223-05: FR-004 — pipeline refused when worktree path resolves to repo root
(
  make_test_env
  cd "$WORK_DIR"
  export QUORUMKIT_TEST_BRANCH_GUARD="$STUB_DIR/branch-guard-stub.sh"

  git checkout -b "042-test-feature" -q && git checkout main -q
  git push origin "042-test-feature" -q

  # Patch default_worktree_path to return the repo root (triggering the FR-004 guard)
  PATCHED="$STUB_DIR/pipeline-patched-fr004.sh"
  python3 - "$PIPELINE_SCRIPT" "$PATCHED" << 'PYEOF'
import sys
src = open(sys.argv[1]).read()
patched = src.replace(
    'default_worktree_path() {\n  local branch_slug="$1"',
    'default_worktree_path() {\n  local branch_slug="$1"\n  echo "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"; return 0',
    1,
)
open(sys.argv[2], 'w').write(patched)
PYEOF
  chmod +x "$PATCHED"

  output=$(bash "$PATCHED" start 42 --mode=isolated 2>&1)
  rc=$?

  if [[ $rc -ne 0 ]] && echo "$output" | grep -qi "root"; then
    pass "FR-004: pipeline refused when worktree path equals repo root"
  else
    fail "FR-004: expected refusal when worktree equals repo root. rc=$rc output=$output"
  fi
  cleanup_test_env
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

rm -rf "$STUB_DIR"

[[ "$FAIL" -eq 0 ]]
