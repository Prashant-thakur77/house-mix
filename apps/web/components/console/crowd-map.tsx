"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, MapPinned, RefreshCw } from "lucide-react";
import type { Heatmap, Show } from "@housemix/shared";
import { cn } from "cn";
import { Kicker, StatusChip } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";

const HUES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"];
const HUE_CLS = ["bg-chart-1", "bg-chart-2", "bg-chart-3"];
const W = 560;
const H = 340;
const PAD = 28;

interface Cell {
  id: string;
  x: number;
  y: number;
  km: number;
  bearing: string;
  values: (number | undefined)[];
  max: number;
  overlap: boolean;
}

const BEARINGS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/** Projects the heatmap cells to km around the centre of the returned areas (no basemap, no tiles). */
function layout(map: Heatmap) {
  const all = map.layers.flatMap((l) => l.points);
  const lat0 = all.reduce((s, p) => s + p.lat, 0) / Math.max(1, all.length);
  const lon0 = all.reduce((s, p) => s + p.lon, 0) / Math.max(1, all.length);
  const kx = 111.32 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110.57;
  const byId = new Map<string, Cell>();
  map.layers.forEach((l, li) => {
    for (const p of l.points) {
      const dx = (p.lon - lon0) * kx;
      const dy = (p.lat - lat0) * ky;
      const c = byId.get(p.id) ?? {
        id: p.id,
        x: dx,
        y: dy,
        km: Math.hypot(dx, dy),
        bearing: BEARINGS[Math.round(((Math.atan2(dx, dy) * 180) / Math.PI + 360) / 45) % 8]!,
        values: map.layers.map(() => undefined),
        max: 0,
        overlap: map.overlap.includes(p.id),
      };
      c.values[li] = p.affinity;
      c.max = Math.max(c.max, p.affinity);
      byId.set(p.id, c);
    }
  });
  const cells = [...byId.values()];
  const reach = Math.max(1, ...cells.map((c) => Math.max(Math.abs(c.x) * (H / W), Math.abs(c.y))));
  const scale = (H / 2 - PAD) / reach;
  const step = reach > 12 ? 5 : reach > 5 ? 2 : 1;
  const rings = Array.from({ length: Math.floor(reach / step) }, (_, i) => (i + 1) * step);
  return { cells, scale, rings };
}

function halfArc(cx: number, cy: number, r: number, left: boolean) {
  return `M ${cx} ${cy - r} A ${r} ${r} 0 0 ${left ? 0 : 1} ${cx} ${cy + r} Z`;
}

function Glyph({ c, scale, active, onHover }: { c: Cell; scale: number; active: boolean; onHover: (id?: string) => void }) {
  const cx = W / 2 + c.x * scale;
  const cy = H / 2 - c.y * scale;
  const r = 4 + c.max * 9;
  const present = c.values.map((v, i) => (v === undefined ? -1 : i)).filter((i) => i >= 0);
  return (
    <g onMouseEnter={() => onHover(c.id)} onMouseLeave={() => onHover(undefined)} className="cursor-default">
      {/* invisible hit target, larger than the mark */}
      <circle cx={cx} cy={cy} r={Math.max(12, r + 4)} fill="transparent" />
      {present.length === 1 ? (
        <circle cx={cx} cy={cy} r={r} fill={HUES[present[0]!]} fillOpacity={0.35 + 0.6 * c.max} stroke="var(--card)" strokeWidth={2} />
      ) : (
        <>
          <path d={halfArc(cx, cy, r, true)} fill={HUES[present[0]!]} fillOpacity={0.4 + 0.6 * (c.values[present[0]!] ?? 0)} />
          <path d={halfArc(cx, cy, r, false)} fill={HUES[present[1]!]} fillOpacity={0.4 + 0.6 * (c.values[present[1]!] ?? 0)} />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--card)" strokeWidth={2} />
        </>
      )}
      {c.overlap ? <circle cx={cx} cy={cy} r={r + 3.5} fill="none" stroke="var(--foreground)" strokeWidth={1.5} /> : null}
      {active ? <circle cx={cx} cy={cy} r={r + 6} fill="none" stroke="var(--signal)" strokeWidth={2} /> : null}
    </g>
  );
}

function MapBody({ map }: { map: Heatmap }) {
  const { cells, scale, rings } = useMemo(() => layout(map), [map]);
  const [hover, setHover] = useState<string>();
  const hovered = cells.find((c) => c.id === hover);
  const ranked = [...cells].sort((a, b) => Number(b.overlap) - Number(a.overlap) || b.values.reduce<number>((s, v) => s + (v ?? 0), 0) - a.values.reduce<number>((s, v) => s + (v ?? 0), 0));
  const top = ranked.slice(0, 3);
  const multi = map.layers.length > 1;
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_15rem]">
      <div className="relative min-w-0">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Qloo heatmap of ${map.within}: ${cells.length} areas${multi ? `, ${map.overlap.length} strong for every side` : ""}. The table below lists every area.`}>
          {rings.map((k) => (
            <g key={k}>
              <circle cx={W / 2} cy={H / 2} r={k * scale} fill="none" stroke="var(--border)" strokeDasharray="3 4" />
              <text x={W / 2 + k * scale + 3} y={H / 2 + 11} className="fill-muted-foreground text-[10px]">
                {k} km
              </text>
            </g>
          ))}
          <line x1={W / 2} y1={8} x2={W / 2} y2={H - 8} stroke="var(--border)" />
          <line x1={8} y1={H / 2} x2={W - 8} y2={H / 2} stroke="var(--border)" />
          <text x={W / 2 + 4} y={14} className="fill-muted-foreground text-[10px]">
            N
          </text>
          {[...cells].sort((a, b) => a.max - b.max).map((c) => (
            <Glyph key={c.id} c={c} scale={scale} active={c.id === hover} onHover={setHover} />
          ))}
          <circle cx={W / 2} cy={H / 2} r={3} fill="var(--foreground)" />
        </svg>
        {hovered ? (
          <div
            className="pointer-events-none absolute z-10 rounded-md border bg-popover px-2.5 py-1.5 text-small shadow-md"
            style={{ left: `${((W / 2 + hovered.x * scale) / W) * 100}%`, top: `${((H / 2 - hovered.y * scale) / H) * 100}%`, transform: "translate(12px, -50%)" }}
          >
            <div className="font-medium">
              {hovered.km.toFixed(1)} km {hovered.bearing} of centre
            </div>
            {map.layers.map((l, i) => (
              <div key={l.entityId} className="flex items-center gap-1.5 text-muted-foreground">
                <span className={cn("size-2 rounded-sm", HUE_CLS[i])} />
                {l.label}: <span className="font-mono text-foreground">{hovered.values[i] === undefined ? "—" : hovered.values[i]!.toFixed(2)}</span>
              </div>
            ))}
            {hovered.overlap ? <div className="mt-0.5 text-label font-medium">Strong for every side</div> : null}
          </div>
        ) : null}
      </div>
      <div className="grid content-start gap-3">
        <ul className="grid gap-1 text-small" aria-label="Legend">
          {map.layers.map((l, i) => (
            <li key={l.entityId} className="flex items-center gap-2">
              <span className={cn("size-2.5 shrink-0 rounded-sm", HUE_CLS[i])} aria-hidden />
              <span className="truncate">{l.label}</span>
              <span className="ml-auto font-mono text-label text-muted-foreground">{l.points.length}</span>
            </li>
          ))}
          {multi ? (
            <li className="flex items-center gap-2 text-muted-foreground">
              <span className="size-2.5 shrink-0 rounded-full border-[1.5px] border-foreground" aria-hidden />
              Ring: above median for every side
            </li>
          ) : null}
          <li className="text-label text-muted-foreground">Size and depth = Qloo affinity. Centre = middle of the returned areas.</li>
        </ul>
        <div>
          <Kicker>Street teams &amp; flyering</Kicker>
          <ol className="mt-1.5 grid gap-1.5">
            {top.map((c, i) => (
              <li key={c.id} className="rounded-md border px-2 py-1.5 text-small" onMouseEnter={() => setHover(c.id)} onMouseLeave={() => setHover(undefined)}>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-label text-muted-foreground">{i + 1}</span>
                  <span className="font-medium">
                    {c.km.toFixed(1)} km {c.bearing}
                  </span>
                  {c.overlap ? <span className="ml-auto text-label text-muted-foreground">every side</span> : null}
                </div>
                <div className="flex flex-wrap gap-x-2.5 font-mono text-label text-muted-foreground">
                  {c.values.map((v, k) => (
                    <span key={k} className="inline-flex items-center gap-1" title={map.layers[k]!.label}>
                      <span className={cn("size-2 rounded-sm", HUE_CLS[k])} aria-hidden />
                      <span className="sr-only">{map.layers[k]!.label}: </span>
                      {v === undefined ? "—" : v.toFixed(2)}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <details className="text-small lg:col-span-2">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">All {cells.length} areas as a table</summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-md border">
          <table className="w-full text-left text-small">
            <thead className="sticky top-0 bg-muted text-label text-muted-foreground">
              <tr>
                <th className="px-2 py-1 font-medium">Area</th>
                <th className="px-2 py-1 font-medium">From centre</th>
                {map.layers.map((l) => (
                  <th key={l.entityId} className="px-2 py-1 font-medium">
                    {l.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranked.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-2 py-1 font-mono">{c.id}</td>
                  <td className="px-2 py-1">
                    {c.km.toFixed(1)} km {c.bearing}
                  </td>
                  {c.values.map((v, k) => (
                    <td key={k} className="px-2 py-1 font-mono tabular">
                      {v === undefined ? "—" : v.toFixed(2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

export function CrowdMap({ show, onHeatmap }: { show: Show; onHeatmap: (h: Heatmap) => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const map = show.heatmap;
  const load = async (force = false) => {
    setLoading(true);
    setError(undefined);
    try {
      onHeatmap(await api.heatmap(show.id, force));
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setLoading(false);
    }
  };
  // The map is Qloo-only (no model calls), so it loads by itself the first time a planned show is opened.
  useEffect(() => {
    if (!map && show.plan) void load();
  }, [show.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section aria-labelledby="map-title" className="grid gap-2 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 id="map-title" className="flex items-center gap-2 text-h3 font-semibold">
            <MapPinned className="size-4 text-muted-foreground" aria-hidden /> Where the crowd&apos;s taste concentrates
          </h2>
          <p className="text-small text-muted-foreground">
            Areas of {map?.within ?? show.input.city} where each side&apos;s taste concentrates, from one <span className="font-mono">qloo_where_popular</span> call per side. Use it for street teams, flyering and pre-show partner bars.
          </p>
        </div>
        {map ? (
          <Button variant="ghost" size="sm" onClick={() => void load(true)} disabled={loading} title="Call Qloo again">
            {loading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />} Refresh
          </Button>
        ) : null}
      </div>
      {map ? (
        map.layers.length ? (
          <MapBody map={map} />
        ) : (
          <p className="text-small text-muted-foreground">Qloo returned no heatmap areas for this bill in {map.within}.</p>
        )
      ) : loading ? (
        <Skeleton className="h-72" />
      ) : error ? (
        <p className="text-small text-status-error">{error}</p>
      ) : (
        <Button variant="outline" onClick={() => void load()} className="justify-self-start">
          Map the crowd
        </Button>
      )}
      {map?.notes.length ? (
        <ul className="grid gap-0.5 text-small text-status-partial">
          {map.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
      {map ? (
        <div className="flex flex-wrap items-center gap-2 border-t pt-2 text-small text-muted-foreground">
          <span>Qloo:</span>
          {map.layers.map((l) => (
            <span key={l.evidence.callId} className="inline-flex items-center gap-1.5 font-mono">
              where_popular · {l.label} <StatusChip status={l.evidence.status} />
            </span>
          ))}
          <span className="ml-auto text-label">Aggregate taste by area, not where individuals live.</span>
        </div>
      ) : null}
    </section>
  );
}
