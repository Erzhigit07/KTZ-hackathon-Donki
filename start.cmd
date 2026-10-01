@echo off
cd /d "%~dp0"
where node >nul 2>nul
if not errorlevel 1 (
  node server\index.js
) else if exist "C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
  "C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" server\index.js
) else (
  echo Install Node.js 20 or newer, then run this file again.
)
pause
