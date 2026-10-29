# House Mix: UI direction

Source material: 29 captured reference sites in `design/refs/` (31 candidates, 2 skipped; scored in `design/REFERENCES.md`).
Token source of truth: `design/tokens.json`. Re-check contrast after any token change with
`npx tsx scripts/contrast.ts` (exits non-zero on a failing pair).

## 1. The chosen direction

| Role | Direction | Reference anchors | What we take |
|---|---|---|---|
| **Primary** | **Quiet ops console** | Linear, Axiom, shadcn dashboard example | Neutral low-chroma surfaces, hairline borders, one accent, 13–14px UI text, mono for IDs/timings, a list/detail/side-panel layout, an agent panel that streams steps, full light/dark parity |
| Secondary A | **Match-centre live data** | FotMob, Sofascore | Grouped compact rows (one row = one event), status chip on the left, time in tabular mono, sticky group headers, three-column page with the "now" column in the middle, live dot |
| Secondary B | **Signal cards** | Chartmetric, Tremor | Small cards that pair one number with one tiny chart (momentum spark, top-markets bars, demographic bars), tracker strips, legend-as-list with values |

Why these won:

1. **Density without noise.** Linear and Axiom put an issue list, an activity feed and a streaming
   agent panel on one screen and stay readable because colour is spent only on state. That is the
   House Mix console: the GM watches a trace, a timeline and an evidence panel at once, mid-show.
2. **The agent trace already exists as a pattern.** Axiom's agent panel ("Why did checkout p95
   spike…" followed by step lines) and Linear's activity feed are a direct template for a live,
   append-only tool-call trace with status and timing.
3. **Shadcn maps 1:1.** The shadcn dashboard example scored 5 on mapping: sidebar, KPI cards,
   chart card, data table with status badges, in light and dark. We start from those primitives
   instead of fighting them.
4. **Live-events reading habits.** FotMob/Sofascore are what promoters and football ops staff
   already read on match day: grouped rows, state chip, kick-off time, score. Our run-of-show
   slots (doors, walk-in, opener, interval, headliner, after-party) read the same way.
5. **Crowd read needs small multiples, not a BI tool.** Chartmetric's "market signals" card
   (momentum, top markets, demographics, breakout) is exactly the crowd-read panel, at a size that
   fits beside the timeline.

Also adopted (patterns, not a direction): from the CampusEvac warden screen, a **Watch / Evidence**
segmented switch in the header, **numbered, gated command steps** ("Verify first" disables the next
step until the previous one is done) for the approval queue, and an all-caps tracked label style for
section/slot names. Its brutalist offset shadows and saturated palette are *not* adopted: they fight
the "calm at a glance" goal.

Rejected on purpose: hero-video and WebGL award sites (Overworld, The Immortals, Nick Ho, the NY Phil
microsite) score well on feel but badly on data readability; their one lesson we keep is the
**oversized condensed numeral** for a single headline figure (capacity, kick-off, doors time) on
the share page and the landing cards.

## 2. Colour tokens

Principles:

- Surfaces are warm-neutral graphite ("house lights down"), never pure black/white panels side by
  side. Only **state** gets colour.
- **Violet = the agent** (primary actions, "Our interpretation"). **Teal = Qloo** ("Qloo says",
  source data). The two never swap meaning.
- **Amber `signal` = now/live** (current slot, LIVE badge, arrival highlight). Status colours are
  reserved for tool/item status and always ship with an icon and a text label (never colour alone).
- **Magenta = stretch** (the one wildcard per section). Nothing else uses it.
- Input borders use `--input` (= border-strong, ≥3:1) so form fields meet WCAG 1.4.11; decorative
  dividers use the lighter `--border`.

### 2.1 Palette

| Token | Light | Dark | Use |
|---|---|---|---|
| background | `#F6F5F2` | `#0E0E12` | page |
| surface (card) | `#FFFFFF` | `#16161C` | cards, panes, popovers |
| surface-2 (muted) | `#EFEDE8` | `#1E1E26` | table header, trace row hover, code/inputs block, skeleton |
| border | `#DEDAD2` | `#2C2C36` | hairlines, dividers |
| border-strong (input) | `#8A847A` | `#6C6C7A` | input outlines, focus-adjacent UI boundaries |
| text (foreground) | `#18171C` | `#ECEBF0` | body |
| text-muted | `#5C5866` | `#A3A1AE` | secondary text, labels |
| text-subtle | `#6E6A76` | `#8D8B98` | timestamps, placeholders (still ≥4.5:1 on card) |
| primary | `#5137D6` | `#9D8CFF` | primary buttons, links, selected tab |
| primary-foreground | `#FFFFFF` | `#0E0E12` | text on primary |
| accent (shadcn hover surface) | `#EDEAFB` | `#252240` | menu/row hover, selected row |
| accent-foreground | `#3A24A8` | `#CFC6FF` | text on accent |
| signal | `#A84C08` | `#FFB547` | LIVE, current slot marker, "new" flash |
| signal-bg | `#FCEFD9` | `#33240D` | current slot band |
| destructive | `#C0262D` | `#FF6B6B` | reject, delete |
| ring | `#5137D6` | `#9D8CFF` | focus ring (2px + 2px offset) |

Status (tool calls and plan items). Each has a text colour and a tinted chip background.

| Status | Icon (lucide) | Light fg / bg | Dark fg / bg | Meaning |
|---|---|---|---|---|
| `ok` | `circle-check` | `#117538` / `#E3F4E8` | `#4ADE80` / `#10291A` | tool returned usable results |
| `empty` | `circle-dashed` | `#5C5866` / `#ECEAE6` | `#A3A1AE` / `#22222A` | valid call, zero results |
| `needs_input` | `circle-help` | `#1F55C9` / `#E3ECFC` | `#7AA7FF` / `#14213D` | ambiguous entity: operator must pick |
| `partial` | `contrast` (half disc) | `#8A5A00` / `#FAF0CF` | `#F2C94C` / `#2E2610` | some results/fields missing |
| `degraded` | `triangle-alert` | `#B4470D` / `#FCE7D9` | `#FF9A5C` / `#33190D` | fallback/cached path used |
| `error` | `circle-x` | `#C0262D` / `#FBE4E4` | `#FF6B6B` / `#361416` | call failed (retryable flag shown) |
| running | `loader-circle` (spins) | uses `text-muted` | uses `text-muted` | in flight |

Evidence pairing:

| Token | Light fg / bg / border | Dark fg / bg / border |
|---|---|---|
| `qloo` ("Qloo says") | `#0B6E66` / `#E1F3F0` / `#1C9488` | `#5EE0CF` / `#0D2826` / `#2BA898` |
| `interp` ("Our interpretation") | `#4A30C8` / `#EEEBFC` / `#7C68E6` | `#B9ADFF` / `#1E1A3A` / `#7E6CF0` |
| `stretch` (wildcard badge) | `#A01F86` / `#FBE5F5` | `#F58BDD` / `#3A1232` |

Body copy inside the evidence blocks is `--foreground`; only the block label ("QLOO SAYS",
"OUR INTERPRETATION") and the 3px left border use the pair colour. Besides colour, the Qloo block
is set in mono for raw values and the interpretation block in the UI sans, so the two never rely
on hue alone.

Categorical chart palette (6). Order is fixed so series keep their colour across charts.

| # | Light | Dark | Default meaning |
|---|---|---|---|
| chart-1 | `#5137D6` violet | `#8F7CF7` | Audience A (headliner / home) |
| chart-2 | `#00897A` teal | `#0FA391` | Audience B (support / away) |
| chart-3 | `#C26A00` amber | `#C98210` | Shared affinity / overlap |
| chart-4 | `#C2337A` pink | `#E25C9E` | 4th series |
| chart-5 | `#2F6FDB` blue | `#4F8FEA` | 5th series |
| chart-6 | `#5E7F12` olive | `#6E9F1B` | 6th series / baseline |

Chart colours were re-stepped with the categorical palette validator (lightness band, chroma floor, CVD separation, normal-vision floor, contrast): light `#5137D6,#00897A,#C26A00,#C2337A,#2F6FDB,#5E7F12` and dark `#8F7CF7,#0FA391,#C98210,#E25C9E,#4F8FEA,#6E9F1B` both pass every check. All chart colours are ≥3:1 against card and page in both themes (table below). Charts always
carry direct labels or a value legend, so the palette never has to be read alone (violet/pink and
teal/olive pairs are close for some colour-vision types). Sequential scales (demographic skew)
use one hue (`chart-1`) at 5 opacity steps: 100/80/60/40/20%. Diverging (A vs B affinity) uses
`chart-1` ← neutral `surface-2` → `chart-2`.

### 2.2 Computed contrast

Generated by `npx tsx scripts/contrast.ts design/tokens.json` (WCAG 2.x relative luminance).
Body text pairs need 4.5:1; UI boundaries, focus rings and chart marks need 3:1. **All 118 pairs
pass.**

#### light

| Foreground | Background | Ratio | Needs | Result |
|---|---|---:|---:|---|
| `text` #18171C | `background` #F6F5F2 | 16.35:1 | 4.5:1 | pass |
| `text` #18171C | `surface` #FFFFFF | 17.82:1 | 4.5:1 | pass |
| `text` #18171C | `surface-2` #EFEDE8 | 15.23:1 | 4.5:1 | pass |
| `text-muted` #5C5866 | `background` #F6F5F2 | 6.33:1 | 4.5:1 | pass |
| `text-muted` #5C5866 | `surface` #FFFFFF | 6.90:1 | 4.5:1 | pass |
| `text-muted` #5C5866 | `surface-2` #EFEDE8 | 5.90:1 | 4.5:1 | pass |
| `text-subtle` #6E6A76 | `surface` #FFFFFF | 5.27:1 | 4.5:1 | pass |
| `primary-fg` #FFFFFF | `primary` #5137D6 | 7.32:1 | 4.5:1 | pass |
| `primary` #5137D6 | `surface` #FFFFFF | 7.32:1 | 4.5:1 | pass |
| `primary` #5137D6 | `background` #F6F5F2 | 6.72:1 | 4.5:1 | pass |
| `accent-fg` #3A24A8 | `accent` #EDEAFB | 8.89:1 | 4.5:1 | pass |
| `signal` #A84C08 | `surface` #FFFFFF | 5.67:1 | 4.5:1 | pass |
| `signal` #A84C08 | `signal-bg` #FCEFD9 | 4.99:1 | 4.5:1 | pass |
| `destructive-fg` #FFFFFF | `destructive` #C0262D | 5.90:1 | 4.5:1 | pass |
| `destructive` #C0262D | `surface` #FFFFFF | 5.90:1 | 4.5:1 | pass |
| `border-strong` #8A847A | `surface` #FFFFFF | 3.71:1 | 3:1 | pass |
| `ring` #5137D6 | `surface` #FFFFFF | 7.32:1 | 3:1 | pass |
| `ring` #5137D6 | `background` #F6F5F2 | 6.72:1 | 3:1 | pass |
| `status-ok` #117538 | `status-ok-bg` #E3F4E8 | 5.07:1 | 4.5:1 | pass |
| `status-ok` #117538 | `surface` #FFFFFF | 5.79:1 | 4.5:1 | pass |
| `status-empty` #5C5866 | `status-empty-bg` #ECEAE6 | 5.74:1 | 4.5:1 | pass |
| `status-empty` #5C5866 | `surface` #FFFFFF | 6.90:1 | 4.5:1 | pass |
| `status-needs-input` #1F55C9 | `status-needs-input-bg` #E3ECFC | 5.52:1 | 4.5:1 | pass |
| `status-needs-input` #1F55C9 | `surface` #FFFFFF | 6.56:1 | 4.5:1 | pass |
| `status-partial` #8A5A00 | `status-partial-bg` #FAF0CF | 5.20:1 | 4.5:1 | pass |
| `status-partial` #8A5A00 | `surface` #FFFFFF | 5.93:1 | 4.5:1 | pass |
| `status-degraded` #B4470D | `status-degraded-bg` #FCE7D9 | 4.57:1 | 4.5:1 | pass |
| `status-degraded` #B4470D | `surface` #FFFFFF | 5.46:1 | 4.5:1 | pass |
| `status-error` #C0262D | `status-error-bg` #FBE4E4 | 4.87:1 | 4.5:1 | pass |
| `status-error` #C0262D | `surface` #FFFFFF | 5.90:1 | 4.5:1 | pass |
| `qloo` #0B6E66 | `qloo-bg` #E1F3F0 | 5.32:1 | 4.5:1 | pass |
| `qloo` #0B6E66 | `surface` #FFFFFF | 6.11:1 | 4.5:1 | pass |
| `text` #18171C | `qloo-bg` #E1F3F0 | 15.52:1 | 4.5:1 | pass |
| `qloo-border` #1C9488 | `surface` #FFFFFF | 3.72:1 | 3:1 | pass |
| `interp` #4A30C8 | `interp-bg` #EEEBFC | 7.03:1 | 4.5:1 | pass |
| `interp` #4A30C8 | `surface` #FFFFFF | 8.24:1 | 4.5:1 | pass |
| `text` #18171C | `interp-bg` #EEEBFC | 15.21:1 | 4.5:1 | pass |
| `interp-border` #7C68E6 | `surface` #FFFFFF | 4.22:1 | 3:1 | pass |
| `stretch` #A01F86 | `stretch-bg` #FBE5F5 | 5.81:1 | 4.5:1 | pass |
| `stretch` #A01F86 | `surface` #FFFFFF | 6.92:1 | 4.5:1 | pass |
| `chart-1` #5137D6 | `surface` #FFFFFF | 7.32:1 | 3:1 | pass |
| `chart-2` #0E8A7E | `surface` #FFFFFF | 4.24:1 | 3:1 | pass |
| `chart-3` #C26A00 | `surface` #FFFFFF | 3.92:1 | 3:1 | pass |
| `chart-4` #C2337A | `surface` #FFFFFF | 5.19:1 | 3:1 | pass |
| `chart-5` #2F6FDB | `surface` #FFFFFF | 4.75:1 | 3:1 | pass |
| `chart-6` #5E7F12 | `surface` #FFFFFF | 4.65:1 | 3:1 | pass |
| `text` #18171C | `accent` #EDEAFB | 15.08:1 | 4.5:1 | pass |
| `primary` #5137D6 | `surface-2` #EFEDE8 | 6.26:1 | 4.5:1 | pass |
| `text-muted` #5C5866 | `accent` #EDEAFB | 5.84:1 | 4.5:1 | pass |
| `signal` #A84C08 | `background` #F6F5F2 | 5.20:1 | 4.5:1 | pass |
| `text` #18171C | `signal-bg` #FCEFD9 | 15.69:1 | 4.5:1 | pass |
| `text` #18171C | `status-error-bg` #FBE4E4 | 14.70:1 | 4.5:1 | pass |
| `border-strong` #8A847A | `background` #F6F5F2 | 3.40:1 | 3:1 | pass |
| `chart-1` #5137D6 | `background` #F6F5F2 | 6.72:1 | 3:1 | pass |
| `chart-2` #0E8A7E | `background` #F6F5F2 | 3.89:1 | 3:1 | pass |
| `chart-3` #C26A00 | `background` #F6F5F2 | 3.60:1 | 3:1 | pass |
| `chart-4` #C2337A | `background` #F6F5F2 | 4.76:1 | 3:1 | pass |
| `chart-5` #2F6FDB | `background` #F6F5F2 | 4.36:1 | 3:1 | pass |
| `chart-6` #5E7F12 | `background` #F6F5F2 | 4.26:1 | 3:1 | pass |

#### dark

| Foreground | Background | Ratio | Needs | Result |
|---|---|---:|---:|---|
| `text` #ECEBF0 | `background` #0E0E12 | 16.24:1 | 4.5:1 | pass |
| `text` #ECEBF0 | `surface` #16161C | 15.19:1 | 4.5:1 | pass |
| `text` #ECEBF0 | `surface-2` #1E1E26 | 13.96:1 | 4.5:1 | pass |
| `text-muted` #A3A1AE | `background` #0E0E12 | 7.58:1 | 4.5:1 | pass |
| `text-muted` #A3A1AE | `surface` #16161C | 7.09:1 | 4.5:1 | pass |
| `text-muted` #A3A1AE | `surface-2` #1E1E26 | 6.51:1 | 4.5:1 | pass |
| `text-subtle` #8D8B98 | `surface` #16161C | 5.39:1 | 4.5:1 | pass |
| `primary-fg` #0E0E12 | `primary` #9D8CFF | 7.00:1 | 4.5:1 | pass |
| `primary` #9D8CFF | `surface` #16161C | 6.54:1 | 4.5:1 | pass |
| `primary` #9D8CFF | `background` #0E0E12 | 7.00:1 | 4.5:1 | pass |
| `accent-fg` #CFC6FF | `accent` #252240 | 9.54:1 | 4.5:1 | pass |
| `signal` #FFB547 | `surface` #16161C | 10.25:1 | 4.5:1 | pass |
| `signal` #FFB547 | `signal-bg` #33240D | 8.54:1 | 4.5:1 | pass |
| `destructive-fg` #0E0E12 | `destructive` #FF6B6B | 6.94:1 | 4.5:1 | pass |
| `destructive` #FF6B6B | `surface` #16161C | 6.49:1 | 4.5:1 | pass |
| `border-strong` #6C6C7A | `surface` #16161C | 3.49:1 | 3:1 | pass |
| `ring` #9D8CFF | `surface` #16161C | 6.54:1 | 3:1 | pass |
| `ring` #9D8CFF | `background` #0E0E12 | 7.00:1 | 3:1 | pass |
| `status-ok` #4ADE80 | `status-ok-bg` #10291A | 8.90:1 | 4.5:1 | pass |
| `status-ok` #4ADE80 | `surface` #16161C | 10.34:1 | 4.5:1 | pass |
| `status-empty` #A3A1AE | `status-empty-bg` #22222A | 6.21:1 | 4.5:1 | pass |
| `status-empty` #A3A1AE | `surface` #16161C | 7.09:1 | 4.5:1 | pass |
| `status-needs-input` #7AA7FF | `status-needs-input-bg` #14213D | 6.69:1 | 4.5:1 | pass |
| `status-needs-input` #7AA7FF | `surface` #16161C | 7.55:1 | 4.5:1 | pass |
| `status-partial` #F2C94C | `status-partial-bg` #2E2610 | 9.45:1 | 4.5:1 | pass |
| `status-partial` #F2C94C | `surface` #16161C | 11.35:1 | 4.5:1 | pass |
| `status-degraded` #FF9A5C | `status-degraded-bg` #33190D | 7.80:1 | 4.5:1 | pass |
| `status-degraded` #FF9A5C | `surface` #16161C | 8.60:1 | 4.5:1 | pass |
| `status-error` #FF6B6B | `status-error-bg` #361416 | 5.97:1 | 4.5:1 | pass |
| `status-error` #FF6B6B | `surface` #16161C | 6.49:1 | 4.5:1 | pass |
| `qloo` #5EE0CF | `qloo-bg` #0D2826 | 9.67:1 | 4.5:1 | pass |
| `qloo` #5EE0CF | `surface` #16161C | 11.19:1 | 4.5:1 | pass |
| `text` #ECEBF0 | `qloo-bg` #0D2826 | 13.13:1 | 4.5:1 | pass |
| `qloo-border` #2BA898 | `surface` #16161C | 6.14:1 | 3:1 | pass |
| `interp` #B9ADFF | `interp-bg` #1E1A3A | 8.29:1 | 4.5:1 | pass |
| `interp` #B9ADFF | `surface` #16161C | 8.99:1 | 4.5:1 | pass |
| `text` #ECEBF0 | `interp-bg` #1E1A3A | 14.01:1 | 4.5:1 | pass |
| `interp-border` #7E6CF0 | `surface` #16161C | 4.54:1 | 3:1 | pass |
| `stretch` #F58BDD | `stretch-bg` #3A1232 | 7.33:1 | 4.5:1 | pass |
| `stretch` #F58BDD | `surface` #16161C | 8.25:1 | 4.5:1 | pass |
| `chart-1` #9D8CFF | `surface` #16161C | 6.54:1 | 3:1 | pass |
| `chart-2` #2DD4BF | `surface` #16161C | 9.68:1 | 3:1 | pass |
| `chart-3` #FFB547 | `surface` #16161C | 10.25:1 | 3:1 | pass |
| `chart-4` #F472B6 | `surface` #16161C | 6.80:1 | 3:1 | pass |
| `chart-5` #60A5FA | `surface` #16161C | 7.09:1 | 3:1 | pass |
| `chart-6` #A3D94A | `surface` #16161C | 10.79:1 | 3:1 | pass |
| `text` #ECEBF0 | `accent` #252240 | 12.82:1 | 4.5:1 | pass |
| `primary` #9D8CFF | `surface-2` #1E1E26 | 6.01:1 | 4.5:1 | pass |
| `text-muted` #A3A1AE | `accent` #252240 | 5.98:1 | 4.5:1 | pass |
| `signal` #FFB547 | `background` #0E0E12 | 10.96:1 | 4.5:1 | pass |
| `text` #ECEBF0 | `signal-bg` #33240D | 12.66:1 | 4.5:1 | pass |
| `text` #ECEBF0 | `status-error-bg` #361416 | 13.96:1 | 4.5:1 | pass |
| `border-strong` #6C6C7A | `background` #0E0E12 | 3.73:1 | 3:1 | pass |
| `chart-1` #9D8CFF | `background` #0E0E12 | 7.00:1 | 3:1 | pass |
| `chart-2` #2DD4BF | `background` #0E0E12 | 10.35:1 | 3:1 | pass |
| `chart-3` #FFB547 | `background` #0E0E12 | 10.96:1 | 3:1 | pass |
| `chart-4` #F472B6 | `background` #0E0E12 | 7.27:1 | 3:1 | pass |
| `chart-5` #60A5FA | `background` #0E0E12 | 7.58:1 | 3:1 | pass |
| `chart-6` #A3D94A | `background` #0E0E12 | 11.54:1 | 3:1 | pass |

### 2.3 Ready-to-paste CSS (Tailwind v4 + shadcn naming)

Goes in `apps/web/app/globals.css` after `@import "tailwindcss";`. Dark mode is class-based
(`next-themes` with `attribute="class"`, `defaultTheme="system"`), so the screenshot script's
`colorScheme` emulation and the `theme` localStorage key both work.

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

:root {
  --radius: 0.5rem;

  --background: #F6F5F2;
  --foreground: #18171C;
  --card: #FFFFFF;
  --card-foreground: #18171C;
  --popover: #FFFFFF;
  --popover-foreground: #18171C;
  --primary: #5137D6;
  --primary-foreground: #FFFFFF;
  --secondary: #EFEDE8;
  --secondary-foreground: #18171C;
  --muted: #EFEDE8;
  --muted-foreground: #5C5866;
  --subtle-foreground: #6E6A76;
  --accent: #EDEAFB;
  --accent-foreground: #3A24A8;
  --destructive: #C0262D;
  --destructive-foreground: #FFFFFF;
  --border: #DEDAD2;
  --input: #8A847A;
  --ring: #5137D6;
  --surface-2: #EFEDE8;

  --signal: #A84C08;
  --signal-bg: #FCEFD9;

  --chart-1: #5137D6;
  --chart-2: #0E8A7E;
  --chart-3: #C26A00;
  --chart-4: #C2337A;
  --chart-5: #2F6FDB;
  --chart-6: #5E7F12;

  --status-ok: #117538;          --status-ok-bg: #E3F4E8;
  --status-empty: #5C5866;       --status-empty-bg: #ECEAE6;
  --status-needs-input: #1F55C9; --status-needs-input-bg: #E3ECFC;
  --status-partial: #8A5A00;     --status-partial-bg: #FAF0CF;
  --status-degraded: #B4470D;    --status-degraded-bg: #FCE7D9;
  --status-error: #C0262D;       --status-error-bg: #FBE4E4;

  --qloo: #0B6E66;   --qloo-bg: #E1F3F0;   --qloo-border: #1C9488;
  --interp: #4A30C8; --interp-bg: #EEEBFC; --interp-border: #7C68E6;
  --stretch: #A01F86; --stretch-bg: #FBE5F5;

  --sidebar: #FFFFFF;
  --sidebar-foreground: #18171C;
  --sidebar-primary: #5137D6;
  --sidebar-primary-foreground: #FFFFFF;
  --sidebar-accent: #EDEAFB;
  --sidebar-accent-foreground: #3A24A8;
  --sidebar-border: #DEDAD2;
  --sidebar-ring: #5137D6;

  --elev-1: 0 1px 2px rgb(24 23 28 / 0.06);
  --elev-2: 0 8px 24px -6px rgb(24 23 28 / 0.16), 0 2px 6px rgb(24 23 28 / 0.06);
  --elev-3: 0 24px 48px -12px rgb(24 23 28 / 0.24);
}

.dark {
  --background: #0E0E12;
  --foreground: #ECEBF0;
  --card: #16161C;
  --card-foreground: #ECEBF0;
  --popover: #16161C;
  --popover-foreground: #ECEBF0;
  --primary: #9D8CFF;
  --primary-foreground: #0E0E12;
  --secondary: #1E1E26;
  --secondary-foreground: #ECEBF0;
  --muted: #1E1E26;
  --muted-foreground: #A3A1AE;
  --subtle-foreground: #8D8B98;
  --accent: #252240;
  --accent-foreground: #CFC6FF;
  --destructive: #FF6B6B;
  --destructive-foreground: #0E0E12;
  --border: #2C2C36;
  --input: #6C6C7A;
  --ring: #9D8CFF;
  --surface-2: #1E1E26;

  --signal: #FFB547;
  --signal-bg: #33240D;

  --chart-1: #9D8CFF;
  --chart-2: #2DD4BF;
  --chart-3: #FFB547;
  --chart-4: #F472B6;
  --chart-5: #60A5FA;
  --chart-6: #A3D94A;

  --status-ok: #4ADE80;          --status-ok-bg: #10291A;
  --status-empty: #A3A1AE;       --status-empty-bg: #22222A;
  --status-needs-input: #7AA7FF; --status-needs-input-bg: #14213D;
  --status-partial: #F2C94C;     --status-partial-bg: #2E2610;
  --status-degraded: #FF9A5C;    --status-degraded-bg: #33190D;
  --status-error: #FF6B6B;       --status-error-bg: #361416;

  --qloo: #5EE0CF;   --qloo-bg: #0D2826;   --qloo-border: #2BA898;
  --interp: #B9ADFF; --interp-bg: #1E1A3A; --interp-border: #7E6CF0;
  --stretch: #F58BDD; --stretch-bg: #3A1232;

  --sidebar: #16161C;
  --sidebar-foreground: #ECEBF0;
  --sidebar-primary: #9D8CFF;
  --sidebar-primary-foreground: #0E0E12;
  --sidebar-accent: #252240;
  --sidebar-accent-foreground: #CFC6FF;
  --sidebar-border: #2C2C36;
  --sidebar-ring: #9D8CFF;

  /* dark: elevation is mostly the surface step + border; shadows only for overlays */
  --elev-1: 0 0 0 1px rgb(255 255 255 / 0.02);
  --elev-2: 0 8px 24px -6px rgb(0 0 0 / 0.6), inset 0 1px 0 rgb(255 255 255 / 0.04);
  --elev-3: 0 24px 48px -12px rgb(0 0 0 / 0.7), inset 0 1px 0 rgb(255 255 255 / 0.05);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-subtle-foreground: var(--subtle-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-surface-2: var(--surface-2);
  --color-signal: var(--signal);
  --color-signal-bg: var(--signal-bg);

  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-chart-6: var(--chart-6);

  --color-status-ok: var(--status-ok);
  --color-status-ok-bg: var(--status-ok-bg);
  --color-status-empty: var(--status-empty);
  --color-status-empty-bg: var(--status-empty-bg);
  --color-status-needs-input: var(--status-needs-input);
  --color-status-needs-input-bg: var(--status-needs-input-bg);
  --color-status-partial: var(--status-partial);
  --color-status-partial-bg: var(--status-partial-bg);
  --color-status-degraded: var(--status-degraded);
  --color-status-degraded-bg: var(--status-degraded-bg);
  --color-status-error: var(--status-error);
  --color-status-error-bg: var(--status-error-bg);

  --color-qloo: var(--qloo);
  --color-qloo-bg: var(--qloo-bg);
  --color-qloo-border: var(--qloo-border);
  --color-interp: var(--interp);
  --color-interp-bg: var(--interp-bg);
  --color-interp-border: var(--interp-border);
  --color-stretch: var(--stretch);
  --color-stretch-bg: var(--stretch-bg);

  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);

  --radius-sm: calc(var(--radius) - 4px);  /* 4px: chips inside rows, kbd */
  --radius-md: calc(var(--radius) - 2px);  /* 6px: buttons, inputs */
  --radius-lg: var(--radius);              /* 8px: cards, panes */
  --radius-xl: calc(var(--radius) + 4px);  /* 12px: sheets, dialogs */

  --shadow-1: var(--elev-1);
  --shadow-2: var(--elev-2);
  --shadow-3: var(--elev-3);

  --font-sans: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-geist-mono), ui-monospace, "SFMono-Regular", monospace;

  --text-display: 2.75rem;  --text-display--line-height: 3rem;     --text-display--letter-spacing: -0.03em;
  --text-h1: 1.5rem;        --text-h1--line-height: 2rem;          --text-h1--letter-spacing: -0.015em;
  --text-h2: 1.125rem;      --text-h2--line-height: 1.625rem;      --text-h2--letter-spacing: -0.01em;
  --text-h3: 0.9375rem;     --text-h3--line-height: 1.375rem;
  --text-body: 0.875rem;    --text-body--line-height: 1.25rem;
  --text-body-lg: 1rem;     --text-body-lg--line-height: 1.5rem;
  --text-small: 0.8125rem;  --text-small--line-height: 1.125rem;
  --text-label: 0.75rem;    --text-label--line-height: 1rem;       --text-label--letter-spacing: 0.06em;
  --text-kpi: 1.75rem;      --text-kpi--line-height: 2rem;         --text-kpi--letter-spacing: -0.02em;

  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --ease-enter: cubic-bezier(0, 0, 0.2, 1);
  --ease-exit: cubic-bezier(0.4, 0, 1, 1);
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);

  --animate-arrive: arrive 200ms var(--ease-enter) both;
  --animate-flash: flash 1200ms var(--ease-standard) both;
  --animate-live: live 1600ms ease-in-out infinite;

  @keyframes arrive { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  @keyframes flash  { from { box-shadow: 0 0 0 2px var(--signal); } to { box-shadow: 0 0 0 2px transparent; } }
  @keyframes live   { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
}

@layer base {
  * { @apply border-border outline-ring/50; }
  body { @apply bg-background text-foreground font-sans text-body antialiased; font-feature-settings: "cv11", "ss01"; }
  .tabular, td, [data-numeric] { font-variant-numeric: tabular-nums; }
  :focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
    scroll-behavior: auto !important;
  }
  .animate-live { animation: none; }
}
```

Utility usage examples: `bg-status-ok-bg text-status-ok`, `border-l-3 border-qloo-border bg-qloo-bg`,
`text-label uppercase text-muted-foreground`, `font-mono text-small tabular`, `shadow-2`.

## 3. Typography

Google Fonts via `next/font/google`: **Geist** (UI, variable 400–700) and **Geist Mono** (data,
IDs, timings, tool names, scores). One family pair keeps the console calm; no third display face.
Headline numerals on landing cards and the share page use Geist 600 at `display` size with
`tabular-nums` and tight tracking.

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `display` | 44 / 48 | 600, -0.03em | landing hero, share-page headline figure |
| `h1` | 24 / 32 | 600, -0.015em | show title in console header |
| `h2` | 18 / 26 | 600 | pane titles, slot name in timeline |
| `h3` | 15 / 22 | 600 | card titles, plan item title |
| `body` | 14 / 20 | 400 | console default |
| `body-lg` | 16 / 24 | 400 | landing, share page, briefing transcript |
| `small` | 13 / 18 | 400/500 | meta lines, table cells, trace rows |
| `label` | 12 / 16 | 500, +0.06em, uppercase | section labels, slot kicker ("DOORS · 18:30"), evidence block labels |
| `mono` | 12–13 / 16–18 | 400/500 | tool names (`qloo_find_tags`), entity IDs, ms timings, scores |
| `kpi` | 28 / 32 | 600, tabular | crowd read headline numbers |

Rules: minimum 12px anywhere; numbers in tables, trace timings and scores always `tabular-nums`;
truncate long entity names with `title` + tooltip, never wrap tool names; max line length 72ch in
transcript and share copy.

## 4. Spacing, radius, elevation

- **Spacing**: Tailwind's 4px scale. Allowed steps: 0.5 (2), 1 (4), 1.5 (6), 2 (8), 3 (12),
  4 (16), 5 (20), 6 (24), 8 (32), 10 (40), 12 (48), 16 (64).
  - Trace row: 32px tall, `px-3 gap-2`. Table/queue row: 36px. Plan item card: `p-3`, 12px gaps.
  - Pane padding `p-4` desktop, `p-3` mobile. Between cards in a lane: `gap-2`. Between sections: `gap-6`.
- **Radius**: base `--radius: 0.5rem`. `rounded-sm` 4 (chips in rows, kbd), `rounded-md` 6 (buttons,
  inputs, status chips), `rounded-lg` 8 (cards, panes), `rounded-xl` 12 (sheets, dialogs),
  `rounded-full` for pills (mode switch, filter chips, avatars, live dot).
- **Elevation** (prefer border + surface step; shadows only where things float):

| Level | Light | Dark | Used by |
|---|---|---|---|
| 0 | border only | border only | panes, cards in a pane |
| 1 `shadow-1` | 1px soft | 1px ring | raised card on page background (landing demo cards) |
| 2 `shadow-2` | 8px soft | 8px + top inner highlight | popover, dropdown, hover card, toast, sticky header on scroll |
| 3 `shadow-3` | 24px soft | 24px + highlight | sheet/drawer, dialog, command palette |

## 5. Motion

Motion is used to say "something changed", never as decoration.

| Token | Duration | Easing | Used for |
|---|---|---|---|
| instant | 80ms | standard | hover, press, toggle |
| fast | 140ms | standard | status chip colour change, tooltip, tab indicator |
| base | 200ms | enter / exit | trace row arrival, plan item arrival, accordion, toast |
| slow | 280ms | drawer | evidence sheet, mobile drawer, approval queue panel |
| deliberate | 400ms | enter | first chart draw only |

Where:

- **Trace streaming**: each new tool call row uses `animate-arrive` (fade + 4px rise). Only the
  in-flight row shows motion: a spinning `loader-circle` and a ticking mono timer. On completion
  the spinner swaps to the status icon with a 140ms colour crossfade; no bounce, no slide.
  The list stays pinned to the bottom while the user is at the bottom; if they scroll up, a
  "N new · Jump to latest" pill appears instead of yanking scroll.
- **Plan item arrival**: `animate-arrive` with a 40ms stagger (cap 8 items per batch), plus one
  `animate-flash` signal ring that fades over 1.2s so the eye finds it once.
- **Current slot**: a static `signal-bg` band and a 6px `signal` dot with `animate-live`
  (opacity pulse, 1.6s). This is the only infinite animation on the page.
- **Drawer/sheet**: 280ms `ease-drawer` slide; overlay fades 200ms. Closing is 200ms `ease-exit`.
- **Charts**: Recharts animates once on mount (400ms). During streaming updates set
  `isAnimationActive={false}` so bars do not jitter while the agent is still writing.
- **Briefing player**: the active transcript line gets the accent background; auto-scroll uses
  `scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" })`.
- **Skeletons**: static `bg-muted` blocks with a slow 1.6s opacity pulse; no shimmer sweep.

`prefers-reduced-motion: reduce`: all transforms removed, durations collapse to 1ms (CSS block
above), the live dot and skeleton pulse stop (the dot stays solid and the slot keeps its "NOW"
label), spinners are replaced by a static `loader` icon plus the text "Running", auto-scroll jumps
instead of smooth-scrolling, and Recharts animation is disabled everywhere. Read it in React with a
`usePrefersReducedMotion()` hook for the JS-driven cases.

## 6. Layout grid

Max content width 1600px; outer gutter 16px (mobile) / 24px (desktop). App shell = MOCK DATA banner
(32px, only in mock mode, full width, `signal-bg` with `signal` text and an icon) + top bar (56px:
logo, show switcher, health badge, theme toggle) + page.

**Desktop ≥1280px: the 3-pane console (`/shows/[id]`)**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ MOCK DATA banner (mock mode only)                                            │
│ Top bar · show header: title, mode chip, venue · city · date, LIVE/plan state │
│        Watch | Evidence switch · approval count · Export ▾ · Briefing ▸       │
├───────────────┬─────────────────────────────────────────┬────────────────────┤
│ TRACE  320px  │ CENTER (fluid, min 560)                 │ DRAWER  400px      │
│ resizable     │ entity confirm cards (when needs_input) │ evidence for the   │
│ 280–440       │ crowd read: 12-col grid of signal cards │ selected item, or  │
│ live tool     │ run-of-show timeline (slot lanes)       │ approval queue     │
│ calls,        │ limitations panel (collapsible)         │ when nothing is    │
│ sticky filter │                                         │ selected           │
└───────────────┴─────────────────────────────────────────┴────────────────────┘
```

- shadcn `ResizablePanelGroup` (trace | center | drawer). Each pane is its own `ScrollArea`; the
  header is sticky. The drawer is a real pane on desktop (not an overlay), so evidence and timeline
  are visible together.
- Center grid: 12 columns, 16px gap. Crowd read cards span 4/4/4 (≥1440) or 6/6 (1280–1439).

**Tablet 768–1279px**: two panes. Trace collapses to a 56px rail (status counts + a running
spinner); clicking opens it as a left `Sheet` (360px). Evidence and the queue open as a right `Sheet`
(420px) over the timeline. Crowd read cards span 6/6.

**Mobile <768px**: single column. Under the sticky show header, a sticky `Tabs` bar:
**Plan · Trace · Crowd · Queue (n)**. The latest tool call shows as a one-line ticker under the
header on every tab, so the agent's progress is never hidden. Evidence opens as a bottom `Drawer`
(vaul) at 90vh with a drag handle. Plan item actions become a 3-button row (44px targets). Crowd
cards stack full width.

Other pages: `/` and `/compare` use a 12-col container (max 1280); `/new` is a 2-col form
(form 8 cols + live summary 4 cols) that stacks on mobile; `/shows/[id]/share` is a single 720px
reading column; the eval rater is a 2-col split that becomes a swipeable A/B pair on mobile.

Touch targets ≥44px on touch layouts, ≥32px on desktop (rows 32–36px with full-row hit area).

## 7. Shared components

Built once in `apps/web/components/`, on shadcn primitives:

| Component | Built on | Spec |
|---|---|---|
| `StatusChip` | `Badge` (variant `outline`) | icon + label, `bg-status-*-bg text-status-*`, `rounded-md h-5 px-1.5 text-label`; `aria-label="Status: needs input"`; running state shows spinner + "Running" |
| `ConfidenceChip` | `Badge` + `Tooltip` | 3-bar meter glyph + "High/Med/Low" + score in mono (`0.82`); neutral colours (foreground bars), tooltip explains the inputs |
| `StretchBadge` | `Badge` | magenta pair, `sparkles` icon, label "Stretch"; one per section enforced in data, not UI |
| `EvidenceBlock` | `Card` | two stacked blocks: QLOO SAYS (teal border-l-3, mono values) / OUR INTERPRETATION (violet border-l-3, sans text); footer row: tool name (mono), status chip, latency, "View inputs" |
| `TraceRow` | `Collapsible` | 32px row: status icon · tool name (mono) · short summary (truncate) · duration (mono, right) · chevron; expands to inputs (IDs only) / result count / error + retry |
| `SlotLane` | `Card` + list | header: kicker `label` ("DOORS · 18:30") + slot name `h2` + item count; body: plan item cards; current slot gets `signal-bg` band + live dot |
| `PlanItemCard` | `Card`, `Button`, `ToggleGroup` | title `h3`, one-line why, chips row (category, confidence, stretch, status), action row Approve / Swap / Reject (icon + text), click opens evidence |
| `EntityConfirmCard` | `Card` + `RadioGroup` | "Which Genesis?" with 2–5 candidates (name, type, year/area, Qloo popularity), Confirm button; `needs_input` chip in header |
| `HealthBadge` | `Badge` + `HoverCard` | dot + "Qloo live"/"Qloo mock"/"Degraded"; hover lists `qloo_capabilities` result and last check time |
| `MockBanner` | `Alert` | full-width strip, `signal` colours, "MOCK DATA: Qloo responses are fixtures. Nothing here is measured." |
| `ModeSwitch` | `Tabs` (pill list) | Concert · Comedy · Sports · Festival with icons (`music`, `mic`, `trophy`, `tent`) |
| Charts | shadcn `ChartContainer` + Recharts | see crowd read below; `ChartTooltip` uses mono values; every chart has a `<figcaption>`-style text summary for screen readers |

## 8. Screen-by-screen plan

Every data view has the same four states: **loading** (skeleton shaped like the content),
**empty** (one sentence + the next action), **error** (`Alert` destructive, what failed, Retry,
and what still works), **partial/degraded** (content plus a `StatusChip` and a one-line note).

### `/` Landing

- Layout: top bar (logo, `HealthBadge`, theme toggle) · MockBanner (mock mode) · hero: `display`
  line, one sentence, primary CTA **Plan a new show** (`Button` lg) + secondary **Open a demo** ·
  grid of 3 demo show cards (concert, comedy night, football fixture) · a short "how it works"
  row of 3 steps (Intake → Agent trace → Approve & export) · footer.
- Demo card (`Card`, `shadow-1`, hover lifts to `shadow-2`): mode chip, show title `h3`, venue ·
  city · date, oversized doors time in `display`-size mono numerals, mini summary ("14 items ·
  3 need approval · 1 stretch"), status chip of the plan.
- States: loading = 3 card skeletons; empty (no seeds) = "No demo shows yet" + Plan a new show;
  error = alert above the grid, CTA still works; health badge shows `degraded` if capabilities fail.

### `/new` Event intake

- Layout: `Form` (react-hook-form + zod) in 8 cols, live "What the agent will do" summary card in
  4 cols (sticky) listing the Qloo tools it will call for this mode.
- Fields: `ModeSwitch` (Tabs) at top; Concert = headliner + support (`Command`-powered combobox
  with Qloo search, chips for multiple support acts); Comedy = headliner + openers; Sports = home
  team / away team comboboxes with a swap button; Festival = day name + stages (repeatable rows);
  venue (combobox), city, date (`Popover` + `Calendar`) and doors time (`Input type=time`),
  capacity tier (`RadioGroup` as segmented cards: <500 / 500–2k / 2k–10k / 10k+), house rules
  (`Textarea` + suggestion chips: "no pyro", "family-friendly", "alcohol-free zone").
- Submit = **Build run-of-show** (primary, full width on mobile) → navigates to `/shows/[id]` and
  streaming starts. Secondary: Save draft.
- States: field-level errors under inputs (`text-destructive text-small`, `aria-describedby`);
  combobox loading spinner inside the input; "No match on Qloo, keep as free text?" empty option;
  submit disabled with reason tooltip while required fields are missing; network error = toast +
  form keeps values.

### `/shows/[id]` Console

1. **Show header** (sticky): title `h1`, mode chip, venue · city · date · capacity, plan state
   chip (Building / Needs you / Ready / Approved), LIVE dot while the agent runs, Watch | Evidence
   `ToggleGroup` (Watch = trace + timeline focus; Evidence = drawer pinned open), approvals counter
   button, `DropdownMenu` Export ▾, Briefing ▸ button.
2. **Entity confirm cards**: shown at the top of center when any resolver call is `needs_input`;
   the matching trace row shows the same chip and "Waiting for you". Stack of `EntityConfirmCard`s;
   confirming resumes the agent (row turns `ok`).
3. **Live agent trace** (left pane): header with counts per status (chips act as filters), search
   input, `ScrollArea` of `TraceRow`s grouped by phase (Resolve · Crowd read · Programme · Critic),
   sticky group headers like match-centre league headers. Footer: total calls, total time, retry-all
   for retryable errors. States: before start = "Agent idle: start from the intake"; stream lost =
   inline alert "Reconnecting…" with last event time; error rows expand to message + Retry.
4. **Crowd read** (center, signal cards):
   - *Shared vs distinct affinities*: diverging horizontal bars, A left (`chart-1`) / B right
     (`chart-2`), shared tags centred in `chart-3`; top 10 tags; values labelled at bar ends.
   - *Demographic skew*: grouped bars by age band with a 0-baseline (index vs average = 100),
     single hue, value labels; gender skew as a 2-segment stacked bar.
   - *Taste tags*: chip cloud (`Badge` secondary) sorted by affinity, each with a tiny score; click
     filters plan items using that tag.
   - *Trend sparklines*: 4 small `LineChart`s (no axes, last value + delta in mono, area fill 10%).
   - Each card: `label` kicker, one `kpi` number, one chart, footer "Qloo: `tool_name` · status chip".
     States: skeleton bars; empty = "Qloo returned no affinities for this pair" + which entity to
     change; partial = chart plus `partial` chip.
5. **Run-of-show timeline** (center, below crowd read): vertical list of `SlotLane`s in show order
   (Doors → Walk-in → Opener → Interval → Headliner → After-party; Sports: Gates → Warm-up →
   Kick-off → Half-time → Full-time → Fan zone; Comedy: Doors → MC → Openers → Interval → Headliner
   → Bar; Festival: per stage, columns scroll horizontally on desktop). Each lane lists
   `PlanItemCard`s grouped by section (Playlist, Acts, Food & drink, Merch & sponsors, Local flavour)
   with the stretch item last in each section. Time on the left in mono, like a fixture list.
6. **Plan item actions**: Approve (primary ghost → filled check), Swap (`Popover` with 3 alternates,
   each with confidence), Reject (`AlertDialog` asking for a reason chip, optional). Keyboard:
   `a` / `s` / `r` on the focused card, `j` / `k` to move, `e` to open evidence.
7. **Approval queue** (right pane when nothing is selected; mobile tab): numbered list of pending
   items in slot order; each row shows the item, the reason it needs a human (stretch, low
   confidence, house-rule conflict, degraded source) and inline Approve/Reject. Gated steps: export
   buttons stay disabled with "Approve 3 items first" until the queue is empty or the GM clicks
   "Export with pending marked". Empty state: "Nothing waiting. Plan is ready to export."
8. **Evidence drawer** (right pane / `Sheet` / `Drawer`): title + item; `EvidenceBlock` (Qloo says vs
   Our interpretation); inputs table (param, value, entity IDs in mono with copy buttons); scores
   (affinity, popularity, rank) as small labelled bars; tool status + latency; "Why this slot"
   one-liner; links to the trace row (highlights and scrolls it). States: loading skeleton; missing
   evidence = destructive alert "This item has no Qloo citation and should have been removed"
   (it should never render, but the UI is defensive).
9. **Limitations panel**: `Collapsible` card at the end of center: data freshness, mock vs live,
   which calls were degraded/partial, what Qloo cannot tell us (e.g. no ticket sales data), each
   with a status chip. Collapsed by default when everything is `ok`; opens automatically otherwise.
10. **Exports** (`DropdownMenu`): PDF run-of-show, CSV (items + evidence columns), Copy share link
    (toast "Link copied"), Sponsor one-pager PDF. Each item shows a spinner while generating and a
    toast with a download link when done; failures toast with Retry.
11. **Pre-show audio briefing**: `Sheet` (desktop right, mobile bottom) with a player bar (play/pause
    `Button`, scrubber `Slider`, time in mono, speed 1×/1.25×/1.5×, download MP3) and the transcript
    below. Each line is a button-like row: timestamp (mono), sentence, a small evidence link icon;
    the current line is highlighted (accent bg); clicking a line seeks; the icon opens that line's
    evidence. States: generating ("Writing the briefing…" with trace link), TTS failed (transcript
    still shown, "Audio unavailable" alert), lines without evidence never render.

### `/compare` Tonight vs last night

- Top: two show pickers (`Select`, default = tonight + previous show at the same venue) with a swap
  button. Below: summary strip (items, approval rate, stretch count, crowd overlap %) as four
  KPI cards with delta chips.
- Body: two columns, slot rows aligned across both shows (same slot on the same row, like two
  fixture lists side by side); differences marked with a left border (`signal`) and "changed"/"new"
  /"dropped" labels. Crowd read: overlaid diverging bars (tonight solid, last night outline).
- Mobile: segmented control "Tonight | Last night | Diff" instead of two columns.
- States: only one show available = empty state with link to plan another; mismatched modes =
  warning that slot alignment is approximate.

### `/shows/[id]/share` Read-only plan

- Single 720px column, `body-lg`, no app chrome except a small header (logo, "Shared plan · read
  only", theme toggle). Headline figure (doors time) in `display`. Timeline as a clean list
  (slot → items), each item with a "?" `Popover` that shows the Qloo says / Our interpretation
  pair. Footer: generated time, mock/live label, limitations summary.
- Print stylesheet: light theme forced, no shadows, slot lanes avoid page breaks.
- States: expired/unknown id = 404 page with "Ask the GM for a new link"; still building =
  "This plan is still being built" + auto-refresh.

### Eval rater (`/eval`)

- Header: progress (`Progress` + "12 / 30"), instructions `Collapsible`, rater id (anonymous).
- Body: plan **A** | plan **B** side by side (order randomised, labels only A/B, no model names),
  slot rows aligned; per slot a `RadioGroup` "A better / Tie / B better" in the gutter between the
  columns. Footer: overall rating 1–5 (`ToggleGroup` of 5 numbered buttons with text anchors
  "1 Poor … 5 Excellent"), optional comment, Submit & next.
- Keyboard: `1`/`2`/`3` for A/Tie/B on the focused slot, `↑`/`↓` to move slots, `Enter` to submit.
- Mobile: A and B as two tabs with a sticky per-slot choice bar.
- States: loading pair skeleton; no more pairs = thank-you screen; submit error keeps choices and
  retries.

## 9. Accessibility checklist (applies to every screen)

- All text pairs above pass AA; nothing renders below 12px, and muted text is never placed on a status-tinted background.
- Status, confidence, stretch and Qloo/interpretation are never colour-only: icon + text label.
- Live trace region: `role="log"` with `aria-live="polite"`, announcing only completed calls
  ("qloo_find_tags ok, 12 results"), throttled to one announcement per 2s.
- Every chart has a visually hidden table or sentence summary.
- Focus is visible (2px ring + offset) and trapped in sheets/dialogs; Escape closes; focus returns
  to the trigger.
- Keyboard shortcuts are listed in a `?` dialog and never steal focus from inputs.


## Addendum (30 Oct 2026): "Signal" for the landing page

The console stays the quiet ops console above. The landing page follows the reference the team chose from the Awwwards round, unbelievablycrap.com (`refs-awwwards/unbelievably-crap.jpg`, full scroll in `refs-awwwards/unbelievably-crap-full-*.jpg`): a black HUD, a white dossier, a red ending. An earlier, multi-colour "House lights" version was judged too much and replaced.

- **Colour.** Black #0A0A0A, paper #F1F1F1, status-bar grey #393939, one red (#E8271C for marks, #F0140F for fills, #C8160D for red text on paper). The only other colour is a faint RGB fringe in the 3D figure's scanlines. Ink on red is black (≥ 4.5:1).
- **Type.** Saira Condensed (bold, uppercase) for display; Geist Mono at 10.5–11.5 px uppercase for HUD labels; Doto (dot matrix) for the big rotated numerals; Geist for body copy.
- **Hero (black).** A point-cloud figure built from body primitives, with scanlines and one red scan line, turning towards the pointer. HUD around it: a minimap with live pointer X/Y, the Qloo tools the seeded plan cited with counts, venue coordinates, protocol counters, the MOCK DATA notice. Scrolling reveals two narrative columns, then the figure crumbles point by point into a crowd of tiny figures: *one figure is never the point; Qloo reads the crowd* (our twist on the reference, and the safe-use rule in one image).
- **Dossier (paper).** A line-art head; two red bars that start as a cross, swing onto the shoulders and close into a "locked" bar; dot-matrix numerals (the plan's pick count) sliding past; the crowd's Qloo tags and their mirror inside the head; the five steps as bracketed HUD cards; a closing scramble: *We read crowds. Never people.*
- **The record (black)** and **the index (paper)**: one cited pick, the Without Qloo numbers in dot-matrix digits, Qloo's role, the sponsor one-pager, an Ask answer; then the four demo shows as an index that inverts on hover.
- **Flood and finale (red).** A stepped red horizon rises into the final band: the closing headline, a black panel with a breathing red ellipse and a waveform, the nav, and the four safety principles. A fixed grey status bar (links, Qloo mode, GMT offset, live clock, "Plan a show +") runs across the page.
- **Budget.** Dot fields are a 2D canvas drawn every 120 ms on desktop and once on phones; the WebGL figure loads after idle on desktop only (phones get a dotted silhouette). Lighthouse on the production build: 100 / 100 / 100 desktop, 93 / 100 / 100 mobile.

### App pages (30 Oct 2026)

The console, intake, compare, rating and share pages keep their layout and fonts (Geist, Geist Mono, Saira Condensed titles) and take a light version of the landing's language:

- **Colour.** Paper #F1F1F1 / near-black #0A0A0A canvases; primary actions in ink (paper-white in dark); signal red for focus rings, selected states and the live indicator (#E8271C for marks; #B3170E / #FF8A80 for red text, ≥ 5.8:1). Chart, status and evidence colours are unchanged because they carry meaning.
- **Texture.** A faint 14 px dot grid behind the app; cards stay solid.
- **Art.** 9×9 pixel glyphs per mode (a beamed note, a mic on a stand, a ball, a tent with a flag), each with one red pixel, in mode chips, the intake picker and the console header; section labels carry a red "//"; the header has a short red tick on its bottom edge.

### Mark, ink chrome and Run the night (30 Oct 2026)

- **Mark.** A 9×9 dot-matrix house on an ink tile whose inside is an EQ meter (three bars), with one red pixel at the peak (`design/brand/`, `apps/web/app/icon.svg`, `apple-icon.png`). Used in the browser tab, both headers, the landing status bar and the PDF exports; the grid lives in `packages/shared/src/brand.ts`.
- **Ink chrome.** The app header and the console's trace pane are ink HUD surfaces in both themes (the `dark` token scope on just those subtrees, so every pair inside them keeps its validated dark-mode contrast), with a red tick under the header.
- **Run the night.** A dark show-control view in the landing's Signal language: dot-matrix clock, a timeline with a red playhead, a dot-matrix visualizer, a crew cue sheet by role, and a full-screen venue display in black with Saira type.
