# House Mix: UI references

Captured with `npx tsx scripts/ui-research.ts` on 2026-10-29 (Chromium headless, 1440×900 desktop and
390×844 mobile, full page clipped at 6000px, light and dark via `prefers-color-scheme` emulation).
Files: `design/refs/<slug>/{desktop,mobile}-{light,dark}.png`; run log with consent handling, page
heights and skips: `design/refs/_log.json`. A dark file exists only where the site actually changes
under dark emulation; single-scheme sites have one file per viewport, named after the scheme they
render. Cookie banners were answered with the most privacy-preserving option available (reject /
necessary only / settings with optional categories off); nothing was accepted.

We take patterns, layout and feel from these pages only. No logos, illustrations, copy or page
structure are carried into House Mix.

## Scoring

1 = poor, 5 = excellent. Columns:

- **Fit**: fit for a dense live-events operator console
- **Data**: data readability (tables, numbers, charts, status at a glance)
- **AA**: colour contrast against WCAG AA, judged from the captures (small grey text, text over imagery)
- **Dark**: dark mode quality (5 = real light/dark parity; 3 = good dark-only; 1 = light-only)
- **Motion**: motion that helps rather than distracts (from what is visible and the page's known behaviour)
- **Map**: how cleanly it maps onto shadcn/ui + Tailwind v4
- **Total** out of 30

| # | Site | Category | Fit | Data | AA | Dark | Motion | Map | Total |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | [CampusEvac (landing)](#campus) | saved reference | 3 | 3 | 4 | 2 | 3 | 3 | **18** |
| 2 | [CampusEvac (lobby)](#campus-rooms) | saved reference | 4 | 3 | 4 | 2 | 3 | 4 | **20** |
| 3 | [CampusEvac (drill HUD)](#campus-play) | saved reference | 4 | 3 | 4 | 3 | 3 | 3 | **20** |
| 4 | [incident.io](#incident-io) | incident ops | 3 | 2 | 4 | 1 | 4 | 4 | **18** |
| 5 | [Linear](#linear) | operator console | 5 | 4 | 3 | 4 | 4 | 5 | **25** |
| 6 | [Vercel](#vercel) | dev platform | 3 | 3 | 5 | 5 | 3 | 5 | **24** |
| 7 | [Grafana Labs](#grafana) | observability | 4 | 4 | 4 | 2 | 3 | 3 | **20** |
| 8 | [Sentry](#sentry) | error ops | 2 | 3 | 3 | 3 | 3 | 2 | **16** |
| 9 | [Better Stack](#betterstack) | uptime / logs | 4 | 4 | 3 | 3 | 3 | 4 | **21** |
| 10 | [Axiom](#axiom) | observability / logs | 5 | 4 | 3 | 3 | 3 | 4 | **22** |
| 11 | [Tinybird](#tinybird) | real-time analytics | 3 | 4 | 4 | 3 | 3 | 4 | **21** |
| 12 | [PostHog](#posthog) | product analytics | 2 | 3 | 4 | 2 | 3 | 2 | **16** |
| 13 | [Supabase](#supabase) | dev platform | 3 | 3 | 4 | 5 | 3 | 5 | **23** |
| 14 | [Raycast](#raycast) | tool UI | 2 | 2 | 3 | 3 | 2 | 3 | **15** |
| 15 | [Tremor](#tremor) | dashboard components | 4 | 5 | 4 | 2 | 3 | 5 | **23** |
| 16 | [shadcn/ui dashboard example](#shadcn-dashboard) | dashboard example | 4 | 4 | 4 | 5 | 3 | 5 | **25** |
| 17 | [DICE](#dice) | ticketing | 2 | 2 | 5 | 1 | 3 | 3 | **16** |
| 18 | [Songkick](#songkick) | concert listings | 3 | 3 | 3 | 3 | 3 | 4 | **19** |
| 19 | [Bandsintown](#bandsintown) | concert listings | 2 | 3 | 4 | 1 | 3 | 4 | **17** |
| 20 | [Chartmetric](#chartmetric) | music analytics | 4 | 5 | 4 | 2 | 3 | 4 | **22** |
| 21 | [Soundcharts](#soundcharts) | music analytics | 3 | 4 | 4 | 3 | 2 | 4 | **20** |
| 22 | [FotMob](#fotmob) | live sports data | 5 | 5 | 4 | 5 | 3 | 4 | **26** |
| 23 | [Sofascore](#sofascore) | live sports data | 5 | 5 | 4 | 5 | 3 | 3 | **25** |
| 24 | [Opta Analyst](#opta-analyst) | sports data editorial | 3 | 4 | 4 | 2 | 3 | 3 | **19** |
| 25 | [Hudl Statsbomb](#statsbomb) | sports data | 2 | 2 | 3 | 1 | 3 | 3 | **14** |
| 26 | [Overworld Audio](#overworld-audio) | music (Awwwards SOTD) | 1 | 1 | 3 | 3 | 2 | 1 | **11** |
| 27 | [Nick Ho](#nickho-motorsports) | sports (Awwwards SOTD) | 2 | 3 | 4 | 2 | 3 | 2 | **16** |
| 28 | [The Immortals](#the-immortals) | football (Awwwards HM) | 1 | 2 | 4 | 1 | 3 | 2 | **13** |
| 29 | [New York Philharmonic: Gustavo](#nyphil-gustavo) | concert (Awwwards HM) | 1 | 1 | 5 | 3 | 3 | 2 | **15** |

Chosen direction (see `DIRECTION.md`): **primary = quiet ops console** (Linear, Axiom, shadcn
dashboard); **secondary A = match-centre live data** (FotMob, Sofascore); **secondary B = signal
cards** (Chartmetric, Tremor). Patterns adopted from the CampusEvac warden screen are listed in
`DIRECTION.md` §1.

## Notes per site

### CampusEvac (landing) <a id="campus"></a>

`localhost (github.com/AfreenInnovates/campus)` · `design/refs/campus/` (desktop-light.png, mobile-light.png)

Saved reference, run locally. Cream paper, ink-black type, offset block shadows, a scrolling ticker and numbered step cards. High-energy and very legible at a distance; the stat tiles (big number + small caps unit + one-line label) are a good crowd-read card shape. Brutalist shadows and five saturated fills are too loud for a console that runs all night. Light only on the landing (dark used as contrast panels).

### CampusEvac (lobby) <a id="campus-rooms"></a>

`localhost/simulation/rooms` · `design/refs/campus-rooms/` (desktop-light.png, mobile-light.png)

The lobby terminal: kicker label ("LOBBY TERMINAL / 02"), two task cards (create vs join) with mono codes in the corner, then three numbered steps. Clear primary/secondary split and short instructional copy; maps directly to the `/new` intake and to the empty state of the console.

### CampusEvac (drill HUD) <a id="campus-play"></a>

`localhost/simulation/play` · `design/refs/campus-play/` (desktop-dark.png, mobile-dark.png)

Briefing modal over the 3D scene: numbered objectives with place names, a keyboard legend in kbd chips, one full-width CTA. The repo's own warden-view image shows the pattern we adopt: breadcrumb location path, LIVE chip, Watch / Evidence switch, a sector feed with UNKNOWN states and numbered commands gated by "Verify first". Mobile shows a rotate-your-phone gate, which we must not copy.

### incident.io <a id="incident-io"></a>

`https://incident.io` · `design/refs/incident-io/` (desktop-light.png, mobile-light.png)

Serif headline, warm orange gradient stage, product frame with a calm particle graph labelled by cause. Beautiful but marketing-only: no dense data on the page. Light only. The labelled-cluster idea is a possible visual for taste-tag clusters, but not for the console.

### Linear <a id="linear"></a>

`https://linear.app` · `design/refs/linear/` (desktop-dark.png, mobile-dark.png)

The closest thing to our console: sidebar, issue detail, activity feed, and an agent side panel with steps ("Worked for 10 sec"). Hairline borders, 13px UI text, colour only on state. Some grey-on-black body text looks below 4.5:1 (we fix that in tokens). Dark-only marketing, but the product has true light/dark. Maps cleanly to shadcn.

### Vercel <a id="vercel"></a>

`https://vercel.com` · `design/refs/vercel/` (desktop-light.png, desktop-dark.png, mobile-light.png, mobile-dark.png)

Real light/dark parity driven by `prefers-color-scheme`; near-white/near-black surfaces with crisp black/white type. Very little data on the homepage and lower sections fade in on scroll (blank in the capture). Its type system and neutral greys are essentially shadcn's defaults.

### Grafana Labs <a id="grafana"></a>

`https://grafana.com` · `design/refs/grafana/` (desktop-light.png, mobile-light.png)

Light marketing shell with dark dashboard screenshots (cost breakdown tables with coloured cells, big KPI figures). Strong at numbers-in-cards; the page itself is busy (promo banner, many accents). Shows that a dark data panel inside a light page reads well, which is how our evidence drawer can sit in light mode.

### Sentry <a id="sentry"></a>

`https://sentry.io` · `design/refs/sentry/` (desktop-dark.jpg, mobile-dark.png)

Purple-on-purple with neon accents and a large mascot illustration. The small product cards (Errors, Replays, Logs, Traces, a "Root Cause" reasoning list) are a nice compact trace motif, but the theme is too loud and low-contrast for long sessions.

### Better Stack <a id="betterstack"></a>

`https://betterstack.com` · `design/refs/betterstack/` (desktop-dark.png, mobile-dark.png)

Navy-black with a log explorer: histogram strip over a dense log table with a JSON side panel. Exactly the trace + detail pairing we need. Muted grey text on navy is borderline AA. Consent answered with "necessary only".

### Axiom <a id="axiom"></a>

`https://axiom.co` · `design/refs/axiom/` (desktop-dark.png, mobile-dark.png)

Query bar, dataset library list, and an agent panel that streams steps ("Why did checkout p95 spike…" then "Let me confirm by using…" then "Axioming…") with an MCP connection footer. This is our live agent trace, almost literally. Mono throughout for data, dim secondary text is the weak spot.

### Tinybird <a id="tinybird"></a>

`https://www.tinybird.co` · `design/refs/tinybird/` (desktop-dark.png, mobile-dark.png)

Black page, mint accent, mono headline figures (5.6M, 1,000x, 1week) with small caps units. Great for the KPI typography in crowd read; bracketed tab labels are a nice mono detail. Mostly marketing. Consent: reject all.

### PostHog <a id="posthog"></a>

`https://posthog.com` · `design/refs/posthog/` (desktop-light.png, mobile-light.png)

Desktop-OS metaphor (windows, icons, wallpaper) with playful copy. Readable and well contrasted but the window chrome and illustration style do not map to shadcn or to a calm console. The tabbed product demo window is the only reusable pattern.

### Supabase <a id="supabase"></a>

`https://supabase.com` · `design/refs/supabase/` (desktop-light.png, desktop-dark.png, mobile-light.png, mobile-dark.png)

True light/dark parity with a single green accent; bento grid of feature cards, each with an icon, title, two lines and a small diagram. Clean Tailwind/Radix feel. Not dense, but the card anatomy is a good model for crowd-read cards.

### Raycast <a id="raycast"></a>

`https://www.raycast.com` · `design/refs/raycast/` (desktop-dark.png, mobile-dark.png)

Dark, glossy, a large red diagonal-light hero. Command-palette screenshots are good (our `Command` combobox in intake), but the page relies on heavy hero art and scroll-driven reveals.

### Tremor <a id="tremor"></a>

`https://tremor.so` · `design/refs/tremor/` (desktop-light.png, mobile-light.png)

React + Tailwind + Radix + Recharts: our exact stack. Line chart with direct legend, stacked bars with value list, uptime tracker strip (great for a per-tool status history), range sliders, filter inputs. Light capture only, but the components ship dark variants.

### shadcn/ui dashboard example <a id="shadcn-dashboard"></a>

`https://ui.shadcn.com/examples/dashboard` · `design/refs/shadcn-dashboard/` (desktop-light.png, desktop-dark.png, mobile-light.png, mobile-dark.png)

Sidebar, four KPI cards with delta chips, an area chart with range toggle, and a data table with status badges, drag handles and pagination, in true light and dark. Monochrome by default. This is the baseline we theme, not reinvent.

### DICE <a id="dice"></a>

`https://dice.fm` · `design/refs/dice/` (desktop-light.png, mobile-light.png)

Black-and-white, heavy condensed caps, illustration-led. Very high contrast and confident, but almost no data on the homepage. The cookie banner only offered Allow/Settings; the script opened Settings and rejected all.

### Songkick <a id="songkick"></a>

`https://www.songkick.com` · `design/refs/songkick/` (desktop-dark.png, mobile-dark.png)

Dark concert-hall photo hero, pink accent, horizontal rails of event cards with date · venue · city under each image. That three-line event meta is the right shape for our show cards. Ads above the nav, grey meta text on dark is borderline. OneTrust consent rejected.

### Bandsintown <a id="bandsintown"></a>

`https://www.bandsintown.com` · `design/refs/bandsintown/` (desktop-light.png, mobile-light.png)

Location-aware hero ("Live from <city>") with search, quick-filter pills and dropdown chips; event cards with date/time and venue. Good filter-chip pattern for the trace filters; ad units and sparse content elsewhere. Light only.

### Chartmetric <a id="chartmetric"></a>

`https://chartmetric.com` · `design/refs/chartmetric/` (desktop-light.png, mobile-light.png)

The "market signals" card: recent momentum (+3.2% with a tiny bar spark), top markets (country + bar + %), target demographics (age band + bars), breakout signals (2.8×, +34%). Exactly the crowd-read panel at the right density. Teal accent on white, readable at small sizes.

### Soundcharts <a id="soundcharts"></a>

`https://soundcharts.com` · `design/refs/soundcharts/` (desktop-dark.png, mobile-dark.png)

Dark navy, a dense artist table (rank, score, deltas in green/red, filter chips, dropdown filter panel) and a mobile charts list with movement arrows. Good evidence for compact score + delta cells. Cookiebot banner: the script opened its settings and declined.

### FotMob <a id="fotmob"></a>

`https://www.fotmob.com` · `design/refs/fotmob/` (desktop-light.png, desktop-dark.png, mobile-light.png, mobile-dark.png)

Three columns (leagues · today's fixtures · news/table). Fixtures grouped by competition with sticky group headers; each row is home · time-or-score · away with a status chip (FT) on the left. Standings table with tabular numbers and a coloured rank rail. True light/dark parity. This is the run-of-show timeline and compare layout.

### Sofascore <a id="sofascore"></a>

`https://www.sofascore.com` · `design/refs/sofascore/` (desktop-light.png, desktop-dark.png)

Even denser match-centre: live ticker strip across the top, filter tabs (Live (90) / Finished / Upcoming), grouped rows with kick-off time and red "Postponed" state, a featured match card with a vote and odds. True light/dark. Busier than we want (ads, many accents). Mobile hit a Cloudflare human check, so only desktop is captured.

### Opta Analyst <a id="opta-analyst"></a>

`https://theanalyst.com` · `design/refs/opta-analyst/` (desktop-light.png, mobile-light.png)

Live score ticker on top, prediction tables with a heat-scaled pink column (percentages in tabular mono), condensed caps section heads with MORE links, projected-points cards. The single-hue heat column is a good model for affinity tables. Editorial, image-heavy centre column.

### Hudl Statsbomb <a id="statsbomb"></a>

`https://statsbomb.com` · `design/refs/statsbomb/` (desktop-light.png, mobile-light.png)

Photo hero with thin white text, icon + stat feature row, product screenshots of pitch heatmaps. Thin type over imagery is a contrast risk. Little reusable UI for an operator console.

### Overworld Audio <a id="overworld-audio"></a>

`https://overworldaudio.com` · `design/refs/overworld-audio/` (desktop-dark.png, mobile-dark.png)

Sound gate ("Enter with sound / without sound"; the script clicks "without"), then a full-screen 3D landscape with markers and a serif headline. Atmospheric; nothing transferable to a data console except the quiet letter-spaced nav labels.

### Nick Ho <a id="nickho-motorsports"></a>

`https://nickho-motorsports.nl` · `design/refs/nickho-motorsports/` (desktop-light.png, mobile-light.png)

Black-and-white race photography, a giant condensed "98", and a stat stack (98 car number, 17 podiums, 14 circuits) in big numerals with small labels. That numeral + label stack is the one idea we keep, for headline figures on demo cards and the share page.

### The Immortals <a id="the-immortals"></a>

`https://theimmortals.world` · `design/refs/the-immortals/` (desktop-light.png, mobile-light.png)

Intro counter ("19 … 30"), then a 3D trophy carousel with host/winner labels. Clean Host / Winner label-value pairs and generous type; otherwise a storytelling piece with no operator value.

### New York Philharmonic: Gustavo <a id="nyphil-gustavo"></a>

`https://www.nyphil.org/discover/gustavo` · `design/refs/nyphil-gustavo/` (desktop-dark.png, mobile-dark.png)

Yellow condensed caps on black, then a cyan chapter section. Maximum contrast and strong concert-poster energy; useful only as a reminder that a show's name can carry a page. The consent notice is notice-only ("By continuing to browse…"), left visible.


## Skipped

| Site | URL | Why |
|---|---|---|
| Resident Advisor | https://ra.co/events | HTTP 403 to headless Chromium on every attempt (bot protection); skipped, not worked around |
| Sofascore (mobile only) | https://www.sofascore.com | mobile viewport got a Cloudflare "Verifying you are human" check; desktop light and dark were captured and scored |
| strikal-move (saved reference) | https://strikal-move.vercel.app | Vercel `404 DEPLOYMENT_NOT_FOUND` (also checked `strikal.vercel.app` and the `-git-main` alias); the deployment is gone, so there is nothing to score. Re-run `npx tsx scripts/ui-research.ts --only strikal-move` if it comes back |

## Capture caveats

- Several marketing pages animate content in on scroll. Where the animation reverses after the
  capture scrolls back up, the lower part of a full-page shot is blank or faded (Vercel, Linear,
  Raycast lower sections). Scores use the visible sections plus the product shots.
- Sticky headers sometimes repeat mid-page on mobile captures (Supabase, Tinybird); that is a
  stitching artefact, not the site.
- Ads and sign-in prompts (Bandsintown, Songkick, FotMob mobile) are left as served.
- Sentry's desktop capture is saved as JPEG (q82) because the PNG exceeded 4 MB.
- CampusEvac scrolls an inner container; the script releases it so the full page is captured.
  The drill HUD needs a second player, so the capture shows the solo briefing modal; the warden
  console pattern is judged from the repo's own README screenshot (`image8.png`).
- Overworld Audio opens behind a sound gate; the script clicks "enter without sound" first
  (`actions` in `scripts/ui-refs.json`). The Immortals plays an intro counter; the script waits 9s.
