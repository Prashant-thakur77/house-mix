import type { Music, MusicPick, Playlist, Show, Track } from "@housemix/shared";
import { getStore } from "../store/store.ts";
import { getQloo, type QlooClient } from "../qloo/client.ts";
import { entitiesOf } from "../qloo/normalize.ts";
import { getShow, HttpError, saveShow } from "../shows/service.ts";

/**
 * Hear the night: every artist pick becomes real recordings (Apple's iTunes Search API: no key, a 30-second preview per
 * track, a link to the full song), and every music slot becomes a timed playlist built from the plan's picks in order.
 * Qloo chose the artists; this only finds their most popular songs. Previews are for the operator to audition; playing
 * music to a room needs the venue's own licensed service, which the playlist export feeds.
 */

const SEARCH = "https://itunes.apple.com/search";
const GAP_MS = Number(process.env.HM_ITUNES_GAP_MS ?? 3100); // Apple allows about 20 searches a minute
const PER_ARTIST = 5;
const UK = ["london", "manchester", "liverpool", "birmingham", "glasgow", "edinburgh", "leeds", "bristol", "cardiff", "belfast"];

interface Cached {
  key: string;
  tracks: Track[];
  at: string;
}

let lastCall = 0;

function country(city: string): string {
  return UK.some((c) => city.toLowerCase().includes(c)) ? "GB" : "US";
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** An artist's most popular songs in a storefront, cached for good (a catalogue answer doesn't change by the minute). */
export async function artistTracks(artist: string, store: string, fetcher: typeof fetch = fetch): Promise<Track[]> {
  const key = `${store}:${norm(artist)}`;
  const cached = await getStore().get<Cached>("itunes", key);
  if (cached) return cached.tracks;
  const wait = lastCall + GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  const url = `${SEARCH}?${new URLSearchParams({ term: artist, entity: "song", attribute: "artistTerm", limit: "25", country: store })}`;
  const res = await fetcher(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`iTunes search answered ${res.status}`);
  const body = (await res.json()) as { results?: Record<string, unknown>[] };
  const want = norm(artist);
  const seen = new Set<string>();
  const tracks: Track[] = [];
  for (const r of body.results ?? []) {
    // Only this artist's own songs (a duet with them counts), each title once.
    const name = String(r.artistName ?? "");
    const title = String(r.trackName ?? "");
    if (!` ${norm(name)} `.includes(` ${want} `)) continue;
    if (!r.trackId || !title || seen.has(norm(title))) continue;
    seen.add(norm(title));
    tracks.push({
      id: String(r.trackId),
      title,
      artist: name,
      ...(r.collectionName ? { album: String(r.collectionName) } : {}),
      durationMs: Number(r.trackTimeMillis ?? 210_000),
      ...(r.previewUrl ? { previewUrl: String(r.previewUrl) } : {}),
      url: String(r.trackViewUrl ?? r.artistViewUrl ?? ""),
      ...(r.artworkUrl100 ? { artwork: String(r.artworkUrl100) } : {}),
      explicit: r.trackExplicitness === "explicit",
    });
    if (tracks.length >= 12) break;
  }
  await getStore().put<Cached>("itunes", key, { key, tracks, at: new Date().toISOString() });
  return tracks;
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
};
const clock = (min: number) => {
  const t = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

/** A music slot as a playlist: one song from each pick in the plan's order, then the next round, until the slot is full. */
export function buildPlaylist(slot: { key: string; label: string; timeRange: string }, picks: MusicPick[]): Playlist {
  const [a, b] = slot.timeRange.split("–") as [string, string];
  let minutes = toMin(b) - toMin(a);
  if (minutes <= 0) minutes += 1440;
  const entries: Playlist["entries"] = [];
  let t = 0;
  for (let round = 0; round < PER_ARTIST && t < minutes; round++) {
    for (const p of picks) {
      const track = p.tracks[round];
      if (!track || t >= minutes) continue;
      entries.push({ at: clock(toMin(a) + t), itemId: p.itemId, track, fill: p.source === "fill" });
      t += track.durationMs / 60_000;
    }
  }
  return { slotKey: slot.key, label: slot.label, timeRange: slot.timeRange, minutes, filledMinutes: Math.round(t), entries };
}

const FILL_ARTISTS = 8;

export async function buildMusic(show: Show, fetcher: typeof fetch = fetch, qloo: QlooClient = getQloo()): Promise<Music> {
  if (!show.plan) throw new HttpError(409, "Plan the show first; the music comes from its picks.", "no_plan");
  if (show.qlooMode === "mock") {
    // Mock artists are fictional: there is nothing to find in a real catalogue.
    return {
      source: "itunes",
      country: country(show.input.city),
      picks: [],
      playlists: [],
      skippedExplicit: 0,
      notes: ["Mock data: the artists are fictional, so there are no recordings to play."],
      createdAt: new Date().toISOString(),
    };
  }
  const store = country(show.input.city);
  const allAges = show.input.houseRules?.ageRating === "all_ages";
  const live = (state: string) => state !== "swapped" && state !== "rejected";
  const notes: string[] = [];
  let skippedExplicit = 0;
  const picks: MusicPick[] = [];
  for (const slot of show.plan.slots) {
    // Stretch picks go last, as in the plan's running order.
    const items = slot.items.filter((i) => live(i.approval.state) && i.pick.type === "artist").sort((x, y) => Number(x.isWildcard) - Number(y.isWildcard));
    for (const item of items) {
      let tracks: Track[] = [];
      try {
        tracks = await artistTracks(item.pick.name, store, fetcher);
      } catch (e) {
        notes.push(`${item.pick.name}: the catalogue search failed (${(e as Error).message}).`);
      }
      const clean = allAges ? tracks.filter((t) => !t.explicit) : tracks;
      if (allAges) skippedExplicit += tracks.slice(0, PER_ARTIST).filter((t) => t.explicit).length;
      const chosen = clean.slice(0, PER_ARTIST);
      if (!chosen.length) notes.push(`${item.pick.name}: no ${allAges ? "clean " : ""}songs found in Apple's ${store} catalogue; pick songs by hand.`);
      picks.push({ itemId: item.id, qlooId: item.pick.qlooId, artist: item.pick.name, tracks: chosen, source: "plan", slotKey: slot.key });
    }
  }
  const playlists: Playlist[] = [];
  for (const slot of show.plan.slots.filter((s) => s.kind === "music")) {
    const ids = new Set(slot.items.filter((i) => live(i.approval.state)).map((i) => i.id));
    const ordered = picks.filter((p) => ids.has(p.itemId));
    let list = buildPlaylist(slot, ordered);
    // Short slot: ask Qloo for more artists like this slot's own picks, for this crowd and city, and add their songs
    // in Qloo's order until the slot is full. Every added artist keeps the call that justifies it.
    if (list.filledMinutes < list.minutes * 0.9 && ordered.length) {
      const signals = ordered.map((p) => p.qlooId).slice(0, 5);
      const { call } = await qloo.call("qloo_recommend", { target_type: "artist", signals, signal_location: show.input.city, limit: 20 }, { runId: `music_${show.id}`, agent: "music_fill" });
      const taken = new Set(picks.map((p) => p.qlooId));
      let added = 0;
      for (const e of entitiesOf(call)) {
        if (list.filledMinutes >= list.minutes || added >= FILL_ARTISTS) break;
        if (taken.has(e.id)) continue;
        taken.add(e.id);
        let tracks: Track[] = [];
        try {
          tracks = await artistTracks(e.name, store, fetcher);
        } catch {
          continue;
        }
        const clean = (allAges ? tracks.filter((t) => !t.explicit) : tracks).slice(0, PER_ARTIST);
        if (!clean.length) continue;
        const fill: MusicPick = { itemId: `fill_${slot.key}_${e.id}`, qlooId: e.id, artist: e.name, tracks: clean, source: "fill", slotKey: slot.key, callId: call.callId, rank: e.rank };
        picks.push(fill);
        ordered.push(fill);
        added++;
        list = buildPlaylist(slot, ordered);
      }
      if (added) notes.push(`${slot.label}: ran short, so ${added} more artists were added from qloo_recommend on this slot's picks (call ${call.callId}).`);
    }
    if (list.entries.length) playlists.push(list);
  }
  for (const p of playlists) {
    if (p.filledMinutes < p.minutes * 0.8) notes.push(`${p.label}: the picks' top songs fill ${p.filledMinutes} of ${p.minutes} minutes; repeat the set or add picks for the rest.`);
  }
  return { source: "itunes", country: store, picks, playlists, skippedExplicit, notes, createdAt: new Date().toISOString() };
}

const inFlight = new Map<string, Promise<Music>>();

export async function musicFor(showId: string, force = false): Promise<Music> {
  const show = await getShow(showId);
  if (show.music && !force) return show.music;
  const pending = inFlight.get(showId);
  if (pending) return pending;
  const job = (async () => {
    const music = await buildMusic(show);
    const fresh = await getShow(showId);
    fresh.music = music;
    await saveShow(fresh);
    return music;
  })().finally(() => inFlight.delete(showId));
  inFlight.set(showId, job);
  return job;
}
