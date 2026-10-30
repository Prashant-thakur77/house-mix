# House Mix

**AI agents that program the whole night (music, openers, food, sponsors) for the crowd that's actually coming, with every pick backed by a live Qloo taste call.**

Live demo: https://house-mix.vercel.app · Film: https://youtu.be/Gbt9bEk-PNs · Code: https://github.com/Prashant-thakur77/house-mix

## Inspiration

Every night, someone at a venue decides the walk-in music, the opener, the halftime act, which food stalls go on the concourse and which sponsor runs the interval activation. They decide for a crowd they have never met, usually from last month's spreadsheet. A psych-funk crowd at the Hollywood Bowl is not a stand-up crowd at The Comedy Store, and Chelsea vs Arsenal is two crowds at once. Qloo knows what those crowds love. We built the agent that turns that knowledge into a night.

## What it does

House Mix takes tonight's bill and city and plans the whole night for the crowd that's actually coming, with every pick backed by a real Qloo call.

- **Every name confirmed.** Each act, team, venue and city is resolved to a Qloo ID. When a name is ambiguous (Dodger Stadium has a twin in Iowa), House Mix asks instead of guessing.
- **A team of agents plans live.** A Claude Agent SDK planner sends out a crowd reader, one programmer per slot in parallel, a sponsor-fit agent and a wildcard agent. Every Qloo call streams into a live trace.
- **The crowd read.** What both fan bases share, what only one side carries, age skew, taste vocabulary and momentum.
- **A full run of show.** Walk-in music, openers, food and drink, sponsors and the after-party guide, each pick with its Qloo rank, a crew action, and Qloo's own explanation of why ("explained by Arsenal F.C. (0.62) and Chelsea FC (0.38)").
- **Sponsors in depth.** Brands Qloo ranks for this exact crowd in this city, an honest crowd-vs-brand comparison, a concrete activation, and a one-pager PDF for the sponsor.
- **Ask House Mix.** Ask anything about the night ("which drinks brand fits the jazz-night crowd?") and get an answer only from Qloo, every line cited.
- **Hear the night.** Every artist Qloo picked becomes real songs in playlists timed to each slot, with 30-second previews. When a set runs short, the agent goes back to Qloo for more artists like that slot's picks and keeps the call as evidence.
- **Hand it off.** Playlist CSV and M3U for the venue's licensed music service, a cue sheet PDF for the sound desk, a run-of-show PDF, and a ready-to-send outreach message for every partner, written from its Qloo evidence.
- **Get the night ready, then run it.** A checklist from confirmed names to a locked plan, then Run the night: a show clock, the real song playing for whoever is on, and every crew cue on time, re-timed when the night runs late.
- **Five kinds of night:** concerts, comedy, sports, festivals and restaurants.

## How we built it

- **Qloo:** all 10 tools of `qloo mcp`, started as a stdio MCP server and routed through one client with a 24-hour cache, retries only on retryable errors, a per-plan call budget and a personal-data guard.
- **Agents:** Claude Agent SDK (planner, subagents and hooks) and the Anthropic SDK for Ask House Mix, the Critic, the crew briefing and the Claude-alone baseline.
- **Evidence that can't be faked:** agents submit picks as `{entity_id, call_id}` pairs. A hook rejects any pick whose call isn't in the run's ledger or doesn't contain the pick. The server then builds each pick's evidence from the ledger itself.
- **Stack:** TypeScript, Fastify on Cloud Run, Firestore, Cloud Storage, Cloud Text-to-Speech, Next.js 16 on Vercel, shadcn/ui, Tailwind v4, Recharts, react-pdf, Playwright and axe-core.

## Challenges we ran into

- **Real names are ambiguous.** "London" matches four places in Qloo, and "Arsenal FC" matches an artist and a place in Luanda. We built confirm cards that show each candidate's description and popularity, so the operator chooses in one click.
- **Making evidence trustworthy.** We wanted every pick to point at a real call. The ledger, the submission hook and server-built evidence make that true for every pick.
- **Booking realism.** Our evaluation caught openers bigger than the headliner. We turned Qloo's popularity into a rule the server enforces, and the rate dropped from 14 of 28 to 0 of 28.

## Accomplishments that we're proud of

Measured on live Qloo across 7 real shows, against the same Claude model with the same brief and no Qloo:

- **182 of 182** House Mix picks trace back to a real Qloo call.
- **Claude alone: 76 of 157** picks (48%) were ambiguous in Qloo and needed a person to choose.
- **0 of 32** sponsors repeated across seven different shows. Claude alone repeated 6 of 28, with Spotify pitched to 4 shows.
- **0 of 28** openers bigger than the headliner. Claude alone: 4 of 10.
- **155 of 182** picks carry Qloo's own reason for the pick.
- Moving the same show to a city on another continent keeps only **26%** of Qloo's top 10: the plan is local.
- The same Qloo call asked twice gave the same answer **5 of 5** times, so every citation can be re-checked.
- **10 of 10** Qloo tools verified against the live API; **28** unit and API tests; **45** end-to-end browser tests, run in mock mode and against live Qloo, with WCAG 2.1 AA accessibility checks.
- Hear the night found real songs for **55 of 59** artists Qloo picked, with 729 minutes of music across the five demo shows.

## What we learned

Qloo is at its best when every downstream step passes its IDs, not names: one confirmed ID at intake makes every later call exact. Qloo's explainability turns a ranking into a sentence a promoter can repeat to a sponsor. And an agent is only as trustworthy as its receipts: once every pick had to cite a call, every plan became checkable line by line.

## What's next

- Post-show debrief: compare what was planned with what happened, and feed it into the next plan.
- A direct hand-off to venue music services and ticketing partners.
- Human blind ratings at scale, and a setlist.fm backtest of real support acts.

## Built with

qloo, qloo-mcp, claude, claude-agent-sdk, anthropic, mcp, typescript, next.js, react, fastify, node.js, google-cloud-run, firestore, google-cloud-storage, google-cloud-text-to-speech, vercel, tailwindcss, shadcn-ui, recharts, react-pdf, playwright, itunes-search-api

Methods and every result: [`eval/REPORT.md`](../eval/REPORT.md). Scope notes: [`LIMITATIONS.md`](LIMITATIONS.md).
