#!/usr/bin/env bash
# Backward-compatibility shim — see src/scripts/quality-check.sh.
# Removal planned for v4.0.0.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/../src/scripts/quality-check.sh" "$@"
