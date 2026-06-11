#!/bin/sh
set -e
# Inject Cloud Run runtime env into JS so Vite bundle picks up config without rebuild.
export VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-}"
export VITE_SUPABASE_PUBLISHABLE_KEY="${VITE_SUPABASE_PUBLISHABLE_KEY:-}"
export VITE_APP_URL="${VITE_APP_URL:-}"
export VITE_FIREBASE_API_KEY="${VITE_FIREBASE_API_KEY:-}"
export VITE_FIREBASE_AUTH_DOMAIN="${VITE_FIREBASE_AUTH_DOMAIN:-}"
export VITE_FIREBASE_PROJECT_ID="${VITE_FIREBASE_PROJECT_ID:-}"
export VITE_FIREBASE_STORAGE_BUCKET="${VITE_FIREBASE_STORAGE_BUCKET:-}"
export VITE_FIREBASE_MESSAGING_SENDER_ID="${VITE_FIREBASE_MESSAGING_SENDER_ID:-}"
export VITE_FIREBASE_APP_ID="${VITE_FIREBASE_APP_ID:-}"
export VITE_FIREBASE_MEASUREMENT_ID="${VITE_FIREBASE_MEASUREMENT_ID:-}"

envsubst < /etc/runtime-env.js.template > /usr/share/nginx/html/runtime-env.js
if [ -n "$VITE_FIREBASE_API_KEY" ]; then
  echo "[taskflow] runtime-env.js OK (VITE_FIREBASE_API_KEY set)"
else
  echo "[taskflow] WARNING: VITE_FIREBASE_API_KEY empty — set Cloud Run env vars"
fi

exec nginx -g "daemon off;"
