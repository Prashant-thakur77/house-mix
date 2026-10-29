#!/usr/bin/env bash
# Deploys the web console to Vercel (production) from the repo root; the Vercel project's root
# directory is apps/web so the workspace package @housemix/shared resolves.
# Usage: API_URL=https://...run.app infra/deploy-web.sh
set -euo pipefail
: "${API_URL:?set API_URL to the Cloud Run URL}"
cd "$(dirname "$0")/.."
[ -f .vercel/project.json ] || vercel link --yes --project house-mix
vercel deploy --prod --yes --build-env "NEXT_PUBLIC_API_URL=${API_URL}" --env "NEXT_PUBLIC_API_URL=${API_URL}"
