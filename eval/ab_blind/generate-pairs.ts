/**
 * Generates blind A/B pairs: for each real 2025 show, a House Mix plan (full Qloo chain) and an
 * L0 plan (same model and brief, no Qloo), formatted identically, labels stripped, sides randomised.
 * Writes pairs.public.json (served to raters) and pairs.key.json (kept out of the rater app).
 * Ambiguous entities are never auto-picked: they are written to data/choices.json for a person to fill.
 */
import fs from "node:fs";
import path from "node:path";
import { EVAL_ROOT, readJson, requireLive, rng, writeResult } from "../lib.ts";
import { llmOnlyPlan } from "../baselines.ts";
import { blindFromHouseMix, blindFromL0 } from "./format.ts";

requireLive("ab:pairs");
const { createShow, confirmEntity, getShow } = await import("../../apps/api/src/shows/service.ts");
const { runPlan } = await import("../../apps/api/src/agent/run.ts");
const { getQloo } = await import("../../apps/api/src/qloo/client.ts");

type AbShow = { id: string; verified: boolean; input: Record<string, unknown> };
const ds = readJson<{ shows: AbShow[]; split: { dev: string[]; test: string[] } }>(path.join(EVAL_ROOT, "data/ab_shows.json"));
const choicesFile = path.join(EVAL_ROOT, "data/choices.json");
const choices = readJson<Record<string, Record<string, string>>>(choicesFile, {});
const pending: Record<string, Record<string, { input: string; candidates: { id: string; name: string; about?: string }[] }>> = {};
const pairs = [];
const key: Record<string, { left: "house_mix" | "l0" }> = {};
const plans = [];
const rand = rng(20251031);

for (const s of ds.shows) {
  if (!s.verified) {
    console.log(`${s.id}: skipped (not verified)`);
    continue;
  }
  let show = await createShow(s.input);
  for (const e of show.entities.filter((x) => x.status === "needs_confirmation")) {
    const choice = choices[s.id]?.[e.key];
    if (choice) show = await confirmEntity(show.id, e.key, choice);
    else (pending[s.id] ??= {})[e.key] = { input: e.input, candidates: e.candidates.map((c) => ({ id: c.qlooId, name: c.name, about: c.disambiguation })) };
  }
  show = await getShow(show.id);
  if (show.status !== "ready_to_plan") {
    console.log(`${s.id}: waiting for a person to choose entities in data/choices.json`);
    continue;
  }
  const started = Date.now();
  const plan = await runPlan(show, `eval_${s.id}`, () => {});
  show.plan = plan;
  const l0 = await llmOnlyPlan(show);
  const hm = blindFromHouseMix(show);
  const lo = blindFromL0(show, l0);
  const left = rand() < 0.5 ? "house_mix" : "l0";
  key[s.id] = { left };
  pairs.push({ pairId: s.id, split: ds.split.dev.includes(s.id) ? "dev" : "test", title: show.title, mode: show.input.mode, venue: show.input.venue, city: show.input.city, left: left === "house_mix" ? hm : lo, right: left === "house_mix" ? lo : hm });
  plans.push({ id: s.id, showId: show.id, durationMs: Date.now() - started, stats: plan.stats, plan, l0 });
  console.log(`${s.id}: ${show.title} done in ${Math.round((Date.now() - started) / 1000)}s`);
}

fs.writeFileSync(path.join(EVAL_ROOT, "ab_blind/pairs.public.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), pairs }, null, 2)}\n`);
fs.writeFileSync(path.join(EVAL_ROOT, "ab_blind/pairs.key.json"), `${JSON.stringify(key, null, 2)}\n`);
writeResult("plans", { plans });
if (Object.keys(pending).length) {
  fs.writeFileSync(path.join(EVAL_ROOT, "data/choices.pending.json"), `${JSON.stringify(pending, null, 2)}\n`);
  console.log("Some entities need a person's choice: copy picks from data/choices.pending.json into data/choices.json and re-run.");
}
await getQloo().close();
