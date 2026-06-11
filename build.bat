@echo off
title TaskFlow Pro - Production Build
cd /d "%~dp0"

echo Building TaskFlow Pro...
call npm run build
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)

echo.
echo Build complete — output in dist\
echo Run "npm run preview" to test the production build locally.
pause
