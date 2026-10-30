# House Mix

**AI agents that program the whole night (music, openers, food, sponsors) for the crowd that's actually coming, with every pick backed by a live Qloo taste call.**

Live demo: https://house-mix.vercel.app · Film: https://youtu.be/Gbt9bEk-PNs · Code: https://github.com/Prashant-thakur77/house-mix

## Inspiration

Every night, someone at a venue decides the walk-in music, the opener, the halftime act, which food stalls go on the concourse and which sponsor runs the interval activation. They decide for a crowd they have never met, usually from last month's spreadsheet.

But crowds are specific. A psych-funk crowd at the Hollywood Bowl is not a stand-up crowd at The Comedy Store. Chelsea vs Arsenal is two crowds at once. A jazz night at a London restaurant needs a different playlist at 6 pm than at 10 pm. Venue managers, promoters, restaurant owners and the sponsors who pay for it all make these calls every night, and nothing helps them make them for the people who are actually coming.

Qloo knows what those crowds love. We built the agent that turns that knowledge into a whole night: **House Mix**.

![House Mix: Hear the night](https://raw.githubusercontent.com/Prashant-thakur77/house-mix/main/docs/img/hear-the-night.jpg)

## What it does

House Mix takes tonight's bill and city and plans the whole night for the crowd that's actually coming. Every pick is backed by a real Qloo call that anyone can open and check.

**1. Every name confirmed.** Each act, team, venue and city is resolved to a Qloo ID before anything runs. When a name is ambiguous, House Mix asks instead of guessing: Dodger Stadium has a twin in Iowa, and "London" has four Qloo localities. The operator chooses in one click.

**2. A team of agents plans live.** A Claude Agent SDK planner sends out a crowd reader, one programmer per slot (in parallel), a sponsor-fit agent and a wildcard agent. Every Qloo call streams into a live trace with its tool, status, timing and cache hits.

![A real plan on live Qloo](https://raw.githubusercontent.com/Prashant-thakur77/house-mix/main/docs/img/plan-live.gif)

**3. The crowd read.** What both fan bases share and what only one side carries (`qloo_compare_audiences`), the aggregate age skew (`qloo_audience_demographics`), the crowd's taste vocabulary (`qloo_entity_tags`) and momentum (`qloo_trends`).

**4. A full run of show.** Walk-in music, openers, food and drink, sponsors and the after-party guide. Each pick shows its Qloo rank, a crew action, and Qloo's own explanation of why it was picked: "explained by Arsenal F.C. (0.62) and Chelsea FC (0.38)".

**5. Receipts on every pick.** Open any pick to see exactly what Qloo returned, kept apart from our interpretation of it, with the call ID, inputs, status and scores.

![Evidence drawer](https://raw.githubusercontent.com/Prashant-thakur77/house-mix/main/docs/img/evidence.jpg)

**6. Sponsors in depth.** Qloo ranks brands for this exact crowd in this city. House Mix compares the crowd with each brand's own audience and shows an honest fit: when they share no taste, it says so instead of inventing a score. Each brand gets a concrete activation (what, where and when in the night) and a one-pager PDF to send the sponsor.

![Sponsors ranked for this crowd](https://raw.githubusercontent.com/Prashant-thakur77/house-mix/main/docs/img/sponsor-compare.jpg)

**7. Ask House Mix.** Ask anything about the night, such as "which drinks brand fits the jazz-night crowd?". A tool-using Claude loop answers only from Qloo, every line cites its call, a Critic removes what doesn't hold up, and any suggested change lands in the approval queue.

**8. Hear the night.** Every artist Qloo picked becomes real songs in playlists timed to each slot, with 30-second previews you can play. Explicit songs are left out for all-ages shows. When a set runs short, the agent goes back to Qloo (`qloo_recommend`) for more artists like that slot's picks, for this crowd and city, and keeps the call as evidence.

**9. Hand it off.** A ready-to-send message for every sponsor, stall, act and local spot, written from its Qloo evidence and opened in the operator's own email. A cue sheet PDF for the sound desk, playlist CSV and M3U for the venue's licensed music service, a run-of-show PDF and a read-only share link.

**10. Get the night ready, then run it.** A checklist takes the operator from confirmed names to a locked plan. Then Run the night plays the plan on a show clock: the real song for whoever is on, what's next, and every crew cue (sound, stage, food and drink, partnerships, front of house) on time, re-timed when the night runs late. A full-screen view goes on the venue's own screens.

![Run the night](https://raw.githubusercontent.com/Prashant-thakur77/house-mix/main/docs/img/run-the-night.gif)

**Try it with your own key.** The demo shows, evidence, music, exports and Run the night are free for everyone. Planning a new show, Ask, Without Qloo and the briefing run on the visitor's own Anthropic API key (top bar, "Your API key"): it stays in their browser, is sent only with those requests, and is never stored or logged. Demo shows stay the same for everyone; "Make my own copy" gives each visitor a version to change.

**Five kinds of night from one tool:** concerts, comedy, sports, festivals and restaurants. All five demo shows on the live site were planned end to end on the live Qloo API:

- **Khruangbin with Men I Trust, Hollywood Bowl:** opener Brainstory, walk-in Allah-Las and Steve Lacy, merch with Herschel Supply Co
- **Taylor Tomlinson with Atsuko Okatsuka, The Comedy Store:** openers Fahim Anwar and Annie Lederman, interval podcasts Bad Friends, sponsor Hinge
- **Chelsea FC vs Arsenal F.C., Stamford Bridge:** halftime Professor Green, warm-up Pharrell Williams, sponsors Nike Training Club and Burberry
- **Victoria Park festival day, London:** discovery stage Lexie and Courting, brand village Rough Trade and Fred Perry
- **Dishoom Shoreditch: Ezra Collective night:** peak service Alfa Mist and Yussef Dayes, drinks partner Sipsmith Gin, late lounge Jordan Rakei

## How we built it

**Qloo, all 10 tools.** The backend starts `qloo mcp` as a stdio MCP server and routes every call through one client. It has a 24-hour cache keyed by the SHA-256 of the arguments and retries only when Qloo marks an error retryable. It also enforces a 40-call budget per plan, blocks personal data before a call leaves, and writes a ledger entry for every call.

- `qloo_describe` turns every name into a confirmed ID, so every later call is exact
- `qloo_find_tags` turns the operator's vibe words into Qloo tags
- `qloo_compare_audiences` powers the crowd read, sponsor fit and "tonight vs last night"
- `qloo_audience_demographics` gives the aggregate age skew for tone and pricing
- `qloo_entity_tags` gives the crowd's taste vocabulary
- `qloo_recommend` finds candidates for every slot, the wildcard, and fills short playlists
- `qloo_rank` orders every shortlist, including the venue's own local acts, and powers swap
- `qloo_where_popular` finds food, drink, after-party spots and street-team areas near the venue
- `qloo_trends` flags rising acts and draws the momentum chart
- `qloo_capabilities` checks readiness and drives the "Qloo live" badge

**Evidence that can't be faked.** Agents submit picks as `{entity_id, call_id}` pairs. A hook rejects any pick whose call isn't in the run's ledger or doesn't contain the pick. The server then builds each pick's evidence from the ledger itself, and a Claude claim check trims any sentence the evidence doesn't support.

**Agents.** The Claude Agent SDK runs the planner, its subagents and hooks. The Anthropic SDK runs Ask House Mix, the Critic, the crew briefing and the Claude-alone baseline.

**Stack.** TypeScript throughout: Fastify on Google Cloud Run, Firestore, Cloud Storage, Cloud Text-to-Speech and react-pdf for the API; Next.js 16 on Vercel with shadcn/ui, Tailwind v4, Recharts and Web Audio for the console. Real song previews come from the iTunes Search API.

**Safe to share.** The public deployment carries no Anthropic key of its own, so nobody can spend anyone else's. Rate limits sit on every route that does work, and personal data is blocked before any call leaves.

**Testing.**
- **Live contract:** `npm run qloo:verify` checks every Qloo tool against the live API (10 of 10 tools, 11 of 11 checks).
- **Unit and API:** 43 tests.
- **End to end:** 45 Playwright tests, run in mock mode and against live Qloo.
- **Accessibility:** axe WCAG 2.1 AA checks on desktop and mobile, light and dark.

## Challenges we ran into

- **Real names are ambiguous.** "London" matches four places in Qloo, and "Arsenal FC" matches an artist and a place in Luanda. We built confirm cards that show each candidate's description, category and popularity, so the operator picks the right one in one click, and nothing downstream runs on a guess.
- **Making evidence trustworthy.** We wanted every pick to point at a real call. The ledger, the submission hook and server-built evidence make that true for 182 of 182 picks.
- **Booking realism.** Our evaluation caught openers bigger than the headliner. We turned Qloo's popularity into a rule the server enforces, and the count dropped from 14 of 28 to 0 of 28.
- **Turning picks into music.** We matched Qloo's artists to real recordings, timed them to each slot and kept explicit songs out of all-ages shows. When a slot ran short, we let the agent ask Qloo for more instead of padding it.

## Accomplishments that we're proud of

We planned 7 real shows twice on live Qloo: once with House Mix, once with the same Claude model, the same brief and no Qloo. Then we checked every pick.

![Mistakes per plan: House Mix vs Claude alone](https://raw.githubusercontent.com/Prashant-thakur77/house-mix/main/docs/img/chart-mistakes.jpg)

- **182 of 182** House Mix picks trace back to a real Qloo call that contains them. Claude alone: 0 of 157.
- **Claude alone: 76 of 157** picks (48%) were ambiguous in Qloo and needed a person to choose. House Mix: every pick is a confirmed entity.
- **0 of 32** sponsors repeated across seven different shows. Claude alone repeated 6 of 28 and pitched Spotify to 4 shows.
- **0 of 28** openers bigger than the headliner. Claude alone: 4 of 10.
- **155 of 182** picks (85%) carry Qloo's own reason for the pick.
- **26%:** move the same show to a city on another continent and only about a quarter of Qloo's top 10 stays. All 8 lists changed, so the plan is local.
- **0%** overlap between Qloo's top 10s for two different crowds, across 28 pairs: every crowd gets its own night.
- **5 of 5:** the same Qloo call asked twice gave the same answer, so every citation can be re-checked.
- **55 of 59** artists Qloo picked had real songs to play, with **729 minutes** of timed music across the five demo shows.
- **10 of 10** Qloo tools in use and verified live, **43** unit tests, **45** end-to-end tests in two modes, WCAG 2.1 AA.

## What we learned

- Qloo works best when every step passes IDs, not names: one confirmed ID at intake makes every later call exact.
- Qloo's explainability turns a ranking into a sentence a promoter can repeat to a sponsor.
- Qloo's location signal matters: the same bill in another city is a different night.
- An agent is only as trustworthy as its receipts. Once every pick had to cite a call, every plan became checkable line by line.

## What's next

- A post-show debrief that compares what was planned with what happened and feeds the next plan.
- Direct hand-off to venue music services and ticketing partners.
- Human blind ratings at scale, and a setlist.fm backtest of real support acts.
- More kinds of night: weddings, corporate events and club residencies.

## Built with

qloo, qloo-mcp, claude, claude-agent-sdk, anthropic, mcp, typescript, node.js, next.js, react, fastify, google-cloud-run, firestore, google-cloud-storage, google-cloud-text-to-speech, vercel, tailwindcss, shadcn-ui, recharts, react-pdf, playwright, itunes-search-api

Methods and every result: [`eval/REPORT.md`](../eval/REPORT.md). Scope notes: [`LIMITATIONS.md`](LIMITATIONS.md).
