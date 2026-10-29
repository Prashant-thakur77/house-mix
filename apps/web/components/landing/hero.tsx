"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Play } from "lucide-react";
import type { Evidence, Show } from "@housemix/shared";
import { StatusChip } from "@/components/status";

const HeroScene = dynamic(() => import("./hero-scene"), { ssr: false });

function Timecode() {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const s = (n: number) => String(n).padStart(2, "0");
  return (
    <span className="font-mono tabular" suppressHydrationWarning>
      18:{s(30 + (Math.floor(t / 60) % 30))}:{s(t % 60)}
    </span>
  );
}

/** Replays real Qloo calls from a seeded plan, one row at a time, like the console's trace. */
function TracePanel({ calls }: { calls: Evidence[] }) {
  const [n, setN] = useState(1);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce || calls.length < 2) return;
    const id = setInterval(() => setN((x) => (x >= calls.length ? 1 : x + 1)), 900);
    return () => clearInterval(id);
  }, [calls.length, reduce]);
  const shown = (reduce ? calls.slice(0, 6) : calls.slice(Math.max(0, n - 6), n)).slice(-6);
  return (
    <div className="relative rounded-xl p-px [background:conic-gradient(from_180deg,#FF4F9A,#FFC83D,#17A398,#6B4CF6,#FF4F9A)] shadow-[0_0_60px_-10px_rgba(255,79,154,0.45)]">
      <div className="rounded-[11px] bg-stage-2/95 p-3 backdrop-blur">
        <div className="mb-2 flex items-center justify-between text-label uppercase tracking-[0.12em] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 animate-live rounded-full bg-stripe-pink" aria-hidden /> Agent trace
          </span>
          <span className="font-mono normal-case tracking-normal">{calls.length} Qloo calls</span>
        </div>
        <ol className="grid gap-1 font-mono text-[12px]" aria-label="Qloo calls from a seeded plan">
          {shown.map((c, i) => (
            <motion.li key={`${c.callId}-${i}`} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 rounded-md bg-white/[0.04] px-2 py-1">
              <span className="min-w-0 flex-1 truncate">{c.tool}</span>
              <StatusChip status={c.status} compact />
              <span className="w-12 text-right text-muted-foreground">{c.source === "cache" ? "cache" : `${c.durationMs}ms`}</span>
            </motion.li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** Desktop gets the WebGL crowd once the page is idle; phones get a CSS crowd that costs almost nothing. */
function StageBackdrop({ reduced }: { reduced: boolean }) {
  const [mode, setMode] = useState<"none" | "css" | "webgl">("none");
  useEffect(() => {
    if (window.innerWidth < 768) return setMode("css");
    const go = () => setMode("webgl");
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) ric(go, { timeout: 1500 });
    else setTimeout(go, 600);
  }, []);
  if (mode === "webgl") return <HeroScene reduced={reduced} />;
  if (mode === "css") return <CssCrowd />;
  return null;
}

const CROWD_COLORS = ["#C4133C", "#F2501E", "#FF9F1C", "#FFC83D", "#17A398", "#6B4CF6", "#FF4F9A"];

function CssCrowd() {
  return (
    <div className="absolute inset-x-0 bottom-0 flex h-full flex-col justify-end gap-1 overflow-hidden pb-2" aria-hidden>
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex justify-center gap-1.5" style={{ opacity: 0.55 + row * 0.2, transform: `scale(${0.8 + row * 0.12})` }}>
          {Array.from({ length: 16 }, (_, i) => (
            <span
              key={i}
              className="block h-11 w-5 shrink-0 animate-[float_1.4s_ease-in-out_infinite] rounded-full"
              style={{ background: CROWD_COLORS[Math.floor(((i / 16) * CROWD_COLORS.length + row) % CROWD_COLORS.length)], animationDelay: `${(i * 0.09 + row * 0.2) % 1.4}s` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

const LINES = ["Program the night", "for the crowd that's", "actually coming."];
// Line 2 carries the gradient word.

export function Hero({ demo, show }: { demo?: string; show?: Show }) {
  const reduce = Boolean(useReducedMotion());
  const calls = useMemo(() => {
    const seen = new Set<string>();
    const out: Evidence[] = [];
    for (const s of show?.plan?.slots ?? []) for (const i of s.items) for (const e of i.evidence) if (!seen.has(e.callId) && seen.add(e.callId)) out.push(e);
    for (const e of show?.plan?.crowd.evidence ?? []) if (!seen.has(e.callId) && seen.add(e.callId)) out.unshift(e);
    return out;
  }, [show]);
  const items = show?.plan?.slots.reduce((n, s) => n + s.items.length, 0) ?? 0;

  return (
    <section className="stage grain relative isolate overflow-hidden" aria-labelledby="hero-title">
      <div className="absolute inset-0 -z-10 [background:radial-gradient(60%_50%_at_20%_10%,rgba(107,76,246,0.35),transparent),radial-gradient(50%_45%_at_85%_20%,rgba(255,79,154,0.28),transparent),radial-gradient(70%_60%_at_50%_110%,rgba(255,159,28,0.25),transparent)]" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-[62%] opacity-90 md:h-[70%]">
        <StageBackdrop reduced={reduce} />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-stage to-transparent" />

      <div className="mx-auto grid min-h-[calc(100svh-6rem)] max-w-[1280px] grid-rows-[auto_1fr_auto] px-4 pb-8 pt-6 md:px-6">
        <div className="flex flex-wrap items-center gap-2 text-label uppercase tracking-[0.14em] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-stripe-crimson/60 bg-stripe-crimson/15 px-2.5 py-1 text-[#FF8FA8]">
            <span className="size-1.5 animate-live rounded-full bg-[#FF5C7A]" aria-hidden /> On air · <Timecode />
          </span>
          <span className="rounded-full border px-2.5 py-1">Concert · Comedy · Sports · Festival</span>
        </div>

        <div className="grid content-end gap-8 py-10">
          <h1 id="hero-title" className="font-display text-[clamp(2.5rem,6.6vw,6rem)] font-extrabold leading-[0.92] tracking-[-0.035em]">
            {LINES.map((l, i) => (
              <span key={l} className="block overflow-hidden pb-[0.06em]">
                <span className="hero-rise block" style={{ animationDelay: `${0.1 + i * 0.12}s` }}>
                  {i === 1 ? (
                    <>
                      for the <span className="bg-[linear-gradient(90deg,#FF4F9A,#FF9F1C,#FFC83D)] bg-clip-text text-transparent">crowd</span> that&apos;s
                    </>
                  ) : (
                    l
                  )}
                </span>
              </span>
            ))}
          </h1>
          <div className="grid items-end gap-8 lg:grid-cols-[1fr_360px]">
            <div>
              {/* No entrance on the paragraph: it is the largest paint, so it shows at first paint. */}
              <p className="max-w-[58ch] text-[1.05rem] leading-relaxed text-muted-foreground [text-shadow:0_1px_12px_rgba(11,10,18,0.9)]"
              >
                House Mix is an agent team for venue GMs, promoters and sponsorship teams. Give it tonight&apos;s bill and city. It reads the crowd with Qloo taste data and programs the walk-in music,
                openers, food and drink, sponsor activations and the after-party, with the evidence behind every pick.
              </p>
              <div style={{ animationDelay: "0.6s" }} className="hero-fade mt-8 flex flex-wrap gap-3">
                <Link
                  href="/new"
                  className="group inline-flex h-12 items-center gap-2 rounded-full bg-stripe-sun px-6 text-[15px] font-semibold text-stage-ink shadow-[0_8px_30px_-6px_rgba(255,200,61,0.6)] transition-transform hover:-translate-y-0.5"
                >
                  Plan a show <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
                </Link>
                {demo ? (
                  <Link
                    href={`/shows/${demo}`}
                    className="inline-flex h-12 items-center gap-2 rounded-full border border-white/25 bg-white/5 px-6 text-[15px] font-semibold backdrop-blur transition-colors hover:bg-white/10"
                  >
                    <Play className="size-4" aria-hidden /> Open a finished plan
                  </Link>
                ) : null}
              </div>
            </div>
            <div style={{ animationDelay: "0.8s" }} className="hero-fade hidden lg:block">
              {calls.length ? <TracePanel calls={calls} /> : null}
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4">
          {[
            ["10", "Qloo tools in every plan"],
            ["5", "Claude agents per run"],
            [String(items || 26), "picks, each with a citation"],
            ["0", "auto-picked names"],
          ].map(([k, v]) => (
            <div key={v} className="bg-stage/80 px-4 py-3 backdrop-blur">
              <dt className="sr-only">{v}</dt>
              <dd className="font-display text-[1.9rem] font-bold leading-none tabular">{k}</dd>
              <dd className="mt-1 text-small text-muted-foreground">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
