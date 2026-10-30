import { createHash } from "node:crypto";
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
    const raw = fs.readFileSync(path.join(dir, f), "utf8");
    const seedHash = createHash("sha256").update(raw).digest("hex");
    const seed = JSON.parse(raw) as { show: Show; ledger: LedgerCall[]; run: RunState };
    const existing = await store.get<Show>("shows", seed.show.id);
    // A changed seed file replaces the stored copy (and any demo edits made to it); an unchanged one is kept.
    if (existing?.seedHash === seedHash) continue;
    for (const c of seed.ledger) await store.put("ledger", c.callId, c);
    await store.put("runs", seed.run.runId, seed.run);
    await store.put("shows", seed.show.id, { ...seed.show, seedHash });
    n++;
  }
  return n;
}
