"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Circle, Loader2 } from "lucide-react";
import type { Show } from "@housemix/shared";
import { cn } from "cn";
import { api } from "@/lib/api";
import { Kicker } from "@/components/status";
import { Button } from "@/components/ui/button";

/**
 * Get the night ready: every step from a confirmed bill to doors, with what's left and the one action that moves it on.
 * It reads the show itself (plus, for outreach, which partners this browser has contacted), so it is never out of date.
 */

export const contactedKey = (id: string) => `hm-outreach-${id}`;

export function readContacted(id: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(contactedKey(id)) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function markContacted(id: string, itemId: string) {
  try {
    const all = new Set(readContacted(id));
    all.add(itemId);
    localStorage.setItem(contactedKey(id), JSON.stringify([...all]));
    window.dispatchEvent(new Event("hm-outreach"));
  } catch {
    // Storage blocked: the step just stays open.
  }
}

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

export function Readiness({ show, onShow }: { show: Show; onShow: (s: Show) => void }) {
  const [contacted, setContacted] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const read = () => setContacted(readContacted(show.id));
    read();
    window.addEventListener("hm-outreach", read);
    return () => window.removeEventListener("hm-outreach", read);
  }, [show.id]);
  if (!show.plan) return null;
  const live = show.plan.slots.flatMap((s) => s.items).filter((i) => i.approval.state !== "swapped" && i.approval.state !== "rejected");
  const pending = live.filter((i) => i.approval.state === "pending").length;
  const partners = show.plan.slots.filter((s) => s.kind !== "music").flatMap((s) => s.items.filter((i) => i.approval.state !== "swapped" && i.approval.state !== "rejected"));
  const reached = partners.filter((p) => contacted.includes(p.id)).length;
  const hasArtists = live.some((i) => i.pick.type === "artist");
  const steps: { label: string; done: boolean; detail: string; action?: React.ReactNode }[] = [
    { label: "Names confirmed with Qloo", done: true, detail: `${show.entities.filter((e) => e.status === "resolved").length} confirmed` },
    { label: "Night planned", done: true, detail: `${live.length} picks, every one cited` },
    {
      label: "Picks approved",
      done: pending === 0,
      detail: pending ? `${pending} waiting for you` : "all decided",
      action: pending ? (
        <Button
          size="sm"
          variant="outline"
          disabled={busy || Boolean(show.lockedAt)}
          onClick={async () => {
            setBusy(true);
            try {
              onShow(await api.approveConfident(show.id));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null} Approve the confident ones
        </Button>
      ) : null,
    },
    ...(hasArtists
      ? [
          {
            label: "Music ready",
            done: Boolean(show.music?.playlists.length),
            detail: show.music ? `${show.music.playlists.reduce((n, p) => n + p.entries.length, 0)} songs in ${show.music.playlists.length} playlists` : "find the songs",
            action: (
              <Button size="sm" variant="ghost" onClick={() => scrollTo("hear-title")}>
                {show.music ? "Hear and export" : "Find the songs"}
              </Button>
            ),
          },
        ]
      : []),
    {
      label: "Partners contacted",
      done: partners.length > 0 && reached >= partners.length,
      detail: `${reached} of ${partners.length} messaged from this browser`,
      action: <span className="text-label text-muted-foreground">Outreach, top right</span>,
    },
    {
      label: "Crew briefed",
      done: Boolean(show.briefing),
      detail: show.briefing ? "briefing ready" : "make the 90-second briefing",
      action: <span className="text-label text-muted-foreground">Briefing, top right</span>,
    },
    { label: "Plan locked", done: Boolean(show.lockedAt), detail: show.lockedAt ? `v${show.version}, ${new Date(show.lockedAt).toLocaleString()}` : "lock it when it's final" },
  ];
  const done = steps.filter((s) => s.done).length;
  return (
    <section aria-labelledby="ready-title" className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <Kicker>Get the night ready</Kicker>
          <h2 id="ready-title" className="mt-1 text-h2 font-semibold">
            {done} of {steps.length} done
          </h2>
        </div>
        <Button nativeButton={false} size="sm" render={<Link href={`/shows/${show.id}/live`} />}>
          Run the night
        </Button>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded bg-muted" aria-hidden>
        <div className="h-full bg-status-ok transition-[width]" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {steps.map((s) => (
          <li key={s.label} className={cn("flex items-center gap-2 rounded-md border px-2.5 py-1.5", s.done && "border-status-ok/30")}>
            {s.done ? <Check className="size-4 shrink-0 text-status-ok" aria-label="Done" /> : <Circle className="size-4 shrink-0 text-muted-foreground" aria-label="To do" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-small font-medium">{s.label}</span>
              <span className="block truncate text-label text-muted-foreground">{s.detail}</span>
            </span>
            {!s.done ? s.action : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
