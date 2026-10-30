# Video script (2:55)

Recorded on the hosted demo with live Qloo data. No key, terminal or personal data on screen. Browser at 1440×900, dark theme.

| Time | On screen | Voice-over |
| --- | --- | --- |
| 0:00–0:10 | Landing page, slow scroll over the five seeded shows | "Every night someone picks the walk-in music, the halftime act and the concourse food by gut feel. House Mix programs the night for the crowd that's actually coming." |
| 0:10–0:32 | `/new`, Sports mode. Type home "Los Angeles Dodgers", away "San Francisco Giants", venue "Dodger Stadium", city "Los Angeles" → Resolve. Confirm card "Which Dodger Stadium?": the LA ballpark vs a community stadium in Fort Dodge, Iowa. Pick the LA one | "Tell it the fixture. Every name goes through Qloo. 'Dodger Stadium' is ambiguous: there's one in Iowa too. Qloo returns needs-input, the agent never guesses, I pick, and nothing runs until I do." |
| 0:32–1:05 | Click Build run-of-show. Trace streams on the left (CrowdReader → Programmers in parallel → SponsorFit → Wildcard). Crowd read fills in: shared vs distinct bars, age skew, momentum | "A Claude planner sends out sub-agents. Every Qloo call lands in the trace: compare audiences for home versus away, demographics, taste tags, trends, then recommend, rank and where-popular for each slot." |
| 1:05–1:18 | Scroll to the crowd map; hover a ringed area; point at "Street teams & flyering" | "Where-popular, once per team: where each fan base's taste concentrates in the city, and the areas that are strong for both. That's where the street team goes." |
| 1:18–1:35 | Open the evidence drawer on the halftime act. Point at "Qloo says" vs "Our interpretation", then the rank call and its inputs | "Every pick carries its evidence: the exact call, its inputs, status and scores. What Qloo says is kept apart from our interpretation, and a Critic removed anything the evidence didn't support." |
| 1:35–1:50 | Swap one item (toast "Swapped in…"), reject one with "Clashes with a sponsor" | "Swap re-ranks the remaining options with Qloo. Reject becomes a negative signal for the next plan." |
| 1:50–2:18 | Click Ask. Type "Which pub suits the away fans for a pre-match crowd?" The Qloo calls stream in; the answer appears with citation numbers; open one; click "Add to queue" on the proposal; it appears pending in the queue | "Ask it anything about the night. It answers only from Qloo: new calls, streamed as they happen, every line cited, and the Critic strips what doesn't hold up. A suggested change doesn't touch the plan. It lands in my approval queue." |
| (optional, if time) | Click Run the night, press Start the show at 300×: the walk-in cue plays, the playhead moves, a crew cue is marked called, "+5 min late" re-times the rest, then Venue screen | "And on the night, the plan runs: what's playing, what's next, and every cue for the crew. The music here is a synthesized cue in the crowd's style, not the record." |
| 2:18–2:38 | Scroll to "Without Qloo": the four numbers, then one slot where a Claude-alone pick shows "ambiguous in Qloo" | "Same brief, Claude alone, no tools. Qloo looks up every one of its picks. Zero citations, and on our eval half of them are names Qloo can't pin down without a person choosing. We say plainly this isn't the quality test." |
| 2:38–2:55 | Landing "Tested on live Qloo" strip, then the negative result in `eval/REPORT.md` | "So we tested it: seven real shows, a blind judge, both orders. Every House Mix pick is cited. The first run lost seven–nil, and its reasons were real bugs: openers bigger than the headliner, bars across town. We fixed them; openers now win. Overall, the judge still prefers Claude's own picks, and we say so. Human ratings are open now." |

Notes for recording:
- Pre-warm the API (min instances 1) and open each page once so fonts and seeds are cached.
- Run the live plan once before recording so the cache makes the on-camera run fast. The trace still shows every call with a "cache" marker.
- Ask a question once off camera too, so the on-camera Ask is quick; ask it again with different wording on camera so the calls are real.
- Use the numbers on the landing strip and in `eval/REPORT.md` (30 Oct 2026). If human ratings come in before recording, re-run `npm run eval:ab:score && npm run eval:report` and redeploy the web so the strip shows them. Do not show numbers that aren't in the report.
- The hosted API has about 0.9 USD of Claude budget left: one live plan on camera at most. Record the Ask beat against a seeded show's stored answer if the budget is gone.
