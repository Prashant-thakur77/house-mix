"use client";

import { useEffect, useRef, useState } from "react";
import { AudioLines, Download, Gavel, Loader2, Pause, Play, RotateCcw } from "lucide-react";
import type { Briefing, Show } from "@housemix/shared";
import { cn } from "cn";
import { api, ApiError, audioUrl } from "@/lib/api";
import { Kicker } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { usePrefersReducedMotion } from "@/lib/hooks";

const SPEAKER = { A: "Show caller", B: "Floor lead" } as const;

function useDeviceVoices(lines: Briefing["lines"], onLine: (i: number) => void) {
  const [playing, setPlaying] = useState(false);
  const stop = () => {
    window.speechSynthesis?.cancel();
    setPlaying(false);
  };
  const play = (from = 0) => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const voices = synth.getVoices().filter((v) => v.lang.startsWith("en"));
    const va = voices[0];
    const vb = voices.find((v) => v !== va && v.name !== va?.name) ?? va;
    setPlaying(true);
    lines.slice(from).forEach((l, k) => {
      const u = new SpeechSynthesisUtterance(l.text);
      u.voice = (l.speaker === "A" ? va : vb) ?? null;
      u.pitch = l.speaker === "A" ? 0.95 : 1.1;
      u.rate = 1.03;
      u.onstart = () => onLine(from + k);
      if (from + k === lines.length - 1) u.onend = () => setPlaying(false);
      synth.speak(u);
    });
  };
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  return { playing, play, stop };
}

export function BriefingSheet({ show, onBriefing }: { show: Show; onBriefing: (b: Briefing) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [active, setActive] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const audioRef = useRef<HTMLAudioElement>(null);
  const reduced = usePrefersReducedMotion();
  const b = show.briefing && show.briefing.planVersion === show.version ? show.briefing : undefined;
  const device = useDeviceVoices(b?.lines ?? [], setActive);

  const generate = async (force = false) => {
    setBusy(true);
    setError(undefined);
    try {
      onBriefing(await api.briefing(show.id, force));
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (active < 0) return;
    document.getElementById(`bline-${active}`)?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }, [active, reduced]);

  const onTime = () => {
    const t = (audioRef.current?.currentTime ?? 0) * 1000;
    const i = b?.lines.findIndex((l) => l.startMs !== undefined && l.endMs !== undefined && t >= l.startMs && t < l.endMs) ?? -1;
    if (i >= 0 && i !== active) setActive(i);
  };
  const seek = (i: number) => {
    const l = b?.lines[i];
    if (!l) return;
    if (b?.audio.available && audioRef.current && l.startMs !== undefined) {
      audioRef.current.currentTime = l.startMs / 1000;
      void audioRef.current.play();
    } else device.play(i);
    setActive(i);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" disabled={!show.plan} />}>
        <AudioLines data-icon="inline-start" /> Briefing
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Pre-show briefing</SheetTitle>
          <SheetDescription>Two voices, about 90 seconds, for doors, bar and stage crew. Every line cites the plan's Qloo evidence; the judge removes any line it cannot support.</SheetDescription>
        </SheetHeader>
        <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr] gap-3 px-4 pb-4">
          {!b ? (
            <div className="grid gap-3">
              {error ? (
                <Alert variant="destructive">
                  <AlertTitle>Could not write the briefing</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <Button onClick={() => generate()} disabled={busy} size="lg">
                {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <AudioLines data-icon="inline-start" />}
                {busy ? "Writing, judging and voicing…" : `Write the briefing for plan v${show.version}`}
              </Button>
              {show.briefing && show.briefing.planVersion !== show.version ? (
                <p className="text-small text-muted-foreground">The plan changed since the last briefing (v{show.briefing.planVersion}); write a new one.</p>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-2 rounded-lg border p-3">
              {b.audio.available && b.audio.url ? (
                <audio
                  ref={audioRef}
                  src={audioUrl(b.audio.url)}
                  onTimeUpdate={onTime}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onEnded={() => setPlaying(false)}
                  preload="metadata"
                />
              ) : null}
              <div className="flex items-center gap-2">
                <Button
                  size="icon-lg"
                  aria-label={playing || device.playing ? "Pause" : "Play"}
                  onClick={() => {
                    if (b.audio.available && audioRef.current) {
                      if (audioRef.current.paused) void audioRef.current.play();
                      else audioRef.current.pause();
                    } else if (device.playing) device.stop();
                    else device.play(Math.max(0, active));
                  }}
                >
                  {playing || device.playing ? <Pause /> : <Play />}
                </Button>
                <div className="min-w-0 flex-1">
                  <div className="text-small font-medium">{b.audio.available ? "Cloud Text-to-Speech · two voices" : "Device voices"}</div>
                  <div className="font-mono text-label text-muted-foreground">
                    {b.lines.length} lines · {b.dropped.length} removed by the judge
                    {b.audio.durationMs ? ` · ${Math.round(b.audio.durationMs / 1000)}s` : ""}
                  </div>
                </div>
                {b.audio.available ? (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="font-mono"
                      aria-label={`Playback speed ${rate}×`}
                      onClick={() => {
                        const r = rate === 1 ? 1.25 : rate === 1.25 ? 1.5 : 1;
                        setRate(r);
                        if (audioRef.current) audioRef.current.playbackRate = r;
                      }}
                    >
                      {rate}×
                    </Button>
                    <Button nativeButton={false} size="icon-sm" variant="ghost" aria-label="Download MP3" render={<a href={audioUrl(b.audio.url!)} download={`briefing-v${show.version}.mp3`} />}>
                      <Download />
                    </Button>
                  </>
                ) : null}
                <Button size="icon-sm" variant="ghost" aria-label="Write again" onClick={() => generate(true)} disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                </Button>
              </div>
              {!b.audio.available ? <p className="text-small text-muted-foreground">{b.audio.reason} Playing with this device's voices instead.</p> : null}
            </div>
          )}
          {b ? (
            <div className="min-h-0 overflow-y-auto">
              <ol className="grid gap-1" aria-label="Transcript">
                {b.lines.map((l, i) => (
                  <li key={i} id={`bline-${i}`}>
                    <button
                      type="button"
                      onClick={() => seek(i)}
                      className={cn("grid w-full grid-cols-[4.5rem_1fr] gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted", active === i && "bg-accent text-accent-foreground")}
                      aria-current={active === i ? "true" : undefined}
                    >
                      <span className="pt-0.5 text-label font-medium uppercase text-muted-foreground">{SPEAKER[l.speaker]}</span>
                      <span>
                        <span className="text-body-lg">{l.text}</span>
                        <span className="mt-0.5 block font-mono text-label text-subtle-foreground">{[...new Set(l.evidence.map((e) => e.tool))].join(" · ") || "no citation"}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              {b.dropped.length ? (
                <div className="mt-4 grid gap-1.5">
                  <Kicker className="flex items-center gap-1.5">
                    <Gavel className="size-3.5" aria-hidden /> Removed by the evidence judge
                  </Kicker>
                  {b.dropped.map((d, i) => (
                    <div key={i} className="rounded-md border border-dashed px-2.5 py-1.5 text-small text-muted-foreground">
                      <span className="line-through decoration-1">{d.text}</span>
                      <span className="mt-0.5 block text-label">{d.reason}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
