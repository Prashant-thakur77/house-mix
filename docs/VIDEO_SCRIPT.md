# Video script (2:55)

Recorded on the hosted demo with live Qloo data. No key, terminal or personal data on screen. Browser at 1440×900, dark theme.

| Time | On screen | Voice-over |
| --- | --- | --- |
| 0:00–0:10 | Landing page, slow scroll over the four seeded shows | "Every night someone picks the walk-in music, the halftime act and the concourse food by gut feel. House Mix programs the night for the crowd that's actually coming." |
| 0:10–0:32 | `/new`, Sports mode. Type home "Los Angeles Dodgers", away "Giants" → Resolve. Confirm card "Which Giants?" with candidates | "Tell it the fixture. Every name goes through Qloo. 'Giants' is ambiguous, so Qloo returns needs-input. The agent never guesses; I pick, and nothing runs until I do." |
| 0:32–1:05 | Click Build run-of-show. Trace streams on the left (CrowdReader → Programmers in parallel → SponsorFit → Wildcard). Crowd read fills in: shared vs distinct bars, age skew, momentum | "A Claude planner sends out sub-agents. Every Qloo call lands in the trace: compare audiences for home versus away, demographics, taste tags, trends, then recommend, rank and where-popular for each slot." |
| 1:05–1:18 | Scroll to the crowd map; hover a ringed area; point at "Street teams & flyering" | "Where-popular, once per team: where each fan base's taste concentrates in the city, and the areas that are strong for both. That's where the street team goes." |
| 1:18–1:35 | Open the evidence drawer on the halftime act. Point at "Qloo says" vs "Our interpretation", then the rank call and its inputs | "Every pick carries its evidence: the exact call, its inputs, status and scores. What Qloo says is kept apart from our interpretation, and a Critic removed anything the evidence didn't support." |
| 1:35–1:50 | Swap one item (toast "Swapped in…"), reject one with "Clashes with a sponsor" | "Swap re-ranks the remaining options with Qloo. Reject becomes a negative signal for the next plan." |
| 1:50–2:18 | Click Ask. Type "Which pub suits the away fans for a pre-match crowd?" The Qloo calls stream in; the answer appears with citation numbers; open one; click "Add to queue" on the proposal; it appears pending in the queue | "Ask it anything about the night. It answers only from Qloo: new calls, streamed as they happen, every line cited, and the Critic strips what doesn't hold up. A suggested change doesn't touch the plan. It lands in my approval queue." |
| 2:18–2:38 | Scroll to "Without Qloo": the four numbers, then one slot where Claude-alone picks sit below the House Mix picks or show "not found in Qloo" | "Same brief, Claude alone, no tools. Qloo looks up every one of its picks and ranks them against ours for this crowd. Zero citations, some picks Qloo can't even find. We say plainly this isn't the quality test. That's next." |
| 2:38–2:55 | `eval/REPORT.md` results table, then the negative-result line | "The quality test is a blind human comparison against the same model without Qloo, plus a backtest on real 2025 support acts. Here's where it won, and here's where it didn't." |

Notes for recording:
- Pre-warm the API (min instances 1) and open each page once so fonts and seeds are cached.
- Run the live plan once before recording so the cache makes the on-camera run fast. The trace still shows every call with a "cache" marker.
- Ask a question once off camera too, so the on-camera Ask is quick; ask it again with different wording on camera so the calls are real.
- Replace the results table frame with the final `eval/REPORT.md` numbers. Do not show numbers that aren't in the report.
