#!/usr/bin/env bash
# Run in Cloud Shell AFTER apply-full-feature-patch.sh (fixes commit + cleanup).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

echo "==> Cleaning patch artifacts..."
find . -name '*.orig' -delete
rm -rf supabase/.temp 2>/dev/null || true

# Duplicate MCP migration — main already has 20260612090957_mcp_access_tokens.sql
if [[ -f supabase/migrations/20260613120000_mcp_access_tokens.sql ]]; then
  echo "  - Removing duplicate MCP migration (already on main)"
  rm -f supabase/migrations/20260613120000_mcp_access_tokens.sql
  git rm -f supabase/migrations/20260613120000_mcp_access_tokens.sql 2>/dev/null || true
fi

echo "==> Git identity (required for commit)..."
if ! git config user.email >/dev/null 2>&1; then
  git config user.email "returnorders@vbexports.co.in"
  git config user.name "Pawan Shukla"
fi

echo "==> Install deps (vitest/vite missing without npm ci)..."
npm ci --ignore-scripts 2>/dev/null || npm install

echo "==> Test & build..."
npm test -- --run
npm run build

echo "==> Stage integration (exclude temp artifacts)..."
git add -A
git reset HEAD supabase/.temp 2>/dev/null || true
find . -name '*.orig' -delete

git status

if git diff --cached --quiet; then
  echo "Nothing to commit — check patch apply output."
  exit 1
fi

BRANCH="${BRANCH:-cursor/integrate-full-feature-ddfd}"
git checkout -B "$BRANCH"
git commit -m "Integrate full-feature.patch (Google OAuth, Calendar sync, extended MCP tools)."
git push -u origin "$BRANCH"

echo ""
echo "============================================"
echo " DONE. Open PR and merge:"
echo " https://github.com/pawanshukla500/tasflow-pro/compare/main...$BRANCH"
echo " GitHub Actions will auto-deploy on merge to main."
echo "============================================"
