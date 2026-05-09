#!/usr/bin/env bash
# =============================================================================
# quality-check.sh — QuorumKit Library Quality Gates
# Run before every PR to this repository.
# Usage: bash installer/quality-check.sh [--fix]
# =============================================================================
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC}  $*"; }
warn() { echo -e "${YELLOW}⚠${NC}  $*"; }
fail() { echo -e "${RED}✗${NC}  $*"; FAILED=$((FAILED + 1)); }
h1()   { echo -e "\n${BOLD}── $* ──${NC}"; }

FAILED=0
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"

cd "$ROOT"

# =============================================================================
h1 "1. Shell script syntax"
# =============================================================================
if bash -n installer/init.sh 2>&1; then
  ok "installer/init.sh syntax valid"
else
  fail "installer/init.sh has syntax errors"
fi

# =============================================================================
h1 "2. No filepath header comments in shipped files"
# =============================================================================
found=$(grep -rln '^# filepath:\|^<!-- filepath:' .apm/ templates/ 2>/dev/null || true)
if [ -z "$found" ]; then
  ok "No filepath headers found"
else
  for f in $found; do
    fail "filepath header found: $f"
  done
fi

# =============================================================================
h1 "3. Agent skills are thin wrappers (≤ 45 lines)"
# Note: speckit-* skills are full implementations and are exempt from this check.
# =============================================================================
agent_skills=(
  ".apm/skills/ba-agent/SKILL.md"
  ".apm/skills/dev-agent/SKILL.md"
  ".apm/skills/qa-agent/SKILL.md"
  ".apm/skills/reviewer-agent/SKILL.md"
  ".apm/skills/architect-agent/SKILL.md"
  ".apm/skills/devops-agent/SKILL.md"
  ".apm/skills/security-agent/SKILL.md"
  ".apm/skills/triage-agent/SKILL.md"
  ".apm/skills/ot-integration-agent/SKILL.md"
  ".apm/skills/digital-twin-agent/SKILL.md"
  ".apm/skills/compliance-agent/SKILL.md"
  ".apm/skills/incident-agent/SKILL.md"
  ".apm/skills/release-agent/SKILL.md"
  ".apm/skills/docs-agent/SKILL.md"
  ".apm/skills/tech-debt-agent/SKILL.md"
)
for f in "${agent_skills[@]}"; do
  if [ ! -f "$f" ]; then continue; fi
  lines=$(wc -l < "$f" | tr -d ' ')
  if [ "$lines" -gt 45 ]; then
    fail "$f has $lines lines — agent skills must be thin wrappers; move rules to the agent definition"
  else
    ok "$f ($lines lines)"
  fi
done

# =============================================================================
h1 "4. Copilot instruction files are thin wrappers (≤ 20 lines)"
# =============================================================================
for f in templates/github/instructions/*.instructions.md; do
  lines=$(wc -l < "$f" | tr -d ' ')
  if [ "$lines" -gt 20 ]; then
    fail "$f has $lines lines — instruction files must be thin pointers; move rules to the agent definition"
  else
    ok "$f ($lines lines)"
  fi
done

# =============================================================================
h1 "5. No project-specific technology names in agent definitions"
# =============================================================================
TECH_PATTERN='React\b|Vue\b|Angular\b|Django\b|Rails\b|Spring Boot\b|Laravel\b|Next\.js\b|Express\b|FastAPI\b'
if grep -rEn "$TECH_PATTERN" .apm/agents/ 2>/dev/null; then
  fail "Project-specific technology names found in agent definitions (agents must be universal)"
else
  ok "No project-specific tech names in agents"
fi

# =============================================================================
h1 "6. Conditional auth rules — must have qualifier"
# =============================================================================
# Look for lines that assert auth requirements WITHOUT a conditional qualifier.
# Lines that already contain "if applicable", "if auth", "per constitution",
# "constitution requires", "only if", "N/A", or are inside an example template
# (indented with spaces or start with |) are correctly conditioned.
unconditional=$(grep -n 'scope.*to authenticated\|authenticated user can only\|auth.*required on all' \
  .apm/agents/*.md 2>/dev/null | \
  grep -v 'if applicable\|if auth\|per constitution\|constitution requires\|only if\|if the constitution\|N/A\|\[ \]\|- \[ \]' || true)
if [ -n "$unconditional" ]; then
  warn "Possible unconditional auth rules (review manually):"
  echo "$unconditional"
else
  ok "Auth rules appear conditional"
fi

# =============================================================================
h1 "7. All core agent definitions present"
# =============================================================================
required_agents=(
  "ba-product-agent.md"
  "developer-agent.md"
  "qa-test-agent.md"
  "reviewer-agent.md"
  "architect-agent.md"
  "devops-agent.md"
  "security-agent.md"
  "triage-agent.md"
  "ot-integration-agent.md"
  "digital-twin-agent.md"
  "compliance-agent.md"
  "incident-agent.md"
  "release-agent.md"
  "docs-agent.md"
  "tech-debt-agent.md"
)
for agent in "${required_agents[@]}"; do
  if [ -f ".apm/agents/$agent" ]; then
    ok ".apm/agents/$agent"
  else
    fail "Missing agent definition: .apm/agents/$agent"
  fi
done

# =============================================================================
h1 "8. All core skill wrappers present"
# =============================================================================
required_skills=(
  "ba-agent"
  "dev-agent"
  "qa-agent"
  "reviewer-agent"
  "architect-agent"
  "devops-agent"
  "security-agent"
  "triage-agent"
  "ot-integration-agent"
  "digital-twin-agent"
  "compliance-agent"
  "incident-agent"
  "onboard"
  "release-agent"
  "docs-agent"
  "tech-debt-agent"
)
for skill in "${required_skills[@]}"; do
  if [ -f ".apm/skills/$skill/SKILL.md" ]; then
    ok ".apm/skills/$skill/SKILL.md"
  else
    fail "Missing skill wrapper: .apm/skills/$skill/SKILL.md"
  fi
done

# =============================================================================
h1 "9. All workflow templates present (Claude + Copilot)"
# =============================================================================
required_workflows=(
  "agent-qa.yml"
  "agent-reviewer.yml"
  "agent-architect.yml"
  "agent-security.yml"
  "agent-triage.yml"
  "agent-ot-integration.yml"
  "agent-digital-twin.yml"
  "agent-compliance.yml"
  "agent-incident.yml"
  "agent-release.yml"
  "agent-docs.yml"
  "agent-tech-debt.yml"
  "alert-to-issue.yml"
  "copilot-agent-qa.yml"
  "copilot-agent-reviewer.yml"
  "copilot-agent-architect.yml"
  "copilot-agent-security.yml"
  "copilot-agent-triage.yml"
  "copilot-agent-ot-integration.yml"
  "copilot-agent-digital-twin.yml"
  "copilot-agent-compliance.yml"
  "copilot-agent-incident.yml"
  "copilot-agent-release.yml"
  "copilot-agent-docs.yml"
  "copilot-agent-tech-debt.yml"
)
for wf in "${required_workflows[@]}"; do
  if [ -f "templates/github/workflows/$wf" ]; then
    ok "templates/github/workflows/$wf"
  else
    fail "Missing workflow template: templates/github/workflows/$wf"
  fi
done

# =============================================================================
h1 "10. Hard Constraints section present in every agent"
# =============================================================================
for agent in .apm/agents/*.md; do
  if grep -q '## Hard Constraints' "$agent"; then
    ok "$agent — Hard Constraints section present"
  else
    fail "$agent — missing '## Hard Constraints' section"
  fi
done

# =============================================================================
h1 "11. MUST/MUST NOT language in Hard Constraints"
# =============================================================================
for agent in .apm/agents/*.md; do
  in_constraints=false
  while IFS= read -r line; do
    if echo "$line" | grep -q '## Hard Constraints'; then
      in_constraints=true
    elif echo "$line" | grep -q '^## '; then
      in_constraints=false
    fi
    if $in_constraints && echo "$line" | grep -qE '^- ' && ! echo "$line" | grep -qE 'MUST|N/A'; then
      warn "$agent — constraint line missing MUST/MUST NOT: $line"
    fi
  done < "$agent"
done
ok "MUST/MUST NOT check complete"

# =============================================================================
h1 "12. Spec lint — required sections present in any example specs"
# Note: non-blocking (warns only) because example specs may be intentionally partial.
# =============================================================================
required_spec_sections=(
  "## Overview"
  "## Functional Requirements"
  "## Success Criteria"
  "## Out of Scope"
  "## Open Questions"
)
spec_files=$(find . -path './.git' -prune -o -name 'spec.md' -print 2>/dev/null | grep -v '.git' || true)
if [ -z "$spec_files" ]; then
  ok "No spec.md files found in this repo — gate skipped"
else
  for spec in $spec_files; do
    for section in "${required_spec_sections[@]}"; do
      if ! grep -q "$section" "$spec"; then
        warn "$spec — missing section: $section"
      fi
    done
    if grep -qi 'TODO' "$spec"; then
      warn "$spec — contains TODO items (should be resolved before handoff)"
    fi
    ok "$spec — spec lint passed"
  done
fi

# =============================================================================
h1 "13. Dashboard files present"
# =============================================================================
if [ -f "engine/dashboard/index.html" ]; then
  ok "engine/dashboard/index.html present"
else
  fail "Missing engine/dashboard/index.html — run: node engine/dashboard/generate-dashboard.js"
fi
if [ -f "engine/dashboard/generate-dashboard.js" ]; then
  ok "engine/dashboard/generate-dashboard.js present"
else
  fail "Missing engine/dashboard/generate-dashboard.js"
fi
if [ -f ".github/workflows/update-dashboard.yml" ]; then
  ok ".github/workflows/update-dashboard.yml present"
else
  fail "Missing .github/workflows/update-dashboard.yml"
fi
if [ -f "engine/dashboard/server.js" ]; then
  ok "engine/dashboard/server.js present"
else
  fail "Missing engine/dashboard/server.js — orchestrator backend missing"
fi
if [ -f "DASHBOARD.md" ]; then
  ok "DASHBOARD.md present"
else
  fail "Missing DASHBOARD.md"
fi

# =============================================================================
h1 "14. Every agent workflow declares timeout-minutes (FR-028, ADR-007 §4)"
# =============================================================================
agent_workflow_globs=(
  ".github/workflows/copilot-agent-*.yml"
  "templates/github/workflows/copilot-agent-*.yml"
  "templates/github/workflows/agent-*.yml"
)
for glob in "${agent_workflow_globs[@]}"; do
  for f in $glob; do
    [ -f "$f" ] || continue
    if grep -q '^\s*timeout-minutes:' "$f"; then
      ok "$f declares timeout-minutes"
    else
      fail "$f missing timeout-minutes (FR-028: every agent workflow must bound runtime)"
    fi
  done
done

# =============================================================================
echo ""
if [ "$FAILED" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}✓ All quality gates passed${NC}"
  exit 0
else
  echo -e "${RED}${BOLD}✗ $FAILED quality gate(s) failed — fix before opening a PR${NC}"
  exit 1
fi
