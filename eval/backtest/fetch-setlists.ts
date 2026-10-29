/**
 * Builds the hit@10 backtest cases from setlist.fm: for each 2025 headliner, the first show where
 * other artists played the same venue on the same date (those are the support acts).
 * Writes eval/data/backtest_cases.json. Skips (exit 0) when SETLISTFM_API_KEY is missing.
 */
import path from "node:path";
import fs from "node:fs";
import { EVAL_ROOT, norm, readJson, rng, shuffle } from "../lib.ts";
import { sameNight, setlistsFor } from "./setlistfm.ts";

interface Headliners {
  seed: number;
  devCount: number;
  headliners: { name: string; genre: string }[];
}
export interface BacktestCase {
  id: string;
  headliner: string;
  genre: string;
  date: string;
  venue: string;
  city: string;
  support: string[];
  split: "dev" | "test";
}

if (!process.env.SETLISTFM_API_KEY) {
  console.log("SETLISTFM_API_KEY missing: backtest fetch skipped. Add the key to .env.local and re-run `npm run eval:fetch`.");
  process.exit(0);
}

const cfg = readJson<Headliners>(path.join(EVAL_ROOT, "data/backtest_headliners.json"));
const cases: BacktestCase[] = [];
const skipped: { headliner: string; reason: string }[] = [];

for (const h of cfg.headliners) {
  let found: BacktestCase | undefined;
  for (let page = 1; page <= 2 && !found; page++) {
    const sets = (await setlistsFor(h.name, 2025, page)).filter((s) => norm(s.artist.name) === norm(h.name));
    for (const s of sets.slice(0, 8)) {
      const night = await sameNight(s.venue.id, s.eventDate);
      const support = [...new Set(night.filter((x) => norm(x.artist.name) !== norm(h.name)).map((x) => x.artist.name))];
      if (support.length) {
        const [d, m, y] = s.eventDate.split("-");
        found = { id: `bt_${cases.length + 1}`, headliner: h.name, genre: h.genre, date: `${y}-${m}-${d}`, venue: s.venue.name, city: s.venue.city.name, support, split: "test" };
        break;
      }
    }
  }
  if (found) cases.push(found);
  else skipped.push({ headliner: h.name, reason: "no 2025 setlist.fm show with a listed support act" });
  console.log(`${h.name}: ${found ? `${found.date} ${found.venue} + ${found.support.join(", ")}` : "skipped"}`);
  if (cases.length >= 30) break;
}

const order = shuffle(cases.map((c) => c.id), rng(cfg.seed));
const dev = new Set(order.slice(0, cfg.devCount));
for (const c of cases) c.split = dev.has(c.id) ? "dev" : "test";
fs.writeFileSync(path.join(EVAL_ROOT, "data/backtest_cases.json"), `${JSON.stringify({ fetchedAt: new Date().toISOString(), source: "setlist.fm API (non-commercial)", cases, skipped }, null, 2)}\n`);
console.log(`${cases.length} cases (${dev.size} dev), ${skipped.length} skipped.`);
