"use client";

import { useState } from "react";
import { Check, Loader2, Repeat2, Undo2, X } from "lucide-react";
import type { PlanItem, Slot } from "@housemix/shared";
import { cn } from "cn";
import { ConfidenceChip, Kicker, RisingBadge, StretchBadge } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export type ItemAction = "approve" | "swap" | "reject" | "reset";

const REASONS = ["Wrong energy for this slot", "Off-brand for the venue", "Too expensive", "Already booked elsewhere", "Clashes with a sponsor"];

export function RejectDialog({ item, open, onOpenChange, onReject }: { item?: PlanItem; open: boolean; onOpenChange: (o: boolean) => void; onReject: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject {item?.pick.name}?</DialogTitle>
          <DialogDescription>The reason becomes a negative signal: the next plan will not pick this again.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5">
          {REASONS.map((r) => (
            <button key={r} type="button" onClick={() => setReason(r)} aria-pressed={reason === r} className={cn("rounded-full border px-2.5 py-1 text-small", reason === r ? "border-primary bg-accent text-accent-foreground" : "hover:bg-muted")}>
              {r}
            </button>
          ))}
        </div>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Or write a reason (optional)" aria-label="Reason" maxLength={240} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onReject(reason);
              setReason("");
            }}
          >
            <X data-icon="inline-start" /> Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const APPROVAL_LABEL: Record<PlanItem["approval"]["state"], string> = { pending: "Pending", approved: "Approved", rejected: "Rejected", swapped: "Swapped out" };

export function PlanItemCard({
  item,
  selected,
  focused,
  busy,
  readOnly,
  onSelect,
  onAction,
}: {
  item: PlanItem;
  selected?: boolean;
  focused?: boolean;
  busy?: ItemAction;
  readOnly?: boolean;
  onSelect?: () => void;
  onAction?: (a: ItemAction) => void;
}) {
  const state = item.approval.state;
  const inactive = state === "rejected" || state === "swapped";
  return (
    <article
      data-item-id={item.id}
      tabIndex={-1}
      className={cn(
        "group relative rounded-lg border bg-card p-3 transition-shadow animate-arrive",
        selected && "border-primary ring-1 ring-primary",
        focused && !selected && "ring-2 ring-ring/60",
        inactive && "opacity-60",
        state === "approved" && "border-status-ok/40",
      )}
      aria-label={`${item.pick.name}, ${APPROVAL_LABEL[state]}`}
    >
      <button type="button" onClick={onSelect} className="absolute inset-0 rounded-lg" aria-label={`Open evidence for ${item.pick.name}`} disabled={!onSelect} />
      <div className="pointer-events-none relative flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className={cn("truncate text-h3 font-semibold", inactive && "line-through decoration-1")} title={item.pick.name}>
            {item.pick.name}
          </h4>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-small text-muted-foreground">
            <span className="capitalize">{item.pick.type.replace("_", " ")}</span>
            {item.fitScore !== undefined ? (
              <span className="font-mono" title="Audience similarity from qloo_compare_audiences (our formula)">
                · fit {item.fitScore}/100
              </span>
            ) : null}
            {item.evidence[0]?.scores.rank !== undefined ? (
              <span className="font-mono">
                · #{item.evidence[0].scores.rank} of {item.evidence[0].scores.of}
              </span>
            ) : item.evidence[0]?.scores.affinity !== undefined ? (
              <span className="font-mono">· affinity {item.evidence[0].scores.affinity.toFixed(2)}</span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {item.isWildcard ? <StretchBadge /> : null}
          {item.rising ? <RisingBadge /> : null}
          {item.confidence !== "high" ? <ConfidenceChip confidence={item.confidence} /> : null}
          {state !== "pending" ? (
            <span className={cn("inline-flex h-5 items-center rounded-md px-1.5 text-label font-medium", state === "approved" ? "bg-status-ok-bg text-status-ok" : "bg-muted text-muted-foreground")}>{APPROVAL_LABEL[state]}</span>
          ) : null}
        </div>
      </div>
      <p className="pointer-events-none relative mt-2 line-clamp-2 text-small">{item.interpretation}</p>
      {item.action ? <p className="pointer-events-none relative mt-1 line-clamp-2 text-small text-muted-foreground">→ {item.action}</p> : null}
      {item.approval.reason ? <p className="pointer-events-none relative mt-1 text-small text-muted-foreground">Reason: {item.approval.reason}</p> : null}
      {!readOnly && onAction && state !== "swapped" ? (
        <div className="relative mt-3 flex flex-wrap gap-1.5">
          {state === "pending" ? (
            <>
              <Button size="sm" variant="outline" className="h-8 sm:h-7" onClick={() => onAction("approve")} disabled={Boolean(busy)} aria-keyshortcuts="a">
                {busy === "approve" ? <Loader2 className="animate-spin" /> : <Check />} Approve
              </Button>
              <Button size="sm" variant="outline" className="h-8 sm:h-7" onClick={() => onAction("swap")} disabled={Boolean(busy)} aria-keyshortcuts="s" title="Re-rank this slot's alternatives with qloo_rank">
                {busy === "swap" ? <Loader2 className="animate-spin" /> : <Repeat2 />} Swap
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-destructive hover:text-destructive sm:h-7" onClick={() => onAction("reject")} disabled={Boolean(busy)} aria-keyshortcuts="r">
                <X /> Reject
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" className="h-8 sm:h-7" onClick={() => onAction("reset")} disabled={Boolean(busy)}>
              {busy === "reset" ? <Loader2 className="animate-spin" /> : <Undo2 />} Undo
            </Button>
          )}
        </div>
      ) : null}
    </article>
  );
}

export function SlotLane({
  slot,
  running,
  selectedId,
  focusedId,
  busy,
  readOnly,
  onSelect,
  onAction,
}: {
  slot: Slot;
  running?: boolean;
  selectedId?: string;
  focusedId?: string;
  busy?: Record<string, ItemAction>;
  readOnly?: boolean;
  onSelect?: (item: PlanItem) => void;
  onAction?: (item: PlanItem, a: ItemAction) => void;
}) {
  const main = slot.items.filter((i) => !i.isWildcard);
  const stretch = slot.items.filter((i) => i.isWildcard);
  const [start] = slot.timeRange.split("–");
  return (
    <section className={cn("grid grid-cols-[3.5rem_1fr] gap-3 md:grid-cols-[4.5rem_1fr]", slot.status === "running" && "rounded-lg bg-signal-bg/50")} aria-labelledby={`slot-${slot.key}`}>
      <div className="pt-1 text-right">
        <div className="font-mono text-h3 font-semibold tabular">{start}</div>
        <div className="font-mono text-label text-muted-foreground">{slot.timeRange.split("–")[1]}</div>
      </div>
      <div className="min-w-0 border-l pl-3 pb-6">
        <div className="-ml-[17px] mb-2 flex items-center gap-2">
          <span className={cn("size-2 rounded-full ring-4 ring-background", slot.status === "ready" ? "bg-primary" : slot.status === "needs_manual_input" ? "bg-status-degraded" : "bg-signal animate-live")} aria-hidden />
          <Kicker>{slot.kind === "music" ? "Playlist" : slot.kind === "act" ? "Acts" : slot.kind === "food" ? "Food & drink" : slot.kind === "brand" ? "Merch & sponsors" : "Local flavour"}</Kicker>
        </div>
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 id={`slot-${slot.key}`} className="text-h2 font-semibold">
            {slot.label}
          </h3>
          <span className="text-small text-muted-foreground">
            {slot.items.filter((i) => i.approval.state !== "swapped").length} picks
            {slot.items.filter((i) => i.approval.state === "pending").length ? ` · ${slot.items.filter((i) => i.approval.state === "pending").length} pending` : ""}
          </span>
        </div>
        {slot.note ? <p className={cn("mt-1 text-small", slot.status === "needs_manual_input" ? "text-status-degraded" : "text-muted-foreground")}>{slot.note}</p> : null}
        {slot.items.length === 0 ? (
          <div className="mt-2 rounded-lg border border-dashed p-3 text-small text-muted-foreground">
            {running ? (
              <span className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> Programming this slot…
              </span>
            ) : (
              "Needs manual input: no Qloo-backed pick survived the evidence check."
            )}
          </div>
        ) : (
          <div className="mt-2 grid gap-2 lg:grid-cols-2">
            {[...main, ...stretch].map((it) => (
              <PlanItemCard key={it.id} item={it} selected={selectedId === it.id} focused={focusedId === it.id} busy={busy?.[it.id]} readOnly={readOnly} onSelect={onSelect ? () => onSelect(it) : undefined} onAction={onAction ? (a) => onAction(it, a) : undefined} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
