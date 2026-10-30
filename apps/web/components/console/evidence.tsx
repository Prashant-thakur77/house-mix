"use client";

import { Copy, FileText, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";
import type { Evidence, PlanItem, Slot } from "@housemix/shared";
import { cn } from "cn";
import { ConfidenceChip, Kicker, StatusChip, StretchBadge } from "@/components/status";
import { Button } from "@/components/ui/button";
import { sponsorUrl } from "@/lib/api";

function ScoreBar({ label, value, max = 1 }: { label: string; value: number; max?: number }) {
  const pct = Math.max(0, Math.min(1, value / max)) * 100;
  return (
    <div className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-2 text-small">
      <span className="text-muted-foreground">{label}</span>
      <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className="block h-full rounded-full bg-qloo-border" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-right font-mono tabular">{max === 1 ? value.toFixed(2) : value}</span>
    </div>
  );
}

function fmt(v: unknown): string {
  if (Array.isArray(v)) return v.map(fmt).join(", ");
  if (typeof v === "object" && v !== null) return JSON.stringify(v);
  return String(v);
}

export function EvidenceCall({ e, onTrace }: { e: Evidence; onTrace?: (callId: string) => void }) {
  const scores = Object.entries(e.scores);
  return (
    <div className="rounded-md border p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-small font-medium">{e.tool}</span>
        <StatusChip status={e.status} />
        <span className="ml-auto font-mono text-label text-subtle-foreground">
          {e.source === "cache" ? "cached" : `${e.durationMs}ms`} · {e.source}
        </span>
      </div>
      {scores.length ? (
        <div className="mt-2 grid gap-1">
          {scores.map(([k, v]) =>
            k === "of" ? null : k === "rank" ? (
              <ScoreBar key={k} label={`rank (of ${e.scores.of})`} value={v} max={Math.max(v, e.scores.of ?? v)} />
            ) : k === "fit" ? (
              <ScoreBar key={k} label="audience fit" value={v} max={100} />
            ) : k === "delta" ? (
              <div key={k} className="grid grid-cols-[6.5rem_1fr] gap-2 text-small">
                <span className="text-muted-foreground">90-day change</span>
                <span className="font-mono">
                  {v >= 0 ? "+" : ""}
                  {(v * 100).toFixed(1)} pct pts
                </span>
              </div>
            ) : (
              <ScoreBar key={k} label={k} value={v} />
            ),
          )}
        </div>
      ) : null}
      <details className="mt-2 text-small">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Inputs (IDs only)</summary>
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono">
          {Object.entries(e.inputs).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="break-all">{fmt(v)}</dd>
            </div>
          ))}
          {e.endpoint ? (
            <>
              <dt className="text-muted-foreground">endpoint</dt>
              <dd>{e.endpoint}</dd>
            </>
          ) : null}
        </dl>
      </details>
      <div className="mt-2 flex items-center gap-2 font-mono text-label text-subtle-foreground">
        <span className="truncate">call {e.callId}</span>
        <button
          type="button"
          className="rounded-sm p-0.5 hover:text-foreground"
          aria-label="Copy call ID"
          onClick={() =>
            navigator.clipboard.writeText(e.callId).then(
              () => toast("Call ID copied"),
              () => toast.error("Couldn't copy here", { description: e.callId }),
            )
          }
        >
          <Copy className="size-3" />
        </button>
        {onTrace ? (
          <button type="button" className="ml-auto rounded-sm px-1 text-primary hover:underline" onClick={() => onTrace(e.callId)}>
            Show in trace
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function EvidencePanel({ item, slot, showId, onClose, onTrace }: { item: PlanItem; slot?: Slot; showId: string; onClose?: () => void; onTrace?: (callId: string) => void }) {
  return (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Kicker>
            Evidence · {slot?.label ?? item.slotKey} {slot ? `· ${slot.timeRange}` : ""}
          </Kicker>
          <h2 className="mt-1 text-h2 font-semibold">{item.pick.name}</h2>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <ConfidenceChip confidence={item.confidence} />
            {item.isWildcard ? <StretchBadge /> : null}
          </div>
        </div>
        {onClose ? (
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close evidence">
            <X />
          </Button>
        ) : null}
      </div>
      {item.evidence.length === 0 ? (
        <div className="flex gap-2 rounded-md bg-status-error-bg p-3 text-small text-status-error">
          <ShieldAlert className="size-4 shrink-0" aria-hidden /> This item has no Qloo citation and should have been removed by the Critic.
        </div>
      ) : null}
      <div className="border-l-3 border-qloo-border bg-qloo-bg/60 py-2 pl-3 pr-2">
        <div className="text-label font-medium uppercase text-qloo">Qloo says</div>
        <p className="mt-1 font-mono text-small">{item.qlooSays}</p>
      </div>
      <div className="border-l-3 border-interp-border bg-interp-bg/60 py-2 pl-3 pr-2">
        <div className="text-label font-medium uppercase text-interp">Our interpretation</div>
        <p className="mt-1 text-small">{item.interpretation}</p>
        {item.action ? <p className="mt-1.5 text-small text-muted-foreground">Crew action: {item.action}</p> : null}
      </div>
      <div className="grid gap-2">
        <Kicker>
          {item.evidence.length} Qloo call{item.evidence.length === 1 ? "" : "s"} behind this pick
        </Kicker>
        {item.evidence.map((e) => (
          <EvidenceCall key={e.callId} e={e} onTrace={onTrace} />
        ))}
      </div>
      {slot?.kind === "brand" ? (
        <Button nativeButton={false} variant="outline" render={<a href={sponsorUrl(showId, item.id)} download />}>
          <FileText data-icon="inline-start" /> Sponsor one-pager (PDF)
        </Button>
      ) : null}
      <p className={cn("text-small text-muted-foreground")}>Qloo affinities describe aggregate audiences. They are relative signals, not predictions about any person.</p>
    </div>
  );
}
