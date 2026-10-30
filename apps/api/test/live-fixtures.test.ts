import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { LedgerCall } from "@housemix/shared";
import { REPO_ROOT } from "../src/config.ts";
import { compareOf, demographicsOf, entitiesOf, extractResultIds, heatmapOf, normalisedResults, qlooSaysLine, sponsorFit, trendsOf } from "../src/qloo/normalize.ts";
import { trendWindow } from "../src/agent/prompts.ts";

/** Envelopes recorded from the live Qloo API by `npm run qloo:verify` (no credentials in them). */
const dir = path.join(REPO_ROOT, "fixtures/live");
const live = (tool: string) => {
  const { args, envelope } = JSON.parse(fs.readFileSync(path.join(dir, `${tool}.json`), "utf8"));
  return {
    callId: "c1",
    runId: "live",
    agent: "test",
    tool,
    args,
    status: envelope.status,
    summary: "",
    warnings: [],
    results: normalisedResults(tool as never, envelope),
    resultIds: extractResultIds(tool as never, envelope),
    inputIds: [],
    issues: [],
    durationMs: 0,
    cached: false,
    attempts: 1,
    source: "live",
    at: "",
  } as LedgerCall;
};

describe.skipIf(!fs.existsSync(dir))("adapters on live Qloo shapes", () => {
  it("compare_audiences: shared concepts with scores, then each side's own", () => {
    const rows = compareOf(live("qloo_compare_audiences")).rows;
    const shared = rows.filter((r) => r.side === "shared");
    expect(shared.length).toBeGreaterThan(0);
    expect(shared.every((r) => typeof r.score === "number" && r.score >= 0 && r.score <= 1)).toBe(true);
    expect(rows.some((r) => r.side === "a")).toBe(true);
    expect(rows.some((r) => r.side === "b")).toBe(true);
    expect(rows.filter((r) => r.side !== "shared").every((r) => r.score === undefined)).toBe(true);
  });

  it("sponsor fit is the mean shared score, and absent when nothing is shared", () => {
    const call = live("qloo_compare_audiences");
    const shared = compareOf(call).rows.filter((r) => r.side === "shared");
    const mean = shared.reduce((s, r) => s + r.score!, 0) / shared.length;
    expect(sponsorFit(call)).toBe(Math.round(mean * 100));
    const none = { ...call, results: [{ tags: [], a: [{ tag_id: "t", name: "Baseball" }], b: [] }] };
    expect(sponsorFit(none)).toBeUndefined();
  });

  it("trends: points sorted oldest first", () => {
    const series = trendsOf(live("qloo_trends"));
    expect(series.length).toBeGreaterThan(0);
    for (const s of series) {
      const dates = s.points.map((p) => p.date);
      expect(dates).toEqual([...dates].sort());
    }
  });

  it("recommend: explainability names the driving signal", () => {
    const call = live("qloo_recommend");
    const first = entitiesOf(call)[0]!;
    expect(first.because?.[0]?.score).toBeGreaterThan(0);
    const line = qlooSaysLine(call, first.id, (id) => (id === first.because![0]!.id ? "Radiohead" : undefined));
    expect(line).toMatch(/explained by Radiohead \(\d\.\d\d\)/);
  });

  it("where_popular, demographics and entity tags extract", () => {
    expect(heatmapOf(live("qloo_where_popular")).length).toBeGreaterThan(0);
    expect(demographicsOf(live("qloo_audience_demographics")).age.length).toBe(6);
    expect(entitiesOf(live("qloo_entity_tags")).length).toBeGreaterThan(0);
  });
});

describe("trend window", () => {
  it("ends at the earlier of the show date and Qloo's newest trend data", () => {
    const now = new Date("2026-10-30T00:00:00Z");
    expect(trendWindow("2026-11-14", now)).toEqual({ start_date: "2026-04-18", end_date: "2026-07-17" });
    expect(trendWindow("2026-05-01", now).end_date).toBe("2026-05-01");
  });
});

describe("slot gate: acts under the headliner", () => {
  it("rejects an opener at least as popular as the headliner and keeps a smaller one", async () => {
    const { RunContext } = await import("../src/agent/context.ts");
    const { gateItems } = await import("../src/agent/critic.ts");
    const seed = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "fixtures/seed/live/concert.json"), "utf8"));
    const ctx = new RunContext(seed.show, "test", () => {});
    ctx.headlinerPopularity = 0.98;
    ctx.headlinerType = "artist";
    const call = {
      ...live("qloo_rank"),
      callId: "c_rank",
      results: [
        { entity_id: "big", name: "Stadium Act", popularity: 0.9999, affinity: 0.9 },
        { entity_id: "small", name: "Club Act", popularity: 0.82, affinity: 0.95 },
      ],
      resultIds: ["big", "small"],
    } as LedgerCall;
    ctx.ledger.set(call.callId, call);
    const problems = gateItems(ctx, "openers", [
      { entity_id: "big", call_id: "c_rank", interpretation: "Shares the crowd's taste." },
      { entity_id: "small", call_id: "c_rank", interpretation: "Shares the crowd's taste." },
    ]);
    expect(problems.map((p) => p.entity_id)).toEqual(["big"]);
    expect(problems[0]!.reason).toMatch(/under the headliner/);
    expect(ctx.popularityCap("walk_in")).toBeUndefined();
    // A headliner of another kind (a football club) does not set the ceiling for artists.
    ctx.headlinerType = "brand";
    expect(ctx.popularityCap("openers")).toBe(0.99);
  });
});
