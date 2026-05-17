#!/usr/bin/env bash
# Backward-compatibility shim — see src/scripts/verify-mirror.sh.
# Removal planned for v4.0.0.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/../src/scripts/verify-mirror.sh" "$@"
