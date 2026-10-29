import type { Show } from "@housemix/shared";
import type { L0Plan } from "../baselines.ts";

/** The rater sees the same fields for both plans: slot, picks, one reason, one action. No labels, no evidence chips. */
export interface BlindPlan {
  slots: { key: string; label: string; picks: { name: string; why: string; action: string }[] }[];
}

export function blindFromHouseMix(show: Show): BlindPlan {
  return {
    slots: (show.plan?.slots ?? []).map((s) => ({
      key: s.key,
      label: s.label,
      picks: s.items.filter((i) => i.approval.state !== "swapped").map((i) => ({ name: i.pick.name, why: i.interpretation, action: i.action })),
    })),
  };
}

export function blindFromL0(show: Show, plan: L0Plan): BlindPlan {
  const labels = new Map((show.plan?.slots ?? []).map((s) => [s.key, s.label]));
  return { slots: plan.slots.map((s) => ({ key: s.slot_key, label: labels.get(s.slot_key) ?? s.slot_key, picks: s.picks.map((p) => ({ name: p.name, why: p.why, action: p.action })) })) };
}
