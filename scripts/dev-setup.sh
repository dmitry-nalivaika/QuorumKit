#!/usr/bin/env bash
# =============================================================================
# scripts/dev-setup.sh — Self-hosting setup for QuorumKit contributors
#
# Installs QuorumKit into this repository itself, producing the same local
# environment that any consumer project receives after running init.sh.
# Generated files (.specify/, .claude/, etc.) are gitignored and can be
# recreated at any time by re-running this script.
#
# Usage (from the repo root):
#   bash scripts/dev-setup.sh [--ai=claude|copilot|both] [--domain=industrial]
#
# Default: --ai=both (developers typically use both Claude Code and Copilot)
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

# Default to Claude-only for the SoT repo: --ai=both would create .github/agents/
# which violates M6 (must not exist in this repo). Copilot instructions are already
# managed directly in .github/instructions/ and don't need regeneration.
AI_ARG="--ai=claude"
EXTRA_ARGS=()

for arg in "$@"; do
  case "$arg" in
    --ai=*) AI_ARG="$arg" ;;
    *)      EXTRA_ARGS+=("$arg") ;;
  esac
done

echo ""
echo "QuorumKit — Self-hosting setup"
echo "Repo root : $REPO_ROOT"
echo "Running   : src/scripts/init.sh $AI_ARG ${EXTRA_ARGS[*]:-}"
echo ""

# Run init.sh with this repo as both the package source and the install target.
# --skip-pipelines: pipelines already live in src/pipelines/ (the source of
#   truth), so no copy to .apm/pipelines/ is needed for self-hosting.
QUORUMKIT_PACKAGE_DIR="$REPO_ROOT" \
  bash "$REPO_ROOT/src/scripts/init.sh" "$AI_ARG" --skip-pipelines "${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}"

echo ""
echo "Self-hosted environment ready."
echo "Generated files (.specify/, .claude/) are gitignored — re-run this script"
echo "at any time to recreate them."
