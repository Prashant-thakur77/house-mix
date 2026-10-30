import { randomUUID } from "node:crypto";
import type { RunEvent, RunState } from "@housemix/shared";
import { runPlan } from "../agent/run.ts";
import { getStore } from "../store/store.ts";
import { SPEND_LIMIT_USD, spendSoFar } from "../llm.ts";
import { claudeProblem, visitorKey } from "../keys.ts";
import { getShow, HttpError, saveShow } from "./service.ts";

type Listener = (e: RunEvent) => void;
interface LiveRun {
  state: RunState;
  listeners: Set<Listener>;
  flush?: NodeJS.Timeout;
}

const live = new Map<string, LiveRun>();
const MAX_CONCURRENT = Number(process.env.HM_MAX_CONCURRENT_RUNS ?? 2);

function persistSoon(run: LiveRun) {
  if (run.flush) return;
  run.flush = setTimeout(() => {
    run.flush = undefined;
    void getStore().put("runs", run.state.runId, run.state);
  }, 400);
}

/** Starts a plan run for a confirmed show; events stream to subscribers and are stored for replay. */
export async function startRun(showId: string, runner: typeof runPlan = runPlan): Promise<RunState> {
  const show = await getShow(showId);
  if (show.status === "needs_confirmation") throw new HttpError(409, "Confirm every entity before planning.", "needs_confirmation");
  if (show.status === "planning" && show.lastRunId && live.get(show.lastRunId)?.state.status === "running") return live.get(show.lastRunId)!.state;
  if (!visitorKey() && (await spendSoFar()) >= SPEND_LIMIT_USD) {
    throw new HttpError(429, "This demo has used its Claude budget for the hackathon. Open a seeded show to explore a full plan.", "budget");
  }
  const running = [...live.values()].filter((r) => r.state.status === "running").length;
  if (running >= MAX_CONCURRENT) throw new HttpError(429, "Other plans are running right now. Try again in a minute, or open a seeded show.", "busy");

  const runId = `r_${randomUUID().slice(0, 12)}`;
  const state: RunState = { runId, showId, status: "running", events: [], startedAt: new Date().toISOString() };
  const run: LiveRun = { state, listeners: new Set() };
  live.set(runId, run);
  const previous = { status: show.status };
  show.status = "planning";
  show.lastRunId = runId;
  await saveShow(show);
  await getStore().put("runs", runId, state);

  const emit = (e: RunEvent) => {
    state.events.push(e);
    for (const l of run.listeners) l(e);
    persistSoon(run);
  };

  void (async () => {
    try {
      const plan = await runner(show, runId, emit);
      const fresh = await getShow(showId);
      fresh.plan = plan;
      fresh.version = (fresh.version ?? 0) + 1;
      fresh.status = "planned";
      fresh.lockedAt = undefined;
      fresh.briefing = undefined;
      await saveShow(fresh);
      state.status = "done";
    } catch (e) {
      emit({ type: "error", at: new Date().toISOString(), message: claudeProblem(e)?.message ?? (e as Error).message, recoverable: true });
      const fresh = await getShow(showId);
      fresh.status = fresh.plan ? "planned" : previous.status === "planning" ? "ready_to_plan" : previous.status;
      await saveShow(fresh);
      state.status = "failed";
    } finally {
      state.finishedAt = new Date().toISOString();
      if (run.flush) clearTimeout(run.flush);
      await getStore().put("runs", runId, state);
      for (const l of run.listeners) l({ type: "error", at: state.finishedAt, message: "__end__", recoverable: false });
      run.listeners.clear();
      setTimeout(() => live.delete(runId), 10 * 60 * 1000).unref();
    }
  })();
  return state;
}

export async function getRun(runId: string): Promise<RunState> {
  const l = live.get(runId);
  if (l) return l.state;
  const stored = await getStore().get<RunState>("runs", runId);
  if (!stored) throw new HttpError(404, "Run not found.", "not_found");
  return stored;
}

/** Subscribes to a live run. Returns undefined when the run is no longer live (replay from the stored state). */
export function subscribe(runId: string, fn: Listener): (() => void) | undefined {
  const l = live.get(runId);
  if (!l || l.state.status !== "running") return undefined;
  l.listeners.add(fn);
  return () => l.listeners.delete(fn);
}

export function isEndMarker(e: RunEvent) {
  return e.type === "error" && e.message === "__end__";
}
