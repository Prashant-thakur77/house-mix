import { MODES, type Counterfactual, type CounterfactualRow, type Show } from "@housemix/shared";
import { evidenceFrom } from "../agent/critic.ts";
import { config } from "../config.ts";
import { Budget, getQloo, type QlooClient } from "../qloo/client.ts";
import { entitiesOf, scoresFor } from "../qloo/normalize.ts";
import { getShow, HttpError, saveShow } from "../shows/service.ts";
import { llmOnlyPlan } from "./llm-only.ts";

/** How many picks per slot go head to head (qloo_rank takes at most 10 options). */
const PER_SIDE = 3;

/**
 * "Without Qloo": Claude plans the same brief from its own knowledge, then Qloo checks it.
 * Each LLM pick is looked up with qloo_describe (ambiguous names are reported, never auto-picked),
 * and the resolved ones are ranked against House Mix's own picks with one qloo_rank per slot
 * for tonight's bill, city and crowd phrase.
 */
export async function buildCounterfactual(show: Show, qloo: QlooClient = getQloo()): Promise<Counterfactual> {
  if (!show.plan) throw new HttpError(409, "Plan the show first.", "no_plan");
  const { plan: l0, costUsd } = await llmOnlyPlan(show, { effort: "low" });
  const tpl = MODES[show.input.mode];
  const runId = `cf_${show.id}_v${show.version}`;
  const budget = new Budget(40);
  const bill = show.entities.filter((e) => e.kind === "side" && e.status === "resolved" && e.qlooId).map((e) => e.qlooId!);
  const city = show.entities.find((e) => e.kind === "city" && e.status === "resolved")?.name ?? show.input.city;
  const phrase = show.plan.crowd.demographicPhrase;

  const slots: Counterfactual["slots"] = [];
  for (const t of tpl.slots) {
    const slot = show.plan.slots.find((s) => s.key === t.key);
    if (!slot) continue;
    const ours = slot.items.filter((i) => !i.isWildcard && (i.approval.state === "pending" || i.approval.state === "approved")).slice(0, PER_SIDE);
    const theirs = (l0.slots.find((s) => s.slot_key === t.key)?.picks ?? []).slice(0, PER_SIDE);
    const llmRows: CounterfactualRow[] = await Promise.all(
      theirs.map(async (p): Promise<CounterfactualRow> => {
        // The LLM's own labels ("(stretch)", "or …" alternatives) are not part of the name Qloo should look up.
        const lookup = p.name.replace(/\s*\((stretch|wildcard)[^)]*\)\s*$/i, "").split(/\s+or\s+/i)[0]!.trim();
        const { call } = await qloo.call("qloo_describe", { entity: lookup, type: t.targetType }, { runId, agent: "counterfactual", budget });
        const base = { name: lookup, source: "llm" as const, why: p.why, callId: call.callId };
        if (call.status === "needs_input") {
          const issue = call.issues[0];
          return { ...base, status: issue?.kind === "not_found" ? "not_found" : "ambiguous", candidates: (issue?.candidates ?? []).slice(0, 4) };
        }
        if (call.status === "error") return { ...base, status: "error", candidates: [] };
        const hit = entitiesOf(call)[0];
        if (!hit || call.status === "empty") return { ...base, status: "not_found", candidates: [] };
        return { ...base, status: "resolved", qlooId: hit.id, name: hit.name, candidates: [] };
      }),
    );
    const qlooRows: CounterfactualRow[] = ours.map((i) => ({ name: i.pick.name, source: "qloo", status: "resolved", qlooId: i.pick.qlooId, why: i.interpretation, candidates: [], callId: i.evidence[0]?.callId }));
    // A name the LLM shares with House Mix is one option, not two.
    const ids = [...new Set([...qlooRows, ...llmRows].filter((r) => r.status === "resolved" && r.qlooId).map((r) => r.qlooId!))].slice(0, 10);
    let rankEvidence: Counterfactual["slots"][number]["rankEvidence"];
    let note: string | undefined;
    if (ids.length >= 2 && bill.length) {
      const args: Record<string, unknown> = { options: ids, option_type: t.targetType, signals: bill.slice(0, 10), signal_location: city, ...(phrase ? { demographic: phrase } : {}) };
      let { call } = await qloo.call("qloo_rank", args, { runId, agent: "counterfactual", budget });
      if (call.status === "needs_input" && phrase) {
        delete args.demographic;
        ({ call } = await qloo.call("qloo_rank", args, { runId, agent: "counterfactual", budget }));
      }
      if (call.status === "error" || call.status === "needs_input" || call.status === "empty") note = `Qloo could not rank this slot (${call.status}).`;
      else {
        rankEvidence = evidenceFrom(call);
        for (const r of [...qlooRows, ...llmRows]) {
          if (!r.qlooId) continue;
          const s = scoresFor(call, r.qlooId);
          if (s.rank !== undefined) {
            r.rank = s.rank;
            if (s.affinity !== undefined) r.score = s.affinity;
          }
        }
        if (call.status !== "ok") note = `Ranked with ${call.status} Qloo coverage.`;
      }
    } else note = "Fewer than two Qloo-resolvable options, so nothing to rank.";
    const rows = [...qlooRows, ...llmRows].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
    slots.push({ key: t.key, label: t.label, rows, ...(rankEvidence ? { rankEvidence } : {}), ...(note ? { note } : {}) });
  }

  const llm = slots.flatMap((s) => s.rows.filter((r) => r.source === "llm"));
  const ranked = slots.filter((s) => s.rankEvidence);
  return {
    planVersion: show.version,
    model: config.model,
    headline: l0.headline,
    slots,
    summary: {
      llmPicks: llm.length,
      llmResolved: llm.filter((r) => r.status === "resolved").length,
      llmAmbiguous: llm.filter((r) => r.status === "ambiguous").length,
      llmNotFound: llm.filter((r) => r.status === "not_found").length,
      slotsQlooLed: ranked.filter((s) => s.rows[0]?.source === "qloo").length,
      rankedSlots: ranked.length,
    },
    costUsd: Math.round(costUsd * 10000) / 10000,
    createdAt: new Date().toISOString(),
  };
}

const inFlight = new Map<string, Promise<Counterfactual>>();

export async function counterfactualFor(showId: string, force = false): Promise<Counterfactual> {
  const show = await getShow(showId);
  if (!force && show.counterfactual && show.counterfactual.planVersion === show.version) return show.counterfactual;
  // One build per show at a time: a second click or tab waits for the same Claude call.
  const pending = inFlight.get(showId);
  if (pending) return pending;
  const job = (async () => {
    const cf = await buildCounterfactual(show);
    const fresh = await getShow(showId);
    fresh.counterfactual = cf;
    await saveShow(fresh);
    return cf;
  })().finally(() => inFlight.delete(showId));
  inFlight.set(showId, job);
  return job;
}
