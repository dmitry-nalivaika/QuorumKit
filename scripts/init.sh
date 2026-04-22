#!/usr/bin/env bash
# =============================================================================
# init.sh — Initialize the Agentic Dev Stack in a new project
# =============================================================================
# Usage (from any project directory):
#   bash /path/to/APM/scripts/init.sh
#
# Or with APM_PACKAGE_DIR set:
#   APM_PACKAGE_DIR=/path/to/APM bash /path/to/APM/scripts/init.sh
# =============================================================================
set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC}  $*"; }
err()  { echo -e "${RED}✗${NC}  $*" >&2; }
h1()   { echo -e "\n${BOLD}$*${NC}"; }

# ── Resolve paths ─────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APM_PACKAGE_DIR="${APM_PACKAGE_DIR:-$(dirname "$SCRIPT_DIR")}"
PROJECT_DIR="${PWD}"

echo ""
echo -e "${BOLD}Agentic Dev Stack — Initializing${NC}"
echo "APM package : $APM_PACKAGE_DIR"
echo "Project     : $PROJECT_DIR"
echo ""

# ── 1. Claude Code agents & skills ────────────────────────────────────────────
h1 "1. Installing Claude Code agents and skills"

mkdir -p .claude/agents .claude/skills

# Agents
cp -r "$APM_PACKAGE_DIR/.apm/agents/"* .claude/agents/
ok "Agents installed (.claude/agents/)"

# Skills
for skill_dir in "$APM_PACKAGE_DIR/.apm/skills"/*/; do
  skill_name="$(basename "$skill_dir")"
  mkdir -p ".claude/skills/$skill_name"
  cp "$skill_dir/SKILL.md" ".claude/skills/$skill_name/SKILL.md"
done
ok "Skills installed (.claude/skills/)"

# ── 2. CLAUDE.md ──────────────────────────────────────────────────────────────
h1 "2. CLAUDE.md"

if [ ! -f CLAUDE.md ]; then
  cp "$APM_PACKAGE_DIR/templates/CLAUDE.md" CLAUDE.md
  ok "CLAUDE.md created"
else
  warn "CLAUDE.md already exists — skipping (update manually if needed)"
fi

# ── 3. GitHub templates ────────────────────────────────────────────────────────
h1 "3. Installing GitHub templates"

GITHUB_TMPL="$APM_PACKAGE_DIR/templates/github"

mkdir -p .github/workflows .github/ISSUE_TEMPLATE

# Workflows
for wf in "$GITHUB_TMPL/workflows/"*.yml; do
  wf_name="$(basename "$wf")"
  if [ -f ".github/workflows/$wf_name" ]; then
    warn "Workflow $wf_name already exists — skipping (delete to reinstall)"
  else
    cp "$wf" ".github/workflows/$wf_name"
    ok "Workflow: $wf_name"
  fi
done

# PR template
if [ ! -f .github/pull_request_template.md ]; then
  cp "$GITHUB_TMPL/pull_request_template.md" .github/pull_request_template.md
  ok "PR template installed"
else
  warn "PR template already exists — skipping"
fi

# Issue templates
for tmpl in "$GITHUB_TMPL/ISSUE_TEMPLATE/"*; do
  tmpl_name="$(basename "$tmpl")"
  if [ ! -f ".github/ISSUE_TEMPLATE/$tmpl_name" ]; then
    cp "$tmpl" ".github/ISSUE_TEMPLATE/$tmpl_name"
    ok "Issue template: $tmpl_name"
  else
    warn "Issue template $tmpl_name already exists — skipping"
  fi
done

# ── 4. github-speckit ─────────────────────────────────────────────────────────
h1 "4. Setting up github-speckit"

if command -v npx &> /dev/null; then
  echo "Running: npx github-speckit@latest"
  echo "(Answer the prompts: choose 'claude' as the AI integration)"
  echo ""
  npx github-speckit@latest
  ok "github-speckit initialized"
else
  warn "npx not found — skipping github-speckit setup"
  echo "  Install Node.js (https://nodejs.org) then run:"
  echo "    npx github-speckit@latest"
  echo "  Choose 'claude' as the AI integration."
fi

# ── 5. Git repository ─────────────────────────────────────────────────────────
h1 "5. Git repository"

if git rev-parse --git-dir &> /dev/null; then
  ok "Git repository already initialized"
else
  git init
  ok "Git repository initialized"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}✓ Agentic Dev Stack ready!${NC}"
echo ""
echo "Next steps:"
echo ""
echo "  1. Add ANTHROPIC_API_KEY to your GitHub repository secrets"
echo "     (Settings → Secrets and variables → Actions → New repository secret)"
echo ""
echo "  2. Create your project constitution:"
echo "     /speckit-constitution"
echo ""
echo "  3. Create your first GitHub Issue, then:"
echo "     /ba-agent <feature description>"
echo ""
echo "Available agents (local slash commands):"
echo "  /ba-agent        — write feature specs"
echo "  /dev-agent       — implement features (TDD)"
echo "  /qa-agent        — run quality gates"
echo "  /reviewer-agent  — review PRs"
echo "  /architect-agent — architecture decisions & ADRs"
echo "  /devops-agent    — CI/CD & infrastructure"
echo "  /security-agent  — security reviews"
echo "  /triage-agent    — issue triage"
echo ""
echo "Available agents (GitHub mentions in PRs/Issues):"
echo "  @qa-agent        — triggered on PR comments"
echo "  @reviewer-agent  — triggered on PR comments"
echo "  @architect-agent — triggered on PR or issue comments"
echo "  @security-agent  — triggered on PR comments"
echo "  @triage-agent    — triggered automatically on new issues"
echo ""
