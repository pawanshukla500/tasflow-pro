# Upload Resend API key + Firebase service account + deploy email functions
# Run: .\scripts\setup-email.ps1

$ErrorActionPreference = "Stop"
$ProjectRef = "nekdjoquirhecmejuoba"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

Write-Host "=== TaskFlow Pro - Email setup (Resend, no Google Workspace) ===" -ForegroundColor Cyan

if (-not (Select-String -Path ".env" -Pattern "^RESEND_API_KEY=re_" -Quiet) {
  Write-Host "ERROR: Add RESEND_API_KEY=re_... to .env first" -ForegroundColor Red
  Write-Host "Get it from https://resend.com/api-keys"
  exit 1
}

Write-Host "Uploading Resend + email secrets..."
node scripts/upload-email-secrets.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$saPath = Join-Path $Root "secrets\firebase-service-account.json"
if (Test-Path $saPath) {
  Write-Host "Uploading Firebase service account (for password reset links)..."
  node scripts/upload-firebase-secret.mjs
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
  Write-Host "WARNING: secrets\firebase-service-account.json missing - password reset will fail" -ForegroundColor Yellow
}

Get-Content ".env" | ForEach-Object {
  if ($_ -match '^VITE_FIREBASE_API_KEY=(.+)$') {
    npx supabase secrets set "FIREBASE_WEB_API_KEY=$($matches[1])" --project-ref $ProjectRef | Out-Null
  }
  if ($_ -match '^VITE_FIREBASE_PROJECT_ID=(.+)$') {
    npx supabase secrets set "FIREBASE_PROJECT_ID=$($matches[1])" --project-ref $ProjectRef | Out-Null
  }
}

Write-Host "Deploying email functions..."
npx supabase functions deploy send-password-reset --project-ref $ProjectRef --no-verify-jwt
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npx supabase functions deploy complete-password-reset --project-ref $ProjectRef --no-verify-jwt
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npx supabase functions deploy send-department-daily-summary --project-ref $ProjectRef --no-verify-jwt
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npx supabase functions deploy send-daily-digest --project-ref $ProjectRef --no-verify-jwt
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npx supabase functions deploy send-weekly-pending-report --project-ref $ProjectRef --no-verify-jwt
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npx supabase functions deploy create-team-member --project-ref $ProjectRef
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npx supabase functions deploy send-transactional-email --project-ref $ProjectRef --no-verify-jwt
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npx supabase functions deploy process-email-queue --project-ref $ProjectRef
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Done. Test: Team -> Add member or Send reset" -ForegroundColor Green
