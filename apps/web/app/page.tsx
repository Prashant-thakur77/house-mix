"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ClipboardCheck, Radio, ScanSearch } from "lucide-react";
import { MODES, QLOO_TOOLS } from "@housemix/shared";
import { api, type ShowSummary } from "@/lib/api";
import { TopBar } from "@/components/app-shell";
import { Kicker, ModeChip } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const STATUS_LABEL: Record<string, string> = {
  needs_confirmation: "Needs you",
  ready_to_plan: "Ready to plan",
  planning: "Building",
  planned: "Plan ready",
  locked: "Locked",
  failed: "Failed",
};

function DemoCard({ s }: { s: ShowSummary }) {
  const date = new Date(`${s.date}T00:00:00`);
  return (
    <Link
      href={`/shows/${s.id}`}
      className="group flex flex-col rounded-lg border bg-card p-4 shadow-1 transition-shadow duration-200 hover:shadow-2 focus-visible:shadow-2"
    >
      <div className="flex items-center justify-between gap-2">
        <ModeChip mode={s.mode} />
        <span className="text-small text-muted-foreground">{STATUS_LABEL[s.status] ?? s.status}</span>
      </div>
      <h3 className="mt-4 text-h2 font-semibold">{s.title}</h3>
      <p className="mt-1 text-small text-muted-foreground">
        {s.venue} · {s.city}
      </p>
      <div className="mt-5 flex items-end justify-between">
        <div>
          <div className="font-mono text-display font-semibold tabular leading-none">{date.toLocaleDateString(undefined, { day: "2-digit" })}</div>
          <Kicker className="mt-1">{date.toLocaleDateString(undefined, { month: "short", year: "numeric" })}</Kicker>
        </div>
        <div className="text-right text-small text-muted-foreground">
          {s.items > 0 ? `${s.items} plan items` : "No plan yet"}
          <div className="mt-1 inline-flex items-center gap-1 font-medium text-primary">
            Open console <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </div>
        </div>
      </div>
      {s.headline ? <p className="mt-4 line-clamp-2 border-t pt-3 text-small text-muted-foreground">{s.headline}</p> : null}
    </Link>
  );
}

const STEPS = [
  { icon: ScanSearch, title: "Describe tonight", body: "Lineup or home vs away, venue, city and house rules. Every name is resolved with Qloo, and you confirm anything ambiguous." },
  { icon: Radio, title: "Watch the agent plan", body: "Subagents read the crowd and fill each slot from its own Qloo chain. Every call streams into the trace as it happens." },
  { icon: ClipboardCheck, title: "Approve, then brief the crew", body: "Approve, swap or reject line by line, lock a version, export the run-of-show and play the two-voice briefing." },
];

export default function Home() {
  const [shows, setShows] = useState<ShowSummary[]>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    api
      .shows()
      .then(setShows)
      .catch((e: Error) => setError(e.message));
  }, []);
  const seeds = shows?.filter((s) => s.seed) ?? [];
  const recent = shows?.filter((s) => !s.seed).slice(0, 6) ?? [];

  return (
    <>
      <TopBar />
      <main id="main" className="mx-auto max-w-[1280px] px-4 pb-20 md:px-6">
        <section className="grid gap-8 py-12 md:grid-cols-12 md:py-16">
          <div className="md:col-span-7">
            <Kicker>For venue GMs, promoters and sponsorship teams</Kicker>
            <h1 className="mt-3 text-[2.25rem] font-semibold leading-[2.6rem] tracking-[-0.03em] md:text-display">Program tonight for the crowd you actually have.</h1>
            <p className="mt-4 max-w-[60ch] text-body-lg text-muted-foreground">
              House Mix turns a lineup into a run-of-show: walk-in music, openers, food and drink, sponsor activations and a local guide. Every pick is chosen with Qloo taste data and carries its evidence.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button nativeButton={false} size="lg" className="h-10 px-4 text-sm" render={<Link href="/new" />}>
                Plan a new show <ArrowRight data-icon="inline-end" />
              </Button>
              {seeds[0] ? (
                <Button nativeButton={false} size="lg" variant="outline" className="h-10 px-4 text-sm" render={<Link href={`/shows/${seeds[0].id}`} />}>
                  Open a demo
                </Button>
              ) : null}
            </div>
          </div>
          <aside className="rounded-lg border bg-card p-4 md:col-span-5" aria-label="Qloo tools used">
            <Kicker>All {QLOO_TOOLS.length} Qloo MCP tools do real work</Kicker>
            <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {QLOO_TOOLS.map((t) => (
                <li key={t} className="truncate rounded-md bg-muted px-2 py-1 font-mono text-small" title={t}>
                  {t}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-small text-muted-foreground">Ambiguous names stop the agent and ask you. Retries happen only when Qloo says an error is retryable.</p>
          </aside>
        </section>

        <section aria-labelledby="demos">
          <div className="flex items-end justify-between gap-4">
            <div>
              <Kicker>Seeded demo shows</Kicker>
              <h2 id="demos" className="mt-1 text-h2 font-semibold">
                Open a full plan instantly
              </h2>
            </div>
            <Link href="/compare" className="text-small font-medium text-primary hover:underline">
              Compare two shows
            </Link>
          </div>
          {error ? (
            <Alert variant="destructive" className="mt-4">
              <AlertTitle>Could not load the demo shows</AlertTitle>
              <AlertDescription>{error} You can still plan a new show.</AlertDescription>
            </Alert>
          ) : null}
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {!shows && !error ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-60 rounded-lg" />) : seeds.map((s) => <DemoCard key={s.id} s={s} />)}
            {shows && seeds.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-small text-muted-foreground sm:col-span-2 lg:col-span-3">
                No demo shows yet. <Link href="/new" className="font-medium text-primary hover:underline">Plan a new show</Link> to create one.
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-14" aria-labelledby="how">
          <Kicker>How it works</Kicker>
          <h2 id="how" className="mt-1 text-h2 font-semibold">
            One flow, four modes
          </h2>
          <ol className="mt-4 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-lg border bg-card p-4">
                <div className="flex items-center gap-2">
                  <span className="grid size-7 place-items-center rounded-md bg-accent font-mono text-small font-semibold text-accent-foreground">{i + 1}</span>
                  <s.icon className="size-4 text-muted-foreground" aria-hidden />
                </div>
                <h3 className="mt-3 text-h3 font-semibold">{s.title}</h3>
                <p className="mt-1 text-small text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.values(MODES).map((m) => (
              <span key={m.mode} className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-small">
                <ModeChip mode={m.mode} className="border-0 px-0" />
                <span className="text-muted-foreground">{m.tagline}</span>
              </span>
            ))}
          </div>
        </section>

        {recent.length ? (
          <section className="mt-14" aria-labelledby="recent">
            <Kicker>Recent</Kicker>
            <h2 id="recent" className="mt-1 text-h2 font-semibold">
              Your shows
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recent.map((s) => (
                <DemoCard key={s.id} s={s} />
              ))}
            </div>
          </section>
        ) : null}
      </main>
      <footer className="border-t py-6 text-center text-small text-muted-foreground">
        Qloo results describe aggregate audience affinities, never individuals. House Mix makes no eligibility decisions.
      </footer>
    </>
  );
}
