/**
 * What Qloo adds, measured without spending a Claude token: the eval's own plans (House Mix with Qloo, and L0, the same
 * model with no tools) plus free Qloo calls.
 *
 *  1. Booking realism: an opener, interval or halftime act should be smaller than the headliner. Share of those picks
 *     whose Qloo popularity is at or above the cap (the headliner's popularity for a same-kind headliner, else 0.99).
 *     House Mix before the fix (v1), after it (v2), and L0 (its names looked up in Qloo; ambiguous names not counted).
 *  2. Crowd specificity: across seven different shows, the share of picks a plan repeats from another show's plan.
 *  3. Crowd sensitivity: Qloo's recommendations for each show's bill in its city; how much two crowds' lists overlap.
 *  4. Operations: Qloo calls, cache hits and time per plan, from the plans' own stats.
 *  5. Music: of the artists Qloo picked for the five demo shows, how many have real songs to play, how many Qloo added
 *     to fill a short slot, and how many explicit songs were left out for all-ages shows.
 *  6. Qloo call times per tool, from the demo shows' call ledgers (cache hits excluded).
 *  7. Location: the same bill asked for in its own city, in a city on another continent, and with no city. How much
 *     of the top 10 survives the move says whether Qloo's answer depends on where the show is.
 *  8. Repeatability: the same recommend call twice, the cache bypassed. A citation is only worth checking if asking
 *     again gives the same answer.
 *  9. Explainability: of the plan's picks, how many carry Qloo's own reason (which input signals drove the pick).
 *
 *    QLOO_MODE=live npx tsx --env-file-if-exists=../.env.local qloo/value.ts   ->  eval/results/qloo_value.json
 */
import path from "node:path";
import type { Plan } from "@housemix/shared";
import { EVAL_ROOT, RESULTS, readJson, requireLive, writeResult } from "../lib.ts";
import type { L0Plan } from "../baselines.ts";

requireLive("qloo:value");
const { QlooClient } = await import("../../apps/api/src/qloo/client.ts");
const { entitiesOf } = await import("../../apps/api/src/qloo/normalize.ts");
const { config } = await import("../../apps/api/src/config.ts");
const qloo = new QlooClient("live");
const ctx = { runId: "eval_qloo_value", agent: "eval" };

type Run = { id: string; plan: Plan; l0: L0Plan; stats: { qlooCalls: number; cacheHits: number; costUsd: number }; durationMs: number };
const v2 = readJson<{ plans: Run[] }>(path.join(RESULTS, "plans.json"), { plans: [] }).plans;
const v1 = readJson<{ plans: Run[] }>(path.join(RESULTS, "plans_v1.json"), { plans: [] }).plans;
const shows = readJson<{ shows: { id: string; input: { mode: string; city: string; sides: { role: string; name: string }[] } }[]; split: { test: string[] } }>(
  path.join(EVAL_ROOT, "data/ab_shows.json"),
);
const test = new Set(shows.split.test);
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** A name's Qloo popularity and type, by a free describe call; undefined when Qloo needs a choice or has none. */
async function describe(name: string, type?: string): Promise<{ id: string; popularity?: number; type?: string } | undefined> {
  const { call } = await qloo.call("qloo_describe", { entity: name, ...(type ? { type } : {}) }, ctx);
  if (call.status !== "ok") return undefined;
  const e = entitiesOf(call)[0];
  return e ? { id: e.id, popularity: e.popularity, type: e.type } : undefined;
}

const ACT_SLOTS = new Set(["openers", "halftime", "interval"]);
const isPerformer = (t: string) => t === "artist" || t === "person";

// 1. Booking realism.
type Realism = { picks: number; tooBig: number; examples: string[]; unresolved?: number };
const realism: Record<"houseMixV1" | "houseMixV2" | "l0", Realism> = {
  houseMixV1: { picks: 0, tooBig: 0, examples: [] },
  houseMixV2: { picks: 0, tooBig: 0, examples: [] },
  l0: { picks: 0, tooBig: 0, examples: [], unresolved: 0 },
};
for (const s of shows.shows.filter((x) => test.has(x.id))) {
  const lead = s.input.sides[0]!;
  const headType = s.input.mode === "comedy" ? "person" : s.input.mode === "sports" ? undefined : "artist";
  const head = await describe(lead.name, headType);
  const cap = (type?: string) => Math.min(0.99, head?.popularity !== undefined && head.type === type ? head.popularity : 1);
  for (const [key, runs] of [
    ["houseMixV1", v1],
    ["houseMixV2", v2],
  ] as const) {
    const run = runs.find((r) => r.id === s.id);
    for (const slot of run?.plan.slots ?? []) {
      if (!ACT_SLOTS.has(slot.key)) continue;
      for (const it of slot.items.filter((i) => isPerformer(i.pick.type) && i.approval.state !== "swapped")) {
        const pop = it.evidence.map((e) => e.scores.popularity).find((p) => p !== undefined);
        if (pop === undefined) continue;
        realism[key].picks++;
        if (pop >= cap(it.pick.type)) {
          realism[key].tooBig++;
          if (realism[key].examples.length < 6) realism[key].examples.push(`${it.pick.name} for ${lead.name}`);
        }
      }
    }
  }
  const run = v2.find((r) => r.id === s.id);
  for (const slot of run?.l0.slots ?? []) {
    if (!ACT_SLOTS.has(slot.slot_key)) continue;
    for (const p of slot.picks.filter((x) => isPerformer(x.type))) {
      const e = await describe(p.name, p.type);
      if (e?.popularity === undefined) {
        realism.l0.unresolved!++;
        continue;
      }
      realism.l0.picks++;
      if (e.popularity >= cap(p.type)) {
        realism.l0.tooBig++;
        if (realism.l0.examples.length < 6) realism.l0.examples.push(`${p.name} for ${lead.name}`);
      }
    }
  }
}

// 2. Crowd specificity: picks repeated from another show's plan.
function repeats(lists: string[][]): { picks: number; repeated: number; top: string[] } {
  const count = new Map<string, number>();
  for (const l of lists) for (const n of new Set(l.map(norm))) count.set(n, (count.get(n) ?? 0) + 1);
  const picks = lists.reduce((n, l) => n + l.length, 0);
  const repeated = lists.reduce((n, l) => n + l.filter((x) => (count.get(norm(x)) ?? 0) > 1).length, 0);
  const top = [...count.entries()]
    .filter(([, c]) => c > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([n, c]) => `${n} (${c} shows)`);
  return { picks, repeated, top };
}
const testRuns = v2.filter((r) => test.has(r.id));
const specificity = {
  houseMix: repeats(testRuns.map((r) => r.plan.slots.flatMap((s) => s.items.filter((i) => i.approval.state !== "swapped").map((i) => i.pick.name)))),
  l0: repeats(testRuns.map((r) => r.l0.slots.flatMap((s) => s.picks.map((p) => p.name)))),
  houseMixBrands: repeats(testRuns.map((r) => r.plan.slots.filter((s) => s.kind === "brand").flatMap((s) => s.items.map((i) => i.pick.name)))),
  l0Brands: repeats(testRuns.map((r) => r.l0.slots.filter((s) => s.slot_key === "brands").flatMap((s) => s.picks.map((p) => p.name)))),
};

// 3. Crowd sensitivity: Qloo's top artists for each show's bill in its city, and how much two crowds share.
const lists: { id: string; names: string[] }[] = [];
const billIds = new Map<string, string[]>();
for (const s of shows.shows) {
  const ids = [];
  for (const side of s.input.sides.slice(0, 2)) {
    const e = await describe(side.name, s.input.mode === "comedy" ? "person" : s.input.mode === "sports" ? undefined : "artist");
    if (e) ids.push(e.id);
  }
  if (!ids.length) continue;
  billIds.set(s.id, ids);
  const { call } = await qloo.call("qloo_recommend", { target_type: "artist", signals: ids, signal_location: s.input.city, limit: 10 }, ctx);
  lists.push({ id: s.id, names: entitiesOf(call).map((e) => e.name) });
}
const jac: number[] = [];
for (let a = 0; a < lists.length; a++)
  for (let b = a + 1; b < lists.length; b++) {
    const x = new Set(lists[a]!.names.map(norm));
    const y = new Set(lists[b]!.names.map(norm));
    const inter = [...x].filter((n) => y.has(n)).length;
    jac.push(inter / Math.max(1, new Set([...x, ...y]).size));
  }
const sensitivity = {
  crowds: lists.length,
  pairs: jac.length,
  meanOverlap: jac.reduce((s, v) => s + v, 0) / Math.max(1, jac.length),
  maxOverlap: Math.max(0, ...jac),
  identicalPairs: jac.filter((j) => j === 1).length,
  zeroOverlapPairs: jac.filter((j) => j === 0).length,
};

const overlap = (a: string[], b: string[]) => {
  const x = new Set(a.map(norm));
  const y = new Set(b.map(norm));
  return [...x].filter((n) => y.has(n)).length / Math.max(1, new Set([...x, ...y]).size);
};
const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / Math.max(1, xs.length);

// 7. Location: the same bill in its own city, across an ocean, and with no city.
const UK = new Set(["London", "Manchester", "Liverpool"]);
const recNames = async (signals: string[], city?: string) =>
  entitiesOf((await qloo.call("qloo_recommend", { target_type: "artist", signals, ...(city ? { signal_location: city } : {}), limit: 10 }, ctx)).call).map((e) => e.name);
const moves: { id: string; home: string; away: string; awayOverlap: number; noCityOverlap: number }[] = [];
for (const s of shows.shows) {
  const ids = billIds.get(s.id);
  const home = lists.find((l) => l.id === s.id)?.names;
  if (!ids || !home?.length) continue;
  const away = UK.has(s.input.city) ? "Los Angeles" : "London";
  moves.push({ id: s.id, home: s.input.city, away, awayOverlap: overlap(home, await recNames(ids, away)), noCityOverlap: overlap(home, await recNames(ids)) });
}
const location = {
  shows: moves.length,
  meanAwayOverlap: mean(moves.map((m) => m.awayOverlap)),
  meanNoCityOverlap: mean(moves.map((m) => m.noCityOverlap)),
  changed: moves.filter((m) => m.awayOverlap < 1).length,
  moves,
};

// 8. Repeatability: ask again with the cache bypassed.
const ttl = config.cacheTtlMs;
config.cacheTtlMs = 0;
const repeats8: { id: string; sameSet: boolean; sameOrder: boolean }[] = [];
for (const s of shows.shows.slice(0, 5)) {
  const ids = billIds.get(s.id);
  if (!ids) continue;
  const a = await recNames(ids, s.input.city);
  const b = await recNames(ids, s.input.city);
  repeats8.push({ id: s.id, sameSet: overlap(a, b) === 1, sameOrder: a.join("|") === b.join("|") });
}
config.cacheTtlMs = ttl;
const repeatability = { calls: repeats8.length, sameSet: repeats8.filter((r) => r.sameSet).length, sameOrder: repeats8.filter((r) => r.sameOrder).length };

// 9. Explainability: picks that carry Qloo's own reason.
const items9 = testRuns.flatMap((r) => r.plan.slots.flatMap((s) => s.items.filter((i) => i.approval.state !== "swapped")));
const explainability = {
  picks: items9.length,
  explained: items9.filter((i) => /explained by/.test(i.qlooSays)).length,
  recommended: items9.filter((i) => i.evidence.some((e) => e.tool === "qloo_recommend")).length,
  cited: items9.filter((i) => i.evidence.length > 0).length,
};

// 4. Operations, from the plans' own stats.
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const ops = {
  plans: testRuns.length,
  qlooCallsMedian: med(testRuns.map((r) => r.stats.qlooCalls)),
  cacheHitsMedian: med(testRuns.map((r) => r.stats.cacheHits)),
  secondsMedian: Math.round(med(testRuns.map((r) => r.durationMs)) / 1000),
  claudeCostMedian: med(testRuns.map((r) => r.stats.costUsd)),
};

// 5. Music coverage and 6. Qloo call times, from the five live demo shows (fixtures/seed/live).
const fs = await import("node:fs");
const seedDir = path.join(EVAL_ROOT, "../fixtures/seed/live");
type Seed = {
  show: { music?: { picks: { source?: string; tracks: unknown[] }[]; playlists: { minutes: number; filledMinutes: number }[]; skippedExplicit: number } };
  ledger: { tool: string; durationMs: number; cached: boolean }[];
};
const seeds = fs
  .readdirSync(seedDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(seedDir, f), "utf8")) as Seed);
const planned = seeds.flatMap((x) => x.show.music?.picks.filter((p) => p.source !== "fill") ?? []);
const music = {
  artists: planned.length,
  withSongs: planned.filter((p) => p.tracks.length).length,
  filledByQloo: seeds.flatMap((x) => x.show.music?.picks.filter((p) => p.source === "fill") ?? []).length,
  explicitLeftOut: seeds.reduce((n, x) => n + (x.show.music?.skippedExplicit ?? 0), 0),
  playlists: seeds.reduce((n, x) => n + (x.show.music?.playlists.length ?? 0), 0),
  minutesPlanned: seeds.reduce((n, x) => n + (x.show.music?.playlists.reduce((m, p) => m + Math.min(p.filledMinutes, p.minutes), 0) ?? 0), 0),
};
const byTool = new Map<string, number[]>();
for (const c of seeds.flatMap((x) => x.ledger).filter((c) => !c.cached && c.durationMs > 0)) byTool.set(c.tool, [...(byTool.get(c.tool) ?? []), c.durationMs]);
const latency = Object.fromEntries([...byTool.entries()].sort().map(([tool, xs]) => [tool, { calls: xs.length, medianMs: med(xs), maxMs: Math.max(...xs) }]));

await qloo.close();
const file = writeResult("qloo_value", {
  method: "Free: the eval's stored plans plus Qloo describe and recommend calls. No Claude calls.",
  realism,
  specificity,
  sensitivity,
  location,
  repeatability,
  explainability,
  ops,
  music,
  latency,
});
console.log(JSON.stringify({ realism, specificity, sensitivity, location, repeatability, explainability, ops, music, latency }, null, 1));
console.log(`wrote ${file}`);
process.exit(0);
