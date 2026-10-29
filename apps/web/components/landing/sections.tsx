"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { ArrowRight, AudioLines, BadgeCheck, Ban, Check, CircleHelp, EyeOff, ScanSearch, ShieldCheck, Sparkles, Users } from "lucide-react";
import type { Show } from "@housemix/shared";
import { cn } from "cn";

/* ------------------------------------------------------------------ intro curtain */

/**
 * Five poster stripes lift away on the first visit of a session. It is plain CSS in the static HTML,
 * so it plays from first paint; the inline script hides it on repeat visits before it paints.
 */
export function IntroCurtain() {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: "try{if(sessionStorage.getItem('hm-intro'))document.documentElement.classList.add('hm-intro-seen');else sessionStorage.setItem('hm-intro','1')}catch(e){document.documentElement.classList.add('hm-intro-seen')}",
        }}
      />
      <div className="intro-curtain pointer-events-none fixed inset-0 z-[60] flex" aria-hidden>
        {["bg-stripe-crimson", "bg-stripe-tangerine", "bg-stripe-amber", "bg-stripe-sun", "bg-stripe-teal"].map((c, i) => (
          <div key={c} className={cn("intro-stripe h-full flex-1", c)} style={{ animationDelay: `${0.55 + i * 0.07}s` }} />
        ))}
        <p className="intro-line absolute inset-x-0 top-1/2 text-center">
          <span className="rounded-full bg-stripe-crimson px-4 py-2 font-display text-[15px] font-semibold text-white shadow-lg">Soundchecking the crowd…</span>
        </p>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ ribbons */

const WORDS = ["Walk-in music", "Openers", "Halftime acts", "Food & drink", "Sponsor activations", "After-party", "Stretch picks", "Crew briefing"];

function Ribbon({ className, reverse, ink }: { className: string; reverse?: boolean; ink?: boolean }) {
  const row = [...WORDS, ...WORDS];
  return (
    <div className={cn("flex overflow-hidden whitespace-nowrap py-3", className)}>
      <div className={cn("flex shrink-0 gap-6 pr-6", reverse ? "animate-marquee-rev" : "animate-marquee")}>
        {row.map((w, i) => (
          <span key={i} className={cn("flex items-center gap-6 font-display text-[clamp(1.25rem,2.6vw,2rem)] font-extrabold uppercase tracking-[-0.01em]", ink ? "text-stage-ink" : "text-white")}>
            {w}
            <Sparkles className="size-5 shrink-0" aria-hidden />
          </span>
        ))}
      </div>
    </div>
  );
}

export function Ribbons() {
  return (
    <div className="relative z-10 -my-6 overflow-hidden py-10" aria-hidden>
      <Ribbon className="-rotate-[2.5deg] bg-stripe-crimson" />
      <Ribbon className="mt-5 rotate-[1.5deg] bg-stripe-sun shadow-xl" reverse ink />
    </div>
  );
}

/* ------------------------------------------------------------------ how it works (pinned) */

interface Step {
  n: string;
  title: string;
  body: string;
  tools: string[];
  icon: typeof ScanSearch;
  color: string;
}

const STEPS: Step[] = [
  {
    n: "01",
    title: "Tell it tonight's show",
    body: "Bill, venue, city, date and house rules. Every name is resolved with Qloo; anything ambiguous stops and asks you. Nothing is auto-picked.",
    tools: ["qloo_describe", "qloo_find_tags"],
    icon: ScanSearch,
    color: "#FFC83D",
  },
  {
    n: "02",
    title: "Read the crowd",
    body: "Shared and distinct taste between the two sides, aggregate age skew, the crowd's vocabulary and 90-day momentum.",
    tools: ["compare_audiences", "audience_demographics", "entity_tags", "trends"],
    icon: Users,
    color: "#FF4F9A",
  },
  {
    n: "03",
    title: "Program every slot",
    body: "A Claude planner sends one programmer per slot, a sponsor-fit agent and a wildcard. Every Qloo call streams into the live trace.",
    tools: ["recommend", "rank", "where_popular"],
    icon: AudioLines,
    color: "#17A398",
  },
  {
    n: "04",
    title: "The Critic checks it",
    body: "Each pick must cite a Qloo call whose results contain it. Claims the evidence doesn't support are cut before you ever see them.",
    tools: ["call ledger"],
    icon: ShieldCheck,
    color: "#9D8CFF",
  },
  {
    n: "05",
    title: "Approve, lock, brief the crew",
    body: "Approve, swap or reject line by line, lock a version, export the run-of-show and play a two-voice briefing to the door, bar and stage teams.",
    tools: ["rank (swap)", "Cloud TTS"],
    icon: BadgeCheck,
    color: "#FF9F1C",
  },
];

function StepVisual({ step, show }: { step: number; show?: Show }) {
  const crowd = show?.plan?.crowd;
  const slots = show?.plan?.slots ?? [];
  const sides = show?.entities.filter((e) => e.kind === "side") ?? [];
  switch (step) {
    case 0:
      return (
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            {(sides.length ? sides.map((s) => s.name ?? s.input) : ["Chelsea FC", "Arsenal FC"]).concat(show?.input.venue ?? "Stamford Bridge", show?.input.city ?? "London").map((n, i) => (
              <motion.span
                key={n}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.12 }}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-small"
              >
                <Check className="size-3.5 text-stripe-teal" aria-hidden /> {n}
              </motion.span>
            ))}
          </div>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="rounded-xl border border-stripe-sun/50 bg-stripe-sun/10 p-4">
            <div className="flex items-center gap-2 text-small font-semibold text-stripe-sun">
              <CircleHelp className="size-4" aria-hidden /> Qloo needs a choice: which &ldquo;Giants&rdquo;?
            </div>
            <ul className="mt-3 grid gap-1.5 text-small">
              {["San Francisco Giants · baseball", "New York Giants · American football", "Giants · band"].map((c, i) => (
                <li key={c} className={cn("flex items-center gap-2 rounded-lg px-3 py-2", i === 0 ? "bg-white/15 ring-1 ring-stripe-sun" : "bg-white/5")}>
                  <span className={cn("size-3 rounded-full border-2", i === 0 ? "border-stripe-sun bg-stripe-sun" : "border-white/40")} aria-hidden />
                  {c}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-label text-muted-foreground">The agent waits for you. It never guesses.</p>
          </motion.div>
        </div>
      );
    case 1: {
      const rows = (crowd?.compare ?? []).slice(0, 6);
      return (
        <div className="grid gap-2">
          <div className="flex justify-between text-label uppercase tracking-[0.1em] text-muted-foreground">
            <span>{crowd?.labelA || "Side A"}</span>
            <span>{crowd?.labelB || "Side B"}</span>
          </div>
          {rows.map((r, i) => (
            <div key={r.id} className="grid grid-cols-[1fr_6.5rem_1fr] items-center gap-2 text-small">
              <div className="flex justify-end">
                <motion.span className="h-3 rounded-l-full bg-stripe-pink" initial={{ width: 0 }} animate={{ width: `${r.a * 100}%` }} transition={{ delay: i * 0.08, duration: 0.7 }} />
              </div>
              <span className="truncate text-center">{r.name}</span>
              <motion.span className="h-3 rounded-r-full bg-stripe-teal" initial={{ width: 0 }} animate={{ width: `${r.b * 100}%` }} transition={{ delay: i * 0.08, duration: 0.7 }} />
            </div>
          ))}
          <p className="mt-1 text-label text-muted-foreground">From one qloo_compare_audiences call in a seeded plan.</p>
        </div>
      );
    }
    case 2:
      return (
        <div className="grid gap-2">
          {slots.slice(0, 5).map((s, i) => (
            <motion.div
              key={s.key}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.12 }}
              className="grid grid-cols-[4.5rem_1fr] items-center gap-3 rounded-lg bg-white/5 px-3 py-2"
            >
              <span className="font-mono text-label text-muted-foreground">{s.timeRange.split("–")[0]}</span>
              <div className="min-w-0">
                <div className="truncate text-small font-semibold">{s.label}</div>
                <div className="truncate text-label text-muted-foreground">
                  {s.items
                    .slice(0, 3)
                    .map((x) => x.pick.name)
                    .join(" · ")}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      );
    case 3: {
      const it = slots.flatMap((s) => s.items).find((x) => !x.isWildcard);
      return (
        <div className="relative grid gap-3 rounded-xl bg-white/5 p-4">
          <div className="font-display text-[1.6rem] font-bold">{it?.pick.name ?? "The Overpass"}</div>
          <div className="border-l-4 border-stripe-teal pl-3 font-mono text-small text-[#7FE3D8]">Qloo says: {it?.qlooSays ?? "rank: ranked #1 of 10, affinity 0.45."}</div>
          <div className="text-small">
            Our interpretation: fits the build-up for both ends.{" "}
            <motion.span className="relative text-muted-foreground" initial={{ opacity: 1 }} animate={{ opacity: 0.55 }} transition={{ delay: 0.6 }}>
              Topped the charts last summer.
              <motion.span className="absolute left-0 top-1/2 h-0.5 bg-stripe-crimson" initial={{ width: 0 }} animate={{ width: "100%" }} transition={{ delay: 0.5, duration: 0.5 }} />
            </motion.span>
          </div>
          <motion.span
            initial={{ opacity: 0, scale: 1.6, rotate: -18 }}
            animate={{ opacity: 1, scale: 1, rotate: -10 }}
            transition={{ delay: 0.9, type: "spring" }}
            className="absolute -right-2 -top-4 rounded-md border-2 border-stripe-sun px-2 py-1 font-display text-[13px] font-extrabold uppercase text-stripe-sun"
          >
            Cited ✓
          </motion.span>
          <p className="text-label text-muted-foreground">Unsupported claims (chart positions, sales, biographies) are removed, and the removal shows in the trace.</p>
        </div>
      );
    }
    default:
      return (
        <div className="grid gap-3">
          {slots
            .flatMap((s) => s.items)
            .slice(0, 4)
            .map((x, i) => (
              <motion.div key={x.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.15 }} className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2 text-small">
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.3 + i * 0.15, type: "spring" }}
                  className="grid size-6 place-items-center rounded-full bg-stripe-teal text-stage-ink"
                >
                  <Check className="size-3.5" aria-hidden />
                </motion.span>
                <span className="truncate">{x.pick.name}</span>
                <span className="ml-auto text-label text-muted-foreground">approved</span>
              </motion.div>
            ))}
          <div className="flex h-12 items-center gap-1 rounded-lg bg-white/5 px-3" aria-hidden>
            {Array.from({ length: 36 }, (_, i) => (
              <span key={i} className="w-1 flex-1 origin-center animate-eq rounded-full bg-stripe-amber" style={{ height: `${30 + ((i * 37) % 70)}%`, animationDelay: `${(i % 9) * 0.09}s` }} />
            ))}
          </div>
          <p className="text-label text-muted-foreground">Plan v1 locked · two-voice crew briefing ready</p>
        </div>
      );
  }
}

export function HowItWorks({ show }: { show?: Show }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    setProgress(p);
    setStep(Math.min(STEPS.length - 1, Math.floor(p * STEPS.length)));
  });
  const S = STEPS[step]!;
  return (
    <section aria-labelledby="how-title" className="stage relative">
      {/* Desktop: pinned, the stage card assembles the show as you scroll. */}
      <div ref={ref} className="relative hidden h-[420vh] md:block">
        <div className="sticky top-0 flex h-svh items-center overflow-hidden">
          <div className="mx-auto grid w-full max-w-[1280px] grid-cols-[1fr_1.1fr] gap-12 px-6">
            <div>
              <p className="text-label uppercase tracking-[0.16em] text-stripe-sun">How it works</p>
              <h2 id="how-title" className="mt-2 font-display text-[clamp(2.2rem,4.4vw,3.8rem)] font-extrabold leading-[0.95] tracking-[-0.03em]">
                From a lineup to a locked run-of-show.
              </h2>
              <ol className="mt-8 grid gap-1">
                {STEPS.map((s, i) => (
                  <li key={s.n} className={cn("grid grid-cols-[2.5rem_1fr] gap-3 rounded-xl px-3 py-2.5 transition-colors duration-300", i === step ? "bg-white/[0.07]" : "text-subtle-foreground")}>
                    <span className="font-mono text-small" style={{ color: i === step ? s.color : undefined }}>
                      {s.n}
                    </span>
                    <div>
                      <div className="font-display text-[1.2rem] font-bold leading-tight">{s.title}</div>
                      {i === step ? (
                        <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-1 text-small text-muted-foreground">
                          {s.body}
                        </motion.p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-6 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
                <div className="stripes h-full" style={{ width: `${Math.max(4, progress * 100)}%` }} />
              </div>
            </div>
            <div className="relative">
              <div className="absolute -inset-10 -z-10 rounded-full opacity-40 blur-3xl transition-colors duration-500" style={{ background: S.color }} aria-hidden />
              <div className="rounded-2xl border border-white/10 bg-stage-2/90 p-5 shadow-2xl backdrop-blur">
                <div className="mb-4 flex items-center justify-between">
                  <span className="flex items-center gap-2 font-display text-[1.05rem] font-bold">
                    <S.icon className="size-5" style={{ color: S.color }} aria-hidden /> {S.title}
                  </span>
                  <span className="flex flex-wrap justify-end gap-1">
                    {S.tools.map((t) => (
                      <span key={t} className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[11px]">
                        {t}
                      </span>
                    ))}
                  </span>
                </div>
                <AnimatePresence mode="wait">
                  <motion.div key={step} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.35 }} className="min-h-[300px]">
                    <StepVisual step={step} show={show} />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Mobile: the same steps, stacked. */}
      <div className="px-4 py-16 md:hidden">
        <p className="text-label uppercase tracking-[0.16em] text-stripe-sun">How it works</p>
        <h2 className="mt-2 font-display text-[2.2rem] font-extrabold leading-[0.95] tracking-[-0.03em]">From a lineup to a locked run-of-show.</h2>
        <ol className="mt-8 grid gap-6">
          {STEPS.map((s, i) => (
            <li key={s.n} className="rounded-2xl border border-white/10 bg-stage-2 p-4">
              <div className="flex items-center gap-2">
                <span className="font-mono text-small" style={{ color: s.color }}>
                  {s.n}
                </span>
                <span className="font-display text-[1.2rem] font-bold">{s.title}</span>
              </div>
              <p className="mt-1 text-small text-muted-foreground">{s.body}</p>
              <div className="mt-4">
                <StepVisual step={i} show={show} />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ trust */

const TRUST = [
  { icon: EyeOff, title: "Aggregate taste only", body: "Qloo affinities describe audiences, never a person. Names, emails, handles and device IDs are refused before any call." },
  { icon: CircleHelp, title: "Never auto-picks", body: "An ambiguous name becomes a confirm card. Nothing downstream runs until you choose." },
  { icon: ShieldCheck, title: "Evidence or it's cut", body: "Picks and sentences without a valid Qloo citation are removed by the Critic, and the trace shows why." },
  { icon: Ban, title: "No eligibility decisions", body: "Demographics set tone and pricing only. House Mix refuses to admit, exclude or target anyone." },
];

export function Trust() {
  return (
    <section aria-labelledby="trust-title" className="mx-auto max-w-[1280px] px-4 py-20 md:px-6">
      <p className="text-label uppercase tracking-[0.16em] text-stripe-crimson dark:text-stripe-pink">Safe by design</p>
      <h2 id="trust-title" className="mt-2 max-w-[22ch] font-display text-[clamp(2rem,4vw,3.2rem)] font-extrabold leading-[0.95] tracking-[-0.03em]">
        Taste data that knows its limits.
      </h2>
      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TRUST.map((t, i) => (
          <motion.li
            key={t.title}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ delay: i * 0.08 }}
            className="rounded-2xl border bg-card p-5"
          >
            <span
              className={cn(
                "grid size-10 place-items-center rounded-xl",
                ["bg-stripe-violet text-white", "bg-stripe-sun text-stage-ink", "bg-stripe-teal text-stage-ink", "bg-stripe-crimson text-white"][i],
              )}
            >
              <t.icon className="size-5" aria-hidden />
            </span>
            <h3 className="mt-4 font-display text-[1.15rem] font-bold">{t.title}</h3>
            <p className="mt-1 text-small text-muted-foreground">{t.body}</p>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ footer CTA */

export function FooterCta() {
  return (
    <footer className="stage relative overflow-hidden">
      <div className="stripes h-3" aria-hidden />
      <div className="mx-auto max-w-[1280px] px-4 pb-10 pt-20 md:px-6">
        <h2 className="max-w-[16ch] font-display text-[clamp(2.4rem,6vw,5rem)] font-extrabold leading-[0.92] tracking-[-0.035em]">Doors at 18:30. Your run-of-show by 18:05.</h2>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/new" className="group inline-flex h-12 items-center gap-2 rounded-full bg-stripe-sun px-6 text-[15px] font-semibold text-stage-ink transition-transform hover:-translate-y-0.5">
            Plan a show <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
          </Link>
          <Link href="/compare" className="inline-flex h-12 items-center rounded-full border border-white/25 px-6 text-[15px] font-semibold hover:bg-white/10">
            Compare two nights
          </Link>
        </div>
        <div
          className="pointer-events-none mt-16 select-none whitespace-nowrap font-display text-[clamp(3.5rem,13.5vw,12.5rem)] font-extrabold leading-[0.8] tracking-[-0.05em] text-transparent [-webkit-text-stroke:1.5px_rgba(255,255,255,0.18)]"
          aria-hidden
        >
          HOUSE MIX
        </div>
        <p className="mt-6 border-t border-white/10 pt-4 text-small text-muted-foreground">
          Qloo results describe aggregate audience affinities, never individuals. House Mix makes no eligibility decisions. MIT licensed.
        </p>
      </div>
    </footer>
  );
}
