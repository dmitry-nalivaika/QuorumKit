#!/usr/bin/env bash
# =============================================================================
# init.sh — Initialize the Agentic Dev Stack in a new project
# =============================================================================
# Usage (from any project directory):
#   bash /path/to/APM/installer/init.sh [--ai=claude|copilot|both]
#
# Options:
#   --ai=claude   Install for Claude Code only (default)
#   --ai=copilot  Install for GitHub Copilot only
#   --ai=both     Install for both Claude Code and GitHub Copilot
#
# Or with APM_PACKAGE_DIR set:
#   APM_PACKAGE_DIR=/path/to/APM bash /path/to/APM/installer/init.sh --ai=both
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
DOMAIN=""         # optional domain extension pack
UPGRADE=0         # T-20 / FR-024: rewrite consumer workflows from
                  # `node engine/orchestrator/...` to `uses:` engine Action
APPLY=0           # default to dry-run when --upgrade is set (SEC-MED-002)
ENGINE_REF="v3"   # default Action ref consumers will be pinned to

for arg in "$@"; do
  case "$arg" in
    --ai=claude)       AI_MODE="claude"      ;;
    --ai=copilot)      AI_MODE="copilot"     ;;
    --ai=both)         AI_MODE="both"        ;;
    --domain=industrial) DOMAIN="industrial" ;;
    --domain=*)
      warn "Unknown domain pack: $arg — only 'industrial' is currently available"
      ;;
    --upgrade)         UPGRADE=1             ;;
    --apply)           APPLY=1               ;;
    --engine-ref=*)    ENGINE_REF="${arg#--engine-ref=}" ;;
    *)
      err "Unknown argument: $arg"
      echo "Usage: $0 [--ai=claude|copilot|both] [--domain=industrial]"
      echo "       $0 --upgrade [--apply] [--engine-ref=<ref>]"
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
echo "Domain pack : ${DOMAIN:-none (universal core only)}"
echo ""

GITHUB_TMPL="$APM_PACKAGE_DIR/templates/github"

# =============================================================================
# CLAUDE CODE SETUP
# =============================================================================
install_claude() {
  h1 "1. Installing Claude Code agents and skills"

  mkdir -p .claude/agents .claude/skills

  # Universal core agents (always installed)
  UNIVERSAL_AGENTS=(
    "ba-product-agent.md" "developer-agent.md" "qa-test-agent.md"
    "reviewer-agent.md"   "architect-agent.md"  "devops-agent.md"
    "security-agent.md"   "triage-agent.md"
    "release-agent.md"    "docs-agent.md"       "tech-debt-agent.md"
  )
  for agent in "${UNIVERSAL_AGENTS[@]}"; do
    cp "$APM_PACKAGE_DIR/.apm/agents/$agent" ".claude/agents/$agent"
  done

  # Domain extension pack — industrial
  if [ "$DOMAIN" = "industrial" ]; then
    DOMAIN_AGENTS=("ot-integration-agent.md" "digital-twin-agent.md" "compliance-agent.md" "incident-agent.md")
    for agent in "${DOMAIN_AGENTS[@]}"; do
      cp "$APM_PACKAGE_DIR/.apm/agents/$agent" ".claude/agents/$agent"
    done
    ok "Industrial domain agents installed"
  fi
  ok "Agents installed (.claude/agents/)"

  # Skills (slash commands) — mirror same filter
  UNIVERSAL_SKILLS=(
    "ba-agent" "dev-agent" "qa-agent" "reviewer-agent" "architect-agent"
    "devops-agent" "security-agent" "triage-agent"
    "release-agent" "docs-agent" "tech-debt-agent" "onboard"
  )
  DOMAIN_SKILLS=("ot-integration-agent" "digital-twin-agent" "compliance-agent" "incident-agent")

  skills_to_install=("${UNIVERSAL_SKILLS[@]}")
  if [ "$DOMAIN" = "industrial" ]; then
    skills_to_install+=("${DOMAIN_SKILLS[@]}")
  fi

  for skill_name in "${skills_to_install[@]}"; do
    skill_dir="$APM_PACKAGE_DIR/.apm/skills/$skill_name"
    if [ -d "$skill_dir" ]; then
      mkdir -p ".claude/skills/$skill_name"
      cp "$skill_dir/SKILL.md" ".claude/skills/$skill_name/SKILL.md"
    fi
  done
  ok "Skills installed (.claude/skills/)"

  # CLAUDE.md
  h1 "2. CLAUDE.md"
  if [ ! -f CLAUDE.md ]; then
    cp "$APM_PACKAGE_DIR/templates/seed/CLAUDE.md" CLAUDE.md
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

  # Shared agent definitions go to .github/agents/
  mkdir -p .github/agents

  UNIVERSAL_AGENTS=(
    "ba-product-agent.md" "developer-agent.md" "qa-test-agent.md"
    "reviewer-agent.md"   "architect-agent.md"  "devops-agent.md"
    "security-agent.md"   "triage-agent.md"
    "release-agent.md"    "docs-agent.md"       "tech-debt-agent.md"
  )
  for agent in "${UNIVERSAL_AGENTS[@]}"; do
    cp "$APM_PACKAGE_DIR/.apm/agents/$agent" ".github/agents/$agent"
  done

  if [ "$DOMAIN" = "industrial" ]; then
    DOMAIN_AGENTS=("ot-integration-agent.md" "digital-twin-agent.md" "compliance-agent.md" "incident-agent.md")
    for agent in "${DOMAIN_AGENTS[@]}"; do
      cp "$APM_PACKAGE_DIR/.apm/agents/$agent" ".github/agents/$agent"
    done
    ok "Industrial domain agents installed (.github/agents/)"
  fi
  ok "Agent definitions installed (.github/agents/)"

  # Copilot custom instructions — universal set
  INSTR_SRC="$APM_PACKAGE_DIR/templates/github/instructions"
  UNIVERSAL_INSTRUCTIONS=(
    "ba-agent" "dev-agent" "qa-agent" "reviewer-agent" "architect-agent"   # kept consistent
    "devops-agent" "security-agent" "triage-agent"
    "release-agent" "docs-agent" "tech-debt-agent"
  )
  # (instruction file names use agent slug, not agent filename)
  DOMAIN_INSTRUCTIONS=("ot-integration-agent" "digital-twin-agent" "compliance-agent" "incident-agent")

  instrs_to_install=("${UNIVERSAL_INSTRUCTIONS[@]}")
  if [ "$DOMAIN" = "industrial" ]; then
    instrs_to_install+=("${DOMAIN_INSTRUCTIONS[@]}")
  fi

  if [ -d "$INSTR_SRC" ]; then
    mkdir -p .github/instructions
    for slug in "${instrs_to_install[@]}"; do
      instr="$INSTR_SRC/${slug}.instructions.md"
      instr_name="$(basename "$instr")"
      if [ -f "$instr" ]; then
        if [ ! -f ".github/instructions/$instr_name" ]; then
          cp "$instr" ".github/instructions/$instr_name"
          ok "Instruction: $instr_name"
        else
          warn "Instruction $instr_name already exists — skipping"
        fi
      fi
    done
  fi

  # copilot-instructions.md (workspace-level Copilot context)
  h1 "2. .github/copilot-instructions.md"
  if [ ! -f .github/copilot-instructions.md ]; then
    mkdir -p .github
    cp "$APM_PACKAGE_DIR/templates/seed/copilot-instructions.md" .github/copilot-instructions.md
    ok ".github/copilot-instructions.md created"
  else
    warn ".github/copilot-instructions.md already exists — skipping"
  fi
}

# =============================================================================
# SHARED GITHUB TEMPLATES
# =============================================================================

# =============================================================================
# PIPELINE TEMPLATES (FR-012)
# =============================================================================
install_pipelines() {
  h1 "Installing Orchestrator pipelines (.apm/pipelines/)"
  # ADR-006 §3 / FR-005: pipelines are NOT mirrored. The package's `.apm/pipelines/`
  # is the single source of truth and is copied directly to the consumer.
  local pipelines_src="$APM_PACKAGE_DIR/.apm/pipelines"
  if [ ! -d "$pipelines_src" ]; then
    warn "Pipelines not found at $pipelines_src — skipping"
    return
  fi

  mkdir -p .apm/pipelines

  for tpl in "$pipelines_src"/*.yml; do
    tpl_name="$(basename "$tpl")"
    if [ ! -f ".apm/pipelines/$tpl_name" ]; then
      cp "$tpl" ".apm/pipelines/$tpl_name"
      ok "Pipeline template: $tpl_name"
    else
      warn "Pipeline template $tpl_name already exists — skipping (edit to customise)"
    fi
  done
}

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

  # ── orchestrator.yml — always installed (autonomous agent orchestration) ───
  copy_workflow "$GITHUB_TMPL/workflows/orchestrator.yml"

  # ── alert-to-issue.yml — always installed (observability feedback loop) ────
  copy_workflow "$GITHUB_TMPL/workflows/alert-to-issue.yml"

  # ── Remove domain workflows if no domain pack requested ───────────────────
  if [ "$DOMAIN" != "industrial" ]; then
    DOMAIN_WF_PATTERNS=("agent-ot-integration" "agent-digital-twin" "agent-compliance" "agent-incident"
                        "copilot-agent-ot-integration" "copilot-agent-digital-twin"
                        "copilot-agent-compliance" "copilot-agent-incident")
    for pattern in "${DOMAIN_WF_PATTERNS[@]}"; do
      rm -f ".github/workflows/${pattern}.yml"
    done
    ok "Domain workflows excluded (use --domain=industrial to include them)"
  fi

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
      cp "$APM_PACKAGE_DIR/templates/seed/$doc" "$doc"
      ok "$doc created (review and customise before committing)"
    else
      warn "$doc already exists — skipping"
    fi
  done
}

# =============================================================================
# UPGRADE MODE — T-20 / FR-024 / SEC-MED-002
#
# `--upgrade` rewrites consumer .github/workflows/*.yml files that still call
# the engine via `node engine/orchestrator/index.js` (or the pre-#47
# `node scripts/orchestrator/index.js`) so they instead use the published
# Action ref `uses: dmitry-nalivaika/agentic-dev-stack/engine@$ENGINE_REF`.
#
# Safety contract:
#   • Dry-run by default. `--apply` is required to write changes.
#   • Idempotent: a workflow already on the Action form is left untouched.
#   • Refuses to broaden any `permissions:` block (SEC-MED-002). If the
#     existing workflow has narrower scopes than the engine's documented
#     minimum (engine/SECURITY.md), the script reports the gap and exits
#     non-zero. It NEVER widens automatically.
#   • Does not touch agent workflows (`copilot-agent-*.yml`, etc.) — only
#     workflows that actually invoke the engine.
# =============================================================================
run_upgrade() {
  h1 "APM Upgrade — rewrite engine invocations to 'uses:' Action form"
  if [ ! -d ".github/workflows" ]; then
    err "No .github/workflows/ directory in $(pwd) — nothing to upgrade."
    exit 1
  fi

  local action_ref="dmitry-nalivaika/agentic-dev-stack/engine@$ENGINE_REF"
  local mode_label
  if [ "$APPLY" -eq 1 ]; then
    mode_label="APPLY (writing changes)"
  else
    mode_label="DRY-RUN (use --apply to write)"
  fi
  echo "Mode      : $mode_label"
  echo "Engine ref: $action_ref"
  echo ""

  local touched=0 already=0 skipped=0
  shopt -s nullglob
  for wf in .github/workflows/*.yml .github/workflows/*.yaml; do
    [ -f "$wf" ] || continue
    if ! grep -qE 'node[[:space:]]+(scripts|engine)/orchestrator/index\.js' "$wf"; then
      if grep -qE "uses:[[:space:]]*dmitry-nalivaika/agentic-dev-stack/engine@" "$wf"; then
        already=$((already + 1))
        ok "$(basename "$wf") — already on Action form"
      else
        skipped=$((skipped + 1))
      fi
      continue
    fi

    # SEC-MED-002 permissions-widening guard. Find the top-level
    # `permissions:` block (first occurrence) and refuse to proceed if any
    # required engine scope is currently *missing* (we do not auto-add).
    local perms
    perms=$(awk '/^permissions:/{flag=1;next} /^[A-Za-z]/{flag=0} flag' "$wf" || true)
    local missing=()
    for required in "contents:[[:space:]]*read" "issues:[[:space:]]*write" "pull-requests:[[:space:]]*write"; do
      if ! echo "$perms" | grep -qE "$required"; then
        missing+=("$required")
      fi
    done
    if [ "${#missing[@]}" -gt 0 ]; then
      err "$(basename "$wf"): existing 'permissions:' block lacks required scopes: ${missing[*]}"
      err "  Refusing to broaden automatically (SEC-MED-002). Add the missing scopes manually, then re-run."
      exit 2
    fi

    # The actual rewrite: replace the orchestrator step's body. We surgically
    # match the multi-line block "Setup Node + npm ci + run: node engine/.../index.js"
    # with awk; if the workflow has been customised in a way we don't
    # recognise, fall back to a warning.
    local tmp
    tmp=$(mktemp)
    awk -v ref="$action_ref" '
      BEGIN { skip=0 }
      # Drop the explicit Setup Node + npm ci steps that the Action no longer needs.
      /^[[:space:]]*-[[:space:]]*name:[[:space:]]*Setup Node/ { skip=1 }
      /^[[:space:]]*-[[:space:]]*name:[[:space:]]*Install orchestrator dependencies/ { skip=1 }
      /^[[:space:]]*-[[:space:]]*name:[[:space:]]*Check orchestrator is installed/ { skip=1 }
      # Replace the run step with the Action ref.
      /run:[[:space:]]*node[[:space:]]+(scripts|engine)\/orchestrator\/index\.js/ {
        sub(/run:[[:space:]]*node[[:space:]]+(scripts|engine)\/orchestrator\/index\.js.*/, "uses: " ref)
        skip=0
        print; next
      }
      # End of a step block (next step starts) → reset skip.
      skip && /^[[:space:]]*-[[:space:]]*name:/ { skip=0 }
      !skip { print }
    ' "$wf" > "$tmp"

    if cmp -s "$wf" "$tmp"; then
      rm -f "$tmp"
      skipped=$((skipped + 1))
      warn "$(basename "$wf"): contains a 'node …/orchestrator/index.js' line but the surrounding block did not match the upgrade pattern. Inspect manually."
      continue
    fi

    if [ "$APPLY" -eq 1 ]; then
      mv "$tmp" "$wf"
      touched=$((touched + 1))
      ok "$(basename "$wf") — rewritten to 'uses: $action_ref'"
    else
      touched=$((touched + 1))
      ok "$(basename "$wf") — would be rewritten (diff below):"
      diff -u "$wf" "$tmp" | sed 's/^/    /' | head -40 || true
      rm -f "$tmp"
    fi
  done

  echo ""
  echo "Summary: rewrote=$touched  already-on-Action=$already  skipped=$skipped"
  if [ "$APPLY" -eq 0 ] && [ "$touched" -gt 0 ]; then
    echo ""
    echo -e "${BOLD}Next:${NC} re-run with --apply to write the changes:"
    echo "    bash $0 --upgrade --apply --engine-ref=$ENGINE_REF"
  fi
}

if [ "$UPGRADE" -eq 1 ]; then
  run_upgrade
  exit 0
fi

# =============================================================================
# RUN INSTALLATION
# =============================================================================

case "$AI_MODE" in
  claude)
    install_claude
    install_github_templates "claude"
    install_pipelines
    ;;
  copilot)
    install_copilot
    install_github_templates "copilot"
    install_pipelines
    ;;
  both)
    install_claude
    install_copilot
    install_github_templates "both"
    install_pipelines
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
echo -e "${GREEN}${BOLD}✓ Agentic Dev Stack ready! (mode: $AI_MODE${DOMAIN:+ / domain: $DOMAIN})${NC}"
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
  echo "  Local slash commands — core workflow:"
  echo "    /ba-agent        — write feature specs"
  echo "    /dev-agent       — implement features (TDD)"
  echo "    /qa-agent        — run quality gates"
  echo "    /reviewer-agent  — review PRs"
  echo "    /architect-agent — architecture decisions & ADRs"
  echo "    /devops-agent    — CI/CD & infrastructure"
  echo "    /security-agent  — security reviews"
  echo "    /triage-agent    — issue triage"
  echo ""
  echo "  Lifecycle commands:"
  echo "    /release-agent   — semver bump, CHANGELOG, GitHub Release"
  echo "    /docs-agent      — audit and update documentation"
  echo "    /tech-debt-agent — codebase health review"
  echo "    /onboard         — guided onboarding wizard"
  echo ""
  if [ "$DOMAIN" = "industrial" ]; then
  echo "  Industrial domain commands:"
  echo "    /ot-integration-agent  — IT/OT boundary review"
  echo "    /digital-twin-agent    — twin model drift review"
  echo "    /compliance-agent      — IEC 62443 / ISA-95 / SIL review"
  echo "    /incident-agent        — incident response & post-mortem"
  echo ""
  fi
fi

if [[ "$AI_MODE" == "copilot" || "$AI_MODE" == "both" ]]; then
  echo "  ── GitHub Copilot ───────────────────────────────────────────────────"
  echo "  1. Ensure GitHub Copilot is enabled for your repository"
  echo "  2. Workspace context is in .github/copilot-instructions.md"
  echo "  3. Per-agent instructions are in .github/instructions/"
  echo "  4. Agent definitions (shared) are in .github/agents/"
  echo ""
fi

echo "  ── Orchestrator dashboard (optional) ────────────────────────────────"
echo "  Run from THIS project directory ($PROJECT_DIR) to auto-fill the"
echo "  project path, git remote, and current branch in the dashboard:"
echo "    bash $APM_PACKAGE_DIR/engine/dashboard/start.sh"
echo "  Then open http://localhost:3131 — agents are launchable from the UI."
echo ""
echo "  Comment on a PR or issue to trigger agents:"
echo "    @qa-agent             — QA + mutation testing review on PR"
echo "    @reviewer-agent       — spec compliance + API contract review on PR"
echo "    @architect-agent      — ADR + cross-spec consistency check"
echo "    @security-agent       — OWASP + dependency review on PR"
echo "    @docs-agent           — documentation audit on PR"
echo "    (triage runs automatically on every new issue)"
echo "    (release runs automatically on every push to main)"
echo "    (tech-debt runs on first Monday of each month)"
echo ""
if [ "$DOMAIN" = "industrial" ]; then
echo "    @ot-integration-agent — IT/OT boundary review on PR"
echo "    @digital-twin-agent   — digital twin drift review on PR"
echo "    @compliance-agent     — IEC 62443 / ISA-95 / SIL review on PR"
echo "    @incident-agent       — incident response (label issue 'incident')"
echo ""
fi
echo "  ── Observability feedback loop ──────────────────────────────────────"
echo "  Configure your alerting platform to POST to:"
echo "    POST https://api.github.com/repos/{owner}/{repo}/dispatches"
echo "    event_type: production-alert"
echo "  See .github/workflows/alert-to-issue.yml for the payload format."
echo ""
if [ -z "$DOMAIN" ]; then
echo "  ── Domain extension packs ───────────────────────────────────────────"
echo "  To add domain-specific agents, re-run with:"
echo "    bash $0 --ai=$AI_MODE --domain=industrial"
echo "  Available packs: industrial (OT Integration, Digital Twin, Compliance, Incident)"
echo ""
fi
