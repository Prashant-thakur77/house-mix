/**
 * Builds the seeded demo shows by running the real pipeline (resolution → agent plan) and saves
 * each show with its ledger and run events to fixtures/seed/<qloo mode>/<key>.json.
 * Seed confirmations are an operator's documented choices (`choose`), not automatic picks.
 * Usage: tsx scripts/seed.ts [key ...]   (keys: concert comedy sports festival dining)
 *        tsx scripts/seed.ts --extras [--ask] [key ...]   re-runs only the crowd map and "Without Qloo" (and the sample question) on stored seeds
 */
import fs from "node:fs";
import path from "node:path";
import type { LedgerCall, RunEvent, RunState, Show, ShowInput } from "@housemix/shared";
import { REPO_ROOT, config } from "../src/config.ts";
import { confirmEntity, createShow, getShow, saveShow } from "../src/shows/service.ts";
import { runPlan } from "../src/agent/run.ts";
import { getQloo } from "../src/qloo/client.ts";
import { getStore } from "../src/store/store.ts";
import { heatmapFor } from "../src/insights/heatmap.ts";
import { counterfactualFor } from "../src/insights/counterfactual.ts";
import { askShow } from "../src/insights/ask.ts";

interface SeedDef {
  key: string;
  input: ShowInput;
  /** For an ambiguous entity, the candidate whose name/description contains this text. */
  choose?: Record<string, string>;
  /** A sample "Ask House Mix" question stored with the seed. */
  ask: string;
}

const SEEDS: SeedDef[] = [
  {
    key: "concert",
    ask: "If Men I Trust cancels, which act best fills the opener slot for this crowd?",
    input: {
      mode: "concert",
      sides: [
        { role: "headliner", name: "Khruangbin" },
        { role: "support", name: "Men I Trust" },
      ],
      venue: "Hollywood Bowl",
      city: "Los Angeles",
      date: "2026-11-14",
      doorsTime: "18:30",
      capacityTier: "arena",
      houseRules: { budgetBand: "standard", ageRating: "all_ages", vibeWords: ["groovy"], localActs: ["Mild High Club", "Allah-Las"], sponsorExclusivities: [], localOnlyVendors: false, notes: "" },
    },
  },
  {
    key: "comedy",
    ask: "Which podcast should we promote in the interval for this crowd?",
    input: {
      mode: "comedy",
      sides: [
        { role: "headliner", name: "Taylor Tomlinson" },
        { role: "support", name: "Atsuko Okatsuka" },
      ],
      venue: "The Comedy Store",
      city: "Los Angeles",
      date: "2026-11-20",
      doorsTime: "19:30",
      capacityTier: "club",
      houseRules: { budgetBand: "lean", ageRating: "18_plus", vibeWords: ["late night"], localActs: [], sponsorExclusivities: [], localOnlyVendors: true, notes: "Two-drink minimum room." },
    },
    choose: { venue: "Los Angeles" },
  },
  {
    key: "sports",
    ask: "Which walk-in tracks work for both Chelsea and Arsenal fans?",
    input: {
      mode: "sports",
      sides: [
        { role: "home", name: "Chelsea FC" },
        { role: "away", name: "Arsenal FC" },
      ],
      venue: "Stamford Bridge",
      city: "London",
      date: "2026-11-28",
      doorsTime: "15:00",
      capacityTier: "stadium",
      houseRules: { budgetBand: "premium", ageRating: "all_ages", vibeWords: ["high energy"], localActs: [], sponsorExclusivities: [], localOnlyVendors: false, notes: "Family stand in the East Stand." },
    },
  },
  {
    key: "festival",
    ask: "Who should close the second stage for the Japanese Breakfast and Alvvays crowd?",
    input: {
      mode: "festival",
      sides: [
        { role: "stage_act", name: "Fontaines D.C.", stage: "Main stage" },
        { role: "stage_act", name: "Wet Leg", stage: "Main stage" },
        { role: "stage_act", name: "Japanese Breakfast", stage: "Second stage" },
        { role: "stage_act", name: "Alvvays", stage: "Second stage" },
      ],
      venue: "Victoria Park",
      city: "London",
      date: "2027-06-12",
      doorsTime: "12:00",
      capacityTier: "stadium",
      houseRules: { budgetBand: "standard", ageRating: "all_ages", vibeWords: [], localActs: [], sponsorExclusivities: [], localOnlyVendors: false, notes: "" },
    },
  },
  {
    key: "dining",
    ask: "Which drinks brand fits the jazz-night crowd best, and what should we pour with it?",
    input: {
      mode: "dining",
      sides: [
        { role: "house", name: "Dishoom Shoreditch" },
        { role: "theme", name: "Ezra Collective" },
      ],
      venue: "Dishoom Shoreditch",
      city: "London",
      date: "2026-11-21",
      doorsTime: "18:00",
      capacityTier: "club",
      houseRules: { budgetBand: "standard", ageRating: "18_plus", vibeWords: ["late night"], localActs: [], sponsorExclusivities: [], localOnlyVendors: false, notes: "Jazz supper: two seatings, the bar stays open late." },
    },
  },
];

const extrasOnly = process.argv.includes("--extras");
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const outDir = path.join(REPO_ROOT, "fixtures/seed", config.qlooMode);
fs.mkdirSync(outDir, { recursive: true });

function exportSeed(key: string, show: Show, ledger: LedgerCall[], run: RunState) {
  fs.writeFileSync(path.join(outDir, `${key}.json`), `${JSON.stringify({ show, ledger, run }, null, 1)}\n`);
}

const extraRuns = (showId: string, id: string) => id === `map_${showId}` || id.startsWith(`cf_${showId}_`) || id.startsWith(`ask_${showId}_`);

/** Keeps only the calls this seed's stored results reference (seed runs reuse IDs, so the store holds older copies). */
function referencedLedger(show: Show, run: RunState, ledger: LedgerCall[]): LedgerCall[] {
  const keep = new Set<string>();
  for (const e of run.events) if (e.type === "tool_call") keep.add(e.callId);
  for (const e of show.entities) if (e.callId) keep.add(e.callId);
  for (const sl of show.plan?.slots ?? []) {
    for (const i of sl.items) for (const ev of i.evidence) keep.add(ev.callId);
    for (const a of sl.alternatives) keep.add(a.callId);
  }
  for (const ev of show.plan?.crowd.evidence ?? []) keep.add(ev.callId);
  for (const l of show.heatmap?.layers ?? []) keep.add(l.evidence.callId);
  for (const sl of show.counterfactual?.slots ?? []) {
    if (sl.rankEvidence) keep.add(sl.rankEvidence.callId);
    for (const r of sl.rows) if (r.callId) keep.add(r.callId);
  }
  for (const a of show.asks) {
    for (const c of a.calls) keep.add(c.callId);
    for (const l of a.lines) for (const id of l.callIds) keep.add(id);
    for (const p of a.proposals) for (const ev of p.item.evidence) keep.add(ev.callId);
  }
  const seen = new Set<string>();
  return ledger.filter((c) => keep.has(c.callId) && !seen.has(c.callId) && seen.add(c.callId));
}

if (process.argv.includes("--clean")) {
  for (const def of SEEDS.filter((s) => !only.length || only.includes(s.key))) {
    const file = path.join(outDir, `${def.key}.json`);
    const seed = JSON.parse(fs.readFileSync(file, "utf8")) as { show: Show; ledger: LedgerCall[]; run: RunState };
    const ledger = referencedLedger(seed.show, seed.run, seed.ledger);
    exportSeed(def.key, seed.show, ledger, seed.run);
    console.log(`${def.key}: ledger ${seed.ledger.length} → ${ledger.length}`);
  }
  process.exit(0);
}

if (extrasOnly) {
  for (const def of SEEDS.filter((s) => !only.length || only.includes(s.key))) {
    const file = path.join(outDir, `${def.key}.json`);
    const seed = JSON.parse(fs.readFileSync(file, "utf8")) as { show: Show; ledger: LedgerCall[]; run: RunState };
    const store = getStore();
    await store.put("shows", seed.show.id, seed.show);
    for (const c of seed.ledger) await store.put("ledger", c.callId, c);
    await heatmapFor(seed.show.id, true);
    await counterfactualFor(seed.show.id, true);
    if (process.argv.includes("--ask")) {
      const s = await getShow(seed.show.id);
      await saveShow({ ...s, asks: [] });
      await askShow(seed.show.id, def.ask, () => {});
    }
    const show = await getShow(seed.show.id);
    // Keep the plan and ask calls; replace map and comparison calls with the ones the new results cite.
    const cited = new Set([...(show.heatmap?.layers.map((l) => l.evidence.callId) ?? []), ...(show.counterfactual?.slots.flatMap((sl) => [sl.rankEvidence?.callId, ...sl.rows.filter((r) => r.source === "llm").map((r) => r.callId)]) ?? [])]);
    const asks = new Set(show.asks.map((a) => `ask_${show.id}_${a.id}`));
    const isExtra = (c: LedgerCall) => c.runId === `map_${show.id}` || c.runId.startsWith(`cf_${show.id}_`) || (c.runId.startsWith(`ask_${show.id}_`) && !asks.has(c.runId));
    const ledger = [...seed.ledger.filter((c) => !isExtra(c)), ...(await store.list<LedgerCall>("ledger")).filter((c) => isExtra(c) && cited.has(c.callId))];
    exportSeed(def.key, show, referencedLedger(show, seed.run, ledger), seed.run);
    console.log(`${def.key}: extras refreshed · ${show.counterfactual?.summary.llmResolved}/${show.counterfactual?.summary.llmPicks} Claude-alone picks found · map ${show.heatmap?.layers.length} layers, ${show.heatmap?.overlap.length} overlap`);
  }
  await getQloo().close();
  process.exit(0);
}

for (const def of SEEDS.filter((s) => !only.length || only.includes(s.key))) {
  const t0 = Date.now();
  let show = await createShow(def.input, { seed: true, id: `seed-${def.key}` });
  for (const e of show.entities.filter((x) => x.status === "needs_confirmation")) {
    const want = def.choose?.[e.key];
    const c = want ? e.candidates.find((x) => `${x.name} ${x.disambiguation ?? ""}`.toLowerCase().includes(want.toLowerCase())) : undefined;
    if (c) show = await confirmEntity(show.id, e.key, c.qlooId);
    else if (e.kind !== "side") show = await confirmEntity(show.id, e.key, "skip");
    else throw new Error(`${def.key}: "${e.input}" is ambiguous; add a choose rule.`);
  }
  show = await getShow(show.id);
  const runId = `r_seed_${def.key}`;
  const events: RunEvent[] = [];
  const plan = await runPlan(show, runId, (e) => events.push(e));
  show = { ...(await getShow(show.id)), plan, status: "planned", version: 1, lastRunId: runId };
  await saveShow(show);
  // Precompute the Qloo-only crowd map, the "Without Qloo" comparison and one sample question,
  // so the hosted demo shows them without spending its Claude budget.
  await heatmapFor(show.id, true);
  await counterfactualFor(show.id, true);
  await askShow(show.id, def.ask, () => {});
  show = await getShow(show.id);
  const store = getStore();
  const ledger = (await store.list<LedgerCall>("ledger")).filter((c) => c.runId === runId || c.runId === `resolve_${show.id}` || extraRuns(show.id, c.runId));
  await store.put("runs", runId, { runId, showId: show.id, status: "done", events, startedAt: new Date(t0).toISOString(), finishedAt: new Date().toISOString() });
  const run: RunState = { runId, showId: show.id, status: "done", events, startedAt: new Date(t0).toISOString(), finishedAt: new Date().toISOString() };
  exportSeed(def.key, show, referencedLedger(show, run, ledger), run);
  console.log(`${def.key}: ${show.title} · ${plan.slots.reduce((n, s) => n + s.items.length, 0)} items · ${plan.stats.qlooCalls} calls · $${plan.stats.costUsd} · ${Math.round((Date.now() - t0) / 1000)}s`);
}
await getQloo().close();
