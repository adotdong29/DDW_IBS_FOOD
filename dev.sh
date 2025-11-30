#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

########################################
# Clean up any old backend on port 8000
########################################
echo "Checking for existing backend on port 8000..."
if lsof -ti :8000 >/dev/null 2>&1; then
  echo "Killing old backend processes on port 8000..."
  lsof -ti :8000 | xargs kill -9 || true
fi

########################################
# Start backend
########################################
cd "$ROOT_DIR/backend"
echo "Starting backend on http://0.0.0.0:8000 ..."
uvicorn backend:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

########################################
# Start Expo dev server
########################################
cd "$ROOT_DIR/mobile/app"
echo "Starting Expo dev server..."
npx expo start

########################################
# When Expo exits, stop backend too
########################################
echo "Stopping backend (PID: $BACKEND_PID)..."
kill "$BACKEND_PID" 2>/dev/null || true
