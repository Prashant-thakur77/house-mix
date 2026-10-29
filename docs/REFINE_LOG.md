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
