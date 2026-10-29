/** Dev helper: create a show, auto-confirm the first candidate (dev only), run a plan, print the trace. */
import { createShow, confirmEntity, getShow } from "../src/shows/service.ts";
import { runPlan } from "../src/agent/run.ts";
import { getQloo } from "../src/qloo/client.ts";
import type { RunEvent } from "@housemix/shared";

const input = JSON.parse(process.argv[2] ?? "null") ?? {
  mode: "concert",
  sides: [{ role: "headliner", name: "Khruangbin" }, { role: "support", name: "Men I Trust" }],
  venue: "Hollywood Bowl",
  city: "Los Angeles",
  date: "2026-11-14",
  doorsTime: "18:30",
  capacityTier: "arena",
  houseRules: { vibeWords: ["groovy"], localActs: ["Velvet Static", "Golden Hour Club"] },
};
let show = await createShow(input);
for (const e of show.entities) if (e.status === "needs_confirmation") show = await confirmEntity(show.id, e.key, e.candidates[0]!.qlooId);
show = await getShow(show.id);
console.log("show", show.id, show.status, show.entities.map((e) => `${e.key}:${e.status}`).join(" "));
const t0 = Date.now();
const plan = await runPlan(show, "r_dev_" + Date.now(), (e: RunEvent) => {
  const t = ((Date.now() - t0) / 1000).toFixed(1);
  if (e.type === "tool_call") console.log(t, "TOOL", e.agent, e.tool, e.status, e.cached ? "cached" : "", `attempts=${e.attempts}`, `n=${e.resultCount}`);
  else if (e.type === "agent") console.log(t, "AGENT", e.agent, e.phase);
  else if (e.type === "critic") console.log(t, "CRITIC", e.slotKey, e.pick, "-", e.reason);
  else if (e.type === "slot") console.log(t, "SLOT", e.slot.key, e.slot.status, e.slot.items.map((i) => (i.isWildcard ? "*" : "") + i.pick.name).join(", "));
  else if (e.type === "crowd") console.log(t, "CROWD", e.crowd.demographicPhrase, e.crowd.qlooSays.length);
  else if (e.type === "error") console.log(t, "ERROR", e.message);
  else if (e.type === "thought") console.log(t, "THOUGHT", e.agent, e.text.slice(0, 120).replace(/\n/g, " "));
});
console.log(JSON.stringify(plan.stats), plan.headline);
await getQloo().close();
