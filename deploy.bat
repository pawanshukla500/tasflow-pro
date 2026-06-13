@echo off
title TaskFlow Pro - Deploy backend (migrations + edge functions + secrets)
cd /d "%~dp0"
setlocal

set PROJECT_REF=nekdjoquirhecmejuoba

echo ========================================
echo   TaskFlow Pro - One-shot backend deploy
echo   Project: %PROJECT_REF%
echo ========================================
echo.

REM ── 1. Verify CLI login (needs a one-time: npx supabase login) ──────────────
call npx supabase projects list >nul 2>&1
if errorlevel 1 (
  echo You are not logged in to the Supabase CLI.
  echo Opening browser login now ^(one time only^)...
  call npx supabase login
  if errorlevel 1 (
    echo Login failed. Aborting.
    pause
    exit /b 1
  )
)

REM ── 2. Link project ──────────────────────────────────────────────────────────
call npx supabase link --project-ref %PROJECT_REF%

REM ── 3. Apply all pending migrations ──────────────────────────────────────────
echo.
echo Applying database migrations...
call npx supabase db push --include-all
if errorlevel 1 (
  echo Migration push failed. Fix errors above, then re-run deploy.bat
  pause
  exit /b 1
)

REM ── 4. Set edge function secrets from .env ───────────────────────────────────
REM (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are auto-injected
REM  into edge functions by Supabase — only app-specific secrets need setting)
echo.
echo Setting edge function secrets from .env...
for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
  if "%%a"=="VITE_FIREBASE_API_KEY" call npx supabase secrets set FIREBASE_WEB_API_KEY=%%b --project-ref %PROJECT_REF% >nul
  if "%%a"=="RESEND_API_KEY" call npx supabase secrets set RESEND_API_KEY=%%b --project-ref %PROJECT_REF% >nul
  if "%%a"=="EMAIL_FROM" call npx supabase secrets set EMAIL_FROM=%%b --project-ref %PROJECT_REF% >nul
  if "%%a"=="EMAIL_FROM_NAME" call npx supabase secrets set EMAIL_FROM_NAME=%%b --project-ref %PROJECT_REF% >nul
  if "%%a"=="GMAIL_SENDER_EMAIL" call npx supabase secrets set GMAIL_SENDER_EMAIL=%%b --project-ref %PROJECT_REF% >nul
  if "%%a"=="GMAIL_FROM_NAME" call npx supabase secrets set GMAIL_FROM_NAME=%%b --project-ref %PROJECT_REF% >nul
  if "%%a"=="APP_URL" call npx supabase secrets set APP_URL=%%b --project-ref %PROJECT_REF% >nul
  if "%%a"=="GOOGLE_AI_API_KEY" call npx supabase secrets set GOOGLE_AI_API_KEY=%%b --project-ref %PROJECT_REF% >nul
  if "%%a"=="VITE_FIREBASE_PROJECT_ID" call npx supabase secrets set FIREBASE_PROJECT_ID=%%b --project-ref %PROJECT_REF% >nul
  if "%%a"=="SUPABASE_AUTH_HOOK_SECRET" if not "%%b"=="REPLACE_ME" call npx supabase secrets set SUPABASE_AUTH_HOOK_SECRET=%%b --project-ref %PROJECT_REF% >nul
)
if exist "secrets\firebase-service-account.json" (
  echo Uploading FIREBASE_SERVICE_ACCOUNT_JSON for password reset links...
  node scripts\upload-firebase-secret.mjs
) else (
  echo WARNING: secrets\firebase-service-account.json missing - password reset links will fail.
)
node scripts\upload-email-secrets.mjs 2>nul
if errorlevel 1 echo WARNING: RESEND_API_KEY missing in .env - emails will not send. See scripts\EMAIL-SETUP.txt
echo Secrets set.

REM ── 5. Deploy edge functions (auth-critical first) ───────────────────────────
echo.
echo Deploying edge functions...
REM MCP server (AI connections) — deploy before other functions so Settings → Integrations works
echo   - mcp-server
call npx supabase functions deploy mcp-server --project-ref %PROJECT_REF% --no-verify-jwt
if errorlevel 1 echo     FAILED: mcp-server
echo   - issue-mcp-token
call npx supabase functions deploy issue-mcp-token --project-ref %PROJECT_REF%
if errorlevel 1 echo     FAILED: issue-mcp-token

for %%f in (google-oauth-start google-oauth-callback google-disconnect google-calendar-sync firebase-auth create-team-member delete-team-member register-organization firebase-upload daily-motivation notify-task-assigned notify-workflow-stage process-email-queue send-daily-digest send-department-daily-summary send-weekly-pending-report send-due-reminders send-transactional-email send-password-reset complete-password-reset polish-note handle-email-unsubscribe) do (
  echo   - %%f
  call npx supabase functions deploy %%f --project-ref %PROJECT_REF% --no-verify-jwt
  if errorlevel 1 echo     FAILED: %%f ^(continuing^)
)

echo.
echo ========================================
echo   Deploy complete.
echo   Test: sign in at http://localhost:8080
echo ========================================
pause
