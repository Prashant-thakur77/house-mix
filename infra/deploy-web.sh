#!/usr/bin/env bash
# Deploys the web console to Vercel (production). Usage: API_URL=https://...run.app infra/deploy-web.sh
set -euo pipefail
: "${API_URL:?set API_URL to the Cloud Run URL}"
cd "$(dirname "$0")/../apps/web"
vercel pull --yes --environment=production >/dev/null
printf '%s' "$API_URL" | vercel env add NEXT_PUBLIC_API_URL production --force >/dev/null 2>&1 || true
vercel deploy --prod --yes --build-env "NEXT_PUBLIC_API_URL=${API_URL}" --env "NEXT_PUBLIC_API_URL=${API_URL}"
