"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "motion/react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import evalSummary from "@/lib/eval-summary.json";
import { BRAND_MARK, type Show } from "@housemix/shared";
import { cn } from "cn";
import type { ShowSummary } from "@/lib/api";
import { sponsorUrl } from "@/lib/api";
import { useHealth, useMediaQuery } from "@/lib/hooks";
import { BrandMark } from "@/components/brand-mark";
import { DotField } from "./dots";

const FigureScene = dynamic(() => import("./figure-scene"), { ssr: false });

/* ------------------------------------------------------------------ HUD primitives */

function Hud({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("hud", className)}>{children}</div>;
}

function Brackets({ className }: { className?: string }) {
  const c = "absolute size-2.5 border-current";
  return (
    <span className={cn("pointer-events-none absolute inset-0", className)} aria-hidden>
      <span className={cn(c, "left-0 top-0 border-l border-t")} />
      <span className={cn(c, "right-0 top-0 border-r border-t")} />
      <span className={cn(c, "bottom-0 left-0 border-b border-l")} />
      <span className={cn(c, "bottom-0 right-0 border-b border-r")} />
    </span>
  );
}

function Plus() {
  return <span className="ml-1 opacity-70">+</span>;
}

function useClock() {
  const [now, setNow] = useState<Date>();
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function gmt(d: Date) {
  const m = -d.getTimezoneOffset();
  const h = Math.trunc(m / 60);
  const r = Math.abs(m % 60);
  return `GMT${h >= 0 ? "+" : "−"}${Math.abs(h)}${r ? `:${String(r).padStart(2, "0")}` : ""}`;
}

/* ------------------------------------------------------------------ status bar */

export function StatusBar() {
  const now = useClock();
  const { health } = useHealth();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <nav aria-label="Site" className="hud fixed inset-x-0 bottom-0 z-50 flex h-8 items-center gap-3 whitespace-nowrap bg-sig-grey px-3 text-[11px] text-[#D9D9D9] sm:gap-4">
      <Link href="/" className="flex items-center gap-1.5 font-semibold text-white">
        <BrandMark className="size-4" />
        House Mix
        <Plus />
      </Link>
      <Link href="/new" className="hover:text-white">
        Plan
        <Plus />
      </Link>
      <Link href="/compare" className="hidden hover:text-white sm:inline">
        Compare
        <Plus />
      </Link>
      <Link href="/rate" className="hidden hover:text-white sm:inline">
        Rate
        <Plus />
      </Link>
      <span className="ml-auto hidden items-center gap-1.5 md:flex">
        <span className={cn("size-1.5", health?.qlooMode === "live" ? "bg-[#3BD16F]" : "bg-sig-red")} aria-hidden />
        Qloo {health ? health.qlooMode : "…"}
      </span>
      <button type="button" onClick={() => setTheme(dark ? "light" : "dark")} className="flex items-center gap-1.5 hover:text-white" title={`Switch the app to the ${dark ? "light" : "dark"} theme`}>
        {dark ? <Moon className="size-3" aria-hidden /> : <Sun className="size-3" aria-hidden />}
        <span suppressHydrationWarning>{now ? gmt(now) : "GMT"}</span>
        <span className="sr-only"> · switch the app to the {dark ? "light" : "dark"} theme</span>
      </button>
      <span className="hidden items-center gap-1.5 tabular sm:flex" suppressHydrationWarning>
        <span className="size-1.5 bg-sig-red" aria-hidden />
        {now ? now.toLocaleTimeString("en-GB") : "--:--:--"}
      </span>
      <Link href="/new" className="flex h-6 items-center bg-white px-2.5 font-semibold text-sig-black hover:bg-sig-paper">
        Plan a show
        <Plus />
      </Link>
    </nav>
  );
}

/* ------------------------------------------------------------------ hero: the aggregate figure */

const LEFT_LINES = [
  "Case file: tonight's crowd.",
  "Not a person. Never a person.",
  "A crowd is what a lineup draws:",
  "the people who love the headliner,",
  "the ones who came for the support,",
  "home fans and away fans,",
  "and everything they share.",
  "Qloo knows that shape.",
  "In aggregate. Across music, film,",
  "brands, food and places.",
  "House Mix asks it, call by call.",
];
const RIGHT_LINES = [
  "The planner sends five agents.",
  "One reads the crowd.",
  "One per slot programs the night:",
  "walk-in, openers, food, sponsors, after-party.",
  "One finds the stretch pick.",
  "Every pick cites the Qloo call it came from.",
  "A critic cuts whatever the data doesn't say.",
  "An ambiguous name stops everything",
  "until you choose.",
  "You approve. You lock. You brief the crew.",
  "Doors at 18:30.",
];

function useIdle() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (window.innerWidth < 768) return;
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) ric(() => setOk(true), { timeout: 1500 });
    else setTimeout(() => setOk(true), 600);
  }, []);
  return ok;
}

function Minimap() {
  const [xy, setXy] = useState<[number, number]>([1299, 259]);
  useEffect(() => {
    const move = (e: PointerEvent) => setXy([Math.round(e.clientX), Math.round(e.clientY)]);
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, []);
  return (
    <div className="relative h-[150px] w-[290px] border border-white/10 [background-image:radial-gradient(rgba(255,255,255,0.09)_1px,transparent_1px)] [background-size:5px_5px]">
      <span className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2">
        <svg width="12" height="32" viewBox="0 0 12 32" aria-hidden>
          <circle cx="6" cy="4" r="3.2" fill="#F1F1F1" />
          <path d="M2 9h8l1 11h-2l-.5 11h-2V21h-1v10h-2L3 20H1z" fill="#F1F1F1" />
        </svg>
      </span>
      <span className="absolute right-[18%] top-[24%] size-1.5 animate-blink bg-sig-red" aria-hidden />
      <Hud className="absolute bottom-1.5 left-1.5 bg-white px-1.5 py-0.5 text-sig-black tabular">X {xy[0]}</Hud>
      <Hud className="absolute bottom-1.5 right-1.5 bg-white px-1.5 py-0.5 text-sig-black tabular">Y {xy[1]}</Hud>
    </div>
  );
}

export function SignalHero({ show }: { show?: Show }) {
  const reduce = Boolean(useReducedMotion());
  const idle = useIdle();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  // Progress of the dissolve into the crowd, read every frame by the 3D scene.
  const disperse = useRef(0);
  const headOpacity = useTransform(scrollYProgress, [0, 0.18], [1, 0]);
  const headY = useTransform(scrollYProgress, [0, 0.18], [0, -40]);
  const [lines, setLines] = useState(0);
  const [end, setEnd] = useState(false);
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    setLines(Math.max(0, Math.min(LEFT_LINES.length, Math.round((p - 0.12) * 26))));
    setEnd(p > 0.82);
    disperse.current = Math.max(0, Math.min(1, (p - 0.45) / 0.45));
  });
  const tools = useMemo(() => {
    const counts = new Map<string, number>();
    const seen = new Set<string>();
    const all = [...(show?.plan?.crowd.evidence ?? []), ...(show?.plan?.slots ?? []).flatMap((s) => s.items.flatMap((i) => i.evidence))];
    for (const e of all) {
      if (seen.has(e.callId)) continue;
      seen.add(e.callId);
      counts.set(e.tool, (counts.get(e.tool) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [show]);
  const picks = show?.plan?.slots.reduce((n, s) => n + s.items.length, 0) ?? 0;
  // On phones the hero is one screen tall and doesn't pin, so the scroll-linked fade is desktop only.
  const desktop = useMediaQuery("(min-width: 768px)");

  return (
    <section ref={ref} aria-labelledby="hero-title" className="sig-black relative md:h-[230vh]">
      <div className="relative min-h-svh overflow-hidden md:sticky md:top-0 md:h-svh">
        <DotField color="#2B2B2B" step={5} seed={11} rise={0.42} />
        <div className="absolute inset-0">{idle ? <FigureScene disperse={disperse} reduced={reduce} /> : null}</div>
        {/* Phones: a dotted silhouette instead of the WebGL figure */}
        <svg viewBox="0 0 12 32" className="absolute left-1/2 top-[7%] h-[34%] -translate-x-1/2 md:hidden" aria-hidden>
          <defs>
            <pattern id="hm-dots" width="0.5" height="0.5" patternUnits="userSpaceOnUse">
              <rect width="0.24" height="0.24" fill="#CFCFCF" />
            </pattern>
          </defs>
          <circle cx="6" cy="4" r="3.2" fill="url(#hm-dots)" />
          <path d="M2 9h8l1 11h-2l-.5 11h-2V21h-1v10h-2L3 20H1z" fill="url(#hm-dots)" />
          <rect x="0" y="14" width="12" height="0.35" fill="#E8271C" className="animate-blink" />
        </svg>

        {/* HUD: top left */}
        <div className="absolute left-3 top-3 hidden md:block">
          <Minimap />
          <div className="mt-2 flex w-[290px] justify-between">
            <Hud>
              <span className="text-sig-mid">// </span>Crowd detected
              <br />
              Aggregate only <span className="text-sig-mid">//</span>
            </Hud>
            <Hud className="text-right">
              No person tracked
              <br />
              <span className="text-sig-mid">// </span>Ever
            </Hud>
          </div>
        </div>

        {/* HUD: top right, the Qloo tools this seeded plan actually called */}
        <div className="absolute right-3 top-3 hidden w-[290px] md:block">
          <Hud className="flex justify-between border-y border-white/10 bg-white/[0.04] px-2 py-1 text-sig-mid">
            <span>Agent</span>
            <span>//</span>
            <span>Taste</span>
            <span>//</span>
            <span>Evidence</span>
          </Hud>
          <ul className="mt-3 grid gap-0.5" aria-label="Qloo calls cited by a seeded plan, per tool">
            {tools.map(([t, n], i) => (
              <li key={t} className={cn("hud flex justify-between", i > 5 ? "text-sig-mid" : "")}>
                <span>{t}</span>
                <span className="tabular">×{n}</span>
              </li>
            ))}
          </ul>
          <Hud className="mt-1 flex justify-between text-sig-mid">
            <span>[{tools.length}] tools cited</span>
            <span>in total</span>
          </Hud>
        </div>

        <Hud className="absolute left-3 top-[42%] hidden text-sig-mid md:block">// 34.1122°N</Hud>
        <Hud className="absolute right-3 top-[42%] hidden text-sig-mid md:block">118.3391°W //</Hud>

        {/* Narrative columns around the figure */}
        <div className="pointer-events-none absolute inset-x-0 top-[21%] hidden justify-center gap-[280px] md:flex" aria-hidden={lines === 0}>
          <ul className="grid w-[300px] justify-items-end gap-1 text-right">
            {LEFT_LINES.map((l, i) => (
              <li key={l} className={cn("hud text-[11.5px] transition-opacity duration-300", i < lines ? "opacity-100" : "opacity-0")}>
                {l}
              </li>
            ))}
          </ul>
          <ul className="grid w-[300px] gap-1">
            {RIGHT_LINES.map((l, i) => (
              <li key={l} className={cn("hud text-[11.5px] transition-opacity duration-300", i < lines ? "opacity-100" : "opacity-0")}>
                {l}
              </li>
            ))}
          </ul>
        </div>

        {/* Headline */}
        <motion.div
          style={desktop ? { opacity: headOpacity, y: headY } : undefined}
          className="absolute inset-x-3 bottom-14 md:bottom-16 md:left-[min(5vw,64px)] md:right-auto md:max-w-[min(640px,44vw)]"
        >
          <Hud className="mb-4 flex flex-wrap items-center gap-2 text-sig-mid">
            <span className="size-1.5 animate-blink bg-sig-red" aria-hidden />
            <span className="text-white">House Mix</span> // crowd programming for venues, restaurants, promoters and sponsors
          </Hud>
          <h1 id="hero-title" className="font-display text-[clamp(2.7rem,4.9vw,4.9rem)] font-bold uppercase leading-[0.88] tracking-[-0.01em]">
            <span className="block overflow-hidden">
              <span className="sig-rise block">Program the night</span>
            </span>
            <span className="block overflow-hidden">
              <span className="sig-rise block" style={{ animationDelay: "0.1s" }}>
                for the crowd that&apos;s
              </span>
            </span>
            <span className="block overflow-hidden">
              <span className="sig-rise block" style={{ animationDelay: "0.2s" }}>
                coming<span className="text-sig-red">.</span>
              </span>
            </span>
          </h1>
          <p className="mt-5 max-w-[54ch] text-[15px] leading-relaxed text-[#BDBDBD]">
            Give House Mix tonight&apos;s bill and city. Claude agents read the crowd with Qloo taste data and program the walk-in music, openers, food and drink, sponsor activations and the
            after-party, with the Qloo evidence behind every pick.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/new" className="hud flex h-10 items-center bg-white px-4 text-[12px] font-semibold text-sig-black hover:bg-sig-red hover:text-sig-black">
              Plan a show
              <Plus />
            </Link>
            <Link href="/shows/seed-concert" className="hud flex h-10 items-center border border-white/40 px-4 text-[12px] font-semibold hover:border-white">
              Open a finished plan
              <Plus />
            </Link>
          </div>
        </motion.div>

        {/* HUD: bottom right */}
        <div className="absolute bottom-12 right-3 hidden text-right md:block">
          <Hud className="grid grid-cols-[auto_auto] gap-x-6 gap-y-0.5">
            <span className="text-sig-mid">Protocol</span>
            <span className="tabular">{String(picks || 26).padStart(5, "0")}</span>
            <span className="text-sig-mid">Picks</span>
            <span>All cited</span>
            <span className="text-sig-mid">2026</span>
            <span>// Doors 18:30</span>
          </Hud>
          {show?.qlooMode === "mock" ? <Hud className="mt-3 inline-block border border-sig-red px-1.5 py-0.5 text-[#FF6B60]">Mock data // fictional Qloo fixtures until the live key</Hud> : null}
        </div>

        <motion.p initial={false} animate={{ opacity: end ? 1 : 0 }} className="pointer-events-none absolute inset-x-0 bottom-16 hidden text-center md:block">
          <span className="font-display text-[clamp(1.6rem,2.8vw,2.6rem)] font-bold uppercase">
            One figure is never the point<span className="text-sig-red">.</span> Qloo reads the crowd<span className="text-sig-red">.</span>
          </span>
        </motion.p>
        <Hud className="absolute bottom-10 right-1/2 hidden translate-x-1/2 text-sig-mid md:block">{end ? "" : "Scroll"}</Hud>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ dossier: how it works */

const STEPS = [
  { n: "01", t: "Resolve", b: "Every name becomes a confirmed Qloo ID. An ambiguous one stops and asks you; nothing is auto-picked.", q: "describe · find_tags" },
  {
    n: "02",
    t: "Read the crowd",
    b: "Shared and distinct taste between the two sides, aggregate age skew, the crowd's vocabulary and momentum.",
    q: "compare_audiences · audience_demographics · entity_tags · trends",
  },
  { n: "03", t: "Program", b: "One agent per slot: walk-in, openers, food and drink, sponsor activations, after-party, plus a stretch pick.", q: "recommend · rank · where_popular" },
  { n: "04", t: "Cut", b: "The Critic removes any pick or sentence the cited Qloo call doesn't support. The trace shows why.", q: "call ledger" },
  { n: "05", t: "Lock", b: "Approve, swap or reject line by line. Lock a version, export the run-of-show, brief the crew.", q: "rank (swap) · briefing" },
];

function Scramble({ text, run }: { text: string; run: boolean }) {
  const [out, setOut] = useState(text.replace(/[^ ]/g, " "));
  useEffect(() => {
    if (!run) return;
    const glyphs = "#%&/+*01ABCDEFXYZ";
    let f = 0;
    const id = setInterval(() => {
      f++;
      setOut(
        text
          .split("")
          .map((ch, i) => (ch === " " ? " " : i < f / 2 ? ch : glyphs[Math.floor(Math.random() * glyphs.length)]))
          .join(""),
      );
      if (f / 2 > text.length) clearInterval(id);
    }, 28);
    return () => clearInterval(id);
  }, [run, text]);
  return <span aria-label={text}>{run ? out : ""}</span>;
}

/** An outlined limb: a thick grey stroke under a slightly thinner paper stroke. */
function Limb({ d, w = 34 }: { d: string; w?: number }) {
  return (
    <>
      <path d={d} fill="none" stroke="#B3B3B3" strokeWidth={w} strokeLinecap="round" />
      <path d={d} fill="none" stroke="#FAFAFA" strokeWidth={w - 3} strokeLinecap="round" />
    </>
  );
}

/** One turntable seen from the front: platter, label and a marker that circles as the record spins. */
function Deck({ cx, flip }: { cx: number; flip?: boolean }) {
  const ring = `M${cx - 92} 616 a92 14 0 1 0 184 0 a92 14 0 1 0 -184 0`;
  return (
    <g>
      <ellipse cx={cx} cy={618} rx={118} ry={19} fill="#EDEDED" stroke="#B3B3B3" strokeWidth="1.5" />
      <ellipse cx={cx} cy={616} rx={96} ry={15} fill="#151515" />
      {[80, 64, 48].map((r) => (
        <ellipse key={r} cx={cx} cy={616} rx={r} ry={r * 0.155} fill="none" stroke="#3A3A3A" strokeWidth="1" />
      ))}
      <ellipse cx={cx} cy={616} rx={24} ry={4.2} fill="#6A3DF5" />
      <circle r="3.2" fill="#FAFAFA">
        <animateMotion dur={flip ? "1.9s" : "1.8s"} repeatCount="indefinite" path={ring} />
      </circle>
      <path d={flip ? `M${cx - 104} 604 L${cx - 58} 612` : `M${cx + 104} 604 L${cx + 58} 612`} stroke="#0A0A0A" strokeWidth="3" strokeLinecap="round" />
    </g>
  );
}

/** The DJ at the decks, in the same thin line style as the rest of the page. */
function DjBooth() {
  return (
    <svg viewBox="0 0 800 900" preserveAspectRatio="xMidYMax meet" className="absolute inset-x-0 bottom-0 mx-auto h-[92%]" aria-hidden>
      {/* DJ: head and shoulders behind the booth */}
      <path
        d="M150 640 C160 560 240 505 330 492 C346 489 352 470 350 448 L348 420 C320 402 304 368 300 330 C290 250 330 170 400 170 C470 170 510 250 500 330 C496 368 480 402 452 420 L450 448 C448 470 454 489 470 492 C560 505 640 560 650 640 Z"
        fill="#FAFAFA"
        stroke="#B3B3B3"
        strokeWidth="1.5"
      />
      {/* headphones: band over the head, one cup on, one held off the ear */}
      <path d="M314 292 C310 182 490 182 486 292" fill="none" stroke="#0A0A0A" strokeWidth="9" strokeLinecap="round" />
      <rect x="292" y="266" width="34" height="64" rx="13" fill="#0A0A0A" />
      <rect x="298" y="276" width="22" height="44" rx="9" fill="#6A3DF5" />
      <rect x="492" y="250" width="34" height="64" rx="13" fill="#0A0A0A" transform="rotate(14 509 282)" />
      {/* right arm up, hand on the loose cup; left arm down to the deck */}
      <Limb d="M590 560 C640 500 610 410 548 318" />
      <circle cx="540" cy="306" r="20" fill="#FAFAFA" stroke="#B3B3B3" strokeWidth="1.5" />
      <Limb d="M250 548 C205 575 188 600 196 616" w={30} />
      {/* the booth */}
      <path d="M70 640 L120 598 L680 598 L730 640 Z" fill="#FFFFFF" stroke="#B3B3B3" strokeWidth="1.5" />
      <Deck cx={238} />
      <Deck cx={562} flip />
      <rect x="352" y="600" width="96" height="30" rx="4" fill="#151515" />
      {[368, 388, 408, 428].map((x, i) => (
        <circle key={x} cx={x} cy={611} r="4" fill={i === 1 ? "#6A3DF5" : "#5A5A5A"} />
      ))}
      <rect x="364" y="620" width="72" height="3" rx="1.5" fill="#6A3DF5" />
      <circle cx="196" cy="616" r="15" fill="#FAFAFA" stroke="#B3B3B3" strokeWidth="1.5" />
      <rect x="70" y="640" width="660" height="260" fill="#FAFAFA" stroke="#B3B3B3" strokeWidth="1.5" />
      <line x1="70" y1="652" x2="730" y2="652" stroke="#D4D4D4" />
      {/* the mark on the booth front */}
      {BRAND_MARK.flatMap((row, y) =>
        row.split("").map((c, x) => (c === "." ? null : <rect key={`${x}-${y}`} x={381 + x * 4.4} y={668 + y * 4.4} width="3.6" height="3.6" fill={c === "R" ? "#E8271C" : "#0A0A0A"} />)),
      )}
    </svg>
  );
}

export function Dossier({ show }: { show?: Show }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  // Two violet beams from the lighting truss sweep the room as you scroll, then both land on the DJ.
  const beamL = useTransform(scrollYProgress, [0, 0.45, 0.9], [38, -18, -9]);
  const beamR = useTransform(scrollYProgress, [0, 0.45, 0.9], [-38, 18, 9]);
  const beamO = useTransform(scrollYProgress, [0, 0.15, 0.9, 1], [0.5, 0.85, 1, 1]);
  const numX = useTransform(scrollYProgress, [0, 0.55, 1], ["-150%", "36%", "36%"]);
  const [step, setStep] = useState(-1);
  const [claim, setClaim] = useState(false);
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    setStep(Math.min(STEPS.length - 1, Math.floor(p * 6.2) - 1));
    setClaim(p > 0.9);
  });
  const tags = [...new Set([...(show?.plan?.crowd.tags ?? []).map((t) => t.name), ...(show?.plan?.crowd.compare ?? []).map((c) => c.name)])].slice(0, 6);
  const picks = show?.plan?.slots.reduce((n, s) => n + s.items.length, 0) ?? 26;
  const beam = "absolute top-[7%] h-[78%] w-[24vw] origin-top [clip-path:polygon(46%_0,54%_0,100%_100%,0_100%)] [background:linear-gradient(to_bottom,rgba(106,61,245,0.55),rgba(106,61,245,0.06))]";

  return (
    <section ref={ref} aria-labelledby="how-title" className="sig-paper relative md:h-[340vh]">
      <div className="relative overflow-hidden md:sticky md:top-0 md:h-svh">
        <DotField color="#C9C2E6" step={5} seed={3} rise={0.38} className="hidden md:block" />
        <Hud className="absolute left-3 top-3 hidden md:block">
          Venue GMs
          <br />
          Restaurants & bars
          <br />
          Promoters // sponsors
        </Hud>
        <Hud className="absolute right-3 top-3 hidden text-right md:block">
          Concert // Comedy
          <br />
          Sports // Festival
          <br />
          Dining // five modes
        </Hud>

        {/* Desktop: the truss, the beams, the DJ, the steps */}
        <div className="absolute inset-0 hidden md:block" aria-hidden>
          <div className="absolute left-1/2 top-[5%] flex h-3 w-[54%] -translate-x-1/2 items-center justify-between rounded-sm bg-sig-violet-ink px-[6%]">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span key={i} className={cn("size-2 rounded-full", i === 1 || i === 4 ? "bg-white" : "bg-sig-lilac/60")} />
            ))}
          </div>
          <motion.div className={cn(beam, "left-[calc(50%-27%+3%)] -translate-x-1/2")} style={{ rotate: beamL, opacity: beamO }} />
          <motion.div className={cn(beam, "right-[calc(50%-27%+3%)] translate-x-1/2")} style={{ rotate: beamR, opacity: beamO }} />
          <DjBooth />
          <motion.div className="absolute left-1/2 top-[38%] font-dot text-[clamp(4rem,9vw,8.5rem)] font-black leading-none text-sig-black" style={{ x: numX, rotate: 90 }}>
            {String(picks).padStart(4, "0")}
          </motion.div>
          {/* The crowd's taste vocabulary on the booth front, and its reflection in the glossy panel */}
          <div className="absolute bottom-[4%] left-1/2 flex -translate-x-1/2 gap-16">
            <ul className="grid justify-items-end gap-0.5">
              {tags.map((t) => (
                <li key={t} className="hud text-[10px]">
                  {t}
                </li>
              ))}
            </ul>
            <ul className="grid -scale-x-100 gap-0.5 text-sig-violet-ink/70">
              {tags.map((t) => (
                <li key={t} className="hud text-[10px]">
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <p className="absolute inset-x-0 top-[10%] text-center font-display text-[clamp(2.2rem,4.6vw,4.4rem)] font-bold uppercase leading-[0.9] text-sig-violet-ink">
            <Scramble text="We read crowds." run={claim} />
            <br />
            <Scramble text="Never people." run={claim} />
          </p>
        </div>

        <div className="relative px-4 pt-16 md:pointer-events-none md:absolute md:inset-0 md:p-0 [&_li]:pointer-events-auto">
          <h2 id="how-title" className="font-display text-[2.4rem] font-bold uppercase leading-[0.9] md:absolute md:left-3 md:top-[12%] md:text-[2rem]">
            How it works<span className="text-sig-violet-ink">.</span>
          </h2>
          <ol className="mt-6 grid gap-3 pb-16 md:contents">
            {STEPS.map((s, i) => (
              <li
                key={s.n}
                className={cn(
                  "relative max-w-[300px] p-3 transition-opacity duration-500 md:absolute md:z-10 md:bg-sig-paper",
                  i % 2 ? "md:right-[4%]" : "md:left-[4%]",
                  ["md:top-[30%]", "md:top-[34%]", "md:top-[52%]", "md:top-[56%]", "md:top-[74%]"][i],
                  step >= i ? "md:opacity-100" : "md:opacity-0",
                )}
              >
                <Brackets className="text-sig-black" />
                <Hud className="text-sig-violet-ink">
                  {s.n} // {s.q}
                </Hud>
                <div className="mt-1 font-display text-[1.5rem] font-bold uppercase leading-none">{s.t}</div>
                <p className="mt-1.5 text-[13px] leading-snug text-sig-soft">{s.b}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ the record: evidence, Qloo, sponsors, Ask */

function Big({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-t border-white/15 pt-3">
      <div className="font-dot text-[clamp(2.6rem,5vw,4.4rem)] font-black leading-none tabular">{value}</div>
      <Hud className="mt-2 text-sig-mid">{label}</Hud>
    </div>
  );
}

export function Record({ sports, concert }: { sports?: Show; concert?: Show }) {
  const pick = concert?.plan?.slots.flatMap((s) => s.items).find((i) => !i.isWildcard && i.evidence.some((e) => e.tool === "qloo_rank"));
  const slot = concert?.plan?.slots.find((s) => s.items.some((i) => i.id === pick?.id));
  // Prefer a brand with a sponsor-fit score; live Qloo often finds no shared concepts between a
  // crowd and a brand, so fall back to the brand Qloo ranked first for this crowd.
  const brandItems = (concert?.plan?.slots ?? []).filter((s) => s.kind === "brand").flatMap((s) => s.items.filter((i) => i.approval.state !== "swapped" && !i.isWildcard));
  const fitted = [...brandItems].filter((i) => i.fitScore !== undefined).sort((a, b) => b.fitScore! - a.fitScore!)[0];
  const ranked = brandItems
    .map((i) => ({ i, rank: i.evidence.find((e) => e.tool === "qloo_rank")?.scores.rank }))
    .filter((x) => x.rank !== undefined)
    .sort((a, b) => a.rank! - b.rank!)[0];
  const brand = fitted ?? ranked?.i;
  const cf = sports?.counterfactual;
  const items = sports?.plan?.slots.flatMap((s) => s.items.filter((i) => i.approval.state !== "swapped")) ?? [];
  const ask = concert?.asks[0];
  return (
    <section aria-labelledby="record-title" className="sig-black relative overflow-hidden px-4 py-24 md:px-10">
      <Hud className="text-sig-mid">// File 026 · the record</Hud>
      <h2 id="record-title" className="mt-2 max-w-[18ch] font-display text-[clamp(2.4rem,5vw,4.6rem)] font-bold uppercase leading-[0.88]">
        Every pick is on file<span className="text-sig-red">.</span>
      </h2>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1.1fr_1fr]">
        {pick && slot ? (
          <article className="relative p-5" aria-label="A pick from a seeded plan">
            <Brackets className="text-white/60" />
            <Hud className="flex justify-between text-sig-mid">
              <span>
                {slot.label} // {slot.timeRange}
              </span>
              <span>{pick.evidence.length} Qloo calls</span>
            </Hud>
            <div className="mt-3 font-display text-[2.2rem] font-bold uppercase leading-none">{pick.pick.name}</div>
            <div className="mt-4 border-l-2 border-white pl-3">
              <Hud className="text-sig-mid">Qloo says</Hud>
              <p className="mt-1 font-mono text-[13px] leading-snug">{pick.qlooSays}</p>
            </div>
            <div className="mt-3 border-l-2 border-sig-red pl-3">
              <Hud className="text-[#FF6B60]">Our interpretation</Hud>
              <p className="mt-1 text-[14px] leading-snug text-[#D0D0D0]">{pick.interpretation}</p>
            </div>
            <Hud className="mt-4 flex flex-wrap gap-1.5">
              {pick.evidence.map((e) => (
                <span key={e.callId} className="bg-white/10 px-1.5 py-0.5">
                  {e.tool} · {e.status}
                </span>
              ))}
            </Hud>
          </article>
        ) : null}

        {cf ? (
          <div>
            <Hud className="text-sig-mid">// Without Qloo · same brief, Claude alone, no tools</Hud>
            <div className="mt-4 grid grid-cols-2 gap-6">
              <Big value={`${items.length}/${items.length}`} label="House Mix picks with a Qloo citation" />
              <Big value={`0/${cf.summary.llmPicks}`} label="Claude-alone picks with a citation" />
              <Big value={`${cf.summary.llmPicks - cf.summary.llmResolved}/${cf.summary.llmPicks}`} label="Claude-alone picks Qloo couldn't pin down (ambiguous or not found)" />
              <Big value={`${cf.summary.slotsQlooLed}/${cf.summary.rankedSlots}`} label="Slots where Qloo ranked a House Mix pick first" />
            </div>
            <p className="mt-4 text-[13px] text-sig-mid">Qloo ranks House Mix&apos;s own picks here, so this is not the quality test; the blind human A/B in the repo is.</p>
          </div>
        ) : null}
      </div>

      <div className="mt-16 grid gap-10 md:grid-cols-3">
        <div className="relative p-5">
          <Brackets className="text-white/40" />
          <Hud className="text-[#FF6B60]">// Powered by Qloo</Hud>
          <p className="mt-2 text-[14px] leading-relaxed text-[#D0D0D0]">
            Qloo&apos;s taste AI maps what audiences love across music, film, TV, podcasts, books, brands, dining and places, as anonymised aggregate affinities. House Mix chains all ten of its tools
            through the <span className="font-mono text-white">qloo mcp</span> harness. Without Qloo there is no plan: no IDs, no crowd read, no candidates, no ranking.
          </p>
        </div>
        <div className="relative p-5">
          <Brackets className="text-white/40" />
          <Hud className="text-[#FF6B60]">// For sponsors and brand partners</Hud>
          {brand && concert ? (
            <>
              <div className="mt-2 flex items-end justify-between gap-3">
                <span className="font-display text-[1.6rem] font-bold uppercase leading-none">{brand.pick.name}</span>
                <span className="font-dot text-[2.6rem] font-black leading-none">{brand.fitScore ?? `#${ranked?.rank}`}</span>
              </div>
              <Hud className="mt-1 text-sig-mid">{brand.fitScore !== undefined ? "Sponsor fit / 100 · our formula over a Qloo audience comparison" : "Qloo rank among the brands for this crowd"}</Hud>
              <a href={sponsorUrl(concert.id, brand.id)} className="hud mt-4 inline-flex h-8 items-center bg-white px-3 font-semibold text-sig-black hover:bg-sig-red">
                Download the one-pager
                <Plus />
              </a>
            </>
          ) : null}
        </div>
        <div className="relative p-5">
          <Brackets className="text-white/40" />
          <Hud className="text-[#FF6B60]">// Ask House Mix</Hud>
          {ask ? (
            <>
              <p className="mt-2 text-[14px] font-semibold">&ldquo;{ask.question}&rdquo;</p>
              <p className="mt-2 text-[13px] leading-snug text-[#D0D0D0]">
                {ask.lines[0]?.text}
                {ask.lines[0]?.callIds.map((_, k) => (
                  <span key={k} className="ml-1 bg-white px-1 font-mono text-[10px] text-sig-black">
                    {k + 1}
                  </span>
                ))}
              </p>
              <Hud className="mt-2 text-sig-mid">Answers only from Qloo. Every line cited. Changes go to your approval queue.</Hud>
            </>
          ) : null}
        </div>
      </div>
      <TestedLive />
      {sports?.qlooMode === "mock" ? <Hud className="mt-10 text-sig-mid">From seeded demo plans // mock data: fictional Qloo fixtures until the live key is connected</Hud> : null}
    </section>
  );
}

/** Numbers from eval/results via `npm run eval:report` (live Qloo only); a missing result is shown as pending, never estimated. */
type EvalSummary = {
  generatedAt: string;
  verify: { tools: number; passed: number; harness: string } | null;
  judge: { model: string; pairs: number; wins: number; losses: number; ties: number } | null;
  judgeV1: { wins: number; losses: number; ties: number } | null;
  evidence: { items: number; valid: number; criticDrops: number; l0Items: number; l0Unresolved: number; l0Ambiguous: number | null } | null;
  humanAb: { raters: number; wins: number; losses: number } | null;
  value?: { brandsRepeated: number; brands: number; l0BrandsRepeated: number; l0Brands: number; tooBig: number; acts: number; l0TooBig: number; l0Acts: number } | null;
};

function TestedLive() {
  const s = evalSummary as EvalSummary;
  const cells: { value: string; label: string }[] = [];
  if (s.verify) cells.push({ value: `${s.verify.passed}/${s.verify.tools}`, label: `Qloo tools verified against the live API (harness ${s.verify.harness})` });
  if (s.evidence) cells.push({ value: `${s.evidence.valid}/${s.evidence.items}`, label: `Eval-plan picks with a valid live Qloo citation (the Critic removed ${s.evidence.criticDrops} more)` });
  if (s.evidence?.l0Ambiguous != null)
    cells.push({ value: `${s.evidence.l0Ambiguous}/${s.evidence.l0Items}`, label: "Claude-alone picks that are ambiguous in Qloo: a person must choose before they can be used" });
  if (s.value)
    cells.push({
      value: `${s.value.brandsRepeated}/${s.value.brands}`,
      label: `Sponsors repeated from one show to another (Claude alone: ${s.value.l0BrandsRepeated}/${s.value.l0Brands}). Openers bigger than the headliner: ${s.value.tooBig}/${s.value.acts} (Claude alone: ${s.value.l0TooBig}/${s.value.l0Acts})`,
    });
  if (s.judge)
    cells.push({
      value: `${s.judge.wins}–${s.judge.losses}`,
      label: `Blind A/B vs Claude alone, automated judge (${s.judge.ties} tie${s.judge.ties === 1 ? "" : "s"}, ${s.judge.pairs} test shows${s.judgeV1 ? `; ${s.judgeV1.wins}–${s.judgeV1.losses} before the fixes` : ""}). Claude alone still wins this one`,
    });
  if (!cells.length) return null;
  return (
    <div className="mt-16 border-t border-white/15 pt-6" aria-labelledby="tested-title">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 id="tested-title" className="hud text-[#FF6B60]">
          // Tested on live Qloo · {new Date(s.generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
        </h3>
        <a href="https://github.com/Prashant-thakur77/house-mix/blob/main/eval/REPORT.md" className="hud text-sig-mid underline-offset-4 hover:text-white hover:underline">
          Methods and the negative result →
        </a>
      </div>
      <div className={cn("mt-4 grid grid-cols-2 gap-6", cells.length > 2 && "lg:grid-cols-4", cells.length > 4 && "xl:grid-cols-5")}>
        {cells.map((c) => (
          <Big key={c.label} value={c.value} label={c.label} />
        ))}
      </div>
      <Hud className="mt-4 text-sig-mid">
        {s.humanAb
          ? `Human raters: ${s.humanAb.wins}–${s.humanAb.losses} from ${s.humanAb.raters} raters.`
          : "Human blind ratings are open at /rate; the automated judge is a secondary signal until they are in."}
      </Hud>
    </div>
  );
}

/* ------------------------------------------------------------------ index of shows */

export function ShowIndex({ seeds, recent }: { seeds: ShowSummary[]; recent: ShowSummary[] }) {
  const rows = [...seeds, ...recent];
  return (
    <section aria-labelledby="index-title" className="sig-paper relative px-4 py-24 md:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Hud className="text-sig-soft">// Index · {String(rows.length).padStart(2, "0")} plans</Hud>
          <h2 id="index-title" className="mt-2 font-display text-[clamp(2.4rem,5vw,4.6rem)] font-bold uppercase leading-[0.88]">
            Open a finished night<span className="text-sig-red-ink">.</span>
          </h2>
        </div>
        <Link href="/compare" className="hud font-semibold hover:text-sig-red-ink">
          Compare two shows
          <Plus />
        </Link>
      </div>
      <ul className="mt-10 border-t border-sig-black">
        {rows.map((s, i) => {
          const d = new Date(`${s.date}T00:00:00Z`);
          return (
            <li key={s.id} className="border-b border-sig-black/80">
              <Link
                href={`/shows/${s.id}`}
                className="group grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 px-2 py-4 transition-colors hover:bg-sig-black hover:text-sig-paper md:grid-cols-[3rem_7rem_1fr_14rem_6rem_6rem]"
              >
                <span className="hud tabular text-sig-soft group-hover:text-sig-mid">{String(i + 1).padStart(3, "0")}</span>
                <span className="hud hidden md:block">{s.mode}</span>
                <span className="font-display text-[1.5rem] font-bold uppercase leading-none md:text-[1.9rem]">
                  {s.title}
                  {!s.seed ? <span className="hud ml-2 align-middle text-sig-soft">yours</span> : null}
                </span>
                <span className="hud hidden text-sig-soft group-hover:text-sig-mid md:block">
                  {s.venue} // {s.city}
                </span>
                <span className="hud hidden tabular md:block" suppressHydrationWarning>
                  {d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" })}
                </span>
                <span className="hud flex items-center justify-end gap-1.5 font-semibold">
                  <span className="size-1.5 bg-sig-red opacity-0 group-hover:opacity-100" aria-hidden />
                  {s.items} picks
                  <Plus />
                </span>
              </Link>
            </li>
          );
        })}
        {rows.length === 0 ? <li className="hud py-6 text-sig-soft">The demo shows are loading or unavailable. You can still plan a new show.</li> : null}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ violet flood + finale */

/** A stepped, pixel-edged violet horizon that rises as you scroll into the finale. */
export function Flood() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end end"] });
  const y = useTransform(scrollYProgress, [0, 1], ["100%", "0%"]);
  const edge = useMemo(() => {
    // A bar-graph skyline: the edge is an EQ, not a horizon.
    const pts: string[] = ["0,40"];
    for (let x = 0; x < 100; x += 2.5) {
      const h = 6 + Math.abs(Math.sin(x * 0.9) * 18 + Math.cos(x * 0.31) * 12);
      pts.push(`${x},${(40 - h).toFixed(1)}`, `${(x + 2.1).toFixed(1)},${(40 - h).toFixed(1)}`, `${(x + 2.1).toFixed(1)},40`, `${(x + 2.5).toFixed(1)},40`);
    }
    pts.push("100,40");
    return pts.join(" ");
  }, []);
  return (
    <div ref={ref} className="sig-paper relative h-[70vh] overflow-hidden" aria-hidden>
      <motion.div className="absolute inset-0" style={{ y }}>
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="absolute inset-x-0 -top-[14vh] h-[14vh] w-full">
          <polygon points={edge} fill="#5B2BE0" />
        </svg>
        <div className="absolute inset-0 bg-sig-violet-ink" />
      </motion.div>
    </div>
  );
}

/* 5×7 LED glyphs for the wordmark. */
const LED: Record<string, string[]> = {
  H: ["X...X", "X...X", "X...X", "XXXXX", "X...X", "X...X", "X...X"],
  O: [".XXX.", "X...X", "X...X", "X...X", "X...X", "X...X", ".XXX."],
  U: ["X...X", "X...X", "X...X", "X...X", "X...X", "X...X", ".XXX."],
  S: [".XXXX", "X....", "X....", ".XXX.", "....X", "....X", "XXXX."],
  E: ["XXXXX", "X....", "X....", "XXXX.", "X....", "X....", "XXXXX"],
  M: ["X...X", "XX.XX", "X.X.X", "X.X.X", "X...X", "X...X", "X...X"],
  I: ["XXX", ".X.", ".X.", ".X.", ".X.", ".X.", "XXX"],
  X: ["X...X", "X...X", ".X.X.", "..X..", ".X.X.", "X...X", "X...X"],
  " ": ["..", "..", "..", "..", "..", "..", ".."],
};

/** "HOUSE MIX" as a dot-matrix LED sign whose columns carry bouncing peak meters, like an EQ. */
function LedWordmark() {
  const cols: (boolean[] | null)[] = [];
  for (const ch of "HOUSE MIX") {
    const g = LED[ch]!;
    for (let x = 0; x < g[0]!.length; x++) cols.push(g.map((row) => row[x] === "X"));
    cols.push(null);
  }
  cols.pop();
  const C = 10;
  const top = 4;
  return (
    <svg viewBox={`0 0 ${cols.length * C} ${(7 + top) * C}`} className="h-auto w-full" role="img" aria-label="House Mix">
      {cols.map((col, x) =>
        col === null ? null : col.map((on, y) => <rect key={`${x}-${y}`} x={x * C + 1} y={(y + top) * C + 1} width={C - 2} height={C - 2} rx="1.5" fill={on ? "#FFFFFF" : "#262626"} />),
      )}
      {cols.map((col, x) => {
        if (!col) return null;
        if (!col.includes(true)) return null;
        // One peak pixel per column in a row just above the word, jumping like a spectrum analyser.
        const seed = (x * 37) % 11;
        return (
          <rect
            key={`p${x}`}
            x={x * C + 1}
            y={(top - 1) * C + 1}
            width={C - 2}
            height={C - 2}
            rx="1.5"
            fill={x % 9 === 4 ? "#E8271C" : "#A893FF"}
            className="sig-peak"
            style={{ ["--h" as string]: 8 + seed * 2, animationDelay: `${(seed * 0.12) % 1.3}s` }}
          />
        );
      })}
    </svg>
  );
}

/** A record on the platter: the mark on the label, the site's name running round it. */
function SignatureRecord() {
  const id = `rec${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg viewBox="0 0 200 200" className="size-full" aria-hidden>
      <defs>
        <path id={id} d="M100,100 m-60,0 a60,60 0 1,1 120,0 a60,60 0 1,1 -120,0" />
      </defs>
      <g className="sig-spin">
        <circle cx="100" cy="100" r="98" fill="#111111" />
        {[90, 84, 78, 72, 66, 60, 54].map((r) => (
          <circle key={r} cx="100" cy="100" r={r + 26} fill="none" stroke="#2C2C2C" strokeWidth="0.8" />
        ))}
        <circle cx="100" cy="100" r="44" fill="#5B2BE0" />
        <text fontFamily="var(--font-mono)" fontSize="9" letterSpacing="1.6" fill="#FFFFFF">
          <textPath href={`#${id}`}>HOUSE MIX · HOUSE-MIX.VERCEL.APP · SIDE A · 33⅓ ·</textPath>
        </text>
        {BRAND_MARK.flatMap((row, y) =>
          row.split("").map((c, x) => (c === "." ? null : <rect key={`${x}-${y}`} x={84 + x * 3.6} y={84 + y * 3.6} width="3" height="3" fill={c === "R" ? "#E8271C" : "#FFFFFF"} />)),
        )}
        <circle cx="100" cy="100" r="2.5" fill="#0A0A0A" />
      </g>
      <path d="M190 18 L150 70" stroke="#A893FF" strokeWidth="3" strokeLinecap="round" />
      <circle cx="190" cy="18" r="6" fill="#A893FF" />
    </svg>
  );
}

function NowPlaying() {
  const [t, setT] = useState(86);
  useEffect(() => {
    const id = setInterval(() => setT((x) => (x >= 210 ? 0 : x + 1)), 1000);
    return () => clearInterval(id);
  }, []);
  const mm = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  return (
    <div className="grid gap-2">
      <Hud className="flex items-center gap-2 text-sig-violet-tint">
        <span className="size-1.5 animate-blink bg-sig-red" aria-hidden /> Now playing
      </Hud>
      <div className="font-display text-[clamp(1.4rem,2.4vw,2.2rem)] font-bold uppercase leading-none text-white">
        House Mix <span className="text-sig-violet-tint">— Find your crowd (Original Mix)</span>
      </div>
      <div className="flex items-center gap-3">
        <Hud className="tabular text-sig-violet-tint">{mm(t)}</Hud>
        <span className="relative h-1 flex-1 rounded bg-white/15" aria-hidden>
          <span className="absolute inset-y-0 left-0 rounded bg-white" style={{ width: `${(t / 210) * 100}%` }} />
          <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sig-red" style={{ left: `${(t / 210) * 100}%` }} />
        </span>
        <Hud className="tabular text-sig-violet-tint">03:30</Hud>
      </div>
      <Hud className="text-sig-violet-tint">house-mix.vercel.app · side A · track 01</Hud>
    </div>
  );
}

const PRINCIPLES = [
  ["Aggregate only.", "Qloo affinities describe audiences, never a person. Names, emails, handles and device IDs are refused before any call."],
  ["Never auto-picks.", "An ambiguous name becomes a confirm card. Nothing downstream runs until you choose."],
  ["Evidence or it's cut.", "A pick or sentence without a valid Qloo citation is removed by the Critic, and the trace shows why."],
  ["No eligibility decisions.", "Demographics set tone and pricing only. House Mix never admits, excludes or targets anyone."],
];

export function Finale() {
  return (
    <footer className="sig-violet relative overflow-hidden px-3 pb-14 pt-6">
      <DotField color="#4C21C2" step={5} seed={21} rise={0.5} />
      <div className="relative">
        <h2 className="mx-auto max-w-[12ch] text-center font-display text-[clamp(3rem,9.5vw,9rem)] font-bold uppercase leading-[0.84] tracking-[-0.01em]">Find your crowd before the doors open</h2>
        <div className="relative mt-10 grid gap-6 bg-sig-black p-5 md:grid-cols-[minmax(180px,260px)_1fr] md:items-center md:p-8">
          <span className="absolute left-2 top-2 size-1.5 bg-sig-violet-tint" aria-hidden />
          <span className="absolute right-2 top-2 size-1.5 bg-sig-violet-tint" aria-hidden />
          <span className="absolute bottom-2 left-2 size-1.5 bg-sig-violet-tint" aria-hidden />
          <div className="mx-auto aspect-square w-[min(260px,60vw)]">
            <SignatureRecord />
          </div>
          <div className="grid gap-6">
            <LedWordmark />
            <NowPlaying />
            <div className="flex flex-wrap items-center gap-5">
              <nav aria-label="Footer" className="hud flex gap-5 text-sig-violet-tint">
                <Link href="/" className="hover:text-white">
                  Index
                  <Plus />
                </Link>
                <Link href="/new" className="hover:text-white">
                  Plan
                  <Plus />
                </Link>
                <Link href="/compare" className="hover:text-white">
                  Compare
                  <Plus />
                </Link>
                <Link href="/rate" className="hover:text-white">
                  Rate
                  <Plus />
                </Link>
              </nav>
              <Link href="/new" className="hud ml-auto flex h-8 items-center bg-sig-violet-ink px-3 font-semibold text-white hover:bg-white hover:text-sig-black">
                Plan a show
                <Plus />
              </Link>
            </div>
          </div>
        </div>
        <div className="mt-1.5 grid gap-1.5 md:grid-cols-2">
          <Hud className="bg-sig-black px-3 py-1 text-sig-violet-tint">Powered by Qloo taste AI // ten tools in every plan</Hud>
          <Hud className="bg-sig-black px-3 py-1 text-sig-violet-tint">For sponsors // fit scores and one-pagers</Hud>
        </div>
        <div className="mt-12 grid gap-8 md:grid-cols-[1fr_1fr_1.4fr]">
          <Hud>
            Project
            <br />
            House Mix // 0026
          </Hud>
          <Hud className="text-sig-lilac">
            // Qloo results describe aggregate audience affinities.
            <br />
            House Mix makes no eligibility decisions.
          </Hud>
          <ol className="grid gap-5">
            {PRINCIPLES.map(([h, b], i) => (
              <li key={h} className="grid grid-cols-[1.5rem_1fr]">
                <Hud>{i + 1}</Hud>
                <div>
                  <Hud className="font-semibold">{h}</Hud>
                  <p className="mt-1 max-w-[46ch] text-[13px] leading-snug text-sig-lilac">{b}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <Hud className="mt-12 text-sig-lilac">© 2026 House Mix // MIT licensed</Hud>
      </div>
    </footer>
  );
}
