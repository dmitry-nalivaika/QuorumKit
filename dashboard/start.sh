#!/usr/bin/env bash
# APM Dark Factory — one-command launcher
set -e

# Capture the directory the user invoked this script FROM, before we cd away.
# This becomes the default project path in the orchestrator UI so users
# don't have to fill in Settings manually for every project they install
# the agentic-dev-stack into.
export APM_PROJECT_DIR="${APM_PROJECT_DIR:-$PWD}"

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo ""
echo "  APM Dark Factory — Orchestrator"
echo "  Project: $APM_PROJECT_DIR"
echo ""

# Install deps if needed
if [ ! -d node_modules ]; then
  echo "  Installing dependencies (ws)…"
  npm install --silent
fi

# Open browser (macOS / Linux / WSL)
PORT="${APM_PORT:-3131}"

open_browser() {
  local url="http://localhost:$PORT"
  if command -v open &>/dev/null; then
    sleep 1.2 && open "$url" &
  elif command -v xdg-open &>/dev/null; then
    sleep 1.2 && xdg-open "$url" &
  fi
}

open_browser

node server.js "$@"
