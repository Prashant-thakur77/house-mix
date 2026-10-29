/**
 * Deterministic engine behind the mock `qloo mcp` server. It reproduces the real envelope
 * shapes documented in docs/QLOO_CONTRACT.md (harness 0.1.26) over fictional fixtures in
 * fixtures/mock/pool.json, including name resolution and every status.
 *
 * Status triggers (documented in plan.md §7):
 *  - describe / any entity field: "Genesis", "Giants", "The Comedy Store" → needs_input (ambiguous)
 *  - names starting with unknown|nobody|zzz|qwerty → needs_input (not_found)
 *  - free-text tag concepts without an exact tag name → needs_input (ambiguous tag)
 *  - demographic without signal_location → needs_input (precondition)
 *  - where_popular within "Antarctica"/"Nowhere" → empty
 *  - where_popular within a city outside the fixture table → partial
 *  - audience_demographics for a person (comedian) → degraded
 *  - trends including a thin-coverage entity → partial
 *  - first trends call for an argument set → error QLOO_RATE_LIMIT (retryable) once
 *  - MOCK_FORCE_ERROR=<tool name> → error QLOO_CONTRACT (not retryable)
 * Real 0.1.26 never emits partial/degraded; the mock does so House Mix's handling is exercised.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { parseDemographic } from "@housemix/shared";
import { REPO_ROOT } from "../config.ts";
import { toShape } from "../agent/jsonschema-zod.ts";
import contract from "./contract/tools.json" with { type: "json" };

type Rec = Record<string, unknown>;

interface PoolEntity {
  id: string;
  name: string;
  type: string; // bare id: artist, person, brand, place, podcast, album, videogame, locality
  tags: string[];
  popularity: number;
  description?: string;
  release_year?: number;
  address?: string;
  geocode?: { latitude: number; longitude: number };
  thin?: boolean;
  /** Created at runtime from a looked-up name: resolvable by name and ID, but never a recommendation candidate. */
  lookupOnly?: boolean;
}

interface PoolTag {
  key: string;
  id: string;
  name: string;
  type: string;
}

const POOL = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "fixtures/mock/pool.json"), "utf8")) as {
  tags: { key: string; name: string; type: string }[];
  artists: { name: string; tags: string[]; popularity: number }[];
  persons: { name: string; tags: string[]; popularity: number }[];
  podcasts: { name: string; tags: string[]; popularity: number }[];
  brands: { name: string; tags: string[]; popularity: number }[];
  placeTemplates: { name: string; tags: string[] }[];
  placeWords: string[];
  cities: Record<string, [number, number]>;
  ambiguous: Record<string, { name: string; type: string; popularity: number; description?: string; release_year?: number; address?: string }[]>;
  notFoundPrefixes: string[];
  teamWords: string[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const norm = (s: string) => s.normalize("NFKC").toLowerCase().trim();

export function mockUuid(seed: string): string {
  const h = createHash("sha1").update(`house-mix-mock|${seed}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${"89ab"[parseInt(h[16]!, 16) % 4]}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Stable pseudo-random number in [0,1) for a seed. */
function rand(seed: string): number {
  return parseInt(createHash("sha1").update(seed).digest("hex").slice(0, 8), 16) / 0xffffffff;
}

const TAGS: PoolTag[] = POOL.tags.map((t) => ({ ...t, id: `${t.type.replace(/^urn:tag:/, "urn:tag:")}:${t.key}` }));
const TAG_BY_KEY = new Map(TAGS.map((t) => [t.key, t]));
const TAG_BY_ID = new Map(TAGS.map((t) => [t.id, t]));

const MUSIC_TAGS = TAGS.filter((t) => t.type.endsWith(":music")).map((t) => t.key);
const COMEDY_TAGS = TAGS.filter((t) => t.type.endsWith(":comedy")).map((t) => t.key);
const BRAND_TAGS = TAGS.filter((t) => t.type.endsWith(":brand")).map((t) => t.key);
const PLACE_TAGS = TAGS.filter((t) => t.type.endsWith(":place")).map((t) => t.key);

const ENTITIES = new Map<string, PoolEntity>();
function add(e: Omit<PoolEntity, "id"> & { id?: string }) {
  const id = e.id ?? mockUuid(`${e.type}|${e.name}`);
  const full = { ...e, id };
  ENTITIES.set(id, full);
  return full;
}
for (const a of POOL.artists) add({ ...a, type: "artist" });
for (const p of POOL.persons) add({ ...p, type: "person" });
for (const p of POOL.podcasts) add({ ...p, type: "podcast" });
for (const b of POOL.brands) add({ ...b, type: "brand" });
const AMBIGUOUS_IDS = new Map<string, string[]>();
/** The disambiguation fixtures ("Giants", "Genesis") exist to exercise needs_input; they are never recommended. */
const AMBIGUOUS_MEMBERS = new Set<string>();
for (const [key, cands] of Object.entries(POOL.ambiguous)) {
  AMBIGUOUS_IDS.set(key, cands.map((_, i) => mockUuid(`ambiguous|${key}|${i}`)));
  cands.forEach((_, i) => AMBIGUOUS_MEMBERS.add(mockUuid(`ambiguous|${key}|${i}`)));
  cands.forEach((c, i) =>
    add({ id: mockUuid(`ambiguous|${key}|${i}`), name: c.name, type: c.type.split(":").pop()!, tags: tagsFor(`${key}|${i}`, c.type), popularity: c.popularity, description: c.description, release_year: c.release_year, address: c.address }),
  );
}


function loadSynthetics() {
  for (const [id, v] of Object.entries(syntheticSeen)) makeSynthetic(v.name, v.type, !(id in COMMITTED_SYNTHETICS));
}

function tagsFor(seed: string, type: string): string[] {
  const t = type.split(":").pop();
  const source = t === "person" ? COMEDY_TAGS : t === "brand" ? [...BRAND_TAGS, "football", "baseball"] : t === "place" ? PLACE_TAGS : MUSIC_TAGS;
  const picks = new Set<string>();
  let i = 0;
  while (picks.size < 3 && i < 20) picks.add(source[Math.floor(rand(`${seed}|tag|${i++}`) * source.length)]!);
  return [...picks];
}

function cityKey(s: string): string | undefined {
  const n = norm(s).replace(/,.*$/, "");
  return POOL.cities[n] ? n : Object.keys(POOL.cities).find((c) => n.includes(c));
}

function placesIn(city: string): PoolEntity[] {
  const key = cityKey(city) ?? norm(city);
  const [lat, lon] = POOL.cities[key] ?? [rand(`${key}|lat`) * 100 - 50, rand(`${key}|lon`) * 300 - 150];
  const out: PoolEntity[] = [];
  POOL.placeTemplates.forEach((tpl, i) => {
    const word = POOL.placeWords[Math.floor(rand(`${key}|w|${i}`) * POOL.placeWords.length)]!;
    const name = tpl.name.replace("{N}", word);
    const id = mockUuid(`place|${key}|${name}`);
    const existing = ENTITIES.get(id);
    if (existing) return out.push(existing);
    out.push(
      add({
        id,
        name,
        type: "place",
        tags: tpl.tags,
        popularity: 0.35 + rand(`${id}|pop`) * 0.55,
        address: `${10 + Math.floor(rand(`${id}|no`) * 890)} Example Ave, ${titleCase(key)} (fictional)`,
        geocode: { latitude: round(lat + (rand(`${id}|dlat`) - 0.5) * 0.12, 4), longitude: round(lon + (rand(`${id}|dlon`) - 0.5) * 0.12, 4) },
      }),
    );
  });
  return out;
}

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

function guessType(name: string, scope?: string): string {
  if (scope) return scope;
  const words = norm(name).split(/\s+/);
  if (words.some((w) => POOL.teamWords.includes(w))) return "brand";
  return "artist";
}

/**
 * Synthetic entities (user-typed names outside the pool) are persisted, so their IDs keep
 * resolving after the mock server restarts, exactly as real Qloo IDs would.
 */
const SYNTHETIC_FILE = path.join(process.env.HM_DATA_DIR ?? path.join(REPO_ROOT, "data"), "mock-synthetic.json");
const readJsonFile = (f: string): Record<string, { name: string; type: string }> => {
  try {
    return JSON.parse(fs.readFileSync(f, "utf8")) as Record<string, { name: string; type: string }>;
  } catch {
    return {};
  }
};
// The committed registry keeps the seeded demo shows' IDs resolvable on a fresh deployment. Only these
// join the recommendation pools; names looked up at runtime (e.g. the "Without Qloo" picks) never do,
// so one lookup can't turn "Spotify (sponsor-fit 8/10)" into a candidate for every later plan.
const COMMITTED_SYNTHETICS = readJsonFile(path.join(REPO_ROOT, "fixtures/mock/synthetic.json"));
const syntheticSeen: Record<string, { name: string; type: string }> = {
  ...COMMITTED_SYNTHETICS,
  ...readJsonFile(SYNTHETIC_FILE),
};

function makeSynthetic(name: string, type: string, lookupOnly = true): PoolEntity {
  const id = mockUuid(`${type}|${norm(name)}`);
  return (
    ENTITIES.get(id) ??
    add({
      id,
      name: name.trim(),
      type,
      tags: tagsFor(norm(name), type),
      popularity: 0.5 + rand(`${id}|pop`) * 0.45,
      description: `Mock entity for "${name.trim()}" (fictional profile)`,
      thin: type !== "brand" && rand(`${id}|thin`) < 0.25,
      lookupOnly,
    })
  );
}

/** A user-typed name outside the pool becomes a stable synthetic entity (so real names "resolve" in mock mode). */
function synthetic(name: string, scope?: string): PoolEntity {
  const e = makeSynthetic(name, guessType(name, scope));
  if (!syntheticSeen[e.id]) {
    syntheticSeen[e.id] = { name: e.name, type: e.type };
    try {
      fs.mkdirSync(path.dirname(SYNTHETIC_FILE), { recursive: true });
      fs.writeFileSync(SYNTHETIC_FILE, JSON.stringify(syntheticSeen));
    } catch {
      // read-only filesystem: IDs still resolve for this process
    }
  }
  return e;
}

loadSynthetics();

type Resolution =
  | { ok: true; entity: PoolEntity; match: "identifier" | "exact" | "semantic"; input: string }
  | { ok: false; issue: Rec };

const PROVIDER = {
  contract_version: "1.0-preview.1",
  provider_id: "qloo_api",
  name: "Qloo native resolution (House Mix mock)",
  entity_strategy: "exact_name_context_or_choice",
  tag_strategy: "target_scoped_semantic_search_exact_name_or_choice",
  remote: false,
  uses_model: false,
  fallback: "none",
};

const resProv = (endpoint: string, strategy: string) => ({
  contract_version: "1.0-preview.1",
  provider_id: "qloo_api",
  provider_name: "Qloo native resolution (House Mix mock)",
  endpoint,
  strategy,
  remote: false,
  uses_model: false,
});

function candidate(e: PoolEntity) {
  return {
    id: e.id,
    name: e.name,
    type: `urn:entity:${e.type}`,
    popularity: round(e.popularity),
    ...(e.description ? { description: e.description } : {}),
    ...(e.release_year ? { release_year: e.release_year } : {}),
    ...(e.address ? { address: e.address } : {}),
  };
}

function resolveEntity(input: string, field: string, scope?: string): Resolution {
  if (UUID_RE.test(input)) {
    // Places are generated per city on first use; make sure every fixture city's places exist
    // so place IDs from an earlier process (stored plans) still resolve, as real Qloo IDs do.
    if (!ENTITIES.has(input)) for (const c of Object.keys(POOL.cities)) placesIn(c);
    const e = ENTITIES.get(input);
    if (e) return { ok: true, entity: e, match: "identifier", input };
    return { ok: false, issue: { input, kind: "not_found", input_kind: "entity", field, ...(scope ? { scope: `urn:entity:${scope}` } : {}), provenance: resProv("/entities", "identifier_lookup") } };
  }
  const n = norm(input);
  const prov = resProv("/search", "exact_name_context_or_choice");
  if (POOL.notFoundPrefixes.some((p) => n.startsWith(p))) {
    return { ok: false, issue: { input, kind: "not_found", input_kind: "entity", field, ...(scope ? { scope: `urn:entity:${scope}` } : {}), provenance: prov } };
  }
  // Search finds named things, not descriptions: "Natural wine and spritz bar" or
  // "Patagonia / outdoor apparel collab" is not an entity in the catalogue.
  const words = input.trim().split(/\s+/);
  const lower = words.filter((w) => /^[a-z]/.test(w)).length;
  if ((words.length >= 4 && lower / words.length > 0.5) || /\(e\.g\.|\s\/\s|\s+or\s+/i.test(input)) {
    return { ok: false, issue: { input, kind: "not_found", input_kind: "entity", field, ...(scope ? { scope: `urn:entity:${scope}` } : {}), provenance: prov } };
  }
  const amb = POOL.ambiguous[n];
  if (amb) {
    const cands = (AMBIGUOUS_IDS.get(n) ?? []).map((id) => ENTITIES.get(id)!);
    const scoped = scope ? cands.filter((c) => c.type === scope) : cands;
    if (scoped.length === 1) return { ok: true, entity: scoped[0]!, match: "exact", input };
    return {
      ok: false,
      issue: { input, kind: "ambiguous", input_kind: "entity", field, ...(scope ? { scope: `urn:entity:${scope}` } : {}), candidates: (scoped.length ? scoped : cands).slice(0, 5).map(candidate), provenance: prov },
    };
  }
  const exact = [...ENTITIES.values()].find((e) => norm(e.name) === n && (!scope || e.type === scope));
  return { ok: true, entity: exact ?? synthetic(input, scope), match: "exact", input };
}

type TagResolution = { ok: true; tag: PoolTag; match: "exact" | "identifier"; input: string } | { ok: false; issue: Rec };

function searchTags(query: string): PoolTag[] {
  const words = norm(query).split(/[^a-z0-9&]+/).filter((w) => w.length > 1);
  return TAGS.map((t) => ({ t, s: words.filter((w) => norm(t.name).includes(w) || t.key.includes(w)).length }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.t.name.localeCompare(b.t.name))
    .map((x) => x.t);
}

function resolveTag(input: string, field: string, purpose: string, scope: string): TagResolution {
  if (input.startsWith("urn:tag:")) {
    return { ok: true, tag: TAG_BY_ID.get(input) ?? { key: input, id: input, name: input, type: "urn:tag" }, match: "identifier", input };
  }
  const exact = TAGS.find((t) => norm(t.name) === norm(input));
  if (exact) return { ok: true, tag: exact, match: "exact", input };
  const cands = searchTags(input).slice(0, 5);
  return {
    ok: false,
    issue: {
      input,
      kind: cands.length ? "ambiguous" : "not_found",
      input_kind: "tag",
      field,
      scope: `urn:entity:${scope}`,
      purpose,
      ...(cands.length ? { candidates: cands.map((t, i) => ({ id: t.id, name: t.name, type: t.type, rank: i + 1, popularity: round(0.4 + rand(t.id) * 0.5), parent_types: [`urn:entity:${scope}`] })) } : {}),
      provenance: resProv("/v2/tags", "semantic_search_local_parent_scope_exact_name_or_choice"),
      warnings: [
        cands.length
          ? "Qloo semantic search returned ranked candidates without a calibrated relevance score; choose one before the workflow continues."
          : `No candidate in the first 20 Qloo semantic tag results supports urn:entity:${scope}.`,
      ],
    },
  };
}

const ie = (r: { entity: PoolEntity; match: string; input: string }) => ({
  input: r.input,
  entityId: r.entity.id,
  name: r.entity.name,
  type: `urn:entity:${r.entity.type}`,
  match: r.match,
});
const it = (r: { tag: PoolTag; match: string; input: string }) => ({ input: r.input, tagId: r.tag.id, name: r.tag.name, match: r.match });

function outcome(r: Resolution & { ok: true }) {
  return {
    input: r.input,
    status: "resolved",
    match: r.match,
    selected: candidate(r.entity),
    provenance: r.match === "identifier" ? resProv("/entities", "identifier_lookup") : resProv("/search", "exact_name_context_or_choice"),
  };
}

function entityItem(e: PoolEntity, affinity?: number, explain?: Rec) {
  const properties: Rec = {};
  if (e.description) properties.short_description = e.description;
  if (e.address) properties.address = e.address;
  if (e.geocode) properties.geocode = e.geocode;
  return {
    entity_id: e.id,
    name: e.name,
    type: "urn:entity",
    subtype: `urn:entity:${e.type}`,
    popularity: round(e.popularity),
    ...(affinity !== undefined ? { affinity: round(affinity) } : {}),
    ...(explain ? { explainability: explain } : {}),
    ...(Object.keys(properties).length ? { properties } : {}),
  };
}

/** Affinity of a candidate for a set of taste signals: tag overlap plus a stable jitter. */
function affinity(e: PoolEntity, signalTags: Set<string>, seed: string): number {
  const overlap = e.tags.filter((t) => signalTags.has(t)).length;
  const base = signalTags.size ? overlap / Math.min(3, signalTags.size) : 0.4;
  return Math.max(0.05, Math.min(0.99, 0.35 + 0.5 * Math.min(1, base) + (rand(`${seed}|${e.id}`) - 0.5) * 0.2));
}

const DOCS: Record<string, [string, string]> = {
  recommend: ["/v2/insights", "insights-api-deep-dive"],
  rank: ["/v2/insights", "insights-api-deep-dive"],
  describe: ["/entities", "get-entities"],
  where_popular: ["/v2/insights", "heatmaps-use-case"],
  compare_audiences: ["/v2/analysis/compare", "analysis-compare"],
  entity_tags: ["/v2/insights", "taste-analysis"],
  audience_demographics: ["/v2/insights", "demographics-use-case"],
  trends: ["/v2/trending", "get-trending"],
  find_tags: ["/v2/tags", "get-tags"],
};

let correlation = 0;
const execution = (started: number) => ({
  transport: "mcp",
  transport_name: "Qloo canonical MCP (House Mix mock)",
  correlation_id: `mock-${++correlation}`,
  duration_ms: Date.now() - started,
});

function provenance(op: string, query: Rec) {
  const [endpoint, slug] = DOCS[op]!;
  return {
    source: "House Mix mock fixtures (not Qloo data)",
    endpoint,
    documentation: `https://docs.qloo.com/reference/${slug}`,
    requests: [{ method: "GET", path: endpoint, query }],
    transport: "mcp",
  };
}

function queryIntent(op: string, extra: Rec = {}) {
  return {
    schema_version: "1.0-preview.1",
    source_contract_version: "1.0.0",
    operation: op,
    job: op,
    signals: {},
    filters: {},
    operators: {},
    output: {},
    assumptions: [],
    unresolved: [],
    ...extra,
  };
}

const NEEDS_SUMMARY: Record<string, string> = {
  recommend: "Choose or correct the unresolved Qloo inputs.",
  rank: "Choose or correct the unresolved ranking inputs.",
  compare_audiences: "Choose or correct the unresolved comparison inputs.",
  entity_tags: "Choose or correct the unresolved Qloo entities.",
  trends: "Choose or correct the unresolved Qloo entities.",
  describe: "Choose the intended Qloo entity.",
  where_popular: "Choose the intended Qloo entity.",
  audience_demographics: "Choose the intended Qloo entity.",
};

function needsInput(op: string, issues: Rec[], started: number, summary = NEEDS_SUMMARY[op]!, qi: Rec = {}) {
  return { schema_version: "1.0-preview.1", operation: op, status: "needs_input", summary, resolution: { issues }, results: [], query_intent: queryIntent(op, qi), execution: execution(started) };
}

export function errorEnvelope(op: string, code: string, layer: string, retryable: boolean, recovery: string, summary: string, started: number) {
  return { schema_version: "1.0-preview.1", operation: op, status: "error", summary, query_intent: queryIntent(op), error: { code, layer, retryable, recovery }, results: [], execution: execution(started) };
}

const TOOLS = (contract as { tools: { name: string; inputSchema: Rec }[] }).tools;
const VALIDATORS = new Map(TOOLS.map((t) => [t.name, z.object(toShape(t.inputSchema as never)).strict()]));

const rateLimitedOnce = new Set<string>();
const FORCE_ERROR = () => (process.env.MOCK_FORCE_ERROR ?? "").split(",").map((s) => s.trim());

function resolution(outcomes: Rec[], warnings: string[] = []) {
  return { contract_version: "1.0-preview.1", provider: PROVIDER, outcomes, ...(warnings.length ? { warnings } : {}) };
}

/** Executes one mock tool call and returns the envelope (`structuredContent`). */
export function execute(tool: string, rawArgs: Rec): Rec {
  const started = Date.now();
  const op = tool.replace(/^qloo_/, "");
  const validator = VALIDATORS.get(tool);
  if (!validator || tool === "qloo_capabilities") throw new Error(`Unknown Qloo MCP tool: ${tool}`);
  const parsed = validator.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `/${i.path.join("/")}: ${i.message}`).slice(0, 20).join("; ");
    return errorEnvelope(op, "TOOL_INPUT", "tool_input", false, "Correct the reported tool arguments and submit the operation once more.", `Invalid ${op} input: ${msg}`, started);
  }
  if (FORCE_ERROR().includes(tool)) {
    return errorEnvelope(op, "QLOO_CONTRACT", "qloo", false, "Inspect qloo_capabilities and the linked Qloo documentation before changing the request.", `Qloo API could not execute ${tool}: forced mock failure (MOCK_FORCE_ERROR).`, started);
  }
  const a = parsed.data as Rec;
  switch (op) {
    case "describe":
      return describe(a, started);
    case "find_tags":
      return findTags(a, started);
    case "recommend":
      return recommend(a, started);
    case "rank":
      return rank(a, started);
    case "where_popular":
      return wherePopular(a, started);
    case "compare_audiences":
      return compare(a, started);
    case "entity_tags":
      return entityTags(a, started);
    case "audience_demographics":
      return demographics(a, started);
    case "trends":
      return trends(a, started);
  }
  throw new Error(`Unhandled tool ${tool}`);
}

function describe(a: Rec, started: number): Rec {
  const r = resolveEntity(String(a.entity), "entity", a.type as string | undefined);
  const qi = { target: { ...(a.type ? { type: a.type } : {}), entities: [a.entity] } };
  if (!r.ok) return needsInput("describe", [r.issue], started, undefined, qi);
  const results = r.match === "identifier" ? [{ entity_id: r.entity.id, name: r.entity.name, type: `urn:entity:${r.entity.type}` }] : [entityItem(r.entity)];
  return {
    schema_version: "1.0-preview.1",
    operation: "describe",
    status: "ok",
    interpretation: { entity: ie(r) },
    resolution: resolution([outcome(r)]),
    results,
    result_count: results.length,
    provenance: provenance("describe", { entity_ids: [r.entity.id] }),
    query_intent: queryIntent("describe", qi),
    execution: execution(started),
  };
}

function findTags(a: Rec, started: number): Rec {
  const limit = (a.limit as number) ?? 10;
  const results = searchTags(String(a.query))
    .slice(0, limit)
    .map((t) => ({ id: t.id, name: t.name, type: t.type, popularity: round(0.4 + rand(t.id) * 0.5) }));
  return {
    schema_version: "1.0-preview.1",
    operation: "find_tags",
    status: "ok",
    interpretation: { query: a.query, semantic: a.semantic ?? true },
    results,
    result_count: results.length,
    provenance: provenance("find_tags", { "filter.query": a.query, "feature.semantic_search": a.semantic ?? true, take: limit }),
    query_intent: queryIntent("find_tags", { output: { limit }, assumptions: ["semantic=true"], target: { concept: a.query } }),
    execution: execution(started),
  };
}

function resolveAll(inputs: unknown, field: string, scope?: string) {
  const rs = ((inputs as string[] | undefined) ?? []).map((s) => resolveEntity(s, field, scope));
  return { ok: rs.filter((r): r is Resolution & { ok: true } => r.ok), issues: rs.filter((r): r is Resolution & { ok: false } => !r.ok).map((r) => r.issue) };
}

function resolveTags(inputs: unknown, field: string, purpose: string, scope: string) {
  const rs = ((inputs as string[] | undefined) ?? []).map((s) => resolveTag(s, field, purpose, scope));
  return { ok: rs.filter((r): r is TagResolution & { ok: true } => r.ok), issues: rs.filter((r): r is TagResolution & { ok: false } => !r.ok).map((r) => r.issue) };
}

function recommend(a: Rec, started: number): Rec {
  const target = String(a.target_type);
  const limit = (a.limit as number) ?? 10;
  const sig = resolveAll(a.signals, "signals");
  const st = resolveTags(a.signal_tags, "signal_tags", "signal", target);
  const inc = resolveTags(a.include_tags, "include_tags", "include_filter", target);
  const exc = resolveTags(a.exclude_tags, "exclude_tags", "exclude_filter", target);
  const qi = {
    signals: { ...(a.signals ? { entities: a.signals } : {}), ...(a.signal_tags ? { tags: a.signal_tags } : {}), ...(a.signal_location ? { location: a.signal_location } : {}), ...(a.demographic ? { demographic: a.demographic } : {}) },
    filters: { ...(a.include_tags ? { includeTags: a.include_tags } : {}), ...(a.exclude_tags ? { excludeTags: a.exclude_tags } : {}), ...(a.filter_location ? { location: a.filter_location } : {}) },
    output: { limit, explain: a.explain ?? true },
    target: { type: target },
  };
  const issues = [...sig.issues, ...st.issues, ...inc.issues, ...exc.issues];
  if (issues.length) return needsInput("recommend", issues, started, undefined, qi);
  let demo: { gender?: string; age?: string } | undefined;
  if (a.demographic) {
    demo = parseDemographic(String(a.demographic));
    if (!demo) return needsInput("recommend", [], started, `Could not map demographic "${a.demographic}" to Qloo age or gender signals. Use a phrase such as "young women" or "men 25-34".`, qi);
    if (!a.signal_location) return needsInput("recommend", [], started, "Demographic Qloo signals require signal_location so the audience geography is explicit.", qi);
  }
  if (!sig.ok.length && !st.ok.length && !a.signal_location && !demo) return needsInput("recommend", [], started, "Provide at least one entity, tag, location, or demographic taste signal.", qi);

  const signalTags = new Set([...sig.ok.flatMap((r) => r.entity.tags), ...st.ok.map((r) => r.tag.key)]);
  const excluded = new Set(exc.ok.map((r) => r.tag.key));
  const included = new Set(inc.ok.map((r) => r.tag.key));
  const signalIds = new Set(sig.ok.map((r) => r.entity.id));
  const loc = (a.filter_location ?? a.signal_location) as string | undefined;
  const pool = target === "place" ? placesIn(loc ?? "unknown city") : [...ENTITIES.values()].filter((e) => e.type === target && !e.thin && !e.lookupOnly && !AMBIGUOUS_MEMBERS.has(e.id));
  const seed = JSON.stringify([...signalIds, ...signalTags, a.signal_location, a.demographic]);
  const scored = pool
    .filter((e) => !signalIds.has(e.id))
    .filter((e) => !e.tags.some((t) => excluded.has(t)))
    .filter((e) => !included.size || e.tags.some((t) => included.has(t)))
    .map((e) => ({ e, s: affinity(e, signalTags, seed) }))
    .sort((x, y) => y.s - x.s)
    .slice(0, limit);
  const explain = a.explain === false ? undefined : (e: PoolEntity) => ({ "signal.interests.entities": sig.ok.map((r) => ({ entity_id: r.entity.id, score: round(affinity(e, new Set(r.entity.tags), seed) * 0.8) })) });
  const results = scored.map(({ e, s }) => entityItem(e, s, explain?.(e)));
  return {
    schema_version: "1.0-preview.1",
    operation: "recommend",
    status: "ok",
    interpretation: {
      target_type: `urn:entity:${target}`,
      signals: sig.ok.map(ie),
      signal_tags: st.ok.map(it),
      ...(st.ok.length ? { signal_tags_operator: a.signal_tags_operator ?? "intersection" } : {}),
      ...(a.signal_location ? { signal_location: a.signal_location } : {}),
      ...(demo ? { demographic: { input: a.demographic, ...demo } } : {}),
      ...(a.filter_location ? { filter_location: a.filter_location } : {}),
      include_tags: inc.ok.map(it),
      ...(inc.ok.length ? { include_tags_operator: a.include_tags_operator ?? "union" } : {}),
      exclude_tags: exc.ok.map(it),
      ...(exc.ok.length ? { exclude_tags_operator: a.exclude_tags_operator ?? "union" } : {}),
    },
    resolution: resolution(sig.ok.map(outcome)),
    results,
    result_count: results.length,
    ...(explain ? { explainability: { "signal.interests.entities": sig.ok.map((r) => ({ entity_id: r.entity.id, average_score: round(0.6 + rand(r.entity.id) * 0.3) })) } } : {}),
    provenance: provenance("recommend", {
      "filter.type": `urn:entity:${target}`,
      take: limit,
      ...(sig.ok.length ? { "signal.interests.entities": sig.ok.map((r) => r.entity.id) } : {}),
      ...(st.ok.length ? { "signal.interests.tags": st.ok.map((r) => r.tag.id) } : {}),
      ...(a.signal_location ? { "signal.location.query": a.signal_location } : {}),
      ...(demo?.gender ? { "signal.demographics.gender": demo.gender } : {}),
      ...(demo?.age ? { "signal.demographics.age": demo.age } : {}),
      ...(a.filter_location ? { "filter.location.query": a.filter_location } : {}),
      ...(exc.ok.length ? { "filter.exclude.tags": exc.ok.map((r) => r.tag.id) } : {}),
      "feature.explainability": a.explain ?? true,
    }),
    query_intent: queryIntent("recommend", qi),
    execution: execution(started),
  };
}

function rank(a: Rec, started: number): Rec {
  const type = String(a.option_type);
  const opts = resolveAll(a.options, "options", type);
  const sig = resolveAll(a.signals, "signals");
  const inc = resolveTags(a.include_tags, "include_tags", "include_filter", type);
  const exc = resolveTags(a.exclude_tags, "exclude_tags", "exclude_filter", type);
  const qi = {
    signals: { ...(a.signals ? { entities: a.signals } : {}), ...(a.signal_location ? { location: a.signal_location } : {}), ...(a.demographic ? { demographic: a.demographic } : {}) },
    filters: { candidateEntities: a.options },
    output: { limit: (a.options as unknown[]).length },
    target: { type },
  };
  const issues = [...opts.issues, ...sig.issues, ...inc.issues, ...exc.issues];
  if (issues.length) return needsInput("rank", issues, started, undefined, qi);
  let demo: { gender?: string; age?: string } | undefined;
  if (a.demographic) {
    demo = parseDemographic(String(a.demographic));
    if (!demo) return needsInput("rank", [], started, `Could not map demographic "${a.demographic}" to Qloo age or gender signals.`, qi);
    if (!a.signal_location) return needsInput("rank", [], started, "Demographic Qloo signals require signal_location so the audience geography is explicit.", qi);
  }
  if (!sig.ok.length && !a.signal_location && !demo) {
    // Qloo's own ordering with no taste signal: by popularity (used as the P0 baseline in eval).
  }
  const signalTags = new Set(sig.ok.flatMap((r) => r.entity.tags));
  const seed = JSON.stringify([sig.ok.map((r) => r.entity.id), a.signal_location, a.demographic]);
  const scoreOf = (e: PoolEntity) => (signalTags.size ? affinity(e, signalTags, seed) : e.popularity);
  const results = [...new Map(opts.ok.map((r) => [r.entity.id, r.entity])).values()]
    .map((e) => ({ e, s: scoreOf(e) }))
    .sort((x, y) => y.s - x.s)
    .map(({ e, s }) => entityItem(e, s));
  return {
    schema_version: "1.0-preview.1",
    operation: "rank",
    status: "ok",
    interpretation: {
      option_type: `urn:entity:${type}`,
      options: opts.ok.map(ie),
      signals: sig.ok.map(ie),
      ...(a.signal_location ? { signal_location: a.signal_location } : {}),
      ...(demo ? { demographic: { input: a.demographic, ...demo } } : {}),
      include_tags: inc.ok.map(it),
      exclude_tags: exc.ok.map(it),
    },
    resolution: resolution([...opts.ok, ...sig.ok].map(outcome)),
    results,
    result_count: results.length,
    provenance: provenance("rank", {
      "filter.type": `urn:entity:${type}`,
      "filter.results.entities": opts.ok.map((r) => r.entity.id),
      take: opts.ok.length,
      ...(sig.ok.length ? { "signal.interests.entities": sig.ok.map((r) => r.entity.id) } : {}),
      ...(a.signal_location ? { "signal.location.query": a.signal_location } : {}),
    }),
    query_intent: queryIntent("rank", qi),
    execution: execution(started),
  };
}

function wherePopular(a: Rec, started: number): Rec {
  const r = resolveEntity(String(a.entity), "entity", a.entity_type as string | undefined);
  const limit = (a.limit as number) ?? 10;
  const within = String(a.within);
  const qi = { filters: { location: within }, output: { limit }, target: { ...(a.entity_type ? { type: a.entity_type } : {}), entities: [a.entity] } };
  if (!r.ok) return needsInput("where_popular", [r.issue], started, undefined, qi);
  const key = cityKey(within);
  const nowhere = /\b(antarctica|nowhere)\b/i.test(within);
  const centre = key ? POOL.cities[key]! : undefined;
  const count = nowhere ? 0 : centre ? limit : Math.min(3, limit);
  const [lat, lon] = centre ?? [rand(`${within}|lat`) * 100 - 50, rand(`${within}|lon`) * 300 - 150];
  // Heatmap cells sit on a fixed grid per city (like geohash cells), so two entities can share areas.
  // Each entity draws its cells from the grid, weighted towards its own hot corner of the city.
  const STEP = 0.022;
  const grid = Array.from({ length: 49 }, (_, k) => [lat + (Math.floor(k / 7) - 3) * STEP, lon + ((k % 7) - 3) * STEP * 1.3] as const);
  const hot = [Math.floor(rand(`${r.entity.id}|hx`) * 7), Math.floor(rand(`${r.entity.id}|hy`) * 7)];
  const scored = grid
    .map(([la, lo], k) => {
      const d = Math.hypot(Math.floor(k / 7) - hot[0]!, (k % 7) - hot[1]!);
      return { la, lo, k, w: 1 / (1 + d) + rand(`${r.entity.id}|${within}|${k}`) * 0.55 };
    })
    .sort((x, y) => y.w - x.w)
    .slice(0, count);
  const top = scored[0]?.w ?? 1;
  const results = scored
    .map(({ la, lo, k, w }) => {
      const seed = `${r.entity.id}|${within}|${k}`;
      const cell = `${round(la, 4)},${round(lo, 4)}`;
      return { location: { latitude: round(la, 4), longitude: round(lo, 4), geohash: createHash("md5").update(`${within}|${cell}`).digest("hex").slice(0, 6) }, query: { affinity: round(0.3 + 0.65 * (w / top)), affinity_rank: round(0.5 + rand(`${seed}|r`) * 0.5), popularity: round(rand(`${seed}|p`)) } };
    })
    .sort((x, y) => y.query.affinity - x.query.affinity);
  const status = count === 0 ? "empty" : centre ? "ok" : "partial";
  return {
    schema_version: "1.0-preview.1",
    operation: "where_popular",
    status,
    ...(status === "partial" ? { summary: `Heatmap coverage for "${within}" is limited in the mock fixtures: ${count} of ${limit} requested areas returned.` } : {}),
    interpretation: { entity: ie(r), within },
    resolution: resolution([outcome(r)]),
    results,
    result_count: results.length,
    provenance: provenance("where_popular", { "filter.type": "urn:heatmap", "signal.interests.entities": r.entity.id, "filter.location.query": within, take: limit }),
    query_intent: queryIntent("where_popular", qi),
    execution: execution(started),
  };
}

function compare(a: Rec, started: number): Rec {
  const ga = resolveAll(a.group_a, "group_a");
  const gb = resolveAll(a.group_b, "group_b");
  const limit = (a.limit as number) ?? 10;
  const qi = { signals: { groups: [a.group_a, a.group_b] }, output: { limit }, ...(a.target_type ? { target: { type: a.target_type } } : {}) };
  const issues = [...ga.issues, ...gb.issues];
  if (issues.length) return needsInput("compare_audiences", issues, started, undefined, qi);
  // Audiences overlap: a concept carried by the group scores high, and a concept from the same
  // family (music genre/keyword, brand category…) still scores in the middle, as real fan bases do.
  const family = (k: string) => TAG_BY_KEY.get(k)?.type ?? "";
  const weight = (group: typeof ga.ok, key: string) => {
    const hits = group.filter((r) => r.entity.tags.includes(key)).length / Math.max(1, group.length);
    const near = group.some((r) => r.entity.tags.some((t) => family(t) === family(key))) ? 0.35 : 0;
    const jitter = (rand(`${key}|${group.map((g) => g.entity.id).join()}`) - 0.5) * 0.2;
    return round(Math.max(0.03, Math.min(0.98, 0.12 + near + 0.5 * hits + jitter)));
  };
  const keys = [...new Set([...ga.ok, ...gb.ok].flatMap((r) => r.entity.tags))];
  const extra = MUSIC_TAGS.filter((k) => !keys.includes(k)).slice(0, 3);
  const tags = [...keys, ...extra]
    .map((k) => {
      const t = TAG_BY_KEY.get(k)!;
      const wa = weight(ga.ok, k);
      const wb = weight(gb.ok, k);
      return { tag_id: t.id, name: t.name, subtype: t.type, query: { a: { affinity: wa }, b: { affinity: wb }, delta: round(wa - wb) } };
    })
    .sort((x, y) => Math.max(y.query.a.affinity, y.query.b.affinity) - Math.max(x.query.a.affinity, x.query.b.affinity))
    .slice(0, limit);
  return {
    schema_version: "1.0-preview.1",
    operation: "compare_audiences",
    status: "ok",
    interpretation: { group_a: ga.ok.map(ie), group_b: gb.ok.map(ie), ...(a.target_type ? { target_type: `urn:entity:${a.target_type}` } : {}) },
    resolution: resolution([...ga.ok, ...gb.ok].map(outcome)),
    results: { tags },
    provenance: provenance("compare_audiences", { "a.signal.interests.entities": ga.ok.map((r) => r.entity.id), "b.signal.interests.entities": gb.ok.map((r) => r.entity.id), take: limit, ...(a.target_type ? { "filter.type": `urn:entity:${a.target_type}` } : {}) }),
    query_intent: queryIntent("compare_audiences", qi),
    execution: execution(started),
  };
}

function entityTags(a: Rec, started: number): Rec {
  const ents = resolveAll(a.entities, "entities", a.entity_type as string | undefined);
  const limit = (a.limit as number) ?? 10;
  const qi = { signals: { entities: a.entities }, output: { limit }, ...(a.entity_type ? { target: { type: a.entity_type } } : {}) };
  if (ents.issues.length) return needsInput("entity_tags", ents.issues, started, undefined, qi);
  const counts = new Map<string, number>();
  for (const r of ents.ok) for (const t of r.entity.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  const seed = ents.ok.map((r) => r.entity.id).join();
  const results = [...counts.entries()]
    .map(([k, c]) => {
      const t = TAG_BY_KEY.get(k)!;
      return { id: t.id, name: t.name, type: t.type, popularity: round(0.3 + rand(t.id) * 0.6), affinity: round(Math.min(0.99, 0.55 + 0.4 * (c / ents.ok.length) + (rand(`${seed}|${k}`) - 0.5) * 0.1)) };
    })
    .sort((x, y) => y.affinity - x.affinity)
    .slice(0, limit);
  return {
    schema_version: "1.0-preview.1",
    operation: "entity_tags",
    status: "ok",
    interpretation: { entities: ents.ok.map(ie) },
    resolution: resolution(ents.ok.map(outcome)),
    results,
    result_count: results.length,
    provenance: provenance("entity_tags", { "filter.type": "urn:tag", "signal.interests.entities": ents.ok.map((r) => r.entity.id), take: limit }),
    query_intent: queryIntent("entity_tags", qi),
    execution: execution(started),
  };
}

function demographics(a: Rec, started: number): Rec {
  const r = resolveEntity(String(a.entity), "entity", a.entity_type as string | undefined);
  const limit = (a.limit as number) ?? 10;
  const qi = { output: { limit }, target: { ...(a.entity_type ? { type: a.entity_type } : {}), entities: [a.entity] } };
  if (!r.ok) return needsInput("audience_demographics", [r.issue], started, undefined, qi);
  const id = r.entity.id;
  const ageKeys = ["24_and_younger", "25_to_29", "30_to_34", "35_to_44", "45_to_54", "55_and_older"];
  const peak = Math.floor(rand(`${id}|peak`) * 4);
  const age = Object.fromEntries(ageKeys.map((k, i) => [k, round(Math.max(-0.9, Math.min(0.9, 0.45 - 0.28 * Math.abs(i - peak) + (rand(`${id}|${k}`) - 0.5) * 0.2)))]));
  const g = round((rand(`${id}|g`) - 0.5) * 0.5);
  const degraded = r.entity.type === "person";
  return {
    schema_version: "1.0-preview.1",
    operation: "audience_demographics",
    status: degraded ? "degraded" : "ok",
    ...(degraded ? { summary: "Demographic signal for this person is thin in the mock fixtures; the distribution falls back to the parent category and is shown with reduced confidence." } : {}),
    interpretation: { entity: ie(r) },
    resolution: resolution([outcome(r)]),
    results: [{ entity_id: id, query: { age, gender: { male: g, female: round(-g) } } }],
    result_count: 1,
    provenance: provenance("audience_demographics", { "filter.type": "urn:demographics", "signal.interests.entities": id, take: limit }),
    query_intent: queryIntent("audience_demographics", { ...qi, assumptions: a.limit ? [] : ["limit=10"] }),
    execution: execution(started),
  };
}

function trends(a: Rec, started: number): Rec {
  const type = String(a.entity_type);
  const limit = (a.limit as number) ?? 10;
  const start = String(a.start_date);
  const end = String(a.end_date);
  const qi = { filters: { startDate: start, endDate: end }, output: { limit }, target: { type, entities: a.entities } };
  const valid = (d: string) => {
    const t = new Date(`${d}T00:00:00Z`);
    return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
  };
  if (!valid(start) || !valid(end) || start > end) {
    return { ...errorEnvelope("trends", "MCP_ADAPTER_FAILURE", "harness", false, "Run qloo doctor --network and inspect the local redacted trace.", "The Qloo MCP adapter failed before returning a workflow result.", started), result_count: 0, query_intent: undefined };
  }
  const key = JSON.stringify([a.entities, type, start, end, limit]);
  if (!rateLimitedOnce.has(key)) {
    rateLimitedOnce.add(key);
    return errorEnvelope("trends", "QLOO_RATE_LIMIT", "qloo", true, "Wait for the Qloo rate-limit window, then retry the same interpreted request once.", "Qloo API could not execute qloo_trends: Too many requests (mock: first call per argument set is rate-limited once).", started);
  }
  const ents = resolveAll(a.entities, "entities", type);
  if (ents.issues.length) return needsInput("trends", ents.issues, started, undefined, qi);
  const t0 = new Date(`${start}T00:00:00Z`).getTime();
  const t1 = new Date(`${end}T00:00:00Z`).getTime();
  const steps = Math.max(1, Math.min(limit, Math.round((t1 - t0) / 86400000 / 7) + 1));
  const covered = ents.ok.filter((r) => !r.entity.thin);
  const series = covered.map((r) => {
    const id = r.entity.id;
    const slope = (rand(`${id}|slope`) - 0.4) * 0.06;
    const base = 0.55 + rand(`${id}|base`) * 0.35;
    const points = Array.from({ length: steps }, (_, i) => {
      const t = steps === 1 ? t0 : t0 + ((t1 - t0) * i) / (steps - 1);
      const pct = round(Math.max(0.01, Math.min(0.999, base + slope * i + (rand(`${id}|${i}`) - 0.5) * 0.02)));
      return { date: new Date(t).toISOString().slice(0, 10), population_percentile: pct, population_rank: Math.round((1 - pct) * 5000) + 1, population_rank_velocity: Math.round(-slope * 1000), population_percentile_velocity: round(slope / 7, 4) };
    });
    return { entity: ie(r), points };
  });
  const partial = covered.length < ents.ok.length;
  return {
    schema_version: "1.0-preview.1",
    operation: "trends",
    status: partial ? "partial" : "ok",
    ...(partial ? { summary: `Trend series returned for ${covered.length} of ${ents.ok.length} entities; the others have thin coverage in the mock fixtures.` } : {}),
    interpretation: { entity_type: `urn:entity:${type}`, start_date: start, end_date: end },
    resolution: resolution(ents.ok.map(outcome)),
    series,
    result_count: series.length,
    provenance: provenance("trends", { "filter.type": `urn:entity:${type}`, "filter.start_date": start, "filter.end_date": end, "signal.interests.entities": covered.map((r) => r.entity.id).join(","), take: limit }),
    query_intent: queryIntent("trends", qi),
    execution: execution(started),
  };
}

export function capabilities(): Rec {
  const cap = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "contract/capabilities-nokey.json"), "utf8")) as Rec;
  const adapter = cap.adapter as Rec;
  return {
    ...cap,
    adapter: { ...adapter, canonical_workflow_execution: true, ready: true, supported_operation_ids: Object.keys(adapter.tool_name_mapping as Rec) },
    house_mix_mock: { fixtures: "fixtures/mock/pool.json", note: "Fictional data. Not Qloo results." },
  };
}

export const MOCK_TOOLS = (contract as { tools: Rec[] }).tools;
