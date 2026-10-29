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

## Round 4

Review: House Mix set against the patterns that won past taste and data hackathons (an in-product Qloo-on vs Qloo-off comparison, a map, and an analyst who answers follow-ups and produces a decision). A judge scoring "depth of Qloo use" and "does the demo solve the problem" would look for all three.

| # | Weakness | Before | After |
| --- | --- | --- | --- |
| 1 | The Qloo-on vs Qloo-off comparison lived only in `eval/`, so a judge had to take it on trust | No in-product baseline | **Without Qloo** panel: Claude plans the same brief with no tools; `qloo_describe` looks up each pick; one `qloo_rank` per slot orders both plans' top picks for the crowd. Shows citation coverage, picks Qloo can't find or disambiguate, and where they land, with a plain caveat that this is not the quality test |
| 2 | `qloo_where_popular` results were buried inside food-slot evidence | No geographic view | **Crowd map**: one call per side, overlap areas computed server-side, top three street-team areas, SVG with hover tooltips and a table view; in the PDF too |
| 3 | Any follow-up ("who opens if the support act cancels?") needed a full re-plan | Re-plan only | **Ask House Mix**: tool loop over the real Qloo tools, NDJSON stream of calls, cited lines, Critic check, proposals land as pending queue items built from the ledger |
| 4 | Every seed had the same entity in two slots (parallel programmers both passed the duplicate check while the claim check ran) | 2–7 duplicate entities per seed | Duplicates re-checked after the claim check, before items are stored; seeds regenerated |
| 5 | Mock place IDs from a stored plan stopped resolving after a restart, so swap and rank failed on food slots | `needs_input` (not_found) | Mock materialises every fixture city's places before an ID lookup, as real IDs persist |
| 6 | Mock heatmap points were random per entity, so two acts could never share an area | 0 overlap | Mock cells sit on a fixed per-city grid like geohash cells |
| 7 | Ask cost $0.17 a question | Full tool descriptions and schemas | Two-sentence descriptions, no per-field prose: $0.07–0.14 including the Critic |
| 8 | Looked-up names leaked into mock recommendations: after the "Without Qloo" lookups, the sports plan recommended "Spotify (sponsor-fit 8/10)" and the festival "Lido Pimienta (stretch)" | Every name ever looked up joined the candidate pools | Names created at runtime resolve but are never candidates; only the committed registry and fixture pool are; registry reset and all four seeds regenerated |
| 9 | Mock search found descriptions as if they were entities ("Natural wine and spritz bar") | 15/15 Claude-alone picks "found" | Descriptive phrases and "X or Y" alternatives return not_found, as a catalogue search would |
| 10 | Ask answered a replacement question with an act already in the plan, and proposed a #8-of-10 result | Weak answer on the concert seed | Prompt: direct answer first; replacements come from recommend → drop what's in the plan → `qloo_rank`, proposals cite the rank call |
| 11 | A malformed `final_answer` line crashed Ask | 500 on the seed run | Lines are normalised; malformed ones are dropped as uncited |
| 12 | Same-millisecond writes of one key collided in the file store (double-mounted effect in dev) | 500 on the map's first load | Unique temp names; one in-flight build per show for the map and the comparison |
| 13 | Seed ledgers carried every earlier seeding's calls (run IDs are reused), so Ask read a plan digest several times too big | Concert: 349 ledger calls for a 22-call plan; $0.25 a question | Seeds export only referenced calls (61); Ask reads only the calls in the plan run's own trace |
| 14 | The theme toggle's label differed between server and client when a theme was stored | Hydration error in the dev overlay | Label renders "system" until mounted |
| 15 | The mock recommended its "Giants"/"Genesis" disambiguation fixtures (a sports brand slot ranked "New York Giants") | Disambiguation entities in candidate pools | Excluded from pools; stored seeds keep their picks until the live re-seed |

Verification after round 4: 19 API tests, 6 eval tests, 37 Playwright e2e + axe tests (desktop and mobile, light and dark, including the Ask sheet) pass in mock mode. Production: all four seeds serve the map, the comparison and a sample answer; a live Ask streamed its Qloo call and Critic step through Cloud Run in 27 s for $0.09; personal data in a question is refused before any call.

Remaining items that would move a judge's score are still external: live Qloo data, measured results and the video.

## Round 5

Review: design, against current award-winning sites. Eighteen references were captured frame by frame (intro, wheel-driven scroll, hover, mobile) and summarised in `design/REFERENCES-AWWWARDS.md`; the new register is in the `design/DIRECTION.md` addendum.

| # | Weakness | Before | After |
| --- | --- | --- | --- |
| 1 | The landing page looked like the console: correct, quiet, forgettable | Grey cards, one accent | "House lights" landing: night stage, gig-poster stripes, Bricolage display type, ribbons, intro curtain |
| 2 | Nothing showed the product moving before you opened a show | Static text | 3D stage-eye crowd that jumps in a wave from the pointer, light beams, vinyl; a live trace panel replaying real Qloo calls from a seeded plan |
| 3 | "How it works" was four text cards | Text only | A pinned five-step section that assembles a show as you scroll (confirm card, crowd bars, slots, Critic stamp, approvals and briefing waveform), stacked on mobile |
| 4 | Qloo's role (the sponsor) was a list of tool names | Ten grey chips | "Powered by Qloo": what Qloo is, why the product fails without it, and a fanned deck of the ten tools with what each does here |
| 5 | Sponsors and brand partners had no page of their own | Mentioned in a step | A section with an animated fit dial, a one-pager mock from a real seeded brand, and a link to the actual PDF |
| 6 | No art anywhere | Icons only | Four poster illustrations (concert, comedy, sports, festival) on demo cards, the intake mode picker and the console header |
| 7 | First build of the new landing scored 54 for mobile performance | LCP 6.9 s, TBT 650 ms | Hero entrance in CSS; WebGL only on desktop after idle, CSS crowd on phones; curtain is static CSS. 94 mobile, 98 desktop; accessibility 100 |
| 8 | Inactive steps, an orange eyebrow and the mobile tool row failed axe | 3 violations | Contrast-safe colours; the scroll row is focusable and labelled |
