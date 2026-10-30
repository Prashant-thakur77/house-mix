"use client";

import { useState } from "react";
import { CircleHelp, Loader2, Pencil, SearchX } from "lucide-react";
import type { Entity } from "@housemix/shared";
import { cn } from "cn";
import { Kicker, StatusChip } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const KIND_LABEL: Record<Entity["kind"], string> = { side: "On the bill", venue: "Venue", city: "City", tag: "Vibe tag", local_act: "Local act", sponsor: "Exclusive sponsor" };

export function EntityConfirmCard({
  entity,
  onConfirm,
  onRefine,
  onSkip,
}: {
  entity: Entity;
  onConfirm: (choice: string) => Promise<void>;
  onRefine: (text: string) => Promise<void>;
  onSkip?: () => Promise<void>;
}) {
  const [choice, setChoice] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [refine, setRefine] = useState(entity.status === "not_found" ? entity.input : "");
  const [editing, setEditing] = useState(entity.status === "not_found" || entity.status === "error");
  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    try {
      await f();
    } finally {
      setBusy(false);
    }
  };
  const needs = entity.status === "needs_confirmation";
  // Qloo sometimes returns several same-name candidates with nothing to tell them apart (cities often
  // have no location details). Then the card says so and marks the most popular one; it still never picks.
  const lookAlike = needs && entity.candidates.length > 1 && entity.candidates.every((c) => !c.disambiguation && c.name.toLowerCase() === entity.candidates[0]!.name.toLowerCase());
  const mostPopular = lookAlike ? [...entity.candidates].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))[0]?.qlooId : undefined;
  return (
    <article className="rounded-lg border border-status-needs-input/40 bg-card p-3" aria-labelledby={`ent-${entity.key}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Kicker>{KIND_LABEL[entity.kind]}</Kicker>
        <StatusChip status={needs ? "needs_input" : entity.status === "error" ? "error" : "empty"} />
      </div>
      <h3 id={`ent-${entity.key}`} className="mt-1 flex items-center gap-2 text-h3 font-semibold">
        {needs ? <CircleHelp className="size-4 text-status-needs-input" aria-hidden /> : <SearchX className="size-4 text-muted-foreground" aria-hidden />}
        {needs ? `Which “${entity.input}”?` : `No Qloo match for “${entity.input}”`}
      </h3>
      <p className="mt-0.5 text-small text-muted-foreground">{entity.summary ?? (needs ? "Qloo found more than one match. Pick the one you mean; nothing runs until you do." : "")}</p>
      {lookAlike ? (
        <p className="mt-1 text-small text-muted-foreground">
          Qloo gives no details that tell these apart. The most popular is usually the one people mean; if you are not sure, skip it and the name is still used as plain text.
        </p>
      ) : null}
      {needs ? (
        <fieldset className="mt-2 grid min-w-0 gap-1.5">
          <legend className="sr-only">Candidates for {entity.input}</legend>
          {entity.candidates.map((c) => (
            <label
              key={c.qlooId}
              className={cn("flex min-w-0 cursor-pointer items-start gap-2.5 rounded-md border px-2.5 py-2 hover:bg-muted", choice === c.qlooId && "border-primary bg-accent text-accent-foreground")}
            >
              <input type="radio" name={`cand-${entity.key}`} value={c.qlooId} checked={choice === c.qlooId} onChange={() => setChoice(c.qlooId)} className="mt-1 accent-[var(--primary)]" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-medium">
                  {c.name}
                  {c.qlooId === mostPopular ? <span className="whitespace-nowrap rounded-sm bg-muted px-1.5 py-0.5 text-label font-normal text-muted-foreground">most popular in Qloo</span> : null}
                </span>
                <span className="line-clamp-2 text-small text-muted-foreground" title={[c.type, c.disambiguation].filter(Boolean).join(" · ")}>
                  {[c.type, c.disambiguation].filter(Boolean).join(" · ")}
                </span>
              </span>
              {c.popularity !== undefined ? (
                <span className="font-mono text-small text-muted-foreground" title="Qloo popularity">
                  {c.popularity.toFixed(2)}
                </span>
              ) : null}
            </label>
          ))}
        </fieldset>
      ) : null}
      {editing ? (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (refine.trim()) void run(() => onRefine(refine));
          }}
        >
          <Input value={refine} onChange={(e) => setRefine(e.target.value)} aria-label={`Refine ${entity.input}`} placeholder="Try the full or official name" />
          <Button type="submit" variant="outline" disabled={busy || !refine.trim()}>
            Search again
          </Button>
        </form>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {needs ? (
          <Button disabled={!choice || busy} onClick={() => choice && void run(() => onConfirm(choice))}>
            {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            Confirm
          </Button>
        ) : null}
        {!editing ? (
          <Button variant="ghost" onClick={() => setEditing(true)}>
            <Pencil data-icon="inline-start" /> None of these, refine
          </Button>
        ) : null}
        {onSkip ? (
          <Button variant="ghost" className="text-muted-foreground" disabled={busy} onClick={() => void run(onSkip)}>
            Skip this {entity.kind === "tag" ? "tag" : "one"}
          </Button>
        ) : null}
      </div>
    </article>
  );
}

export function ResolvedStrip({ entities }: { entities: Entity[] }) {
  const resolved = entities.filter((e) => e.status === "resolved");
  if (!resolved.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Resolved with Qloo">
      <Kicker className="mr-1">Resolved with Qloo</Kicker>
      {resolved.map((e) => (
        <span key={e.key} className="inline-flex max-w-[16rem] items-center gap-1 rounded-md border px-2 py-0.5 text-small" title={`${e.input} → ${e.name} (${e.qlooId})`}>
          <span className="size-1.5 shrink-0 rounded-full bg-status-ok" aria-hidden />
          <span className="truncate">{e.name}</span>
          <span className="shrink-0 text-label text-muted-foreground">{KIND_LABEL[e.kind]}</span>
        </span>
      ))}
    </div>
  );
}
