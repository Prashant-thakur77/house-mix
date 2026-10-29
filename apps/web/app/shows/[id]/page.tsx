"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { GitCompareArrows, Keyboard, ListChecks, Loader2, PanelLeft, Play, RefreshCw, Rows3 } from "lucide-react";
import { toast } from "sonner";
import { MODES, slotTime, type CrowdRead, type PlanItem, type RunEvent, type Show, type Slot } from "@housemix/shared";
import { cn } from "cn";
import { api, ApiError } from "@/lib/api";
import { useKeyboard, useMediaQuery, useRunStream, useShow } from "@/lib/hooks";
import { TopBar } from "@/components/app-shell";
import { Kicker, ModeChip } from "@/components/status";
import { TracePane } from "@/components/console/trace";
import { CrowdReadPanel } from "@/components/console/crowd";
import { RejectDialog, SlotLane, type ItemAction } from "@/components/console/plan";
import { EvidencePanel } from "@/components/console/evidence";
import { ApprovalQueue } from "@/components/console/queue";
import { EntityConfirmCard, ResolvedStrip } from "@/components/console/confirm";
import { ExportsMenu, LimitationsPanel } from "@/components/console/extras";
import { BriefingSheet } from "@/components/console/briefing";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const STATE_LABEL: Record<Show["status"], string> = {
  needs_confirmation: "Needs you",
  ready_to_plan: "Ready to plan",
  planning: "Building",
  planned: "Plan ready",
  locked: "Locked",
  failed: "Failed",
};

function templateSlots(show: Show): Slot[] {
  const t = MODES[show.input.mode];
  return t.slots.map((s) => ({ key: s.key, label: s.label, timeRange: slotTime(show.input.doorsTime ?? "18:30", s.offsetMin, s.lengthMin), kind: s.kind, status: "running", items: [], alternatives: [] }));
}

function liveState(show: Show, events: RunEvent[]): { slots: Slot[]; crowd?: CrowdRead } {
  const byKey = new Map(templateSlots(show).map((s) => [s.key, s]));
  let crowd: CrowdRead | undefined;
  for (const e of events) {
    if (e.type === "slot") byKey.set(e.slot.key, e.slot);
    if (e.type === "crowd") crowd = e.crowd;
  }
  return { slots: [...byKey.values()], crowd };
}

const SHORTCUTS: [string, string][] = [
  ["j / k", "Next / previous item"],
  ["a", "Approve focused item"],
  ["s", "Swap (re-rank with Qloo)"],
  ["r", "Reject with a reason"],
  ["e", "Open evidence"],
  ["Esc", "Close evidence"],
  ["?", "This help"],
];

export default function ConsolePage() {
  const { id } = useParams<{ id: string }>();
  const { show, setShow, error, loading, reload } = useShow(id);
  const [runId, setRunId] = useState<string>();
  const streamId = runId ?? (show?.status === "planning" ? show.lastRunId : undefined);
  const stream = useRunStream(streamId, () => {
    void reload().then(() => setRunId(undefined));
  });
  const [stored, setStored] = useState<RunEvent[]>([]);
  useEffect(() => {
    if (show?.lastRunId && !streamId) api.run(show.lastRunId).then((r) => setStored(r.events)).catch(() => setStored([]));
  }, [show?.lastRunId, streamId]);

  const streaming = Boolean(streamId) && stream.state !== "done" && stream.state !== "failed";
  const events = streamId ? stream.events : stored;
  const live = useMemo(() => (show && streaming ? liveState(show, events) : undefined), [show, streaming, events]);
  const slots = live?.slots ?? show?.plan?.slots ?? [];
  const crowd = live ? live.crowd : show?.plan?.crowd;
  const items = slots.flatMap((s) => s.items.filter((i) => i.approval.state !== "swapped"));

  const [selectedId, setSelectedId] = useState<string>();
  const [focusedId, setFocusedId] = useState<string>();
  const [busy, setBusy] = useState<Record<string, ItemAction>>({});
  const [rejecting, setRejecting] = useState<PlanItem>();
  const [highlightCall, setHighlightCall] = useState<string>();
  const [helpOpen, setHelpOpen] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);
  const [locking, setLocking] = useState(false);
  const [starting, setStarting] = useState(false);
  const desktop = useMediaQuery("(min-width: 1280px)");
  const tablet = useMediaQuery("(min-width: 768px)");
  const large = useMediaQuery("(min-width: 1024px)");
  const selected = items.find((i) => i.id === selectedId) ?? slots.flatMap((s) => s.items).find((i) => i.id === selectedId);
  const selectedSlot = slots.find((s) => s.items.some((i) => i.id === selectedId));
  const editable = Boolean(show?.plan) && !streaming && !show?.lockedAt;

  const start = async () => {
    if (!show) return;
    setStarting(true);
    try {
      const r = await api.startRun(show.id);
      setRunId(r.runId);
      setShow({ ...show, status: "planning", lastRunId: r.runId });
      setSelectedId(undefined);
    } catch (e) {
      toast.error("Could not start the plan", { description: (e as ApiError).message });
    } finally {
      setStarting(false);
    }
  };

  const act = async (item: PlanItem, a: ItemAction) => {
    if (!show) return;
    if (a === "reject") return setRejecting(item);
    setBusy((b) => ({ ...b, [item.id]: a }));
    try {
      const next = a === "approve" ? await api.approve(show.id, item.id) : a === "swap" ? await api.swap(show.id, item.id) : await api.reset(show.id, item.id);
      setShow(next);
      if (a === "swap") {
        const slot = next.plan?.slots.find((s) => s.items.some((i) => i.id === item.id));
        const repl = slot?.items.find((i) => i.id === slot.items.find((x) => x.id === item.id)?.approval.replacedBy);
        toast.success(`Swapped in ${repl?.pick.name ?? "the next-best option"}`, { description: "Qloo re-ranked the slot's remaining alternatives." });
        if (selectedId === item.id && repl) setSelectedId(repl.id);
      }
    } catch (e) {
      toast.error(a === "swap" ? "Swap failed" : "Update failed", { description: (e as ApiError).message });
    } finally {
      setBusy((b) => {
        const n = { ...b };
        delete n[item.id];
        return n;
      });
    }
  };

  const doReject = async (reason: string) => {
    if (!show || !rejecting) return;
    const item = rejecting;
    setRejecting(undefined);
    setBusy((b) => ({ ...b, [item.id]: "reject" }));
    try {
      setShow(await api.reject(show.id, item.id, reason));
      toast(`Rejected ${item.pick.name}`, { description: "Saved as a negative signal for the next plan." });
    } catch (e) {
      toast.error("Reject failed", { description: (e as ApiError).message });
    } finally {
      setBusy((b) => {
        const n = { ...b };
        delete n[item.id];
        return n;
      });
    }
  };

  const showInTrace = (callId: string) => {
    setHighlightCall(callId);
    if (!desktop) setTraceOpen(true);
    setTimeout(() => document.querySelector(`[data-call-id="${callId}"]`)?.scrollIntoView({ block: "center" }), 50);
  };

  useKeyboard(
    (e) => {
      if (e.key === "?") return setHelpOpen(true);
      if (e.key === "Escape") return setSelectedId(undefined);
      if (!items.length) return;
      const idx = items.findIndex((i) => i.id === (focusedId ?? selectedId));
      if (e.key === "j" || e.key === "k") {
        const next = items[Math.max(0, Math.min(items.length - 1, idx + (e.key === "j" ? 1 : -1)))] ?? items[0]!;
        setFocusedId(next.id);
        document.querySelector(`[data-item-id="${next.id}"]`)?.scrollIntoView({ block: "nearest" });
        return;
      }
      const cur = items[idx];
      if (!cur) return;
      if (e.key === "e") setSelectedId(cur.id);
      if (!editable || cur.approval.state !== "pending") return;
      if (e.key === "a") void act(cur, "approve");
      if (e.key === "s") void act(cur, "swap");
      if (e.key === "r") setRejecting(cur);
    },
    [items, focusedId, selectedId, editable, show],
  );

  if (loading && !show) {
    return (
      <>
        <TopBar />
        <main id="main" className="mx-auto grid max-w-[1600px] gap-4 p-4 md:p-6">
          <Skeleton className="h-16" />
          <div className="grid gap-4 xl:grid-cols-[320px_1fr_400px]">
            <Skeleton className="h-[60vh]" />
            <Skeleton className="h-[60vh]" />
            <Skeleton className="h-[60vh]" />
          </div>
        </main>
      </>
    );
  }
  if (error || !show) {
    return (
      <>
        <TopBar />
        <main id="main" className="mx-auto max-w-xl p-6">
          <Alert variant="destructive">
            <AlertTitle>{error?.status === 404 ? "Show not found" : "Could not load this show"}</AlertTitle>
            <AlertDescription>
              {error?.message}{" "}
              <Link href="/" className="font-medium underline">
                Back to shows
              </Link>
            </AlertDescription>
          </Alert>
          {error?.status !== 404 ? (
            <Button className="mt-3" variant="outline" onClick={() => void reload()}>
              <RefreshCw data-icon="inline-start" /> Retry
            </Button>
          ) : null}
        </main>
      </>
    );
  }

  const pendingEntities = show.entities.filter((e) => e.status === "needs_confirmation" || (e.kind === "side" && e.status !== "resolved"));
  const pendingCount = items.filter((i) => i.approval.state === "pending").length;
  const i = show.input;

  const header = (
    <div className="border-b bg-background">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-x-4 gap-y-2 px-4 py-3 md:flex-row md:flex-wrap md:items-center md:px-6">
        <div className="min-w-0 md:flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <ModeChip mode={i.mode} />
            <span className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-small font-medium", streaming ? "bg-signal-bg text-signal" : show.status === "needs_confirmation" ? "bg-status-needs-input-bg text-status-needs-input" : "bg-muted text-muted-foreground")}>
              {streaming ? <span className="size-1.5 rounded-full bg-signal animate-live" aria-hidden /> : null}
              {streaming ? "Agent planning" : STATE_LABEL[show.status]}
            </span>
            {show.version ? <span className="font-mono text-small text-muted-foreground">v{show.version}</span> : null}
          </div>
          <h1 className="mt-1 text-h1 font-semibold md:truncate" title={show.title}>
            {show.title}
          </h1>
          <p className="text-small text-muted-foreground">
            {i.venue} · {i.city} · {new Date(`${i.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · {i.mode === "sports" ? "gates" : "doors"} <span className="font-mono">{i.doorsTime}</span> · {i.capacityTier}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {show.plan && !streaming ? (
            <Button variant="ghost" onClick={start} disabled={starting} title="Run the agent again; rejected items are excluded">
              {starting ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />} Re-plan
            </Button>
          ) : null}
          <Button nativeButton={false} variant="ghost" size="icon" aria-label="Compare with another show" title="Compare with another show" render={<Link href={`/compare?a=${show.id}`} />}>
            <GitCompareArrows />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Keyboard shortcuts" title="Keyboard shortcuts" onClick={() => setHelpOpen(true)} className="hidden md:inline-flex">
            <Keyboard />
          </Button>
          <BriefingSheet show={show} onBriefing={(b) => setShow({ ...show, briefing: b })} />
          <ExportsMenu show={show} />
        </div>
      </div>
    </div>
  );

  const trace = <TracePane events={events} entities={show.entities} stream={streaming ? stream.state : "done"} highlightCallId={highlightCall} className="h-full" />;

  const center = (
    <div className="grid gap-6">
      {pendingEntities.length ? (
        <section aria-labelledby="confirm-title" className="grid gap-3">
          <div>
            <Kicker>Step 1 of 2 · Confirm with Qloo</Kicker>
            <h2 id="confirm-title" className="mt-1 text-h2 font-semibold">
              {pendingEntities.length} name{pendingEntities.length === 1 ? "" : "s"} need you
            </h2>
            <p className="text-small text-muted-foreground">Qloo returned more than one match or none. The agent never picks for you, and nothing downstream runs on an unconfirmed entity.</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {pendingEntities.map((e) => (
              <EntityConfirmCard
                key={`${e.key}-${e.input}`}
                entity={e}
                onConfirm={async (c) => {
                  try {
                    setShow(await api.confirm(show.id, e.key, c));
                  } catch (err) {
                    toast.error("Could not confirm", { description: (err as ApiError).message });
                  }
                }}
                onRefine={async (t) => {
                  try {
                    setShow(await api.refine(show.id, e.key, t));
                  } catch (err) {
                    toast.error("Search failed", { description: (err as ApiError).message });
                  }
                }}
                onSkip={
                  e.kind === "side"
                    ? undefined
                    : async () => {
                        setShow(await api.confirm(show.id, e.key, "skip"));
                      }
                }
              />
            ))}
          </div>
        </section>
      ) : null}
      {!show.plan && !streaming ? (
        <section className="grid gap-3 rounded-lg border bg-card p-4">
          <ResolvedStrip entities={show.entities} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Kicker>{pendingEntities.length ? "Step 2 of 2" : "Ready"}</Kicker>
              <p className="mt-1 max-w-[60ch] text-small text-muted-foreground">The Planner sends a CrowdReader, one Programmer per slot, SponsorFit and a Wildcard agent. Every Qloo call streams into the trace; the Critic removes anything without a citation.</p>
            </div>
            <Button size="lg" onClick={start} disabled={starting || show.status === "needs_confirmation"} title={show.status === "needs_confirmation" ? "Confirm every name first" : undefined}>
              {starting ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Play data-icon="inline-start" />} Build run-of-show
            </Button>
          </div>
        </section>
      ) : null}
      {stream.state === "reconnecting" ? (
        <Alert>
          <AlertTitle>Reconnecting to the agent…</AlertTitle>
          <AlertDescription>The plan keeps running on the server; the trace resumes where it left off.</AlertDescription>
        </Alert>
      ) : null}
      {show.plan?.headline && !streaming ? <p className="text-body-lg">{show.plan.headline}</p> : null}
      {streaming || show.plan ? <CrowdReadPanel crowd={crowd} streaming={streaming} /> : null}
      {slots.length ? (
        <section aria-labelledby="ros-title" className="grid gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="ros-title" className="text-h2 font-semibold">
              Run of show
            </h2>
            <span className="text-small text-muted-foreground">{items.length} picks · {items.filter((x) => x.isWildcard).length} stretch</span>
          </div>
          <div>
            {slots.map((s) => (
              <SlotLane key={s.key} slot={s} running={streaming} selectedId={selectedId} focusedId={focusedId} busy={busy} readOnly={!editable} onSelect={(it) => setSelectedId(it.id)} onAction={editable ? act : undefined} />
            ))}
          </div>
        </section>
      ) : null}
      {!streaming ? <LimitationsPanel show={show} /> : null}
    </div>
  );

  const right = selected ? (
    <EvidencePanel item={selected} slot={selectedSlot} showId={show.id} onClose={() => setSelectedId(undefined)} onTrace={showInTrace} />
  ) : show.plan && !streaming ? (
    <ApprovalQueue
      show={show}
      busy={busy}
      onAction={act}
      onSelect={(it) => setSelectedId(it.id)}
      locking={locking}
      onLock={async () => {
        setLocking(true);
        try {
          setShow(await api.lock(show.id));
          toast.success(`Plan v${show.version} locked`);
        } catch (e) {
          toast.error("Could not lock", { description: (e as ApiError).message });
        } finally {
          setLocking(false);
        }
      }}
      onUnlock={async () => setShow(await api.unlock(show.id))}
      onApproveConfident={async () => {
        try {
          const next = await api.approveConfident(show.id);
          setShow(next);
          toast.success("High-confidence picks approved", { description: "Stretch and reduced-confidence picks are still waiting for you." });
        } catch (e) {
          toast.error("Bulk approve failed", { description: (e as ApiError).message });
        }
      }}
    />
  ) : (
    <div className="grid gap-2 text-small text-muted-foreground">
      <Kicker>Evidence</Kicker>
      <p>{streaming ? "Picks arrive here as each slot is submitted. Select any pick to see the Qloo calls behind it." : "Select a pick to see its evidence."}</p>
    </div>
  );

  return (
    <>
      <TopBar />
      {header}
      {desktop ? (
        <main id="main" className="mx-auto grid h-[calc(100vh-8.5rem)] max-w-[1600px] grid-cols-[320px_1fr_400px] gap-0 xl:min-h-[640px]">
          <div className="min-h-0 border-r bg-card">{trace}</div>
          <div className="min-h-0 overflow-y-auto p-4">{center}</div>
          <aside className="min-h-0 overflow-y-auto border-l bg-card p-4" aria-label={selected ? "Evidence" : "Approval queue"}>
            {right}
          </aside>
        </main>
      ) : tablet ? (
        <main id="main" className="mx-auto max-w-[1600px] p-4">
          <div className="mb-3 flex gap-2">
            <Button variant="outline" onClick={() => setTraceOpen(true)}>
              <PanelLeft data-icon="inline-start" /> Trace · {events.filter((e) => e.type === "tool_call").length}
            </Button>
            {show.plan ? (
              <Button variant="outline" onClick={() => setSelectedId(undefined)} disabled={!selected}>
                <ListChecks data-icon="inline-start" /> Queue · {pendingCount}
              </Button>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
            {center}
            <aside className="hidden rounded-lg border bg-card p-4 lg:block">{right}</aside>
          </div>
          <Sheet open={Boolean(selected) && !large} onOpenChange={(o) => !o && setSelectedId(undefined)}>
            <SheetContent side="right" className="w-full overflow-y-auto p-4 sm:max-w-md">
              <SheetHeader className="sr-only">
                <SheetTitle>Evidence</SheetTitle>
              </SheetHeader>
              {selected ? <EvidencePanel item={selected} slot={selectedSlot} showId={show.id} onTrace={showInTrace} /> : null}
            </SheetContent>
          </Sheet>
        </main>
      ) : (
        <main id="main" className="overflow-x-hidden px-3 pb-16 pt-2">
          {events.filter((e) => e.type === "tool_call").slice(-1).map((e) =>
            e.type === "tool_call" ? (
              <p key={e.callId} className="mb-2 truncate rounded-md bg-muted px-2 py-1 font-mono text-label text-muted-foreground" aria-live="polite">
                latest: {e.tool} · {e.status}
              </p>
            ) : null,
          )}
          <Tabs defaultValue="plan" className="min-w-0">
            <TabsList className="sticky top-14 z-20 w-full">
              <TabsTrigger value="plan">
                <Rows3 /> Plan
              </TabsTrigger>
              <TabsTrigger value="trace">Trace</TabsTrigger>
              <TabsTrigger value="queue">Queue{pendingCount ? ` (${pendingCount})` : ""}</TabsTrigger>
            </TabsList>
            <TabsContent value="plan" className="min-w-0">{center}</TabsContent>
            <TabsContent value="trace" className="h-[70vh] rounded-lg border bg-card">
              {trace}
            </TabsContent>
            <TabsContent value="queue" className="min-w-0">{show.plan ? right : <p className="p-3 text-small text-muted-foreground">No plan yet.</p>}</TabsContent>
          </Tabs>
          <Sheet open={Boolean(selected)} onOpenChange={(o) => !o && setSelectedId(undefined)}>
            <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-xl p-4">
              <SheetHeader className="sr-only">
                <SheetTitle>Evidence</SheetTitle>
              </SheetHeader>
              {selected ? <EvidencePanel item={selected} slot={selectedSlot} showId={show.id} onTrace={showInTrace} /> : null}
            </SheetContent>
          </Sheet>
        </main>
      )}
      <Sheet open={traceOpen && !desktop} onOpenChange={setTraceOpen}>
        <SheetContent side="left" className="w-full p-0 sm:max-w-sm">
          <SheetHeader className="sr-only">
            <SheetTitle>Agent trace</SheetTitle>
          </SheetHeader>
          {trace}
        </SheetContent>
      </Sheet>
      <RejectDialog item={rejecting} open={Boolean(rejecting)} onOpenChange={(o) => !o && setRejecting(undefined)} onReject={doReject} />
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
          </DialogHeader>
          <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-small">
            {SHORTCUTS.map(([k, v]) => (
              <div key={k} className="contents">
                <dt>
                  <Kbd>{k}</Kbd>
                </dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </>
  );
}
