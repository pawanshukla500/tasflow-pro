#!/usr/bin/env bash
# Apply patches/full-feature.patch (non-interactive — no "File to patch:" prompts).
#
# Usage:
#   bash scripts/apply-full-feature-patch.sh
#
# Upload patch to: patches/full-feature.patch (Cloud Shell Upload button)

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PATCH_FILE="${PATCH_FILE:-$REPO_DIR/patches/full-feature.patch}"

cd "$REPO_DIR"

if [[ ! -f "$PATCH_FILE" ]]; then
  echo "ERROR: Patch file not found: $PATCH_FILE" >&2
  exit 1
fi

echo "==> Preparing missing files referenced by patch..."
# Create empty placeholders for modified files that don't exist yet (e.g. CLAUDE.md).
grep -E '^--- a/' "$PATCH_FILE" | sed 's|^--- a/||' | sort -u | while IFS= read -r f; do
  if [[ -n "$f" && "$f" != "/dev/null" && ! -f "$f" ]]; then
    echo "  + touch $f"
    mkdir -p "$(dirname "$f")"
    touch "$f"
  fi
done

echo "==> Trying git apply (preferred for git-format patches)..."
if git apply --check "$PATCH_FILE" 2>/dev/null; then
  git apply "$PATCH_FILE"
  echo "==> Applied via git apply."
  exit 0
fi

echo "==> git apply --check failed; trying patch --batch -f..."
if patch -p1 --dry-run --batch -f < "$PATCH_FILE" 2>/dev/null; then
  patch -p1 --batch -f < "$PATCH_FILE"
  echo "==> Applied via patch."
  exit 0
fi

echo "==> Trying patch with reject files (partial apply)..."
patch -p1 --batch -f --reject-file=- < "$PATCH_FILE" || true

if ls *.rej 1>/dev/null 2>&1 || find . -name '*.rej' | grep -q .; then
  echo "" >&2
  echo "WARNING: Some hunks failed (.rej files created). Review rejects:" >&2
  find . -name '*.rej' 2>/dev/null | head -20 >&2
  exit 1
fi

echo "==> Patch applied."
echo ""
echo "Next:"
echo "  npm test -- --run"
echo "  npm run build"
echo "  git add -A && git status"
echo "  git commit -m 'Integrate full-feature.patch'"
