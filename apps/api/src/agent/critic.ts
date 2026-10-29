import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Evidence, LedgerCall, PlanItem } from "@housemix/shared";
import { structured } from "../llm.ts";
import { entityInCall, qlooSaysLine, scoresFor } from "../qloo/normalize.ts";
import type { RunContext } from "./context.ts";

export interface SubmittedItem {
  entity_id: string;
  call_id: string;
  interpretation: string;
  action?: string;
  is_wildcard?: boolean;
}

export interface GateProblem {
  index: number;
  entity_id: string;
  reason: string;
}

const UNUSABLE = new Set(["error", "empty", "needs_input"]);

/**
 * Deterministic evidence gate. An item survives only if it cites a call made in this
 * run whose results contain the entity, and that call's status carries usable results.
 * Runs as a PreToolUse hook (so the agent must fix its citations) and again in the handler.
 */
export function gateItems(ctx: RunContext, slotKey: string, items: SubmittedItem[]): GateProblem[] {
  const problems: GateProblem[] = [];
  const seen = new Set<string>();
  const rejected = new Set(ctx.show.negativeSignals.map((n) => n.qlooId));
  items.forEach((it, index) => {
    const call = ctx.ledger.get(it.call_id);
    const p = (reason: string) => problems.push({ index, entity_id: it.entity_id, reason });
    if (!call) return p(`call_id ${it.call_id} is not a Qloo call made in this run`);
    if (UNUSABLE.has(call.status)) return p(`call ${it.call_id} returned status "${call.status}", which carries no usable results`);
    if (!call.resultIds.includes(it.entity_id)) return p(`entity ${it.entity_id} does not appear in the results of call ${it.call_id}`);
    if (rejected.has(it.entity_id)) return p(`entity ${it.entity_id} was rejected by the operator on an earlier plan`);
    if (seen.has(it.entity_id)) return p(`entity ${it.entity_id} is listed twice in this slot`);
    for (const [key, slot] of ctx.slots) {
      if (key !== slotKey && slot.items.some((x) => x.pick.qlooId === it.entity_id)) return p(`entity ${it.entity_id} is already used in slot ${key}`);
    }
    if (!it.interpretation?.trim()) return p("interpretation is empty");
    seen.add(it.entity_id);
  });
  return problems;
}

export function evidenceFrom(call: LedgerCall, entityId?: string): Evidence {
  return {
    callId: call.callId,
    tool: call.tool,
    inputs: call.args,
    status: call.status,
    summary: call.summary,
    scores: entityId ? scoresFor(call, entityId) : {},
    entityId,
    endpoint: call.endpoint,
    source: call.cached ? "cache" : call.source,
    durationMs: call.durationMs,
  };
}

/** Builds plan items server-side from the ledger, so evidence can never be invented by the model. */
export function buildItems(ctx: RunContext, slotKey: string, items: SubmittedItem[]): PlanItem[] {
  return items.map((it) => {
    const call = ctx.ledger.get(it.call_id)!;
    const ent = entityInCall(call, it.entity_id)!;
    const related = ctx
      .callsMentioning(it.entity_id)
      .filter((c) => c.callId !== call.callId && !UNUSABLE.has(c.status))
      .slice(0, 3);
    const evidence = [evidenceFrom(call, it.entity_id), ...related.map((c) => evidenceFrom(c, it.entity_id))];
    const reduced = evidence.some((e) => e.status === "partial" || e.status === "degraded");
    const trend = evidence.find((e) => e.tool === "qloo_trends");
    const fit = evidence.find((e) => e.tool === "qloo_compare_audiences" && e.scores.fit !== undefined);
    return {
      id: `i_${randomUUID().slice(0, 10)}`,
      slotKey,
      pick: { name: ent.name, qlooId: ent.id, type: ent.type ?? "entity" },
      qlooSays: evidence.map((e) => qlooSaysLine(ctx.ledger.get(e.callId)!, it.entity_id)).join(" "),
      interpretation: it.interpretation.trim().slice(0, 400),
      action: (it.action ?? "").trim().slice(0, 200),
      evidence,
      confidence: reduced ? "reduced" : "high",
      isWildcard: Boolean(it.is_wildcard),
      fitScore: fit?.scores.fit,
      rising: trend ? (trend.scores.delta ?? 0) > 0 : undefined,
      approval: { state: "pending" },
    } satisfies PlanItem;
  });
}

const Verdicts = z.object({
  verdicts: z.array(
    z.object({
      index: z.number().int(),
      verdict: z.enum(["keep", "revise", "drop"]),
      revised_interpretation: z.string().describe("Only for revise: the interpretation with every unsupported claim removed."),
      reason: z.string(),
    }),
  ),
});

const CRITIC_SYSTEM = `You are the Critic in House Mix, a show-programming tool that must only say what its Qloo evidence supports.
For each plan item you get the pick, the operator-facing interpretation written by another agent, and the Qloo evidence (tool, status, scores, summary).
Rules:
- "keep" when every factual claim in the interpretation is supported by the evidence or is a clearly-labelled product judgement (e.g. "fits the build-up", "good for a sing-along") that does not assert new facts.
- "revise" when the interpretation contains claims the evidence does not support (chart positions, awards, sales, attendance, follower counts, collaborations, biographical facts, causal claims, statements about individuals). Return the interpretation with only those claims removed; keep it natural and short.
- "drop" when nothing meaningful remains after removing unsupported claims, or when the item makes claims about individual people's identity, sensitive traits or eligibility.
- Never add new claims. Affinity is a relative aggregate signal, never a probability about a person.`;

export interface CriticOutcome {
  kept: PlanItem[];
  dropped: { pick: string; reason: string }[];
  revised: number;
}

/** Claude claim check over the items that passed the evidence gate. */
export async function claimCheck(items: PlanItem[]): Promise<CriticOutcome & { costUsd: number }> {
  if (items.length === 0) return { kept: [], dropped: [], revised: 0, costUsd: 0 };
  const payload = items.map((it, index) => ({
    index,
    pick: `${it.pick.name} (${it.pick.type})`,
    interpretation: it.interpretation,
    action: it.action,
    evidence: it.evidence.map((e) => ({ tool: e.tool, status: e.status, scores: e.scores, summary: e.summary })),
  }));
  const { data, costUsd } = await structured({
    purpose: "critic",
    schema: Verdicts,
    system: CRITIC_SYSTEM,
    user: `Check these plan items:\n${JSON.stringify(payload, null, 1)}`,
  });
  const byIndex = new Map(data.verdicts.map((v) => [v.index, v]));
  const kept: PlanItem[] = [];
  const dropped: { pick: string; reason: string }[] = [];
  let revised = 0;
  items.forEach((it, i) => {
    const v = byIndex.get(i);
    if (!v || v.verdict === "keep") kept.push(it);
    else if (v.verdict === "revise" && v.revised_interpretation.trim()) {
      revised++;
      kept.push({ ...it, interpretation: v.revised_interpretation.trim() });
    } else dropped.push({ pick: it.pick.name, reason: v.reason || "unsupported by Qloo evidence" });
  });
  return { kept, dropped, revised, costUsd };
}

/** Claude check for free-text lines (crowd read interpretation, briefing lines). */
export async function checkLines(lines: string[], evidence: unknown): Promise<{ kept: string[]; keptIndex: number[]; dropped: { text: string; reason: string }[]; costUsd: number }> {
  if (lines.length === 0) return { kept: [], keptIndex: [], dropped: [], costUsd: 0 };
  const { data, costUsd } = await structured({
    purpose: "critic",
    schema: Verdicts,
    system: CRITIC_SYSTEM,
    user: `Evidence:\n${JSON.stringify(evidence, null, 1)}\n\nCheck these interpretation lines (each is one item):\n${JSON.stringify(
      lines.map((text, index) => ({ index, interpretation: text })),
      null,
      1,
    )}`,
  });
  const byIndex = new Map(data.verdicts.map((v) => [v.index, v]));
  const kept: string[] = [];
  const keptIndex: number[] = [];
  const dropped: { text: string; reason: string }[] = [];
  lines.forEach((text, i) => {
    const v = byIndex.get(i);
    if (!v || v.verdict === "keep" || (v.verdict === "revise" && v.revised_interpretation.trim())) {
      kept.push(v?.verdict === "revise" ? v.revised_interpretation.trim() : text);
      keptIndex.push(i);
    } else dropped.push({ text, reason: v.reason });
  });
  return { kept, keptIndex, dropped, costUsd };
}
