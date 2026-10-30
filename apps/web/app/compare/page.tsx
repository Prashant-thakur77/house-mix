"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ArrowLeftRight, Loader2 } from "lucide-react";
import { api, ApiError, type CompareResult, type ShowSummary } from "@/lib/api";
import { TopBar } from "@/components/app-shell";
import { Kicker, StatusChip } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "cn";

function Picker({ id, label, value, shows, onChange }: { id: string; label: string; value?: string; shows: ShowSummary[]; onChange: (v: string) => void }) {
  return (
    <div className="grid flex-1 gap-1">
      <label htmlFor={id} className="text-small font-medium">
        {label}
      </label>
      <select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-body">
        <option value="" disabled>
          Choose a show
        </option>
        {shows
          .filter((s) => s.items > 0)
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.title} · {s.date}
            </option>
          ))}
      </select>
    </div>
  );
}

function CompareView() {
  const params = useSearchParams();
  const router = useRouter();
  const [shows, setShows] = useState<ShowSummary[]>([]);
  const [a, setA] = useState(params.get("a") ?? undefined);
  const [b, setB] = useState(params.get("b") ?? undefined);
  const [result, setResult] = useState<CompareResult>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.shows().then((s) => {
      setShows(s);
      const planned = s.filter((x) => x.items > 0);
      setA((v) => v ?? planned[0]?.id);
      setB((v) => v ?? planned.find((x) => x.id !== (params.get("a") ?? planned[0]?.id))?.id);
    });
  }, [params]);

  useEffect(() => {
    if (!a || !b || a === b) return;
    router.replace(`/compare?a=${a}&b=${b}`);
    setBusy(true);
    setError(undefined);
    api
      .compare(a, b)
      .then(setResult)
      .catch((e: ApiError) => setError(e.message))
      .finally(() => setBusy(false));
  }, [a, b, router]);

  const keys = result ? [...new Set([...result.a.slots.map((s) => s.label), ...result.b.slots.map((s) => s.label)])] : [];
  const names = (slots: CompareResult["a"]["slots"], label: string) =>
    slots
      .find((s) => s.label === label)
      ?.items.filter((i) => i.approval.state !== "swapped" && i.approval.state !== "rejected")
      .map((i) => i.pick.name) ?? [];
  const overlap = result ? result.diff.both.length / Math.max(1, result.diff.both.length + result.diff.onlyA.length + result.diff.onlyB.length) : 0;

  return (
    <main id="main" className="mx-auto max-w-[1280px] px-4 pb-20 pt-8 md:px-6">
      <Kicker>Tonight vs last night</Kicker>
      <h1 className="mt-1 font-display text-[2rem] font-extrabold leading-tight tracking-[-0.02em]">Compare two shows</h1>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <Picker id="a" label="Tonight" value={a} shows={shows} onChange={setA} />
        <Button
          variant="outline"
          size="icon"
          aria-label="Swap shows"
          onClick={() => {
            setA(b);
            setB(a);
          }}
        >
          <ArrowLeftRight />
        </Button>
        <Picker id="b" label="Last night" value={b} shows={shows} onChange={setB} />
      </div>
      {a && b && a === b ? <p className="mt-3 text-small text-muted-foreground">Pick two different shows.</p> : null}
      {shows.length > 0 && shows.filter((s) => s.items > 0).length < 2 ? <p className="mt-3 text-small text-muted-foreground">You need two planned shows to compare.</p> : null}
      {error ? (
        <Alert variant="destructive" className="mt-4">
          <AlertTitle>Comparison failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {busy ? (
        <div className="mt-6 grid gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-80" />
        </div>
      ) : result ? (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Plan overlap", `${Math.round(overlap * 100)}%`],
              ["Only tonight", String(result.diff.onlyA.length)],
              ["Only last night", String(result.diff.onlyB.length)],
              ["Shared concepts", String(result.comparison.rows.filter((r) => r.side === "shared").length)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border bg-card p-3">
                <Kicker>{k}</Kicker>
                <div className="mt-1 font-mono text-kpi font-semibold tabular">{v}</div>
              </div>
            ))}
          </div>
          <section className="mt-6 rounded-lg border bg-card p-4" aria-labelledby="cmp-crowd">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="cmp-crowd" className="text-h2 font-semibold">
                How the crowds differ
              </h2>
              <StatusChip status={result.comparison.status as "ok"} />
              <span className="font-mono text-small text-muted-foreground">qloo_compare_audiences · {result.comparison.source}</span>
            </div>
            {result.comparison.rows.length ? (
              <table className="mt-3 w-full text-small">
                <caption className="sr-only">Which bill's crowd carries each concept, with Qloo's similarity score for shared concepts</caption>
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1 font-medium">Concept</th>
                    <th className="py-1 text-right font-medium">Carried by</th>
                    <th className="py-1 text-right font-medium">Qloo similarity</th>
                  </tr>
                </thead>
                <tbody>
                  {result.comparison.rows.map((r) => (
                    <tr key={`${r.side}-${r.id}`} className="border-t">
                      <td className="py-1.5">{r.name}</td>
                      <td className={cn("py-1.5 text-right", r.side === "shared" ? "font-medium" : "text-muted-foreground")}>
                        {r.side === "shared" ? "both crowds" : r.side === "a" ? "only tonight" : "only last night"}
                      </td>
                      <td className="py-1.5 text-right font-mono">{r.score !== undefined ? r.score.toFixed(2) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mt-2 text-small text-muted-foreground">{result.comparison.summary || "Qloo returned no comparable concepts for these two bills."}</p>
            )}
          </section>
          <section className="mt-6" aria-labelledby="cmp-plan">
            <h2 id="cmp-plan" className="text-h2 font-semibold">
              Plan side by side
            </h2>
            <div className="mt-3 grid gap-2">
              <div className="hidden grid-cols-[10rem_1fr_1fr] gap-3 text-small text-muted-foreground md:grid">
                <span />
                <span>{result.a.title}</span>
                <span>{result.b.title}</span>
              </div>
              {keys.map((k) => {
                const na = names(result.a.slots, k);
                const nb = names(result.b.slots, k);
                return (
                  <div key={k} className="grid gap-2 rounded-lg border bg-card p-3 md:grid-cols-[10rem_1fr_1fr] md:gap-3">
                    <Kicker className="md:pt-0.5">{k}</Kicker>
                    {[na, nb].map((list, n) => (
                      <ul key={n} className="grid gap-1 text-small">
                        <li className="text-label text-muted-foreground md:hidden">{n === 0 ? result.a.title : result.b.title}</li>
                        {list.length ? (
                          list.map((x) => (
                            <li key={x} className={cn("border-l-2 pl-2", (n === 0 ? nb : na).includes(x) ? "border-transparent text-muted-foreground" : "border-signal")}>
                              {x}
                              {!(n === 0 ? nb : na).includes(x) ? <span className="ml-1.5 text-label text-signal">only {n === 0 ? "tonight" : "last night"}</span> : null}
                            </li>
                          ))
                        ) : (
                          <li className="text-muted-foreground">—</li>
                        )}
                      </ul>
                    ))}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : !busy && shows.length ? null : !shows.length ? (
        <div className="mt-6 flex items-center gap-2 text-small text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading shows…
        </div>
      ) : null}
    </main>
  );
}

export default function ComparePage() {
  return (
    <>
      <TopBar />
      <Suspense fallback={<Skeleton className="m-6 h-96" />}>
        <CompareView />
      </Suspense>
    </>
  );
}
