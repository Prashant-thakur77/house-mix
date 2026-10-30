#!/usr/bin/env bash
# Builds the API image with Cloud Build and deploys it to Cloud Run (min-instances 1, secrets from Secret Manager).
# Usage: GCP_PROJECT=my-project [REGION=us-central1] [QLOO_MODE=live] [WEB_ORIGIN=https://house-mix.vercel.app] infra/deploy-api.sh
set -euo pipefail
: "${GCP_PROJECT:?set GCP_PROJECT}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-house-mix-api}"
QLOO_MODE="${QLOO_MODE:-mock}"
BUCKET="${HM_AUDIO_BUCKET:-${GCP_PROJECT}-house-mix-audio}"
cd "$(dirname "$0")/.."

gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  firestore.googleapis.com secretmanager.googleapis.com texttospeech.googleapis.com storage.googleapis.com \
  --project "$GCP_PROJECT"
gcloud artifacts repositories describe house-mix --location "$REGION" --project "$GCP_PROJECT" >/dev/null 2>&1 \
  || gcloud artifacts repositories create house-mix --repository-format docker --location "$REGION" --project "$GCP_PROJECT"
gcloud firestore databases describe --project "$GCP_PROJECT" >/dev/null 2>&1 \
  || gcloud firestore databases create --location "$REGION" --project "$GCP_PROJECT"
gcloud storage buckets describe "gs://${BUCKET}" --project "$GCP_PROJECT" >/dev/null 2>&1 \
  || gcloud storage buckets create "gs://${BUCKET}" --location "$REGION" --project "$GCP_PROJECT" --uniform-bucket-level-access

IMAGE="${REGION}-docker.pkg.dev/${GCP_PROJECT}/house-mix/api:$(git rev-parse --short HEAD)"
if [ "${LOCAL_BUILD:-0}" = "1" ]; then
  # Build with the local Docker daemon and push (useful when Cloud Build is not yet usable on a new project).
  docker build -f apps/api/Dockerfile -t "$IMAGE" .
  gcloud auth print-access-token | docker login -u oauth2accesstoken --password-stdin "https://${REGION}-docker.pkg.dev" >/dev/null
  docker push "$IMAGE"
else
  gcloud builds submit --project "$GCP_PROJECT" --config infra/cloudbuild.yaml --substitutions "_IMAGE=${IMAGE}" .
fi

SA="$(gcloud projects describe "$GCP_PROJECT" --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
for role in roles/secretmanager.secretAccessor roles/datastore.user roles/storage.objectAdmin; do
  gcloud projects add-iam-policy-binding "$GCP_PROJECT" --member "serviceAccount:${SA}" --role "$role" --condition=None >/dev/null
done

# Bring your own key (apps/api/src/keys.ts): on the public site every Claude feature runs on the visitor's own Anthropic
# key, so the deployment carries no Anthropic key of ours at all and nothing can spend it. Demo shows are read-only;
# visitors make their own copy. HM_REQUIRE_USER_KEY=0 restores the server key (and the spend cap) for a private deploy.
HM_REQUIRE_USER_KEY="${HM_REQUIRE_USER_KEY:-1}"
HM_PROTECT_SEEDS="${HM_PROTECT_SEEDS:-1}"
SECRETS=""
[ "$HM_REQUIRE_USER_KEY" = "1" ] || SECRETS="ANTHROPIC_API_KEY=anthropic-api-key:latest"
gcloud secrets describe qloo-api-key --project "$GCP_PROJECT" >/dev/null 2>&1 && SECRETS="${SECRETS:+${SECRETS},}QLOO_API_KEY=qloo-api-key:latest"
# The hackathon key only works against Qloo's hackathon server; the harness needs the trusted base to match.
QBASE="${QLOO_BASE_URL:-$(grep -E '^QLOO_BASE_URL=' .env.local 2>/dev/null | head -1 | cut -d= -f2- || true)}"
QENV=""
[ -n "$QBASE" ] && QENV=",QLOO_BASE_URL=${QBASE},QLOO_TRUSTED_BASE_URL=${QBASE}"
gcloud run deploy "$SERVICE" --project "$GCP_PROJECT" --region "$REGION" --image "$IMAGE" \
  --allow-unauthenticated --min-instances 1 --max-instances 3 --cpu 1 --memory 2Gi --timeout 900 \
  --no-cpu-throttling --concurrency 40 \
  --set-secrets "$SECRETS" \
  --set-env-vars "HM_REQUIRE_USER_KEY=${HM_REQUIRE_USER_KEY},HM_PROTECT_SEEDS=${HM_PROTECT_SEEDS},QLOO_MODE=${QLOO_MODE},HM_SPEND_LIMIT_USD=${HM_SPEND_LIMIT_USD:-8},HM_MAX_CONCURRENT_RUNS=1,HM_STORE=firestore,GOOGLE_CLOUD_PROJECT=${GCP_PROJECT},HM_AUDIO_BUCKET=${BUCKET},HM_CORS_ORIGINS=${WEB_ORIGIN:-*}${QENV}"
gcloud run services describe "$SERVICE" --project "$GCP_PROJECT" --region "$REGION" --format 'value(status.url)'
