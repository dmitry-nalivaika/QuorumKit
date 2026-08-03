#!/usr/bin/env bash
# =============================================================================
# scripts/pipeline.sh — backward-compatibility shim
#
# The canonical local pipeline manager is now at `src/scripts/pipeline.sh`.
# This wrapper preserves the historical invocation path used by external docs,
# scripts, and pinned references.
#
# Removal: planned for v4.0.0.
# =============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/../src/scripts/pipeline.sh" "$@"
