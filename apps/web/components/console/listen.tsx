"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Download, ExternalLink, FileText, Headphones, ListMusic, Loader2, Pause, Play, SkipBack, SkipForward, Square } from "lucide-react";
import type { Music, Show, Track } from "@housemix/shared";
import { cn } from "cn";
import { api, cueSheetUrl, playlistUrl } from "@/lib/api";
import { Kicker } from "@/components/status";
import { Button } from "@/components/ui/button";

/**
 * Hear the night: the picks' real songs as 30-second previews from Apple's catalogue, one player for the whole console.
 * Previews are for the operator to audition; the playlist export feeds the venue's licensed music service.
 */

interface Listen {
  music?: Music;
  current?: Track;
  playing: boolean;
  queueLabel?: string;
  play: (track: Track, queue?: Track[], label?: string) => void;
  toggle: () => void;
  stop: () => void;
  next: () => void;
  prev: () => void;
  tracksFor: (itemId: string) => Track[];
}

const Ctx = createContext<Listen | null>(null);
export const useListen = () => useContext(Ctx);

export function ListenProvider({ music, children }: { music?: Music; children: React.ReactNode }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [index, setIndex] = useState(0);
  const [label, setLabel] = useState<string>();
  const [playing, setPlaying] = useState(false);
  const current = queue[index];

  useEffect(() => {
    const a = new Audio();
    a.preload = "none";
    audio.current = a;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    return () => {
      a.pause();
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
    };
  }, []);

  // The next preview starts when one ends, through the queue (a slot's whole set).
  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    const onEnded = () => setIndex((i) => (i + 1 < queue.length ? i + 1 : i));
    a.addEventListener("ended", onEnded);
    return () => a.removeEventListener("ended", onEnded);
  }, [queue.length]);

  useEffect(() => {
    const a = audio.current;
    if (!a || !current?.previewUrl) return;
    if (a.src !== current.previewUrl) {
      a.src = current.previewUrl;
      void a.play().catch(() => setPlaying(false));
    }
  }, [current]);

  const play = useCallback((track: Track, list?: Track[], name?: string) => {
    const q = (list ?? [track]).filter((t) => t.previewUrl);
    const k = Math.max(
      0,
      q.findIndex((t) => t.id === track.id),
    );
    setQueue(q);
    setIndex(k);
    setLabel(name);
    const a = audio.current;
    if (a && q[k]?.previewUrl === a.src) void a.play();
  }, []);
  const toggle = useCallback(() => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  }, []);
  const stop = useCallback(() => {
    audio.current?.pause();
    setQueue([]);
    setIndex(0);
  }, []);
  const byItem = useMemo(() => new Map((music?.picks ?? []).map((p) => [p.itemId, p.tracks])), [music]);
  const value: Listen = {
    music,
    current,
    playing,
    queueLabel: label,
    play,
    toggle,
    stop,
    next: () => setIndex((i) => Math.min(queue.length - 1, i + 1)),
    prev: () => setIndex((i) => Math.max(0, i - 1)),
    tracksFor: (id) => byItem.get(id) ?? [],
  };
  return (
    <Ctx.Provider value={value}>
      {children}
      <ListenBar audio={audio} queueLength={queue.length} index={index} />
    </Ctx.Provider>
  );
}

function ListenBar({ audio, queueLength, index }: { audio: React.RefObject<HTMLAudioElement | null>; queueLength: number; index: number }) {
  const l = useListen()!;
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      const a = audio.current;
      setProgress(a && a.duration ? a.currentTime / a.duration : 0);
    }, 250);
    return () => window.clearInterval(id);
  }, [audio]);
  if (!l.current) return null;
  const t = l.current;
  return (
    <div role="region" aria-label="Now previewing" className="no-print fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex max-w-screen-2xl items-center gap-3 px-4 py-2">
        {t.artwork ? <img src={t.artwork} alt="" className="size-10 shrink-0 rounded" /> : <Headphones className="size-6 shrink-0" aria-hidden />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-small font-semibold">
            {t.title} <span className="font-normal text-muted-foreground">· {t.artist}</span>
          </div>
          <div className="flex items-center gap-2 text-label text-muted-foreground">
            <span className="truncate">{l.queueLabel ? `${l.queueLabel} · ${index + 1} of ${queueLength} · ` : ""}30-second preview</span>
            <a href={t.url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-0.5 underline-offset-2 hover:underline">
              Full song on Apple Music <ExternalLink className="size-3" aria-hidden />
            </a>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded bg-muted" aria-hidden>
            <div className="h-full bg-ring transition-[width] duration-200" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {queueLength > 1 ? (
            <Button size="icon" variant="ghost" onClick={l.prev} disabled={index === 0} aria-label="Previous song">
              <SkipBack />
            </Button>
          ) : null}
          <Button size="icon" variant="outline" onClick={l.toggle} aria-label={l.playing ? "Pause" : "Play"}>
            {l.playing ? <Pause /> : <Play />}
          </Button>
          {queueLength > 1 ? (
            <Button size="icon" variant="ghost" onClick={l.next} disabled={index + 1 >= queueLength} aria-label="Next song">
              <SkipForward />
            </Button>
          ) : null}
          <Button size="icon" variant="ghost" onClick={l.stop} aria-label="Stop previews">
            <Square />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** A pick's top song, playable from its card. */
export function PickPreview({ itemId }: { itemId: string }) {
  const l = useListen();
  const tracks = l?.tracksFor(itemId) ?? [];
  const top = tracks.find((t) => t.previewUrl);
  if (!l || !top) return null;
  const on = l.current?.id === top.id && l.playing;
  return (
    <button
      type="button"
      onClick={() => (on ? l.toggle() : l.play(top, tracks, top.artist))}
      className="relative mt-2 flex max-w-full items-center gap-2 rounded-md border bg-background px-2 py-1 text-small hover:bg-muted"
    >
      {on ? <Pause className="size-3.5 shrink-0" aria-hidden /> : <Play className="size-3.5 shrink-0" aria-hidden />}
      <span className="truncate">
        <span className="sr-only">{on ? "Pause: " : "Play a preview: "}</span>
        {top.title} <span className="text-muted-foreground">· {tracks.length} songs</span>
      </span>
    </button>
  );
}

const len = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")}`;

/** The music slots as real playlists, timed from each slot's start, with the hand-off to the venue's systems. */
export function HearTheNight({ show, onMusic }: { show: Show; onMusic: (m: Music) => void }) {
  const l = useListen();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const music = show.music;
  const hasArtists = (show.plan?.slots ?? []).some((s) => s.items.some((i) => i.pick.type === "artist"));
  const find = useCallback(
    (force = false) => {
      setBusy(true);
      setError(undefined);
      api
        .music(show.id, force)
        .then(onMusic)
        .catch((e: Error) => setError(e.message))
        .finally(() => setBusy(false));
    },
    [show.id, onMusic],
  );
  // A new plan finds its songs on its own (about three seconds per artist: Apple's rate limit).
  const asked = useRef(false);
  useEffect(() => {
    if (!music && hasArtists && show.qlooMode === "live" && !asked.current) {
      asked.current = true;
      find();
    }
  }, [music, hasArtists, show.qlooMode, find]);
  if (!hasArtists) return null;
  return (
    <section aria-labelledby="hear-title" className="grid gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Kicker>Hear the night</Kicker>
          <h2 id="hear-title" className="mt-1 text-h2 font-semibold">
            The playlists, as real songs
          </h2>
          <p className="mt-1 max-w-[70ch] text-small text-muted-foreground">
            Qloo chose the artists; these are their most popular recordings, in the plan&apos;s order and timed to each slot. Press play to audition 30-second previews, then hand the playlist to the
            venue&apos;s licensed music service.
          </p>
        </div>
        {music ? (
          <div className="flex flex-wrap gap-2">
            <Button nativeButton={false} variant="outline" size="sm" render={<a href={playlistUrl(show.id, "csv")} download />}>
              <Download data-icon="inline-start" /> Playlist CSV
            </Button>
            <Button nativeButton={false} variant="outline" size="sm" render={<a href={playlistUrl(show.id, "m3u8")} download />}>
              <ListMusic data-icon="inline-start" /> M3U
            </Button>
            <Button nativeButton={false} variant="outline" size="sm" render={<a href={cueSheetUrl(show.id)} download />}>
              <FileText data-icon="inline-start" /> Cue sheet (PDF)
            </Button>
          </div>
        ) : null}
      </div>
      {!music ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed p-3 text-small">
          {busy ? (
            <span className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Finding each artist&apos;s songs in Apple&apos;s catalogue (about three seconds per artist)…
            </span>
          ) : (
            <>
              <span className="text-muted-foreground">{show.qlooMode === "mock" ? "Mock artists are fictional, so there are no songs to play." : "Find the picks' songs to hear the night."}</span>
              {show.qlooMode === "live" ? (
                <Button size="sm" onClick={() => find()}>
                  <Headphones data-icon="inline-start" /> Find the songs
                </Button>
              ) : null}
            </>
          )}
          {error ? (
            <span role="alert" className="text-destructive">
              {error}
            </span>
          ) : null}
        </div>
      ) : (
        <>
          {music.playlists.map((p) => {
            const tracks = p.entries.map((e) => e.track);
            const shown = open[p.slotKey] ? p.entries : p.entries.slice(0, 6);
            return (
              <div key={p.slotKey} className="rounded-md border">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
                  <div>
                    <div className="font-semibold">{p.label}</div>
                    <div className="font-mono text-label text-muted-foreground">
                      {p.timeRange} · {p.entries.length} songs · {p.filledMinutes} of {p.minutes} min
                    </div>
                  </div>
                  <Button size="sm" onClick={() => tracks[0] && l?.play(tracks[0], tracks, p.label)} disabled={!tracks.length}>
                    <Play data-icon="inline-start" /> Play the set
                  </Button>
                </div>
                <ol className="divide-y">
                  {shown.map((e, n) => {
                    const on = l?.current?.id === e.track.id && l.playing;
                    return (
                      <li key={`${e.track.id}-${n}`} className={cn("grid grid-cols-[3rem_2rem_1fr_auto] items-center gap-2 px-3 py-1.5 text-small", on && "bg-accent text-accent-foreground")}>
                        <span className="font-mono tabular text-muted-foreground">{e.at}</span>
                        <button
                          type="button"
                          onClick={() => (on ? l?.toggle() : l?.play(e.track, tracks, p.label))}
                          disabled={!e.track.previewUrl}
                          className="grid size-7 place-items-center rounded-full border hover:bg-muted disabled:opacity-40"
                          aria-label={on ? `Pause ${e.track.title}` : `Play a preview of ${e.track.title} by ${e.track.artist}`}
                        >
                          {on ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                        </button>
                        <span className="min-w-0 truncate">
                          <span className="font-medium">{e.track.title}</span> <span className="text-muted-foreground">· {e.track.artist}</span>
                          {e.fill ? (
                            <span
                              className="ml-1.5 rounded-sm bg-muted px-1 text-label text-muted-foreground"
                              title={`Not in the plan: Qloo recommended this artist from the slot's picks (rank ${music.picks.find((p) => p.itemId === e.itemId)?.rank ?? "?"}) to fill the set.`}
                            >
                              added by Qloo
                            </span>
                          ) : null}
                        </span>
                        <span className="font-mono tabular text-label text-muted-foreground">{len(e.track.durationMs)}</span>
                      </li>
                    );
                  })}
                </ol>
                {p.entries.length > 6 ? (
                  <button
                    type="button"
                    className="w-full border-t px-3 py-1.5 text-left text-small text-muted-foreground hover:bg-muted"
                    onClick={() => setOpen((o) => ({ ...o, [p.slotKey]: !o[p.slotKey] }))}
                  >
                    {open[p.slotKey] ? "Show fewer" : `Show all ${p.entries.length} songs`}
                  </button>
                ) : null}
              </div>
            );
          })}
          <ul className="grid gap-1 text-small text-muted-foreground">
            {music.skippedExplicit ? <li>{music.skippedExplicit} explicit songs left out: the show is all ages.</li> : null}
            {music.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
            <li>
              Previews and links come from Apple&apos;s {music.country} catalogue. Playing music to a room needs the venue&apos;s licensed service (a business music service, or performance licences);
              a personal streaming account isn&apos;t licensed for public playback. Import the CSV into that service.
            </li>
          </ul>
        </>
      )}
    </section>
  );
}
