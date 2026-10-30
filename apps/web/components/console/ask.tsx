"use client";

import { useRef, useState } from "react";
import { CornerDownLeft, Loader2, MessageSquareText, Plus, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import type { AskAnswer, Evidence, Show } from "@housemix/shared";
import { cn } from "cn";
import { Kicker, StatusChip } from "@/components/status";
import { EvidenceCall } from "@/components/console/evidence";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { api, ApiError, askStream, type AskStreamEvent } from "@/lib/api";

function suggestions(show: Show): string[] {
  const side = (role: string) => show.entities.find((e) => e.kind === "side" && e.role === role)?.name;
  switch (show.input.mode) {
    case "concert":
      return [
        `If ${side("support") ?? "the support act"} cancels, who best fills the opener slot?`,
        "Which merch partner fits both fan bases best?",
        "Is anything in the walk-in playlist rising right now?",
      ];
    case "comedy":
      return [
        `Which bar nearby suits ${side("support") ?? "the opener"}'s fans as well as ${side("headliner") ?? "the headliner"}'s?`,
        "Which podcast should we promote in the interval?",
        "What is this crowd's strongest shared taste?",
      ];
    case "sports":
      return [
        `Which walk-in tracks work for both ${side("home") ?? "home"} and ${side("away") ?? "away"} fans?`,
        "Which pub suits the away fans for a pre-match crowd?",
        "Which sponsor activation fits the home crowd best?",
      ];
    default:
      return ["Who should close the second stage for this crowd?", "Which food trader suits both stages' crowds?", "Which act on the bill has the most momentum?"];
  }
}

type Live = { question: string; steps: AskStreamEvent[] };

function Citation({ n, e, open, onToggle }: { n: number; e?: Evidence; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        "ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-sm px-1 align-text-top font-mono text-[10px] leading-none",
        open ? "bg-qloo text-background" : "bg-qloo-bg text-qloo hover:bg-qloo-border/30",
      )}
      title={e ? `${e.tool} · ${e.status}` : "Qloo call"}
    >
      {n}
      <span className="sr-only"> (Qloo evidence {e?.tool ?? ""})</span>
    </button>
  );
}

function AnswerCard({ show, answer, onShow }: { show: Show; answer: AskAnswer; onShow: (s: Show) => void }) {
  const [openCall, setOpenCall] = useState<string>();
  const [adding, setAdding] = useState<string>();
  const evidence = new Map<string, Evidence>();
  for (const c of answer.calls) evidence.set(c.callId, c);
  for (const s of show.plan?.slots ?? []) for (const i of s.items) for (const e of i.evidence) if (!evidence.has(e.callId)) evidence.set(e.callId, e);
  for (const e of show.plan?.crowd.evidence ?? []) if (!evidence.has(e.callId)) evidence.set(e.callId, e);
  const order = [...new Set(answer.lines.flatMap((l) => l.callIds))];
  const stale = answer.planVersion !== show.version;
  const newCalls = answer.calls.filter((c) => !show.plan?.slots.some((s) => s.items.some((i) => i.evidence.some((e) => e.callId === c.callId))));
  const slotLabel = (k: string) => show.plan?.slots.find((s) => s.key === k)?.label ?? k;

  return (
    <article className="grid gap-2 rounded-lg border bg-card p-3" aria-label={`Answer to: ${answer.question}`}>
      <p className="text-small font-medium">{answer.question}</p>
      <div className="border-l-3 border-interp-border bg-interp-bg/60 py-1.5 pl-3 pr-2">
        <div className="text-label font-medium uppercase text-interp">House Mix, from Qloo</div>
        {answer.lines.length ? (
          <ul className="mt-1 grid gap-1 text-small">
            {answer.lines.map((l) => (
              <li key={l.text}>
                {l.text}
                {l.callIds.map((id) => (
                  <Citation key={id} n={order.indexOf(id) + 1} e={evidence.get(id)} open={openCall === id} onToggle={() => setOpenCall(openCall === id ? undefined : id)} />
                ))}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-small text-muted-foreground">Nothing in the answer survived the Critic.</p>
        )}
      </div>
      {openCall ? (
        evidence.get(openCall) ? (
          <EvidenceCall e={evidence.get(openCall)!} />
        ) : (
          <p className="font-mono text-label text-muted-foreground">{openCall}: Qloo call from the plan run (see the trace).</p>
        )
      ) : null}
      {answer.proposals.length ? (
        <div className="grid gap-1.5">
          <Kicker>Proposed changes · you decide</Kicker>
          {answer.proposals.map((p) => (
            <div key={p.id} className="grid gap-1 rounded-md border p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-small font-medium">{p.item.pick.name}</span>
                <span className="text-label text-muted-foreground">→ {slotLabel(p.slotKey)}</span>
                <Button
                  size="sm"
                  variant={p.state === "added" ? "ghost" : "outline"}
                  className="ml-auto"
                  disabled={p.state === "added" || stale || Boolean(show.lockedAt) || adding === p.id}
                  title={stale ? "Made for an earlier plan version" : show.lockedAt ? "The plan is locked" : undefined}
                  onClick={async () => {
                    setAdding(p.id);
                    try {
                      onShow(await api.addProposal(show.id, answer.id, p.id));
                      toast.success(`${p.item.pick.name} added to the queue`, { description: `Pending in ${slotLabel(p.slotKey)}. Approve, swap or reject it like any pick.` });
                    } catch (e) {
                      toast.error("Could not add it", { description: (e as ApiError).message });
                    } finally {
                      setAdding(undefined);
                    }
                  }}
                >
                  {adding === p.id ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
                  {p.state === "added" ? "In the queue" : "Add to queue"}
                </Button>
              </div>
              <p className="font-mono text-label text-qloo">{p.item.qlooSays}</p>
              <p className="text-small">{p.item.interpretation}</p>
            </div>
          ))}
        </div>
      ) : null}
      {answer.dropped.length ? (
        <details className="text-small">
          <summary className="flex cursor-pointer items-center gap-1.5 text-muted-foreground hover:text-foreground">
            <ShieldAlert className="size-3.5" aria-hidden /> Removed by the Critic ({answer.dropped.length})
          </summary>
          <ul className="mt-1 grid gap-1 pl-5">
            {answer.dropped.map((d) => (
              <li key={d.text}>
                <span className="line-through decoration-muted-foreground/60">{d.text}</span> <span className="text-muted-foreground">: {d.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <p className="text-label text-muted-foreground">
        {newCalls.length} new Qloo call{newCalls.length === 1 ? "" : "s"} · {answer.lines.reduce((n, l) => n + l.callIds.length, 0)} citations · ${answer.costUsd.toFixed(3)}
        {stale ? ` · asked about plan v${answer.planVersion}` : ""}
      </p>
    </article>
  );
}

export function AskSheet({ show, onShow }: { show: Show; onShow: (s: Show) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [live, setLive] = useState<Live>();
  const abort = useRef<AbortController | null>(null);
  const busy = Boolean(live);

  const ask = async (question: string) => {
    const text = question.trim();
    if (text.length < 3 || busy) return;
    const ctl = new AbortController();
    abort.current = ctl;
    setLive({ question: text, steps: [] });
    try {
      const answer = await askStream(show.id, text, (e) => setLive((l) => (l ? { ...l, steps: [...l.steps, e] } : l)), ctl.signal);
      onShow({ ...show, asks: [answer, ...show.asks.filter((a) => a.id !== answer.id)].slice(0, 10) });
      setQ("");
    } catch (e) {
      if (!ctl.signal.aborted) toast.error("No answer", { description: (e as ApiError).message });
    } finally {
      setLive(undefined);
      abort.current = null;
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" disabled={!show.plan} title={show.plan ? "Ask a question answered from Qloo" : "Plan the show first"} />}>
        <MessageSquareText data-icon="inline-start" /> Ask
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b p-4">
          <SheetTitle>Ask House Mix</SheetTitle>
          <SheetDescription>
            Answers come only from Qloo: the plan&apos;s calls plus new ones made for your question. Every line cites its calls and the Critic removes the rest. Suggested changes go to your approval
            queue, never straight into the plan.
          </SheetDescription>
        </SheetHeader>
        <div className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto p-4">
          {live ? (
            <div className="grid gap-2 rounded-lg border border-signal/40 bg-card p-3" aria-live="polite">
              <p className="text-small font-medium">{live.question}</p>
              <ul className="grid gap-1">
                {live.steps.map((s, i) =>
                  s.type === "tool" ? (
                    <li key={s.callId} className="flex items-center gap-2 font-mono text-label">
                      <span className="truncate">{s.tool}</span>
                      <StatusChip status={s.status as Evidence["status"]} />
                      <span className="ml-auto text-muted-foreground">{s.cached ? "cached" : `${s.resultCount} results`}</span>
                    </li>
                  ) : s.type === "status" ? (
                    <li key={`s${i}`} className="text-label text-muted-foreground">
                      {s.text}…
                    </li>
                  ) : null,
                )}
                <li className="flex items-center gap-2 text-label text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" aria-hidden /> working
                </li>
              </ul>
            </div>
          ) : null}
          {show.asks.length === 0 && !live ? (
            <div className="grid gap-2">
              <Kicker>Try</Kicker>
              {suggestions(show).map((s) => (
                <button key={s} type="button" onClick={() => void ask(s)} className="rounded-md border px-3 py-2 text-left text-small hover:bg-muted">
                  {s}
                </button>
              ))}
            </div>
          ) : null}
          {show.asks.map((a) => (
            <AnswerCard key={a.id} show={show} answer={a} onShow={onShow} />
          ))}
        </div>
        <form
          className="grid gap-2 border-t p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(q);
          }}
        >
          <label htmlFor="ask-q" className="sr-only">
            Your question
          </label>
          <Textarea
            id="ask-q"
            value={q}
            maxLength={400}
            rows={2}
            placeholder="e.g. Which food vendor suits the away fans better?"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(q);
              }
            }}
            disabled={busy}
          />
          <div className="flex items-center gap-2">
            <span className="text-label text-muted-foreground">Aggregate taste only. No personal data, no eligibility decisions.</span>
            {busy ? (
              <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => abort.current?.abort()}>
                Stop
              </Button>
            ) : (
              <Button type="submit" size="sm" className="ml-auto" disabled={q.trim().length < 3}>
                <CornerDownLeft data-icon="inline-start" /> Ask
              </Button>
            )}
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
