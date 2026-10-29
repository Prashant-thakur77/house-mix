import { afterAll, beforeAll, describe, expect, it } from "vitest";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { FileStore, setStore } from "../src/store/store.ts";
import { Budget, QlooClient } from "../src/qloo/client.ts";
import { entitiesOf, trendsOf, compareOf, demographicsOf, heatmapOf } from "../src/qloo/normalize.ts";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hm-test-"));
setStore(new FileStore(dir));
const qloo = new QlooClient("mock");
const ctx = () => ({ runId: "test", budget: new Budget(40) });

beforeAll(async () => {
  process.env.MOCK_LATENCY_MS = "0";
  await qloo.connect();
}, 30000);
afterAll(async () => {
  await qloo.close();
});

describe("mock qloo mcp over real stdio", () => {
  it("serves the same 10 tools as the frozen harness contract", async () => {
    const tools = await qloo.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ["qloo_audience_demographics", "qloo_capabilities", "qloo_compare_audiences", "qloo_describe", "qloo_entity_tags", "qloo_find_tags", "qloo_rank", "qloo_recommend", "qloo_trends", "qloo_where_popular"].sort(),
    );
    expect((await qloo.ready()).ready).toBe(true);
  });

  it("returns needs_input with candidates for Genesis and never auto-picks", async () => {
    const { call, envelope } = await qloo.call("qloo_describe", { entity: "Genesis" }, ctx());
    expect(envelope.status).toBe("needs_input");
    expect(call.issues[0]!.candidates.length).toBeGreaterThan(1);
    expect(call.resultIds).toEqual([]);
    const choice = call.issues[0]!.candidates[0]!.qlooId;
    const again = await qloo.call("qloo_describe", { entity: choice }, ctx());
    expect(again.envelope.status).toBe("ok");
    expect(again.call.resultIds).toEqual([choice]);
  });

  it("returns empty, partial and degraded where documented", async () => {
    const d = await qloo.call("qloo_describe", { entity: "Khruangbin", type: "artist" }, ctx());
    const id = d.call.resultIds[0]!;
    expect((await qloo.call("qloo_where_popular", { entity: id, within: "Antarctica" }, ctx())).envelope.status).toBe("empty");
    const partial = await qloo.call("qloo_where_popular", { entity: id, within: "Smalltown" }, ctx());
    expect(partial.envelope.status).toBe("partial");
    expect(heatmapOf(partial.call).length).toBeGreaterThan(0);
    const comic = await qloo.call("qloo_describe", { entity: "Dana Whitfield", type: "person" }, ctx());
    const demo = await qloo.call("qloo_audience_demographics", { entity: comic.call.resultIds[0]!, entity_type: "person" }, ctx());
    expect(demo.envelope.status).toBe("degraded");
    expect(demographicsOf(demo.call).age.length).toBe(6);
  });

  it("retries a retryable error and then succeeds", async () => {
    const d = await qloo.call("qloo_describe", { entity: "Velvet Static", type: "artist" }, ctx());
    const c = ctx();
    const t = await qloo.call("qloo_trends", { entities: [d.call.resultIds[0]!], entity_type: "artist", start_date: "2026-08-01", end_date: "2026-10-01" }, c);
    expect(t.envelope.status).toBe("ok");
    expect(t.call.attempts).toBe(2);
    expect(c.budget.retries).toBe(1);
    expect(trendsOf(t.call)[0]!.points.length).toBeGreaterThan(1);
  });

  it("does not retry a non-retryable error", async () => {
    const r = await qloo.call("qloo_recommend", { target_type: "artist", limit: 50 } as never, ctx());
    expect(r.envelope.status).toBe("error");
    expect(r.envelope.error?.code).toBe("TOOL_INPUT");
    expect(r.call.attempts).toBe(1);
  });

  it("caches identical calls and counts budget only for misses", async () => {
    const c = ctx();
    const args = { query: "jazz", limit: 3 };
    const a = await qloo.call("qloo_find_tags", args, c);
    const b = await qloo.call("qloo_find_tags", { limit: 3, query: "jazz" }, c);
    expect(a.call.cached).toBe(false);
    expect(b.call.cached).toBe(true);
    expect(c.budget.used).toBe(1);
    expect(c.budget.cacheHits).toBe(1);
  });

  it("blocks personal data before it reaches Qloo", async () => {
    const r = await qloo.call("qloo_find_tags", { query: "fans like jane@example.com" }, ctx());
    expect(r.envelope.error?.code).toBe("HM_GUARD");
    expect(r.call.attempts).toBe(0);
  });

  it("recommends, ranks and compares with ID inputs", async () => {
    const h = (await qloo.call("qloo_describe", { entity: "Khruangbin", type: "artist" }, ctx())).call.resultIds[0]!;
    const s = (await qloo.call("qloo_describe", { entity: "Men I Trust", type: "artist" }, ctx())).call.resultIds[0]!;
    const rec = await qloo.call("qloo_recommend", { target_type: "artist", signals: [h, s], signal_location: "Los Angeles", limit: 10 }, ctx());
    expect(rec.envelope.status).toBe("ok");
    const recs = entitiesOf(rec.call);
    expect(recs.length).toBe(10);
    const rank = await qloo.call("qloo_rank", { options: recs.slice(0, 6).map((e) => e.id), option_type: "artist", signals: [h] }, ctx());
    expect(rank.envelope.status, JSON.stringify(rank.envelope).slice(0, 600)).toBe("ok");
    expect(entitiesOf(rank.call).length).toBe(6);
    const cmp = await qloo.call("qloo_compare_audiences", { group_a: [h], group_b: [s] }, ctx());
    expect(compareOf(cmp.call).rows.length).toBeGreaterThan(0);
    expect(cmp.call.inputIds).toEqual(expect.arrayContaining([h, s]));
  });
});

import { mp3Kbps } from "../src/briefing/tts.ts";
describe("briefing audio timing", () => {
  it("reads the MP3 bitrate from the frame header", () => {
    // MPEG-2 Layer III, 64 kbps, 24 kHz: FF F3 84 xx
    expect(mp3Kbps(Buffer.from([0x00, 0xff, 0xf3, 0x84, 0xc4, 0, 0]))).toBe(64);
    // MPEG-1 Layer III, 128 kbps: FF FB 90 xx
    expect(mp3Kbps(Buffer.from([0xff, 0xfb, 0x90, 0x64]))).toBe(128);
    expect(mp3Kbps(Buffer.from([1, 2, 3, 4]))).toBe(32);
  });
});
