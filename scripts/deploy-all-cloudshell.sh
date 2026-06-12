#!/usr/bin/env bash
# TaskFlow Pro — full deploy from Google Cloud Shell:
#   1. Cloud Run frontend (scripts/deploy-cloudshell.sh)
#   2. Supabase backend   (scripts/deploy-supabase.sh, if SUPABASE_ACCESS_TOKEN is set)
#
# Usage:
#   export PROJECT_ID=robust-solution-425310-t9
#   export SUPABASE_ACCESS_TOKEN='sbp_...'      # optional but needed for MCP
#   export SUPABASE_DB_PASSWORD='...'           # optional, for migrations
#   bash scripts/deploy-all-cloudshell.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "========== Step 1/2: Cloud Run frontend =========="
bash "$SCRIPT_DIR/deploy-cloudshell.sh"

if [[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo ""
  echo "========== Step 2/2: Supabase backend =========="
  bash "$SCRIPT_DIR/deploy-supabase.sh"
else
  echo ""
  echo "========== Step 2/2: Skipped (no SUPABASE_ACCESS_TOKEN) =========="
  echo "Set SUPABASE_ACCESS_TOKEN to deploy MCP + edge functions automatically."
  echo "  export SUPABASE_ACCESS_TOKEN='sbp_...'"
  echo "  bash scripts/deploy-supabase.sh"
fi
