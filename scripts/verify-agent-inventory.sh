#!/usr/bin/env bash
# =============================================================================
# verify-agent-inventory.sh — CI check for agent inventory staleness
#
# Usage: bash scripts/verify-agent-inventory.sh
#
# Ensures docs/AGENT_INVENTORY.md is up-to-date with the current agent
# landscape. If the committed inventory diverges from a fresh generation,
# the script exits 1 and prints a diff.
#
# Related:
# - Issue #359
# - scripts/generate-agent-inventory.js (generator)
# - docs/AGENT_INVENTORY.md (generated output)
# =============================================================================
set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC}  $*"; }
fail() { echo -e "${RED}✗${NC}  $*" >&2; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

INVENTORY_FILE="docs/AGENT_INVENTORY.md"
GENERATOR_SCRIPT="scripts/generate-agent-inventory.js"
TMPFILE="$(mktemp)"
TMPFILE2="$(mktemp)"

trap 'rm -f "$TMPFILE" "$TMPFILE2"' EXIT

echo "🔍 Generating fresh inventory..."

# Temporarily move the existing inventory
if [ -f "$INVENTORY_FILE" ]; then
  cp "$INVENTORY_FILE" "$TMPFILE2"
fi

# Run generator (writes to docs/AGENT_INVENTORY.md)
if ! node "$GENERATOR_SCRIPT" > /dev/null 2>&1; then
  fail "Generator script failed"
  exit 1
fi

# Compare (ignoring timestamp line)
if [ -f "$TMPFILE2" ] && diff -u \
  <(grep -v '^> Last updated:' "$TMPFILE2") \
  <(grep -v '^> Last updated:' "$INVENTORY_FILE") > "$TMPFILE" 2>&1; then
  ok "Agent inventory is up-to-date"
  exit 0
else
  fail "Agent inventory is stale. Diff:"
  cat "$TMPFILE"
  echo ""
  echo "To fix, run:"
  echo "  node $GENERATOR_SCRIPT"
  echo "  git add $INVENTORY_FILE"
  echo "  git commit -m 'docs: regenerate agent inventory'"
  
  # Restore original
  if [ -f "$TMPFILE2" ]; then
    cp "$TMPFILE2" "$INVENTORY_FILE"
  fi
  
  exit 1
fi
