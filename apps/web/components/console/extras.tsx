"use client";

import { ChevronDown, Download, FileSpreadsheet, FileText, Link2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { Show } from "@housemix/shared";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { exportUrl, sponsorUrl } from "@/lib/api";

export function LimitationsPanel({ show }: { show: Show }) {
  const plan = show.plan;
  if (!plan) return null;
  const flagged = plan.limitations.length > 6;
  return (
    <Collapsible defaultOpen={flagged} className="rounded-lg border bg-card">
      <CollapsibleTrigger className="group flex w-full items-center gap-2 px-3 py-2.5 text-left">
        <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
        <span className="font-medium">Limitations: what these results do not establish</span>
        <span className="ml-auto text-small text-muted-foreground">{plan.limitations.length}</span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180" aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="grid gap-1.5 border-t px-3 py-3 text-small">
          {plan.limitations.map((l) => (
            <li key={l} className="flex gap-2">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground" aria-hidden />
              {l}
            </li>
          ))}
        </ul>
        <p className="border-t px-3 py-2 font-mono text-label text-muted-foreground">
          {plan.stats.qlooCalls} Qloo calls · {plan.stats.cacheHits} cache hits · {plan.stats.retries} retries · {plan.stats.criticDrops} removed by the Critic · {(plan.stats.durationMs / 1000).toFixed(0)}s · ${plan.stats.costUsd.toFixed(3)} Claude
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ExportsMenu({ show }: { show: Show }) {
  const brands = show.plan?.slots.filter((s) => s.kind === "brand").flatMap((s) => s.items.filter((i) => i.approval.state !== "swapped" && i.approval.state !== "rejected")) ?? [];
  const share = typeof window !== "undefined" ? `${window.location.origin}/shows/${show.id}/share?k=${show.shareId}` : "";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" disabled={!show.plan} />}>
        <Download data-icon="inline-start" /> Export
        <ChevronDown data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem render={<a href={exportUrl(show.id, "pdf")} download />}>
          <FileText /> Run-of-show PDF
        </DropdownMenuItem>
        <DropdownMenuItem render={<a href={exportUrl(show.id, "csv")} download />}>
          <FileSpreadsheet /> Ops CSV
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            void navigator.clipboard?.writeText(share);
            toast.success("Share link copied", { description: "Read-only, no login needed." });
          }}
        >
          <Link2 /> Copy share link
        </DropdownMenuItem>
        {brands.length ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Sponsor one-pagers</DropdownMenuLabel>
            {brands.map((b) => (
              <DropdownMenuItem key={b.id} render={<a href={sponsorUrl(show.id, b.id)} download />}>
                <FileText /> <span className="truncate">{b.pick.name}</span>
                {b.fitScore !== undefined ? <span className="ml-auto font-mono text-label text-muted-foreground">{b.fitScore}</span> : null}
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
