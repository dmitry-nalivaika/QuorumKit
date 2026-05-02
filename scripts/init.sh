#!/usr/bin/env bash
# =============================================================================
# init.sh — Initialize the Agentic Dev Stack in a new project
# =============================================================================
# Usage (from any project directory):
#   bash /path/to/APM/scripts/init.sh [--ai=claude|copilot|both]
#
# Options:
#   --ai=claude   Install for Claude Code only (default)
#   --ai=copilot  Install for GitHub Copilot only
#   --ai=both     Install for both Claude Code and GitHub Copilot
#
# Or with APM_PACKAGE_DIR set:
#   APM_PACKAGE_DIR=/path/to/APM bash /path/to/APM/scripts/init.sh --ai=both
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

# ── Parse arguments ───────────────────────────────────────────────────────────
AI_MODE="claude"  # default

for arg in "$@"; do
  case "$arg" in
    --ai=claude)  AI_MODE="claude"  ;;
    --ai=copilot) AI_MODE="copilot" ;;
    --ai=both)    AI_MODE="both"    ;;
    *)
      err "Unknown argument: $arg"
      echo "Usage: $0 [--ai=claude|copilot|both]"
      exit 1
      ;;
  esac
done

# ── Resolve paths ─────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APM_PACKAGE_DIR="${APM_PACKAGE_DIR:-$(dirname "$SCRIPT_DIR")}"
PROJECT_DIR="${PWD}"

echo ""
echo -e "${BOLD}Agentic Dev Stack — Initializing${NC}"
echo "APM package : $APM_PACKAGE_DIR"
echo "Project     : $PROJECT_DIR"
echo "AI mode     : $AI_MODE"
echo ""

GITHUB_TMPL="$APM_PACKAGE_DIR/templates/github"

# =============================================================================
# CLAUDE CODE SETUP
# =============================================================================
install_claude() {
  h1 "1. Installing Claude Code agents and skills"

  mkdir -p .claude/agents .claude/skills

  # Agent definitions
  cp -r "$APM_PACKAGE_DIR/.apm/agents/"* .claude/agents/
  ok "Agents installed (.claude/agents/)"

  # Skills (slash commands)
  for skill_dir in "$APM_PACKAGE_DIR/.apm/skills"/*/; do
    skill_name="$(basename "$skill_dir")"
    mkdir -p ".claude/skills/$skill_name"
    cp "$skill_dir/SKILL.md" ".claude/skills/$skill_name/SKILL.md"
  done
  ok "Skills installed (.claude/skills/)"

  # CLAUDE.md
  h1 "2. CLAUDE.md"
  if [ ! -f CLAUDE.md ]; then
    cp "$APM_PACKAGE_DIR/templates/CLAUDE.md" CLAUDE.md
    ok "CLAUDE.md created"
  else
    warn "CLAUDE.md already exists — skipping (update manually if needed)"
  fi

  # github-speckit
  h1 "3. Setting up github-speckit (Claude)"
  if command -v npx &> /dev/null; then
    echo "Running: npx github-speckit@latest"
    echo "When prompted:"
    echo "  AI integration  → claude"
    echo "  Branch numbering → sequential"
    echo "  Context file     → CLAUDE.md (default)"
    echo "  Script type      → sh"
    echo ""
    npx github-speckit@latest
    ok "github-speckit initialized"
  else
    warn "npx not found — skipping github-speckit setup"
    echo "  Install Node.js (https://nodejs.org) then run:"
    echo "    npx github-speckit@latest"
    echo "  Answers: AI=claude / sequential / CLAUDE.md / sh"
  fi
}

# =============================================================================
# GITHUB COPILOT SETUP
# =============================================================================
install_copilot() {
  h1 "1. Installing GitHub Copilot agents and instructions"

  # Shared agent definitions (platform-agnostic) go to .github/agents/
  mkdir -p .github/agents
  cp -r "$APM_PACKAGE_DIR/.apm/agents/"* .github/agents/
  ok "Agent definitions installed (.github/agents/)"

  # Copilot custom instructions (.github/instructions/)
  INSTR_SRC="$APM_PACKAGE_DIR/templates/github/instructions"
  if [ -d "$INSTR_SRC" ]; then
    mkdir -p .github/instructions
    for instr in "$INSTR_SRC/"*.instructions.md; do
      instr_name="$(basename "$instr")"
      if [ ! -f ".github/instructions/$instr_name" ]; then
        cp "$instr" ".github/instructions/$instr_name"
        ok "Instruction: $instr_name"
      else
        warn "Instruction $instr_name already exists — skipping"
      fi
    done
  fi

  # copilot-instructions.md (workspace-level Copilot context)
  h1 "2. .github/copilot-instructions.md"
  if [ ! -f .github/copilot-instructions.md ]; then
    mkdir -p .github
    cp "$APM_PACKAGE_DIR/templates/copilot-instructions.md" .github/copilot-instructions.md
    ok ".github/copilot-instructions.md created"
  else
    warn ".github/copilot-instructions.md already exists — skipping"
  fi
}

# =============================================================================
# SHARED GITHUB TEMPLATES
# =============================================================================
install_github_templates() {
  local ai_mode="$1"
  h1 "Installing GitHub templates (workflows, PR & issue templates)"

  mkdir -p .github/workflows .github/ISSUE_TEMPLATE

  # ── Helper to copy a single workflow ──────────────────────────────────────
  copy_workflow() {
    local wf="$1"
    local wf_name
    wf_name="$(basename "$wf")"
    if [ -f ".github/workflows/$wf_name" ]; then
      warn "Workflow $wf_name already exists — skipping (delete to reinstall)"
    else
      cp "$wf" ".github/workflows/$wf_name"
      ok "Workflow: $wf_name"
    fi
  }

  case "$ai_mode" in
    claude)
      for wf in "$GITHUB_TMPL/workflows/agent-"*.yml; do
        copy_workflow "$wf"
      done
      ;;
    copilot)
      for wf in "$GITHUB_TMPL/workflows/copilot-agent-"*.yml; do
        copy_workflow "$wf"
      done
      ;;
    both)
      for wf in "$GITHUB_TMPL/workflows/agent-"*.yml \
                "$GITHUB_TMPL/workflows/copilot-agent-"*.yml; do
        copy_workflow "$wf"
      done
      ;;
  esac

  # ── PR template ────────────────────────────────────────────────────────────
  if [ ! -f .github/pull_request_template.md ]; then
    cp "$GITHUB_TMPL/pull_request_template.md" .github/pull_request_template.md
    ok "PR template installed"
  else
    warn "PR template already exists — skipping"
  fi

  # ── Issue templates ────────────────────────────────────────────────────────
  for tmpl in "$GITHUB_TMPL/ISSUE_TEMPLATE/"*; do
    tmpl_name="$(basename "$tmpl")"
    if [ ! -f ".github/ISSUE_TEMPLATE/$tmpl_name" ]; then
      cp "$tmpl" ".github/ISSUE_TEMPLATE/$tmpl_name"
      ok "Issue template: $tmpl_name"
    else
      warn "Issue template $tmpl_name already exists — skipping"
    fi
  done

  # ── Root-level community files ─────────────────────────────────────────────
  for doc in CONTRIBUTING.md SECURITY.md; do
    if [ ! -f "$doc" ]; then
      cp "$APM_PACKAGE_DIR/templates/$doc" "$doc"
      ok "$doc created (review and customise before committing)"
    else
      warn "$doc already exists — skipping"
    fi
  done
}

# =============================================================================
# RUN INSTALLATION
# =============================================================================

case "$AI_MODE" in
  claude)
    install_claude
    install_github_templates "claude"
    ;;
  copilot)
    install_copilot
    install_github_templates "copilot"
    ;;
  both)
    install_claude
    install_copilot
    install_github_templates "both"
    ;;
esac

# ── Git repository ─────────────────────────────────────────────────────────────
h1 "Git repository"

if git rev-parse --git-dir &> /dev/null; then
  ok "Git repository already initialized"
else
  git init
  ok "Git repository initialized"
fi

# ── Copy guides ──────────────────────────────────────────────────────────────
for guide in BROWNFIELD_GUIDE.md DARK_FACTORY_GUIDE.md ENHANCEMENTS.md; do
  if [ ! -f "$guide" ]; then
    cp "$APM_PACKAGE_DIR/$guide" "$guide"
    ok "$guide copied"
  fi
done

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}✓ Agentic Dev Stack ready! (mode: $AI_MODE)${NC}"
echo ""
echo "Next steps:"
echo ""

if [[ "$AI_MODE" == "claude" || "$AI_MODE" == "both" ]]; then
  echo "  ── Claude Code ──────────────────────────────────────────────────────"
  echo "  1. Add ANTHROPIC_API_KEY to GitHub repository secrets"
  echo "     (Settings → Secrets and variables → Actions → New repository secret)"
  echo ""
  echo "  2. Create your project constitution:"
  echo "     /speckit-constitution"
  echo ""
  echo "  3. Start your first feature:"
  echo "     /ba-agent <feature description>"
  echo ""
  echo "  Local slash commands:"
  echo "    /ba-agent        — write feature specs"
  echo "    /dev-agent       — implement features (TDD)"
  echo "    /qa-agent        — run quality gates"
  echo "    /reviewer-agent  — review PRs"
  echo "    /architect-agent — architecture decisions & ADRs"
  echo "    /devops-agent    — CI/CD & infrastructure"
  echo "    /security-agent  — security reviews"
  echo "    /triage-agent    — issue triage"
  echo ""
fi

if [[ "$AI_MODE" == "copilot" || "$AI_MODE" == "both" ]]; then
  echo "  ── GitHub Copilot ───────────────────────────────────────────────────"
  echo "  1. Ensure GitHub Copilot is enabled for your repository"
  echo "  2. Workspace context is in .github/copilot-instructions.md"
  echo "  3. Per-agent instructions are in .github/instructions/"
  echo "  4. Agent definitions (shared) are in .github/agents/"
  echo ""
  echo "  In Copilot Chat, activate an agent by asking:"
  echo "    'Act as the BA Agent and write a spec for <feature>'"
  echo "    'Act as the Developer Agent and implement specs/NNN-feature/spec.md'"
  echo "    'Act as the Reviewer Agent and review this PR'"
  echo ""
fi

echo "  ── GitHub Actions (all modes) ───────────────────────────────────────"
echo "  Comment on a PR or issue to trigger agents:"
echo "    @qa-agent             — QA review on PR"
echo "    @reviewer-agent       — code review on PR"
echo "    @architect-agent      — architecture review on PR or issue"
echo "    @security-agent       — security review on PR"
echo "    @ot-integration-agent — OT/IT boundary review on PR"
echo "    @digital-twin-agent   — digital twin drift review on PR"
echo "    @compliance-agent     — IEC 62443 / ISA-95 / SIL review on PR"
echo "    @incident-agent       — incident response / post-mortem (label issue 'incident')"
echo "    (triage runs automatically on every new issue)"
echo ""
