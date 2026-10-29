"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Bot, ChevronRight, Gavel, MessageSquareText, Search, TriangleAlert } from "lucide-react";
import type { Entity, QlooStatus, RunEvent } from "@housemix/shared";
import { cn } from "cn";
import { StatusChip } from "@/components/status";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import type { StreamState } from "@/lib/hooks";

type ToolEvent = Extract<RunEvent, { type: "tool_call" }>;

const PHASE_OF: Record<string, string> = {
  resolver: "Resolve",
  crowd_reader: "Crowd read",
  programmer: "Programme",
  sponsor_fit: "Programme",
  wildcard: "Wildcard",
  planner: "Plan",
  swap: "Approvals",
  compare: "Compare",
};
const PHASES = ["Resolve", "Crowd read", "Programme", "Wildcard", "Critic", "Plan", "Approvals"];

const AGENT_LABEL: Record<string, string> = {
  crowd_reader: "CrowdReader",
  programmer: "Programmer",
  sponsor_fit: "SponsorFit",
  wildcard: "Wildcard",
  planner: "Planner",
  resolver: "Resolver",
};

function short(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(short).join(", ")}]`;
  if (typeof v === "string") return /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(v) ? `${v.slice(0, 8)}…` : v;
  return JSON.stringify(v);
}

export function TraceRow({ e, highlight }: { e: ToolEvent; highlight?: boolean }) {
  return (
    <Collapsible>
      <CollapsibleTrigger
        className={cn(
          "group flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-small hover:bg-muted animate-arrive",
          highlight && "bg-accent text-accent-foreground",
        )}
        data-call-id={e.callId}
      >
        <StatusChip status={e.status} compact />
        <span className="truncate font-mono">{e.tool}</span>
        <span className="hidden truncate text-muted-foreground xl:inline">{AGENT_LABEL[e.agent] ?? e.agent}</span>
        <span className="ml-auto shrink-0 font-mono tabular text-subtle-foreground">
          {e.cached ? "cache" : `${e.durationMs}ms`}
          {e.attempts > 1 ? ` ·${e.attempts}×` : ""}
        </span>
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-90" aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mx-2 mb-2 rounded-md border bg-muted/50 p-2 text-small">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono">
            {Object.entries(e.args).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="break-all">{short(v)}</dd>
              </div>
            ))}
            <dt className="text-muted-foreground">results</dt>
            <dd>{e.resultCount}</dd>
            <dt className="text-muted-foreground">call</dt>
            <dd>{e.callId}</dd>
          </dl>
          {e.summary ? <p className="mt-1.5 text-muted-foreground">{e.summary}</p> : null}
          {e.attempts > 1 ? <p className="mt-1.5 text-status-partial">Retried {e.attempts - 1}× because Qloo marked the error retryable.</p> : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Resolution calls happen at intake; they are shown from the entity records. */
function resolveRows(entities: Entity[]) {
  return entities
    .filter((e) => e.callId)
    .map((e) => ({
      key: e.key,
      tool: e.kind === "tag" ? "qloo_find_tags" : "qloo_describe",
      status: (e.status === "resolved" ? "ok" : e.status === "needs_confirmation" ? "needs_input" : e.status === "not_found" ? "empty" : "error") as QlooStatus,
      label: e.input,
      note: e.status === "needs_confirmation" ? "Waiting for you" : e.status === "resolved" ? (e.summary === "Confirmed by the operator." ? "Confirmed by you" : e.name) : e.summary,
    }));
}

export function TracePane({ events, entities, stream, highlightCallId, className }: { events: RunEvent[]; entities: Entity[]; stream: StreamState; highlightCallId?: string; className?: string }) {
  const [filter, setFilter] = useState<QlooStatus | "all">("all");
  const [q, setQ] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const tools = events.filter((e): e is ToolEvent => e.type === "tool_call");
  const resolves = resolveRows(entities);
  const counts = useMemo(() => {
    const c: Partial<Record<QlooStatus, number>> = {};
    for (const t of tools) c[t.status] = (c[t.status] ?? 0) + 1;
    for (const r of resolves) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [tools, resolves]);

  const visible = events.filter((e) => {
    if (e.type === "tool_call") return (filter === "all" || e.status === filter) && (!q || e.tool.includes(q) || JSON.stringify(e.args).toLowerCase().includes(q.toLowerCase()));
    return filter === "all" && !q && (e.type === "agent" || e.type === "critic" || e.type === "thought" || e.type === "error");
  });

  const grouped = new Map<string, RunEvent[]>();
  for (const e of visible) {
    const phase = e.type === "critic" ? "Critic" : e.type === "tool_call" || e.type === "agent" || e.type === "thought" ? (PHASE_OF[e.agent] ?? "Plan") : "Plan";
    grouped.set(phase, [...(grouped.get(phase) ?? []), e]);
  }

  // Keep pinned to the bottom while the user is there; otherwise count new rows.
  const lastLen = useRef(visible.length);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (visible.length > lastLen.current) {
      if (atBottom) el.scrollTop = el.scrollHeight;
      else setUnseen((n) => n + visible.length - lastLen.current);
    }
    lastLen.current = visible.length;
  }, [visible.length, atBottom]);

  const [announce, setAnnounce] = useState("");
  const lastAnnounce = useRef(0);
  useEffect(() => {
    const last = tools[tools.length - 1];
    if (!last || Date.now() - lastAnnounce.current < 2000) return;
    lastAnnounce.current = Date.now();
    setAnnounce(`${last.tool} ${last.status.replace("_", " ")}, ${last.resultCount} results`);
  }, [tools.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalMs = tools.reduce((s, t) => s + t.durationMs, 0);
  const statuses: QlooStatus[] = ["ok", "needs_input", "partial", "degraded", "empty", "error"];

  return (
    <section className={cn("flex min-h-0 flex-col", className)} aria-labelledby="trace-title">
      <div className="border-b p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="trace-title" className="text-label font-medium uppercase text-muted-foreground">
            Agent trace
          </h2>
          <span className="flex items-center gap-1.5 text-small text-muted-foreground">
            {stream === "live" || stream === "connecting" ? (
              <>
                <span className="size-1.5 rounded-full bg-signal animate-live" aria-hidden /> Live
              </>
            ) : stream === "reconnecting" ? (
              <span className="text-status-partial">Reconnecting…</span>
            ) : (
              `${tools.length + resolves.length} calls`
            )}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Filter by status">
          <button type="button" onClick={() => setFilter("all")} aria-pressed={filter === "all"} className={cn("h-6 rounded-md border px-1.5 text-label", filter === "all" ? "border-primary bg-accent text-accent-foreground" : "text-muted-foreground")}>
            all
          </button>
          {statuses
            .filter((s) => counts[s])
            .map((s) => (
              <button key={s} type="button" onClick={() => setFilter(filter === s ? "all" : s)} aria-pressed={filter === s} className={cn("rounded-md", filter === s && "ring-2 ring-ring")}>
                <StatusChip status={s} className="cursor-pointer" />
                <span className="sr-only">{counts[s]} calls</span>
                <span className="ml-0.5 font-mono text-label text-muted-foreground" aria-hidden>
                  {counts[s]}
                </span>
              </button>
            ))}
        </div>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by tool or ID" aria-label="Filter trace" className="h-7 pl-7 text-small" />
        </div>
      </div>
      <div
        ref={listRef}
        role="log"
        aria-label="Qloo tool calls"
        className="relative min-h-0 flex-1 overflow-y-auto p-2"
        onScroll={(e) => {
          const el = e.currentTarget;
          const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          setAtBottom(bottom);
          if (bottom) setUnseen(0);
        }}
      >
        <span className="sr-only" aria-live="polite">
          {announce}
        </span>
        {resolves.length && filter === "all" && !q ? (
          <div>
            <div className="sticky top-0 z-10 bg-card/95 px-2 py-1 text-label font-medium uppercase text-muted-foreground backdrop-blur">Resolve</div>
            {resolves.map((r) => (
              <div key={r.key} className="flex h-8 items-center gap-2 rounded-md px-2 text-small">
                <StatusChip status={r.status} compact />
                <span className="font-mono">{r.tool}</span>
                <span className="truncate text-muted-foreground" title={r.label}>
                  “{r.label}”
                </span>
                <span className={cn("ml-auto max-w-[45%] shrink-0 truncate text-subtle-foreground", r.status === "needs_input" && "font-medium text-status-needs-input")} title={r.note}>
                  {r.note}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        {PHASES.filter((p) => grouped.has(p)).map((phase) => (
          <div key={phase}>
            <div className="sticky top-0 z-10 bg-card/95 px-2 py-1 text-label font-medium uppercase text-muted-foreground backdrop-blur">{phase}</div>
            {grouped.get(phase)!.map((e, i) => {
              if (e.type === "tool_call") return <TraceRow key={e.callId} e={e} highlight={e.callId === highlightCallId} />;
              if (e.type === "agent")
                return (
                  <div key={`a${i}${e.at}`} className="flex h-7 items-center gap-2 px-2 text-small text-muted-foreground animate-arrive">
                    <Bot className="size-3.5" aria-hidden />
                    {AGENT_LABEL[e.agent] ?? e.agent} {e.phase === "start" ? "started" : "finished"}
                  </div>
                );
              if (e.type === "critic")
                return (
                  <div key={`c${i}${e.at}`} className="flex items-start gap-2 rounded-md px-2 py-1.5 text-small animate-arrive">
                    <Gavel className="mt-0.5 size-3.5 shrink-0 text-status-degraded" aria-hidden />
                    <span>
                      <span className="font-medium">Critic removed</span> <span className="font-mono text-muted-foreground">{e.pick.length > 24 ? `${e.pick.slice(0, 8)}…` : e.pick}</span>
                      <span className="block text-muted-foreground">{e.reason}</span>
                    </span>
                  </div>
                );
              if (e.type === "thought")
                return (
                  <div key={`t${i}${e.at}`} className="flex items-start gap-2 px-2 py-1 text-small text-muted-foreground animate-arrive">
                    <MessageSquareText className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span className="line-clamp-3">{e.text}</span>
                  </div>
                );
              if (e.type === "error")
                return (
                  <div key={`e${i}${e.at}`} className="flex items-start gap-2 rounded-md bg-status-error-bg px-2 py-1.5 text-small text-status-error">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    {e.message}
                  </div>
                );
              return null;
            })}
          </div>
        ))}
        {!tools.length && !resolves.length ? <p className="p-3 text-small text-muted-foreground">Agent idle. Start a plan to see every Qloo call here.</p> : null}
      </div>
      {unseen > 0 ? (
        <button
          type="button"
          onClick={() => {
            listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
            setUnseen(0);
          }}
          className="mx-auto -mt-10 mb-2 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-small font-medium text-primary-foreground shadow-2"
        >
          <ArrowDown className="size-3.5" aria-hidden /> {unseen} new · Jump to latest
        </button>
      ) : null}
      <div className="flex items-center justify-between border-t px-3 py-2 font-mono text-small text-muted-foreground">
        <span>{tools.length + resolves.length} calls</span>
        <span>{(totalMs / 1000).toFixed(1)}s Qloo time</span>
      </div>
    </section>
  );
}
