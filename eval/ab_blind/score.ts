/** Scores the blind A/B ratings: win rate of House Mix over L0 (ties excluded) with a Wilson 95% CI, per slot, mean 1–5 fit, Fleiss' kappa. */
import path from "node:path";
import { EVAL_ROOT, fleissKappa, readJson, requireLive, wilson, writeResult } from "../lib.ts";
import type { Rating } from "@housemix/shared";

requireLive("ab:score");
const { getStore } = await import("../../apps/api/src/store/store.ts");
const key = readJson<Record<string, { left: "house_mix" | "l0" }>>(path.join(EVAL_ROOT, "ab_blind/pairs.key.json"), {});
const pub = readJson<{ pairs: { pairId: string; split: string }[] }>(path.join(EVAL_ROOT, "ab_blind/pairs.public.json"), { pairs: [] });
const testIds = new Set(pub.pairs.filter((p) => p.split === "test").map((p) => p.pairId));
const ratings = (await getStore().list<Rating>("ratings")).filter((r) => testIds.has(r.pairId) && key[r.pairId]);

// Map the rater's side choice to the system shown on that side.
const sys = (r: Rating, side: "left" | "right" | "tie"): "house_mix" | "l0" | "tie" => {
  if (side === "tie") return "tie";
  const left = key[r.pairId]!.left;
  return side === "left" ? left : left === "house_mix" ? "l0" : "house_mix";
};
const overall = ratings.map((r) => sys(r, r.overall));
const wins = overall.filter((x) => x === "house_mix").length;
const losses = overall.filter((x) => x === "l0").length;
const perSlot: Record<string, { wins: number; losses: number; ties: number }> = {};
for (const r of ratings) {
  for (const [slot, side] of Object.entries(r.perSlot)) {
    const s = (perSlot[slot] ??= { wins: 0, losses: 0, ties: 0 });
    const v = sys(r, side);
    if (v === "house_mix") s.wins++;
    else if (v === "l0") s.losses++;
    else s.ties++;
  }
}
const fitHm = ratings.map((r) => (key[r.pairId]!.left === "house_mix" ? r.fitLeft : r.fitRight));
const fitL0 = ratings.map((r) => (key[r.pairId]!.left === "house_mix" ? r.fitRight : r.fitLeft));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const byPair = new Map<string, number[]>();
for (const r of ratings) {
  const c = byPair.get(r.pairId) ?? [0, 0, 0];
  const v = sys(r, r.overall);
  c[v === "house_mix" ? 0 : v === "l0" ? 1 : 2]!++;
  byPair.set(r.pairId, c);
}
const raters = new Set(ratings.map((r) => r.raterCode)).size;
const file = writeResult("ab", {
  method: "Blind pairwise preference, House Mix vs L0 (same model, no Qloo). Ties excluded from the win rate. Test split only.",
  raters,
  ratings: ratings.length,
  overall: { wins, losses, ties: overall.length - wins - losses, winRate: wilson(wins, wins + losses) },
  perSlot: Object.fromEntries(Object.entries(perSlot).map(([k, v]) => [k, { ...v, winRate: wilson(v.wins, v.wins + v.losses) }])),
  fit: { houseMix: mean(fitHm), l0: mean(fitL0) },
  fleissKappa: fleissKappa([...byPair.values()]) ?? null,
});
console.log(`wrote ${file}`);
