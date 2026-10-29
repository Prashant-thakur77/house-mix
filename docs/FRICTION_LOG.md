# Friction log

What slowed the build down, what we did about it, and what is still open.

| When (IST, 29 Oct 2026) | Friction | What we did |
| --- | --- | --- |
| 14:55 | No Qloo key yet; with no key the harness returns the same `QLOO_AUTH` envelope for every tool and never validates input, so real result shapes can't be observed. | Read the harness source and ran the real `qloo mcp` against a loopback stub API (`QLOO_BASE_URL` + `QLOO_TRUSTED_BASE_URL`) to observe envelopes. Documented everything in `docs/QLOO_CONTRACT.md`; shapes Qloo passes through unchanged (heatmap, demographics, trends, compare) are marked inferred and are checked by `npm run qloo:verify`. |
| 15:05 | Harness 0.1.26 never emits `partial` or `degraded`, but the brief asks the mock to produce them. | The mock emits them on documented triggers so the UI paths are tested; the contract doc states that the real server doesn't. |
| 15:10 | Free-text tags and non-exact names come back as `needs_input` in the real harness. | Resolve everything at intake (confirm cards), and make agents pass only IDs/URNs. |
| 15:25 | The configured GCP project in `gcloud` (`reroute-503610`) denies access; ADC's quota project has Text-to-Speech disabled. | Built and tested locally with the file store; briefing falls back to device voices with the exact reason shown. Deploy waits for a project choice. |
| 15:30 | Model-written demographic phrases ("adults 24 and younger") fail the harness's demographic parser (`needs_input`). | The phrase is derived server-side from Qloo's own age distribution, age only, and validated with a port of the harness parser. |
| 15:35 | Mock synthetic entities (user-typed names) lived only in the mock process, so cached describe results pointed at IDs a fresh process couldn't resolve. | Synthetic IDs are persisted and the seed registry is committed (`fixtures/mock/synthetic.json`). |
| 16:00 | A full Sonnet 5.5 plan cost about $0.96, mostly 1-hour prompt-cache writes. | Set the Agent SDK cache TTL to 5 minutes for plan runs; mock-mode seeds use Haiku 5.5 workers with the Sonnet planner (~$0.55 per plan). |
| 16:05 | Parallel Programmers raced to the same artist; the Critic's "already used in another slot" check bounced submissions. | Programmers check plan state right before submitting. |
| 16:20 | The design-research reference `strikal-move.vercel.app` returns Vercel "deployment not found"; Resident Advisor blocks headless browsers; Sofascore mobile shows a bot check. | Skipped and logged in `design/refs/_log.json`; 29 other references captured. |
| 16:25 | The screenshot script's cookie-banner handler clicked a plan item's "Reject" button in our own app. | Consent handling is off in `--app` mode. No data changed (the dialog was never confirmed). |
| 16:40 | `cn` (tailwind-merge) treats the custom `text-body` size token as a colour class and dropped button text colours (axe contrast failures). | Buttons use `text-sm`; all axe checks pass. |
| open | Live Qloo key, setlist.fm key, GCP project for Cloud Run, Firestore and TTS. | Everything else is built; see the README for the switch-to-live commands. |
