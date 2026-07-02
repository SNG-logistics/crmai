@echo off
chcp 65001 >nul
title CRM Launcher
cd /d "%~dp0"

echo ============================================
echo    CRM - Start Backend + Frontend
echo ============================================
echo.

REM ---------- First-run setup (auto) ----------
if not exist "node_modules" (
  echo [setup] Installing launcher dependency (concurrently)...
  call npm install
)
if not exist "backend\node_modules" (
  echo [setup] Installing backend dependencies...
  pushd backend
  call npm install
  call npx prisma generate
  popd
)
if not exist "frontend\node_modules" (
  echo [setup] Installing frontend dependencies...
  pushd frontend
  call npm install
  popd
)
if not exist "modules\lufy\backend\node_modules" (
  echo [setup] Installing lufy backend dependencies...
  pushd modules\lufy\backend
  call npm install
  call npx prisma generate
  popd
)
if not exist "modules\lufy\frontend\node_modules" (
  echo [setup] Installing lufy frontend dependencies...
  pushd modules\lufy\frontend
  call npm install
  popd
)

echo.
echo Starting ALL services in THIS window (one command):
echo   CRM API  -^> http://localhost:4000
echo   CRM WEB  -^> http://localhost:3000
echo   LUFY API -^> http://localhost:3001
echo   LUFY WEB -^> http://localhost:3002
echo.
echo (Opening browser shortly. To STOP everything: press Ctrl+C or close this window.)
echo.

REM open the CRM in the browser once servers have had a moment to boot
start "" cmd /c "timeout /t 12 /nobreak >nul & start http://localhost:3000"

REM run all 4 dev servers together (concurrently) in this single window
npm run dev
