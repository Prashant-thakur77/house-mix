import { describe, expect, it } from "vitest";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import type { LedgerCall, MusicPick, Show } from "@housemix/shared";
import { FileStore, setStore } from "../src/store/store.ts";
import { REPO_ROOT } from "../src/config.ts";
import type { QlooClient } from "../src/qloo/client.ts";

setStore(new FileStore(fs.mkdtempSync(path.join(os.tmpdir(), "hm-music-"))));
// No pause between fake catalogue searches (the real one waits ~3 s for Apple's rate limit).
process.env.HM_ITUNES_GAP_MS = "0";
const { buildMusic, buildPlaylist } = await import("../src/insights/music.ts");

const track = (id: string, artist: string, min: number, explicit = false) => ({
  id,
  title: `Song ${id}`,
  artist,
  durationMs: min * 60_000,
  url: `https://music.apple.com/${id}`,
  previewUrl: `https://p/${id}.m4a`,
  explicit,
});

describe("playlists", () => {
  it("takes one song per pick in the plan's order, round by round, timed from the slot's start until it is full", () => {
    const picks: MusicPick[] = [
      { itemId: "a", qlooId: "A", artist: "A", source: "plan", tracks: [track("a1", "A", 4), track("a2", "A", 4)] },
      { itemId: "b", qlooId: "B", artist: "B", source: "plan", tracks: [track("b1", "B", 3), track("b2", "B", 3)] },
    ];
    const p = buildPlaylist({ key: "walk_in", label: "Walk-in", timeRange: "18:30–18:42" }, picks);
    expect(p.entries.map((e) => e.track.id)).toEqual(["a1", "b1", "a2", "b2"]);
    expect(p.entries.map((e) => e.at)).toEqual(["18:30", "18:34", "18:37", "18:41"]);
    expect(p.minutes).toBe(12);
  });
});

describe("hear the night", () => {
  it("finds songs per artist pick, leaves explicit songs out for an all-ages show, and fills a short slot from Qloo", async () => {
    const seed = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "fixtures/seed/live/sports.json"), "utf8")) as { show: Show };
    const show = structuredClone(seed.show);
    delete show.music;
    // The fake catalogue: two explicit songs then clean ones, three minutes each, for any artist.
    const fetcher = (async (url: string) => {
      const artist = new URL(url).searchParams.get("term")!;
      const results = [0, 1, 2, 3, 4, 5, 6].map((k) => ({
        trackId: `${artist}-${k}`,
        trackName: `${artist} song ${k}`,
        artistName: artist,
        trackTimeMillis: 180_000,
        previewUrl: "https://p/x.m4a",
        trackViewUrl: "https://music.apple.com/x",
        trackExplicitness: k < 2 ? "explicit" : "notExplicit",
      }));
      return new Response(JSON.stringify({ results }));
    }) as typeof fetch;
    const calls: Record<string, unknown>[] = [];
    const qloo = {
      call: async (_tool: string, args: Record<string, unknown>) => {
        calls.push(args);
        const results = Array.from({ length: 12 }, (_, k) => ({ entity_id: `F${k}`, name: `Fill Artist ${k}`, type: "urn:entity:artist", affinity: 0.9 }));
        return { call: { callId: "c_fill", tool: "qloo_recommend", status: "ok", results, resultIds: results.map((r) => r.entity_id) } as unknown as LedgerCall, envelope: {} };
      },
    } as unknown as QlooClient;
    const music = await buildMusic(show, fetcher, qloo);
    const walk = music.playlists.find((p) => p.slotKey === "walk_in")!;
    expect(walk.entries.length).toBeGreaterThan(0);
    expect(walk.entries.every((e) => !e.track.explicit)).toBe(true);
    expect(music.skippedExplicit).toBeGreaterThan(0);
    // 75 minutes of 3-minute songs from 7 picks × 5 songs is 105 minutes: full, so no fill call.
    expect(walk.filledMinutes).toBeGreaterThanOrEqual(walk.minutes);
    expect(calls).toHaveLength(0);

    // A slot the picks can't fill asks Qloo, and every added artist keeps the call.
    const long = structuredClone(show);
    const slot = long.plan!.slots.find((s) => s.key === "walk_in")!;
    slot.timeRange = "13:00–18:00";
    const filled = await buildMusic(long, fetcher, qloo);
    const fills = filled.picks.filter((p) => p.source === "fill");
    expect(calls[0]).toMatchObject({ target_type: "artist" });
    expect(fills.length).toBeGreaterThan(0);
    expect(fills.every((p) => p.callId === "c_fill")).toBe(true);
    expect(filled.playlists.find((p) => p.slotKey === "walk_in")!.entries.some((e) => e.fill)).toBe(true);
  }, 60_000);
});
