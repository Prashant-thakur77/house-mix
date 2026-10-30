import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { config } from "./config.ts";
import { getStore } from "./store/store.ts";
import { userKeyRequired, visitorKey } from "./keys.ts";

/** USD per million tokens (input, output, cache read). */
const PRICES: Record<string, [number, number, number]> = {
  "claude-sonnet-5-5": [2, 10, 0.2],
  "claude-opus-5-5": [4, 20, 0.2],
  "claude-haiku-5-5": [0.1, 0.5, 0.01],
};

let client: Anthropic | undefined;
/** The Claude client for the work in progress: the visitor's own key when they brought one, else the server's. */
export function anthropic(): Anthropic {
  const key = visitorKey();
  if (key) return new Anthropic({ apiKey: key });
  if (userKeyRequired()) throw new Error("A visitor's Anthropic key is required here, and none was given.");
  if (!client) client = new Anthropic();
  return client;
}

interface SpendDoc {
  id: string;
  totalUsd: number;
  byPurpose: Record<string, number>;
  updatedAt: string;
}

/** Running Claude spend for this deployment, so dev and eval runs can stop before the agreed limit. */
export async function recordSpend(purpose: string, usd: number): Promise<number> {
  // A visitor's own key pays for their requests: none of it counts against this deployment's budget.
  if (visitorKey()) return spendSoFar();
  const store = getStore();
  const doc = (await store.get<SpendDoc>("spend", "total")) ?? { id: "total", totalUsd: 0, byPurpose: {}, updatedAt: "" };
  doc.totalUsd += usd;
  doc.byPurpose[purpose] = (doc.byPurpose[purpose] ?? 0) + usd;
  doc.updatedAt = new Date().toISOString();
  await store.put("spend", "total", doc);
  return doc.totalUsd;
}

export async function spendSoFar(): Promise<number> {
  return (await getStore().get<SpendDoc>("spend", "total"))?.totalUsd ?? 0;
}

export const SPEND_LIMIT_USD = Number(process.env.HM_SPEND_LIMIT_USD ?? "15");

export async function assertSpendHeadroom(): Promise<void> {
  if (visitorKey()) return;
  const spent = await spendSoFar();
  if (spent >= SPEND_LIMIT_USD) {
    throw new Error(`Claude spend limit reached ($${spent.toFixed(2)} of $${SPEND_LIMIT_USD}). Raise HM_SPEND_LIMIT_USD to continue.`);
  }
}

export function costOf(model: string, usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }): number {
  const [i, o, c] = PRICES[model] ?? PRICES["claude-sonnet-5-5"]!;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  return (usage.input_tokens * i + cacheWrite * i * 1.25 + cacheRead * c + usage.output_tokens * o) / 1e6;
}

/** One structured-output Claude call (Critic, briefing writer, briefing judge, eval baselines). */
export async function structured<S extends z.ZodType>(opts: {
  purpose: string;
  schema: S;
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
}): Promise<{ data: z.infer<S>; costUsd: number }> {
  await assertSpendHeadroom();
  const model = opts.model ?? config.model;
  const response = await anthropic().messages.parse({
    model,
    max_tokens: opts.maxTokens ?? 8000,
    system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: opts.user }],
    output_config: { format: zodOutputFormat(opts.schema), effort: opts.effort ?? "low" },
  });
  if (response.stop_reason === "refusal") throw new Error(`Claude declined the ${opts.purpose} request.`);
  if (!response.parsed_output) throw new Error(`Claude returned no parseable ${opts.purpose} output (stop: ${response.stop_reason}).`);
  const costUsd = costOf(model, response.usage);
  await recordSpend(opts.purpose, costUsd);
  return { data: response.parsed_output as z.infer<S>, costUsd };
}
