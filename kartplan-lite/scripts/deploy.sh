#!/usr/bin/env bash
# Etkileşimsiz deploy (bulut oturumu, CI): servis hesabıyla Hosting + Firestore kuralları.
#   FIREBASE_SERVICE_ACCOUNT  servis hesabı JSON içeriği (ya da GOOGLE_APPLICATION_CREDENTIALS dosyası)
#   FIREBASE_PROJECT_ID       proje kimliği
set -euo pipefail
cd "$(dirname "$0")/.."

: "${FIREBASE_PROJECT_ID:?FIREBASE_PROJECT_ID tanımlı değil}"

if [ -n "${FIREBASE_SERVICE_ACCOUNT:-}" ]; then
  key="$(mktemp)"
  trap 'rm -f "$key"' EXIT
  printf '%s' "$FIREBASE_SERVICE_ACCOUNT" > "$key"
  export GOOGLE_APPLICATION_CREDENTIALS="$key"
fi
: "${GOOGLE_APPLICATION_CREDENTIALS:?FIREBASE_SERVICE_ACCOUNT ya da GOOGLE_APPLICATION_CREDENTIALS gerekli}"

npm ci
npm test
npm run build
npx --yes firebase-tools@15.34.0 deploy --only hosting,firestore \
  --project "$FIREBASE_PROJECT_ID" --non-interactive
echo "Yayında: https://${FIREBASE_PROJECT_ID}.web.app"
