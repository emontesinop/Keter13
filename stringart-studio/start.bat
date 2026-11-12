@echo off
rem StringArt Studio launcher for Windows
cd /d %~dp0
if not exist .venv (
  python -m venv .venv
  .venv\Scripts\pip install -r backend\requirements.txt
)
if not exist frontend\dist\index.html (
  pushd frontend & call npm install & call npm run build & popd
)
cd backend
echo Open http://127.0.0.1:8765
..\.venv\Scripts\python -m stringart serve --port 8765
