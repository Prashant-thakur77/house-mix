import type { Show } from "@housemix/shared";
import type { L0Plan } from "../apps/api/src/insights/llm-only.ts";

/** L0: the same model and the same slot brief, no Qloo tools: knowledge only. Shared with the in-app "Without Qloo" view. */
export type { L0Plan };

export async function llmOnlyPlan(show: Show): Promise<L0Plan> {
  const { llmOnlyPlan: plan } = await import("../apps/api/src/insights/llm-only.ts");
  return (await plan(show, { purpose: "eval_l0_plan" })).plan;
}
