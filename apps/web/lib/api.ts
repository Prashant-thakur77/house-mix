import type { Briefing, Health, Show, ShowInput, RunState } from "@housemix/shared";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function req<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      method: init?.method ?? (init?.json !== undefined ? "POST" : "GET"),
      headers: init?.json !== undefined ? { "content-type": "application/json", ...init?.headers } : init?.headers,
      body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "network", "Can't reach the House Mix API. Check your connection and try again.");
  }
  if (!res.ok) {
    let body: { error?: string; message?: string } = {};
    try {
      body = await res.json();
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, body.error ?? "error", body.message ?? `Request failed (${res.status}).`);
  }
  return (await res.json()) as T;
}

export interface ShowSummary {
  id: string;
  title: string;
  mode: Show["input"]["mode"];
  venue: string;
  city: string;
  date: string;
  status: Show["status"];
  seed: boolean;
  version: number;
  qlooMode: "mock" | "live";
  updatedAt: string;
  headline: string;
  items: number;
}

export interface CompareResult {
  a: { id: string; title: string; mode: string; date: string; venue: string; crowd?: Show["plan"] extends infer P ? (P extends { crowd: infer C } ? C : never) : never; slots: NonNullable<Show["plan"]>["slots"] };
  b: CompareResult["a"];
  comparison: { callId: string; status: string; summary: string; rows: { id: string; name: string; type?: string; a: number; b: number; delta: number }[]; source: string };
  diff: { onlyA: string[]; onlyB: string[]; both: string[] };
}

export interface BlindPair {
  pairId: string;
  split: string;
  title: string;
  mode: string;
  venue: string;
  city: string;
  left: { slots: { key: string; label: string; picks: { name: string; why: string; action: string }[] }[] };
  right: BlindPair["left"];
}

const post = <T>(path: string, json: unknown = {}) => req<T>(path, { json });

export const api = {
  health: () => req<Health>("/health"),
  shows: () => req<ShowSummary[]>("/shows"),
  show: (id: string) => req<Show>(`/shows/${id}`),
  share: (shareId: string) => req<Show>(`/share/${shareId}`),
  createShow: (input: ShowInput) => post<Show>("/shows", input),
  confirm: (id: string, key: string, choice: string) => post<Show>(`/shows/${id}/confirm`, { key, choice }),
  refine: (id: string, key: string, text: string) => post<Show>(`/shows/${id}/refine`, { key, text }),
  startRun: (id: string) => post<{ runId: string }>(`/shows/${id}/runs`),
  run: (runId: string) => req<RunState>(`/runs/${runId}`),
  approve: (id: string, itemId: string) => post<Show>(`/shows/${id}/items/${itemId}/approve`),
  reset: (id: string, itemId: string) => post<Show>(`/shows/${id}/items/${itemId}/reset`),
  reject: (id: string, itemId: string, reason: string) => post<Show>(`/shows/${id}/items/${itemId}/reject`, { reason }),
  swap: (id: string, itemId: string) => post<Show>(`/shows/${id}/items/${itemId}/swap`),
  lock: (id: string) => post<Show>(`/shows/${id}/lock`),
  unlock: (id: string) => post<Show>(`/shows/${id}/unlock`),
  briefing: (id: string) => post<Briefing>(`/shows/${id}/briefing`),
  compare: (a: string, b: string) => req<CompareResult>(`/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`),
  pairs: () => req<{ pairs: BlindPair[]; note?: string }>("/eval/pairs"),
  rate: (rating: unknown) => post<{ ok: true }>("/eval/ratings", rating),
};

export const exportUrl = (id: string, kind: "pdf" | "csv") => `${API_URL}/shows/${id}/export.${kind}`;
export const sponsorUrl = (id: string, itemId: string) => `${API_URL}/shows/${id}/items/${itemId}/sponsor.pdf`;
export const audioUrl = (path: string) => `${API_URL}${path}`;
export const eventsUrl = (runId: string) => `${API_URL}/runs/${runId}/events`;
