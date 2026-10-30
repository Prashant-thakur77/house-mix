import type { AskAnswer, Briefing, Counterfactual, Heatmap, Health, Music, QlooToolName, Show, ShowInput, RunState } from "@housemix/shared";

import { announce, claudeHeaders } from "@/lib/user-key";

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
    const showId = /^\/shows\/([^/]+)\//.exec(path)?.[1];
    announce(body.error ?? "error", body.message ?? "", showId);
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
  a: {
    id: string;
    title: string;
    mode: string;
    date: string;
    venue: string;
    crowd?: Show["plan"] extends infer P ? (P extends { crowd: infer C } ? C : never) : never;
    slots: NonNullable<Show["plan"]>["slots"];
  };
  b: CompareResult["a"];
  comparison: { callId: string; status: string; summary: string; rows: { id: string; name: string; type?: string; side: "shared" | "a" | "b"; score?: number }[]; source: string };
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
/** A request that uses Claude: it carries the visitor's own API key, when they have added one. */
const claude = <T>(path: string, json: unknown = {}) => req<T>(path, { json, headers: claudeHeaders() });

export const api = {
  health: () => req<Health>("/health"),
  shows: () => req<ShowSummary[]>("/shows"),
  show: (id: string) => req<Show>(`/shows/${id}`),
  share: (shareId: string) => req<Show>(`/share/${shareId}`),
  createShow: (input: ShowInput) => post<Show>("/shows", input),
  confirm: (id: string, key: string, choice: string) => post<Show>(`/shows/${id}/confirm`, { key, choice }),
  refine: (id: string, key: string, text: string) => post<Show>(`/shows/${id}/refine`, { key, text }),
  startRun: (id: string) => claude<{ runId: string }>(`/shows/${id}/runs`),
  copy: (id: string) => post<Show>(`/shows/${id}/copy`),
  run: (runId: string) => req<RunState>(`/runs/${runId}`),
  approve: (id: string, itemId: string) => post<Show>(`/shows/${id}/items/${itemId}/approve`),
  reset: (id: string, itemId: string) => post<Show>(`/shows/${id}/items/${itemId}/reset`),
  reject: (id: string, itemId: string, reason: string) => post<Show>(`/shows/${id}/items/${itemId}/reject`, { reason }),
  swap: (id: string, itemId: string) => post<Show>(`/shows/${id}/items/${itemId}/swap`),
  approveConfident: (id: string) => post<Show>(`/shows/${id}/approve-confident`),
  lock: (id: string) => post<Show>(`/shows/${id}/lock`),
  unlock: (id: string) => post<Show>(`/shows/${id}/unlock`),
  briefing: (id: string, force = false) => claude<Briefing>(`/shows/${id}/briefing`, { force }),
  heatmap: (id: string, force = false) => post<Heatmap>(`/shows/${id}/heatmap`, { force }),
  music: (id: string, force = false) => post<Music>(`/shows/${id}/music`, { force }),
  counterfactual: (id: string, force = false) => claude<Counterfactual>(`/shows/${id}/counterfactual`, { force }),
  addProposal: (id: string, askId: string, proposalId: string) => post<Show>(`/shows/${id}/asks/${askId}/proposals/${proposalId}/add`),
  // Qloo can return one concept name under two tag categories; the table lists each name once per side.
  compare: (a: string, b: string) =>
    req<CompareResult>(`/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`).then((r) => ({
      ...r,
      comparison: { ...r.comparison, rows: r.comparison.rows.filter((x, i, all) => all.findIndex((y) => y.side === x.side && y.name.toLowerCase() === x.name.toLowerCase()) === i) },
    })),
  pairs: () => req<{ pairs: BlindPair[]; note?: string }>("/eval/pairs"),
  rate: (rating: unknown) => post<{ ok: true }>("/eval/ratings", rating),
};

export const exportUrl = (id: string, kind: "pdf" | "csv") => `${API_URL}/shows/${id}/export.${kind}`;
export const sponsorUrl = (id: string, itemId: string) => `${API_URL}/shows/${id}/items/${itemId}/sponsor.pdf`;
export const playlistUrl = (id: string, kind: "csv" | "m3u8") => `${API_URL}/shows/${id}/playlist.${kind}`;
export const cueSheetUrl = (id: string) => `${API_URL}/shows/${id}/cuesheet.pdf`;
export const audioUrl = (path: string) => `${API_URL}${path}`;
export const eventsUrl = (runId: string) => `${API_URL}/runs/${runId}/events`;

export type AskStreamEvent =
  | { type: "status"; text: string }
  | { type: "tool"; callId: string; tool: QlooToolName; args: Record<string, unknown>; status: string; summary: string; resultCount: number; cached: boolean }
  | { type: "answer"; answer: AskAnswer }
  | { type: "error"; code: string; message: string };

/** Ask House Mix: the server streams NDJSON (Qloo calls as they happen, then the checked answer). */
export async function askStream(id: string, question: string, onEvent: (e: AskStreamEvent) => void, signal?: AbortSignal): Promise<AskAnswer> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/shows/${id}/ask`, { method: "POST", headers: { "content-type": "application/json", ...claudeHeaders() }, body: JSON.stringify({ question }), signal });
  } catch {
    throw new ApiError(0, "network", "Can't reach the House Mix API. Check your connection and try again.");
  }
  if (!res.ok || !res.body) {
    let body: { error?: string; message?: string } = {};
    try {
      body = await res.json();
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, body.error ?? "error", body.message ?? `Request failed (${res.status}).`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let answer: AskAnswer | undefined;
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const e = JSON.parse(line) as AskStreamEvent;
      if (e.type === "error") {
        announce(e.code, e.message, id);
        throw new ApiError(422, e.code, e.message);
      }
      if (e.type === "answer") answer = e.answer;
      onEvent(e);
    }
    if (done) break;
  }
  if (!answer) throw new ApiError(502, "no_answer", "The answer stream ended early. Try again.");
  return answer;
}
