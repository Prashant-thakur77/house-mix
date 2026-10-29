"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { animate, motion, useInView, useMotionValue, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import { ArrowRight, ArrowUpRight, BarChart3, Compass, FileText, Flame, GitCompareArrows, Layers, ListOrdered, MapPin, MessageSquareText, Plus, Search, Tags, TrendingUp, Users } from "lucide-react";
import type { Mode, Show } from "@housemix/shared";
import { cn } from "cn";
import type { ShowSummary } from "@/lib/api";
import { sponsorUrl } from "@/lib/api";
import { PosterArt } from "./poster-art";

function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-label uppercase tracking-[0.16em]", className)}>{children}</p>;
}

function Title({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  return (
    <h2 id={id} className={cn("mt-2 font-display text-[clamp(2rem,4.4vw,3.6rem)] font-extrabold leading-[0.95] tracking-[-0.03em]", className)}>
      {children}
    </h2>
  );
}

function MockNote({ show }: { show?: Show }) {
  return show?.qlooMode === "mock" ? <p className="mt-3 text-label text-muted-foreground">From a seeded demo plan · MOCK DATA: fictional Qloo fixtures until the live key is connected.</p> : null;
}

/* ------------------------------------------------------------------ crowd read */

export function CrowdShowcase({ show }: { show?: Show }) {
  const crowd = show?.plan?.crowd;
  if (!crowd) return null;
  const rows = crowd.compare.slice(0, 8);
  const ages = crowd.demographics.age;
  return (
    <section aria-labelledby="crowd-title" className="mx-auto max-w-[1280px] px-4 py-24 md:px-6">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.3fr]">
        <div>
          <Eyebrow className="text-stripe-violet dark:text-[#B9ADFF]">The crowd read</Eyebrow>
          <Title id="crowd-title">Two crowds, one night.</Title>
          <p className="mt-4 max-w-[52ch] text-body-lg text-muted-foreground">
            {crowd.labelA} and {crowd.labelB} fans share some taste and split on the rest. House Mix programs for the overlap, then gives each end something of its own.
          </p>
          <ul className="mt-6 grid gap-2">
            {crowd.qlooSays.slice(0, 3).map((l) => (
              <li key={l} className="rounded-xl border-l-4 border-stripe-teal bg-card px-3 py-2 font-mono text-small">
                {l}
              </li>
            ))}
          </ul>
          <MockNote show={show} />
        </div>
        <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr]">
          <figure className="rounded-2xl border bg-card p-5">
            <figcaption className="flex items-center justify-between text-small font-semibold">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-stripe-pink" aria-hidden />
                {crowd.labelA}
              </span>
              <span className="flex items-center gap-1.5">
                {crowd.labelB}
                <span className="size-2.5 rounded-sm bg-stripe-teal" aria-hidden />
              </span>
            </figcaption>
            <ul className="mt-4 grid gap-2.5">
              {rows.map((r, i) => (
                <li key={r.id} className="grid grid-cols-[1fr_6.5rem_1fr] items-center gap-2" title={`${r.name}: ${r.a.toFixed(2)} vs ${r.b.toFixed(2)}`}>
                  <div className="flex justify-end">
                    <motion.span
                      className="h-3.5 rounded-l-full bg-stripe-pink"
                      initial={{ width: 0 }}
                      whileInView={{ width: `${r.a * 100}%` }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.06, duration: 0.8, ease: "easeOut" }}
                    />
                  </div>
                  <span className="truncate text-center text-small">{r.name}</span>
                  <motion.span
                    className="h-3.5 rounded-r-full bg-stripe-teal"
                    initial={{ width: 0 }}
                    whileInView={{ width: `${r.b * 100}%` }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.06, duration: 0.8, ease: "easeOut" }}
                  />
                </li>
              ))}
            </ul>
            <p className="sr-only">Affinity by concept: {rows.map((r) => `${r.name} ${r.a.toFixed(2)} versus ${r.b.toFixed(2)}`).join("; ")}.</p>
            <p className="mt-4 text-label text-muted-foreground">qloo_compare_audiences · affinity 0–1</p>
          </figure>
          <div className="grid gap-4">
            <figure className="rounded-2xl bg-stripe-sun p-5 text-stage-ink">
              <figcaption className="text-label font-semibold uppercase tracking-[0.12em]">Age skew · aggregate</figcaption>
              <div className="mt-3 flex h-28 items-end gap-1.5" aria-hidden>
                {ages.map((a, i) => (
                  <motion.span
                    key={a.bucket}
                    className="flex-1 rounded-t-md bg-stage-ink/85"
                    initial={{ height: 0 }}
                    whileInView={{ height: `${Math.max(6, ((a.value + 1) / 2) * 100)}%` }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.07, duration: 0.7 }}
                  />
                ))}
              </div>
              <p className="mt-2 text-label">Tone and pricing only · {crowd.demographicPhrase || "no phrase"}</p>
            </figure>
            <figure className="rounded-2xl bg-stripe-violet p-5 text-white">
              <figcaption className="text-label font-semibold uppercase tracking-[0.12em]">Momentum · 90 days</figcaption>
              <ul className="mt-3 grid gap-2">
                {crowd.trends.slice(0, 2).map((t) => {
                  const pts = t.points;
                  const min = Math.min(...pts.map((p) => p.value));
                  const max = Math.max(...pts.map((p) => p.value));
                  const d = pts.map((p, i) => `${i ? "L" : "M"}${(i / Math.max(1, pts.length - 1)) * 120} ${30 - ((p.value - min) / Math.max(0.0001, max - min)) * 26}`).join(" ");
                  return (
                    <li key={t.qlooId} className="flex items-center gap-3 text-small">
                      <span className="w-24 truncate">{t.name}</span>
                      <svg viewBox="0 0 120 32" className="h-8 flex-1" aria-hidden>
                        <motion.path
                          d={d}
                          fill="none"
                          stroke="#FFC83D"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          initial={{ pathLength: 0 }}
                          whileInView={{ pathLength: 1 }}
                          viewport={{ once: true }}
                          transition={{ duration: 1.4 }}
                        />
                      </svg>
                      <span className="font-mono">
                        {t.delta >= 0 ? "▲" : "▼"} {Math.abs(t.delta * 100).toFixed(1)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </figure>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ Qloo deck */

const DECK = [
  { tool: "qloo_describe", role: "Turns every name into a confirmed Qloo ID", icon: Search, bg: "from-[#FFC83D] to-[#FF9F1C]", ink: true },
  { tool: "qloo_find_tags", role: "Turns vibe words into taste tags", icon: Tags, bg: "from-[#FF9F1C] to-[#F2501E]", ink: true },
  { tool: "compare_audiences", role: "Shared vs distinct taste between two crowds; sponsor fit", icon: GitCompareArrows, bg: "from-[#FF4F9A] to-[#C4133C]" },
  { tool: "audience_demographics", role: "Aggregate age skew for tone and pricing", icon: Users, bg: "from-[#C4133C] to-[#6B4CF6]" },
  { tool: "entity_tags", role: "The crowd's taste vocabulary", icon: Layers, bg: "from-[#6B4CF6] to-[#3D2BB0]" },
  { tool: "qloo_recommend", role: "Candidates for every slot, plus stretch picks", icon: Compass, bg: "from-[#17A398] to-[#0F6E66]", ink: true },
  { tool: "qloo_rank", role: "Orders each shortlist for tonight's crowd; powers swap", icon: ListOrdered, bg: "from-[#9D8CFF] to-[#6B4CF6]" },
  { tool: "where_popular", role: "Where the crowd's taste concentrates in the city", icon: MapPin, bg: "from-[#FFC83D] to-[#17A398]", ink: true },
  { tool: "qloo_trends", role: "90-day momentum: who's rising", icon: TrendingUp, bg: "from-[#FF4F9A] to-[#FF9F1C]", ink: true },
  { tool: "qloo_capabilities", role: "Readiness check before anything runs", icon: Flame, bg: "from-[#3D2BB0] to-[#15131F]" },
];

export function QlooDeck() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const spread = useTransform(scrollYProgress, [0.1, 0.5], [0.35, 1]);
  const turn = useTransform(scrollYProgress, [0, 1], [8, -8]);
  // Reduced motion: the fan is shown fully open and still.
  const open = useMotionValue(1);
  const level = useMotionValue(0);
  return (
    <section aria-labelledby="qloo-title" className="stage relative overflow-hidden py-24">
      <div className="absolute inset-0 -z-0 [background:radial-gradient(50%_60%_at_50%_100%,rgba(107,76,246,0.35),transparent)]" aria-hidden />
      <div className="relative mx-auto max-w-[1280px] px-4 md:px-6">
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <div>
            <Eyebrow className="text-stripe-sun">Powered by Qloo</Eyebrow>
            <Title id="qloo-title">Taste data is the engine, not the garnish.</Title>
          </div>
          <div className="grid content-end gap-3 text-body-lg text-muted-foreground">
            <p>
              Qloo&apos;s taste AI connects what audiences love across music, film, TV, podcasts, books, brands, dining and places, as anonymised aggregate affinities. House Mix reaches it through the{" "}
              <span className="font-mono text-foreground">qloo mcp</span> harness, chaining every tool it offers.
            </p>
            <p>Take Qloo away and there is no plan: no confirmed IDs, no crowd read, no candidates, no ranking. Every pick is a Qloo result before it is an opinion.</p>
          </div>
        </div>
        {/* Desktop: a fanned deck that opens as you scroll. */}
        <div ref={ref} className="relative mt-14 hidden h-[460px] md:block" aria-label="The ten Qloo tools House Mix uses">
          {DECK.map((c, i) => {
            const mid = (DECK.length - 1) / 2;
            return <FanCard key={c.tool} card={c} offset={i - mid} spread={reduce ? open : spread} turn={reduce ? level : turn} />;
          })}
        </div>
        {/* Mobile: a swipeable row. */}
        <ul tabIndex={0} aria-label="The ten Qloo tools House Mix uses (scrolls sideways)" className="mt-10 flex snap-x snap-mandatory gap-3 overflow-x-auto rounded-xl pb-4 md:hidden">
          {DECK.map((c) => (
            <li key={c.tool} className="snap-start">
              <CardFace card={c} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function CardFace({ card }: { card: (typeof DECK)[number] }) {
  return (
    <div className={cn("flex h-[270px] w-[176px] flex-col justify-between rounded-2xl bg-gradient-to-br p-4 shadow-2xl ring-1 ring-white/15", card.bg, card.ink ? "text-stage-ink" : "text-white")}>
      <card.icon className="size-7" aria-hidden />
      <div>
        <div className="font-mono text-[13px] font-semibold">{card.tool}</div>
        <p className="mt-1.5 text-small leading-snug opacity-90">{card.role}</p>
      </div>
    </div>
  );
}

function FanCard({ card, offset, spread, turn }: { card: (typeof DECK)[number]; offset: number; spread: MotionValue<number>; turn: MotionValue<number> }) {
  const x = useTransform(spread, (s) => offset * 128 * s);
  const rotate = useTransform([spread, turn], ([s, t]: number[]) => offset * 6.5 * s! + t!);
  const y = useTransform(spread, (s) => Math.abs(offset) ** 1.6 * 9 * s);
  return (
    <motion.div className="absolute left-1/2 top-6 -ml-[88px] origin-[50%_140%] hover:!z-40" style={{ x, rotate, y, zIndex: 20 - Math.round(Math.abs(offset)) }}>
      {/* The lift lives on an inner layer so it doesn't fight the scroll-driven transform. */}
      <motion.div whileHover={{ y: -28, scale: 1.04 }} transition={{ type: "spring", stiffness: 300, damping: 24 }}>
        <CardFace card={card} />
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ sponsors */

function Dial({ value }: { value: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const c = animate(0, value, { duration: 1.4, ease: "easeOut", onUpdate: (v) => setN(Math.round(v)) });
    return () => c.stop();
  }, [inView, value]);
  const r = 70;
  const len = Math.PI * r;
  return (
    <svg ref={ref} viewBox="0 0 180 110" className="w-full max-w-[260px]" role="img" aria-label={`Sponsor fit ${value} out of 100`}>
      <path d={`M20 95 A${r} ${r} 0 0 1 160 95`} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="14" strokeLinecap="round" />
      <path d={`M20 95 A${r} ${r} 0 0 1 160 95`} fill="none" stroke="url(#dial)" strokeWidth="14" strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - n / 100)} />
      <defs>
        <linearGradient id="dial" x1="0" x2="1">
          <stop offset="0" stopColor="#FF4F9A" />
          <stop offset="0.5" stopColor="#FF9F1C" />
          <stop offset="1" stopColor="#FFC83D" />
        </linearGradient>
      </defs>
      <text x="90" y="88" textAnchor="middle" className="fill-current font-display" fontSize="34" fontWeight="800">
        {n}
      </text>
      <text x="90" y="104" textAnchor="middle" className="fill-current" fontSize="9" opacity="0.7">
        sponsor fit / 100
      </text>
    </svg>
  );
}

export function Sponsors({ show }: { show?: Show }) {
  // The best-fitting brand in the seeded plan.
  const scored = (show?.plan?.slots ?? []).flatMap((s) => s.items.filter((i) => i.fitScore !== undefined && i.approval.state !== "swapped").map((i) => ({ s, i })));
  const best = scored.sort((a, b) => b.i.fitScore! - a.i.fitScore!)[0];
  const slot = best?.s;
  const item = best?.i;
  return (
    <section aria-labelledby="sponsor-title" className="mx-auto max-w-[1280px] px-4 py-24 md:px-6">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <Eyebrow className="text-stripe-crimson dark:text-stripe-amber">For sponsors and brand partners</Eyebrow>
          <Title id="sponsor-title">Activations that fit the crowd, with the receipts.</Title>
          <ul className="mt-6 grid gap-3 text-body-lg">
            {[
              ["Fit score per brand", "Qloo compares tonight's crowd with each brand's audience. The score is our formula over that comparison, and it says so."],
              ["Exclusivities respected", "House rules list the sponsors with category exclusivity; the agents work around them."],
              ["A one-pager per brand", "Fit score, the Qloo evidence, the activation and the slot, as a PDF a partnership lead can forward."],
            ].map(([h, b]) => (
              <li key={h} className="flex gap-3">
                <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-stripe-tangerine" aria-hidden />
                <span>
                  <span className="font-semibold">{h}.</span> <span className="text-muted-foreground">{b}</span>
                </span>
              </li>
            ))}
          </ul>
          {show && item ? (
            <a href={sponsorUrl(show.id, item.id)} className="mt-8 inline-flex h-11 items-center gap-2 rounded-full bg-foreground px-5 text-small font-semibold text-background hover:opacity-90">
              <FileText className="size-4" aria-hidden /> Download a real one-pager
            </a>
          ) : null}
          <MockNote show={show} />
        </div>
        <div className="relative mx-auto w-full max-w-[520px]">
          <motion.div
            initial={{ rotate: -6, y: 40, opacity: 0 }}
            whileInView={{ rotate: -4, y: 0, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 80 }}
            className="relative rounded-2xl bg-white p-6 text-stage-ink shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45)] ring-1 ring-black/5"
          >
            <div className="stripes absolute inset-x-0 top-0 h-2 rounded-t-2xl" aria-hidden />
            <p className="text-label font-semibold uppercase tracking-[0.12em] text-[#5C5866]">Sponsor one-pager · {slot?.label ?? "Brands"}</p>
            <div className="mt-1 font-display text-[1.8rem] font-extrabold">{item?.pick.name ?? "Brand partner"}</div>
            <div className="mt-2 grid items-center gap-4 sm:grid-cols-[1fr_1.1fr]">
              <div className="text-stage-ink">
                <Dial value={item?.fitScore ?? 72} />
              </div>
              <div className="grid gap-2 text-small">
                <p className="rounded-lg bg-[#E1F3F0] px-3 py-2 font-mono text-[12px] text-[#0B6E66]">{item?.qlooSays ?? "compare_audiences: audience similarity 72/100."}</p>
                <p className="text-[#3B3646]">{item?.action ?? "Pop-up at the concourse at half-time."}</p>
              </div>
            </div>
          </motion.div>
          <motion.div
            initial={{ rotate: 8, x: 60, opacity: 0 }}
            whileInView={{ rotate: 5, x: 0, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2, type: "spring", stiffness: 70 }}
            className="absolute -bottom-10 -right-4 -z-10 h-48 w-64 rounded-2xl bg-stripe-teal sm:-right-10"
            aria-hidden
          />
          <motion.div
            initial={{ rotate: -14, x: -40, opacity: 0 }}
            whileInView={{ rotate: -10, x: 0, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3, type: "spring", stiffness: 70 }}
            className="absolute -left-6 -top-8 -z-10 h-40 w-52 rounded-2xl bg-stripe-pink"
            aria-hidden
          />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ without Qloo */

function Count({ to, of }: { to: number; of: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const c = animate(0, to, { duration: 1.2, ease: "easeOut", onUpdate: (v) => setN(Math.round(v)) });
    return () => c.stop();
  }, [inView, to]);
  return (
    <span ref={ref} className="tabular">
      {n}
      <span className="opacity-50">/{of}</span>
    </span>
  );
}

export function WithoutQloo({ show }: { show?: Show }) {
  const cf = show?.counterfactual;
  if (!cf || !show?.plan) return null;
  const items = show.plan.slots.flatMap((s) => s.items.filter((i) => i.approval.state !== "swapped"));
  const cards = [
    { k: <Count to={items.length} of={items.length} />, l: "House Mix picks with a Qloo citation", c: "bg-stripe-teal text-stage-ink" },
    { k: <Count to={0} of={cf.summary.llmPicks} />, l: "Claude-alone picks with a citation", c: "bg-stripe-crimson text-white" },
    { k: <Count to={cf.summary.llmPicks - cf.summary.llmResolved} of={cf.summary.llmPicks} />, l: "Claude-alone picks Qloo couldn't find", c: "bg-stripe-sun text-stage-ink" },
    { k: <Count to={cf.summary.slotsQlooLed} of={cf.summary.rankedSlots} />, l: "slots where Qloo ranked a House Mix pick first", c: "bg-stripe-violet text-white" },
  ];
  return (
    <section aria-labelledby="cf-title" className="mx-auto max-w-[1280px] px-4 py-24 md:px-6">
      <Eyebrow className="text-stripe-crimson dark:text-stripe-pink">Qloo on vs Qloo off</Eyebrow>
      <Title id="cf-title" className="max-w-[20ch]">
        Same brief. Same model. One of them has taste data.
      </Title>
      <p className="mt-4 max-w-[64ch] text-body-lg text-muted-foreground">
        Every plan can be set beside what Claude alone would pick. Qloo looks up each of those picks by name and ranks both plans for tonight&apos;s crowd. It isn&apos;t the quality test (that&apos;s
        the blind human A/B in the repo), but it shows what knowledge without data misses.
      </p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c, i) => (
          <motion.div
            key={c.l}
            initial={{ opacity: 0, y: 30, rotate: i % 2 ? 2 : -2 }}
            whileInView={{ opacity: 1, y: 0, rotate: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08, type: "spring", stiffness: 90 }}
            className={cn("rounded-2xl p-5", c.c)}
          >
            <div className="font-display text-[3rem] font-extrabold leading-none">{c.k}</div>
            <p className="mt-3 text-small font-medium">{c.l}</p>
          </motion.div>
        ))}
      </div>
      <Link href={`/shows/${show.id}`} className="mt-6 inline-flex items-center gap-1.5 text-small font-semibold underline-offset-4 hover:underline">
        See it slot by slot in {show.title} <ArrowUpRight className="size-4" aria-hidden />
      </Link>
      <MockNote show={show} />
    </section>
  );
}

/* ------------------------------------------------------------------ ask demo */

export function AskDemo({ show }: { show?: Show }) {
  const ask = show?.asks[0];
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-120px" });
  const reduce = useReducedMotion();
  const [typed, setTyped] = useState(0);
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (!ask || !inView) return;
    if (reduce) {
      setTyped(ask.question.length);
      setPhase(3);
      return;
    }
    let i = 0;
    const id = setInterval(() => {
      i += 2;
      setTyped(Math.min(i, ask.question.length));
      if (i >= ask.question.length) {
        clearInterval(id);
        setTimeout(() => setPhase(1), 300);
        setTimeout(() => setPhase(2), 1300);
        setTimeout(() => setPhase(3), 2100);
      }
    }, 28);
    return () => clearInterval(id);
  }, [ask, inView, reduce]);
  if (!ask || !show) return null;
  const tools = [...new Set(ask.calls.map((c) => c.tool))].slice(0, 4);
  return (
    <section aria-labelledby="ask-title" className="stage relative overflow-hidden py-24">
      <div
        className="absolute inset-0 [background:radial-gradient(45%_55%_at_80%_30%,rgba(23,163,152,0.3),transparent),radial-gradient(40%_50%_at_10%_80%,rgba(255,79,154,0.22),transparent)]"
        aria-hidden
      />
      <div className="relative mx-auto grid max-w-[1280px] items-center gap-12 px-4 md:px-6 lg:grid-cols-[1fr_1.15fr]">
        <div>
          <Eyebrow className="text-stripe-teal">Ask House Mix</Eyebrow>
          <Title id="ask-title">Ask anything about the night. Get an answer with receipts.</Title>
          <p className="mt-4 max-w-[52ch] text-body-lg text-muted-foreground">
            A Claude agent answers from Qloo only: the plan&apos;s calls plus new ones it makes for your question. Every line cites its calls, the Critic cuts what doesn&apos;t hold up, and a
            suggested change lands in your approval queue, never straight in the plan.
          </p>
          <Link href={`/shows/${show.id}`} className="mt-8 inline-flex h-11 items-center gap-2 rounded-full bg-stripe-teal px-5 text-small font-semibold text-stage-ink">
            <MessageSquareText className="size-4" aria-hidden /> Try it on {show.title}
          </Link>
        </div>
        <div ref={ref} className="rounded-2xl border border-white/10 bg-stage-2/90 p-5 shadow-2xl backdrop-blur" role="figure" aria-label="A stored answer from a seeded show">
          <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-stripe-violet px-4 py-3 text-small text-white">
            {ask.question.slice(0, typed)}
            {typed < ask.question.length ? <span className="ml-0.5 inline-block h-4 w-0.5 animate-live bg-white align-middle" /> : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {phase >= 1
              ? (tools.length ? tools : ["qloo_rank"]).map((t, i) => (
                  <motion.span
                    key={t}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.15 }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 font-mono text-[11px]"
                  >
                    <span className="size-1.5 rounded-full bg-stripe-teal" aria-hidden /> {t} · ok
                  </motion.span>
                ))
              : null}
            {phase === 2 ? <span className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-muted-foreground">Critic is checking…</span> : null}
          </div>
          {phase >= 3 ? (
            <ul className="mt-4 grid gap-2 border-l-4 border-[#7E6CF0] pl-4 text-small">
              {ask.lines.slice(0, 3).map((l, i) => (
                <motion.li key={l.text} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.18 }}>
                  {l.text}
                  {l.callIds.map((_, k) => (
                    <span key={k} className="ml-1 inline-grid h-4 min-w-4 place-items-center rounded-sm bg-[#0D2826] px-1 align-text-top font-mono text-[10px] text-[#5EE0CF]">
                      {k + 1}
                    </span>
                  ))}
                </motion.li>
              ))}
            </ul>
          ) : null}
          {phase >= 3 && ask.proposals[0] ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-white/20 p-3 text-small"
            >
              <Plus className="size-4 text-stripe-sun" aria-hidden />
              <span>
                <span className="font-semibold">{ask.proposals[0].item.pick.name}</span> <span className="text-muted-foreground">proposed for your approval queue</span>
              </span>
            </motion.div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ modes / demo posters */

const MODE_COPY: Record<Mode, string> = {
  concert: "Headliner + support",
  comedy: "Headliner + opener",
  sports: "Home vs away",
  festival: "Stages and acts",
};

export function Posters({ seeds, recent }: { seeds: ShowSummary[]; recent: ShowSummary[] }) {
  return (
    <section aria-labelledby="demos" className="mx-auto max-w-[1280px] px-4 py-24 md:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow className="text-stripe-violet dark:text-[#B9ADFF]">Four modes · four finished plans</Eyebrow>
          <Title id="demos">Pick a night. Open the console.</Title>
        </div>
        <Link href="/compare" className="inline-flex items-center gap-1.5 text-small font-semibold hover:underline">
          <BarChart3 className="size-4" aria-hidden /> Compare two shows
        </Link>
      </div>
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {seeds.map((s, i) => (
          <PosterCard key={s.id} s={s} i={i} />
        ))}
        {seeds.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-6 text-small text-muted-foreground sm:col-span-2 lg:col-span-4">
            The demo shows are loading or unavailable. You can still plan a new show.
          </div>
        ) : null}
      </div>
      {recent.length ? (
        <div className="mt-14">
          <Eyebrow className="text-muted-foreground">Created in this browser</Eyebrow>
          <h3 className="mt-1 font-display text-[1.6rem] font-bold">Your shows</h3>
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {recent.map((s, i) => (
              <PosterCard key={s.id} s={s} i={i} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function PosterCard({ s, i }: { s: ShowSummary; i: number }) {
  const date = new Date(`${s.date}T00:00:00Z`);
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: i * 0.08, type: "spring", stiffness: 80 }}
      whileHover={{ y: -8, rotate: i % 2 ? 1.2 : -1.2 }}
    >
      <Link href={`/shows/${s.id}`} className="group block overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-xl">
        <PosterArt mode={s.mode} className="aspect-[4/3]" />
        <div className="p-4">
          <div className="flex items-center justify-between text-label uppercase tracking-[0.12em] text-muted-foreground">
            <span>{s.mode}</span>
            <span>{MODE_COPY[s.mode]}</span>
          </div>
          <h3 className="mt-2 font-display text-[1.35rem] font-bold leading-tight">{s.title}</h3>
          <p className="mt-1 text-small text-muted-foreground">
            {s.venue} · {s.city}
          </p>
          <div className="mt-4 flex items-end justify-between">
            <div className="font-display text-[2.4rem] font-extrabold leading-none tabular" suppressHydrationWarning>
              {date.toLocaleDateString("en-GB", { day: "2-digit", timeZone: "UTC" })}
              <span className="ml-1 text-small font-semibold uppercase text-muted-foreground">{date.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}</span>
            </div>
            <span className="inline-flex items-center gap-1 text-small font-semibold">
              {s.items ? `${s.items} picks` : "No plan yet"} <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
