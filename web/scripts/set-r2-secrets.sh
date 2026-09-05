#!/usr/bin/env bash
# Asks for the two R2 credentials (input is hidden), stores them as Vercel env
# vars for Production and Preview, and redeploys. The values never leave this
# terminal session except for the Vercel API call made by the Vercel CLI.
set -euo pipefail
cd "$(dirname "$0")/.."

read -r -p "R2 Access Key ID: " KEY_ID
read -r -s -p "R2 Secret Access Key (hidden): " SECRET; echo
[ -n "$KEY_ID" ] && [ -n "$SECRET" ] || { echo "both values are required"; exit 1; }

for env in production preview; do
  npx vercel env rm R2_ACCESS_KEY_ID "$env" --yes >/dev/null 2>&1 || true
  npx vercel env rm R2_SECRET_ACCESS_KEY "$env" --yes >/dev/null 2>&1 || true
  printf '%s' "$KEY_ID" | npx vercel env add R2_ACCESS_KEY_ID "$env" >/dev/null
  printf '%s' "$SECRET" | npx vercel env add R2_SECRET_ACCESS_KEY "$env" >/dev/null
  echo "✓ $env"
done
unset SECRET KEY_ID

echo "▸ redeploying production with the new variables…"
LATEST=$(npx vercel ls snimok 2>/dev/null | grep -oE 'https://[^ ]+' | head -1)
npx vercel redeploy "$LATEST" 2>&1 | grep -E "Ready|Error|Aliased" || true
echo "done — tell Claude to run the migration"
