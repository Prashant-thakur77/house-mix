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
