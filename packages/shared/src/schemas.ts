import { z } from "zod";

export const QLOO_TOOLS = [
  "qloo_capabilities",
  "qloo_find_tags",
  "qloo_describe",
  "qloo_recommend",
  "qloo_rank",
  "qloo_where_popular",
  "qloo_compare_audiences",
  "qloo_audience_demographics",
  "qloo_entity_tags",
  "qloo_trends",
] as const;
export const QlooToolName = z.enum(QLOO_TOOLS);
export type QlooToolName = z.infer<typeof QlooToolName>;

export const QlooStatus = z.enum(["ok", "empty", "needs_input", "partial", "degraded", "error"]);
export type QlooStatus = z.infer<typeof QlooStatus>;

export const Mode = z.enum(["concert", "comedy", "sports", "festival", "dining"]);
export type Mode = z.infer<typeof Mode>;

export const CapacityTier = z.enum(["club", "theatre", "arena", "stadium"]);
export type CapacityTier = z.infer<typeof CapacityTier>;

export const BudgetBand = z.enum(["lean", "standard", "premium"]);
export const AgeRating = z.enum(["all_ages", "16_plus", "18_plus", "21_plus"]);

export const HouseRules = z.object({
  budgetBand: BudgetBand.default("standard"),
  ageRating: AgeRating.default("all_ages"),
  sponsorExclusivities: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
  localOnlyVendors: z.boolean().default(false),
  vibeWords: z.array(z.string().trim().min(1).max(60)).max(6).default([]),
  localActs: z.array(z.string().trim().min(1).max(80)).max(8).default([]),
  notes: z.string().max(500).default(""),
});
export type HouseRules = z.infer<typeof HouseRules>;

/** Who is on the bill. Concert/comedy: headliner + support; sports: home + away; festival: stages; dining: the house + an optional theme or guest. */
export const SideRole = z.enum(["headliner", "support", "home", "away", "stage_act", "house", "theme"]);
export type SideRole = z.infer<typeof SideRole>;

export const SideInput = z.object({
  role: SideRole,
  name: z.string().trim().min(1).max(100),
  stage: z.string().trim().max(60).optional(),
});
export type SideInput = z.infer<typeof SideInput>;

export const ShowInput = z.object({
  mode: Mode,
  title: z.string().trim().max(120).optional(),
  sides: z.array(SideInput).min(1).max(12),
  venue: z.string().trim().min(1).max(120),
  city: z.string().trim().min(1).max(80),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  doorsTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .default("18:30"),
  capacityTier: CapacityTier,
  houseRules: HouseRules.default(HouseRules.parse({})),
});
export type ShowInput = z.input<typeof ShowInput>;
export type ShowInputParsed = z.infer<typeof ShowInput>;

export const Candidate = z.object({
  qlooId: z.string(),
  name: z.string(),
  type: z.string().optional(),
  disambiguation: z.string().optional(),
  popularity: z.number().optional(),
});
export type Candidate = z.infer<typeof Candidate>;

export const EntityStatus = z.enum(["resolved", "needs_confirmation", "not_found", "error"]);

/** A named thing from the intake (a performer, team, venue, city or vibe word) and its Qloo resolution. */
export const Entity = z.object({
  key: z.string(),
  kind: z.enum(["side", "venue", "city", "tag", "local_act", "sponsor"]),
  role: SideRole.optional(),
  input: z.string(),
  qlooId: z.string().optional(),
  name: z.string().optional(),
  type: z.string().optional(),
  status: EntityStatus,
  candidates: z.array(Candidate).default([]),
  callId: z.string().optional(),
  summary: z.string().optional(),
  recovery: z.string().optional(),
});
export type Entity = z.infer<typeof Entity>;

export const Scores = z.record(z.string(), z.number());

/** Evidence is filled in by the server from the call ledger, never by the model. */
export const Evidence = z.object({
  callId: z.string(),
  tool: QlooToolName,
  inputs: z.record(z.string(), z.unknown()),
  status: QlooStatus,
  summary: z.string().default(""),
  scores: Scores.default({}),
  entityId: z.string().optional(),
  endpoint: z.string().optional(),
  source: z.enum(["live", "mock", "cache"]).default("live"),
  durationMs: z.number().default(0),
});
export type Evidence = z.infer<typeof Evidence>;

export const ApprovalState = z.enum(["pending", "approved", "rejected", "swapped"]);
export const Approval = z.object({
  state: ApprovalState.default("pending"),
  reason: z.string().max(240).optional(),
  at: z.string().optional(),
  replacedBy: z.string().optional(),
});
export type Approval = z.infer<typeof Approval>;

export const Confidence = z.enum(["high", "reduced", "low"]);

export const PlanItem = z.object({
  id: z.string(),
  slotKey: z.string(),
  pick: z.object({ name: z.string(), qlooId: z.string(), type: z.string() }),
  /** What the Qloo result literally says (rendered from evidence). */
  qlooSays: z.string(),
  /** Our product interpretation (model text, checked by the Critic). */
  interpretation: z.string(),
  action: z.string().default(""),
  evidence: z.array(Evidence).min(1),
  confidence: Confidence,
  isWildcard: z.boolean().default(false),
  fitScore: z.number().min(0).max(100).optional(),
  rising: z.boolean().optional(),
  approval: Approval.default({ state: "pending" }),
});
export type PlanItem = z.infer<typeof PlanItem>;

export const Alternative = z.object({
  qlooId: z.string(),
  name: z.string(),
  type: z.string(),
  callId: z.string(),
  score: z.number().optional(),
});
export type Alternative = z.infer<typeof Alternative>;

export const SlotStatus = z.enum(["pending", "running", "ready", "needs_manual_input"]);
export const Slot = z.object({
  key: z.string(),
  label: z.string(),
  timeRange: z.string(),
  kind: z.enum(["music", "act", "food", "brand", "local", "split"]),
  status: SlotStatus,
  note: z.string().optional(),
  items: z.array(PlanItem).default([]),
  alternatives: z.array(Alternative).default([]),
});
export type Slot = z.infer<typeof Slot>;

export const CrowdRead = z.object({
  sharedGround: z.array(z.object({ name: z.string(), qlooId: z.string(), type: z.string(), score: z.number() })).default([]),
  distinctA: z.array(z.object({ name: z.string(), qlooId: z.string(), type: z.string(), score: z.number().optional() })).default([]),
  distinctB: z.array(z.object({ name: z.string(), qlooId: z.string(), type: z.string(), score: z.number().optional() })).default([]),
  labelA: z.string().default(""),
  labelB: z.string().default(""),
  /** Concepts from qloo_compare_audiences: which side carries each, and the shared similarity score. */
  compare: z
    .array(
      z
        .object({ name: z.string(), id: z.string(), side: z.enum(["shared", "a", "b"]).optional(), score: z.number().optional(), a: z.number().optional(), b: z.number().optional() })
        .transform((r) => (r.side ? r : { ...r, side: (Math.abs((r.a ?? 0) - (r.b ?? 0)) < 0.25 ? "shared" : (r.a ?? 0) > (r.b ?? 0) ? "a" : "b") as "shared" | "a" | "b" })),
    )
    .default([]),
  demographics: z
    .object({
      age: z.array(z.object({ bucket: z.string(), value: z.number() })).default([]),
      gender: z.array(z.object({ bucket: z.string(), value: z.number() })).default([]),
    })
    .default({ age: [], gender: [] }),
  tags: z.array(z.object({ name: z.string(), tagId: z.string(), score: z.number() })).default([]),
  trends: z.array(z.object({ name: z.string(), qlooId: z.string(), points: z.array(z.object({ date: z.string(), value: z.number() })), delta: z.number() })).default([]),
  demographicPhrase: z.string().default(""),
  qlooSays: z.array(z.string()).default([]),
  interpretation: z.array(z.string()).default([]),
  evidence: z.array(Evidence).default([]),
  confidence: Confidence.default("high"),
});
export type CrowdRead = z.infer<typeof CrowdRead>;

export const PlanStats = z.object({
  qlooCalls: z.number().default(0),
  cacheHits: z.number().default(0),
  retries: z.number().default(0),
  criticDrops: z.number().default(0),
  durationMs: z.number().default(0),
  costUsd: z.number().default(0),
  model: z.string().default(""),
  toolsUsed: z.array(QlooToolName).default([]),
});
export type PlanStats = z.infer<typeof PlanStats>;

export const Plan = z.object({
  runId: z.string(),
  headline: z.string().default(""),
  crowd: CrowdRead,
  slots: z.array(Slot),
  limitations: z.array(z.string()),
  stats: PlanStats,
  createdAt: z.string(),
});
export type Plan = z.infer<typeof Plan>;

export const ShowStatus = z.enum(["needs_confirmation", "ready_to_plan", "planning", "planned", "locked", "failed"]);
export type ShowStatus = z.infer<typeof ShowStatus>;

export const NegativeSignal = z.object({ qlooId: z.string(), name: z.string(), reason: z.string(), slotKey: z.string() });

export const BriefingLine = z.object({
  speaker: z.enum(["A", "B"]),
  text: z.string(),
  evidence: z.array(Evidence).default([]),
  startMs: z.number().optional(),
  endMs: z.number().optional(),
});
export type BriefingLine = z.infer<typeof BriefingLine>;

export const Briefing = z.object({
  lines: z.array(BriefingLine),
  dropped: z.array(z.object({ text: z.string(), reason: z.string() })).default([]),
  audio: z.object({ available: z.boolean(), url: z.string().optional(), reason: z.string().optional(), durationMs: z.number().optional() }).default({ available: false }),
  createdAt: z.string(),
  planVersion: z.number(),
});
export type Briefing = z.infer<typeof Briefing>;

/** Where tonight's taste concentrates (qloo_where_popular per bill side), built server-side from the ledger. */
export const HeatLayer = z.object({
  label: z.string(),
  role: SideRole.optional(),
  entityId: z.string(),
  points: z.array(z.object({ id: z.string(), lat: z.number(), lon: z.number(), affinity: z.number(), popularity: z.number().optional() })),
  evidence: Evidence,
});
export type HeatLayer = z.infer<typeof HeatLayer>;

export const Heatmap = z.object({
  within: z.string(),
  layers: z.array(HeatLayer),
  /** Areas where every layer is above its own median affinity: where the whole bill's crowd overlaps. */
  overlap: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
  createdAt: z.string(),
});
export type Heatmap = z.infer<typeof Heatmap>;

export const CounterfactualRow = z.object({
  name: z.string(),
  source: z.enum(["qloo", "llm"]),
  /** For LLM-only picks: whether Qloo could resolve the name (never auto-picked when ambiguous). */
  status: z.enum(["resolved", "not_found", "ambiguous", "error"]),
  qlooId: z.string().optional(),
  rank: z.number().optional(),
  score: z.number().optional(),
  why: z.string().default(""),
  candidates: z.array(Candidate).default([]),
  callId: z.string().optional(),
});
export type CounterfactualRow = z.infer<typeof CounterfactualRow>;

/** "Without Qloo": the same brief planned by Claude alone, then checked and ranked by Qloo for tonight's crowd. */
export const Counterfactual = z.object({
  planVersion: z.number(),
  model: z.string(),
  headline: z.string().default(""),
  slots: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      rows: z.array(CounterfactualRow),
      rankEvidence: Evidence.optional(),
      note: z.string().optional(),
    }),
  ),
  summary: z.object({
    llmPicks: z.number(),
    llmResolved: z.number(),
    llmAmbiguous: z.number(),
    llmNotFound: z.number(),
    /** Ranked slots where Qloo put a House Mix pick above every LLM-only pick. */
    slotsQlooLed: z.number(),
    rankedSlots: z.number(),
  }),
  costUsd: z.number().default(0),
  createdAt: z.string(),
});
export type Counterfactual = z.infer<typeof Counterfactual>;

export const AskLine = z.object({ text: z.string(), callIds: z.array(z.string()).default([]) });
export const AskProposal = z.object({
  id: z.string(),
  slotKey: z.string(),
  item: PlanItem,
  state: z.enum(["open", "added"]).default("open"),
});
export type AskProposal = z.infer<typeof AskProposal>;

/** One grounded answer from "Ask House Mix": every line cites Qloo calls; the Critic removes unsupported lines. */
export const AskAnswer = z.object({
  id: z.string(),
  question: z.string(),
  lines: z.array(AskLine),
  dropped: z.array(z.object({ text: z.string(), reason: z.string() })).default([]),
  calls: z.array(Evidence).default([]),
  proposals: z.array(AskProposal).default([]),
  planVersion: z.number(),
  costUsd: z.number().default(0),
  at: z.string(),
});
export type AskAnswer = z.infer<typeof AskAnswer>;

export const Show = z.object({
  id: z.string(),
  shareId: z.string(),
  seed: z.boolean().default(false),
  /** SHA-256 of the seed file a seeded show was imported from; a changed file replaces the stored copy. */
  seedHash: z.string().optional(),
  input: ShowInput,
  title: z.string(),
  entities: z.array(Entity),
  status: ShowStatus,
  plan: Plan.optional(),
  version: z.number().default(0),
  lockedAt: z.string().optional(),
  negativeSignals: z.array(NegativeSignal).default([]),
  briefing: Briefing.optional(),
  heatmap: Heatmap.optional(),
  counterfactual: Counterfactual.optional(),
  asks: z.array(AskAnswer).default([]),
  lastRunId: z.string().optional(),
  qlooMode: z.enum(["mock", "live"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Show = z.infer<typeof Show>;

/** One entry in the Qloo call ledger: the server-side record every evidence row is built from. */
export const LedgerCall = z.object({
  callId: z.string(),
  runId: z.string(),
  agent: z.string().default("system"),
  tool: QlooToolName,
  args: z.record(z.string(), z.unknown()),
  status: QlooStatus,
  summary: z.string().default(""),
  warnings: z.array(z.string()).default([]),
  results: z.array(z.record(z.string(), z.unknown())).default([]),
  resultIds: z.array(z.string()).default([]),
  /** Entity IDs the call was about (its interpreted inputs). */
  inputIds: z.array(z.string()).default([]),
  issues: z.array(z.object({ input: z.string(), kind: z.string(), field: z.string(), candidates: z.array(Candidate) })).default([]),
  error: z.object({ code: z.string(), retryable: z.boolean(), recovery: z.string() }).optional(),
  endpoint: z.string().optional(),
  durationMs: z.number(),
  cached: z.boolean(),
  attempts: z.number(),
  source: z.enum(["live", "mock"]),
  at: z.string(),
});
export type LedgerCall = z.infer<typeof LedgerCall>;

export const RunEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("run_started"), at: z.string(), runId: z.string(), model: z.string() }),
  z.object({ type: z.literal("agent"), at: z.string(), agent: z.string(), phase: z.enum(["start", "stop"]), note: z.string().optional() }),
  z.object({
    type: z.literal("tool_call"),
    at: z.string(),
    callId: z.string(),
    agent: z.string(),
    tool: QlooToolName,
    args: z.record(z.string(), z.unknown()),
    status: QlooStatus,
    summary: z.string(),
    durationMs: z.number(),
    cached: z.boolean(),
    attempts: z.number(),
    resultCount: z.number(),
  }),
  z.object({ type: z.literal("thought"), at: z.string(), agent: z.string(), text: z.string() }),
  z.object({ type: z.literal("crowd"), at: z.string(), crowd: CrowdRead }),
  z.object({ type: z.literal("slot"), at: z.string(), slot: Slot }),
  z.object({ type: z.literal("critic"), at: z.string(), slotKey: z.string(), pick: z.string(), reason: z.string() }),
  z.object({ type: z.literal("budget"), at: z.string(), used: z.number(), cap: z.number(), cacheHits: z.number() }),
  z.object({ type: z.literal("done"), at: z.string(), plan: Plan }),
  z.object({ type: z.literal("error"), at: z.string(), message: z.string(), recoverable: z.boolean() }),
]);
export type RunEvent = z.infer<typeof RunEvent>;
export type RunEventType = RunEvent["type"];

export const RunState = z.object({
  runId: z.string(),
  showId: z.string(),
  status: z.enum(["running", "done", "failed"]),
  events: z.array(RunEvent),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
});
export type RunState = z.infer<typeof RunState>;

export const Rating = z.object({
  raterCode: z.string().regex(/^[a-z0-9-]{4,40}$/),
  pairId: z.string(),
  overall: z.enum(["left", "right", "tie"]),
  perSlot: z.record(z.string(), z.enum(["left", "right", "tie"])).default({}),
  fitLeft: z.number().int().min(1).max(5),
  fitRight: z.number().int().min(1).max(5),
});
export type Rating = z.infer<typeof Rating>;

export const Health = z.object({
  ok: z.boolean(),
  qlooMode: z.enum(["mock", "live"]),
  qlooReady: z.boolean(),
  contractVersion: z.string().optional(),
  model: z.string(),
  version: z.string(),
  store: z.string(),
  ttsAvailable: z.boolean(),
});
export type Health = z.infer<typeof Health>;
