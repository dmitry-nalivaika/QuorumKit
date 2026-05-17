#!/usr/bin/env bash
# =============================================================================
# scripts/init.sh — backward-compatibility shim
#
# The canonical installer script is now at `src/scripts/init.sh`.
# This wrapper preserves the historical invocation path used by external docs,
# scripts, and pinned README references.
#
# Removal: planned for v4.0.0.
# =============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/../src/scripts/init.sh" "$@"
