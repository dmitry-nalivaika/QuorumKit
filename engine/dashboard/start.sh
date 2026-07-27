#!/usr/bin/env bash
# QuorumKit Dark Factory — one-command launcher
set -e

# Capture the directory the user invoked this script FROM, before we cd away.
# This becomes the default project path in the orchestrator UI so users
# don't have to fill in Settings manually for every project they install
# QuorumKit into.
# Resolve to the git root so that running start.sh from a sub-package
# (e.g. engine/) doesn't produce a path that ends in the sub-directory name.
_invocation_dir="${QUORUMKIT_PROJECT_DIR:-$PWD}"
_git_root="$(git -C "$_invocation_dir" rev-parse --show-toplevel 2>/dev/null || echo "$_invocation_dir")"
export QUORUMKIT_PROJECT_DIR="$_git_root"

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo ""
echo "  QuorumKit Dark Factory — Orchestrator"
echo "  Project: $APM_PROJECT_DIR"
echo ""

# Install deps if needed
if [ ! -d node_modules ]; then
  echo "  Installing dependencies (ws)…"
  npm install --silent
fi

# Resolve the port: honour --port <N> flag first, then $APM_PORT, then 3131
PORT="${APM_PORT:-3131}"
for arg in "$@"; do
  case "$arg" in
    --port=*) PORT="${arg#--port=}" ;;
  esac
done
# Also handle "--port 4000" (two separate args)
prev=""
for arg in "$@"; do
  [ "$prev" = "--port" ] && PORT="$arg"
  prev="$arg"
done

open_browser() {
  local url="http://localhost:$PORT"
  if command -v open &>/dev/null; then
    sleep 1.2 && open "$url" &
  elif command -v xdg-open &>/dev/null; then
    sleep 1.2 && xdg-open "$url" &
  fi
}

open_browser

node "$DIR/../bin/quorumkit-dashboard.js" "$@"
