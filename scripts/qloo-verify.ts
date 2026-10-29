/**
 * npm run qloo:verify — run once QLOO_API_KEY exists.
 *  1. Installs or reuses @qloo/qloo-harness (>= 0.1.26) and starts `qloo mcp` (live).
 *  2. Runs qloo_capabilities and one representative call per tool.
 *  3. Diffs the live tool schemas against the frozen contract the mock serves, and the live
 *     envelopes / result-item shapes against the mock's, and checks every House Mix adapter
 *     (apps/api/src/qloo/normalize.ts) extracts data from the live shapes.
 *  4. Records live fixtures in fixtures/live/, refreshes the frozen contract, writes docs/QLOO_VERIFY.md.
 *  5. If every adapter check passes, switches the default to QLOO_MODE=live in .env.local.
 * Exit codes: 0 verified, 1 adapter/shape problems to fix, 2 missing key or harness.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.HM_DATA_DIR ??= path.join(ROOT, "data", "verify");
process.env.QLOO_MODE = "live";

const { QlooClient } = await import("../apps/api/src/qloo/client.ts");
const { FileStore, setStore } = await import("../apps/api/src/store/store.ts");
const N = await import("../apps/api/src/qloo/normalize.ts");
const { execute } = await import("../apps/api/src/qloo/mock-engine.ts");
const frozenPath = path.join(ROOT, "apps/api/src/qloo/contract/tools.json");
const frozen = JSON.parse(fs.readFileSync(frozenPath, "utf8")) as { harness_version: string; tools: { name: string; inputSchema: unknown }[] };

function log(s: string) {
  process.stdout.write(`${s}\n`);
}

if (!process.env.QLOO_API_KEY) {
  log("QLOO_API_KEY is not set. Put it in .env.local (gitignored) and run `npm run qloo:verify` again.");
  process.exit(2);
}

function harnessVersion(bin: string): string | undefined {
  try {
    return execFileSync(bin, ["--version"], { encoding: "utf8" }).trim().replace(/^v/, "");
  } catch {
    return undefined;
  }
}
const atLeast = (v: string, min: string) => {
  const a = v.split(".").map(Number);
  const b = min.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return true;
};

let bin = process.env.QLOO_BIN ?? "qloo";
let version = harnessVersion(bin);
if (!version || !atLeast(version, "0.1.26")) {
  log(`qloo ${version ?? "not found"}; installing @qloo/qloo-harness@^0.1.26 locally…`);
  execFileSync("npm", ["install", "--no-save", "--prefix", path.join(ROOT, ".qloo-harness"), "@qloo/qloo-harness@^0.1.26"], { stdio: "inherit" });
  bin = path.join(ROOT, ".qloo-harness/node_modules/.bin/qloo");
  version = harnessVersion(bin);
  if (!version) {
    log("Could not install the Qloo harness.");
    process.exit(2);
  }
}
process.env.QLOO_BIN = bin;
log(`Using qloo ${version} (${bin})`);

fs.mkdirSync(process.env.HM_DATA_DIR!, { recursive: true });
setStore(new FileStore(process.env.HM_DATA_DIR!));
const qloo = new QlooClient("live");
const problems: string[] = [];
const notes: string[] = [];
const ctx = { runId: "verify" };

const cap = await qloo.capabilities();
const adapter = (cap.adapter ?? {}) as { ready?: boolean };
if (!adapter.ready) {
  log("qloo_capabilities reports ready:false. Check `qloo setup --status`.");
  process.exit(2);
}

// 1. Tool schema diff.
const live = await qloo.listTools();
const liveNames = live.map((t) => t.name).sort();
const frozenNames = frozen.tools.map((t) => t.name).sort();
if (JSON.stringify(liveNames) !== JSON.stringify(frozenNames)) problems.push(`Tool names differ. live=${liveNames.join(",")} frozen=${frozenNames.join(",")}`);
for (const t of live) {
  const f = frozen.tools.find((x) => x.name === t.name);
  if (f && JSON.stringify(f.inputSchema) !== JSON.stringify(t.inputSchema)) notes.push(`Input schema changed for ${t.name}; the frozen contract is refreshed below.`);
}

// 2. One representative call per tool.
type R = { tool: string; args: Record<string, unknown>; status: string; ok: boolean; check: string };
const rows: R[] = [];
const keysOf = (o: unknown) => (o && typeof o === "object" && !Array.isArray(o) ? Object.keys(o).sort() : []);
const firstItem = (env: Record<string, unknown>) => {
  const r = env.results ?? env.series;
  if (Array.isArray(r)) return r[0];
  if (r && typeof r === "object") return Object.values(r as object).find(Array.isArray)?.[0];
  return undefined;
};
fs.mkdirSync(path.join(ROOT, "fixtures/live"), { recursive: true });

async function probe(tool: string, args: Record<string, unknown>, check: (c: import("@housemix/shared").LedgerCall) => string | undefined) {
  const { call, envelope } = await qloo.call(tool as never, args, ctx);
  fs.writeFileSync(path.join(ROOT, "fixtures/live", `${tool}.json`), JSON.stringify({ args, envelope }, null, 2));
  let mockEnv: Record<string, unknown> | undefined;
  try {
    mockEnv = execute(tool, args);
  } catch {
    mockEnv = undefined;
  }
  const liveKeys = keysOf(envelope);
  const mockKeys = keysOf(mockEnv);
  const missing = liveKeys.filter((k) => !mockKeys.includes(k));
  if (mockEnv && missing.length && envelope.status === mockEnv.status) notes.push(`${tool}: live envelope has keys the mock lacks: ${missing.join(", ")}`);
  const li = keysOf(firstItem(envelope as Record<string, unknown>));
  const mi = keysOf(mockEnv ? firstItem(mockEnv) : undefined);
  const itemMissing = li.filter((k) => !mi.includes(k));
  if (li.length && itemMissing.length) notes.push(`${tool}: live result items have keys the mock lacks: ${itemMissing.join(", ")}`);
  const err = call.status === "error" ? `error ${call.error?.code}: ${call.summary}` : check(call);
  rows.push({ tool, args, status: call.status, ok: !err, check: err ?? "adapter extracts data" });
  if (err) problems.push(`${tool}: ${err}`);
  return call;
}

const describe = await probe("qloo_describe", { entity: "Radiohead", type: "artist" }, (c) => (N.entitiesOf(c)[0] ? undefined : "describe: no entity extracted"));
const a = N.entitiesOf(describe)[0]?.id;
const describe2 = await probe("qloo_describe", { entity: "Portishead", type: "artist" }, (c) => (N.entitiesOf(c)[0] ? undefined : "describe: no entity extracted"));
const b = N.entitiesOf(describe2)[0]?.id;
if (!a || !b) {
  log("describe did not resolve the probe artists; cannot continue.");
  process.exit(1);
}
await probe("qloo_find_tags", { query: "jazz", limit: 5 }, (c) => (N.entitiesOf(c).length ? undefined : "find_tags: no tags extracted"));
const rec = await probe("qloo_recommend", { target_type: "artist", signals: [a], signal_location: "New York City", limit: 10 }, (c) => (N.entitiesOf(c).length ? undefined : "recommend: no entities extracted"));
const opts = N.entitiesOf(rec).slice(0, 6).map((e) => e.id);
await probe("qloo_rank", { options: opts, option_type: "artist", signals: [a], signal_location: "New York City", demographic: "adults 25-34" }, (c) => (N.entitiesOf(c).length === opts.length ? undefined : `rank: expected ${opts.length} ranked entities, got ${N.entitiesOf(c).length}`));
await probe("qloo_where_popular", { entity: a, entity_type: "artist", within: "New York City", limit: 10 }, (c) => (c.status === "empty" || N.heatmapOf(c).length ? undefined : "where_popular: heatmap points not extracted"));
await probe("qloo_compare_audiences", { group_a: [a], group_b: [b], limit: 10 }, (c) => (N.compareOf(c).rows.length ? undefined : "compare_audiences: no a/b rows extracted (check compareOf against fixtures/live/qloo_compare_audiences.json)"));
await probe("qloo_entity_tags", { entities: [a, b], entity_type: "artist", limit: 10 }, (c) => (N.entitiesOf(c).length ? undefined : "entity_tags: no tags extracted"));
await probe("qloo_audience_demographics", { entity: a, entity_type: "artist" }, (c) => (N.demographicsOf(c).age.length ? undefined : "audience_demographics: no age buckets extracted"));
const end = new Date();
const start = new Date(end.getTime() - 90 * 86400000);
await probe("qloo_trends", { entities: [a, b], entity_type: "artist", start_date: start.toISOString().slice(0, 10), end_date: end.toISOString().slice(0, 10), limit: 12 }, (c) => (N.trendsOf(c)[0]?.points.length ? undefined : "trends: no series points extracted"));
await probe("qloo_describe", { entity: "Genesis" }, (c) => (c.status === "needs_input" ? (c.issues[0]?.candidates.length ? undefined : "needs_input without candidates") : c.status === "ok" ? undefined : `unexpected ${c.status}`));

// 3. Refresh the frozen contract with the live schemas (the mock serves these).
fs.writeFileSync(frozenPath, `${JSON.stringify({ harness_version: version, tools: live }, null, 2)}\n`);

// 4. Report.
const md = [
  "# Qloo verify report",
  "",
  `Run: ${new Date().toISOString()} · harness ${version} · contract ${String(cap.contract_version)}`,
  "",
  "| Tool | Status | Adapter check |",
  "| --- | --- | --- |",
  ...rows.map((r) => `| \`${r.tool}\` | ${r.status} | ${r.ok ? "✅" : "❌"} ${r.check} |`),
  "",
  "## Differences from the mock",
  "",
  ...(notes.length ? notes.map((n) => `- ${n}`) : ["- None found."]),
  "",
  "## Problems",
  "",
  ...(problems.length ? problems.map((p) => `- ${p}`) : ["- None. House Mix's adapters read every live shape."]),
  "",
  "Live fixtures: `fixtures/live/*.json` (requests and envelopes; no credentials).",
  "",
].join("\n");
fs.writeFileSync(path.join(ROOT, "docs/QLOO_VERIFY.md"), md);
await qloo.close();
log(md);

if (problems.length) {
  log("Adapter problems found: fix apps/api/src/qloo/normalize.ts (and the mock) against fixtures/live, then re-run.");
  process.exit(1);
}

// 5. Switch the default to live.
const envFile = path.join(ROOT, ".env.local");
let env = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
env = /^QLOO_MODE=.*$/m.test(env) ? env.replace(/^QLOO_MODE=.*$/m, "QLOO_MODE=live") : `${env.trimEnd()}\nQLOO_MODE=live\n`;
fs.writeFileSync(envFile, env, { mode: 0o600 });
log("Verified. QLOO_MODE=live is now the default in .env.local. Next: npm run eval:all, then infra/deploy-api.sh.");
