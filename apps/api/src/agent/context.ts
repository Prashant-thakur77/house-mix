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
import { entitiesOf } from "../qloo/normalize.ts";
import { getStore } from "../store/store.ts";
import { canonical } from "../qloo/client.ts";
import { config } from "../config.ts";

const PLACE_TAGS = {
  food: ["urn:tag:genre:place:restaurant", "urn:tag:category:place:bar", "urn:tag:category:place:pub"],
  local: ["urn:tag:category:place:bar", "urn:tag:category:place:pub", "urn:tag:category:place:cocktail_bar", "urn:tag:genre:place:restaurant"],
};

/** Everything one plan run shares: the show, the call ledger, the slot state and the event sink. */
export class RunContext {
  readonly template: ModeTemplate;
  readonly ledger = new Map<string, LedgerCall>();
  readonly budget = new Budget(config.qlooCallCap);
  readonly slots = new Map<string, Slot>();
  readonly toolsUsed = new Set<QlooToolName>();
  crowd: CrowdRead | undefined;
  /** The venue's street address from its Qloo record; place slots search around it, not the whole city. */
  venueArea: string | undefined;
  /** The headliner's Qloo popularity and type; opener acts of the same type must sit below it. */
  headlinerPopularity: number | undefined;
  headlinerType: string | undefined;
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

  /** Reads the venue address and the headliner's popularity from their intake calls. */
  async loadAnchors() {
    const store = getStore();
    const anchor = async (kind: "venue" | "side") => {
      const ent = this.show.entities.find((e) => e.kind === kind && e.status === "resolved" && e.callId);
      const call = ent?.callId ? await store.get<LedgerCall>("ledger", ent.callId) : undefined;
      return call ? entitiesOf(call).find((x) => x.id === ent!.qlooId) : undefined;
    };
    // Mock fixtures have no neighbourhoods or Qloo place-category tags, so the venue-area search is live-only.
    this.venueArea = config.qlooMode === "live" ? (await anchor("venue"))?.address : undefined;
    const lead = await anchor("side");
    this.headlinerPopularity = lead?.popularity;
    this.headlinerType = lead?.type;
  }

  /**
   * Popularity ceiling for a slot that books acts under the headliner (openers, halftime), if any:
   * below 0.99, and below the headliner when the headliner is the same kind of act (a football
   * club's popularity says nothing about how big a halftime artist may be).
   */
  popularityCap(slotKey: string): number | undefined {
    const t = this.template.slots.find((s) => s.key === slotKey);
    if (!t || t.kind !== "act" || (t.targetType !== "artist" && t.targetType !== "person")) return undefined;
    const sameKind = this.headlinerType === t.targetType && this.headlinerPopularity !== undefined;
    return Math.min(0.99, sameKind ? this.headlinerPopularity! : 1);
  }

  /** Qloo place-category tags a place slot searches with: venues to eat and drink, or to go on to. */
  placeTags(slotKey: string): string[] | undefined {
    const t = this.template.slots.find((s) => s.key === slotKey);
    if (!t || t.targetType !== "place" || config.qlooMode !== "live") return undefined;
    return t.kind === "food" ? PLACE_TAGS.food : PLACE_TAGS.local;
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

  /** Human name for an entity ID seen in this run (for trace messages). */
  nameOf(id: string): string {
    for (const c of this.ledger.values()) {
      const r = c.results.find((x) => x.entity_id === id || x.id === id);
      if (r && typeof r.name === "string") return r.name;
    }
    return this.show.entities.find((e) => e.qlooId === id)?.name ?? id;
  }

  sideEntities() {
    return this.show.entities.filter((e) => e.kind === "side" && e.status === "resolved" && e.qlooId);
  }

  cityName() {
    return this.show.entities.find((e) => e.kind === "city")?.name ?? this.show.input.city;
  }
}
