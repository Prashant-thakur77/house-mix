"use client";

import { useEffect, useState } from "react";
import { MotionConfig } from "motion/react";
import type { Show } from "@housemix/shared";
import { api, type ShowSummary } from "@/lib/api";
import { TopBar } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Hero } from "@/components/landing/hero";
import { FooterCta, HowItWorks, IntroCurtain, Ribbons, Trust } from "@/components/landing/sections";
import { AskDemo, CrowdShowcase, Posters, QlooDeck, Sponsors, WithoutQloo } from "@/components/landing/showcase";

function myShowIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem("hm-my-shows") ?? "[]") as string[];
  } catch {
    return [];
  }
}

const ORDER = ["concert", "comedy", "sports", "festival"];

export default function Home() {
  const [shows, setShows] = useState<ShowSummary[]>();
  const [error, setError] = useState<string>();
  // Two seeded plans feed the landing: the fixture (two crowds, the comparison) and the concert (steps, sponsors, Ask).
  const [sports, setSports] = useState<Show>();
  const [concert, setConcert] = useState<Show>();
  const [mine, setMine] = useState<string[]>([]);
  useEffect(() => {
    setMine(myShowIds());
    api
      .shows()
      .then(setShows)
      .catch((e: Error) => setError(e.message));
    api
      .show("seed-sports")
      .then(setSports)
      .catch(() => undefined);
    api
      .show("seed-concert")
      .then(setConcert)
      .catch(() => undefined);
  }, []);
  const seeds = (shows?.filter((s) => s.seed) ?? []).sort((a, b) => ORDER.indexOf(a.mode) - ORDER.indexOf(b.mode));
  // The demo has no accounts, so "Your shows" means shows created in this browser.
  const recent = shows?.filter((s) => !s.seed && mine.includes(s.id)).slice(0, 8) ?? [];

  return (
    <MotionConfig reducedMotion="user">
      <IntroCurtain />
      {/* "display: contents" keeps the header sticky to the page while it takes the stage colours. */}
      <div className="stage contents">
        <TopBar />
      </div>
      <main id="main" className="overflow-x-clip">
        <Hero demo={sports ? "seed-sports" : seeds[0]?.id} show={sports} />
        <Ribbons />
        {error ? (
          <div className="mx-auto max-w-[1280px] px-4 pt-10 md:px-6">
            <Alert variant="destructive">
              <AlertTitle>Could not load the demo shows</AlertTitle>
              <AlertDescription>{error} You can still plan a new show.</AlertDescription>
            </Alert>
          </div>
        ) : null}
        <Posters seeds={seeds} recent={recent} />
        <HowItWorks show={concert ?? sports} />
        <CrowdShowcase show={sports} />
        <QlooDeck />
        <Sponsors show={concert ?? sports} />
        <AskDemo show={concert} />
        <WithoutQloo show={sports} />
        <Trust />
      </main>
      <FooterCta />
    </MotionConfig>
  );
}
