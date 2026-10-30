/**
 * Automated blind judge: a secondary signal while human ratings are collected, never a replacement.
 * Claude Opus (a different model from the planner) sees each blind pair exactly as raters do: the
 * show, then two unlabelled plans. Each pair is judged twice with the sides swapped; a system wins
 * the pair only if it is preferred in both orders, otherwise the pair is a tie. Test split only.
 */
import path from "node:path";
import { z } from "zod";
import { EVAL_ROOT, readJson, requireLive, wilson, writeResult } from "../lib.ts";
import type { BlindPlan } from "./format.ts";

requireLive("ab:judge");
const { structured } = await import("../../apps/api/src/llm.ts");

type Pair = { pairId: string; split: string; title: string; mode: string; venue?: string; city?: string; left: BlindPlan; right: BlindPlan };
const pub = readJson<{ pairs: Pair[] }>(path.join(EVAL_ROOT, "ab_blind/pairs.public.json"), { pairs: [] });
const key = readJson<Record<string, { left: "house_mix" | "l0" }>>(path.join(EVAL_ROOT, "ab_blind/pairs.key.json"), {});
if (!pub.pairs.length) {
  console.log("No blind pairs yet: run `npm run eval:ab:pairs` first.");
  process.exit(0);
}

const MODEL = process.env.HM_JUDGE_MODEL ?? "claude-opus-5-5";
const Verdict = z.object({
  per_slot: z.array(z.object({ slot_key: z.string(), better: z.enum(["first", "second", "tie"]) })),
  overall: z.enum(["first", "second", "tie"]),
  fit_first: z.number().int().min(1).max(5),
  fit_second: z.number().int().min(1).max(5),
  reason: z.string(),
});
const SYSTEM = `You are an experienced venue programming director. You compare two run-of-show plans for the same real event and judge which better fits the crowd that is actually coming.
Judge on: fit to this event's crowd and city; specificity (real, named, bookable acts, places and brands rather than generic suggestions); whether each action is something a crew could do on the night; and coherence across slots. Penalise picks that are implausible, not real, or wrong for the city.
Both plans are unlabelled and their order is random. Do not prefer a plan for length. "tie" is allowed when neither is clearly better.`;

const render = (p: BlindPlan) => p.slots.map((s) => `## ${s.label} (${s.key})\n${s.picks.map((x) => `- ${x.name}: ${x.why}${x.action ? ` Action: ${x.action}` : ""}`).join("\n")}`).join("\n\n");

async function judge(pair: Pair, first: BlindPlan, second: BlindPlan) {
  const user = `Event: ${pair.title} (${pair.mode}) at ${pair.venue ?? "the venue"}, ${pair.city ?? ""}.\n\n# First plan\n${render(first)}\n\n# Second plan\n${render(second)}\n\nCompare slot by slot (use the slot keys), then overall.`;
  return structured({ purpose: "eval_ab_judge", schema: Verdict, system: SYSTEM, user, model: MODEL, maxTokens: 4000, effort: "medium" });
}

type Sys = "house_mix" | "l0" | "tie";
const rows: { pairId: string; split: string; overall: Sys; orders: [Sys, Sys]; fit: { houseMix: number; l0: number }; reasons: string[] }[] = [];
const perSlot: Record<string, { wins: number; losses: number; ties: number }> = {};
let cost = 0;
// Only the test split is judged: dev pairs were used for tuning and never count.
for (const pair of pub.pairs.filter((p) => p.split === "test")) {
  const left = key[pair.pairId]?.left;
  if (!left) continue;
  const hm = left === "house_mix" ? pair.left : pair.right;
  const l0 = left === "house_mix" ? pair.right : pair.left;
  // Order 1: House Mix first. Order 2: L0 first.
  const a = await judge(pair, hm, l0);
  const b = await judge(pair, l0, hm);
  cost += a.costUsd + b.costUsd;
  const sysA: Sys = a.data.overall === "tie" ? "tie" : a.data.overall === "first" ? "house_mix" : "l0";
  const sysB: Sys = b.data.overall === "tie" ? "tie" : b.data.overall === "first" ? "l0" : "house_mix";
  const overall: Sys = sysA === sysB ? sysA : "tie";
  if (pair.split === "test") {
    for (const s of a.data.per_slot) {
      const other = b.data.per_slot.find((x) => x.slot_key === s.slot_key);
      const va: Sys = s.better === "tie" ? "tie" : s.better === "first" ? "house_mix" : "l0";
      const vb: Sys = !other || other.better === "tie" ? "tie" : other.better === "first" ? "l0" : "house_mix";
      const v = va === vb ? va : "tie";
      const c = (perSlot[s.slot_key] ??= { wins: 0, losses: 0, ties: 0 });
      if (v === "house_mix") c.wins++;
      else if (v === "l0") c.losses++;
      else c.ties++;
    }
  }
  rows.push({
    pairId: pair.pairId,
    split: pair.split,
    overall,
    orders: [sysA, sysB],
    fit: { houseMix: (a.data.fit_first + b.data.fit_second) / 2, l0: (a.data.fit_second + b.data.fit_first) / 2 },
    reasons: [a.data.reason, b.data.reason],
  });
  console.log(`${pair.pairId} (${pair.split}): ${overall} [${sysA} / ${sysB}]`);
}

const test = rows.filter((r) => r.split === "test");
const wins = test.filter((r) => r.overall === "house_mix").length;
const losses = test.filter((r) => r.overall === "l0").length;
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const positionConsistent = rows.filter((r) => r.orders[0] === r.orders[1]).length;
const file = writeResult("ab_judge", {
  method: `Automated blind judge (${MODEL}), each pair judged in both orders; a system wins a pair only when preferred in both. Secondary signal: the judge is a Claude model and may share the planner's tastes. Test split only for the win rate.`,
  model: MODEL,
  pairs: test.length,
  overall: { wins, losses, ties: test.length - wins - losses, winRate: wilson(wins, wins + losses) },
  perSlot: Object.fromEntries(Object.entries(perSlot).map(([k, v]) => [k, { ...v, winRate: wilson(v.wins, v.wins + v.losses) }])),
  fit: { houseMix: mean(test.map((r) => r.fit.houseMix)), l0: mean(test.map((r) => r.fit.l0)) },
  positionConsistency: rows.length ? positionConsistent / rows.length : 0,
  costUsd: Number(cost.toFixed(4)),
  rows,
});
console.log(`House Mix ${wins}–${losses} (ties ${test.length - wins - losses}) on ${test.length} test pairs · $${cost.toFixed(3)} → ${file}`);
process.exit(0);
