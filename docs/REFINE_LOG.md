# Refine log

Each round: review (screenshots of every screen, Playwright + axe, a judge-style run-through), the ten biggest weaknesses ranked by judging impact (Qloo depth, then design, impact, idea), fixes, and before/after.

## Round 0 (pre-refine fixes found while building)

| Weakness | Before | After |
| --- | --- | --- |
| Crowd-read charts unreadable in the console's centre pane | Diverging-bar labels overlapped near zero; KPI numerals collided with card titles | HTML diverging rows with values at bar ends; 2-column grid; titles and KPIs no longer overlap |
| Mobile console overflowed | Header squeezed the title to "Genes…"; confirm cards cut off at the right | Header stacks on mobile; `scrollWidth − innerWidth ≤ 1` asserted in e2e |
| Accessibility | 13 axe serious/critical violations (ARIA on spans, focusable hidden charts, 2.4:1 button text, 4.4:1 tabs) | 0 across 6 screens × light/dark × desktop/mobile (24 axe checks) |
| Trace showed raw UUIDs for Critic removals | "Critic removed 9433ce06…" | Entity names |
| Concert seed stopped at the per-run budget | `Reached maximum budget ($0.9)` | Budget 1.5 USD and 5-minute cache; re-seeded with no errors |

## Round 1 (after first deploy)

Review: hosted demo on Cloud Run + Vercel, one real production plan (Phoebe Bridgers with Muna), production briefing with Cloud TTS, CI run, screenshots of every screen.

| # | Weakness (ranked by judging impact) | Before | After |
| --- | --- | --- | --- |
| 1 | Qloo depth: `qloo_compare_audiences` failed in production (Firestore rejects the nested arrays in its envelope), so the crowd split and sponsor-fit scores were missing on hosted plans | Production plan used 6 of 9 workflow tools; compare calls errored before the ledger | Firestore documents stored as JSON; `/compare` and plan runs record compare calls (verified on Cloud Run) |
| 2 | Qloo depth: still mock data | Mock fixtures only | Unchanged; blocked on the Qloo key (`npm run qloo:verify` is ready) |
| 3 | Impact: the briefing ran 146 s against a 90 s target | 12 lines, 583 KB MP3 | Writer capped at 8–10 lines / 190 words |
| 4 | Design: default Next.js favicon on the hosted site | Next.js logo | House Mix icon |
| 5 | Idea clarity: the landing page didn't show what "evidence" means until you opened a show | Text only | A real seeded pick with its Qloo calls, "Qloo says" and "Our interpretation" |
| 6 | Cost safety on a public demo | Any visitor could spend without limit | Plan runs refused past a 6 USD production cap; 1 concurrent run |
| 7 | Quality: CI secrets job failed (action wrapper) | `secrets` job red | gitleaks binary over full history |
| 8 | Cost: a full Sonnet plan cost 0.96 USD (1-hour cache writes) | 0.96 USD, 84 s | 0.51 USD, 106 s on production (5-minute cache) |
| 9 | Production smoke | Untested on Cloud Run | Plan, PDF/CSV, briefing MP3 from Cloud Storage, Firestore seeds verified |
| 10 | Trace readability | Critic removals showed raw UUIDs | Names (round 0) |

## Round 2

Review: Lighthouse (mobile, throttled) on the production site, a live-run capture, production briefings, the mobile landing page.

| # | Weakness | Before | After |
| --- | --- | --- | --- |
| 1 | Design/performance: the console was the slowest page | Lighthouse performance 71, LCP 4.8 s (headline waited for JS boot and a browser-side fetch) | 84–90, LCP 1.3–3.1 s: the show is server-rendered and API JSON is brotli-compressed (121 KB → 11 KB) |
| 2 | Impact: approving 20–30 picks one by one | One click per item | "Approve N high-confidence picks" in one step; stretch and reduced-confidence picks stay in the queue |
| 3 | Briefing transcript sync was off by 2× | Duration estimated at 32 kbps; Cloud TTS returns 64 kbps (MP3 header) | Bitrate read from the frame header; briefings re-voiced: 80–81 s, transcript highlights the spoken line |
| 4 | Briefing could not be re-voiced after a fix | Cached result returned | "Write again" forces a new script, judge pass and audio |
| 5 | Trace tool names truncated at 320 px | "qloo_compare_a…" | Short tool names; agent shown in the expanded row |
| 6 | Landing on a shared demo listed every visitor's shows | All non-seed shows | Only shows created in this browser |
| 7 | Seed order and a card wrap glitch | Festival first; "26 plan itemsOpen console" | Concert, comedy, sports, festival; fixed wrap |
| 8 | Hydration warning after server rendering | Locale-dependent date | Fixed locale + UTC |
| 9 | README had no product images | Architecture only | Four console screenshots |
| 10 | No capture of the agent working | Only finished plans | `design/app/show-live-run/` (desktop light/dark, mobile) |

Lighthouse after round 2 (production): landing 93 / 100 / 100, intake 91 / 100 / 100, console 84–90 / 100 / 100 (performance / accessibility / best practices).

## Round 3

Review: the headline demo show as a judge would open it.

| # | Weakness | Before | After |
| --- | --- | --- | --- |
| 1 | The concert demo's crowd read said "0 shared concepts" (mock comparison treated two different fixture tag sets as almost disjoint) | 0 shared, every bar one-sided | Mock comparison scores concepts from the same family in the middle, as real fan bases overlap; concert re-seeded: Psychedelic Rock and Funk are shared ground |
| 2 | Cached mock envelopes survived mock changes (24 h cache) | Re-seed reused stale comparisons (10 of 22 calls cached) | Mock cache keys carry `MOCK_VERSION` |
| 3 | Re-generated seeds never reached production (import skipped existing IDs) | Old seed kept in Firestore | Seeds with a newer `createdAt` replace the stored copy |

Remaining items that would move a judge's score are external: live Qloo data (key), measured results (key, setlist.fm key, raters), and the video. Nothing else found in this round changes a score.
