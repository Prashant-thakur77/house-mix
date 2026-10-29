# House Mix

**Tonight's lineup, programmed for tonight's crowd. Every pick carries its Qloo evidence.**

## The problem

Every night, someone at a venue decides the walk-in music, the opener, the halftime act, which food stalls to put on the concourse and which sponsor activation runs at the interval. Mostly they decide by gut feel, on a spreadsheet, from last month's show. The crowd for a psych-funk trio on a Saturday at an arena is not the crowd for a stand-up night in a club, and a Chelsea vs Arsenal crowd is two crowds. Venue GMs, promoters and sponsorship teams make this decision every night, and nothing helps them do it for the people who are actually coming.

## What House Mix does

1. **Intake.** Pick a mode (Concert, Comedy, Sports, Festival) and enter the bill, venue, city, date, capacity tier and house rules: budget band, age rating, exclusive sponsors, local-only vendors, vibe words and local acts to consider.
2. **Resolve and confirm.** Every name is resolved with `qloo_describe` (vibe words with `qloo_find_tags`). When Qloo returns `needs_input` (type "Genesis"), the console shows a confirm card with the candidates. The operator picks one, and the choice is re-checked by ID. Nothing is auto-picked.
3. **Watch the agents plan.** A Claude Agent SDK Planner sends out a CrowdReader, one Programmer per slot (in parallel), SponsorFit and a Wildcard agent. Every Qloo call streams into a live trace: tool, status chip, timing, cache hits and retries.
4. **Crowd read.** Shared vs distinct taste between the two sides (`qloo_compare_audiences`), aggregate age skew (`qloo_audience_demographics`), the crowd's taste vocabulary (`qloo_entity_tags`) and 90-day momentum (`qloo_trends`). "Qloo says" lines are generated from the data; "Our interpretation" lines are written by the agent and checked by the Critic.
5. **Run of show.** One lane per slot, e.g. doors and walk-in, openers, food and drink, merch and sponsors, after-party. Each pick shows its rank or affinity, a crew action and, where it applies, a stretch badge, a rising badge or a sponsor-fit score.
6. **Evidence drawer.** Click any pick: the Qloo calls behind it, their inputs (IDs only), status, scores and endpoint, with "Qloo says" set apart from "Our interpretation".
7. **Approval queue.** Approve, swap (a fresh `qloo_rank` over the slot's remaining alternatives) or reject with a reason, which becomes a negative signal the next plan excludes. Lock the plan to version and timestamp it.
8. **Exports.** Run-of-show PDF, ops CSV, a read-only share link, and a sponsor one-pager per brand with its fit score and evidence.
9. **Pre-show briefing.** A two-voice script for door, bar and stage staff. Every line cites plan facts, and an evidence judge drops lines it can't support. Voiced with Cloud Text-to-Speech.
10. **Crowd map.** One `qloo_where_popular` call per side shows where each side's taste concentrates in the city, which areas are strong for every side, and the top three for street teams, flyering and pre-show partner bars. It goes into the PDF too.
11. **Without Qloo.** The headline comparison, inside the product. Claude plans the same brief with no tools. Qloo then looks up each of those picks by name (`qloo_describe`) and ranks both plans' top picks per slot for tonight's bill, city and crowd (`qloo_rank`). The panel shows citation coverage (House Mix 100%, Claude alone 0%), how many knowledge-only picks Qloo can't find or can't disambiguate, and where they land for this crowd. It says plainly that Qloo grading its own picks is not a quality test; the blind A/B is.
12. **Ask House Mix.** "If the support act cancels, who opens?" A tool-using Claude loop over the same Qloo tools answers from the plan's calls plus new ones. Every line cites call IDs, the Critic removes lines that don't hold up, and any suggested change arrives as a pending item in the approval queue, with its evidence built from the ledger like every other pick.
13. **Tonight vs last night.** Two shows side by side with one Qloo comparison across both bills.

## How we use Qloo

All 10 `qloo mcp` tools do load-bearing work, and no plan item can exist without them. The backend starts `qloo mcp` over stdio with `env: process.env`, and every call goes through one client. That client caches by the SHA-256 of the canonical arguments for 24 hours, retries only when `error.retryable` is true, holds a 40-call budget per plan, and blocks personal data before it leaves.

| Tool | Why it fits |
| --- | --- |
| `qloo_capabilities` | Readiness at boot and in the health badge |
| `qloo_find_tags` | Turns vibe words into tag URNs (the operator picks when the match isn't exact) |
| `qloo_describe` | Turns every name into a confirmed ID, so every later call passes IDs, never names; checks whether Claude-alone picks exist in Qloo at all |
| `qloo_compare_audiences` | Home vs away, headliner vs support, act vs venue; crowd vs brand for sponsor fit; tonight vs last night |
| `qloo_audience_demographics` | Aggregate age skew for tone and pricing; the age-only phrase we pass back to `qloo_rank` |
| `qloo_entity_tags` | The crowd's taste vocabulary |
| `qloo_recommend` | Candidates for every slot, and the wildcard (recommend with the crowd's top tags excluded) |
| `qloo_rank` | Orders each shortlist (≤10 options) including the venue's own local acts; powers swap; ranks House Mix vs Claude-alone picks for the same crowd |
| `qloo_where_popular` | Where the crowd's taste concentrates in the city, for food, drink, the after-party guide and the crowd map's street-team areas |
| `qloo_trends` | Rising flags on opener candidates and the momentum chart |

**Evidence that can't be faked.** Agents submit picks as `{entity_id, call_id}` pairs. A PreToolUse hook (the Critic's first step) rejects a submission when the cited call isn't in this run's ledger, its status carries no results, or the entity isn't in its results. The server then builds each item's evidence from the ledger itself: tool, inputs, status, scores and endpoint. A Claude claim check removes or trims any interpretation that asserts something the evidence doesn't show. Every removal shows in the trace.

## Request to result (redacted)

[`docs/QLOO_WALKTHROUGH.md`](QLOO_WALKTHROUGH.md) traces one show, Chelsea FC vs Arsenal FC at Stamford Bridge, through every call: the five intake resolutions, then the ~25 calls the agents made, with the inputs (IDs only), statuses, result counts, retries and cache hits, and how each slot's picks map back to them. Entity and tag choices: the two clubs, the venue and the city resolved exactly; the vibe word "high energy" matched a tag name exactly; anything ambiguous would have stopped for the operator.

## Screenshots

`design/app/` holds every screen at 1440×900 and 390×844 in light and dark, including the confirm-card state, the evidence drawer and the share page. No key or personal data appears in any of them.

## Setup from a clean machine

```sh
git clone <repo> house-mix && cd house-mix && npm install
cp .env.example .env.local    # set ANTHROPIC_API_KEY; QLOO_API_KEY optional (mock otherwise)
npm run dev:api & npm run dev:web
# live Qloo: npm i -g @qloo/qloo-harness && npm run qloo:verify
```

Full steps, tests and deploy scripts are in the README.

## Results

House Mix makes three claims, each against a named baseline. All numbers come from `eval/` scripts; see [`eval/REPORT.md`](../eval/REPORT.md).

| Claim | Method | Result |
| --- | --- | --- |
| Raters prefer House Mix plans to LLM-only plans | Blind pairwise A/B on 10 real 2025 shows (3 dev, 7 test); same model, same brief, labels stripped, sides randomised; Wilson 95% CI, Fleiss κ | pending live key and raters |
| Qloo ranking finds the real support act | setlist.fm 2025 shows; 50-artist pool (true support + same-genre distractors); `qloo_rank` tournament vs popularity-only vs LLM-only; hit@10 and MRR; tuned on 5 dev shows | pending live key |
| Every item has a valid citation | Share of items whose cited call is in the ledger with the entity in its results; unresolvable LLM-only picks | pending live plans |

The report generator also writes one honest negative result: the comparison House Mix did not win, or the weakest coverage area. Our expectation is comedy openers, where Qloo coverage of working comedians is thinner.

## Known limitations

- Aggregate affinity is not individual preference, attendance or purchase intent. We present every result as a relative signal with its source.
- Scores from different Qloo calls aren't comparable; each ranking orders only its own options, which is why the backtest uses a tournament.
- Local acts, small vendors and comedians can have thin or no Qloo coverage. Those are labelled "no Qloo signal", never filled in by the model.
- Demographics are used only for tone and pricing; House Mix refuses eligibility-type requests and personal data.
- Sponsor fit is our formula (mean affinity similarity) over Qloo's comparison, not a Qloo score.
- "Without Qloo" is a per-show illustration, not a metric: Qloo is ranking House Mix's own picks there. The blind A/B is the quality claim.

## Built with

TypeScript, Claude Agent SDK (Planner + subagents + hooks), Anthropic SDK (Ask House Mix tool loop, Critic, briefing writer and judge, Claude-alone baseline), MCP TypeScript SDK, `@qloo/qloo-harness` (`qloo mcp`), Fastify, Firestore, Cloud Storage, Cloud Text-to-Speech, Cloud Run, Next.js 16, shadcn/ui, Tailwind v4, Recharts, react-pdf, Playwright, axe-core.
