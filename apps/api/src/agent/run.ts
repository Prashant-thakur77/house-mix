import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { query, type HookCallback } from "@anthropic-ai/claude-agent-sdk";
import { checkValue, LIMITATIONS, type Plan, type RunEvent, type Show } from "@housemix/shared";
import { config } from "../config.ts";
import { assertSpendHeadroom, recordSpend } from "../llm.ts";
import { getQloo, type QlooClient } from "../qloo/client.ts";
import { RunContext } from "./context.ts";
import { gateItems, type SubmittedItem } from "./critic.ts";
import { CROWD_READER, PROGRAMMER, SPONSOR_FIT, WILDCARD, contextBlock, plannerPrompt } from "./prompts.ts";
import { claudeProblem, visitorKey } from "../keys.ts";
import { houseMixServer, qlooProxyServer } from "./tools.ts";

const Q = (t: string) => `mcp__qloo__${t}`;
const H = (t: string) => `mcp__housemix__${t}`;

const CROWD_TOOLS = [Q("qloo_compare_audiences"), Q("qloo_audience_demographics"), Q("qloo_entity_tags"), Q("qloo_trends"), H("submit_crowd_read")];
const PROGRAMMER_TOOLS = [Q("qloo_recommend"), Q("qloo_rank"), Q("qloo_trends"), Q("qloo_where_popular"), Q("qloo_find_tags"), H("get_plan_state"), H("submit_slot"), H("report_slot_issue")];
const SPONSOR_TOOLS = [Q("qloo_recommend"), Q("qloo_compare_audiences"), Q("qloo_rank"), H("get_plan_state"), H("submit_slot"), H("report_slot_issue")];
const WILDCARD_TOOLS = [Q("qloo_recommend"), Q("qloo_rank"), H("get_plan_state"), H("submit_slot")];
const PLANNER_TOOLS = ["Agent", H("submit_plan_summary")];
const ALL_TOOLS = [...new Set([...PLANNER_TOOLS, ...CROWD_TOOLS, ...PROGRAMMER_TOOLS, ...SPONSOR_TOOLS, ...WILDCARD_TOOLS])];

export interface RunOptions {
  qloo?: QlooClient;
  /** Hard wall-clock limit for one plan run. */
  timeoutMs?: number;
}

/**
 * Runs one plan with the Claude Agent SDK: the Planner (main thread) dispatches the CrowdReader,
 * Programmer, SponsorFit and Wildcard subagents; all Qloo traffic goes through the in-process proxy
 * (→ QlooClient → `qloo mcp` over stdio); the Critic gates every submission (PreToolUse hook + handler).
 */
export async function runPlan(show: Show, runId: string, emit: (e: RunEvent) => void, opts: RunOptions = {}): Promise<Plan> {
  await assertSpendHeadroom();
  const qloo = opts.qloo ?? getQloo();
  const ctx = new RunContext(show, runId, emit);
  await ctx.loadAnchors();
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "housemix-run-"));
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), opts.timeoutMs ?? 7 * 60 * 1000);
  emit({ type: "run_started", at: ctx.now(), runId, model: config.plannerModel });

  const preToolUse: HookCallback = async (input) => {
    if (input.hook_event_name !== "PreToolUse") return {};
    const agent = input.agent_type ?? "planner";
    ctx.noteAgent(input.tool_name, input.tool_input, agent);
    if (input.tool_name.startsWith("mcp__qloo__")) {
      const guard = checkValue(input.tool_input);
      if (!guard.ok) {
        return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: `Blocked: ${guard.detail}. ${guard.message}` } };
      }
    }
    if (input.tool_name === H("submit_slot")) {
      // Critic gate as a hook: a submission where no item cites valid Qloo evidence is sent back to the agent.
      const ti = input.tool_input as { slot_key: string; items?: SubmittedItem[] };
      const items = ti.items ?? [];
      const problems = gateItems(ctx, ti.slot_key, items);
      if (items.length > 0 && problems.length === items.length) {
        for (const p of problems) emit({ type: "critic", at: ctx.now(), slotKey: ti.slot_key, pick: ctx.nameOf(p.entity_id), reason: p.reason.replace(p.entity_id, ctx.nameOf(p.entity_id)) });
        ctx.criticDrops += problems.length;
        return {
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: `Critic: no item in this submission carries valid Qloo evidence. ${problems.map((p) => `#${p.index} ${p.entity_id}: ${p.reason}`).join("; ")}. Cite call_ids whose results contain each entity_id.`,
          },
        };
      }
    }
    return {};
  };
  const subagentStart: HookCallback = async (input) => {
    if (input.hook_event_name === "SubagentStart") emit({ type: "agent", at: ctx.now(), agent: input.agent_type, phase: "start" });
    return {};
  };
  const subagentStop: HookCallback = async (input) => {
    if (input.hook_event_name === "SubagentStop") emit({ type: "agent", at: ctx.now(), agent: input.agent_type, phase: "stop" });
    return {};
  };

  const ctxText = `CONTEXT (confirmed by the operator; IDs only):\n${contextBlock(ctx)}`;
  const agentModel = config.workerModel;
  const q = query({
    prompt: `Plan tonight's show: ${show.title}.`,
    options: {
      model: config.plannerModel,
      systemPrompt: plannerPrompt(ctx),
      cwd,
      settingSources: [],
      tools: ["Agent"],
      allowedTools: ALL_TOOLS,
      permissionMode: "dontAsk",
      mcpServers: { qloo: await qlooProxyServer(ctx, qloo), housemix: houseMixServer(ctx) },
      agents: {
        crowd_reader: { description: "Reads tonight's aggregate crowd from Qloo (compare, demographics, tags, trends) and submits the crowd read.", prompt: `${CROWD_READER}\n\n${ctxText}`, tools: CROWD_TOOLS, model: agentModel, maxTurns: 14 },
        programmer: { description: "Fills ONE run-of-show slot (music, acts, food, local) from its Qloo chain and submits it. Give it the slot_key.", prompt: `${PROGRAMMER}\n\n${ctxText}`, tools: PROGRAMMER_TOOLS, model: agentModel, maxTurns: 14 },
        sponsor_fit: { description: "Fills the merch & brand activations slot with sponsor-fit scores from Qloo audience comparisons.", prompt: `${SPONSOR_FIT}\n\n${ctxText}`, tools: SPONSOR_TOOLS, model: agentModel, maxTurns: 16 },
        wildcard: { description: "Adds one labelled stretch pick to each slot.", prompt: `${WILDCARD}\n\n${ctxText}`, tools: WILDCARD_TOOLS, model: agentModel, maxTurns: 24 },
      },
      hooks: {
        PreToolUse: [{ hooks: [preToolUse] }],
        SubagentStart: [{ hooks: [subagentStart] }],
        SubagentStop: [{ hooks: [subagentStop] }],
      },
      maxTurns: 30,
      maxBudgetUsd: config.runBudgetUsd,
      effort: "medium",
      persistSession: false,
      agentProgressSummaries: false,
      // A plan finishes in a few minutes, so the 5-minute cache is enough and writes cost 1.25× instead of 2×.
      // The visitor's own key when they brought one (keys.ts); the server's key only where the deployment allows it.
      env: { ...process.env, ...(visitorKey() ? { ANTHROPIC_API_KEY: visitorKey() } : {}), CLAUDE_CODE_PROMPT_CACHE_TTL: "5m", CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL: "5m" },
      abortController: abort,
      stderr: (d) => {
        if (process.env.HM_DEBUG) process.stderr.write(d);
      },
    },
  });

  // Map tool_use ids of Agent calls to subagent names so streamed text can be attributed.
  const agentOfToolUse = new Map<string, string>();
  let failure: string | undefined;
  let agentCost = 0;
  try {
    for await (const m of q) {
      if (m.type === "assistant") {
        const who = m.parent_tool_use_id ? (agentOfToolUse.get(m.parent_tool_use_id) ?? "subagent") : "planner";
        for (const block of m.message.content) {
          if (block.type === "tool_use" && block.name === "Agent") {
            const sub = (block.input as { subagent_type?: string }).subagent_type ?? "subagent";
            agentOfToolUse.set(block.id, sub);
          } else if (block.type === "text" && block.text.trim()) {
            emit({ type: "thought", at: ctx.now(), agent: who, text: block.text.trim().slice(0, 400) });
          }
        }
      } else if (m.type === "result") {
        // total_cost_usd is cumulative for the session and is reported on more than one result message.
        agentCost = Math.max(agentCost, (m as { total_cost_usd?: number }).total_cost_usd ?? 0);
        const usage = (m as { modelUsage?: Record<string, { costUSD: number; inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens: number }> }).modelUsage ?? {};
        ctx.modelUsage = Object.fromEntries(Object.entries(usage).map(([k, v]) => [k, { costUsd: v.costUSD, input: v.inputTokens, output: v.outputTokens, cacheRead: v.cacheReadInputTokens, cacheWrite: v.cacheCreationInputTokens }]));
        if (process.env.HM_DEBUG_USAGE) console.error("modelUsage", JSON.stringify(ctx.modelUsage));
        if (m.subtype !== "success") failure = `Agent run ended early (${m.subtype}).`;
      }
    }
  } catch (e) {
    failure = abort.signal.aborted ? "Plan run timed out." : (claudeProblem(e)?.message ?? (e as Error).message);
  } finally {
    ctx.costUsd += agentCost;
    await recordSpend("plan_run", agentCost);
    clearTimeout(timer);
    fs.rmSync(cwd, { recursive: true, force: true });
  }

  // Nothing usable came back (a rejected key, an account out of credit, an early stop): the show keeps the plan it has.
  if (failure && ![...ctx.slots.values()].some((slot) => slot.items.length)) throw new Error(failure);

  for (const slot of ctx.slots.values()) {
    if (slot.items.length === 0) {
      slot.status = "needs_manual_input";
      slot.note ??= "No Qloo-backed pick survived the evidence check for this slot. Add candidates or re-run the slot.";
      emit({ type: "slot", at: ctx.now(), slot });
    }
  }
  if (failure) emit({ type: "error", at: ctx.now(), message: failure, recoverable: true });

  const plan = finalisePlan(ctx);
  emit({ type: "done", at: ctx.now(), plan });
  return plan;
}

export function finalisePlan(ctx: RunContext): Plan {
  const slots = [...ctx.slots.values()];
  const limitations = [...LIMITATIONS];
  const reduced = slots.filter((s) => s.items.some((i) => i.confidence !== "high")).map((s) => s.label);
  if (reduced.length) limitations.push(`Reduced-confidence Qloo results (partial or degraded) were used in: ${reduced.join(", ")}.`);
  const noSignal = ctx.show.entities.filter((e) => e.kind === "local_act" && e.status !== "resolved").map((e) => e.input);
  if (noSignal.length) limitations.push(`No Qloo signal for: ${noSignal.join(", ")}. They were not ranked.`);
  const manual = slots.filter((s) => s.status === "needs_manual_input").map((s) => s.label);
  if (manual.length) limitations.push(`Needs manual input: ${manual.join(", ")}.`);
  if (ctx.show.qlooMode === "mock") limitations.unshift("MOCK DATA: this plan was produced against fictional mock Qloo fixtures, not live Qloo results.");
  return {
    runId: ctx.runId,
    headline: ctx.headline,
    crowd: ctx.crowd ?? {
      sharedGround: [],
      distinctA: [],
      distinctB: [],
      labelA: "",
      labelB: "",
      compare: [],
      demographics: { age: [], gender: [] },
      tags: [],
      trends: [],
      demographicPhrase: "",
      qlooSays: [],
      interpretation: [],
      evidence: [],
      confidence: "low",
    },
    slots,
    limitations,
    stats: {
      qlooCalls: ctx.budget.used,
      cacheHits: ctx.budget.cacheHits,
      retries: ctx.budget.retries,
      criticDrops: ctx.criticDrops,
      durationMs: Date.now() - ctx.startedAt,
      costUsd: Math.round(ctx.costUsd * 10000) / 10000,
      model: config.plannerModel === config.workerModel ? config.workerModel : `${config.plannerModel} (planner) + ${config.workerModel} (workers)`,
      toolsUsed: [...ctx.toolsUsed],
    },
    createdAt: ctx.now(),
  };
}
