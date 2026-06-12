#!/usr/bin/env bash
# TaskFlow Pro — deploy Supabase backend (migrations + edge functions) from Cloud Shell
# or any CI environment without interactive `supabase login`.
#
# Required env:
#   SUPABASE_ACCESS_TOKEN  — from https://supabase.com/dashboard/account/tokens
# Optional:
#   SUPABASE_DB_PASSWORD   — needed for `db push` (Dashboard → Database → password)
#   PROJECT_REF            — defaults to nekdjoquirhecmejuoba

set -euo pipefail

PROJECT_REF="${PROJECT_REF:-nekdjoquirhecmejuoba}"
REPO_DIR="${REPO_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "ERROR: SUPABASE_ACCESS_TOKEN is not set." >&2
  echo "" >&2
  echo "Cloud Shell (one-time setup):" >&2
  echo "  1. Open https://supabase.com/dashboard/account/tokens" >&2
  echo "  2. Create a token, then run:" >&2
  echo "     export SUPABASE_ACCESS_TOKEN='sbp_...'" >&2
  echo "     export SUPABASE_DB_PASSWORD='your-db-password'" >&2
  echo "     bash scripts/deploy-supabase.sh" >&2
  echo "" >&2
  echo "For GitHub Actions, add SUPABASE_ACCESS_TOKEN and SUPABASE_DB_PASSWORD as repo secrets." >&2
  exit 1
fi

export SUPABASE_ACCESS_TOKEN

cd "$REPO_DIR"

echo "==> Linking Supabase project $PROJECT_REF..."
npx --yes supabase@2.106.0 link --project-ref "$PROJECT_REF"

if [[ -n "${SUPABASE_DB_PASSWORD:-}" ]]; then
  echo "==> Applying database migrations..."
  # Pooler host works from Cloud Shell (direct db.* host is IPv6-only).
  export SUPABASE_DB_URL="postgresql://postgres.${PROJECT_REF}:${SUPABASE_DB_PASSWORD}@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres"
  npx --yes supabase@2.106.0 db push --include-all
else
  echo "==> Skipping db push (SUPABASE_DB_PASSWORD not set)."
fi

echo "==> Deploying edge functions..."
MCP_FUNCTIONS=(mcp-server issue-mcp-token)
CORE_FUNCTIONS=(
  firebase-auth create-team-member delete-team-member register-organization
  firebase-upload daily-motivation notify-task-assigned notify-workflow-stage
  process-email-queue send-daily-digest send-department-daily-summary
  send-weekly-pending-report send-due-reminders send-transactional-email
  send-password-reset complete-password-reset polish-note handle-email-unsubscribe
)

for fn in "${MCP_FUNCTIONS[@]}"; do
  echo "  - $fn"
  if [[ "$fn" == "mcp-server" ]]; then
    npx --yes supabase@2.106.0 functions deploy "$fn" --project-ref "$PROJECT_REF" --no-verify-jwt
  else
    npx --yes supabase@2.106.0 functions deploy "$fn" --project-ref "$PROJECT_REF"
  fi
done

for fn in "${CORE_FUNCTIONS[@]}"; do
  echo "  - $fn"
  npx --yes supabase@2.106.0 functions deploy "$fn" --project-ref "$PROJECT_REF" --no-verify-jwt || \
    echo "    WARNING: $fn deploy failed (continuing)"
done

echo ""
echo "============================================"
echo " Supabase backend deploy complete."
echo " MCP URL: https://${PROJECT_REF}.supabase.co/functions/v1/mcp-server"
echo "============================================"
