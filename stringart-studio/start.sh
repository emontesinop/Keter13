#!/usr/bin/env bash
# StringArt Studio launcher: installs dependencies (first run), builds the UI, starts the server.
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-8765}"
if [ ! -d .venv ]; then
  python3 -m venv .venv
  .venv/bin/pip install -q --upgrade pip
  .venv/bin/pip install -q -r backend/requirements.txt
fi
if [ ! -f frontend/dist/index.html ]; then
  (cd frontend && npm install --no-audit --no-fund && npm run build)
fi
cd backend
echo "Open http://127.0.0.1:${PORT}"
exec ../.venv/bin/python -m stringart serve --port "${PORT}"
