import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { parseDemographic, phraseFromAges, type CrowdRead, type Evidence, type LedgerCall, type QlooToolName } from "@housemix/shared";
import type { Envelope, QlooClient } from "../qloo/client.ts";
import { compareOf, demographicsOf, entitiesOf, heatmapOf, trendsOf } from "../qloo/normalize.ts";
import { toShape } from "./jsonschema-zod.ts";
import { buildItems, checkLines, claimCheck, gateItems, type SubmittedItem } from "./critic.ts";
import type { RunContext } from "./context.ts";

const text = (value: unknown, isError = false) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }], ...(isError ? { isError: true } : {}) });

const STATUS_NOTE: Record<string, string> = {
  ok: "Use these results.",
  empty: "No Qloo signal for this input. Do not invent a substitute.",
  needs_input: "Qloo needs a choice. Do NOT pick a candidate yourself: drop this input and use confirmed IDs from the CONTEXT.",
  partial: "Some results came back. Usable with reduced confidence; mention it.",
  degraded: "Results came back with reduced quality. Usable with reduced confidence; mention it.",
  error: "The call failed (retryable errors were already retried). Report it with report_slot_issue if it blocks your slot.",
};

/** What the model sees from a Qloo call: compact, ID-first, with the call_id to cite. */
export function compactForModel(call: LedgerCall, envelope: Envelope) {
  const base = { call_id: call.callId, status: call.status, note: STATUS_NOTE[call.status], ...(envelope.summary ? { summary: envelope.summary } : {}), ...(call.warnings.length ? { warnings: call.warnings } : {}) };
  if (call.status === "error") return { ...base, error: call.error };
  if (call.status === "needs_input") return { ...base, unresolved_inputs: call.issues.map((i) => ({ input: i.input, field: i.field, kind: i.kind })) };
  switch (call.tool) {
    case "qloo_where_popular":
      return { ...base, areas: heatmapOf(call).map((p) => ({ area_id: p.id, lat: p.latitude, lon: p.longitude, affinity: p.affinity })) };
    case "qloo_compare_audiences": {
      const rows = compareOf(call).rows;
      return { ...base, concepts: rows.map((r) => ({ id: r.id, name: r.name, a: r.a, b: r.b, delta: Number(r.delta.toFixed(3)) })) };
    }
    case "qloo_audience_demographics":
      return { ...base, ...demographicsOf(call), scale: "relative affinity, -1..1, aggregate only" };
    case "qloo_trends":
      return { ...base, series: trendsOf(call).map((s) => ({ entity_id: s.id, name: s.name, first: s.points[0]?.value, last: s.points[s.points.length - 1]?.value, delta: Number(s.delta.toFixed(4)) })) };
    default:
      return {
        ...base,
        results: entitiesOf(call).map((e) => ({
          ...(call.tool === "qloo_find_tags" || call.tool === "qloo_entity_tags" ? { tag_urn: e.id } : { entity_id: e.id }),
          name: e.name,
          ...(e.type ? { type: e.type } : {}),
          ...(e.affinity !== undefined ? { affinity: Number(e.affinity.toFixed(3)) } : {}),
          ...(e.popularity !== undefined ? { popularity: Number(e.popularity.toFixed(3)) } : {}),
          ...(e.description ? { about: e.description.slice(0, 80) } : {}),
        })),
      };
  }
}

/** In-process proxy exposing the real `qloo mcp` tools (same names, schemas, descriptions) through QlooClient. */
export async function qlooProxyServer(ctx: RunContext, qloo: QlooClient) {
  const listed = await qloo.listTools();
  const tools = listed
    .filter((t) => t.name !== "qloo_capabilities")
    .map((t) =>
      tool(t.name, t.description ?? t.name, toShape(t.inputSchema as never), async (args: Record<string, unknown>) => {
        const name = t.name as Exclude<QlooToolName, "qloo_capabilities">;
        const agent = ctx.takeAgent(`mcp__qloo__${name}`, args);
        const { call, envelope } = await qloo.call(name, args, {
          runId: ctx.runId,
          agent,
          budget: ctx.budget,
          onCall: (c, env) => {
            ctx.ledger.set(c.callId, c);
            ctx.toolsUsed.add(c.tool);
            ctx.emit({
              type: "tool_call",
              at: ctx.now(),
              callId: c.callId,
              agent: c.agent,
              tool: c.tool,
              args: c.args,
              status: c.status,
              summary: c.summary || env.error?.recovery || "",
              durationMs: c.durationMs,
              cached: c.cached,
              attempts: c.attempts,
              resultCount: c.resultIds.length,
            });
            ctx.emit({ type: "budget", at: ctx.now(), used: ctx.budget.used, cap: ctx.budget.cap, cacheHits: ctx.budget.cacheHits });
          },
        });
        return text(compactForModel(call, envelope), call.status === "error");
      }),
    );
  return createSdkMcpServer({ name: "qloo", version: "0.1.26", tools, alwaysLoad: true });
}

const ItemShape = z.object({
  entity_id: z.string().describe("Qloo entity ID of the pick, exactly as returned by the cited call."),
  call_id: z.string().describe("call_id of the Qloo call whose results contain entity_id (prefer the rank call)."),
  interpretation: z.string().max(400).describe("1–2 sentences of programming judgement grounded in the Qloo results."),
  action: z.string().max(200).describe("One concrete instruction for the crew: when, where, how."),
  is_wildcard: z.boolean().default(false),
});

function evidenceOf(call: LedgerCall): Evidence {
  return { callId: call.callId, tool: call.tool, inputs: call.args, status: call.status, summary: call.summary, scores: {}, endpoint: call.endpoint, source: call.cached ? "cache" : call.source, durationMs: call.durationMs };
}

/** Builds the crowd read charts from the run's Qloo calls (server-side, never from model text). */
export function buildCrowd(ctx: RunContext, phrase: string, interpretation: string[], citedIds: string[]): CrowdRead {
  const calls = [...ctx.ledger.values()].filter((c) => c.status !== "error" && c.status !== "needs_input" && c.status !== "empty");
  const cited = calls.filter((c) => citedIds.includes(c.callId));
  const pick = <T extends QlooToolName>(tool: T) => cited.find((c) => c.tool === tool) ?? calls.find((c) => c.tool === tool);
  const cmp = pick("qloo_compare_audiences");
  const demo = pick("qloo_audience_demographics");
  const tags = pick("qloo_entity_tags");
  const tr = pick("qloo_trends");
  const rows = cmp ? compareOf(cmp).rows : [];
  const nameOf = (ids: string[]) => ids.map((id) => ctx.show.entities.find((e) => e.qlooId === id)?.name ?? id).join(" + ");
  const groupA = cmp ? ((cmp.args.group_a as string[]) ?? []) : [];
  const groupB = cmp ? ((cmp.args.group_b as string[]) ?? []) : [];
  const shared = rows.filter((r) => r.a >= 0.4 && r.b >= 0.4 && Math.abs(r.delta) < 0.25).sort((x, y) => y.a + y.b - (x.a + x.b));
  const distinctA = rows.filter((r) => r.delta >= 0.25).sort((x, y) => y.delta - x.delta);
  const distinctB = rows.filter((r) => r.delta <= -0.25).sort((x, y) => x.delta - y.delta);
  const toRow = (r: (typeof rows)[number], score: number) => ({ name: r.name, qlooId: r.id, type: r.type ?? "tag", score: Number(score.toFixed(3)) });
  const d = demo ? demographicsOf(demo) : { age: [], gender: [] };
  const tagList = tags ? entitiesOf(tags).map((t) => ({ name: t.name, tagId: t.id, score: Number((t.affinity ?? 0).toFixed(3)) })) : [];
  const trends = tr ? trendsOf(tr).map((s) => ({ name: s.name, qlooId: s.id, points: s.points, delta: Number(s.delta.toFixed(4)) })) : [];
  const says: string[] = [];
  if (cmp) {
    says.push(
      `compare_audiences (${nameOf(groupA)} vs ${nameOf(groupB)}): ${shared.length} shared concepts${shared[0] ? `, led by ${shared.slice(0, 3).map((r) => r.name).join(", ")}` : ""}; ${distinctA.length} lean to the first group, ${distinctB.length} to the second.`,
    );
  }
  if (d.age.length) {
    const top = [...d.age].sort((x, y) => y.value - x.value)[0]!;
    says.push(`audience_demographics: strongest relative age affinity is ${top.bucket.replaceAll("_", " ")} (${top.value.toFixed(2)} on a −1..1 scale); aggregate only.`);
  }
  if (tagList.length) says.push(`entity_tags: top concepts ${tagList.slice(0, 4).map((t) => `${t.name} (${t.score.toFixed(2)})`).join(", ")}.`);
  if (trends.length) says.push(`trends: ${trends.map((t) => `${t.name} ${t.delta >= 0 ? "+" : ""}${t.delta.toFixed(3)} percentile`).join("; ")} over the window.`);
  const used = [cmp, demo, tags, tr].filter((c): c is LedgerCall => Boolean(c));
  const reduced = used.some((c) => c.status === "partial" || c.status === "degraded");
  return {
    sharedGround: shared.slice(0, 8).map((r) => toRow(r, (r.a + r.b) / 2)),
    distinctA: distinctA.slice(0, 6).map((r) => toRow(r, r.delta)),
    distinctB: distinctB.slice(0, 6).map((r) => toRow(r, -r.delta)),
    labelA: nameOf(groupA),
    labelB: nameOf(groupB),
    demographics: d,
    tags: tagList,
    trends,
    // The phrase sent back to Qloo is derived from Qloo's own age distribution, never guessed.
    demographicPhrase: phraseFromAges(d.age) || (parseDemographic(phrase) ? phrase : ""),
    qlooSays: says,
    interpretation,
    evidence: used.map(evidenceOf),
    confidence: reduced ? "reduced" : used.length ? "high" : "low",
  };
}

/** House Mix's own tools: structured submission with the evidence gate and the Critic. */
export function houseMixServer(ctx: RunContext) {
  const slotKeys = [...ctx.slots.keys()] as [string, ...string[]];
  return createSdkMcpServer({
    name: "housemix",
    version: "1.0.0",
    alwaysLoad: true,
    tools: [
      tool(
        "submit_crowd_read",
        "Submit tonight's crowd read. Charts are built server-side from your cited Qloo calls; you supply the demographic phrase and short interpretation lines.",
        {
          demographic_phrase: z.string().max(60).optional().describe("Optional. The server derives the phrase from the demographics result."),
          interpretation: z.array(z.string().max(220)).max(4),
          call_ids: z.array(z.string()).min(1),
        },
        async (args) => {
          const unknown = args.call_ids.filter((id) => !ctx.ledger.has(id));
          if (unknown.length === args.call_ids.length) return text({ accepted: false, reason: `None of these call_ids exist in this run: ${unknown.join(", ")}` }, true);
          const draft = buildCrowd(ctx, args.demographic_phrase ?? "", [], args.call_ids);
          const checked = await checkLines(args.interpretation, { qloo_says: draft.qlooSays, tags: draft.tags.slice(0, 8), shared: draft.sharedGround, demographics: draft.demographics });
          ctx.costUsd += checked.costUsd;
          for (const d of checked.dropped) {
            ctx.criticDrops++;
            ctx.emit({ type: "critic", at: ctx.now(), slotKey: "crowd", pick: d.text.slice(0, 80), reason: d.reason });
          }
          ctx.crowd = { ...draft, interpretation: checked.kept };
          ctx.emit({ type: "crowd", at: ctx.now(), crowd: ctx.crowd });
          return text({ accepted: true, demographic_phrase_for_qloo: ctx.crowd.demographicPhrase || null, top_tags: draft.tags.slice(0, 3).map((t) => ({ tag_urn: t.tagId, name: t.name })), kept_lines: checked.kept.length, dropped_lines: checked.dropped, qloo_says: draft.qlooSays });
        },
      ),
      tool(
        "submit_slot",
        "Submit picks for one run-of-show slot. Every item must cite a Qloo call_id from this run whose results contain its entity_id. Items are checked by the Critic; unsupported ones are removed.",
        { slot_key: z.enum(slotKeys), items: z.array(ItemShape).min(1).max(8), note: z.string().max(240).optional() },
        async (args) => {
          const slot = ctx.slots.get(args.slot_key)!;
          const items = args.items as SubmittedItem[];
          const problems = gateItems(ctx, args.slot_key, items);
          const bad = new Set(problems.map((p) => p.index));
          for (const p of problems) {
            ctx.criticDrops++;
            ctx.emit({ type: "critic", at: ctx.now(), slotKey: args.slot_key, pick: p.entity_id, reason: p.reason });
          }
          const built = buildItems(ctx, args.slot_key, items.filter((_, i) => !bad.has(i)));
          const verdict = await claimCheck(built);
          ctx.costUsd += verdict.costUsd;
          for (const d of verdict.dropped) {
            ctx.criticDrops++;
            ctx.emit({ type: "critic", at: ctx.now(), slotKey: args.slot_key, pick: d.pick, reason: d.reason });
          }
          const replaced = new Set(verdict.kept.map((k) => k.pick.qlooId));
          slot.items = [...slot.items.filter((x) => !replaced.has(x.pick.qlooId)), ...verdict.kept].sort((a, b) => Number(a.isWildcard) - Number(b.isWildcard));
          // Alternatives for "swap": everything else the cited rank/recommend calls returned.
          const pickedIds = new Set([...ctx.slots.values()].flatMap((s) => s.items.map((i) => i.pick.qlooId)));
          const sourceCalls = [...new Set(items.map((i) => i.call_id))].map((id) => ctx.ledger.get(id)).filter((c): c is LedgerCall => Boolean(c));
          const alts = new Map(slot.alternatives.map((a) => [a.qlooId, a]));
          for (const c of sourceCalls) {
            for (const e of entitiesOf(c)) {
              if (!pickedIds.has(e.id) && !alts.has(e.id)) alts.set(e.id, { qlooId: e.id, name: e.name, type: e.type ?? "entity", callId: c.callId, score: e.affinity });
            }
          }
          slot.alternatives = [...alts.values()].filter((a) => !pickedIds.has(a.qlooId)).slice(0, 12);
          if (args.note) slot.note = args.note;
          slot.status = slot.items.length ? "ready" : "needs_manual_input";
          ctx.emit({ type: "slot", at: ctx.now(), slot });
          const rejected = [...problems.map((p) => ({ entity_id: p.entity_id, reason: p.reason })), ...verdict.dropped.map((d) => ({ entity_id: d.pick, reason: d.reason }))];
          return text({ accepted: verdict.kept.map((k) => k.pick.name), revised_by_critic: verdict.revised, rejected });
        },
      ),
      tool(
        "report_slot_issue",
        "Mark a slot as needing manual input when Qloo could not support it (error, empty or unresolved inputs). Include Qloo's recovery text.",
        { slot_key: z.enum(slotKeys), reason: z.string().max(300) },
        async (args) => {
          const slot = ctx.slots.get(args.slot_key)!;
          slot.note = args.reason;
          if (!slot.items.length) slot.status = "needs_manual_input";
          ctx.emit({ type: "slot", at: ctx.now(), slot });
          return text({ recorded: true });
        },
      ),
      tool("get_plan_state", "Current picks per slot (names, IDs, target types).", {}, async () =>
        text(
          ctx.template.slots.map((t) => ({
            slot_key: t.key,
            target_type: t.targetType,
            picks: ctx.slots.get(t.key)!.items.map((i) => ({ entity_id: i.pick.qlooId, name: i.pick.name, wildcard: i.isWildcard })),
          })),
        ),
      ),
      tool("submit_plan_summary", "Submit the plan headline (≤ 120 characters).", { headline: z.string().max(160) }, async (args) => {
        ctx.headline = args.headline.trim();
        return text({ recorded: true });
      }),
    ],
  });
}
