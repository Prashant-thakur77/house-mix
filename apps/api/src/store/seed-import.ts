import fs from "node:fs";
import path from "node:path";
import type { LedgerCall, RunState, Show } from "@housemix/shared";
import { REPO_ROOT, config } from "../config.ts";
import { getStore } from "./store.ts";

/** Loads the seeded demo shows (fixtures/seed/<qloo mode>/) into the store if they are not there yet. */
export async function importSeeds(): Promise<number> {
  const dir = path.join(REPO_ROOT, "fixtures/seed", config.qlooMode);
  if (!fs.existsSync(dir)) return 0;
  const store = getStore();
  let n = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const seed = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as { show: Show; ledger: LedgerCall[]; run: RunState };
    if (await store.get("shows", seed.show.id)) continue;
    for (const c of seed.ledger) await store.put("ledger", c.callId, c);
    await store.put("runs", seed.run.runId, seed.run);
    await store.put("shows", seed.show.id, seed.show);
    n++;
  }
  return n;
}
