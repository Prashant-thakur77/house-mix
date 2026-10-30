"use client";

import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import type { CrowdRead } from "@housemix/shared";
import { cn } from "cn";
import { ConfidenceChip, Kicker, StatusChip } from "@/components/status";
import { usePrefersReducedMotion } from "@/lib/hooks";
import { Skeleton } from "@/components/ui/skeleton";

const AGE_LABEL: Record<string, string> = {
  "24_and_younger": "≤24",
  "25_to_29": "25–29",
  "30_to_34": "30–34",
  "35_to_44": "35–44",
  "45_to_54": "45–54",
  "55_and_older": "55+",
};

function SourceFooter({ tool, crowd }: { tool: string; crowd: CrowdRead }) {
  const ev = crowd.evidence.find((e) => e.tool === tool);
  return (
    <div className="mt-auto flex items-center gap-2 border-t pt-2 text-small text-muted-foreground">
      <span>Qloo:</span>
      <span className="font-mono">{tool}</span>
      {ev ? <StatusChip status={ev.status} /> : <span className="text-subtle-foreground">not called</span>}
    </div>
  );
}

function Card({ title, kpi, kpiLabel, children, className }: { title: string; kpi?: string; kpiLabel?: string; children: React.ReactNode; className?: string }) {
  return (
    <figure className={cn("flex min-h-64 flex-col gap-2 rounded-lg border bg-card p-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <Kicker className="min-w-0 pt-1">{title}</Kicker>
        {kpi ? (
          <div className="shrink-0 text-right">
            <div className="font-mono text-kpi font-semibold tabular leading-none">{kpi}</div>
            {kpiLabel ? <div className="mt-1 text-label text-muted-foreground">{kpiLabel}</div> : null}
          </div>
        ) : null}
      </div>
      {children}
    </figure>
  );
}

/** Qloo can return the same concept name under two tag categories; show each name once. */
function byName<T extends { name: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = r.name.toLowerCase();
    return !seen.has(k) && Boolean(seen.add(k));
  });
}

function SideList({ label, swatch, rows: all, align }: { label: string; swatch: string; rows: CrowdRead["distinctA"]; align: "start" | "end" }) {
  const rows = byName(all);
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", align === "end" && "items-end text-right")}>
      <span className={cn("flex max-w-full items-center gap-1.5 text-label uppercase text-muted-foreground", align === "end" && "flex-row-reverse")}>
        <span className={cn("size-2.5 shrink-0 rounded-sm", swatch)} />
        <span className="truncate">Only {label}</span>
      </span>
      {rows.length ? (
        <ul className={cn("flex flex-wrap gap-1", align === "end" && "justify-end")}>
          {rows.map((r) => (
            <li key={r.qlooId} className="rounded-sm border bg-background px-1.5 py-0.5 text-small">
              {r.name}
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-small text-muted-foreground">none returned</span>
      )}
    </div>
  );
}

function SharedDistinct({ crowd }: { crowd: CrowdRead }) {
  const shared = byName(crowd.sharedGround);
  const labelA = crowd.labelA || "Group A";
  const labelB = crowd.labelB || "Group B";
  const any = shared.length + crowd.distinctA.length + crowd.distinctB.length > 0;
  return (
    <Card title="Shared vs distinct" kpi={String(shared.length)} kpiLabel="shared concepts" className="md:col-span-2">
      {any ? (
        <>
          <div className="grid gap-3 sm:grid-cols-[1fr_minmax(0,1.3fr)_1fr]">
            <SideList label={labelA} swatch="bg-chart-1" rows={crowd.distinctA} align="end" />
            <div className="flex min-w-0 flex-col gap-1.5 rounded-md border border-dashed p-2">
              <span className="text-center text-label uppercase text-muted-foreground">Both crowds · Qloo similarity</span>
              {shared.length ? (
                <ul className="grid gap-1">
                  {shared.map((r) => (
                    <li key={r.qlooId} className="group grid grid-cols-[minmax(0,1fr)_4.5rem_2.25rem] items-center gap-2 text-small" title={`${r.name}: ${r.score?.toFixed(2) ?? "no score"}`}>
                      <span className="truncate font-medium">{r.name}</span>
                      <span className="h-2.5 overflow-hidden rounded-[4px] bg-muted">
                        <span
                          className="block h-full rounded-[4px] bg-gradient-to-r from-chart-1 to-chart-2 transition-opacity group-hover:opacity-80"
                          style={{ width: `${Math.max(4, (r.score ?? 0) * 100)}%` }}
                        />
                      </span>
                      <span className="text-right font-mono text-label tabular text-muted-foreground">{r.score?.toFixed(2) ?? "—"}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-center text-small text-muted-foreground">No concepts in common. Qloo returns none when the two sides share no tags.</p>
              )}
            </div>
            <SideList label={labelB} swatch="bg-chart-2" rows={crowd.distinctB} align="start" />
          </div>
          <p className="text-label text-muted-foreground">The middle column is what both crowds carry, scored by Qloo. The sides are concepts only one crowd carries; they go to that crowd's slots.</p>
          <figcaption className="sr-only">
            Shared by {labelA} and {labelB}: {shared.map((r) => `${r.name}${r.score !== undefined ? ` ${r.score.toFixed(2)}` : ""}`).join("; ") || "none"}. Only {labelA}:{" "}
            {crowd.distinctA.map((r) => r.name).join(", ") || "none"}. Only {labelB}: {crowd.distinctB.map((r) => r.name).join(", ") || "none"}.
          </figcaption>
        </>
      ) : (
        <p className="text-small text-muted-foreground">No comparison: Qloo needs two confirmed groups (headliner vs support, home vs away, or act vs venue).</p>
      )}
      <SourceFooter tool="qloo_compare_audiences" crowd={crowd} />
    </Card>
  );
}

function Demographics({ crowd }: { crowd: CrowdRead }) {
  const rows = crowd.demographics.age.map((a) => ({ name: AGE_LABEL[a.bucket] ?? a.bucket, value: a.value }));
  const top = [...rows].sort((x, y) => y.value - x.value)[0];
  return (
    <Card title="Age skew · aggregate" kpi={top?.name} kpiLabel="strongest affinity">
      {rows.length ? (
        <>
          <div className="grid h-36 grid-cols-6 items-stretch gap-1.5" aria-hidden>
            {rows.map((r) => (
              <div key={r.name} className="grid grid-rows-[1fr_1fr_auto] text-center" title={`${r.name}: ${r.value.toFixed(2)}`}>
                <div className="flex flex-col justify-end">
                  {r.value >= 0 ? (
                    <>
                      <span className="font-mono text-label tabular text-muted-foreground">{r.value.toFixed(2)}</span>
                      <span className="mx-auto w-full max-w-7 rounded-t-[4px] bg-chart-1" style={{ height: `${Math.max(3, r.value * 100)}%` }} />
                    </>
                  ) : null}
                </div>
                <div className="flex flex-col border-t">
                  {r.value < 0 ? (
                    <>
                      <span className="mx-auto w-full max-w-7 rounded-b-[4px] bg-chart-1/35" style={{ height: `${Math.max(3, -r.value * 100)}%` }} />
                      <span className="font-mono text-label tabular text-muted-foreground">{r.value.toFixed(2)}</span>
                    </>
                  ) : null}
                </div>
                <span className="pt-1 text-label text-muted-foreground">{r.name}</span>
              </div>
            ))}
          </div>
          <p className="text-small text-muted-foreground">
            Relative affinity, −1 to 1. Used only for tone and pricing.{" "}
            {crowd.demographicPhrase ? (
              <>
                Sent to Qloo as <span className="font-mono text-foreground">“{crowd.demographicPhrase}”</span>.
              </>
            ) : null}
          </p>
          <figcaption className="sr-only">Relative age affinity on a −1 to 1 scale: {rows.map((r) => `${r.name} ${r.value.toFixed(2)}`).join(", ")}.</figcaption>
        </>
      ) : (
        <p className="text-small text-muted-foreground">Qloo returned no demographic distribution for the headliner.</p>
      )}
      <SourceFooter tool="qloo_audience_demographics" crowd={crowd} />
    </Card>
  );
}

function Tags({ crowd }: { crowd: CrowdRead }) {
  return (
    <Card title="Taste vocabulary" kpi={String(crowd.tags.length)} kpiLabel="concepts" className="min-h-0 md:col-span-2">
      {crowd.tags.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Crowd taste tags with affinity">
          {crowd.tags.map((t) => (
            <li key={t.tagId} className="inline-flex items-center gap-1.5 rounded-md border bg-muted/60 px-2 py-0.5 text-small" title={t.tagId}>
              {t.name}
              <span className="font-mono text-label text-muted-foreground">{t.score.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-small text-muted-foreground">No tags returned for these entities.</p>
      )}
      <SourceFooter tool="qloo_entity_tags" crowd={crowd} />
    </Card>
  );
}

function Trends({ crowd, animate }: { crowd: CrowdRead; animate: boolean }) {
  return (
    <Card title="Momentum · 90 days">
      {crowd.trends.length ? (
        <ul className="grid gap-2">
          {crowd.trends.slice(0, 4).map((t, i) => (
            <li key={t.qlooId} className="grid grid-cols-[1fr_96px_auto] items-center gap-2">
              <span className="truncate text-small" title={t.name}>
                {t.name}
              </span>
              <div className="h-8" aria-hidden>
                <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 96, height: 32 }}>
                  <LineChart accessibilityLayer={false} data={t.points} margin={{ top: 4, bottom: 4, left: 2, right: 2 }}>
                    <YAxis domain={["dataMin", "dataMax"]} hide />
                    <Line type="monotone" dataKey="value" stroke={i === 0 ? "var(--chart-1)" : "var(--chart-2)"} strokeWidth={2} dot={false} isAnimationActive={animate} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {Math.abs(t.delta * 100) < 0.05 ? (
                <span className="font-mono text-small tabular text-muted-foreground">– flat</span>
              ) : (
                <span className={cn("font-mono text-small tabular", t.delta > 0 ? "text-status-ok" : "text-muted-foreground")}>
                  {t.delta > 0 ? "▲" : "▼"} {Math.abs(t.delta * 100).toFixed(1)}
                  <span className="sr-only"> percentile points</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-small text-muted-foreground">No trend series (Qloo coverage can be thin for smaller acts).</p>
      )}
      <p className="text-label text-muted-foreground">Change in popularity percentile, in points.</p>
      <SourceFooter tool="qloo_trends" crowd={crowd} />
    </Card>
  );
}

export function CrowdReadPanel({ crowd, streaming }: { crowd?: CrowdRead; streaming?: boolean }) {
  const reduced = usePrefersReducedMotion();
  const animate = !reduced && !streaming;
  if (!crowd) {
    return (
      <section aria-label="Crowd read" className="grid gap-3 md:grid-cols-2">
        {streaming ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className={cn("h-64 rounded-lg", i === 0 && "md:col-span-2")} />)
        ) : (
          <p className="text-small text-muted-foreground">No crowd read yet.</p>
        )}
      </section>
    );
  }
  return (
    <section aria-labelledby="crowd-title" className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="crowd-title" className="text-h2 font-semibold">
          Crowd read
        </h2>
        <ConfidenceChip confidence={crowd.confidence} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <SharedDistinct crowd={crowd} />
        <Demographics crowd={crowd} />
        <Trends crowd={crowd} animate={animate} />
        <Tags crowd={crowd} />
        <div className="grid gap-2 rounded-lg border bg-card p-3 md:col-span-2">
          <div className="border-l-3 border-qloo-border bg-qloo-bg/60 py-1.5 pl-3 pr-2">
            <div className="text-label font-medium uppercase text-qloo">Qloo says</div>
            <ul className="mt-1 grid gap-0.5 font-mono text-small">
              {crowd.qlooSays.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
          <div className="border-l-3 border-interp-border bg-interp-bg/60 py-1.5 pl-3 pr-2">
            <div className="text-label font-medium uppercase text-interp">Our interpretation</div>
            {crowd.interpretation.length ? (
              <ul className="mt-1 grid gap-0.5 text-small">
                {crowd.interpretation.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-small text-muted-foreground">Nothing survived the Critic: every interpretation line must be supported by the Qloo results above.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
