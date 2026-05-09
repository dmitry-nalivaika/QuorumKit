#!/usr/bin/env bash
# =============================================================================
# scripts/init.sh — backward-compatibility shim (FR-003)
#
# Issue #47 / ADR-047 moved installer scripts to `installer/`. This wrapper
# preserves the historical invocation path used by external docs, scripts,
# and pinned README references. New work should call `installer/init.sh`
# directly.
#
# Removal: planned for v4.0.0 (one major after v3.0.0 lands).
# =============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/../installer/init.sh" "$@"
