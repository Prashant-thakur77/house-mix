"use client";

import { useState } from "react";
import { FlaskConical, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { Counterfactual, CounterfactualRow, Show } from "@housemix/shared";
import { cn } from "cn";
import { Kicker, StatusChip } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";

const LOOKUP: Record<CounterfactualRow["status"], string> = {
  resolved: "found in Qloo",
  not_found: "not found in Qloo",
  ambiguous: "ambiguous in Qloo",
  error: "lookup failed",
};

function Kpi({ value, label, hint }: { value: string; label: string; hint: string }) {
  return (
    <div className="rounded-md border p-2.5" title={hint}>
      <div className="font-mono text-kpi font-semibold tabular leading-none">{value}</div>
      <div className="mt-1 text-label text-muted-foreground">{label}</div>
    </div>
  );
}

function SourceTag({ source }: { source: CounterfactualRow["source"] }) {
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center rounded-md px-1.5 text-label font-medium", source === "qloo" ? "bg-qloo-bg text-qloo" : "bg-muted text-muted-foreground")}>
      {source === "qloo" ? "House Mix" : "Claude alone"}
    </span>
  );
}

function SlotTable({ slot, onBill, ours }: { slot: Counterfactual["slots"][number]; onBill: Set<string>; ours: Set<string> }) {
  return (
    <div className="grid gap-1.5 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-small font-semibold">{slot.label}</span>
        {slot.rankEvidence ? (
          <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-label text-muted-foreground">
            qloo_rank · {slot.rows.filter((r) => r.rank !== undefined).length} options <StatusChip status={slot.rankEvidence.status} />
          </span>
        ) : null}
      </div>
      <ol className="grid gap-1">
        {slot.rows.map((r, i) => (
          <li key={`${r.source}-${r.name}-${i}`} className="grid grid-cols-[2rem_1fr] items-start gap-2 text-small">
            <span className={cn("pt-0.5 text-right font-mono tabular", r.rank === 1 ? "font-semibold text-foreground" : "text-muted-foreground")}>{r.rank !== undefined ? `#${r.rank}` : "—"}</span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">{r.name}</span>
                <SourceTag source={r.source} />
                {r.score !== undefined ? <span className="font-mono text-label text-muted-foreground">affinity {r.score.toFixed(2)}</span> : null}
                {r.source === "llm" && r.status !== "resolved" ? <span className="text-label font-medium text-status-partial">{LOOKUP[r.status]}</span> : null}
                {r.source === "llm" && r.qlooId && onBill.has(r.qlooId) ? <span className="text-label text-muted-foreground">already on the bill</span> : null}
                {r.source === "llm" && r.qlooId && ours.has(r.qlooId) ? <span className="text-label text-muted-foreground">same pick as House Mix</span> : null}
              </div>
              {r.source === "llm" && r.why ? (
                <p className="line-clamp-1 text-label text-muted-foreground" title={r.why}>
                  {r.why}
                </p>
              ) : null}
              {r.status === "ambiguous" && r.candidates.length ? (
                <p className="text-label text-muted-foreground" title={r.candidates.map((c) => c.name + (c.disambiguation ? ` (${c.disambiguation})` : "")).join(" · ")}>
                  Qloo asks which one:{" "}
                  {r.candidates
                    .slice(0, 3)
                    .map((c) => c.name)
                    .join(" · ")}
                  {r.candidates.length > 3 ? ` · +${r.candidates.length - 3} more` : ""}. Not ranked, because House Mix never picks for you.
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      {slot.note ? <p className="text-label text-status-partial">{slot.note}</p> : null}
    </div>
  );
}

export function CounterfactualPanel({ show, onResult, readOnly }: { show: Show; onResult: (c: Counterfactual) => void; readOnly?: boolean }) {
  const [loading, setLoading] = useState(false);
  const cf = show.counterfactual;
  const stale = cf && cf.planVersion !== show.version;
  const run = async (force = false) => {
    setLoading(true);
    try {
      onResult(await api.counterfactual(show.id, force));
    } catch (e) {
      toast.error("Could not build the comparison", { description: (e as ApiError).message });
    } finally {
      setLoading(false);
    }
  };
  const items = (show.plan?.slots ?? []).flatMap((s) => s.items.filter((i) => i.approval.state !== "swapped"));
  const backed = items.filter((i) => i.evidence.length > 0).length;
  const onBill = new Set(show.entities.filter((e) => e.kind === "side" && e.qlooId).map((e) => e.qlooId!));
  const ours = new Set(items.map((i) => i.pick.qlooId));

  return (
    <section aria-labelledby="cf-title" className="grid gap-3 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <Kicker>Qloo on vs Qloo off</Kicker>
          <h2 id="cf-title" className="mt-1 flex items-center gap-2 text-h3 font-semibold">
            <FlaskConical className="size-4 text-muted-foreground" aria-hidden /> Without Qloo
          </h2>
          <p className="max-w-[75ch] text-small text-muted-foreground">
            Claude plans the same brief from its own knowledge, with no tools. Then Qloo checks that plan: <span className="font-mono">qloo_describe</span> looks up every pick by name, and one{" "}
            <span className="font-mono">qloo_rank</span> per slot puts both plans&apos; top picks in order for tonight&apos;s bill, city and crowd.
          </p>
        </div>
        {cf && !readOnly ? (
          <Button variant="ghost" size="sm" onClick={() => void run(true)} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />} {stale ? "Update for v" + show.version : "Run again"}
          </Button>
        ) : null}
      </div>
      {cf ? (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Kpi value={`${backed}/${items.length}`} label="House Mix picks with a Qloo citation" hint="Every House Mix pick cites the Qloo call it came from; the Critic removes the rest." />
            <Kpi value={`0/${cf.summary.llmPicks}`} label="Claude-alone picks with a citation" hint="Claude alone has no tools, so nothing it says is backed by a Qloo result." />
            <Kpi
              value={`${cf.summary.llmResolved}/${cf.summary.llmPicks}`}
              label="Claude-alone picks Qloo could find"
              hint="Looked up by name with qloo_describe. Ambiguous names are reported, never auto-picked."
            />
            <Kpi
              value={`${cf.summary.slotsQlooLed}/${cf.summary.rankedSlots}`}
              label="slots where Qloo ranked a House Mix pick first"
              hint="From one qloo_rank call per slot over both plans' top picks."
            />
          </div>
          {stale ? (
            <p className="text-small text-status-partial">
              Made for plan v{cf.planVersion}; the plan is now v{show.version}.
            </p>
          ) : null}
          <div className="grid gap-2 lg:grid-cols-2">
            {cf.slots.map((s) => (
              <SlotTable key={s.key} slot={s} onBill={onBill} ours={ours} />
            ))}
          </div>
          <p className="border-l-3 border-interp-border bg-interp-bg/60 py-1.5 pl-3 pr-2 text-small">
            Read this with care. Qloo is ranking House Mix&apos;s own picks here, so a House Mix lead is expected and is not an independent quality test (the blind human A/B in{" "}
            <span className="font-mono">eval/</span> is). What this view does show: which knowledge-only picks Qloo cannot find or confirm, and where they sit for this specific crowd.
            {show.qlooMode === "mock" ? " MOCK DATA: Qloo results here are fictional fixtures." : ""}
          </p>
          <p className="text-label text-muted-foreground">
            Claude alone: <span className="font-mono">{cf.model}</span>, same slot brief, no tools · ${cf.costUsd.toFixed(3)} · {new Date(cf.createdAt).toISOString().slice(0, 16).replace("T", " ")}{" "}
            UTC
          </p>
        </>
      ) : loading ? (
        <div className="grid gap-2" aria-busy="true">
          <p className="text-small text-muted-foreground">Claude is planning without tools, then Qloo is looking up and ranking each pick…</p>
          <Skeleton className="h-40" />
        </div>
      ) : readOnly ? (
        <p className="text-small text-muted-foreground">No comparison was run for this plan.</p>
      ) : (
        <Button variant="outline" onClick={() => void run()} className="justify-self-start" disabled={!show.plan}>
          <FlaskConical data-icon="inline-start" /> Plan it without Qloo and compare
        </Button>
      )}
    </section>
  );
}
