#!/usr/bin/env bash
# Apply patches/full-feature.patch to the repo (dry-run first, then apply).
#
# Usage:
#   # 1. Place your patch file (from Desktop or export) at:
#   #      patches/full-feature.patch
#   # 2. Run:
#   bash scripts/apply-full-feature-patch.sh
#
# Upload from Windows (Cloud Shell):
#   gcloud cloud-shell scp localhost:"C:/Users/shukl/Desktop/full-feature.patch" \
#     cloudshell:~/tasflow-pro/patches/full-feature.patch

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PATCH_FILE="${PATCH_FILE:-$REPO_DIR/patches/full-feature.patch}"

cd "$REPO_DIR"

if [[ ! -f "$PATCH_FILE" ]]; then
  echo "ERROR: Patch file not found: $PATCH_FILE" >&2
  echo "" >&2
  echo "Copy your patch first:" >&2
  echo "  mkdir -p patches" >&2
  echo "  # Upload full-feature.patch to patches/full-feature.patch" >&2
  echo "  bash scripts/apply-full-feature-patch.sh" >&2
  exit 1
fi

echo "==> Dry-run apply: $PATCH_FILE"
if ! patch -p1 --dry-run < "$PATCH_FILE"; then
  echo "" >&2
  echo "Dry-run failed. Resolve conflicts or refresh patch from current main." >&2
  exit 1
fi

echo "==> Applying patch..."
patch -p1 < "$PATCH_FILE"

echo ""
echo "============================================"
echo " Patch applied. Next:"
echo "   npm test -- --run"
echo "   npm run build"
echo "   git add -A && git status"
echo "   git commit -m 'Integrate full-feature.patch'"
echo "   git push -u origin cursor/integrate-full-feature-patch-ddfd"
echo "============================================"
