# House Mix — Build Plan

Source brief: [docs/BRIEF.md](docs/BRIEF.md). Qloo runtime contract (read from `@qloo/qloo-harness` 0.1.26): [docs/QLOO_CONTRACT.md](docs/QLOO_CONTRACT.md).
Feature freeze: **Fri 30 Oct 2026, 21:15 IST**. After that: fixes, docs, video only.

## 0. Ground truth gathered before planning

- `qloo mcp` (harness 0.1.26) was installed and introspected without a key. `listTools()` returns exactly 10 tools: `qloo_capabilities`, `qloo_recommend`, `qloo_rank`, `qloo_describe`, `qloo_where_popular`, `qloo_compare_audiences`, `qloo_entity_tags`, `qloo_audience_demographics`, `qloo_trends`, `qloo_find_tags`. Their real JSON input schemas are frozen into `apps/api/src/qloo/contract/tools.json` and served verbatim by the mock, so mock and live cannot drift on input names.
- Real envelope: `schema_version "1.0-preview.1"`, `operation`, `status` (`ok|empty|needs_input|partial|degraded|error`), `summary`, `interpretation`, `results`, `result_count`, `warnings`, `query_intent`, `error {code, layer, retryable, recovery}`, `execution {transport, transport_name, correlation_id, duration_ms}`, `provenance {source, endpoint, documentation, transport, requests[]}`. Delivered both as `structuredContent` and as JSON text, with `isError: true` on errors.
- Key facts that shape the design: `qloo_rank` takes **at most 10 options**, and "scores from separate calls are not comparable"; `qloo_trends` takes 1–5 entities plus an ISO date range; `qloo_where_popular` needs `within`; `signals`/`options`/`group_*` accept names **or** Qloo UUIDs (we always pass confirmed UUIDs); `demographic` is natural language.
- `qloo_capabilities` works without a key and reports `adapter.ready`; this drives the health badge.
- Claude: `ANTHROPIC_API_KEY` verified against `claude-sonnet-5-5`. Prices used for the budget: Sonnet 5.5 $2/$10 per MTok, Opus 5.5 $4/$20, Haiku 5.5 $0.10/$0.50.
- Agent SDK `@anthropic-ai/claude-agent-sdk` 0.3.312: `query()` with `agents` (subagents), `hooks` (PreToolUse, PostToolUse, SubagentStart/Stop, …), `mcpServers` (stdio or in-process via `createSdkMcpServer` + `tool()`), `tools` (restrict built-ins), `systemPrompt`, `maxBudgetUsd`, `outputFormat`.
- Deploy access: Vercel CLI logged in. `gcloud` logged in, but the configured project denies access → build locally with a file store; ask for the GCP project at the deploy step.

## 1. Feature list (everything in BRIEF.md, plus additions)

| # | Feature | Notes |
| --- | --- | --- |
| F1 | Event intake | Mode (Concert, Comedy, Sports, Festival), headliner + support / home + away / festival stages, venue, city, date, capacity tier, house rules (budget band, age rating, sponsor exclusivities, local-only vendors, free-text vibe words). Client + server validation; PII and eligibility guard on every text field. |
| F2 | Entity resolution with confirm | `qloo_describe` per named entity, `qloo_find_tags` per vibe word. `needs_input` or >1 strong candidate → confirm card; nothing downstream runs until every entity is confirmed. `empty` → "refine the name" inline error. |
| F3 | Crowd read | `qloo_compare_audiences` (headliner vs support / home vs away), `qloo_audience_demographics` (aggregate only), `qloo_entity_tags` (taste vocabulary), `qloo_trends` (momentum). Charts + "Qloo says" / "Our interpretation" split. |
| F4 | Run-of-show plan | Mode-specific slot template (§6). Each slot has its own Qloo chain; items carry evidence; one "stretch" wildcard per slot. |
| F5 | Evidence drawer | Tool, inputs (IDs only), status, scores, provenance endpoint, "Qloo says" vs "Our interpretation". |
| F6 | Approval queue | Approve / swap (re-rank via `qloo_rank` over remaining alternatives) / reject with reason (becomes a negative signal for re-plans). Lock plan → version + timestamp. |
| F7 | Exports | Run-of-show PDF, ops CSV, share link (read-only page), sponsor one-pager PDF per activation. |
| F8 | Pre-show audio briefing | Two-voice ~90 s script, each line cites evidence; LLM judge drops unsupported lines; Cloud TTS two voices → MP3; player with synced transcript. |
| F9 | Modes | Concert, Comedy, Sports, Festival — each with its own slot template, copy, and chains. |
| F10 | Tonight vs last night | Two saved shows side by side; `qloo_compare_audiences` across the two headliners; plan diff. |
| F11 | Live agent trace | SSE stream of every tool call (name, status, timing, cache hit, retry), subagent start/stop, Critic drops. Collapsible, filterable. |
| F12 | Responsible-use guardrails | No PII in/out, eligibility refusal with fixed message, limitations panel on every plan. |
| F13 (add) | Health badge + MOCK DATA banner | `qloo_capabilities` readiness, mode, call budget used. |
| F14 (add) | Qloo call budget + cache meter | Per plan: calls used / cap 40, cache hits, retries. Shown in the trace header. |
| F15 (add) | Re-plan with negative signals | Rejections feed `exclude_tags` and a "do not pick" list into the next run. |
| F16 (add) | Seeded demo shows | Concert, comedy night, sports fixture (+ a festival day) available instantly on `/`. |
| F17 (add) | Keyboard-first console | `j/k` move between items, `a/s/r` approve/swap/reject, `e` evidence, `?` shortcuts. |
| F18 (add) | Plan-level confidence | Share of items at ok vs reduced-confidence status; shown on the plan header and the PDF. |

## 2. Architecture

```text
Browser ── Next.js 16 App Router + shadcn/ui + Tailwind v4 + Recharts (Vercel)
   │  fetch JSON + EventSource (SSE) to NEXT_PUBLIC_API_URL
   ▼
apps/api ── Fastify 5 on Node 22 (Cloud Run, min-instances 1)
   ├─ routes/        shows, runs (SSE), items, exports, briefing, compare, health, eval ratings
   ├─ agent/         Claude Agent SDK query(): Planner + subagents; in-process MCP servers
   │                 "qloo" (proxy of the 10 tools through QlooClient) and "housemix" (submit tools)
   │                 hooks: PreToolUse (budget + PII guard), PostToolUse (ledger → trace),
   │                 SubagentStart/Stop (trace), Critic on every submit
   ├─ qloo/client.ts one pooled MCP stdio client → child process
   │                   live: `qloo mcp`        mock: `node mock-server.js`   (env: process.env)
   │                 cache (sha256 of tool + canonical args, 24 h), retry only if error.retryable
   │                 (max 2, exp. backoff), ledger record per call (call_id), per-plan budget
   ├─ critic/        deterministic evidence check + Claude (Anthropic SDK) claim check
   ├─ briefing/      script (Anthropic SDK, structured output) → judge → Cloud TTS → MP3
   ├─ exports/       @react-pdf/renderer (server-side) PDF, CSV
   └─ store/         Store interface: FirestoreStore (prod) | FileStore (local/dev/tests)
          ├─► Claude API (MODEL in one config value)
          ├─► Qloo API (only via the qloo mcp child process; key only in server env)
          ├─► Firestore (shows, runs, events, ledger, cache, ratings) / Cloud Storage (MP3)
          └─► Secret Manager (ANTHROPIC_API_KEY, QLOO_API_KEY, SETLISTFM_API_KEY)
packages/shared ── zod schemas + types + mode templates shared by api, web and eval
eval/ ── A/B kit, setlist.fm backtest, evidence-rate script, REPORT generator
```

**Why the Qloo tools are proxied in-process instead of handing the agent a raw stdio server:** the agent still talks to `qloo mcp` over stdio (started by our backend with `env: process.env`, as the kit requires), but every call passes through one `QlooClient` so that caching, the retry rule (`error.retryable` only), the call budget, the PII guard and the evidence ledger apply to every call, whichever agent makes it. The proxy exposes the **identical tool names and JSON schemas** (taken from `listTools()` of the child), so the agent sees exactly what `qloo mcp` offers.

**Stack changes vs defaults (and why):**
- Store: Firestore in prod, plus a `FileStore` for local dev and CI so tests run with no cloud credentials.
- PDFs are rendered **server-side** in the API with `@react-pdf/renderer` (same library), so exports work from the share page and from scripts too.
- The browser talks straight to the API (CORS allow-list) for SSE; Vercel external rewrites can buffer streams.
- Vercel AI SDK is not used: plain SSE + `EventSource` is enough and has fewer moving parts.
- OpenTelemetry/Langfuse are not used: the evidence ledger + run events already give a complete trace, shown in the UI and stored with each run.

## 3. Qloo tool calls (every call, inputs, status handling)

Common status policy (in `QlooClient` + UI):

| Status | Backend | UI |
| --- | --- | --- |
| `ok` | use results | green chip |
| `empty` | no items from this call; intake → ask to refine | grey chip + "refine" prompt (intake) or "no Qloo signal" (slot) |
| `needs_input` | stop; return candidates; never auto-pick | confirm card |
| `partial` / `degraded` | use results, flag `reducedConfidence`, keep `summary` + `warnings` | amber "reduced confidence" chip + summary |
| `error` | retry only if `error.retryable` (max 2, 400 ms → 1.2 s backoff); otherwise surface `error.recovery` | red chip; slot marked "needs manual input" with recovery text |

| Step | Tool | Inputs (we always send confirmed UUIDs once resolved) |
| --- | --- | --- |
| Boot / health | `qloo_capabilities` | `{}` → `adapter.ready`, contract checksum |
| Intake: entities | `qloo_describe` | `entity` (name), `type` (`artist`/`person`/`brand`/`place`/`locality`) |
| Intake: vibe words, cuisines, "family-friendly" | `qloo_find_tags` | `query`, `limit: 5` |
| Crowd: two sides | `qloo_compare_audiences` | `group_a: [headliner]`, `group_b: [support]` (sports: home vs away), `target_type: artist` (+ a `brand` pass for sponsor context), `limit` |
| Crowd: demographics | `qloo_audience_demographics` | `entity: headlinerId`, `entity_type` |
| Crowd: vocabulary | `qloo_entity_tags` | `entities: [headliner, support]`, `entity_type`, `limit: 12` |
| Walk-in playlist | `qloo_recommend` → `qloo_rank` | recommend `target_type: artist`, `signals: [headliner, support]`, `signal_tags` (confirmed vibe tags), `signal_location: city`, `exclude_tags` (rejections); then rank `options` (≤10 candidate IDs), `option_type: artist`, `signals`, `demographic` (from crowd read) |
| Openers / interval acts | `qloo_rank` (+ `qloo_recommend` to fill the shortlist) + `qloo_trends` | rank user-supplied local acts + recommended acts (≤10); trends on top 1–5, `start_date`/`end_date` = last 90 days |
| Food & drink | `qloo_where_popular` → `qloo_rank` | where_popular `entity: headlinerId`, `within: venue city`; recommend `target_type: place` with `signal_location` + `filter_location`, `signal_tags` (cuisine tags); rank vendor shortlist `option_type: place` |
| Merch & brand activations | `qloo_recommend` + `qloo_compare_audiences` | recommend `target_type: brand`, `signals: [headliner, support]`; sponsor fit = compare `group_a: [headliner, support]`, `group_b: [brand]` |
| Local flavour (pre-show / after-party) | `qloo_where_popular` (+ `qloo_recommend` place in city) | `entity: headlinerId`, `within: city` |
| Wildcard ("stretch") | `qloo_recommend` with the slot's signals + `exclude_tags` of the crowd's top tags, then pick the lowest-affinity item that still has a positive score | labelled "stretch", never the default pick |
| Briefing podcasts / talking points | `qloo_recommend` `target_type: podcast` | `signals: [headliner]` |
| Swap | `qloo_rank` | remaining alternatives of the slot (≤10) with the slot's original signals, rejected excluded |
| Tonight vs last night | `qloo_compare_audiences` | `group_a: [show A headliner]`, `group_b: [show B headliner]` |
| Rising flags | `qloo_trends` | `entity_type`, 1–5 entities, 90-day window |

Budget: cap **40 Qloo calls per plan** (cache hits do not count); the PreToolUse hook denies calls past the cap with a message the agent can act on. Cache: SHA-256 of `tool + canonical JSON args`, 24 h TTL.

## 4. Agent roster (Claude Agent SDK)

One `query()` per plan run. Main thread = **Planner**; subagents are defined in `options.agents` and invoked with the Agent/Task tool. Built-in file/shell tools are disabled (`tools: ["Task"]` only + MCP tools); `settingSources: []`, custom `systemPrompt`; `cwd` set to an empty temp dir.

| Agent | Model | Tools | Job |
| --- | --- | --- | --- |
| Planner (main) | `HM_PLANNER_MODEL` (default `HM_MODEL` = `claude-sonnet-5-5`; Opus 5.5 is a flag if eval shows it helps) | Task, `submit_plan_summary` | Reads confirmed entities + mode template, dispatches subagents (in parallel where independent), writes the plan headline. |
| CrowdReader | `HM_WORKER_MODEL` (default `HM_MODEL`) | compare_audiences, audience_demographics, entity_tags, trends, `submit_crowd_read` | Builds the crowd read; outputs demographic phrase + top tags the others reuse. |
| Programmer | `HM_WORKER_MODEL` | recommend, rank, trends, where_popular, find_tags, `submit_slot` | One invocation per slot (walk-in, openers/interval, food & drink, local flavour). |
| SponsorFit | `HM_WORKER_MODEL` | recommend (brand), compare_audiences, rank, `submit_slot` | Merch + brand activations with fit score. |
| Wildcard | `HM_WORKER_MODEL` | recommend, rank, `submit_wildcard` | One stretch pick per slot. |
| Critic | deterministic + Anthropic SDK (`HM_MODEL`) | — (runs inside every `submit_*` handler) | Drops any item whose cited `call_id` is missing, whose entity is not in that call's results, whose call status was `error`/`empty`, or whose "why" makes claims the evidence does not support. Every drop is a trace event. |

Resolver: a deterministic intake step (not an LLM) that calls `qloo_describe` / `qloo_find_tags` for every name and turns ambiguity into confirm cards. The kit says free-text tags and non-exact names come back as `needs_input`, so resolving up front is what lets every later call pass IDs only.

The demographic phrase sent back to Qloo is derived server-side from Qloo's own age distribution (`phraseFromAges`, age only, never gender), because a model-written phrase can fail the harness's parser.

Evidence contract: every submitted item must cite `{call_id, entity_id}` pairs from the run's ledger. The server — not the model — fills in tool name, inputs, status, scores and provenance from the ledger, so the model cannot fabricate evidence.

Direct Anthropic SDK calls: Critic claim check, briefing script writer, briefing judge, L0 baseline + eval scripts.

## 5. API routes and data schema

| Route | Purpose |
| --- | --- |
| `GET /health` | mode (mock/live), `qloo_capabilities` readiness, version |
| `GET /shows` · `GET /shows/:id` | list (incl. seeds) · full show with plan |
| `POST /shows` | create show from intake; runs resolution; returns show with `entities` + pending confirmations |
| `POST /shows/:id/confirm` | `{entityKey, choiceId}` for each confirmation |
| `POST /shows/:id/runs` | start a plan run → `{runId}` |
| `GET /runs/:runId/events` | SSE: `trace`, `crowd`, `slot`, `item`, `critic`, `done`, `error`; replays stored events on reconnect |
| `POST /shows/:id/items/:itemId/approve · swap · reject` | approval queue (reject body `{reason}`) |
| `POST /shows/:id/lock` | lock version + timestamp |
| `GET /shows/:id/export.pdf · export.csv` · `GET /shows/:id/items/:itemId/sponsor.pdf` | exports |
| `POST /shows/:id/briefing` · `GET /shows/:id/briefing.mp3` | build + stream audio briefing |
| `GET /share/:shareId` | read-only show |
| `GET /compare?a=&b=` | tonight vs last night |
| `GET /eval/pairs` · `POST /eval/ratings` | blind A/B rater page backend |

Schema (zod in `packages/shared`): `Show {id, shareId, mode, title, venue, city, date, capacityTier, houseRules, sides[], entities[], confirmations[], status, plan?, version, lockedAt?, negativeSignals[]}`; `Entity {key, role, input, qlooId?, name, type, status, candidates[]}`; `Plan {headline, crowd: CrowdRead, slots: Slot[], limitations[], stats}`; `Slot {key, label, timeRange, status, items: PlanItem[], alternatives[]}`; `PlanItem {id, slotKey, pick {name, qlooId, type}, qlooSays, interpretation, evidence: Evidence[], confidence, isWildcard, approval}`; `Evidence {callId, tool, inputs (IDs only), status, scores {affinity?, popularity?, …}, summary, provenanceEndpoint}`; `LedgerCall {callId, runId, tool, args, status, summary, resultIds, durationMs, cached, attempts}`; `RunEvent`; `Briefing {lines: {speaker, text, evidence[]}[], dropped[], audioUrl}`.

## 6. UI screens (design from design/DIRECTION.md)

- `/` — landing: one-line pitch, seeded shows grid, "Plan a show" CTA, health badge, MOCK DATA banner.
- `/new` — intake with mode tabs; per-mode fields; inline validation; guard messages.
- `/shows/[id]` — console: header (mode, venue, date, status, confidence, budget meter, exports, lock); confirm cards (when pending); 3-pane layout — **trace** (left), **crowd read + run-of-show timeline** (centre), **approval queue** (right); evidence drawer (sheet); limitations panel; briefing player.
- `/shows/[id]/share` — read-only plan.
- `/compare` — tonight vs last night.
- `/rate` — blind A/B rater page.
- Slot templates: Concert (doors/walk-in, opener, interval/changeover, headliner, after-party, F&B, merch & sponsors, local flavour); Comedy (doors/walk-in, MC + openers, room vibe/interval clips, headliner, F&B, sponsors, after-show); Sports (gates/fan-zone, warm-up playlist, halftime/7th-inning act, concourse food, sponsors, home vs away split, post-match); Festival (per stage blocks + F&B + sponsors + local).

## 7. Mock mode and the switch to live

- `QLOO_MODE=mock|live` (default `mock` until `qloo:verify` passes, then the script flips it to `live` in `.env.local` and `apps/api/.env.defaults`).
- `apps/api/src/qloo/mock-server.ts`: stdio MCP server (MCP SDK low-level `Server`) serving the **frozen real** tool schemas and annotations; envelopes match the real shape (incl. `schema_version`, `operation`, `execution`, `provenance`). Deterministic fake data from `fixtures/mock/*.json` (fictional names, IDs prefixed `mock-`). Status triggers: `describe "Genesis"` → `needs_input`; unknown names/tags → `empty`; `where_popular` within a small locality → `partial`; `audience_demographics` for comedians → `degraded`; first `qloo_trends` call per arg set → retryable `QLOO_RATE_LIMIT`; `MOCK_FORCE_ERROR=<tool>` → non-retryable error.
- UI shows a "MOCK DATA — fictional Qloo results" banner and every evidence row carries `source: mock`.
- `npm run qloo:verify` (`scripts/qloo-verify.ts`): requires `QLOO_API_KEY`; installs or uses `@qloo/qloo-harness@>=0.1.26`; runs `qloo_capabilities` + one representative call per tool; diffs real `listTools()` schemas against the frozen copy and real envelopes/result item shapes against the mock's; writes `fixtures/live/*.json` and `docs/QLOO_VERIFY.md`; updates the frozen contract; flips the default to live; exits non-zero on any unexplained diff so the wrappers get fixed before evals run.
- Evals refuse to write reportable results when `QLOO_MODE=mock`.

## 8. Evaluation design (eval/)

All numbers come from scripts writing `eval/results/*.json`; `eval/report.ts` regenerates `eval/REPORT.md`. Mock runs are refused. Dev/test split is fixed in `eval/data/split.json`.

- **Claim 1 — blind A/B** (`eval/ab_blind/`): 10 real 2025 shows (4 concerts, 3 comedy, 3 football/baseball) in `eval/data/ab_shows.json`. `generate-pairs.ts` builds House Mix vs L0 (same model, same prompt, no Qloo tools) plans in an identical format, strips labels, randomises sides (seeded), stores the key separately. Rater page `/rate` (no login; anonymous rater code; no PII). `score.ts`: win rate overall and per slot with Wilson 95% CI, mean 1–5 "fits this crowd", Fleiss' kappa.
- **Claim 2 — hit@10 backtest** (`eval/backtest/`): `fetch-setlists.ts` (setlist.fm, `x-api-key`, `Accept: application/json`, rate-limited, cached) builds 30 headliner→support pairs from 2025 shows; pool = the true support act(s) + 49 distractors drawn from other shows' support acts in the same genre bucket (no Qloo involvement in pool building). Because `qloo_rank` takes ≤10 options and scores across calls are not comparable, ranking is a two-round tournament: 5 groups of 10 → top 2 of each → final rank of 10 finalists. House Mix = rank with `signals [headliner]` + `signal_location`; P0 = the same tournament with no taste signals (Qloo's own default ordering) — a popularity proxy; L0 = Claude ranks the 50 from knowledge. Metrics: hit@10, MRR. Tune on 5 dev shows; report on 25 test shows.
- **Claim 3 — evidence rate** (`eval/evidence/`): share of plan items + briefing lines with a valid citation (call_id in ledger, entity present in results), House Mix vs L0; hallucinated entities = L0 names that `qloo_describe` returns `empty` for.
- Also: median plan time, Qloo calls per plan, cache hit rate, cost per plan (from SDK `total_cost_usd`), and at least one honest negative result.

## 9. Demo script (≤ 3 min) — see docs/VIDEO_SCRIPT.md

Hook → sports intake (home vs away) → "Genesis" triggers `needs_input` confirm card → live trace + crowd read + slots filling → evidence drawer, approve ×2, swap ×1 (re-rank), reject ×1 → comedy mode switch, sponsor one-pager PDF, 15 s of briefing → results table + negative result.

## 10. Deploy

- `infra/deploy-api.sh`: build image (Node 22, `npm i -g @qloo/qloo-harness@^0.1.26`, non-root) with Cloud Build → Artifact Registry → Cloud Run (`--min-instances 1`, `--set-secrets` for the 3 keys, `QLOO_MODE`), Firestore (native), a GCS bucket for MP3s, Text-to-Speech API.
- `infra/deploy-web.sh`: `vercel deploy --prod` with `NEXT_PUBLIC_API_URL`.
- `infra/secrets.sh`: creates/updates Secret Manager secrets from `.env.local` without echoing values.
- CI (`.github/workflows/ci.yml`): typecheck, unit tests, Playwright e2e + axe in mock mode, gitleaks.

## 11. Risks

| Risk | Mitigation |
| --- | --- |
| Qloo result item shapes differ from the mock | Contract read from harness source; `qloo:verify` diffs and fails loudly; wrappers normalise via one adapter per tool. |
| Agent run too slow/expensive | Sonnet 5.5, subagents in parallel, ≤40 Qloo calls, cache, `maxBudgetUsd` per run (0.75), seeded shows for instant demo. Dev runs on Haiku 5.5. |
| Agent skips a slot or cites nothing | Critic drops unsupported items; slot shows "needs manual input"; re-run slot button. |
| `qloo mcp` cannot run serverless | Runs inside the Cloud Run container only. |
| No GCP project access | FileStore + local run; ask at deploy step. |
| Cloud TTS unavailable | Briefing still produced as a judged script with transcript; audio button shows the exact reason. |
| setlist.fm key missing | Backtest code + tests built; run skipped and reported as pending. |
| Spend > $15 | Per-run `maxBudgetUsd`, spend ledger in `data/spend.json`, stop and ask before crossing $15. |

## 12. Phases (each ends with a commit)

- [x] **P1 Scaffold** — workspaces, TS config, shared schemas, lint/test tooling, .env.example, gitleaks CI. *Done when* `npm run typecheck && npm test` pass on an empty suite.
- [x] **P2 Qloo layer** — frozen contract, mock server + fixtures (all 6 statuses), QlooClient (pool, cache, retry rule, budget, ledger), typed wrappers, `qloo:verify`. *Done when* tests show every status from the mock over real stdio MCP, retry happens only on `retryable`, and the cache hits on a repeat call.
- [x] **P3 Store + shows + resolution** — FileStore/FirestoreStore, `POST /shows`, confirm flow, guardrails. *Done when* "Genesis" returns a pending confirmation and confirm resolves it (API test).
- [x] **P4 Agent pipeline** — Planner + subagents, proxy MCP, hooks, Critic, SSE run events, slot templates for 4 modes. *Done when* a mock-mode run produces a full plan where 100% of items have valid evidence and the trace shows every call.
- [x] **P5 Approvals, exports, share, compare** — approve/swap/reject/lock, PDF/CSV/sponsor PDF, share, compare. *Done when* API tests cover each and the PDF opens.
- [x] **P6 Briefing** — script, judge, TTS, MP3. *Done when* a briefing with ≥1 judged-out line is produced and audio plays (or the TTS reason is shown).
- [x] **P7 UI research** — screenshots, REFERENCES.md, DIRECTION.md. *Done when* both docs exist with scores and tokens.
- [x] **P8 Web app** — all screens, states, a11y; screenshots to design/app. *Done when* Playwright e2e + axe pass in mock mode and screenshots are reviewed against references.
- [x] **P9 Seeds** — 3 seeded shows (+ festival). *Done when* `/` shows them and each opens a full plan instantly.
- [x] **P10 Eval kit** — A/B, backtest, evidence-rate, report generator. *Done when* unit tests pass and `REPORT.md` renders with "pending live Qloo key" where data is missing.
- [x] **P11 Docs** — README, DEVPOST, VIDEO_SCRIPT, QLOO_WALKTHROUGH (template until live), FRICTION_LOG, LIMITATIONS. *Done when* every deliverable file exists.
- [x] **P12 Deploy** — Cloud Run + Vercel. *Done when* hosted URLs work without login (needs GCP project from the user).
- [x] **P14 Round-4 features** — crowd map (`qloo_where_popular` per side, overlap, street-team areas), "Without Qloo" (Claude-alone plan checked by `qloo_describe` and ranked by `qloo_rank` against House Mix), "Ask House Mix" (tool loop over the Qloo tools, cited lines, Critic, proposals into the queue). *Done when* each renders on every seed, has API or e2e coverage, and appears in the PDF/README/Devpost.
- [ ] **P13 Refine loop** (in progress; rounds logged in docs/REFINE_LOG.md) — rounds logged in docs/REFINE_LOG.md until nothing would change a judge's score.

## Status (29 Oct 2026, 21:30 IST)

- Live: https://house-mix.vercel.app (web) · https://house-mix-api-120659974854.us-central1.run.app (API, GCP project `house-mix-qloo-1029`).
- Waiting on external inputs: `QLOO_API_KEY` (then `npm run qloo:verify`, live re-seed, evals), `SETLISTFM_API_KEY` (backtest), human raters (A/B). See docs/GO_LIVE.md.
- Round 4 (29 Oct): crowd map, "Without Qloo", "Ask House Mix"; seeds regenerated. Claude spend so far about 13.2 USD of the 15 USD limit (local 11.5 tracked, about 0.9 untracked early runs, production 0.7); production cap lowered to 2.3 USD so the total cannot pass 15 USD.
- Round 5 (29 Oct): landing redesign from an Awwwards research round (18 sites captured with Playwright); 3D hero (three.js / React Three Fiber), Motion scroll animation, poster art per mode. Lighthouse landing 98 desktop / 94 mobile, accessibility 100.
- Stack changes made during the build: subagent workers can run on a cheaper model (`HM_WORKER_MODEL`) to keep plans near 0.5 USD; plan runs use the 5-minute prompt cache; Firestore stores JSON strings; images can be built locally and pushed when Cloud Build is unavailable.
