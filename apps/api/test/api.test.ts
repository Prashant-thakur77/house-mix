import { afterAll, beforeAll, describe, expect, it } from "vitest";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { Plan, PlanItem, Show } from "@housemix/shared";
import { FileStore, getStore, setStore } from "../src/store/store.ts";
import { QlooClient, setQloo } from "../src/qloo/client.ts";
import { buildApp } from "../src/app.ts";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hm-api-"));
process.env.HM_DATA_DIR = dir;
process.env.MOCK_LATENCY_MS = "0";
setStore(new FileStore(dir));
const qloo = new QlooClient("mock");
setQloo(qloo);
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
});

const concert = {
  mode: "concert",
  sides: [
    { role: "headliner", name: "Genesis" },
    { role: "support", name: "Velvet Static" },
  ],
  venue: "Hollywood Bowl",
  city: "Los Angeles",
  date: "2026-11-14",
  capacityTier: "arena",
  houseRules: { vibeWords: ["groovy", "late night vibes"] },
};

async function post<T>(url: string, body?: unknown) {
  const res = await app.inject({ method: "POST", url, payload: body as object });
  return { status: res.statusCode, body: res.json() as T };
}

describe("intake and confirmation", () => {
  it("returns needs_confirmation for Genesis and never auto-picks", async () => {
    const { status, body } = await post<Show>("/shows", concert);
    expect(status).toBe(201);
    expect(body.status).toBe("needs_confirmation");
    const g = body.entities.find((e) => e.input === "Genesis")!;
    expect(g.status).toBe("needs_confirmation");
    expect(g.qlooId).toBeUndefined();
    expect(g.candidates.length).toBeGreaterThan(1);
    const groovy = body.entities.find((e) => e.input === "groovy")!;
    expect(groovy.status).toBe("resolved");
    const vibes = body.entities.find((e) => e.input === "late night vibes")!;
    expect(vibes.status).toBe("needs_confirmation");

    const bad = await post(`/shows/${body.id}/confirm`, { key: g.key, choice: "not-a-candidate" });
    expect(bad.status).toBe(400);
    const planBlocked = await post(`/shows/${body.id}/runs`);
    expect(planBlocked.status).toBe(409);

    let s = (await post<Show>(`/shows/${body.id}/confirm`, { key: g.key, choice: g.candidates[0]!.qlooId })).body;
    expect(s.entities.find((e) => e.key === g.key)!.status).toBe("resolved");
    expect(s.status).toBe("needs_confirmation");
    s = (await post<Show>(`/shows/${body.id}/confirm`, { key: vibes.key, choice: "skip" })).body;
    expect(s.status).toBe("ready_to_plan");
  });

  it("refuses personal data and eligibility requests", async () => {
    const pii = await post<{ error: string }>("/shows", { ...concert, houseRules: { notes: "send the list to promoter@example.com" } });
    expect(pii.status).toBe(422);
    expect(pii.body.error).toBe("personal_data");
    const elig = await post<{ error: string }>("/shows", { ...concert, houseRules: { notes: "help us deny entry to fans who look like trouble" } });
    expect(elig.status).toBe(422);
    expect(elig.body.error).toBe("eligibility_request");
  });

  it("validates mode roles", async () => {
    const r = await post("/shows", { ...concert, mode: "sports" });
    expect(r.status).toBe(400);
  });
});

describe("approvals, exports and share", () => {
  let show: Show;
  beforeAll(async () => {
    const created = (await post<Show>("/shows", { ...concert, sides: [{ role: "headliner", name: "Copperline" }], houseRules: {} })).body;
    // Build a small plan from real mock Qloo calls (no LLM): recommend + rank, items cite the rank call.
    const bill = created.entities.filter((e) => e.kind === "side").map((e) => e.qlooId!);
    const rec = await qloo.call("qloo_recommend", { target_type: "artist", signals: bill, limit: 8 }, { runId: "t" });
    const ids = rec.call.resultIds;
    const rank = await qloo.call("qloo_rank", { options: ids, option_type: "artist", signals: bill }, { runId: "t" });
    const ranked = rank.call.resultIds;
    const item = (id: string, n: number): PlanItem => ({
      id: `i_${n}`,
      slotKey: "walk_in",
      pick: { name: `pick ${n}`, qlooId: id, type: "artist" },
      qlooSays: "rank: ranked",
      interpretation: "fits",
      action: "play",
      evidence: [{ callId: rank.call.callId, tool: "qloo_rank", inputs: rank.call.args, status: "ok", summary: "", scores: {}, source: "mock", durationMs: 1 }],
      confidence: "high",
      isWildcard: false,
      approval: { state: "pending" },
    });
    const plan: Plan = {
      runId: "r_test",
      headline: "test",
      crowd: { sharedGround: [], distinctA: [], distinctB: [], labelA: "", labelB: "", compare: [], demographics: { age: [], gender: [] }, tags: [], trends: [], demographicPhrase: "adults 25-34", qlooSays: ["x"], interpretation: [], evidence: [], confidence: "high" },
      slots: [{ key: "walk_in", label: "Doors & walk-in", timeRange: "18:30–19:30", kind: "music", status: "ready", items: [item(ranked[0]!, 1), item(ranked[1]!, 2), item(ranked[2]!, 3)], alternatives: ranked.slice(3).map((id) => ({ qlooId: id, name: id, type: "artist", callId: rank.call.callId })) }],
      limitations: ["l"],
      stats: { qlooCalls: 2, cacheHits: 0, retries: 0, criticDrops: 0, durationMs: 1, costUsd: 0, model: "x", toolsUsed: ["qloo_recommend", "qloo_rank"] },
      createdAt: new Date().toISOString(),
    };
    show = { ...created, plan, status: "planned", version: 1 };
    await getStore().put("shows", show.id, show);
  });

  it("approves, rejects (negative signal) and swaps via a fresh qloo_rank", async () => {
    let s = (await post<Show>(`/shows/${show.id}/items/i_1/approve`)).body;
    expect(s.plan!.slots[0]!.items[0]!.approval.state).toBe("approved");
    s = (await post<Show>(`/shows/${show.id}/items/i_2/reject`, { reason: "too mellow for doors" })).body;
    expect(s.negativeSignals[0]!.reason).toBe("too mellow for doors");
    s = (await post<Show>(`/shows/${show.id}/items/i_3/swap`)).body;
    const items = s.plan!.slots[0]!.items;
    expect(items.find((i) => i.id === "i_3")!.approval.state).toBe("swapped");
    const repl = items[items.findIndex((i) => i.id === "i_3") + 1]!;
    expect(repl.evidence[0]!.tool).toBe("qloo_rank");
    expect(repl.evidence[0]!.callId).not.toBe(show.plan!.slots[0]!.items[0]!.evidence[0]!.callId);
    const lockEarly = await post(`/shows/${show.id}/lock`);
    expect(lockEarly.status).toBe(409);
    await post(`/shows/${show.id}/items/${repl.id}/approve`);
    const locked = await post<Show>(`/shows/${show.id}/lock`);
    expect(locked.body.lockedAt).toBeTruthy();
    expect((await post(`/shows/${show.id}/items/i_1/approve`)).status).toBe(409);
  });

  it("bulk-approves only high-confidence, non-stretch pending items", async () => {
    const base = show.plan!.slots[0]!.items[0]!;
    const items = [
      { ...base, id: "b1", confidence: "high" as const, isWildcard: false, approval: { state: "pending" as const } },
      { ...base, id: "b2", confidence: "reduced" as const, isWildcard: false, approval: { state: "pending" as const } },
      { ...base, id: "b3", confidence: "high" as const, isWildcard: true, approval: { state: "pending" as const } },
    ];
    const copy: Show = { ...show, id: "s_bulk", lockedAt: undefined, status: "planned", plan: { ...show.plan!, slots: [{ ...show.plan!.slots[0]!, items }] } };
    await getStore().put("shows", copy.id, copy);
    const s = (await post<Show>(`/shows/${copy.id}/approve-confident`)).body;
    expect(s.plan!.slots[0]!.items.map((i) => i.approval.state)).toEqual(["approved", "pending", "pending"]);
  });

  it("exports CSV and PDFs and serves the share link", async () => {
    const csv = await app.inject({ url: `/shows/${show.id}/export.csv` });
    expect(csv.statusCode).toBe(200);
    expect(csv.body.split("\n")[0]).toContain("qloo_says");
    const pdf = await app.inject({ url: `/shows/${show.id}/export.pdf` });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.rawPayload.subarray(0, 4).toString()).toBe("%PDF");
    const sp = await app.inject({ url: `/shows/${show.id}/items/i_1/sponsor.pdf` });
    expect(sp.rawPayload.subarray(0, 4).toString()).toBe("%PDF");
    const share = await app.inject({ url: `/share/${show.shareId}` });
    expect(share.json().id).toBe(show.id);
  });

  it("health reports mock mode and readiness", async () => {
    const h = (await app.inject({ url: "/health" })).json();
    expect(h.qlooMode).toBe("mock");
    expect(h.qlooReady).toBe(true);
  });
});
