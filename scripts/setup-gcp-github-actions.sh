#!/usr/bin/env bash
# Create a GCP service account for GitHub Actions auto-deploy.
# Run once in Google Cloud Shell, then paste the JSON into GitHub secret GCP_SA_KEY.
#
# Usage:
#   export PROJECT_ID=robust-solution-425310-t9
#   bash scripts/setup-gcp-github-actions.sh

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-robust-solution-425310-t9}"
SA_NAME="github-actions-deploy"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
KEY_FILE="${HOME}/gcp-sa-github-actions.json"

gcloud config set project "$PROJECT_ID"

echo "==> Creating service account (idempotent)..."
gcloud iam service-accounts describe "$SA_EMAIL" 2>/dev/null || \
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="GitHub Actions deploy (tasflow-pro)"

ROLES=(
  roles/run.admin
  roles/cloudbuild.builds.editor
  roles/artifactregistry.writer
  roles/iam.serviceAccountUser
  roles/storage.admin
)

echo "==> Granting IAM roles..."
for role in "${ROLES[@]}"; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="$role" \
    --condition=None \
    --quiet >/dev/null
  echo "  + $role"
done

echo "==> Creating key..."
rm -f "$KEY_FILE"
gcloud iam service-accounts keys create "$KEY_FILE" \
  --iam-account="$SA_EMAIL"

echo ""
echo "============================================"
echo " DONE. Next steps:"
echo "============================================"
echo ""
echo "1. Copy the JSON below (entire file):"
echo "   cat $KEY_FILE"
echo ""
echo "2. GitHub → pawanshukla500/tasflow-pro → Settings"
echo "   → Secrets and variables → Actions → New repository secret"
echo "   Name:  GCP_SA_KEY"
echo "   Value: (paste entire JSON)"
echo ""
echo "3. Also add these secrets if not set yet:"
echo "   SUPABASE_ACCESS_TOKEN  — https://supabase.com/dashboard/account/tokens"
echo "   SUPABASE_DB_PASSWORD   — Supabase Dashboard → Database password"
echo ""
echo "4. Re-run the failed workflow:"
echo "   GitHub → Actions → Deploy → Re-run all jobs"
echo ""
echo "Key file: $KEY_FILE"
echo "============================================"
