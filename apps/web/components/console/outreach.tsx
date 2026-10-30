"use client";

import { useMemo, useState } from "react";
import { Check, Copy, FileText, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import type { PlanItem, Show, Slot } from "@housemix/shared";
import { sponsorUrl } from "@/lib/api";
import { Kicker } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { markContacted } from "@/components/console/readiness";

/**
 * The outreach pack: for every partner the night needs (a sponsor, a food stall, an act to book, a local spot), a
 * message built from the plan's own evidence, ready to send from the operator's email. House Mix never sends anything.
 */

const ASK: Record<Slot["kind"], string> = {
  brand: "Would you like to run this with us? A one-pager with the evidence is attached.",
  food: "Would you be up for a stall or partner menu on the night? Happy to talk numbers and space.",
  act: "Would you be available, and what would a short set cost?",
  local: "We'd like to point our guests to you before and after the show. Would you like to set anything up for them?",
  music: "",
  split: "Would you like to be part of the night?",
};

/** What Qloo says about the pick, in one plain sentence for a stranger. */
function evidenceLine(item: PlanItem): string {
  const rank = item.evidence.find((e) => e.tool === "qloo_rank")?.scores;
  const explained = /explained by ([^,.]+(?: and [^,.]+)?)/.exec(item.qlooSays)?.[1]?.replace(/ \(\d\.\d+\)/g, "");
  const parts = [];
  if (rank?.rank !== undefined && rank.of !== undefined) parts.push(`ranks you #${rank.rank} of ${rank.of} for the crowd that's coming`);
  if (explained) parts.push(`driven by fans of ${explained}`);
  if (item.fitScore !== undefined) parts.push(`with an audience similarity of ${item.fitScore}/100`);
  return parts.length ? `Qloo's taste data ${parts.join(", ")}.` : "Qloo's taste data puts you among the best fits for the crowd that's coming.";
}

export function message(show: Show, slot: Slot, item: PlanItem): { subject: string; body: string } {
  const i = show.input;
  const share = typeof window !== "undefined" ? `${window.location.origin}/shows/${show.id}/share?k=${show.shareId}` : "";
  const subject = `${show.title} · ${i.venue}, ${i.date}: ${item.pick.name} for tonight's crowd`;
  const body = [
    `Hi ${item.pick.name} team,`,
    "",
    `We're programming ${show.title} at ${i.venue}, ${i.city} on ${i.date} (doors ${i.doorsTime}). ${evidenceLine(item)}`,
    "",
    item.action ? `What we have in mind: ${item.action}` : `We'd love you in our ${slot.label.toLowerCase()}.`,
    "",
    ASK[slot.kind],
    "",
    "Thanks,",
    "",
    `The plan, with the evidence behind every pick: ${share}`,
  ].join("\n");
  return { subject, body };
}

export function OutreachSheet({ show }: { show: Show }) {
  const [copied, setCopied] = useState<string>();
  const partners = useMemo(
    () =>
      (show.plan?.slots ?? [])
        .filter((s) => s.kind !== "music")
        .flatMap((slot) => slot.items.filter((it) => it.approval.state !== "swapped" && it.approval.state !== "rejected").map((item) => ({ slot, item })))
        // Approved partners first: those are the ones to contact now.
        .sort((a, b) => Number(b.item.approval.state === "approved") - Number(a.item.approval.state === "approved")),
    [show],
  );
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" title="A ready-to-send message for every partner the night needs" />}>
        <Send data-icon="inline-start" /> Outreach
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b p-4">
          <SheetTitle>Outreach pack</SheetTitle>
          <SheetDescription>
            A message for every sponsor, stall, act and local spot in the plan, written from its Qloo evidence. It opens in your own email; House Mix never sends anything. Approved partners are listed
            first.
          </SheetDescription>
        </SheetHeader>
        <div className="grid flex-1 content-start gap-3 overflow-y-auto p-4">
          {partners.map(({ slot, item }) => {
            const { subject, body } = message(show, slot, item);
            const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            return (
              <article key={item.id} className="rounded-lg border p-3" aria-label={`Message to ${item.pick.name}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Kicker>{slot.label}</Kicker>
                    <h3 className="truncate font-semibold">{item.pick.name}</h3>
                  </div>
                  <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-label capitalize text-muted-foreground">{item.approval.state}</span>
                </div>
                <p className="mt-2 line-clamp-4 whitespace-pre-line text-small text-muted-foreground">{body.split("\n").slice(2, 5).join("\n")}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button nativeButton={false} size="sm" variant="outline" render={<a href={mailto} onClick={() => markContacted(show.id, item.id)} />}>
                    <Mail data-icon="inline-start" /> Open in email
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(`${subject}\n\n${body}`);
                      } catch {
                        // Clipboard blocked (permissions, insecure origin): the email button still works.
                        toast.error("Couldn't copy here. Use Open in email instead.");
                        return;
                      }
                      markContacted(show.id, item.id);
                      setCopied(item.id);
                      toast.success("Message copied");
                    }}
                  >
                    {copied === item.id ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />} Copy
                  </Button>
                  {slot.kind === "brand" ? (
                    <Button nativeButton={false} size="sm" variant="ghost" render={<a href={sponsorUrl(show.id, item.id)} download />}>
                      <FileText data-icon="inline-start" /> One-pager
                    </Button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
