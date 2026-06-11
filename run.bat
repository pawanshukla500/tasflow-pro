@echo off
title TaskFlow Pro - Dev Server
cd /d "%~dp0"

echo ========================================
echo   TaskFlow Pro by VB Exports
echo   Local dev server (http://localhost:8080)
echo ========================================
echo.

if not exist "node_modules\" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

if not exist ".env" (
  echo WARNING: .env not found. Copy .env.example to .env and fill in values.
  echo.
)

echo Starting dev server...
call npm run dev

pause
