import { randomUUID } from "node:crypto";
import type { PlanItem, Show } from "@housemix/shared";
import { getQloo, type QlooClient } from "../qloo/client.ts";
import { entitiesOf, qlooSaysLine, scoresFor } from "../qloo/normalize.ts";
import { MODES } from "@housemix/shared";
import { getShow, HttpError, saveShow } from "./service.ts";

function findItem(show: Show, itemId: string) {
  if (!show.plan) throw new HttpError(409, "This show has no plan yet.", "no_plan");
  for (const slot of show.plan.slots) {
    const item = slot.items.find((i) => i.id === itemId);
    if (item) return { slot, item };
  }
  throw new HttpError(404, "Plan item not found.", "not_found");
}

function assertEditable(show: Show) {
  if (show.lockedAt) throw new HttpError(409, `Plan v${show.version} is locked. Re-plan to make changes.`, "locked");
  if (show.status === "planning") throw new HttpError(409, "A plan is running for this show.", "conflict");
}

export async function approveItem(showId: string, itemId: string): Promise<Show> {
  const show = await getShow(showId);
  assertEditable(show);
  const { item } = findItem(show, itemId);
  item.approval = { state: "approved", at: new Date().toISOString() };
  return saveShow(show);
}

/** Approves every pending, high-confidence, non-stretch item; stretch and reduced-confidence picks stay for a human look. */
export async function approveConfident(showId: string): Promise<{ show: Show; approved: number }> {
  const show = await getShow(showId);
  assertEditable(show);
  if (!show.plan) throw new HttpError(409, "This show has no plan yet.", "no_plan");
  let approved = 0;
  const at = new Date().toISOString();
  for (const slot of show.plan.slots) {
    for (const item of slot.items) {
      if (item.approval.state === "pending" && !item.isWildcard && item.confidence === "high") {
        item.approval = { state: "approved", at, reason: "Bulk-approved: high confidence" };
        approved++;
      }
    }
  }
  return { show: await saveShow(show), approved };
}

export async function resetItem(showId: string, itemId: string): Promise<Show> {
  const show = await getShow(showId);
  assertEditable(show);
  const { item } = findItem(show, itemId);
  if (item.approval.state === "swapped") throw new HttpError(409, "A swapped item cannot be restored; approve or reject its replacement.", "conflict");
  if (item.approval.state === "rejected") show.negativeSignals = show.negativeSignals.filter((n) => n.qlooId !== item.pick.qlooId);
  item.approval = { state: "pending" };
  return saveShow(show);
}

export async function rejectItem(showId: string, itemId: string, reason: string): Promise<Show> {
  const show = await getShow(showId);
  assertEditable(show);
  const { slot, item } = findItem(show, itemId);
  const why = reason.trim().slice(0, 240) || "Rejected by the operator";
  item.approval = { state: "rejected", reason: why, at: new Date().toISOString() };
  if (!show.negativeSignals.some((n) => n.qlooId === item.pick.qlooId)) {
    show.negativeSignals.push({ qlooId: item.pick.qlooId, name: item.pick.name, reason: why, slotKey: slot.key });
  }
  return saveShow(show);
}

/**
 * Swap: re-ranks the slot's remaining alternatives for the same crowd with qloo_rank and puts the
 * best one in place of the item. Rejected entities and picks already in the plan are excluded.
 */
export async function swapItem(showId: string, itemId: string, qloo: QlooClient = getQloo()): Promise<{ show: Show; replacement: PlanItem }> {
  const show = await getShow(showId);
  assertEditable(show);
  const { slot, item } = findItem(show, itemId);
  const used = new Set(show.plan!.slots.flatMap((s) => s.items.filter((i) => i.approval.state !== "swapped").map((i) => i.pick.qlooId)));
  const rejected = new Set(show.negativeSignals.map((n) => n.qlooId));
  const options = slot.alternatives.filter((a) => !used.has(a.qlooId) && !rejected.has(a.qlooId)).slice(0, 10);
  if (options.length === 0) throw new HttpError(409, "No Qloo-backed alternatives left for this slot. Re-plan the show for fresh candidates.", "no_alternatives");

  const tpl = MODES[show.input.mode].slots.find((s) => s.key === slot.key);
  const optionType = (options[0]!.type && options[0]!.type !== "entity" ? options[0]!.type : tpl?.targetType) ?? item.pick.type;
  const bill = show.entities.filter((e) => e.kind === "side" && e.status === "resolved" && e.qlooId).map((e) => e.qlooId!);
  const phrase = show.plan!.crowd.demographicPhrase;
  const args: Record<string, unknown> = {
    options: options.map((o) => o.qlooId),
    option_type: optionType,
    signals: bill.slice(0, 10),
    signal_location: show.input.city,
    ...(phrase ? { demographic: phrase } : {}),
  };
  let { call } = await qloo.call("qloo_rank", args, { runId: `swap_${show.id}`, agent: "swap" });
  if (call.status === "needs_input" && phrase) {
    // The crowd phrase could not be mapped: rank without it rather than guessing.
    delete args.demographic;
    ({ call } = await qloo.call("qloo_rank", args, { runId: `swap_${show.id}`, agent: "swap" }));
  }
  if (call.status === "error") throw new HttpError(502, `Qloo rank failed: ${call.error?.recovery ?? call.summary}`, "qloo_error");
  const best = entitiesOf(call)[0];
  if (!best) throw new HttpError(409, "Qloo returned no ranking for the remaining alternatives.", "no_alternatives");

  const replacement: PlanItem = {
    id: `i_${randomUUID().slice(0, 10)}`,
    slotKey: slot.key,
    pick: { name: best.name, qlooId: best.id, type: best.type ?? optionType },
    qlooSays: qlooSaysLine(call, best.id),
    interpretation: `Swapped in for ${item.pick.name}: the top remaining option when Qloo re-ranked ${options.length} alternatives for this crowd.`,
    action: item.action,
    evidence: [
      {
        callId: call.callId,
        tool: call.tool,
        inputs: call.args,
        status: call.status,
        summary: call.summary,
        scores: scoresFor(call, best.id),
        entityId: best.id,
        endpoint: call.endpoint,
        source: call.cached ? "cache" : call.source,
        durationMs: call.durationMs,
      },
    ],
    confidence: call.status === "ok" ? "high" : "reduced",
    isWildcard: item.isWildcard,
    approval: { state: "pending" },
  };
  item.approval = { state: "swapped", at: new Date().toISOString(), replacedBy: replacement.id };
  slot.items.splice(slot.items.indexOf(item) + 1, 0, replacement);
  slot.alternatives = slot.alternatives.filter((a) => a.qlooId !== best.id);
  return { show: await saveShow(show), replacement };
}

export async function lockPlan(showId: string): Promise<Show> {
  const show = await getShow(showId);
  if (!show.plan) throw new HttpError(409, "Nothing to lock yet.", "no_plan");
  if (show.lockedAt) return show;
  const pending = show.plan.slots.flatMap((s) => s.items).filter((i) => i.approval.state === "pending").length;
  if (pending > 0) throw new HttpError(409, `${pending} item${pending === 1 ? "" : "s"} still pending. Approve, swap or reject every item before locking.`, "pending_items");
  show.lockedAt = new Date().toISOString();
  show.status = "locked";
  return saveShow(show);
}

export async function unlockPlan(showId: string): Promise<Show> {
  const show = await getShow(showId);
  if (!show.lockedAt) return show;
  show.lockedAt = undefined;
  show.status = "planned";
  return saveShow(show);
}
