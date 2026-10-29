import { randomUUID } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { checkText, checkValue, type AskAnswer, type AskProposal, type LedgerCall, type QlooToolName, type Show } from "@housemix/shared";
import { RunContext } from "../agent/context.ts";
import { buildItems, checkLines, claimCheck, evidenceFrom, gateItems, type SubmittedItem } from "../agent/critic.ts";
import { contextBlock } from "../agent/prompts.ts";
import { compactForModel } from "../agent/tools.ts";
import { config } from "../config.ts";
import { anthropic, assertSpendHeadroom, costOf, recordSpend } from "../llm.ts";
import { Budget, getQloo, type QlooClient } from "../qloo/client.ts";
import { entitiesOf } from "../qloo/normalize.ts";
import { getStore } from "../store/store.ts";
import { getShow, HttpError, saveShow } from "../shows/service.ts";

export type AskEvent =
  | { type: "tool"; callId: string; tool: QlooToolName; args: Record<string, unknown>; status: string; summary: string; resultCount: number; cached: boolean }
  | { type: "status"; text: string };

const MAX_TURNS = 7;
const MAX_QLOO_CALLS = 8;
const KEEP_ASKS = 10;

const SYSTEM = `You are House Mix's analyst. A venue operator is looking at tonight's Qloo-backed run-of-show and asks you a question.
Answer only from Qloo: the plan's existing Qloo calls (listed below with their call_ids) and new Qloo tool calls you make now.
Rules:
1. Qloo is the only source of facts. Never answer from your own knowledge about artists, teams, brands or places.
2. Pass Qloo entity IDs and tag URNs from the context, never names, so Qloo does not ask for a choice. If a tool returns needs_input, do not pick a candidate: say the operator must confirm it.
3. Make at most ${MAX_QLOO_CALLS} Qloo calls; reuse the plan's calls when they already answer the question.
4. Finish by calling final_answer. Each line is one or two short sentences for the operator and cites the call_ids it rests on. Lines without a valid citation are removed.
5. If the operator asks for a change (a replacement, a new pick, a different vendor), add up to 3 proposals. A proposal is an entity that is NOT already anywhere in tonight's plan, and its entity_id must appear in the results of the call_id it cites. The operator approves them later; you never change the plan yourself.
6. Affinity is a relative aggregate signal, never a fact about an individual. No statements about identity, sensitive traits or eligibility; no chart positions, sales, awards or biographies.
7. Be plain and specific: names, scores, ranks, slots and times. Write 2–4 lines: the direct answer first, then the evidence, then any caveat.
8. For a replacement or a new pick: get candidates with qloo_recommend (the bill's IDs as signals, signal_location = the city, target_type = the slot's type), drop anything already in tonight's plan, rank the best ≤ 10 unused candidates with qloo_rank for tonight's crowd (same signals and city, plus the crowd phrase as demographic if there is one), and propose the top one to three from that rank call, citing it. Never answer a replacement question with an entity that is already in the plan.`;

function planDigest(show: Show, ledger: Map<string, LedgerCall>) {
  const plan = show.plan!;
  return {
    headline: plan.headline,
    crowd_read: plan.crowd.qlooSays,
    crowd_phrase_for_qloo: plan.crowd.demographicPhrase || null,
    slots: plan.slots.map((s) => ({
      slot_key: s.key,
      label: s.label,
      time: s.timeRange,
      picks: s.items
        .filter((i) => i.approval.state !== "swapped")
        .map((i) => ({ name: i.pick.name, entity_id: i.pick.qlooId, type: i.pick.type, state: i.approval.state, stretch: i.isWildcard, qloo_says: i.qlooSays, call_ids: i.evidence.map((e) => e.callId) })),
      alternatives: s.alternatives.slice(0, 6).map((a) => ({ name: a.name, entity_id: a.qlooId, call_id: a.callId })),
    })),
    plan_calls: [...ledger.values()]
      .filter((c) => c.status !== "error")
      .map((c) => ({
        call_id: c.callId,
        tool: c.tool,
        status: c.status,
        args: c.args,
        top_results: entitiesOf(c)
          .slice(0, 5)
          .map((e) => ({ id: e.id, name: e.name, ...(e.affinity !== undefined ? { affinity: Number(e.affinity.toFixed(2)) } : {}) })),
      })),
  };
}

function finalAnswerTool(slotKeys: string[]): Anthropic.Tool {
  return {
    name: "final_answer",
    description: "Submit the answer for the operator. Every line cites call_ids; proposals are optional plan changes for the approval queue.",
    input_schema: {
      type: "object",
      properties: {
        lines: {
          type: "array",
          minItems: 1,
          maxItems: 6,
          items: {
            type: "object",
            properties: { text: { type: "string", maxLength: 320 }, call_ids: { type: "array", items: { type: "string" }, minItems: 1 } },
            required: ["text", "call_ids"],
          },
        },
        proposals: {
          type: "array",
          maxItems: 3,
          items: {
            type: "object",
            properties: {
              slot_key: { type: "string", enum: slotKeys },
              entity_id: { type: "string" },
              call_id: { type: "string" },
              interpretation: { type: "string", maxLength: 300 },
              action: { type: "string", maxLength: 200 },
            },
            required: ["slot_key", "entity_id", "call_id", "interpretation"],
          },
        },
      },
      required: ["lines"],
    },
  };
}

/** The chat sees the same tools with shorter text: first two sentences, and no per-field descriptions or examples. */
function firstSentences(d: string): string {
  return (d.match(/[^.!?]+[.!?]+/g)?.slice(0, 2).join("") ?? d).trim().slice(0, 320);
}
function leanSchema(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(leanSchema);
  if (!v || typeof v !== "object") return v;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) {
    if (k === "examples" || k === "$schema" || (k === "description" && typeof x === "string")) continue;
    out[k] = k === "properties" ? Object.fromEntries(Object.entries(x as object).map(([pk, pv]) => [pk, leanSchema(pv)])) : leanSchema(x);
  }
  return out;
}

interface FinalInput {
  lines?: { text: string; call_ids: string[] }[];
  proposals?: { slot_key: string; entity_id: string; call_id: string; interpretation: string; action?: string }[];
}

export async function askShow(showId: string, question: string, emit: (e: AskEvent) => void, qloo: QlooClient = getQloo()): Promise<AskAnswer> {
  const q = question.trim();
  if (q.length < 3 || q.length > 400) throw new HttpError(400, "Ask a question between 3 and 400 characters.");
  const guard = checkText(q);
  if (!guard.ok) throw new HttpError(422, guard.message ?? "That question cannot be sent to Qloo.", "guardrail");
  await assertSpendHeadroom();
  const show = await getShow(showId);
  if (!show.plan) throw new HttpError(409, "Plan the show first.", "no_plan");

  const askId = `a_${randomUUID().slice(0, 10)}`;
  const runId = `ask_${show.id}_${askId}`;
  const ctx = new RunContext(show, runId, () => {});
  for (const s of show.plan.slots) ctx.slots.set(s.key, structuredClone(s));
  for (const c of await getStore().list<LedgerCall>("ledger", { where: ["runId", show.plan.runId] })) ctx.ledger.set(c.callId, c);
  const planCallIds = new Set(ctx.ledger.keys());
  const budget = new Budget(MAX_QLOO_CALLS);

  const qlooTools = (await qloo.listTools()).filter((t) => t.name !== "qloo_capabilities");
  const tools: Anthropic.Tool[] = [
    ...qlooTools.map((t) => ({ name: t.name, description: firstSentences(t.description ?? t.name), input_schema: leanSchema(t.inputSchema) as Anthropic.Tool.InputSchema })),
    { ...finalAnswerTool([...ctx.slots.keys()]), cache_control: { type: "ephemeral" } },
  ];
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: SYSTEM },
    { type: "text", text: `CONTEXT (confirmed by the operator; IDs only):\n${contextBlock(ctx)}\n\nTONIGHT'S PLAN:\n${JSON.stringify(planDigest(show, ctx.ledger))}`, cache_control: { type: "ephemeral" } },
  ];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: q }];

  let costUsd = 0;
  let final: FinalInput | undefined;
  emit({ type: "status", text: "Reading tonight's plan" });
  try {
    for (let turn = 0; turn < MAX_TURNS && !final; turn++) {
      const last = turn === MAX_TURNS - 1 || budget.used >= MAX_QLOO_CALLS;
      const res = await anthropic().messages.create({
        model: config.model,
        max_tokens: 3000,
        system,
        tools,
        messages,
        output_config: { effort: "low" },
        ...(last ? { tool_choice: { type: "tool" as const, name: "final_answer" } } : {}),
      });
      costUsd += costOf(config.model, res.usage);
      if (process.env.HM_DEBUG_USAGE) console.error("ask usage", JSON.stringify(res.usage));
      messages.push({ role: "assistant", content: res.content });
      const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (!uses.length) {
        messages.push({ role: "user", content: "Call final_answer now, citing call_ids." });
        continue;
      }
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const u of uses) {
        if (u.name === "final_answer") {
          final = u.input as FinalInput;
          results.push({ type: "tool_result", tool_use_id: u.id, content: "Received." });
          continue;
        }
        const args = (u.input ?? {}) as Record<string, unknown>;
        const g = checkValue(args);
        if (!g.ok) {
          results.push({ type: "tool_result", tool_use_id: u.id, content: `Blocked: ${g.detail}. ${g.message}`, is_error: true });
          continue;
        }
        const { call, envelope } = await qloo.call(u.name as Exclude<QlooToolName, "qloo_capabilities">, args, { runId, agent: "ask", budget });
        ctx.ledger.set(call.callId, call);
        emit({ type: "tool", callId: call.callId, tool: call.tool, args: call.args, status: call.status, summary: call.summary || envelope.error?.recovery || "", resultCount: call.resultIds.length, cached: call.cached });
        results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(compactForModel(call, envelope)), ...(call.status === "error" ? { is_error: true } : {}) });
      }
      if (!final) messages.push({ role: "user", content: results });
    }
  } finally {
    await recordSpend("ask", costUsd);
  }
  // The tool input is model output: tolerate a bare string line or a missing call_ids field.
  const rawLines = (Array.isArray(final?.lines) ? final.lines : []) as unknown[];
  const parsed = rawLines
    .map((l) => (typeof l === "string" ? { text: l, call_ids: [] } : (l as { text?: unknown; call_ids?: unknown })))
    .filter((l): l is { text: string; call_ids?: unknown } => typeof l?.text === "string" && l.text.trim().length > 0);
  if (!parsed.length) throw new HttpError(502, "House Mix could not finish an answer. Try a narrower question.", "no_answer");

  emit({ type: "status", text: "Critic is checking the answer" });
  const dropped: AskAnswer["dropped"] = [];
  const cited = parsed.map((l) => ({ text: l.text.trim(), callIds: [...new Set(Array.isArray(l.call_ids) ? l.call_ids.map(String) : [])].filter((id) => ctx.ledger.has(id)) }));
  const withCalls = cited.filter((l) => {
    if (l.callIds.length) return true;
    dropped.push({ text: l.text, reason: "Cites no Qloo call from this plan or this answer." });
    return false;
  });
  const facts = [...new Set(withCalls.flatMap((l) => l.callIds))].map((id) => {
    const c = ctx.ledger.get(id)!;
    return { tool: c.tool, args: c.args, ...compactForModel(c, { status: c.status, summary: c.summary, results: c.results, result_count: c.resultIds.length, ...(c.error ? { error: c.error } : {}) }) };
  });
  const checked = await checkLines(withCalls.map((l) => l.text), facts);
  costUsd += checked.costUsd;
  dropped.push(...checked.dropped);
  const lines = checked.keptIndex.map((idx, k) => ({ text: checked.kept[k]!, callIds: withCalls[idx]!.callIds }));

  const proposals: AskProposal[] = [];
  for (const p of Array.isArray(final?.proposals) ? final.proposals : []) {
    if (!p || typeof p.entity_id !== "string" || typeof p.call_id !== "string" || typeof p.interpretation !== "string") continue;
    const slot = ctx.slots.get(p.slot_key);
    if (!slot) continue;
    const item: SubmittedItem = { entity_id: p.entity_id, call_id: p.call_id, interpretation: p.interpretation, action: p.action };
    const problems = gateItems(ctx, p.slot_key, [item]);
    if (slot.items.some((i) => i.pick.qlooId === p.entity_id && i.approval.state !== "swapped" && i.approval.state !== "rejected")) problems.push({ index: 0, entity_id: p.entity_id, reason: "already in this slot" });
    if (problems.length) {
      dropped.push({ text: `Proposal for ${slot.label}: ${ctx.nameOf(p.entity_id)}`, reason: problems[0]!.reason.replace(p.entity_id, ctx.nameOf(p.entity_id)) });
      continue;
    }
    const verdict = await claimCheck(buildItems(ctx, p.slot_key, [item]));
    costUsd += verdict.costUsd;
    for (const d of verdict.dropped) dropped.push({ text: `Proposal for ${slot.label}: ${d.pick}`, reason: d.reason });
    for (const it of verdict.kept) proposals.push({ id: `p_${randomUUID().slice(0, 8)}`, slotKey: p.slot_key, item: it, state: "open" });
  }

  const answer: AskAnswer = {
    id: askId,
    question: q,
    lines,
    dropped,
    calls: [...ctx.ledger.values()].filter((c) => !planCallIds.has(c.callId) || lines.some((l) => l.callIds.includes(c.callId))).map((c) => evidenceFrom(c)),
    proposals,
    planVersion: show.version,
    costUsd: Math.round(costUsd * 10000) / 10000,
    at: new Date().toISOString(),
  };
  const fresh = await getShow(showId);
  fresh.asks = [answer, ...(fresh.asks ?? [])].slice(0, KEEP_ASKS);
  await saveShow(fresh);
  return answer;
}
