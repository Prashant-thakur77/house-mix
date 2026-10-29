import type { Heatmap, HeatLayer, Show } from "@housemix/shared";
import { evidenceFrom } from "../agent/critic.ts";
import { getQloo, type QlooClient } from "../qloo/client.ts";
import { heatmapOf } from "../qloo/normalize.ts";
import { getShow, HttpError, saveShow } from "../shows/service.ts";

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 0;
};

/**
 * Crowd map: one qloo_where_popular call per confirmed bill side (headliner/support, home/away),
 * constrained to the show city. The overlap is computed here, never by a model.
 */
export async function buildHeatmap(show: Show, qloo: QlooClient = getQloo()): Promise<Heatmap> {
  const sides = show.entities.filter((e) => e.kind === "side" && e.status === "resolved" && e.qlooId).slice(0, 3);
  if (!sides.length) throw new HttpError(409, "Confirm at least one act or team before mapping the crowd.", "no_entities");
  const within = show.entities.find((e) => e.kind === "city" && e.status === "resolved")?.name ?? show.input.city;
  const layers: HeatLayer[] = [];
  const notes: string[] = [];
  for (const side of sides) {
    const { call, envelope } = await qloo.call(
      "qloo_where_popular",
      { entity: side.qlooId!, ...(side.type ? { entity_type: side.type } : {}), within, limit: 20 },
      { runId: `map_${show.id}`, agent: "crowd_map" },
    );
    const points = heatmapOf(call).map((p) => ({ id: p.id, lat: p.latitude, lon: p.longitude, affinity: p.affinity, ...(p.popularity !== undefined ? { popularity: p.popularity } : {}) }));
    if (call.status === "error") notes.push(`${side.name}: ${call.error?.recovery ?? "Qloo heatmap call failed."}`);
    else if (call.status === "empty" || !points.length) notes.push(`${side.name}: Qloo has no heatmap signal within ${within}.`);
    else if (call.status === "partial" || call.status === "degraded") notes.push(`${side.name}: ${envelope.summary || `Qloo returned ${call.status} coverage.`}`);
    if (points.length) layers.push({ label: side.name ?? side.input, role: side.role, entityId: side.qlooId!, points, evidence: evidenceFrom(call) });
  }
  // Areas strong for every side: the same geohash in each layer, above that layer's median affinity.
  const strong = layers.map((l) => {
    const m = median(l.points.map((p) => p.affinity));
    return new Set(l.points.filter((p) => p.affinity >= m).map((p) => p.id));
  });
  const overlap = layers.length > 1 ? [...strong[0]!].filter((id) => strong.every((s) => s.has(id))) : [];
  return { within, layers, overlap, notes, createdAt: new Date().toISOString() };
}

const inFlight = new Map<string, Promise<Heatmap>>();

export async function heatmapFor(showId: string, force = false): Promise<Heatmap> {
  const show = await getShow(showId);
  if (show.heatmap && !force) return show.heatmap;
  // Two tabs (or a double-mounted effect) asking at once share one build.
  const pending = inFlight.get(showId);
  if (pending) return pending;
  const job = (async () => {
    const heatmap = await buildHeatmap(show);
    const fresh = await getShow(showId);
    fresh.heatmap = heatmap;
    await saveShow(fresh);
    return heatmap;
  })().finally(() => inFlight.delete(showId));
  inFlight.set(showId, job);
  return job;
}

const BEARINGS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/** Strongest areas (overlap first, then summed affinity) with distance and bearing from the centre of the returned areas. */
export function topAreas(map: Heatmap, n = 3) {
  const all = map.layers.flatMap((l) => l.points);
  if (!all.length) return [];
  const lat0 = all.reduce((s, p) => s + p.lat, 0) / all.length;
  const lon0 = all.reduce((s, p) => s + p.lon, 0) / all.length;
  const ids = [...new Set(all.map((p) => p.id))];
  return ids
    .map((id) => {
      const p = all.find((x) => x.id === id)!;
      const dx = (p.lon - lon0) * 111.32 * Math.cos((lat0 * Math.PI) / 180);
      const dy = (p.lat - lat0) * 110.57;
      const values = map.layers.map((l) => ({ label: l.label, affinity: l.points.find((x) => x.id === id)?.affinity }));
      return {
        id,
        km: Math.hypot(dx, dy),
        bearing: BEARINGS[Math.round(((Math.atan2(dx, dy) * 180) / Math.PI + 360) / 45) % 8]!,
        overlap: map.overlap.includes(id),
        sum: values.reduce((s, v) => s + (v.affinity ?? 0), 0),
        values,
      };
    })
    .sort((a, b) => Number(b.overlap) - Number(a.overlap) || b.sum - a.sum)
    .slice(0, n);
}
