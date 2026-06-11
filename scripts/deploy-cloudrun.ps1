# Build TaskFlow Pro with VITE_* baked in, push to Artifact Registry, deploy Cloud Run.
# Usage (from project root):
#   .\scripts\deploy-cloudrun.ps1
#   .\scripts\deploy-cloudrun.ps1 -ProjectId my-gcp-project -Region europe-west1 -Service tasflow-pro

param(
  [string]$ProjectId = "",
  [string]$Region = "europe-west1",
  [string]$Service = "tasflow-pro"
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

if (-not $ProjectId) {
  $ProjectId = (gcloud config get-value project 2>$null)
}
if (-not $ProjectId) {
  Write-Error "Set GCP project: gcloud config set project YOUR_PROJECT_ID"
}

$envPath = Join-Path $root ".env"
if (-not (Test-Path $envPath)) {
  Write-Error "Missing .env in project root"
}

function Get-EnvVal([string]$key) {
  foreach ($line in Get-Content $envPath) {
    if ($line -match "^$key=(.*)$") { return $matches[1].Trim() }
  }
  return ""
}

$vite = @{
  VITE_SUPABASE_URL                  = Get-EnvVal "VITE_SUPABASE_URL"
  VITE_SUPABASE_PUBLISHABLE_KEY      = Get-EnvVal "VITE_SUPABASE_PUBLISHABLE_KEY"
  VITE_APP_URL                       = Get-EnvVal "VITE_APP_URL"
  VITE_FIREBASE_API_KEY              = Get-EnvVal "VITE_FIREBASE_API_KEY"
  VITE_FIREBASE_AUTH_DOMAIN          = Get-EnvVal "VITE_FIREBASE_AUTH_DOMAIN"
  VITE_FIREBASE_PROJECT_ID           = Get-EnvVal "VITE_FIREBASE_PROJECT_ID"
  VITE_FIREBASE_STORAGE_BUCKET       = Get-EnvVal "VITE_FIREBASE_STORAGE_BUCKET"
  VITE_FIREBASE_MESSAGING_SENDER_ID  = Get-EnvVal "VITE_FIREBASE_MESSAGING_SENDER_ID"
  VITE_FIREBASE_APP_ID               = Get-EnvVal "VITE_FIREBASE_APP_ID"
  VITE_FIREBASE_MEASUREMENT_ID       = Get-EnvVal "VITE_FIREBASE_MEASUREMENT_ID"
}

if (-not $vite.VITE_SUPABASE_URL -or -not $vite.VITE_FIREBASE_API_KEY) {
  Write-Error "VITE_SUPABASE_URL and VITE_FIREBASE_API_KEY must be set in .env"
}

# Prefer production Cloud Run URL if still localhost
if ($vite.VITE_APP_URL -match "localhost") {
  $vite.VITE_APP_URL = "https://tasflow-pro-426872152845.europe-west1.run.app"
  Write-Host "VITE_APP_URL was localhost — using Cloud Run URL for build."
}

$image = "${Region}-docker.pkg.dev/${ProjectId}/cloud-run-source-deploy/${Service}/${Service}:manual-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

Write-Host "Building image with VITE_* build args..."
docker build `
  --build-arg "VITE_SUPABASE_URL=$($vite.VITE_SUPABASE_URL)" `
  --build-arg "VITE_SUPABASE_PUBLISHABLE_KEY=$($vite.VITE_SUPABASE_PUBLISHABLE_KEY)" `
  --build-arg "VITE_APP_URL=$($vite.VITE_APP_URL)" `
  --build-arg "VITE_FIREBASE_API_KEY=$($vite.VITE_FIREBASE_API_KEY)" `
  --build-arg "VITE_FIREBASE_AUTH_DOMAIN=$($vite.VITE_FIREBASE_AUTH_DOMAIN)" `
  --build-arg "VITE_FIREBASE_PROJECT_ID=$($vite.VITE_FIREBASE_PROJECT_ID)" `
  --build-arg "VITE_FIREBASE_STORAGE_BUCKET=$($vite.VITE_FIREBASE_STORAGE_BUCKET)" `
  --build-arg "VITE_FIREBASE_MESSAGING_SENDER_ID=$($vite.VITE_FIREBASE_MESSAGING_SENDER_ID)" `
  --build-arg "VITE_FIREBASE_APP_ID=$($vite.VITE_FIREBASE_APP_ID)" `
  --build-arg "VITE_FIREBASE_MEASUREMENT_ID=$($vite.VITE_FIREBASE_MEASUREMENT_ID)" `
  -t $image .

Write-Host "Pushing $image ..."
gcloud auth configure-docker "${Region}-docker.pkg.dev" -q
docker push $image

Write-Host "Deploying Cloud Run service $Service ..."
gcloud run deploy $Service `
  --image $image `
  --region $Region `
  --platform managed `
  --allow-unauthenticated `
  --port 8080 `
  --project $ProjectId

Write-Host "Done. Open the service URL and try sign-in again."
