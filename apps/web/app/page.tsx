"use client";

import { useEffect, useState } from "react";
import { MotionConfig } from "motion/react";
import type { Show } from "@housemix/shared";
import { api, type ShowSummary } from "@/lib/api";
import { Dossier, Finale, Flood, Record, ShowIndex, SignalHero, StatusBar } from "@/components/landing/landing";

function myShowIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem("hm-my-shows") ?? "[]") as string[];
  } catch {
    return [];
  }
}

const ORDER = ["concert", "comedy", "sports", "festival", "dining"];

export default function Home() {
  const [shows, setShows] = useState<ShowSummary[]>();
  const [error, setError] = useState<string>();
  // Seeded plans feed the page: the concert (figure HUD, steps, the record, sponsors, Ask) and the fixture (Without Qloo).
  const [sports, setSports] = useState<Show>();
  const [concert, setConcert] = useState<Show>();
  const [mine, setMine] = useState<string[]>([]);
  useEffect(() => {
    setMine(myShowIds());
    api
      .shows()
      .then(setShows)
      .catch((e: Error) => setError(e.message));
    api.show("seed-sports").then(setSports).catch(() => undefined);
    api.show("seed-concert").then(setConcert).catch(() => undefined);
  }, []);
  const seeds = (shows?.filter((s) => s.seed) ?? []).sort((a, b) => ORDER.indexOf(a.mode) - ORDER.indexOf(b.mode));
  // The demo has no accounts, so "your shows" means shows created in this browser.
  const recent = shows?.filter((s) => !s.seed && mine.includes(s.id)).slice(0, 6) ?? [];

  return (
    <MotionConfig reducedMotion="user">
      <main id="main" className="overflow-x-clip pb-8">
        <SignalHero show={concert} />
        <Dossier show={concert} />
        <Record sports={sports} concert={concert} />
        <ShowIndex seeds={seeds} recent={recent} />
        {error ? (
          <p role="alert" className="sig-paper hud px-4 pb-10 text-sig-red-ink md:px-10">
            Could not load the demo shows: {error}. You can still plan a new show.
          </p>
        ) : null}
        <Flood />
        <Finale />
      </main>
      <StatusBar />
    </MotionConfig>
  );
}
