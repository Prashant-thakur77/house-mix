/**
 * Builds the seeded demo shows by running the real pipeline (resolution → agent plan) and saves
 * each show with its ledger and run events to fixtures/seed/<qloo mode>/<key>.json.
 * Seed confirmations are an operator's documented choices (`choose`), not automatic picks.
 * Usage: tsx scripts/seed.ts [key ...]   (keys: concert comedy sports festival)
 */
import fs from "node:fs";
import path from "node:path";
import type { LedgerCall, RunEvent, ShowInput } from "@housemix/shared";
import { REPO_ROOT, config } from "../src/config.ts";
import { confirmEntity, createShow, getShow, saveShow } from "../src/shows/service.ts";
import { runPlan } from "../src/agent/run.ts";
import { getQloo } from "../src/qloo/client.ts";
import { getStore } from "../src/store/store.ts";

interface SeedDef {
  key: string;
  input: ShowInput;
  /** For an ambiguous entity, the candidate whose name/description contains this text. */
  choose?: Record<string, string>;
}

const SEEDS: SeedDef[] = [
  {
    key: "concert",
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
];

const only = process.argv.slice(2);
const outDir = path.join(REPO_ROOT, "fixtures/seed", config.qlooMode);
fs.mkdirSync(outDir, { recursive: true });

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
  const store = getStore();
  const ledger = (await store.list<LedgerCall>("ledger")).filter((c) => c.runId === runId || c.runId === `resolve_${show.id}`);
  await store.put("runs", runId, { runId, showId: show.id, status: "done", events, startedAt: new Date(t0).toISOString(), finishedAt: new Date().toISOString() });
  fs.writeFileSync(path.join(outDir, `${def.key}.json`), `${JSON.stringify({ show, ledger, run: { runId, showId: show.id, status: "done", events, startedAt: new Date(t0).toISOString(), finishedAt: new Date().toISOString() } }, null, 1)}\n`);
  console.log(`${def.key}: ${show.title} · ${plan.slots.reduce((n, s) => n + s.items.length, 0)} items · ${plan.stats.qlooCalls} calls · $${plan.stats.costUsd} · ${Math.round((Date.now() - t0) / 1000)}s`);
}
await getQloo().close();
