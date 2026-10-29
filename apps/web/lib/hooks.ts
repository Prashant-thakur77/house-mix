"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Health, RunEvent, Show } from "@housemix/shared";
import { api, ApiError, eventsUrl } from "./api";

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia("(prefers-reduced-motion: reduce)");
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

export function useMediaQuery(q: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(q);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(q).matches,
    () => true,
  );
}

let healthCache: { at: number; value: Health } | undefined;
export function useHealth() {
  const [health, setHealth] = useState<Health | undefined>(healthCache?.value);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .health()
        .then((h) => {
          healthCache = { at: Date.now(), value: h };
          if (alive) {
            setHealth(h);
            setError(undefined);
          }
        })
        .catch((e: ApiError) => alive && setError(e.message));
    if (!healthCache || Date.now() - healthCache.at > 30000) void load();
    const t = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return { health, error };
}

export function useShow(id: string | undefined, initial?: Show) {
  const [show, setShow] = useState<Show | undefined>(initial);
  const [error, setError] = useState<ApiError>();
  const [loading, setLoading] = useState(!initial);
  const reload = useCallback(async () => {
    if (!id) return;
    try {
      const s = await api.show(id);
      setShow(s);
      setError(undefined);
      return s;
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    // Server-rendered shows are fresh enough unless a plan is still running.
    if (!initial || initial.status === "planning") void reload();
  }, [reload]); // eslint-disable-line react-hooks/exhaustive-deps
  return { show, setShow, error, loading, reload };
}

export type StreamState = "idle" | "connecting" | "live" | "reconnecting" | "done" | "failed";

/** Subscribes to a plan run's SSE stream. Stored events are replayed on (re)connect, so the list is deduped by index. */
export function useRunStream(runId: string | undefined, onDone?: () => void) {
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [state, setState] = useState<StreamState>("idle");
  const [lastEventAt, setLastEventAt] = useState<number>();
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (!runId) return;
    setEvents([]);
    setState("connecting");
    let received = 0;
    let finished = false;
    const es = new EventSource(eventsUrl(runId));
    es.onopen = () => setState((s) => (s === "done" ? s : "live"));
    es.onmessage = (m) => {
      const ev = JSON.parse(m.data) as RunEvent;
      received++;
      setLastEventAt(Date.now());
      setEvents((prev) => (prev.length >= received ? prev : [...prev, ev]));
    };
    es.addEventListener("end", (m) => {
      finished = true;
      const status = (JSON.parse((m as MessageEvent).data) as { status: string }).status;
      setState(status === "failed" ? "failed" : "done");
      es.close();
      doneRef.current?.();
    });
    es.onerror = () => {
      if (finished) return;
      // EventSource reconnects by itself; the server replays stored events, so reset the counter.
      received = 0;
      setState("reconnecting");
    };
    return () => {
      es.close();
    };
  }, [runId]);

  return { events, state, lastEventAt };
}

export function useKeyboard(handler: (e: KeyboardEvent) => void, deps: unknown[]) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      handler(e);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
