#!/usr/bin/env bash
# =============================================================================
# verify-mirror.sh — ADR-006 §4 source-of-truth + mirror integrity check
#
# `.apm/` is the canonical home for agent definitions, runtime registry, and
# pipeline files (FR-002, FR-007, FR-014). The Copilot-tree under
# `templates/github/instructions/` (and any installed `.github/instructions/`)
# is a generated mirror produced by `installer/init.sh`. This script blocks PRs
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
      fail "$base has no Copilot-tree mirror at $target — run installer/init.sh to regenerate"
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
  if [ "$parsed" -eq 0 ] && [ -d engine/orchestrator/node_modules/js-yaml ]; then
    if (cd engine/orchestrator && node -e "require('js-yaml').load(require('fs').readFileSync('../../$sot','utf8'))") 2>/dev/null; then
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

# ─── M4: anti-mirror — templates/.apm/pipelines/ MUST NOT exist ──────────────
h1 "M4. Pipelines are not mirrored (templates/.apm/pipelines/ must NOT exist)"

if [ -e "templates/.apm/pipelines" ]; then
  fail "M4: 'templates/.apm/pipelines/' MUST NOT exist (ADR-006 §3, FR-005 — pipelines are not mirrored). Remediation: rm -rf templates/.apm/pipelines && update installer/init.sh to copy from .apm/pipelines/."
else
  ok "M4: templates/.apm/pipelines/ absent"
fi

# ─── M5: workflow byte-parity (overlap only) ─────────────────────────────────
h1 "M5. Workflow byte-parity for files present in BOTH .github/workflows/ and templates/github/workflows/"

if [ -d ".github/workflows" ] && [ -d "templates/github/workflows" ]; then
  for wf in .github/workflows/*.yml; do
    [ -f "$wf" ] || continue
    name="$(basename "$wf")"
    template="templates/github/workflows/$name"
    if [ -f "$template" ]; then
      if cmp -s "$wf" "$template"; then
        ok "M5: $name byte-identical"
      else
        fail "M5: '$wf' diverges from '$template' (FR-016). Remediation: make the two files byte-identical, or remove one tree's copy if divergence is intentional. Diff:"
        diff -u "$template" "$wf" | sed 's/^/    /' | head -40 || true
      fi
    fi
  done
else
  warn "M5: skipped (one or both workflow trees missing)"
fi

# ─── M6: anti-mirror — .github/agents/ MUST NOT exist in SoT ─────────────────
h1 "M6. .github/agents/ MUST NOT exist in the SoT repo"

if [ -e ".github/agents" ]; then
  fail "M6: '.github/agents/' MUST NOT exist in the SoT repo (FR-006). Remediation: rm -rf .github/agents — consumer repos receive it from installer/init.sh."
else
  ok "M6: .github/agents/ absent"
fi

# ─── M7: self-host Principle IV parity (.apm/agents ↔ .claude/agents and .github/instructions) ──
h1 "M7. Self-host Principle IV parity (.apm/agents ↔ .claude/agents AND .github/instructions)"

if [ -d ".apm/agents" ] && [ -d ".claude/agents" ] && [ -d ".github/instructions" ]; then
  for f in .apm/agents/*.md; do
    [ -f "$f" ] || continue
    base=$(basename "$f")
    short=$(mirror_short "$base")
    claude_target=".claude/agents/$base"
    instr_target=".github/instructions/${short}.instructions.md"
    if [ ! -f "$claude_target" ]; then
      fail "M7: '$base' has no Claude counterpart at '$claude_target' (FR-018, Principle IV). Remediation: cp '$f' '$claude_target'."
    elif [ ! -f "$instr_target" ]; then
      fail "M7: '$base' has no Copilot instruction counterpart at '$instr_target' (FR-018, Principle IV). Remediation: create '$instr_target' pointing at '.apm/agents/$base'."
    else
      ok "M7: $base ↔ Claude + Copilot self-host counterparts present"
    fi
  done
else
  warn "M7: skipped (.apm/agents, .claude/agents, or .github/instructions missing)"
fi

# ─── M8: engine must be invoked via uses:, not run: node scripts/orchestrator/ ──
h1 "M8. Distributed workflows MUST invoke engine via 'uses:' (no 'node scripts/orchestrator/' or 'node engine/orchestrator/' references)"

m8_paths=( ".github/workflows" "templates/github/workflows" )
m8_violations=0
for p in "${m8_paths[@]}"; do
  [ -d "$p" ] || continue
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    # `# apm-allow:` exempts a documented transition reference (e.g. before the
    # engine Action is published). The reason MUST appear inline.
    if echo "$line" | grep -qE '#[[:space:]]*apm-allow:'; then
      continue
    fi
    fail "M8: $line — engine must be invoked via 'uses:' Action ref (FR-019). Remediation: replace with 'uses: dmitry-nalivaika/APM/engine@<sha>'."
    m8_violations=$((m8_violations + 1))
  done < <(grep -RnE --exclude-dir=node_modules "run: *node (scripts|engine)/orchestrator/" "$p" 2>/dev/null || true)
done
if [ "$m8_violations" -eq 0 ]; then
  ok "M8: no 'node (scripts|engine)/orchestrator/' references in distributed workflows"
fi

# ─── M9: third-party Actions MUST be SHA-pinned (40 hex chars) ───────────────
h1 "M9. Third-party Actions MUST be pinned by full 40-character commit SHA"

m9_paths=( ".github/workflows" "templates/github/workflows" "engine" )
m9_violations=0
for p in "${m9_paths[@]}"; do
  [ -d "$p" ] || continue
  # Find every 'uses:' line that is NOT a local action (./...) and NOT pinned by 40-hex.
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    # An explicit `# apm-allow:` comment exempts a placeholder line (e.g. an
    # Action that has not yet published a tagged release). The reason MUST be
    # documented inline; reviewers track these.
    if echo "$line" | grep -qE '#[[:space:]]*apm-allow:'; then
      continue
    fi
    # Extract the value after 'uses:' for filtering.
    # `grep -Rn` output is `path:line:content`; strip the leading two ':'-separated fields,
    # then drop the leading '- uses:' / 'uses:' prefix and any trailing comment.
    target=$(echo "$line" | sed -E 's/^[^:]+:[0-9]+://; s/^[[:space:]]*-?[[:space:]]*uses:[[:space:]]*//; s/[[:space:]]*#.*$//; s/[[:space:]]*$//' )
    # Skip empty / local actions / docker images.
    case "$target" in
      ''|./*|docker://*) continue ;;
    esac
    # Pass if pinned by full 40-hex SHA (with optional comment already stripped).
    if echo "$target" | grep -qE '^[A-Za-z0-9._/-]+@[0-9a-f]{40}$'; then
      continue
    fi
    fail "M9: $line — third-party Action MUST be pinned by full 40-character commit SHA (FR-031). Remediation: replace with 'uses: <owner>/<repo>@<40-hex-sha>  # <tag>'."
    m9_violations=$((m9_violations + 1))
  done < <(grep -RnE --exclude-dir=node_modules "^[[:space:]]*-?[[:space:]]*uses:[[:space:]]*[^./]" "$p" 2>/dev/null || true)
done
if [ "$m9_violations" -eq 0 ]; then
  ok "M9: every third-party 'uses:' is SHA-pinned (40 hex chars)"
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
