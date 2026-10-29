/**
 * hit@10 backtest: was the real support act in the top 10 of a 50-artist pool?
 *   House Mix: qloo_rank with the headliner as signal (+ the city, if dev tuning keeps it).
 *   P0: the same Qloo tournament with only the city as signal (no taste signal; popularity proxy).
 *   L0: Claude ranks the same pool from its own knowledge (no Qloo).
 * qloo_rank takes ≤10 options and scores across calls are not comparable, so ranking is a
 * two-round tournament: 5 groups of 10 → top 2 of each → one final rank of the 10 finalists.
 * Settings are chosen on the dev split; the reported numbers are the test split only.
 */
import path from "node:path";
import { z } from "zod";
import { EVAL_ROOT, hitAndRr, norm, readJson, requireLive, rng, shuffle, writeResult } from "../lib.ts";
import type { BacktestCase } from "./fetch-setlists.ts";

requireLive("backtest");
const { QlooClient } = await import("../../apps/api/src/qloo/client.ts");
const { entitiesOf } = await import("../../apps/api/src/qloo/normalize.ts");
const { structured } = await import("../../apps/api/src/llm.ts");
const { config } = await import("../../apps/api/src/config.ts");

const data = readJson<{ cases: BacktestCase[] }>(path.join(EVAL_ROOT, "data/backtest_cases.json"), { cases: [] });
if (!data.cases.length) {
  console.log("No backtest cases yet: run `npm run eval:fetch` (needs SETLISTFM_API_KEY).");
  process.exit(0);
}
const qloo = new QlooClient("live");
const ctx = { runId: "eval_backtest", agent: "eval" };
const SEED = 20251030;

const idCache = new Map<string, string | null>();
async function resolveArtist(name: string): Promise<string | null> {
  if (idCache.has(name)) return idCache.get(name)!;
  const { call } = await qloo.call("qloo_describe", { entity: name, type: "artist" }, ctx);
  // Never auto-pick: an ambiguous name is treated as unresolvable for the Qloo methods.
  const id = call.status === "ok" ? (entitiesOf(call)[0]?.id ?? null) : null;
  idCache.set(name, id);
  return id;
}

function poolFor(c: BacktestCase, all: BacktestCase[]): string[] {
  const truth = new Set(c.support.map(norm));
  const others = (pred: (o: BacktestCase) => boolean) =>
    all.filter((o) => o.id !== c.id && pred(o)).flatMap((o) => o.support).filter((n) => !truth.has(norm(n)) && norm(n) !== norm(c.headliner));
  const same = [...new Set(others((o) => o.genre === c.genre))];
  const rest = [...new Set(others((o) => o.genre !== c.genre))].filter((n) => !same.includes(n));
  const distractors = [...shuffle(same, rng(SEED)), ...shuffle(rest, rng(SEED + 1))].slice(0, 50 - c.support.length);
  return shuffle([...c.support, ...distractors], rng(SEED + c.id.length));
}

async function rankGroup(ids: string[], signals: Record<string, unknown>): Promise<string[]> {
  if (ids.length <= 1) return ids;
  const { call } = await qloo.call("qloo_rank", { options: ids, option_type: "artist", ...signals }, ctx);
  if (call.status !== "ok") return ids;
  const ranked = entitiesOf(call).map((e) => e.id);
  return [...ranked, ...ids.filter((i) => !ranked.includes(i))];
}

async function tournament(ids: string[], signals: Record<string, unknown>): Promise<string[]> {
  const groups: string[][] = [];
  for (let i = 0; i < ids.length; i += 10) groups.push(ids.slice(i, i + 10));
  const rankedGroups = [];
  for (const g of groups) rankedGroups.push(await rankGroup(g, signals));
  const finalists = rankedGroups.flatMap((g) => g.slice(0, 2));
  const finalOrder = await rankGroup(finalists, signals);
  const rest = rankedGroups.flatMap((g) => g.slice(2));
  return [...finalOrder, ...rest];
}

const L0 = z.object({ ranked: z.array(z.string()) });
async function llmRank(c: BacktestCase, pool: string[]): Promise<string[]> {
  const { data } = await structured({
    purpose: "eval_l0_backtest",
    schema: L0,
    system: "You rank candidate support acts for a headliner's show from your own knowledge. Return every candidate name exactly as given, best fit first.",
    user: `Headliner: ${c.headliner}. City: ${c.city}. Date: ${c.date}.\nCandidates:\n${pool.join("\n")}`,
    model: config.model,
  });
  const known = new Map(pool.map((p) => [norm(p), p]));
  const out = data.ranked.map((n) => known.get(norm(n))).filter((n): n is string => Boolean(n));
  return [...new Set([...out, ...pool.filter((p) => !out.includes(p))])];
}

type Setting = { useLocation: boolean };
async function evaluate(cases: BacktestCase[], setting: Setting, withL0: boolean) {
  const rows = [];
  for (const c of cases) {
    const pool = poolFor(c, data.cases);
    const truthNames = new Set(c.support.map(norm));
    const ids = new Map<string, string>();
    for (const n of pool) {
      const id = await resolveArtist(n);
      if (id) ids.set(id, n);
    }
    const head = await resolveArtist(c.headliner);
    const truthIds = new Set([...ids].filter(([, n]) => truthNames.has(norm(n))).map(([id]) => id));
    const idList = shuffle([...ids.keys()], rng(SEED));
    const hm = head ? await tournament(idList, { signals: [head], ...(setting.useLocation ? { signal_location: c.city } : {}) }) : idList;
    const p0 = await tournament(idList, { signal_location: c.city });
    const l0 = withL0 ? await llmRank(c, pool) : [];
    rows.push({
      id: c.id,
      headliner: c.headliner,
      genre: c.genre,
      poolSize: pool.length,
      resolved: ids.size,
      truthResolved: truthIds.size,
      houseMix: hitAndRr(hm, truthIds),
      p0: hitAndRr(p0, truthIds),
      l0: withL0 ? hitAndRr(l0.map(norm), truthNames) : undefined,
    });
  }
  return rows;
}

const summary = (rows: Awaited<ReturnType<typeof evaluate>>, key: "houseMix" | "p0" | "l0") => {
  const xs = rows.map((r) => r[key]).filter((x): x is { hit: boolean; rr: number } => Boolean(x));
  return { n: xs.length, hitAt10: xs.filter((x) => x.hit).length / Math.max(1, xs.length), mrr: xs.reduce((s, x) => s + x.rr, 0) / Math.max(1, xs.length) };
};

const dev = data.cases.filter((c) => c.split === "dev");
const test = data.cases.filter((c) => c.split === "test");
const settings: Setting[] = [{ useLocation: true }, { useLocation: false }];
const tuning = [];
for (const s of settings) {
  const rows = await evaluate(dev, s, false);
  tuning.push({ setting: s, ...summary(rows, "houseMix") });
}
const chosen = [...tuning].sort((a, b) => b.mrr - a.mrr)[0]!.setting;
const rows = await evaluate(test, chosen, true);
const file = writeResult("backtest", {
  method: "hit@10 and MRR over a 50-artist pool per show; qloo_rank tournament (5×10 → top 2 → final 10)",
  chosenOnDev: chosen,
  tuning,
  test: { houseMix: summary(rows, "houseMix"), p0: summary(rows, "p0"), l0: summary(rows, "l0") },
  rows,
});
await qloo.close();
console.log(`wrote ${file}`);
