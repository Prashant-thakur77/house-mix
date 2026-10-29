import { z } from "zod";
import { MODES, slotTime, type Show } from "@housemix/shared";

/** L0: the same model and the same slot brief, no Qloo tools: knowledge only. */
export const L0Plan = z.object({
  headline: z.string(),
  slots: z.array(z.object({ slot_key: z.string(), picks: z.array(z.object({ name: z.string(), type: z.string(), why: z.string(), action: z.string() })) })),
});
export type L0Plan = z.infer<typeof L0Plan>;

export async function llmOnlyPlan(show: Show): Promise<L0Plan> {
  const { structured } = await import("../apps/api/src/llm.ts");
  const tpl = MODES[show.input.mode];
  const slots = tpl.slots.map((t) => ({ slot_key: t.key, label: t.label, time: slotTime(show.input.doorsTime ?? "18:30", t.offsetMin, t.lengthMin), brief: t.brief, target_type: t.targetType, picks: t.picks }));
  const { data } = await structured({
    purpose: "eval_l0_plan",
    schema: L0Plan,
    system:
      "You are programming a live event for tonight's aggregate crowd. Use only your own knowledge (no tools). For each slot give the requested number of picks, best first, plus one deliberately adjacent 'stretch' pick, each with a one-sentence why and one concrete crew action.",
    user: JSON.stringify({ show: show.title, mode: show.input.mode, venue: show.input.venue, city: show.input.city, date: show.input.date, bill: show.input.sides, slots }, null, 1),
    effort: "medium",
  });
  return data;
}
