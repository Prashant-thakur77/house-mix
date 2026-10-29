import { randomUUID } from "node:crypto";
import {
  checkValue,
  MODES,
  ShowInput,
  type Entity,
  type Mode,
  type Show,
  type ShowInputParsed,
  type SideRole,
} from "@housemix/shared";
import { config } from "../config.ts";
import { getQloo, type QlooClient } from "../qloo/client.ts";
import { entitiesOf } from "../qloo/normalize.ts";
import { getStore } from "../store/store.ts";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = "bad_request",
  ) {
    super(message);
  }
}

const norm = (s: string) => s.normalize("NFKC").toLowerCase().trim();

/** Qloo search type for a performer on the bill. Sports teams are left unscoped so the operator confirms the match. */
function sideType(mode: Mode, role: SideRole): string | undefined {
  if (mode === "comedy") return "person";
  if (mode === "sports") return undefined;
  // Dining: the house is a place in Qloo; a theme can be anything (an artist, a film, a brand).
  if (mode === "dining") return role === "house" ? "place" : undefined;
  return role === "stage_act" || role === "headliner" || role === "support" ? "artist" : undefined;
}

export function showTitle(i: ShowInputParsed): string {
  if (i.title) return i.title;
  const by = (r: SideRole) => i.sides.filter((s) => s.role === r).map((s) => s.name);
  switch (i.mode) {
    case "sports":
      return `${by("home")[0] ?? "Home"} vs ${by("away")[0] ?? "Away"}`;
    case "festival":
      return `${i.venue} festival day`;
    case "dining": {
      const theme = by("theme");
      return `${by("house")[0] ?? i.venue}${theme.length ? `: ${theme.join(" & ")} night` : ": dinner service"}`;
    }
    default: {
      const support = by("support");
      return `${by("headliner")[0] ?? "Headliner"}${support.length ? ` with ${support.join(", ")}` : ""}`;
    }
  }
}

interface Pending {
  key: string;
  kind: Entity["kind"];
  role?: SideRole;
  input: string;
  tool: "qloo_describe" | "qloo_find_tags";
  type?: string;
}

function pendingEntities(i: ShowInputParsed): Pending[] {
  const out: Pending[] = [];
  i.sides.forEach((s, n) => out.push({ key: `side_${n}`, kind: "side", role: s.role, input: s.name, tool: "qloo_describe", type: sideType(i.mode, s.role) }));
  out.push({ key: "venue", kind: "venue", input: i.venue, tool: "qloo_describe", type: "place" });
  out.push({ key: "city", kind: "city", input: i.city, tool: "qloo_describe", type: "locality" });
  i.houseRules.vibeWords.forEach((w, n) => out.push({ key: `tag_${n}`, kind: "tag", input: w, tool: "qloo_find_tags" }));
  i.houseRules.localActs.forEach((a, n) => out.push({ key: `local_${n}`, kind: "local_act", input: a, tool: "qloo_describe", type: i.mode === "comedy" ? "person" : "artist" }));
  i.houseRules.sponsorExclusivities.forEach((b, n) => out.push({ key: `sponsor_${n}`, kind: "sponsor", input: b, tool: "qloo_describe", type: "brand" }));
  return out;
}

/** Resolves one intake name with Qloo. Ambiguity becomes a confirmation; nothing is auto-picked. */
async function resolveOne(p: Pending, runId: string, qloo: QlooClient): Promise<Entity> {
  const base = { key: p.key, kind: p.kind, role: p.role, input: p.input, candidates: [] };
  if (p.tool === "qloo_find_tags") {
    const { call, envelope } = await qloo.call("qloo_find_tags", { query: p.input, limit: 5 }, { runId, agent: "resolver" });
    if (call.status === "error") return { ...base, status: "error", callId: call.callId, summary: envelope.summary, recovery: call.error?.recovery };
    const tags = entitiesOf(call);
    const exact = tags.filter((t) => norm(t.name) === norm(p.input));
    if (exact.length === 1) return { ...base, status: "resolved", qlooId: exact[0]!.id, name: exact[0]!.name, type: "tag", callId: call.callId };
    if (!tags.length) return { ...base, status: "not_found", callId: call.callId, summary: `Qloo has no tag matching "${p.input}". Refine the word or remove it.` };
    return {
      ...base,
      status: "needs_confirmation",
      callId: call.callId,
      summary: `Qloo returned ${tags.length} candidate tags for "${p.input}". Choose the one you mean.`,
      candidates: tags.map((t) => ({ qlooId: t.id, name: t.name, type: t.type, popularity: t.popularity })),
    };
  }
  const args: Record<string, unknown> = { entity: p.input, ...(p.type ? { type: p.type } : {}) };
  const { call, envelope } = await qloo.call("qloo_describe", args, { runId, agent: "resolver" });
  switch (call.status) {
    case "ok":
    case "partial":
    case "degraded": {
      const e = entitiesOf(call)[0];
      if (!e) return { ...base, status: "not_found", callId: call.callId, summary: `Qloo returned no entity for "${p.input}".` };
      return { ...base, status: "resolved", qlooId: e.id, name: e.name, type: e.type ?? p.type, callId: call.callId, summary: e.description };
    }
    case "needs_input": {
      const issue = call.issues[0];
      if (!issue || issue.kind === "not_found" || issue.candidates.length === 0) {
        return { ...base, status: "not_found", callId: call.callId, summary: `Qloo could not find "${p.input}". Check the spelling or try the full name.` };
      }
      return { ...base, status: "needs_confirmation", callId: call.callId, summary: envelope.summary, candidates: issue.candidates };
    }
    case "empty":
      return { ...base, status: "not_found", callId: call.callId, summary: `Qloo has no match for "${p.input}". Refine the name.` };
    default:
      return { ...base, status: "error", callId: call.callId, summary: envelope.summary, recovery: call.error?.recovery };
  }
}

/** Sides must resolve before planning; every other entity must be resolved, skipped or have no signal. */
export function statusFor(entities: Entity[]): Show["status"] {
  const blocking = entities.some((e) => e.status === "needs_confirmation" || (e.kind === "side" && e.status !== "resolved"));
  return blocking ? "needs_confirmation" : "ready_to_plan";
}

export function validateInput(raw: unknown): ShowInputParsed {
  const parsed = ShowInput.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), "invalid_input");
  const input = parsed.data;
  const guard = checkValue(input);
  if (!guard.ok) throw new HttpError(422, guard.message ?? "Request refused.", guard.kind === "pii" ? "personal_data" : "eligibility_request");
  const tpl = MODES[input.mode];
  for (const r of tpl.sideRoles) {
    const n = input.sides.filter((s) => s.role === r.role).length;
    if (r.required && n === 0) throw new HttpError(400, `${tpl.label} mode needs a ${r.label.toLowerCase()}.`, "invalid_input");
    if (n > r.max) throw new HttpError(400, `${tpl.label} mode allows at most ${r.max} × ${r.label.toLowerCase()}.`, "invalid_input");
  }
  const allowed = new Set(tpl.sideRoles.map((r) => r.role));
  const wrong = input.sides.find((s) => !allowed.has(s.role));
  if (wrong) throw new HttpError(400, `Role "${wrong.role}" is not used in ${tpl.label} mode.`, "invalid_input");
  return input;
}

export async function createShow(raw: unknown, opts: { seed?: boolean; qloo?: QlooClient; id?: string } = {}): Promise<Show> {
  const input = validateInput(raw);
  const qloo = opts.qloo ?? getQloo();
  const id = opts.id ?? `s_${randomUUID().slice(0, 10)}`;
  const runId = `resolve_${id}`;
  const entities = await Promise.all(pendingEntities(input).map((p) => resolveOne(p, runId, qloo)));
  const now = new Date().toISOString();
  const show: Show = {
    id,
    shareId: randomUUID().replace(/-/g, "").slice(0, 16),
    seed: Boolean(opts.seed),
    input,
    title: showTitle(input),
    entities,
    asks: [],
    status: statusFor(entities),
    version: 0,
    negativeSignals: [],
    qlooMode: qloo.mode,
    createdAt: now,
    updatedAt: now,
  };
  await getStore().put("shows", id, show);
  return show;
}

export async function getShow(id: string): Promise<Show> {
  const show = await getStore().get<Show>("shows", id);
  if (!show) throw new HttpError(404, "Show not found.", "not_found");
  return show;
}

export async function saveShow(show: Show): Promise<Show> {
  show.updatedAt = new Date().toISOString();
  await getStore().put("shows", show.id, show);
  return show;
}

/**
 * Applies the operator's choice for an ambiguous entity. Only a candidate Qloo returned is accepted,
 * and the choice is re-checked with qloo_describe by ID so the confirmation itself has evidence.
 */
export async function confirmEntity(showId: string, key: string, choice: string, qloo: QlooClient = getQloo()): Promise<Show> {
  const show = await getShow(showId);
  if (show.status === "planning") throw new HttpError(409, "A plan is running for this show.", "conflict");
  const ent = show.entities.find((e) => e.key === key);
  if (!ent) throw new HttpError(404, `No entity "${key}" on this show.`, "not_found");
  if (choice === "skip") {
    if (ent.kind === "side") throw new HttpError(400, "Acts and teams on the bill cannot be skipped; refine the name instead.", "invalid_input");
    Object.assign(ent, { status: "not_found", qlooId: undefined, summary: "Skipped by the operator." });
  } else {
    const cand = ent.candidates.find((c) => c.qlooId === choice) ?? (ent.qlooId === choice ? { qlooId: choice, name: ent.name ?? ent.input, type: ent.type } : undefined);
    if (!cand) throw new HttpError(400, "That choice is not one of the candidates Qloo returned.", "invalid_input");
    let callId = ent.callId;
    if (ent.kind !== "tag") {
      const { call } = await qloo.call("qloo_describe", { entity: cand.qlooId }, { runId: `resolve_${show.id}`, agent: "resolver" });
      if (call.status !== "ok") throw new HttpError(502, `Qloo could not confirm that choice: ${call.summary || call.error?.recovery || call.status}`, "qloo_error");
      callId = call.callId;
    }
    Object.assign(ent, { status: "resolved", qlooId: cand.qlooId, name: cand.name, type: cand.type ?? ent.type, callId, summary: "Confirmed by the operator." });
  }
  if (!show.plan) show.status = statusFor(show.entities);
  return saveShow(show);
}

/** "Refine the name": re-resolves one entity with new text. */
export async function refineEntity(showId: string, key: string, text: string, qloo: QlooClient = getQloo()): Promise<Show> {
  const show = await getShow(showId);
  const ent = show.entities.find((e) => e.key === key);
  if (!ent) throw new HttpError(404, `No entity "${key}" on this show.`, "not_found");
  const guard = checkValue(text);
  if (!guard.ok) throw new HttpError(422, guard.message ?? "Request refused.", "personal_data");
  const p: Pending = {
    key,
    kind: ent.kind,
    role: ent.role,
    input: text.trim(),
    tool: ent.kind === "tag" ? "qloo_find_tags" : "qloo_describe",
    type: ent.kind === "side" ? sideType(show.input.mode, ent.role!) : ent.kind === "venue" ? "place" : ent.kind === "city" ? "locality" : ent.kind === "sponsor" ? "brand" : ent.kind === "local_act" ? (show.input.mode === "comedy" ? "person" : "artist") : undefined,
  };
  const next = await resolveOne(p, `resolve_${show.id}`, qloo);
  show.entities = show.entities.map((e) => (e.key === key ? next : e));
  if (!show.plan) show.status = statusFor(show.entities);
  return saveShow(show);
}

export async function listShows(): Promise<Show[]> {
  const shows = await getStore().list<Show>("shows");
  return shows.filter((s) => s.qlooMode === config.qlooMode || s.seed).sort((a, b) => Number(b.seed) - Number(a.seed) || b.createdAt.localeCompare(a.createdAt));
}
