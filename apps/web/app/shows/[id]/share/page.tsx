"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { Show } from "@housemix/shared";
import { api, ApiError } from "@/lib/api";
import { Logo, ThemeToggle } from "@/components/app-shell";
import { Kicker, ModeChip, StretchBadge } from "@/components/status";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";

function SharedPlan() {
  const { id } = useParams<{ id: string }>();
  const k = useSearchParams().get("k") ?? "";
  const [show, setShow] = useState<Show>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const load = () =>
      api
        .share(k)
        .then((s) => {
          if (s.id !== id) throw new ApiError(404, "not_found", "This share link does not match a show.");
          setShow(s);
          if (!s.plan) t = setTimeout(load, 8000);
        })
        .catch((e: ApiError) => setError(e.status === 404 ? "This link does not exist or has been replaced. Ask the GM for a new link." : e.message));
    if (!k) setError("This link is missing its share key. Ask the GM for a new link.");
    else void load();
    return () => clearTimeout(t);
  }, [id, k]);

  if (error) return <p className="py-20 text-center text-body-lg text-muted-foreground">{error}</p>;
  if (!show) return <Skeleton className="mt-10 h-96" />;
  const i = show.input;
  return (
    <article className="py-8">
      <div className="flex flex-wrap items-center gap-2">
        <ModeChip mode={i.mode} />
        <span className="text-small text-muted-foreground">
          Plan v{show.version}
          {show.lockedAt ? ` · locked ${new Date(show.lockedAt).toLocaleString()}` : " · draft"}
        </span>
      </div>
      <h1 className="mt-3 text-[2rem] font-semibold leading-tight tracking-[-0.02em]">{show.title}</h1>
      <p className="mt-1 text-body-lg text-muted-foreground">
        {i.venue}, {i.city} · {new Date(`${i.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
      </p>
      <div className="mt-6 flex items-end gap-3">
        <span className="font-mono text-display font-semibold tabular leading-none">{i.doorsTime}</span>
        <Kicker className="mb-1">{i.mode === "sports" ? "gates open" : "doors"}</Kicker>
      </div>
      {show.qlooMode === "mock" ? <p className="mt-4 rounded-md bg-signal-bg px-3 py-2 text-small text-signal">MOCK DATA: built from fictional mock Qloo fixtures, not live results.</p> : null}
      {!show.plan ? (
        <p className="mt-10 text-body-lg text-muted-foreground">This plan is still being built. This page refreshes on its own.</p>
      ) : (
        <>
          {show.plan.headline ? <p className="mt-6 text-body-lg">{show.plan.headline}</p> : null}
          <ol className="mt-8 grid gap-8">
            {show.plan.slots.map((s) => (
              <li key={s.key} className="break-inside-avoid">
                <div className="flex items-baseline gap-3 border-b pb-1">
                  <span className="font-mono text-small text-muted-foreground">{s.timeRange}</span>
                  <h2 className="text-h2 font-semibold">{s.label}</h2>
                </div>
                <ul className="mt-2 grid gap-2">
                  {s.items
                    .filter((it) => it.approval.state !== "swapped" && it.approval.state !== "rejected")
                    .map((it) => (
                      <li key={it.id} className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-body-lg font-medium">{it.pick.name}</span>
                            {it.isWildcard ? <StretchBadge /> : null}
                            {it.approval.state === "approved" ? <span className="text-label text-status-ok">approved</span> : null}
                          </div>
                          {it.action ? <p className="text-muted-foreground">{it.action}</p> : null}
                        </div>
                        <Popover>
                          <PopoverTrigger className="no-print grid size-7 shrink-0 place-items-center rounded-full border text-small" aria-label={`Why ${it.pick.name}?`}>
                            ?
                          </PopoverTrigger>
                          <PopoverContent className="w-80 text-small">
                            <div className="border-l-3 border-qloo-border pl-2">
                              <div className="text-label font-medium uppercase text-qloo">Qloo says</div>
                              <p className="font-mono">{it.qlooSays}</p>
                            </div>
                            <div className="mt-2 border-l-3 border-interp-border pl-2">
                              <div className="text-label font-medium uppercase text-interp">Our interpretation</div>
                              <p>{it.interpretation}</p>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </li>
                    ))}
                </ul>
              </li>
            ))}
          </ol>
          <footer className="mt-10 border-t pt-4 text-small text-muted-foreground">
            <Kicker>Limitations</Kicker>
            <ul className="mt-2 grid gap-1">
              {show.plan.limitations.map((l) => (
                <li key={l}>• {l}</li>
              ))}
            </ul>
            <p className="mt-3">Generated {new Date(show.plan.createdAt).toLocaleString()} · {show.qlooMode === "live" ? "live Qloo data" : "mock data"}</p>
          </footer>
        </>
      )}
    </article>
  );
}

export default function SharePage() {
  return (
    <>
      <header className="no-print border-b">
        <div className="mx-auto flex h-14 max-w-[720px] items-center gap-3 px-4">
          <Logo />
          <span className="text-small text-muted-foreground">Shared plan · read only</span>
          <span className="ml-auto">
            <ThemeToggle />
          </span>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-[720px] px-4">
        <Suspense fallback={<Skeleton className="mt-10 h-96" />}>
          <SharedPlan />
        </Suspense>
      </main>
    </>
  );
}
