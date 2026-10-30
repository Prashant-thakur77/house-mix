# Changelog

All notable changes to House Mix. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/). Every release is a tag on this repository; see [Releases](https://github.com/Prashant-thakur77/house-mix/releases).

## [1.0.0] · 2026-10-31 · Hackathon release

The version submitted to the Qloo Agentic Hackathon. Live at [house-mix.vercel.app](https://house-mix.vercel.app); film at [youtu.be/Gbt9bEk-PNs](https://youtu.be/Gbt9bEk-PNs).

### Added
- **Bring your own key.** Planning, Ask House Mix, Without Qloo and the crew briefing run on each visitor's own Anthropic API key, added from "Your API key" in the top bar. The key stays in the visitor's browser, is sent in one header only with those requests, lives only in memory for that request's work, and is never stored, logged or returned.
- **Make my own copy.** Demo shows stay the same for everyone; any visitor can copy one to approve, swap, ask and re-plan their own version.
- Plain messages when a key is rejected or an account is out of credit, with the key dialog opening where the visitor can fix it.
- `CHANGELOG.md`, semantic versions and GitHub releases; the API reports its version in `/health`.

### Changed
- The production API carries no Anthropic key of its own; visitor spend never counts against the deployment's budget.
- The public show list shows the demo shows only.

### Fixed
- A plan run that returns nothing (for example, a rejected key) keeps the plan the show already had instead of saving an empty one.

## [0.8.0] · 2026-10-30 · The full story

### Added
- A full walkthrough film (3:55) built from code: the whole night run for real (readiness, real music, the restaurant service, the cue sheet, outreach, Run the night), Ask House Mix, and a "Why Qloo" proof card; a 2:58 cut alongside it.
- A new README with the film, at-a-glance numbers, ten-step screenshot journey, the five live demo nights, House Mix vs Claude-alone charts, the city chart and Qloo call times.
- `docs/charts.py`: every chart drawn from `eval/results/`, in light and dark, with a colour-blind-checked palette.

### Fixed
- Run the night says "between sets" while the show plays between slots, instead of asking to press Start.
- Builds Vercel starts from a push read the API address from the project's settings.

## [0.7.0] · 2026-10-30 · The whole night

### Added
- **Hear the night.** Every artist Qloo picked becomes real songs (30-second previews), in playlists timed to each slot; explicit songs are left out for all-ages shows. When a set runs short, the agent asks `qloo_recommend` for more artists and keeps the call as evidence.
- **Hand-off.** Playlist CSV and M3U for the venue's licensed music service, and a crew cue sheet PDF.
- **Outreach pack.** A ready-to-send message for every sponsor, stall, act and local spot, written from its Qloo evidence.
- **Get the night ready.** A checklist from confirmed names to a locked plan.
- Run the night plays the real preview of whoever is on.
- Free Qloo value checks (`npm run eval:qloo`): booking realism, crowd specificity and sensitivity, location, repeatability, explainability, music coverage and call times, shown on the landing page and in the docs.

### Fixed
- Clipboard copies (outreach, share link, call ID) say when the browser blocks them, and a copy counts as contacted only when it worked.

## [0.6.0] · 2026-10-30 · Ready for real names

### Added
- Confirm cards for live Qloo ambiguity: each candidate's description, category and popularity, so the operator chooses in one click ("London" has four Qloo localities).
- The film pipeline: recordings of the live site, two narrator voices, drawn and 3D scenes, captions, subtitles and thumbnail, all from code.

### Changed
- Stored demo shows refresh by content, and their seeded questions answer from live Qloo.

### Fixed
- PDFs lay out without overlapping text.
- A web build that would point at localhost is stopped before it goes live.

## [0.5.0] · 2026-10-30 · Live Qloo

### Added
- Adapters verified against the live Qloo API (`npm run qloo:verify`: 10 of 10 tools, 11 of 11 checks), with live fixtures and tests.
- Five demo shows planned end to end on live Qloo: concert, comedy, sports, festival and dining.
- The live evaluation: 7 real shows, House Mix against the same model with no Qloo; citations, ambiguity and a blind A/B kit.
- Qloo's explainability on every recommendation ("explained by …").

### Changed
- Booking rules the server enforces with Qloo's data: openers and halftime acts smaller than the headliner, bars and food from around the venue's address.

## [0.4.0] · 2026-10-30 · Stage and service

### Added
- **Run the night.** The plan on a show clock: a timeline with a playhead, what's on and what's next, crew cues by role that can be called and re-timed, and a full-screen venue display.
- **Dining mode** for restaurants and bars: arrivals and peak-service playlists, drinks and pairings with sponsor fit, guest collabs, a late lounge set and an after-dinner guide.
- The House Mix mark and a new landing page: a point-cloud figure that becomes a crowd, a white dossier and an LED finale.

### Changed
- App pages in ink and signal red, with a dot-grid canvas and pixel mode glyphs.

## [0.3.0] · 2026-10-29 · Ask, map and compare

### Added
- **Ask House Mix.** Questions about the night answered only from Qloo, every line cited, a Critic on every answer, and suggestions routed to the approval queue.
- **Crowd map.** Where each side's taste concentrates in the city, and the areas for street teams and flyering.
- **Without Qloo.** Claude plans the same brief with no tools, and Qloo checks and ranks both plans' picks.

## [0.2.0] · 2026-10-29 · Deployed

### Added
- Production on Google Cloud Run (Firestore, Cloud Storage, Cloud Text-to-Speech) and Vercel, with a spend cap and a go-live runbook.
- Approve every high-confidence pick in one step.

### Changed
- Responses compressed with brotli or gzip (a show's JSON from 121 KB to 12 KB).
- The console renders on the server, so the header and headline arrive with the first HTML.

## [0.1.0] · 2026-10-29 · Foundation

### Added
- The Qloo MCP client over stdio with cache, retries, call budget, personal-data guard and a ledger of every call; a schema-exact mock.
- The agent pipeline on the Claude Agent SDK: a planner, a crowd reader, one programmer per slot, sponsor fit and a wildcard; the Critic and its evidence gate.
- The shows API, approvals (approve, swap, reject, lock), run-of-show PDF, ops CSV, share links and sponsor one-pagers.
- The web console with a live agent trace, crowd read, evidence drawer and approval queue; seeded demo shows.
- The evaluation kit, end-to-end and accessibility tests, the architecture diagram and the MIT licence.

[1.0.0]: https://github.com/Prashant-thakur77/house-mix/compare/v0.8.0...v1.0.0
[0.8.0]: https://github.com/Prashant-thakur77/house-mix/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/Prashant-thakur77/house-mix/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/Prashant-thakur77/house-mix/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/Prashant-thakur77/house-mix/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/Prashant-thakur77/house-mix/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Prashant-thakur77/house-mix/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Prashant-thakur77/house-mix/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Prashant-thakur77/house-mix/releases/tag/v0.1.0
