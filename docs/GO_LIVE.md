# Switching House Mix to live Qloo

Run these from the repo root once the event Qloo key arrives. The key goes only in `.env.local` (gitignored) and Secret Manager.

**Status (30 Oct 2026):** done. The hackathon key works only against `https://hackathon.api.qloo.com`, so `.env.local` also sets `QLOO_BASE_URL` and `QLOO_TRUSTED_BASE_URL` to it (not secrets; `infra/deploy-api.sh` passes them to Cloud Run). `qloo:verify` passes 11 of 11 checks, the five demo shows were re-seeded live, and the A/B pairs and evidence eval ran on live plans.

```sh
# 1. Key: local only, never committed
echo 'QLOO_API_KEY=<paste>' >> .env.local          # and SETLISTFM_API_KEY=<paste> if you have it
echo 'QLOO_BASE_URL=https://hackathon.api.qloo.com' >> .env.local
echo 'QLOO_TRUSTED_BASE_URL=https://hackathon.api.qloo.com' >> .env.local

# 2. Verify the live contract against the mock (installs @qloo/qloo-harness >= 0.1.26 if needed)
npm run qloo:verify                                  # writes fixtures/live/, docs/QLOO_VERIFY.md; sets QLOO_MODE=live in .env.local
#    Exit 1 means an adapter in apps/api/src/qloo/normalize.ts needs a fix against fixtures/live/*.json.

# 3. Re-seed the demo shows from live data (Sonnet planner, Haiku workers; about 0.5 USD each)
QLOO_MODE=live HM_WORKER_MODEL=claude-haiku-5-5 npx tsx --env-file=.env.local apps/api/scripts/seed.ts
npx tsx scripts/walkthrough.ts live sports         # regenerates docs/QLOO_WALKTHROUGH.md from live calls

# 4. Evals (live only; they refuse mock mode)
npm run eval:fetch                                   # setlist.fm cases (needs SETLISTFM_API_KEY)
npm run eval:backtest
#    Mark the A/B shows "verified": true in eval/data/ab_shows.json after checking each listing, then:
npm run eval:ab:pairs                                # writes eval/data/choices.pending.json if a name is ambiguous
npm run eval:evidence
npm run eval:ab:judge                                # automated blind judge, both orders (secondary signal)
#    Share https://house-mix.vercel.app/rate with 20+ raters, then:
npm run eval:ab:score && npm run eval:report

# 5. Tests in live mode
QLOO_MODE=live npm run test:e2e

# 6. Redeploy
GCP_PROJECT=house-mix-qloo-1029 infra/secrets.sh
GCP_PROJECT=house-mix-qloo-1029 REGION=us-central1 QLOO_MODE=live LOCAL_BUILD=1 WEB_ORIGIN=https://house-mix.vercel.app infra/deploy-api.sh
API_URL=https://house-mix-api-120659974854.us-central1.run.app infra/deploy-web.sh
```

Budget: the hosted API refuses new plans, comparisons and questions after `HM_SPEND_LIMIT_USD`. It is deployed at 2.3 USD (29 Oct) so the build's total stays under the agreed 15 USD; raise it on redeploy (`HM_SPEND_LIMIT_USD=… infra/deploy-api.sh`) when you want more headroom. A live plan costs about 0.5 USD, a "Without Qloo" comparison about 0.03 USD, an Ask question 0.07–0.25 USD; the full eval (10 A/B plans + L0 + backtest ranking) about 6–8 USD with Haiku workers.

After the live re-seed, refresh the seeds' extras with live data too: `QLOO_MODE=live npx tsx --env-file=../../.env.local scripts/seed.ts --extras --ask` (from `apps/api`), then `--clean` to drop unreferenced ledger calls.
