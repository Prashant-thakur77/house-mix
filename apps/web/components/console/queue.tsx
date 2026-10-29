"use client";

import { Check, Loader2, Lock, LockOpen, X } from "lucide-react";
import type { PlanItem, Show } from "@housemix/shared";
import { Kicker } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { ItemAction } from "./plan";

function why(item: PlanItem): string {
  if (item.isWildcard) return "Stretch pick: deliberately outside the crowd's top tags";
  if (item.confidence !== "high") return "Reduced confidence: a Qloo call was partial or degraded";
  if (item.fitScore !== undefined) return `Sponsor fit ${item.fitScore}/100`;
  const sc = item.evidence[0]?.scores;
  if (sc?.rank !== undefined) return `Qloo rank #${sc.rank} of ${sc.of}`;
  if (sc?.affinity !== undefined) return `Qloo affinity ${sc.affinity.toFixed(2)}`;
  return "Needs a human sign-off";
}

export function ApprovalQueue({ show, busy, onAction, onSelect, onLock, onUnlock, onApproveConfident, locking }: { show: Show; busy: Record<string, ItemAction>; onAction: (item: PlanItem, a: ItemAction) => void; onSelect: (item: PlanItem) => void; onLock: () => void; onUnlock: () => void; onApproveConfident: () => void; locking?: boolean }) {
  const items = show.plan?.slots.flatMap((s) => s.items.map((i) => ({ i, slot: s }))) ?? [];
  const live = items.filter(({ i }) => i.approval.state !== "swapped");
  const pending = live.filter(({ i }) => i.approval.state === "pending");
  const done = live.length - pending.length;
  return (
    <section aria-labelledby="queue-title" className="grid gap-3">
      <div>
        <Kicker>Approval queue</Kicker>
        <div className="mt-1 flex items-baseline justify-between">
          <h2 id="queue-title" className="text-h2 font-semibold">
            {pending.length ? `${pending.length} waiting` : show.lockedAt ? `Locked · v${show.version}` : "Nothing waiting"}
          </h2>
          <span className="font-mono text-small text-muted-foreground">
            {done}/{live.length}
          </span>
        </div>
        <Progress value={live.length ? (100 * done) / live.length : 0} className="mt-2" aria-label={`${done} of ${live.length} items decided`} />
      </div>
      {show.lockedAt ? (
        <div className="rounded-md border bg-muted/50 p-3 text-small">
          Plan v{show.version} locked {new Date(show.lockedAt).toLocaleString()}. Exports carry this version and timestamp.
          <Button size="sm" variant="ghost" className="mt-2" onClick={onUnlock}>
            <LockOpen data-icon="inline-start" /> Unlock to edit
          </Button>
        </div>
      ) : (
        <>
          {pending.some(({ i }) => !i.isWildcard && i.confidence === "high") ? (
            <Button variant="outline" onClick={onApproveConfident} title="Approves pending picks whose Qloo calls all returned ok; stretch and reduced-confidence picks stay in the queue">
              <Check data-icon="inline-start" /> Approve {pending.filter(({ i }) => !i.isWildcard && i.confidence === "high").length} high-confidence picks
            </Button>
          ) : null}
          <ol className="grid gap-1.5">
            {pending.slice(0, 40).map(({ i, slot }, n) => (
              <li key={i.id} className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-2 rounded-md border px-2 py-1.5">
                <span className="font-mono text-small text-muted-foreground">{n + 1}</span>
                <button type="button" className="min-w-0 text-left" onClick={() => onSelect(i)}>
                  <span className="block truncate text-small font-medium">{i.pick.name}</span>
                  <span className="block truncate text-label text-muted-foreground">
                    {slot.label} · {why(i)}
                  </span>
                </button>
                <span className="flex gap-1">
                  <Button size="icon-sm" variant="outline" aria-label={`Approve ${i.pick.name}`} disabled={Boolean(busy[i.id])} onClick={() => onAction(i, "approve")}>
                    {busy[i.id] === "approve" ? <Loader2 className="animate-spin" /> : <Check />}
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`Reject ${i.pick.name}`} disabled={Boolean(busy[i.id])} onClick={() => onAction(i, "reject")}>
                    <X />
                  </Button>
                </span>
              </li>
            ))}
          </ol>
          {pending.length === 0 && live.length ? <p className="text-small text-muted-foreground">Every item is decided. Lock the plan to version it.</p> : null}
          <Button onClick={onLock} disabled={pending.length > 0 || !live.length || locking} title={pending.length ? `Decide ${pending.length} more item${pending.length === 1 ? "" : "s"} first` : undefined}>
            {locking ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Lock data-icon="inline-start" />}
            {pending.length ? `Approve ${pending.length} more to lock` : "Lock plan"}
          </Button>
        </>
      )}
      {show.negativeSignals.length ? (
        <div className="grid gap-1">
          <Kicker>Negative signals for the next plan</Kicker>
          <ul className="grid gap-1 text-small">
            {show.negativeSignals.map((n) => (
              <li key={n.qlooId} className="flex justify-between gap-2 rounded-md bg-muted px-2 py-1">
                <span className="truncate">{n.name}</span>
                <span className="truncate text-muted-foreground">{n.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
