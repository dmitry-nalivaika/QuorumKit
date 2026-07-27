#!/usr/bin/env bash
# =============================================================================
# scripts/branch-guard.sh — backward-compatibility shim
#
# The canonical branch-guard script is now at `src/scripts/branch-guard.sh`.
# This wrapper preserves the historical invocation path used by external docs,
# scripts, and pinned references.
#
# Removal: planned for v4.0.0.
# =============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/../src/scripts/branch-guard.sh" "$@"
