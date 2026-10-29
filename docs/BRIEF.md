# House Mix — Qloo Hackathon Build Plan

Oct 29, 2026 · @Prashant Thakur

## The pitch

**House Mix turns tonight's lineup into a crowd-programmed run-of-show. Every walk-in track, interval act, food stall, merch drop and sponsor activation is chosen with Qloo taste data, and each one carries its evidence.** A venue general manager or promoter types the event (headliner and support, or home vs away) and the city. In a few minutes they get a show plan they can approve line by line.

**Who uses it:**

- Venue GMs and programming managers at arenas, stadiums, clubs and comedy rooms.
- Promoters and tour reps planning support acts, interval acts and local partnerships.
- Sponsorship and hospitality teams choosing which food, drink and brand activations fit tonight's crowd.

**Why it wins on Qloo's rubric (four equal criteria; ties are broken in this order):**

| Criterion | What House Mix shows |
| --- | --- |
| Technological Implementation | Every one of Qloo's 9 MCP tools does load-bearing work. The agent resolves entities, asks you to confirm whenever Qloo returns `needs_input`, and every plan item cites the Qloo call it came from. |
| Design | A finished operator console: an event intake, a live agent trace, a run-of-show timeline, an evidence drawer, an approval queue, exports, and an audio briefing. |
| Potential Impact | A named buyer (venues and promoters) with a real decision made every night, and proof from a blind A/B test and a backtest against shows that actually happened. |
| Quality of the Idea | Programming for the aggregate crowd, not one person. Nobody in the gallery does this. It also includes Zesty-style wildcard picks and a home-vs-away split. |

**Judge fit:** a Live Nation executive (live shows), Todd Boehly (Dodgers, Chelsea, venues and hospitality), and Cedric the Entertainer (comedy rooms). Comedy is a first-class mode.

**Built from proven winners:**

- [mywaves.xyz](https://devpost.com/software/mywaves-xyz-elzxsd): 2nd place, Foursquare Places 2022. Music programmed for a venue's crowd.
- [Alloy](https://devpost.com/software/axiom-2bn391): honorable mention, Qloo 2025. Audience compatibility for deals, which becomes sponsor fit here.
- [Gem Run](https://devpost.com/software/gem-run): Best of Challenge 2, Google Cloud x MLB. Personalized fan audio, which becomes the pre-show briefing.
- [Zesty](https://devpost.com/software/zesty): honorable mention, Qloo 2025. The "unrecommendation", which becomes the wildcard pick.

## Product: every feature, turn by turn

**One flow: describe the event, confirm the entities, watch the agent plan, review the evidence, approve, then export or brief the crew.**

1. **Event intake.** Event type (concert, comedy, sports fixture or festival day), headliner and support (or home and away teams), venue, city and date, capacity tier, and the house rules (budget band, age rating, sponsor exclusivities, local-only vendors).
2. **Entity resolution with confirm.** The agent calls `qloo_find_tags` and `qloo_describe` for each name. When Qloo returns `needs_input` or more than one strong candidate, a confirm card shows the candidates and the user picks one. Nothing downstream runs on an unconfirmed entity.
3. **Crowd read.**
   - `qloo_compare_audiences`: headliner vs city, or home vs away fans. Shows shared ground vs what is distinctive to each side.
   - `qloo_audience_demographics`: age and gender skew, shown in aggregate only.
   - `qloo_entity_tags`: the crowd's taste vocabulary (genres, moods, styles).
4. **Run-of-show plan.** One section per slot, each from its own Qloo chain:
   - **Walk-in playlist (doors to first act):** `qloo_recommend` artists from the crowd signals, then `qloo_rank` to order them by fit, with energy shaped across the slot.
   - **Openers and interval acts:** `qloo_rank` over a candidate shortlist (local acts the user supplies, plus Qloo recommendations), and `qloo_trends` to flag rising acts.
   - **Food and drink:** `qloo_where_popular` around the venue for dishes and places that fit the crowd, then `qloo_rank` for vendor partners.
   - **Merch and brand activations:** `qloo_recommend` brands from the crowd signals, and `qloo_compare_audiences` of brand vs crowd for a sponsor-fit score (Alloy-style).
   - **Local flavour:** `qloo_where_popular` for neighbourhood spots in pre-show and after-party guides.
   - **Wildcard (Zesty-style):** one deliberately adjacent but lower-affinity pick in each section, clearly labelled "stretch".
5. **Evidence drawer.** Every plan item opens a panel with the Qloo tool name, its inputs (IDs only), its status, the affinity scores used, and a short line separating "what Qloo says" from "our interpretation". The safe-use rule requires that separation.
6. **Approval queue.** Each item can be approved, swapped (the agent re-ranks the alternatives) or rejected with a reason. Rejections feed the next plan as negative signals. The final plan locks with a version and a timestamp.
7. **Exports.** A printable run-of-show PDF, a CSV for the ops team, a share link, and a sponsor one-pager per activation with its fit score and evidence.
8. **Pre-show audio briefing (Gem Run-style).** A 90-second, two-voice briefing for door, bar and stage staff: who tonight's crowd is, what will land, and what to avoid. Every claim in the script links to a Qloo result, and an LLM-as-judge pass removes any line without evidence.
9. **Modes.** Concert, Comedy (Cedric: openers, room vibe, interval clips), Sports (Boehly: home vs away, halftime act, concourse food, city fan-zone), and Festival day (stage-by-stage).
10. **Compare tonight vs last night.** Two saved shows side by side, showing how the crowd and the plan differ, using `qloo_compare_audiences` across the two headliners.
11. **Agent trace.** A live, collapsible log of every tool call (name, status and timing). It shows judges how deep the Qloo use goes without reading code.
12. **Responsible-use guardrails.** No personal data in or out; only aggregate affinities. A refusal path for any eligibility-type request. A limitations panel on every plan saying what Qloo results do not establish.

## Architecture

```text
 Browser (operator console)
   Next.js + shadcn  ── Vercel
          │  HTTPS + SSE (trace + plan stream)
          ▼
 API ── Fastify on Cloud Run (Node 22.19+)
   ├─ Agent roster (Claude Agent SDK)
   │    Planner → Resolver → CrowdReader → Programmer (per slot)
   │    → SponsorFit → Wildcard → Critic (drops items without evidence)
   ├─ Qloo MCP client (one pooled stdio client, env: process.env)
   │    └─ child process: `qloo mcp` (live)  |  mock-server.ts (QLOO_MODE=mock)
   ├─ Briefing: script → evidence judge → Cloud TTS → MP3 in Cloud Storage
   └─ Exports: run-of-show PDF, CSV, sponsor one-pager
          │
          ├─► Claude API (claude-sonnet-5-5 / claude-opus-5-5)
          ├─► Qloo API (via qloo mcp; QLOO_API_KEY server-side only)
          ├─► Firestore (shows, plans, approvals, 24h Qloo cache)
          └─► Secret Manager (ANTHROPIC_API_KEY, QLOO_API_KEY, SETLISTFM_API_KEY)
```

The web console only talks to the API. The API's agents call Qloo through one MCP client, which runs `qloo mcp` as a child process. The kit says it can't run serverless, so it lives in the Cloud Run container.

## Qloo usage map

**All 10 tools from `qloo mcp` (the 9 workflows plus `qloo_capabilities`) do real work, and every plan item fails or falls back to a labelled LLM-only guess without them.** The tool names, statuses and setup come from the [Qloo hackathon kit](https://github.com/qloo/qloo-hackathon-kit).

| Tool | Where it's called | Inputs used | What breaks without it |
| --- | --- | --- | --- |
| `qloo_capabilities` | Server start and the health badge | none | No readiness check; the UI can't warn on a missing key |
| `qloo_find_tags` | Intake: genres, moods, cuisines, "family-friendly" | `query`, `limit` | Free-text vibes can't become Qloo tag IDs |
| `qloo_describe` | Intake: headliner, teams, venue, brands | entity name/type | No confirmed entity IDs; nothing downstream can run |
| `qloo_compare_audiences` | Crowd read; sponsor fit; tonight vs last night | `group_a`, `group_b` | No home-vs-away split, no sponsor-fit score |
| `qloo_audience_demographics` | Crowd read (aggregate only) | entity IDs | No age/gender skew for tone and pricing |
| `qloo_entity_tags` | Crowd vocabulary; evidence chips | entity IDs | No "why" chips in the evidence drawer |
| `qloo_recommend` | Walk-in artists, brands, merch, podcasts for the briefing | `signals`, `target_type` | No candidates beyond what the user already knows |
| `qloo_rank` | Openers, interval acts, playlist order, vendors | `options`, `option_type`, `signals` or `demographic` | The shortlists stay unordered and the Qloo-on vs Qloo-off A/B disappears |
| `qloo_where_popular` | Local food/drink, after-party guide, fan zones | `entity`, `within` (venue area) | No local flavour, and the plan isn't specific to the city |
| `qloo_trends` | "Rising" flags on acts and brands | `entity_type`, 1–5 entities, date range | No momentum signal for booking risk |

**Status handling (as the kit specifies):**

- `ok`: use the results.
- `empty`: ask the user to refine the name or tag.
- `needs_input`: show a candidate confirm card; never auto-pick.
- `partial` or `degraded`: use the results with a yellow "reduced confidence" chip and show the `summary`.
- `error`: retry only when `error.retryable` is true; otherwise show `error.recovery` and mark the slot "needs manual input".

**Call budget and caching:** cache by the exact tool and arguments (a SHA-256 of the canonical JSON) for 24 hours in Firestore. Cap each plan at about 40 calls. Retry at most twice with backoff, and only on retryable errors. The kit asks for the smallest request that answers the question and for no bulk scraping, so the cache also keeps demo reruns cheap.

**Key handling:** `QLOO_API_KEY` lives only in Secret Manager and reaches the Cloud Run backend as an environment variable. It never goes into the browser bundle, the repo or the video. The stdio transport gets `env: process.env`; the kit notes the key isn't forwarded without it.

**Until the Qloo key arrives (mock mode):** build against `apps/api/src/qloo/mock-server.ts`, a local stdio MCP server with the same 10 tool names, input schemas and result envelope (`status`, `summary`, `results`, `result_count`, `error`) as `qloo mcp`. It returns realistic, clearly fake data from `fixtures/mock/` and is set to produce every status (`needs_input` for "Genesis", `empty`, `partial`, `degraded`, a retryable `error`) so every UI path gets tested. A single switch, `QLOO_MODE=mock|live`, chooses the server, and the UI shows a "MOCK DATA" banner in mock mode. When the key arrives, `npm run qloo:verify` calls each real tool once, diffs the real schemas against the mock, records real fixtures, and flips the default to live. Nothing ships or gets measured on mock data.

## Reference repos

**Take patterns and code freely from these. All of them were checked as live public repos on 29 Oct 2026.**

| Repo | What to take |
| --- | --- |
| [qloo/qloo-hackathon-kit](https://github.com/qloo/qloo-hackathon-kit) | `starter/mcp-client/backend.mjs` (spawning `qloo mcp` over stdio, the capabilities check, envelope parsing), the status rules, SAFE\_USE, and the SUBMISSION checklist |
| [anthropics/claude-agent-sdk-typescript](https://github.com/anthropics/claude-agent-sdk-typescript) | The agent framework: Claude with stdio MCP servers (`qloo mcp`), subagents, hooks for the evidence guardrail, and streamed messages for the trace |
| [anthropics/claude-agent-sdk-demos](https://github.com/anthropics/claude-agent-sdk-demos) | Working patterns for MCP wiring, subagents and streaming to a web UI |
| [anthropics/anthropic-sdk-typescript](https://github.com/anthropics/anthropic-sdk-typescript) | Direct Claude calls for the Critic, the briefing judge and the eval scripts |
| [MR-GREEN1337/alloy](https://github.com/MR-GREEN1337/alloy) | Qloo 2025 winner: the compatibility-score report flow, PDF export and analyst chat, rebuilt as the sponsor-fit one-pager |
| [surya4419/Zesty](https://github.com/surya4419/Zesty) | Qloo 2025 winner: how its "unrecommendation" picks adjacent but low-affinity items, used for the wildcard slot |
| [william-Dic/GeoTaste](https://github.com/william-Dic/GeoTaste) | Qloo 2025 Grand Prize: map plus charts polish and consultant-chat UX, used for the `where_popular` map |
| [surfiniaburger/andromeda](https://github.com/surfiniaburger/andromeda) | Gem Run (Google Cloud x MLB): the multi-voice script → TTS pipeline and its LLM-as-judge refine loop, used for the pre-show briefing |
| [modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk) | The MCP client and `StdioClientTransport`, plus the server SDK for the mock Qloo server |
| [vercel/ai](https://github.com/vercel/ai) | Streaming the agent trace and plan into the Next.js UI |
| [vercel/next.js](https://github.com/vercel/next.js) · [shadcn-ui/ui](https://github.com/shadcn-ui/ui) | The app shell and accessible components (cards, drawers, dialogs, tables) |
| [Recharts/recharts](https://github.com/Recharts/recharts) | Charts for the crowd read (shared vs distinct, demographic skew, trends) |
| [diegomura/react-pdf](https://github.com/diegomura/react-pdf) | Run-of-show PDF and the sponsor one-pager |
| [googleapis/nodejs-text-to-speech](https://github.com/googleapis/nodejs-text-to-speech) | The two-voice audio briefing |
| [firebase/firebase-admin-node](https://github.com/firebase/firebase-admin-node) | Firestore for shows, plans, approvals and the Qloo cache |
| [open-telemetry/opentelemetry-js](https://github.com/open-telemetry/opentelemetry-js) · [langfuse/langfuse](https://github.com/langfuse/langfuse) | Tracing every agent turn and tool call, which feeds the agent-trace panel |
| [microsoft/playwright](https://github.com/microsoft/playwright) · [dequelabs/axe-core](https://github.com/dequelabs/axe-core) | End-to-end demo test and accessibility checks |

**Also used in the evaluation:** the [setlist.fm API](https://api.setlist.fm/docs/1.0/index.html) supplies the real support acts and tour bills for the hit@10 backtest, and the Qloo docs MCP server (`https://docs.qloo.com/mcp`) is for looking up parameters while building.

## Repo layout and build steps

**One public monorepo (MIT, licence shown in the GitHub About box) with two deployables: `apps/api` on Cloud Run and `apps/web` on Vercel.**

| Path | What it holds |
| --- | --- |
| `apps/api/src/qloo/client.ts` | Spawns `qloo mcp` over stdio (`env: process.env`), runs `qloo_capabilities` at boot, keeps one pooled client, and adds envelope parsing, retries and the Firestore cache |
| `apps/api/src/qloo/tools.ts` | Typed wrappers for all 10 tools, plus a provenance record per call (tool, args, status, timing, result IDs) |
| `apps/api/src/agent/` | Claude Agent SDK agents: `Planner` (orchestrator), `Resolver` (find\_tags/describe + confirm), `CrowdReader`, `Programmer` (one sub-run per slot), `SponsorFit`, `Wildcard`, `Critic` (drops unsupported items) |
| `apps/api/src/agent/guardrails.ts` | No PII in or out, no eligibility decisions, and a check that every item has evidence |
| `apps/api/src/plan/schema.ts` | Zod schema: `Show`, `Entity`, `Slot`, `PlanItem` {pick, why, evidence\[\], confidence, isWildcard}, `Approval` |
| `apps/api/src/routes/` | `POST /shows`, `POST /shows/:id/confirm`, `POST /shows/:id/plan` (SSE stream of trace and plan), `POST /items/:id/approve or swap or reject`, `GET /shows/:id/export.pdf or .csv`, `POST /shows/:id/briefing` |
| `apps/api/src/briefing/` | Script writer, an evidence-check judge, two-voice Cloud TTS, and an MP3 in Cloud Storage |
| `apps/api/Dockerfile` | Node 22.19+, `npm i -g @qloo/qloo-harness@^0.1.26`, non-root user |
| `apps/web/app/` | Next.js App Router pages: `/` (landing and demo shows), `/new` (intake), `/shows/[id]` (console: trace, timeline, drawer, approvals), `/shows/[id]/share` (read-only) |
| `apps/web/components/` | `ConfirmCard`, `CrowdRead` (Recharts), `RunOfShowTimeline`, `EvidenceDrawer`, `ApprovalQueue`, `AgentTrace`, `WildcardBadge`, `BriefingPlayer`, `ModeSwitch` |
| `eval/` | `ab_blind/` (pairs, rater app, results), `backtest/` (setlist.fm fetch, hit@10 scorer), `REPORT.md` |
| `infra/` | `deploy-api.sh` (Cloud Build → Cloud Run, Secret Manager binding), `vercel.json`, `firestore.rules` |
| `docs/` | `ARCHITECTURE.md`, `QLOO_WALKTHROUGH.md` (a redacted request → result), `LIMITATIONS.md`, `DEVPOST.md`, `VIDEO_SCRIPT.md` |

**Build steps:**

1. **Harness up.** Install `@qloo/qloo-harness` and run `qloo setup --status`. Port `backend.mjs` into `client.ts`, then run `qloo_find_tags "stadium rock"` from a script. Done when a typed call returns `ok`.
2. **All 10 tools wrapped.** Each tool has a fixture test against the real API, with responses recorded to `fixtures/` and replayed in CI.
3. **Resolver and confirm loop.** Done when an ambiguous name (for example "Genesis") returns `needs_input` and the UI confirm card resolves it.
4. **Crowd read.** `compare_audiences`, `audience_demographics` and `entity_tags` render as charts, with "Qloo says" vs "we infer" labels.
5. **Programmer and sub-agents.** One slot at a time, each item carrying evidence. The Critic removes any item without a Qloo citation.
6. **Wildcard and sponsor fit.** The sponsor one-pager PDF is generated.
7. **Approval queue.** Swap re-ranks the next-best option, and rejected items become negative signals.
8. **Exports and share link.** PDF, CSV and a read-only page.
9. **Audio briefing.** The judge removes any line without evidence, and the MP3 plays in the UI.
10. **Modes.** Concert, Comedy, Sports and Festival day, each with its own slot template.
11. **Deploy.** API to Cloud Run (with `QLOO_API_KEY` from Secret Manager, min instances 1 so the demo is warm), web to Vercel. The hosted demo link must work without a login.
12. **Seed demo shows.** Three pre-planned shows (a concert, a comedy night and a football fixture) so judges see a full plan instantly; a live re-plan is one click away.
13. **Eval, then docs, then video** (see the next sections).

## Evaluation and proof

**Three measured claims, each against a named baseline, each from a script in `eval/`. No numbers exist yet; report whatever comes out, including the losses.**

**Baselines (change one thing):**

| Run | Entities | Candidates and ranking | Evidence |
| --- | --- | --- | --- |
| P0: Popularity | Same confirmed IDs | Most-popular artists, brands and places in the city, with no taste signal | None |
| L0: LLM-only | Same confirmed IDs | The same model and prompt, with no Qloo tools (knowledge only) | Model text |
| House Mix | Same confirmed IDs | The full Qloo chain | Qloo citations |

**Claim 1 — the blind A/B test (`eval/ab_blind/`):**

- 10 real 2025 shows or fixtures: 4 concerts, 3 comedy nights, 3 football or baseball matches. Use public lineups only.
- For each, generate a House Mix plan and an L0 plan in the same format, with the labels stripped and the order randomized.
- 20 or more raters (music and sports fans; venue or event staff where possible) pick the better plan per slot and overall, and rate "fits this crowd" on 1–5.
- Report the win rate of House Mix over L0 with a 95% binomial confidence interval, per slot type, plus inter-rater agreement.

**Claim 2 — the hit@10 backtest (`eval/backtest/`):**

- 30 real 2025 tour legs or shows with known support acts, from setlist.fm.
- For each headliner, the candidate pool is 50 artists: the actual support act(s), plus 49 plausible distractors from the same genre and region.
- Score hit@10: was the real support act in the top 10 of House Mix (`qloo_rank`) vs P0 vs L0? Also report MRR.
- Hold out: pick prompts and settings on 5 shows, and report on the other 25.

**Claim 3 — the evidence rate (`eval/evidence/`):**

- The share of plan items and briefing lines that carry a valid Qloo citation, for House Mix vs L0. The target is 100% for House Mix, and the Critic enforces it.
- Count the hallucinated entities (names Qloo can't resolve) per plan, for L0 vs House Mix.

**Also report:** median plan time and Qloo calls per plan, the cache hit rate, the cost per plan, and one honest negative result (likely: comedy openers, where Qloo coverage may be thinner).

## Demo video, write-up and submission

**The video is optional, but make one: under 3 minutes, the live hosted app, no key on screen.**

| Time | On screen |
| --- | --- |
| 0:00–0:15 | Hook: "Every night, someone picks the walk-in music and the halftime snacks by gut feel." Then the House Mix console. |
| 0:15–0:45 | Intake for a real fixture (home vs away). "Genesis" triggers `needs_input` and the confirm card is resolved. |
| 0:45–1:25 | Live agent trace streams the Qloo calls, the crowd read appears (shared vs distinct), and the run-of-show fills in slot by slot. |
| 1:25–1:50 | Open the evidence drawer on one interval act, approve two items, swap one, reject one, and watch the re-rank. |
| 1:50–2:15 | Comedy mode for a quick switch, the sponsor one-pager PDF, and 15 seconds of the audio briefing. |
| 2:15–2:45 | The results table: the A/B win rate vs LLM-only, hit@10 vs popularity and LLM-only, and the evidence rate. Then the one negative result. |

**Devpost write-up (this follows Qloo's submission guide):**

1. The problem: nightly programming decisions are made by gut feel.
2. The Qloo tools used and why, as the usage-map table.
3. A redacted request → result walkthrough for one show, including the entity confirmations.
4. Screenshots with no key and no personal data.
5. Setup steps that work from a clean machine.
6. Known limitations: what the results do not establish (aggregate affinity, not individual preference or attendance), plus coverage gaps.
7. The results table, with methods and the negative result.

**Submission checklist:**

- [ ] Hosted demo link that works with no login (Vercel and Cloud Run, warm).
- [ ] Public repo with the MIT licence visible in the About section.
- [ ] README covering the pitch, architecture image, the Qloo usage table, results, setup and limitations.
- [ ] Text description, plus the optional video.
- [ ] No key anywhere in the repo, the bundle or the video (scan with gitleaks before you push).
- [ ] The Qloo work happened during the hackathon window.

## Risks and fallbacks

| Risk | Fallback |
| --- | --- |
| Qloo quota or rate limit hit during demos or eval | The 24-hour cache, pre-planned seed shows, and eval runs replayed from recorded fixtures; live calls only for new shows |
| `qloo mcp` can't run serverless | Run it in the Cloud Run container (the kit says serverless isn't supported). Never call it from Vercel functions |
| Thin Qloo coverage for local acts or vendors | The user adds candidates to a shortlist; `qloo_rank` still scores them. Items with no signal are labelled "no Qloo signal", never invented |
| Cold start makes the demo slow | Cloud Run min-instances 1, the seed shows, and the plan streams slot by slot |
| Agent picks an unsupported item | The Critic agent and the evidence guardrail drop any item without a Qloo citation before it reaches the UI |
| Too few raters for the A/B test | Recruit through GDG and hackathon Discords. If under 20, report n honestly and add the backtest as the main proof |
| setlist.fm gaps for support acts | Use Wikipedia tour pages as a second source, and drop shows with no confirmed support act |
| A personal-data or eligibility request | Refuse with a fixed message; the guardrail tests cover it |

## The one prompt

**Paste this whole plan into Claude Code in an empty folder, then paste the prompt below it. It writes its own `plan.md`, picks a UI direction from real site screenshots, builds everything end to end, then keeps refining, and stops only for keys or spend.**

```text
The text above is my House Mix plan for the Qloo Agentic Hackathon ("Agents, but with taste"). Save it as-is to docs/BRIEF.md, then follow everything below.

GOAL
Build House Mix end to end and make it the winning entry. Judging is four equal criteria, with ties broken in this order: Technological Implementation (depth of Qloo use), Design (a finished product), Potential Impact, and Quality of the Idea.

KEYS AND MODES (read first)
- Model: Claude only, through ANTHROPIC_API_KEY (I will provide it). Use the Claude Agent SDK for TypeScript (@anthropic-ai/claude-agent-sdk) as the agent framework, and the Anthropic SDK for direct calls (the Critic, the briefing judge, eval). Default model claude-sonnet-5-5; use claude-opus-5-5 for the Planner if it clearly helps. Keep the model ID in one config value.
- Qloo: I do NOT have QLOO_API_KEY yet. Build everything now in mock mode:
  - Write apps/api/src/qloo/mock-server.ts, a local stdio MCP server with exactly the same 10 tool names (qloo_capabilities, qloo_find_tags, qloo_describe, qloo_recommend, qloo_rank, qloo_where_popular, qloo_compare_audiences, qloo_audience_demographics, qloo_entity_tags, qloo_trends), the same input parameter names (from the kit's starter/mcp-client/README.md), and the same result envelope (status, summary, results, result_count, error {code, retryable, recovery}).
  - Make it produce every status: "Genesis" returns needs_input; also empty, partial, degraded, and a retryable error.
  - Use clearly fake but realistic fixtures in fixtures/mock/.
  - QLOO_MODE=mock|live chooses the server, and the UI shows a "MOCK DATA" banner in mock mode.
  - Add `npm run qloo:verify`: once the key exists, it installs or uses @qloo/qloo-harness (>= 0.1.26), runs qloo_capabilities and one call per tool, diffs the real schemas and envelopes against the mock, fixes the mock and the wrappers, records real fixtures in fixtures/live/, and switches the default to live.
  - When I paste the key later, put it only in .env.local (gitignored) and in Secret Manager, then run qloo:verify.
- setlist.fm: SETLISTFM_API_KEY goes in the x-api-key header, with Accept: application/json. Use it only for the non-commercial eval backtest. If it is missing, build the backtest code and skip the run.
- GCP and Vercel: if their credentials are missing, build and test locally, write infra/deploy-*.sh, and ask me only at the deploy step.

STEP 1: WRITE plan.md BEFORE ANY CODE
Use docs/BRIEF.md plus the Qloo kit (clone https://github.com/qloo/qloo-hackathon-kit and read its README, docs/ and starter/mcp-client). Also study the reference repos in BRIEF.md. You may reuse or adapt anything from them.
plan.md must cover:
- The full feature list.
- The architecture.
- Every Qloo tool call, with its inputs and status handling.
- The agent roster (as Claude Agent SDK subagents).
- API routes and the data schema.
- UI screens.
- Mock mode and the switch to live.
- The evaluation design.
- The demo script.
- Deploy steps.
- Risks.
- Ordered phases, each with a "done when" check.
Commit plan.md, show me a 10-line summary, then build without waiting for approval.

STEP 2: UI RESEARCH WITH REAL SCREENSHOTS (before writing any UI code)
Pick the visual direction from real sites, not from memory.
- Use Playwright with Chromium (npm i -D playwright, then npx playwright install chromium if it is not already installed).
- Build a candidate list of 20-30 sites: award-winning sites (Awwwards Sites of the Day and Honors, CSS Design Awards, Godly, Land-book, Mobbin-style dashboard galleries), with priority on live events, music, sports, ticketing, data dashboards and operator consoles. Also include my saved references: https://strikal-move.vercel.app and https://github.com/AfreenInnovates/campus (clone it, install, run it locally, then screenshot it).
- Write scripts/ui-research.ts. For each site it opens the page in Chromium, waits for network idle, dismisses cookie banners with the most privacy-preserving option, and saves full-page screenshots at 1440x900 (desktop) and 390x844 (mobile), in light and dark where the site has both, to design/refs/<site>/. Skip any site that blocks headless browsing and note it.
- Look at every screenshot. Score each site 1-5 in design/REFERENCES.md on: fit for a dense live-events operator console, data readability, colour contrast (WCAG AA), dark mode, motion that helps rather than distracts, and how cleanly it maps onto shadcn/Tailwind.
- Choose one primary direction and at most two secondary ones. Write design/DIRECTION.md: why they won, plus the design tokens you will use (colour palette with contrast ratios, type scale, spacing, radius, shadows, motion durations), the layout grid, and a component-by-component plan for every screen.
- Take patterns, layout ideas and feel only. Do not copy logos, brand assets, illustrations, copy text or any page wholesale.

STEP 3: BUILD EVERYTHING IN plan.md, IN DETAIL, END TO END
Work phase by phase. Tick items off in plan.md and commit after each phase. Build every feature in BRIEF.md completely: real code paths, real error, loading and empty states, real tests. No stubs, TODOs or placeholder screens left behind (mock Qloo data is the only allowed stand-in, and only until the key arrives). Add anything else that makes the product stronger.
- After each UI phase, screenshot every screen of House Mix with the same Playwright script (desktop and mobile, light and dark, every mode) into design/app/, put them next to the chosen references, and fix anything that looks weaker before moving on.

STEP 4: REFINE IN A LOOP AFTER EVERYTHING WORKS
When every deliverable is done and every test passes, do not stop. Run refinement rounds:
1. Review: run the full app, take fresh screenshots of every screen and state, run Playwright, axe, Lighthouse (performance and accessibility), the evals (live mode only) and a full demo run-through as a judge would see it.
2. List the 10 biggest weaknesses in docs/REFINE_LOG.md, ranked by impact on the judging criteria (Qloo depth first, then design, impact, idea).
3. Fix them, re-run every test, commit with "refine round N: ...".
Repeat. Each round must leave the product measurably better (log the before/after). Keep going until a round finds nothing that would change a judge's score, then do one last full check. Feature freeze at Fri 30 Oct 2026, 9:15 PM IST (12 hours before the deadline); after that only fixes, docs and the video.

QUALITY BARS
1. Qloo use is deep and load-bearing.
   - Start `qloo mcp` (live) or the mock server from the backend as a stdio MCP server, passing env: process.env.
   - All 10 tools are used where BRIEF.md says.
   - Handle every status exactly as the kit says: needs_input shows a confirm card and never auto-picks; retry only when error.retryable is true.
2. Every plan item and every briefing line carries evidence: the tool, the inputs (IDs only), the status and the scores. A Critic step (a Claude Agent SDK hook or subagent) removes anything without evidence. The UI labels "Qloo says" separately from "our interpretation".
3. Safe use: only aggregate affinities. No personal data in or out, no eligibility decisions, and a limitations panel on every plan.
4. Keys (ANTHROPIC_API_KEY, QLOO_API_KEY, SETLISTFM_API_KEY) exist only as server env vars or Secret Manager secrets. They never go in the repo, the browser bundle, the logs or the video. Add .env.example with empty values, and gitleaks in CI.
5. Never invent a number. All metrics come from scripts in eval/ that write eval/results/*.json and regenerate eval/REPORT.md. Never report metrics from mock data. Tune on held-out dev shows, and report on the rest.
6. Design: follows design/DIRECTION.md. A polished, accessible (WCAG AA) Next.js and shadcn console with the live agent trace, crowd charts, run-of-show timeline, evidence drawer, approval queue, PDF/CSV exports, share link and audio briefing. Modes: Concert, Comedy, Sports and Festival.
7. Do not add credits, attributions, acknowledgements, or "based on" or "inspired by" lines anywhere. I will add any credits myself.
8. If anything is stuck for more than 45 minutes, take the fallback from BRIEF.md, log it in docs/FRICTION_LOG.md, and move on.

STACK DEFAULTS (change them if you find something better, and say why in plan.md)
TypeScript monorepo. apps/api: Node 22.19+, Fastify, the Claude Agent SDK, the Anthropic SDK, the MCP SDK, Firestore and Cloud TTS, deployed on Cloud Run in a Docker image with the harness installed globally and min-instances 1. apps/web: Next.js App Router, shadcn/ui, Recharts and react-pdf on Vercel. MIT licence.

DELIVERABLES
- A hosted demo with no login, including 3 seeded shows: a concert, a comedy night and a sports fixture.
- A public repo with the MIT licence.
- A README: pitch, architecture image, Qloo usage table, results table, clean-machine setup and limitations.
- docs/QLOO_WALKTHROUGH.md: a redacted request-to-result for one show (live data, once the key exists).
- docs/DEVPOST.md: the full write-up, following the kit's SUBMISSION.md.
- docs/VIDEO_SCRIPT.md: under 3 minutes.
- docs/FRICTION_LOG.md.
- eval/: the blind A/B kit (pairs plus a rater web page), the setlist.fm hit@10 backtest, the evidence-rate script, and REPORT.md with one honest negative result.
- Playwright end-to-end and axe accessibility tests passing in both mock and live modes.
- design/: REFERENCES.md, DIRECTION.md, the reference screenshots and the final app screenshots.
- docs/REFINE_LOG.md: every refinement round with its before/after.

STOP AND ASK ME ONLY IF
- ANTHROPIC_API_KEY is missing.
- You reach the deploy step without GCP or Vercel access.
- Total spend would exceed about $15.
- Something outside this folder would be deleted.
A missing QLOO_API_KEY or SETLISTFM_API_KEY is NOT a reason to stop. Keep building in mock mode and list what is waiting on them.

FINAL REPORT
The phase checklist, the chosen UI direction and why, the number of refinement rounds and what each fixed, the live URLs, the results table (or "pending live Qloo key"), the fallbacks used, the exact commands to switch to live (paste the key, then npm run qloo:verify, then run the evals, then redeploy), and what I must do by hand: give credits, record and upload the video, run the human A/B raters, and submit.
```

**Keys you'll provide:**

- `ANTHROPIC_API_KEY` now.
- `QLOO_API_KEY` when Qloo issues it. Then run `npm run qloo:verify` and redeploy.
- A GCP project with Cloud Run, Firestore, Secret Manager and Text-to-Speech turned on.
- A Vercel account.
- `SETLISTFM_API_KEY` for the backtest.

**Getting the setlist.fm API key (free, non-commercial only):**

1. Create a free account at [setlist.fm/signup](https://www.setlist.fm/signup) and log in.
2. Open [setlist.fm/settings/api](https://www.setlist.fm/settings/api). The page only works when you're logged in.
3. Fill in the application form. Name the app "House Mix eval" and describe it as "non-commercial hackathon research: backtesting support-act recommendations against public setlists".
4. Submit, copy the key it shows, and put it in `.env.local` as `SETLISTFM_API_KEY`. Never commit it.
5. The key is sent in the `x-api-key` header with `Accept: application/json`. Endpoints are in the [API docs](https://api.setlist.fm/docs/1.0/index.html), for example `GET /1.0/artist/{mbid}/setlists`.

Use is limited by the [API terms](https://www.setlist.fm/help/api-terms): free for non-commercial projects only. The docs don't say how long approval takes; for questions there is the [API forum](https://www.setlist.fm/forum/setlistfm/setlistfm-api).
