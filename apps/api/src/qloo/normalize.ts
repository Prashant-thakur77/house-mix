import type { Candidate, LedgerCall, QlooToolName } from "@housemix/shared";

/**
 * Adapters from the `qloo mcp` envelope (docs/QLOO_CONTRACT.md) to House Mix's view.
 * Every per-tool shape assumption lives in this file, so `npm run qloo:verify` has one place to fix.
 */

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);

export interface NEntity {
  id: string;
  name: string;
  type?: string;
  affinity?: number;
  popularity?: number;
  rank: number;
  description?: string;
  geocode?: { latitude: number; longitude: number };
  address?: string;
}

export interface HeatPoint {
  id: string;
  latitude: number;
  longitude: number;
  affinity: number;
  affinityRank?: number;
  popularity?: number;
}

/** `urn:entity:artist` → `artist`. */
export function shortType(t: unknown): string | undefined {
  const s = str(t);
  if (!s) return undefined;
  const parts = s.split(":");
  return parts[parts.length - 1] === "entity" ? undefined : parts[parts.length - 1];
}

function entityFromItem(item: Rec, rank: number): NEntity | undefined {
  const id = str(item.entity_id) ?? str(item.id) ?? str(item.tag_id);
  const name = str(item.name);
  if (!id || !name) return undefined;
  const props = isRec(item.properties) ? item.properties : {};
  const geo = isRec(props.geocode) ? props.geocode : undefined;
  const lat = num(geo?.latitude);
  const lon = num(geo?.longitude);
  const query = isRec(item.query) ? item.query : {};
  return {
    id,
    name,
    type: shortType(item.subtype) ?? shortType(item.type),
    affinity: num(item.affinity) ?? num(query.affinity),
    popularity: num(item.popularity),
    rank,
    description: str(props.short_description) ?? str(props.description),
    geocode: lat !== undefined && lon !== undefined ? { latitude: lat, longitude: lon } : undefined,
    address: str(props.address),
  };
}

function resultArray(call: Pick<LedgerCall, "results">): Rec[] {
  return (call.results ?? []).filter(isRec);
}

/** Named entities (or tags) in a call's results, in result order (for rank: the ranking). */
export function entitiesOf(call: Pick<LedgerCall, "tool" | "results">): NEntity[] {
  switch (call.tool) {
    case "qloo_recommend":
    case "qloo_rank":
    case "qloo_describe":
    case "qloo_find_tags":
    case "qloo_entity_tags":
      return resultArray(call)
        .map((r, i) => entityFromItem(r, i + 1))
        .filter((e): e is NEntity => Boolean(e));
    case "qloo_compare_audiences":
      return compareOf(call).rows.map((r, i) => ({ id: r.id, name: r.name, type: r.type, affinity: r.a, rank: i + 1 }));
    default:
      return [];
  }
}

export function entityInCall(call: LedgerCall, id: string): NEntity | undefined {
  const fromResults = entitiesOf(call).find((e) => e.id === id);
  if (fromResults) return fromResults;
  if (call.tool === "qloo_trends") {
    const s = trendsOf(call).find((t) => t.id === id);
    if (s) return { id: s.id, name: s.name, type: s.type, rank: 1 };
  }
  return undefined;
}

export function heatmapOf(call: Pick<LedgerCall, "tool" | "results">): HeatPoint[] {
  if (call.tool !== "qloo_where_popular") return [];
  return resultArray(call)
    .map((r): HeatPoint | undefined => {
      const loc = isRec(r.location) ? r.location : {};
      const q = isRec(r.query) ? r.query : {};
      const latitude = num(loc.latitude);
      const longitude = num(loc.longitude);
      const affinity = num(q.affinity);
      if (latitude === undefined || longitude === undefined || affinity === undefined) return undefined;
      return {
        id: str(loc.geohash) ?? `${latitude.toFixed(3)},${longitude.toFixed(3)}`,
        latitude,
        longitude,
        affinity,
        affinityRank: num(q.affinity_rank),
        popularity: num(q.popularity),
      };
    })
    .filter((p): p is HeatPoint => Boolean(p));
}

export interface CompareRow {
  id: string;
  name: string;
  type?: string;
  a: number;
  b: number;
  delta: number;
}

/**
 * compare_audiences passes Qloo's raw `results` through (often `{tags: [...]}`, possibly also
 * entities). Each row carries the group-A and group-B affinity and their difference.
 */
export function compareOf(call: Pick<LedgerCall, "tool" | "results">): { rows: CompareRow[] } {
  if (call.tool !== "qloo_compare_audiences") return { rows: [] };
  const raw: unknown = call.results;
  const lists: unknown[] = [];
  if (Array.isArray(raw)) {
    for (const r of raw) {
      if (isRec(r) && Array.isArray(r.tags)) lists.push(...r.tags);
      else if (isRec(r) && Array.isArray(r.entities)) lists.push(...r.entities);
      else lists.push(r);
    }
  } else if (isRec(raw)) {
    for (const k of ["tags", "entities", "results"]) if (Array.isArray(raw[k])) lists.push(...(raw[k] as unknown[]));
  }
  const rows: CompareRow[] = [];
  for (const item of lists) {
    if (!isRec(item)) continue;
    const id = str(item.tag_id) ?? str(item.entity_id) ?? str(item.id);
    const name = str(item.name);
    if (!id || !name) continue;
    const q = isRec(item.query) ? item.query : {};
    const a = num(isRec(q.a) ? q.a.affinity : undefined) ?? num(q.a_affinity) ?? num(q.affinity_a);
    const b = num(isRec(q.b) ? q.b.affinity : undefined) ?? num(q.b_affinity) ?? num(q.affinity_b);
    if (a === undefined || b === undefined) continue;
    rows.push({ id, name, type: shortType(item.subtype) ?? shortType(item.type), a, b, delta: num(q.delta) ?? a - b });
  }
  return { rows };
}

export interface DemoBucket {
  bucket: string;
  value: number;
}

export function demographicsOf(call: Pick<LedgerCall, "tool" | "results">): { age: DemoBucket[]; gender: DemoBucket[] } {
  const out = { age: [] as DemoBucket[], gender: [] as DemoBucket[] };
  if (call.tool !== "qloo_audience_demographics") return out;
  const first = resultArray(call)[0];
  const q = first && isRec(first.query) ? first.query : {};
  const AGE_ORDER = ["24_and_younger", "25_to_29", "30_to_34", "35_to_44", "45_to_54", "55_and_older"];
  if (isRec(q.age)) {
    for (const k of AGE_ORDER) {
      const v = num(q.age[k]);
      if (v !== undefined) out.age.push({ bucket: k, value: v });
    }
  }
  if (isRec(q.gender)) {
    for (const [k, v] of Object.entries(q.gender)) if (num(v) !== undefined) out.gender.push({ bucket: k, value: v as number });
  }
  return out;
}

export interface TrendSeries {
  id: string;
  name: string;
  type?: string;
  points: { date: string; value: number }[];
  delta: number;
}

export function trendsOf(call: Pick<LedgerCall, "tool" | "results">): TrendSeries[] {
  if (call.tool !== "qloo_trends") return [];
  return resultArray(call)
    .map((s): TrendSeries | undefined => {
      const e = isRec(s.entity) ? s.entity : {};
      const id = str(e.entityId) ?? str(e.entity_id);
      if (!id) return undefined;
      const points = (Array.isArray(s.points) ? s.points : [])
        .filter(isRec)
        .map((p) => ({ date: str(p.date) ?? "", value: num(p.population_percentile) ?? num(p.value) ?? 0 }))
        .filter((p) => p.date);
      const delta = points.length > 1 ? points[points.length - 1]!.value - points[0]!.value : 0;
      return { id, name: str(e.name) ?? id, type: shortType(e.type), points, delta };
    })
    .filter((s): s is TrendSeries => Boolean(s));
}

/** Entity IDs a call was *about* (its interpreted inputs), e.g. the two groups of a comparison. */
export function inputIdsOf(interpretation: unknown): string[] {
  const ids: string[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (isRec(v)) {
      if (typeof v.entityId === "string") ids.push(v.entityId);
      else for (const x of Object.values(v)) walk(x);
    }
  };
  walk(interpretation);
  return [...new Set(ids)];
}

/** IDs that count as "in the results" for evidence checks. */
export function extractResultIds(tool: QlooToolName, envelope: { results?: unknown; series?: unknown; interpretation?: unknown }): string[] {
  const call = { tool, results: normalisedResults(tool, envelope) } as LedgerCall;
  if (tool === "qloo_where_popular") return heatmapOf(call).map((p) => p.id);
  if (tool === "qloo_trends") return trendsOf(call).map((s) => s.id);
  if (tool === "qloo_audience_demographics") return inputIdsOf(envelope.interpretation);
  if (tool === "qloo_compare_audiences") return [...compareOf(call).rows.map((r) => r.id), ...inputIdsOf(envelope.interpretation)];
  return entitiesOf(call).map((e) => e.id);
}

/**
 * Results as an array of records for the ledger: trends' `series` and compare's raw object
 * are folded into arrays so every call is stored the same way.
 */
export function normalisedResults(tool: QlooToolName, envelope: { results?: unknown; series?: unknown }): Rec[] {
  if (tool === "qloo_trends") return (Array.isArray(envelope.series) ? envelope.series : []).filter(isRec);
  if (tool === "qloo_compare_audiences") {
    const raw = envelope.results;
    if (Array.isArray(raw)) return raw.filter(isRec);
    if (isRec(raw)) return [raw];
    return [];
  }
  return (Array.isArray(envelope.results) ? envelope.results : []).filter(isRec);
}

/** needs_input candidates live in `resolution.issues[].candidates`. */
export function issuesOf(envelope: { resolution?: unknown }): { input: string; kind: string; field: string; candidates: Candidate[] }[] {
  const res = isRec(envelope.resolution) ? envelope.resolution : {};
  const issues = Array.isArray(res.issues) ? res.issues : [];
  return issues.filter(isRec).map((i) => ({
    input: str(i.input) ?? "",
    kind: str(i.kind) ?? "ambiguous",
    field: str(i.field) ?? "",
    candidates: (Array.isArray(i.candidates) ? i.candidates : []).filter(isRec).map((c) => ({
      qlooId: String(c.id),
      name: str(c.name) ?? String(c.id),
      type: shortType(c.type),
      disambiguation: str(c.description) ?? (num(c.release_year) ? String(c.release_year) : undefined) ?? str(c.address),
      popularity: num(c.popularity),
    })),
  }));
}

/** Per-entity scores for one call, as shown in the evidence drawer. */
export function scoresFor(call: LedgerCall, entityId: string): Record<string, number> {
  const scores: Record<string, number> = {};
  const e = entitiesOf(call).find((x) => x.id === entityId);
  if (e) {
    if (e.affinity !== undefined) scores.affinity = round(e.affinity);
    if (e.popularity !== undefined) scores.popularity = round(e.popularity);
    if (call.tool === "qloo_rank") {
      scores.rank = e.rank;
      scores.of = entitiesOf(call).length;
    }
  }
  if (call.tool === "qloo_trends") {
    const s = trendsOf(call).find((x) => x.id === entityId);
    if (s) {
      scores.delta = round(s.delta);
      const last = s.points[s.points.length - 1];
      if (last) scores.percentile = round(last.value);
    }
  }
  if (call.tool === "qloo_compare_audiences") {
    const fit = sponsorFit(call);
    if (fit !== undefined && (call.inputIds ?? []).includes(entityId)) scores.fit = fit;
  }
  return scores;
}

/**
 * Sponsor fit (0–100) from a crowd-vs-brand comparison: the mean similarity of the two groups'
 * affinities across the concepts Qloo returned, min(a,b)/max(a,b) for positive pairs.
 * This formula is our interpretation of Qloo's comparison, not a Qloo score.
 */
export function sponsorFit(call: Pick<LedgerCall, "tool" | "results">): number | undefined {
  const rows = compareOf(call).rows;
  if (rows.length === 0) return undefined;
  const sims = rows.map((r) => (r.a > 0 && r.b > 0 ? Math.min(r.a, r.b) / Math.max(r.a, r.b) : 0));
  return Math.round((100 * sims.reduce((s, x) => s + x, 0)) / sims.length);
}

const round = (n: number) => Math.round(n * 1000) / 1000;

const TOOL_LABEL: Record<string, string> = {
  qloo_recommend: "recommend",
  qloo_rank: "rank",
  qloo_describe: "describe",
  qloo_where_popular: "where_popular",
  qloo_compare_audiences: "compare_audiences",
  qloo_audience_demographics: "audience_demographics",
  qloo_entity_tags: "entity_tags",
  qloo_trends: "trends",
  qloo_find_tags: "find_tags",
};

/** A literal, deterministic sentence of what one Qloo call says about one entity. */
export function qlooSaysLine(call: LedgerCall, entityId: string): string {
  const s = scoresFor(call, entityId);
  const label = TOOL_LABEL[call.tool] ?? call.tool;
  const parts: string[] = [];
  if (call.tool === "qloo_rank" && s.rank !== undefined) parts.push(`ranked #${s.rank} of ${s.of}`);
  if (call.tool === "qloo_recommend") {
    const e = entitiesOf(call).find((x) => x.id === entityId);
    if (e) parts.push(`returned #${e.rank} of ${entitiesOf(call).length}`);
  }
  if (s.affinity !== undefined) parts.push(`affinity ${s.affinity.toFixed(2)}`);
  if (s.popularity !== undefined) parts.push(`popularity ${s.popularity.toFixed(2)}`);
  if (s.delta !== undefined) parts.push(`percentile change ${s.delta >= 0 ? "+" : ""}${s.delta.toFixed(3)} over the window`);
  if (s.fit !== undefined) parts.push(`audience similarity ${s.fit}/100`);
  const status = call.status === "ok" ? "" : ` [${call.status}]`;
  return `${label}: ${parts.join(", ") || "present in results"}${status}.`;
}
