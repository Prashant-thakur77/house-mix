"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, type BlindPair } from "@/lib/api";
import { Logo, ThemeToggle } from "@/components/app-shell";
import { Kicker } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "cn";

type Side = "left" | "right" | "tie";

function raterCode(): string {
  try {
    const k = "hm-rater";
    const existing = localStorage.getItem(k);
    if (existing) return existing;
    const code = `r-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(k, code);
    return code;
  } catch {
    return `r-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function PlanColumn({ title, plan }: { title: string; plan: BlindPair["left"] }) {
  return (
    <div className="grid content-start gap-3 rounded-lg border bg-card p-3">
      <h3 className="text-h2 font-semibold">{title}</h3>
      {plan.slots.map((s) => (
        <section key={s.key}>
          <Kicker>{s.label}</Kicker>
          <ul className="mt-1 grid gap-1.5">
            {s.picks.map((p, i) => (
              <li key={i} className="text-small">
                <span className="font-medium">{p.name}</span>
                <span className="block text-muted-foreground">{p.why}</span>
                {p.action ? <span className="block text-subtle-foreground">→ {p.action}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default function RatePage() {
  const [pairs, setPairs] = useState<BlindPair[]>();
  const [note, setNote] = useState<string>();
  const [idx, setIdx] = useState(0);
  const [perSlot, setPerSlot] = useState<Record<string, Side>>({});
  const [overall, setOverall] = useState<Side>();
  const [fitL, setFitL] = useState<number>();
  const [fitR, setFitR] = useState<number>();
  const [busy, setBusy] = useState(false);
  const code = useMemo(() => (typeof window === "undefined" ? "" : raterCode()), []);

  useEffect(() => {
    api
      .pairs()
      .then((r) => {
        setPairs(r.pairs);
        setNote(r.note);
      })
      .catch((e: ApiError) => setNote(e.message));
  }, []);

  const pair = pairs?.[idx];
  const slotKeys = pair ? [...new Set([...pair.left.slots.map((s) => s.key), ...pair.right.slots.map((s) => s.key)])] : [];
  const ready = overall && fitL && fitR;

  const submit = async () => {
    if (!pair || !ready) return;
    setBusy(true);
    try {
      await api.rate({ raterCode: code, pairId: pair.pairId, overall, perSlot, fitLeft: fitL, fitRight: fitR });
      setIdx((i) => i + 1);
      setPerSlot({});
      setOverall(undefined);
      setFitL(undefined);
      setFitR(undefined);
      window.scrollTo({ top: 0 });
    } catch (e) {
      toast.error("Could not save the rating", { description: (e as ApiError).message });
    } finally {
      setBusy(false);
    }
  };

  const Choice = ({ value, onChange, label }: { value?: Side; onChange: (s: Side) => void; label: string }) => (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border p-0.5">
      {(["left", "tie", "right"] as Side[]).map((s) => (
        <button key={s} type="button" role="radio" aria-checked={value === s} onClick={() => onChange(s)} className={cn("h-8 rounded px-3 text-small", value === s ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
          {s === "left" ? "A better" : s === "right" ? "B better" : "Tie"}
        </button>
      ))}
    </div>
  );
  const Fit = ({ value, onChange, label }: { value?: number; onChange: (n: number) => void; label: string }) => (
    <div className="grid gap-1">
      <span className="text-small font-medium">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} onClick={() => onChange(n)} className={cn("size-9 rounded-md border font-mono", value === n ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {n}
          </button>
        ))}
      </div>
      <span className="text-label text-muted-foreground">1 poor fit · 5 excellent fit</span>
    </div>
  );

  return (
    <>
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-3 px-4">
          <Logo />
          <span className="text-small text-muted-foreground">Blind plan comparison</span>
          <span className="ml-auto">
            <ThemeToggle />
          </span>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-[1280px] px-4 pb-20 pt-6">
        {!pairs && !note ? (
          <Skeleton className="h-96" />
        ) : !pairs?.length ? (
          <div className="mx-auto max-w-xl py-16 text-center">
            <h1 className="text-h1 font-semibold">No plans to rate yet</h1>
            <p className="mt-2 text-muted-foreground">{note ?? "Check back soon."}</p>
          </div>
        ) : !pair ? (
          <div className="mx-auto max-w-xl py-16 text-center">
            <h1 className="text-h1 font-semibold">Thank you</h1>
            <p className="mt-2 text-muted-foreground">You rated all {pairs.length} shows. Your anonymous rater code is {code}.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <Kicker>
                  Show {idx + 1} of {pairs.length}
                </Kicker>
                <h1 className="mt-1 text-h1 font-semibold">{pair.title}</h1>
                <p className="text-small text-muted-foreground">
                  {pair.venue} · {pair.city} · {pair.mode}
                </p>
              </div>
              <Progress value={(100 * idx) / pairs.length} className="w-48" aria-label={`${idx} of ${pairs.length} rated`} />
            </div>
            <details className="mt-3 rounded-md border p-3 text-small">
              <summary className="cursor-pointer font-medium">Instructions</summary>
              <p className="mt-1 text-muted-foreground">Two plans for the same show, made by different methods. The order is random and the labels are removed. For each slot pick the plan that fits this crowd better, then give an overall verdict and a 1–5 fit score for each plan. Don&apos;t look anything up. No personal data is collected.</p>
            </details>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <PlanColumn title="Plan A" plan={pair.left} />
              <PlanColumn title="Plan B" plan={pair.right} />
            </div>
            <section className="mt-6 grid gap-3 rounded-lg border bg-card p-4" aria-label="Your ratings">
              {slotKeys.map((k) => (
                <div key={k} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-small font-medium">{pair.left.slots.find((s) => s.key === k)?.label ?? k}</span>
                  <Choice label={`Better plan for ${k}`} value={perSlot[k]} onChange={(s) => setPerSlot((p) => ({ ...p, [k]: s }))} />
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                <span className="font-medium">Overall</span>
                <Choice label="Better plan overall" value={overall} onChange={setOverall} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Fit label="Plan A fits this crowd" value={fitL} onChange={setFitL} />
                <Fit label="Plan B fits this crowd" value={fitR} onChange={setFitR} />
              </div>
              <Button size="lg" disabled={!ready || busy} onClick={submit} className="w-full sm:w-auto sm:justify-self-end">
                {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null} Submit and next
              </Button>
            </section>
          </>
        )}
      </main>
    </>
  );
}
