/**
 * Evidence rate: share of plan items (and briefing lines) whose citation is valid: the cited call
 * exists in the ledger and the entity is in its results. House Mix vs L0 (which has no citations).
 * Hallucinated entities: L0 picks that Qloo cannot resolve (describe → needs_input not_found / empty).
 */
import path from "node:path";
import type { LedgerCall, Plan } from "@housemix/shared";
import { RESULTS, readJson, requireLive, writeResult } from "../lib.ts";
import type { L0Plan } from "../baselines.ts";

requireLive("evidence");
const { getStore } = await import("../../apps/api/src/store/store.ts");
const { QlooClient } = await import("../../apps/api/src/qloo/client.ts");
const runs = readJson<{ plans: { id: string; plan: Plan; l0: L0Plan }[] }>(path.join(RESULTS, "plans.json"), { plans: [] });
if (!runs.plans.length) {
  console.log("No eval plans yet: run `npm run eval:ab:pairs` first.");
  process.exit(0);
}
const store = getStore();
const qloo = new QlooClient("live");
type Row = {
  id: string;
  houseMix: { items: number; valid: number; rate: number; criticDrops: number };
  l0: { items: number; valid: number; rate: number; unresolvedByQloo: number; ambiguousInQloo: number };
};
const rows: Row[] = [];
for (const r of runs.plans) {
  const items = r.plan.slots.flatMap((s) => s.items);
  let valid = 0;
  for (const it of items) {
    const checks = await Promise.all(
      it.evidence.map(async (e) => {
        const call = await store.get<LedgerCall>("ledger", e.callId);
        return Boolean(call && call.resultIds.includes(it.pick.qlooId) && call.status !== "error");
      }),
    );
    if (checks.length && checks[0]) valid++;
  }
  const l0Picks = r.l0.slots.flatMap((s) => s.picks);
  let unresolved = 0;
  let ambiguous = 0;
  for (const p of l0Picks) {
    const type = ["artist", "brand", "place", "podcast", "person"].includes(p.type) ? p.type : undefined;
    const { call } = await qloo.call("qloo_describe", { entity: p.name, ...(type ? { type } : {}) }, { runId: "eval_evidence", agent: "eval" });
    if (call.status === "empty" || (call.status === "needs_input" && call.issues.every((i) => i.kind === "not_found"))) unresolved++;
    else if (call.status === "needs_input") ambiguous++;
  }
  rows.push({
    id: r.id,
    houseMix: { items: items.length, valid, rate: items.length ? valid / items.length : 0, criticDrops: r.plan.stats.criticDrops },
    l0: { items: l0Picks.length, valid: 0, rate: 0, unresolvedByQloo: unresolved, ambiguousInQloo: ambiguous },
  });
}
const sum = (f: (x: Row) => number) => rows.reduce((s, x) => s + f(x), 0);
const file = writeResult("evidence", {
  houseMix: {
    items: sum((x) => x.houseMix.items),
    valid: sum((x) => x.houseMix.valid),
    rate:
      sum((x) => x.houseMix.valid) /
      Math.max(
        1,
        sum((x) => x.houseMix.items),
      ),
    criticDrops: sum((x) => x.houseMix.criticDrops),
  },
  l0: {
    items: sum((x) => x.l0.items),
    rate: 0,
    unresolvedByQloo: sum((x) => x.l0.unresolvedByQloo),
    unresolvedPerPlan: sum((x) => x.l0.unresolvedByQloo) / rows.length,
    ambiguousInQloo: sum((x) => x.l0.ambiguousInQloo),
  },
  rows,
});
await qloo.close();
console.log(`wrote ${file}`);
