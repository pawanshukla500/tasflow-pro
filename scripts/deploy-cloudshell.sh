#!/usr/bin/env bash
# TaskFlow Pro — deploy to Cloud Run from Google Cloud Shell.
#
# Uses Cloud Build (gcloud builds submit) instead of a local docker build + push.
# This is intentional: in Cloud Shell, `docker push` to Artifact Registry can
# fail intermittently with "connection refused" / "i/o timeout" because the
# Cloud Shell VM's outbound path to pkg.dev throttles or drops large pushes.
# Cloud Build runs the same Dockerfile remotely inside Google's network, so the
# push happens server-side and is dramatically more reliable.

set -euo pipefail

REGION="${REGION:-europe-west1}"
SERVICE="${SERVICE:-tasflow-pro}"
REPO_URL="${REPO_URL:-https://github.com/pawanshukla500/tasflow-pro.git}"
BRANCH="${BRANCH:-main}"

if [[ -z "${PROJECT_ID:-}" ]]; then
  PROJECT_ID="$(gcloud projects list --filter="projectNumber:426872152845" --format="value(projectId)" 2>/dev/null | head -1)"
fi
if [[ -z "${PROJECT_ID:-}" ]]; then
  PROJECT_ID="$(gcloud config get-value project --quiet 2>/dev/null || true)"
fi
if [[ -z "${PROJECT_ID:-}" ]]; then
  echo "ERROR: export PROJECT_ID=your-gcp-project-id"
  exit 1
fi

gcloud config set project "$PROJECT_ID"
echo "==> Project: $PROJECT_ID | Region: $REGION | Service: $SERVICE"

gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com --quiet

if ! gcloud artifacts repositories describe cloud-run-source-deploy --location="$REGION" &>/dev/null; then
  gcloud artifacts repositories create cloud-run-source-deploy \
    --repository-format=docker --location="$REGION" --quiet
fi

WORKDIR="${HOME}/tasflow-pro-deploy"
rm -rf "$WORKDIR"
git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$WORKDIR"
cd "$WORKDIR"

TAG="$(date +%Y%m%d-%H%M%S)"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/cloud-run-source-deploy/${SERVICE}/${SERVICE}:${TAG}"

echo "==> Building & pushing image via Cloud Build (remote, no local docker push)..."
# `gcloud builds submit --tag` builds the Dockerfile in Cloud Build and pushes
# the resulting image to Artifact Registry from inside Google's network. If
# Cloud Build hits a transient registry blip we retry the whole submission a
# few times with exponential backoff before giving up.
BUILD_OK=0
for attempt in 1 2 3 4; do
  if gcloud builds submit --tag "$IMAGE" --timeout=1200s --machine-type=e2-highcpu-8 .; then
    BUILD_OK=1
    break
  fi
  SLEEP=$((2 ** attempt))
  echo "==> Cloud Build attempt $attempt failed; retrying in ${SLEEP}s..." >&2
  sleep "$SLEEP"
done
if [[ "$BUILD_OK" -ne 1 ]]; then
  echo "ERROR: Cloud Build failed after 4 attempts. Check 'gcloud builds list --limit=5'." >&2
  exit 1
fi

# Runtime env (Cloud Run injects these; entrypoint writes runtime-env.js).
# Public client defaults — override via env before running if needed.
: "${VITE_SUPABASE_URL:=https://nekdjoquirhecmejuoba.supabase.co}"
: "${VITE_APP_URL:=https://task.youthnic.shop}"
: "${VITE_SUPABASE_PUBLISHABLE_KEY:=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5la2Rqb3F1aXJoZWNtZWp1b2JhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwODYzMTIsImV4cCI6MjA5NjY2MjMxMn0.fsBzWsY7moMUlNQHIUBtE7cHx-_6A45ArKw49B5SjyY}"
: "${VITE_FIREBASE_API_KEY:=AIzaSyDR8Yzd58za5h0wlcj-EJp4MdBInPnLePU}"
: "${VITE_FIREBASE_AUTH_DOMAIN:=taskflow-pro-by-vb-exports.firebaseapp.com}"
: "${VITE_FIREBASE_PROJECT_ID:=taskflow-pro-by-vb-exports}"
: "${VITE_FIREBASE_STORAGE_BUCKET:=taskflow-pro-by-vb-exports.firebasestorage.app}"
: "${VITE_FIREBASE_MESSAGING_SENDER_ID:=684659983755}"
: "${VITE_FIREBASE_APP_ID:=1:684659983755:web:e255b6e5a60506c92a5b8e}"
: "${VITE_FIREBASE_MEASUREMENT_ID:=G-YWGNCXGK7M}"

ENV_FILE="${WORKDIR}/.cloudrun.env.yaml"
cat > "$ENV_FILE" << EOF
VITE_SUPABASE_URL: "${VITE_SUPABASE_URL}"
VITE_SUPABASE_PUBLISHABLE_KEY: "${VITE_SUPABASE_PUBLISHABLE_KEY}"
VITE_APP_URL: "${VITE_APP_URL}"
VITE_FIREBASE_API_KEY: "${VITE_FIREBASE_API_KEY}"
VITE_FIREBASE_AUTH_DOMAIN: "${VITE_FIREBASE_AUTH_DOMAIN}"
VITE_FIREBASE_PROJECT_ID: "${VITE_FIREBASE_PROJECT_ID}"
VITE_FIREBASE_STORAGE_BUCKET: "${VITE_FIREBASE_STORAGE_BUCKET}"
VITE_FIREBASE_MESSAGING_SENDER_ID: "${VITE_FIREBASE_MESSAGING_SENDER_ID}"
VITE_FIREBASE_APP_ID: "${VITE_FIREBASE_APP_ID}"
VITE_FIREBASE_MEASUREMENT_ID: "${VITE_FIREBASE_MEASUREMENT_ID}"
EOF

echo "==> Deploying with runtime env vars..."
gcloud run deploy "$SERVICE" \
  --image "$IMAGE" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --env-vars-file "$ENV_FILE" \
  --project "$PROJECT_ID"

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
echo ""
echo "============================================"
echo " DEPLOYED: $URL"
echo "============================================"
echo ""
echo "Verify config loaded:"
echo "  curl -s ${URL}/runtime-env.js | head -5"
echo ""
echo "Firebase Console → Auth → Authorized domains:"
echo "  - task.youthnic.shop"
echo "  - ${URL#https://}"
echo ""
echo "Next — deploy Supabase backend (MCP + edge functions):"
echo "  export SUPABASE_ACCESS_TOKEN='sbp_...'   # https://supabase.com/dashboard/account/tokens"
echo "  export SUPABASE_DB_PASSWORD='...'        # optional, for migrations"
echo "  bash scripts/deploy-supabase.sh"
echo ""
echo "Or run both in one shot:"
echo "  bash scripts/deploy-all-cloudshell.sh"
