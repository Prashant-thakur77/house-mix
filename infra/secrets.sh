#!/usr/bin/env bash
# Creates or updates Secret Manager secrets from .env.local without printing values.
# Usage: GCP_PROJECT=my-project infra/secrets.sh
set -euo pipefail
: "${GCP_PROJECT:?set GCP_PROJECT}"
cd "$(dirname "$0")/.."
[ -f .env.local ] || { echo ".env.local not found"; exit 1; }
for name in ANTHROPIC_API_KEY QLOO_API_KEY SETLISTFM_API_KEY; do
  value="$(grep -E "^${name}=" .env.local | head -1 | cut -d= -f2- || true)"
  if [ -z "$value" ]; then echo "skip ${name} (empty)"; continue; fi
  secret="$(echo "$name" | tr '[:upper:]_' '[:lower:]-')"
  if ! gcloud secrets describe "$secret" --project "$GCP_PROJECT" >/dev/null 2>&1; then
    gcloud secrets create "$secret" --project "$GCP_PROJECT" --replication-policy=automatic >/dev/null
  fi
  printf '%s' "$value" | gcloud secrets versions add "$secret" --project "$GCP_PROJECT" --data-file=- >/dev/null
  echo "updated secret ${secret}"
done
