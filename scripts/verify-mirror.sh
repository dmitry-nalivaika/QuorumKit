#!/usr/bin/env bash
# Backward-compatibility shim — see installer/verify-mirror.sh (Issue #47, FR-003).
# Removal planned for v4.0.0.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/../installer/verify-mirror.sh" "$@"
