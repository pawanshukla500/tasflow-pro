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
SUPABASE_CLI="npx --yes supabase@2.106.0"

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

# URL-encode DB password for the pooler connection string ($, @, etc.).
urlencode() {
  local s="$1" out="" c hex i
  for ((i = 0; i < ${#s}; i++)); do
    c="${s:i:1}"
    case "$c" in
      [a-zA-Z0-9.~_-]) out+="$c" ;;
      *) printf -v hex '%%%02X' "'$c"; out+="$hex" ;;
    esac
  done
  printf '%s' "$out"
}

cd "$REPO_DIR"

echo "==> Linking Supabase project $PROJECT_REF..."
$SUPABASE_CLI link --project-ref "$PROJECT_REF"

DB_PUSH_OK=1
if [[ -n "${SUPABASE_DB_PASSWORD:-}" ]]; then
  echo "==> Applying database migrations..."
  ENCODED_PW="$(urlencode "$SUPABASE_DB_PASSWORD")"
  export SUPABASE_DB_URL="postgresql://postgres.${PROJECT_REF}:${ENCODED_PW}@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres"
  if $SUPABASE_CLI db push --include-all; then
    echo "==> Migrations applied."
  else
    DB_PUSH_OK=0
    echo "WARNING: db push failed (migration history drift?). Edge functions will still deploy." >&2
    echo "         If this persists after git pull, open an issue with the full error output." >&2
  fi
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
    $SUPABASE_CLI functions deploy "$fn" --project-ref "$PROJECT_REF" --no-verify-jwt
  else
    $SUPABASE_CLI functions deploy "$fn" --project-ref "$PROJECT_REF"
  fi
done

for fn in "${CORE_FUNCTIONS[@]}"; do
  echo "  - $fn"
  $SUPABASE_CLI functions deploy "$fn" --project-ref "$PROJECT_REF" --no-verify-jwt || \
    echo "    WARNING: $fn deploy failed (continuing)"
done

echo ""
echo "============================================"
if [[ "$DB_PUSH_OK" -eq 1 ]]; then
  echo " Supabase backend deploy complete."
else
  echo " Supabase edge functions deployed (migrations had warnings)."
fi
echo " MCP URL: https://${PROJECT_REF}.supabase.co/functions/v1/mcp-server"
echo "============================================"
