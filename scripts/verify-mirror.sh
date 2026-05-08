#!/usr/bin/env bash
# =============================================================================
# verify-mirror.sh — ADR-006 §4 source-of-truth + mirror integrity check
#
# `.apm/` is the canonical home for agent definitions, runtime registry, and
# pipeline files (FR-002, FR-007, FR-014). The Copilot-tree under
# `templates/github/instructions/` (and any installed `.github/instructions/`)
# is a generated mirror produced by `scripts/init.sh`. This script blocks PRs
# whose changes leave the mirror stale.
#
# Checks:
#   M1. Every `.apm/agents/<slug>-agent.md` (or `<slug>.md`) has a matching
#       `templates/github/instructions/<short>.instructions.md` entry.
#   M2. The `.apm/runtimes.yml` and `.apm/agent-identities.yml` SoT files exist
#       and parse as YAML (no Copilot-tree mirror is required for these — they
#       are read by the orchestrator directly).
#   M3. `docs/AGENT_PROTOCOL.md` exists (regulation document — single SoT,
#       not mirrored, per ADR-006 §5).
#
# Exit code: 0 on success, 1 on any failure.
# =============================================================================
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC}  $*"; }
warn() { echo -e "${YELLOW}⚠${NC}  $*"; }
fail() { echo -e "${RED}✗${NC}  $*"; FAILED=$((FAILED + 1)); }
h1()   { echo -e "\n${BOLD}── $* ──${NC}"; }

FAILED=0
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Map an `.apm/agents/<filename>` to its mirror short name.
# The convention used by init.sh:
#   ba-product-agent.md     → ba-agent.instructions.md
#   developer-agent.md      → dev-agent.instructions.md
#   qa-test-agent.md        → qa-agent.instructions.md
#   <other>-agent.md        → <other>-agent.instructions.md
mirror_short() {
  case "$1" in
    ba-product-agent.md)  echo "ba-agent" ;;
    developer-agent.md)   echo "dev-agent" ;;
    qa-test-agent.md)     echo "qa-agent" ;;
    *)
      # strip .md
      local base="${1%.md}"
      echo "$base"
      ;;
  esac
}

# ─── M1: agent definition mirror parity ──────────────────────────────────────
h1 "M1. Agent definitions mirrored to Copilot tree"

if [ ! -d ".apm/agents" ]; then
  warn ".apm/agents/ not found — skipping M1"
else
  for f in .apm/agents/*.md; do
    [ -f "$f" ] || continue
    base=$(basename "$f")
    short=$(mirror_short "$base")
    target="templates/github/instructions/${short}.instructions.md"
    if [ -f "$target" ]; then
      ok "$base ↔ $target"
    else
      fail "$base has no Copilot-tree mirror at $target — run scripts/init.sh to regenerate"
    fi
  done
fi

# ─── M2: source-of-truth registry files exist + parse ────────────────────────
h1 "M2. Source-of-truth registry files (.apm/runtimes.yml, .apm/agent-identities.yml)"

for sot in .apm/runtimes.yml .apm/agent-identities.yml; do
  if [ ! -f "$sot" ]; then
    fail "Missing $sot (FR-007 / FR-013 — required SoT)"
    continue
  fi
  parsed=0
  if command -v python3 >/dev/null 2>&1 && python3 -c "import yaml" 2>/dev/null; then
    if python3 -c "import sys, yaml; yaml.safe_load(open('$sot'))" 2>/dev/null; then
      ok "$sot parses (python3 + PyYAML)"
      parsed=1
    else
      fail "$sot is not valid YAML (python3 + PyYAML)"
      parsed=1
    fi
  fi
  if [ "$parsed" -eq 0 ] && [ -d scripts/orchestrator/node_modules/js-yaml ]; then
    if (cd scripts/orchestrator && node -e "require('js-yaml').load(require('fs').readFileSync('../../$sot','utf8'))") 2>/dev/null; then
      ok "$sot parses (node + js-yaml)"
      parsed=1
    else
      fail "$sot is not valid YAML (node + js-yaml)"
      parsed=1
    fi
  fi
  if [ "$parsed" -eq 0 ]; then
    warn "no YAML parser available — skipped parse check for $sot"
  fi
done

# ─── M3: regulation document is present ──────────────────────────────────────
h1 "M3. Regulation document (docs/AGENT_PROTOCOL.md)"

if [ -f "docs/AGENT_PROTOCOL.md" ]; then
  ok "docs/AGENT_PROTOCOL.md present"
else
  fail "Missing docs/AGENT_PROTOCOL.md (FR-014, ADR-006 §5 — single regulation SoT)"
fi

# ─── Verdict ─────────────────────────────────────────────────────────────────
echo ""
if [ "$FAILED" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}✓ verify-mirror passed (ADR-006 invariants hold)${NC}"
  exit 0
else
  echo -e "${RED}${BOLD}✗ verify-mirror failed: $FAILED issue(s) — fix before merging${NC}"
  exit 1
fi
