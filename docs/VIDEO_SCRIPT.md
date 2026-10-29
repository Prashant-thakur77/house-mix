# Video script (2:45)

Recorded on the hosted demo with live Qloo data. No key, terminal or personal data on screen. Browser at 1440×900, dark theme.

| Time | On screen | Voice-over |
| --- | --- | --- |
| 0:00–0:12 | Landing page, slow scroll over the four seeded shows | "Every night someone picks the walk-in music, the halftime act and the concourse food by gut feel. House Mix programs the night for the crowd that's actually coming." |
| 0:12–0:40 | `/new`, Sports mode. Type home "Los Angeles Dodgers", away "Giants" → Resolve. Confirm card "Which Giants?" with candidates | "Tell it the fixture. Every name goes through Qloo. 'Giants' is ambiguous, so Qloo returns needs-input. The agent never guesses; I pick, and nothing runs until I do." |
| 0:40–1:20 | Click Build run-of-show. Trace streams on the left (CrowdReader → Programmers in parallel → SponsorFit → Wildcard). Crowd read fills in: shared vs distinct bars, age skew, momentum | "A Claude planner sends out sub-agents. Every Qloo call lands in the trace: compare audiences for home versus away, demographics, taste tags, trends, then recommend, rank and where-popular for each slot. Ten Qloo tools, all doing real work." |
| 1:20–1:45 | Open the evidence drawer on the halftime act. Point at "Qloo says" vs "Our interpretation", then the rank call and its inputs | "Every pick carries its evidence: the exact call, its inputs, its status and scores. What Qloo says is kept apart from our interpretation, and a Critic removed anything the evidence didn't support." |
| 1:45–2:05 | Approve two items, Swap one (toast "Swapped in…"), Reject one with "Clashes with a sponsor", show the negative signal. Lock plan | "Approve, swap re-ranks the remaining options with Qloo, reject becomes a negative signal for the next plan. Lock it, and it's versioned." |
| 2:05–2:25 | Open the seeded comedy show (mode switch), Export ▾ → sponsor one-pager PDF opens; Briefing ▸ plays 12 s with the transcript highlighting | "Comedy works the same way. Sponsors get a one-pager with their fit score and evidence, and the crew gets a ninety-second two-voice briefing where every line is checked against the plan." |
| 2:25–2:45 | `eval/REPORT.md` results table, then the negative-result line | "We measured it: a blind test against the same model without Qloo, a backtest on real 2025 support acts, and the citation rate. Here's where it won, and here's where it didn't." |

Notes for recording:
- Pre-warm the API (min instances 1) and open each page once so fonts and seeds are cached.
- Run the live plan once before recording so the cache makes the on-camera run fast. The trace still shows every call with a "cache" marker.
- Replace the results table frame with the final `eval/REPORT.md` numbers. Do not show numbers that aren't in the report.
