"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Clock, Maximize2, Pause, Play, RotateCcw, Volume2, VolumeX, X } from "lucide-react";
import type { Show } from "@housemix/shared";
import { cn } from "cn";
import { TopBar } from "@/components/app-shell";
import { BrandMark } from "@/components/brand-mark";
import { ModeChip } from "@/components/status";
import { buildNight, fmt, OWNERS, type Owner, type Segment } from "@/lib/night";
import { CueSynth, PROFILE_LABEL, profileFor, styleFor } from "@/lib/live-audio";

const SPEEDS = [
  { v: 1, label: "Real time" },
  { v: 60, label: "60×" },
  { v: 300, label: "300×" },
];

function Hud({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("hud", className)}>{children}</div>;
}

function Visualizer({ synth, active }: { synth?: CueSynth; active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    let raf = 0;
    const data = new Uint8Array(synth?.analyser.frequencyBinCount ?? 64);
    const draw = () => {
      c.width = c.clientWidth;
      c.height = c.clientHeight;
      ctx.clearRect(0, 0, c.width, c.height);
      if (synth && active) synth.analyser.getByteFrequencyData(data);
      else data.fill(0);
      const bars = 48;
      const w = c.width / bars;
      for (let i = 0; i < bars; i++) {
        const v = (data[Math.floor((i / bars) * data.length * 0.7)] ?? 0) / 255;
        const h = Math.max(2, v * c.height);
        ctx.fillStyle = i % 12 === 11 ? "#E8271C" : "#F1F1F1";
        // Dot-matrix columns, like the rest of the brand.
        for (let y = c.height - 3; y > c.height - h; y -= 4) ctx.fillRect(i * w + 1, y, Math.max(1, w - 2), 2);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [synth, active]);
  return <canvas ref={ref} className="h-24 w-full" aria-hidden />;
}

export function LivePage({ show }: { show: Show }) {
  const night = useMemo(() => buildNight(show), [show]);
  const tags = useMemo(() => [...(show.plan?.crowd.tags ?? []).map((t) => t.name), ...(show.plan?.crowd.compare ?? []).map((c) => c.name)], [show]);
  const profile = useMemo(() => profileFor(tags, show.input.mode), [tags, show.input.mode]);

  const [t, setT] = useState(night.start);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(60);
  const [delays, setDelays] = useState<{ from: number; minutes: number }[]>([]);
  const [owner, setOwner] = useState<Owner | "All">("All");
  const [done, setDone] = useState<Record<string, string>>({});
  const [muted, setMuted] = useState(false);
  const [foh, setFoh] = useState(false);
  const [synth, setSynth] = useState<CueSynth>();
  const storeKey = `hm-live-${show.id}`;

  // Crew "called" marks survive a reload in this browser only.
  useEffect(() => {
    try {
      setDone(JSON.parse(localStorage.getItem(storeKey) ?? "{}"));
    } catch {
      setDone({});
    }
  }, [storeKey]);
  const mark = (id: string) =>
    setDone((d) => {
      const n = { ...d };
      if (n[id]) delete n[id];
      else n[id] = fmt(t);
      try {
        localStorage.setItem(storeKey, JSON.stringify(n));
      } catch {
        // private window: marks stay in memory
      }
      return n;
    });

  const adj = useCallback((at: number) => at + delays.filter((d) => at >= d.from).reduce((s, d) => s + d.minutes, 0), [delays]);
  const totalDelay = delays.reduce((s, d) => s + d.minutes, 0);
  const end = night.end + totalDelay;

  // The show clock: night-minutes advance at `speed` per real minute.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 60000;
      last = now;
      setT((x) => {
        const n = x + dt * speed;
        if (n >= end) {
          setPlaying(false);
          return end;
        }
        return n;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, end]);

  const segs = night.segments.map((s) => ({ ...s, start: adj(s.start), end: adj(s.end) }));
  const onNow = (s: Segment) => s.start <= t && t < s.end;
  const stage = segs.find((s) => onNow(s) && (s.kind === "music" || s.kind === "act"));
  const openNow = segs.filter((s) => onNow(s) && s.kind !== "music" && s.kind !== "act");
  const nextUp = segs
    .filter((s) => (s.kind === "music" || s.kind === "act") && s.start >= (stage?.end ?? t) - 0.01)
    .sort((a, b) => a.start - b.start)
    .slice(0, 3);
  const cues = night.cues.map((c) => ({ ...c, at: adj(c.at) }));
  const nextCue = cues.find((c) => c.at > t && !done[c.id]);
  const sponsor = openNow.find((s) => s.kind === "brand");

  // Audio follows the stage: the artist's real song (a 30-second preview) when House Mix found one, otherwise a cue
  // synthesized in the crowd's style; silence between.
  const stageId = playing && stage?.audible ? stage.item.pick.qlooId : undefined;
  const song = stage?.audible ? show.music?.picks.find((p) => p.itemId === stage.item.id)?.tracks.find((x) => x.previewUrl) : undefined;
  const songUrl = playing ? song?.previewUrl : undefined;
  useEffect(() => {
    if (!synth) return;
    synth.preview(songUrl);
    synth.play(stageId && !songUrl ? styleFor(stageId, profile) : undefined);
  }, [synth, stageId, songUrl, profile]);
  useEffect(() => {
    if (synth) synth.volume = muted ? 0 : 0.7;
  }, [synth, muted]);
  useEffect(() => () => synth?.close(), [synth]);

  const toggle = async () => {
    if (!synth) {
      const s = new CueSynth();
      await s.resume();
      setSynth(s);
    } else await synth.resume();
    if (t >= end) setT(night.start);
    setPlaying((p) => !p);
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "BUTTON" || el.tagName === "SELECT")) return;
      if (e.key === " ") {
        e.preventDefault();
        void toggle();
      }
      if (e.key === "Escape") setFoh(false);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  const pct = (x: number) => `${((x - night.start) / (end - night.start)) * 100}%`;
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setT(night.start + ((e.clientX - r.left) / r.width) * (end - night.start));
  };
  const style = stage?.audible ? styleFor(stage.item.pick.qlooId, profile) : undefined;
  const shown = cues.filter((c) => owner === "All" || c.owner === owner);

  return (
    <div className="dark min-h-svh bg-background text-foreground">
      <TopBar />
      <main id="main" className="mx-auto grid max-w-[1500px] gap-4 px-4 py-4 md:px-6">
        {/* Transport */}
        <section aria-label="Show control" className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
          <Link href={`/shows/${show.id}`} className="hud flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" aria-hidden /> Console
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <ModeChip mode={show.input.mode} />
              <Hud className="text-[#FF8A80]">Run the night</Hud>
              {show.qlooMode === "mock" ? <Hud className="rounded border border-[#FF8A80]/50 px-1.5 text-[#FF8A80]">Mock data</Hud> : null}
            </div>
            <h1 className="mt-1 truncate font-display text-[1.8rem] font-bold uppercase leading-none">{show.title}</h1>
          </div>
          <div className="text-right">
            <div className="font-dot text-[2.6rem] font-black leading-none tabular" aria-live="off">
              {fmt(t)}
            </div>
            <Hud className="text-muted-foreground">Show clock{totalDelay ? ` · running ${totalDelay} min late` : ""}</Hud>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void toggle()}
              className="flex h-10 items-center gap-2 rounded-full bg-[#C8160D] px-4 text-[13px] font-semibold text-white hover:brightness-110"
              aria-pressed={playing}
            >
              {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
              {playing ? "Pause" : t > night.start ? "Resume" : "Start the show"}
            </button>
            <div role="radiogroup" aria-label="Clock speed" className="flex rounded-full border p-0.5">
              {SPEEDS.map((s) => (
                <button
                  key={s.v}
                  type="button"
                  role="radio"
                  aria-checked={speed === s.v}
                  onClick={() => setSpeed(s.v)}
                  className={cn("hud rounded-full px-2.5 py-1", speed === s.v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setDelays((d) => [...d, { from: t, minutes: 5 }])}
              className="hud flex h-8 items-center gap-1.5 rounded-full border px-3 hover:bg-muted"
              title="Push every cue from now on back by five minutes"
            >
              <Clock className="size-3.5" aria-hidden /> +5 min late
            </button>
            <button type="button" onClick={() => setMuted((m) => !m)} className="grid size-8 place-items-center rounded-full border hover:bg-muted" aria-label={muted ? "Unmute" : "Mute"}>
              {muted ? <VolumeX className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
            </button>
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                setT(night.start);
                setDelays([]);
              }}
              className="grid size-8 place-items-center rounded-full border hover:bg-muted"
              aria-label="Back to doors"
            >
              <RotateCcw className="size-4" aria-hidden />
            </button>
            <button type="button" onClick={() => setFoh(true)} className="hud flex h-8 items-center gap-1.5 rounded-full border px-3 hover:bg-muted">
              <Maximize2 className="size-3.5" aria-hidden /> Venue screen
            </button>
          </div>
        </section>

        {/* Timeline */}
        <section aria-label="The night" className="rounded-xl border bg-card p-3">
          <div className="relative cursor-pointer" onClick={seek} role="presentation">
            <div className="grid gap-1">
              {night.slots.map((s) => (
                <div key={s.key} className="relative h-6">
                  <span className="hud absolute left-0 top-1 z-10 text-[10px] text-muted-foreground">{s.label}</span>
                  <span
                    className="absolute inset-y-0 rounded-sm border border-white/15 bg-white/[0.06]"
                    style={{ left: pct(adj(s.start)), width: `calc(${pct(adj(s.end))} - ${pct(adj(s.start))})` }}
                  />
                  {segs
                    .filter((g) => g.slotKey === s.key && (g.kind === "music" || g.kind === "act"))
                    .map((g) => (
                      <span
                        key={g.id}
                        className={cn("absolute inset-y-1 border-l", onNow(g) ? "border-[#E8271C] bg-[#E8271C]/30" : "border-white/25")}
                        style={{ left: pct(g.start), width: `calc(${pct(g.end)} - ${pct(g.start)})` }}
                        title={`${fmt(g.start)} ${g.item.pick.name}`}
                      />
                    ))}
                </div>
              ))}
            </div>
            <span className="pointer-events-none absolute inset-y-0 w-[2px] bg-[#E8271C] shadow-[0_0_12px_#E8271C]" style={{ left: pct(t) }} aria-hidden />
          </div>
          <div className="mt-2 flex justify-between">
            <Hud className="text-muted-foreground">Doors {fmt(night.start)}</Hud>
            <Hud className="text-muted-foreground">Click the timeline to jump · space to play or pause</Hud>
            <Hud className="text-muted-foreground">{fmt(end)}</Hud>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          {/* Stage deck */}
          <section aria-label="On stage now" className="grid content-start gap-4 rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Hud className="text-[#FF8A80]">
                  {stage ? (stage.kind === "music" ? "Now playing" : "On stage") : t < night.start + 0.01 ? "Before doors" : "Between cues"}{" "}
                  {stage ? `· ${stage.slotLabel} · ${fmt(stage.start)}–${fmt(stage.end)}` : ""}
                </Hud>
                <div className="mt-1 truncate font-display text-[clamp(2.2rem,4.6vw,3.8rem)] font-bold uppercase leading-[0.95]" aria-live="polite">
                  {stage ? stage.item.pick.name : nextUp[0] ? `Next: ${nextUp[0].item.pick.name}` : "That's the night"}
                </div>
                {song ? (
                  <div className="mt-1 truncate text-[15px] text-muted-foreground">
                    “{song.title}”{song.album ? ` · ${song.album}` : ""}
                  </div>
                ) : null}
              </div>
              {stage?.item.isWildcard ? <Hud className="shrink-0 rounded border px-1.5 py-0.5">Stretch pick</Hud> : null}
            </div>
            <Visualizer synth={synth} active={Boolean(stageId)} />
            {stage ? (
              <div className="grid gap-2">
                <div className="border-l-2 border-[#5EE0CF] pl-3">
                  <Hud className="text-muted-foreground">Qloo says</Hud>
                  <p className="line-clamp-2 font-mono text-[12.5px] leading-snug" title={stage.item.qlooSays}>
                    {stage.item.qlooSays}
                  </p>
                </div>
                {stage.item.action ? (
                  <div className="border-l-2 border-[#E8271C] pl-3">
                    <Hud className="text-muted-foreground">Crew action</Hud>
                    <p className="text-[14px] leading-snug">{stage.item.action}</p>
                  </div>
                ) : null}
              </div>
            ) : null}
            <Hud className="text-muted-foreground">
              {song
                ? `Playing a 30-second preview of “${song.title}” · ${song.artist} (Apple Music), looping while they're on. A rehearsal: on the night, the venue's licensed music service plays the set.`
                : style
                  ? `Synthesized cue · ${PROFILE_LABEL[style.profile]} · ${style.bpm} BPM, styled on tonight's Qloo crowd read. Not the recording.`
                  : stage && !stage.audible
                    ? "A set by a person: no music cue. The house mic is theirs."
                    : "Press Start the show. Audio plays only after you press it."}
            </Hud>
            {nextUp.length ? (
              <div>
                <Hud className="text-muted-foreground">Up next</Hud>
                <ol className="mt-1.5 grid gap-1">
                  {nextUp.map((g) => (
                    <li key={g.id} className="flex items-center gap-3 rounded-lg bg-white/[0.04] px-3 py-2">
                      <span className="font-dot text-[1.1rem] font-black tabular">{fmt(g.start)}</span>
                      <span className="min-w-0 flex-1 truncate font-medium">{g.item.pick.name}</span>
                      <Hud className="text-muted-foreground">{g.slotLabel}</Hud>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            {openNow.length ? (
              <div>
                <Hud className="text-muted-foreground">Open now on the floor</Hud>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {openNow.map((g) => (
                    <li key={g.id} className="rounded-full border px-2.5 py-1 text-[12.5px]">
                      {g.item.pick.name} <span className="text-muted-foreground">· {g.slotLabel}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          {/* Crew cue sheet */}
          <section aria-labelledby="cues-title" className="flex min-h-0 flex-col rounded-xl border bg-card">
            <div className="border-b p-3">
              <div className="flex items-center justify-between">
                <h2 id="cues-title" className="font-display text-[1.4rem] font-bold uppercase leading-none">
                  Crew cues
                </h2>
                <Hud className="text-muted-foreground">
                  {Object.keys(done).length}/{cues.length} called
                </Hud>
              </div>
              <div role="radiogroup" aria-label="Show cues for" className="mt-2 flex flex-wrap gap-1">
                {(["All", ...OWNERS] as const).map((o) => (
                  <button
                    key={o}
                    type="button"
                    role="radio"
                    aria-checked={owner === o}
                    onClick={() => setOwner(o)}
                    className={cn("hud rounded-full border px-2 py-0.5 text-[10px]", owner === o ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
                  >
                    {o}
                  </button>
                ))}
              </div>
              {nextCue ? (
                <Hud className="mt-2 text-[#FF8A80]">
                  Next cue {fmt(nextCue.at)} · {nextCue.owner} · {nextCue.title}
                </Hud>
              ) : null}
            </div>
            <ol className="max-h-[520px] overflow-y-auto p-2">
              {shown.map((c) => {
                const now = c.at <= t && !done[c.id];
                const late = now && t - c.at > 10;
                return (
                  <li key={c.id} className={cn("grid grid-cols-[3.2rem_1fr_auto] items-start gap-2 rounded-lg px-2 py-2", now && "bg-[#E8271C]/12", done[c.id] && "opacity-55")}>
                    <span className="font-dot text-[1rem] font-black leading-tight tabular">{fmt(c.at)}</span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[13.5px] font-semibold">{c.title}</span>
                        <Hud className="rounded border px-1 text-[9.5px] text-muted-foreground">{c.owner}</Hud>
                        {late ? <Hud className="text-[9.5px] text-[#FF8A80]">overdue</Hud> : null}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[12.5px] text-muted-foreground">{c.detail}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => mark(c.id)}
                      className={cn("grid size-7 place-items-center rounded-full border", done[c.id] ? "border-[#5EE0CF] bg-[#5EE0CF] text-background" : "hover:bg-muted")}
                      aria-label={done[c.id] ? `Undo called: ${c.title}` : `Mark called: ${c.title}`}
                      aria-pressed={Boolean(done[c.id])}
                    >
                      <Check className="size-3.5" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      </main>

      {/* Front-of-house screen: what the venue's own screens would show tonight. */}
      {foh ? (
        <div role="dialog" aria-modal="true" aria-label="Venue screen" className="fixed inset-0 z-[70] flex flex-col bg-[#0A0A0A] p-6 text-[#F1F1F1] md:p-10">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <BrandMark className="size-7" />
              <span className="hud">{show.input.venue} · tonight</span>
            </span>
            <span className="font-dot text-[2.4rem] font-black">{fmt(t)}</span>
            <button type="button" onClick={() => setFoh(false)} className="grid size-9 place-items-center rounded-full border border-white/30" aria-label="Close the venue screen">
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <div className="my-auto">
            <Hud className="text-[#FF6B60]">{stage ? (stage.kind === "music" ? "Now playing" : "On stage") : "Up next"}</Hud>
            <div className="mt-2 font-display text-[clamp(3rem,10vw,9rem)] font-bold uppercase leading-[0.85]">{stage?.item.pick.name ?? nextUp[0]?.item.pick.name ?? show.title}</div>
            {nextUp[0] && stage ? (
              <div className="mt-6 font-display text-[clamp(1.4rem,3vw,2.6rem)] font-bold uppercase text-[#A3A3A3]">
                Then {nextUp[0].item.pick.name} · {fmt(nextUp[0].start)}
              </div>
            ) : null}
          </div>
          <div className="grid gap-4 border-t border-white/15 pt-4 md:grid-cols-2">
            <div>
              <Hud className="text-[#A3A3A3]">Open now</Hud>
              <div className="mt-1 text-[clamp(1rem,1.6vw,1.4rem)]">
                {openNow
                  .filter((g) => g.kind !== "brand")
                  .map((g) => g.item.pick.name)
                  .join(" · ") || "—"}
              </div>
            </div>
            <div className="md:text-right">
              <Hud className="text-[#A3A3A3]">With</Hud>
              <div className="mt-1 text-[clamp(1rem,1.6vw,1.4rem)]">{sponsor?.item.pick.name ?? "—"}</div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
