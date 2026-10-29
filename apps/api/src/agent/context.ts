import {
  MODES,
  slotTime,
  type CrowdRead,
  type LedgerCall,
  type ModeTemplate,
  type QlooToolName,
  type RunEvent,
  type Show,
  type Slot,
} from "@housemix/shared";
import { Budget } from "../qloo/client.ts";
import { canonical } from "../qloo/client.ts";
import { config } from "../config.ts";

/** Everything one plan run shares: the show, the call ledger, the slot state and the event sink. */
export class RunContext {
  readonly template: ModeTemplate;
  readonly ledger = new Map<string, LedgerCall>();
  readonly budget = new Budget(config.qlooCallCap);
  readonly slots = new Map<string, Slot>();
  readonly toolsUsed = new Set<QlooToolName>();
  crowd: CrowdRead | undefined;
  headline = "";
  criticDrops = 0;
  costUsd = 0;
  modelUsage: Record<string, { costUsd: number; input: number; output: number; cacheRead: number; cacheWrite: number }> = {};
  readonly startedAt = Date.now();
  /** PreToolUse hook → tool handler hand-off, so each Qloo call is attributed to the agent that made it. */
  private readonly pendingAgent = new Map<string, string[]>();

  constructor(
    readonly show: Show,
    readonly runId: string,
    private readonly sink: (e: RunEvent) => void,
  ) {
    this.template = MODES[show.input.mode];
    const doors = show.input.doorsTime ?? "18:30";
    for (const t of this.template.slots) {
      this.slots.set(t.key, {
        key: t.key,
        label: t.label,
        timeRange: slotTime(doors, t.offsetMin, t.lengthMin),
        kind: t.kind,
        status: "pending",
        items: [],
        alternatives: [],
      });
    }
  }

  emit(e: RunEvent) {
    this.sink(e);
  }

  now() {
    return new Date().toISOString();
  }

  noteAgent(tool: string, args: unknown, agent: string) {
    const k = `${tool}|${canonical(args)}`;
    const q = this.pendingAgent.get(k) ?? [];
    q.push(agent);
    this.pendingAgent.set(k, q);
  }

  takeAgent(tool: string, args: unknown): string {
    const k = `${tool}|${canonical(args)}`;
    const q = this.pendingAgent.get(k);
    const a = q?.shift();
    if (q && q.length === 0) this.pendingAgent.delete(k);
    return a ?? "planner";
  }

  /** Calls in this run where the entity appears in the results. */
  callsMentioning(entityId: string): LedgerCall[] {
    return [...this.ledger.values()].filter((c) => c.resultIds.includes(entityId));
  }

  sideEntities() {
    return this.show.entities.filter((e) => e.kind === "side" && e.status === "resolved" && e.qlooId);
  }

  cityName() {
    return this.show.entities.find((e) => e.kind === "city")?.name ?? this.show.input.city;
  }
}
