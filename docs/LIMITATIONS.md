# Scope notes

What House Mix's numbers mean, and where they stop.

- Qloo results describe aggregate cultural affinities of audiences. They say nothing about any individual attendee, and an affinity is a relative signal, not a probability that tonight's crowd will like or buy something.
- Scores from separate Qloo calls are not comparable; each ranking only orders the options it was given.
- Coverage is uneven: local acts, small vendors and working comedians can have thin or no Qloo signal. They are labelled, never invented.
- Demographic charts are aggregate distributions, used only for tone and pricing, never to admit, exclude or target anyone. House Mix refuses eligibility-type requests and rejects personal data at intake and before every Qloo call.
- The sponsor-fit number is our formula (the mean of Qloo's similarity scores over the concepts both audiences share), not a Qloo score. Live Qloo often finds no shared concepts between a music or sports crowd and a brand; those brands get no fit score, and Qloo's rank for the crowd orders them instead.
- Live trend data lags: on 30 Oct 2026 Qloo returned empty series for any window ending after mid-July 2026, so the momentum window ends 105 days back. A flat line is shown as flat, not as a signal.
- In mock mode every Qloo result is fictional, and the UI says so on every screen.
- "Without Qloo" has Qloo rank House Mix's own picks against Claude-alone picks, so a House Mix lead there is expected and is not an independent quality test. The blind A/B kit in `eval/` is the quality test; its automated-judge results and the human ratings page are in [`eval/REPORT.md`](../eval/REPORT.md).
- The crowd map shows where an act's taste concentrates by area (Qloo heatmap cells); it is not a map of where attendees live.
- Hear the night plays 30-second previews from Apple's catalogue to audition a set. Playing music to a room needs the venue's licensed music service; the playlist exports (CSV, M3U) are for that service. Where no song is found, Run the night plays a synthesized cue in the crowd's style and says so.
- Ask House Mix answers only from Qloo calls, so questions Qloo can't speak to (prices, opening hours, walking distance) come back as "check this yourself" rather than a guess.
