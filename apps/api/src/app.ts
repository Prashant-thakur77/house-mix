import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import compress from "@fastify/compress";
import fs from "node:fs/promises";
import path from "node:path";
import { Rating, type Health, type Show } from "@housemix/shared";
import { config, REPO_ROOT } from "./config.ts";
import { getQloo } from "./qloo/client.ts";
import { compareOf } from "./qloo/normalize.ts";
import { getStore } from "./store/store.ts";
import { confirmEntity, copyShow, createShow, getShow, HttpError, listShows, refineEntity, saveShow } from "./shows/service.ts";
import { assertEditable, claudeProblem, seedsReadOnly, userKeyRequired, withClaude } from "./keys.ts";
import { getRun, isEndMarker, startRun, subscribe } from "./shows/runs.ts";
import { addProposal, approveConfident, approveItem, lockPlan, rejectItem, resetItem, swapItem, unlockPlan } from "./shows/approvals.ts";
import { planCsv, playlistCsv, playlistM3u } from "./exports/csv.ts";
import { cueSheetPdf, runOfShowPdf, sponsorPdf } from "./exports/pdf.tsx";
import { musicFor } from "./insights/music.ts";
import { buildBriefing } from "./briefing/briefing.ts";
import { readAudio, ttsStatus } from "./briefing/tts.ts";
import { heatmapFor } from "./insights/heatmap.ts";
import { counterfactualFor } from "./insights/counterfactual.ts";
import { askShow } from "./insights/ask.ts";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/** Public view of a show: no internal ledger details beyond evidence, nothing personal. */
function publicShow(show: Show) {
  return show;
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.NODE_ENV === "test" ? false : { level: process.env.LOG_LEVEL ?? "info", redact: ["req.headers.authorization", "req.headers.cookie", "req.headers[\"x-api-key\"]", "req.headers[\"x-anthropic-key\"]"] },
    bodyLimit: 64 * 1024,
  });
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || config.corsOrigins.includes(origin) || config.corsOrigins.includes("*") || /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) cb(null, true);
      else cb(new Error("Origin not allowed"), false);
    },
  });
  await app.register(rateLimit, { global: false });
  // JSON plans and stored traces compress ~10×; the SSE route writes to the raw socket and is not compressed.
  await app.register(compress, { global: true, threshold: 1024, encodings: ["br", "gzip"] });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.code, message: err.message });
    const problem = claudeProblem(err);
    if (problem) return reply.status(problem.status).send({ error: problem.code, message: problem.message });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    return reply.status(status).send({ error: status === 429 ? "rate_limited" : "server_error", message: status >= 500 ? "Something went wrong on the server." : (err as Error).message });
  });

  app.get("/health", async (): Promise<Health> => {
    const r = await getQloo().ready();
    return {
      ok: true,
      qlooMode: config.qlooMode,
      qlooReady: r.ready,
      contractVersion: r.contractVersion,
      model: config.model,
      version: config.version,
      store: getStore().kind,
      ttsAvailable: ttsStatus().available,
      userKeyRequired: userKeyRequired(),
      seedsReadOnly: seedsReadOnly(),
    };
  });

  // With demo shows read-only, the public list is the demo shows: a visitor's copies are reached by their own link.
  app.get("/shows", async () => (await listShows()).filter((s) => !seedsReadOnly() || s.seed).map((s) => ({ id: s.id, title: s.title, mode: s.input.mode, venue: s.input.venue, city: s.input.city, date: s.input.date, status: s.status, seed: s.seed, version: s.version, qlooMode: s.qlooMode, updatedAt: s.updatedAt, headline: s.plan?.headline ?? "", items: s.plan?.slots.reduce((n, sl) => n + sl.items.length, 0) ?? 0 })));

  app.post("/shows", { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } }, async (req, reply) => reply.status(201).send(publicShow(await createShow(req.body))));
  app.get<{ Params: { id: string } }>("/shows/:id", async (req) => publicShow(await getShow(req.params.id)));
  app.post<{ Params: { id: string } }>("/shows/:id/copy", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) =>
    reply.status(201).send(publicShow(await copyShow(req.params.id))),
  );
  /** Stops changes to a demo show when demo shows are read-only (keys.ts). */
  const editable = async (id: string) => assertEditable(await getShow(id));

  app.post<{ Params: { id: string }; Body: { key?: string; choice?: string } }>("/shows/:id/confirm", async (req) => {
    const { key, choice } = req.body ?? {};
    if (!key || !choice) throw new HttpError(400, "key and choice are required.");
    await editable(req.params.id);
    return confirmEntity(req.params.id, key, choice);
  });
  app.post<{ Params: { id: string }; Body: { key?: string; text?: string } }>("/shows/:id/refine", async (req) => {
    const { key, text } = req.body ?? {};
    if (!key || !text?.trim()) throw new HttpError(400, "key and text are required.");
    await editable(req.params.id);
    return refineEntity(req.params.id, key, text);
  });

  app.post<{ Params: { id: string } }>("/shows/:id/runs", { config: { rateLimit: { max: 4, timeWindow: "1 minute" } } }, async (req, reply) => {
    await editable(req.params.id);
    const run = await withClaude(req, () => startRun(req.params.id));
    return reply.status(202).send({ runId: run.runId });
  });
  app.get<{ Params: { runId: string } }>("/runs/:runId", async (req) => getRun(req.params.runId));

  app.get<{ Params: { runId: string } }>("/runs/:runId/events", async (req, reply) => {
    const run = await getRun(req.params.runId);
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": (req.headers.origin as string) ?? "*",
    });
    const send = (ev: unknown, name = "message") => reply.raw.write(`event: ${name}\ndata: ${JSON.stringify(ev)}\n\n`);
    for (const e of run.events) send(e);
    const finish = () => {
      send({ status: run.status }, "end");
      reply.raw.end();
    };
    const unsub = subscribe(run.runId, (e) => {
      if (isEndMarker(e)) return finish();
      send(e);
    });
    if (!unsub) {
      finish();
      return reply;
    }
    const ping = setInterval(() => reply.raw.write(": ping\n\n"), 15000);
    req.raw.on("close", () => {
      clearInterval(ping);
      unsub();
    });
    return reply;
  });

  app.post<{ Params: { id: string; itemId: string } }>("/shows/:id/items/:itemId/approve", async (req) => (await editable(req.params.id), approveItem(req.params.id, req.params.itemId)));
  app.post<{ Params: { id: string; itemId: string } }>("/shows/:id/items/:itemId/reset", async (req) => (await editable(req.params.id), resetItem(req.params.id, req.params.itemId)));
  app.post<{ Params: { id: string; itemId: string }; Body: { reason?: string } }>("/shows/:id/items/:itemId/reject", async (req) => (await editable(req.params.id), rejectItem(req.params.id, req.params.itemId, req.body?.reason ?? "")));
  app.post<{ Params: { id: string; itemId: string } }>("/shows/:id/items/:itemId/swap", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req) => (await editable(req.params.id), (await swapItem(req.params.id, req.params.itemId)).show));
  app.post<{ Params: { id: string } }>("/shows/:id/approve-confident", async (req) => (await editable(req.params.id), (await approveConfident(req.params.id)).show));
  app.post<{ Params: { id: string } }>("/shows/:id/lock", async (req) => (await editable(req.params.id), lockPlan(req.params.id)));
  app.post<{ Params: { id: string } }>("/shows/:id/unlock", async (req) => (await editable(req.params.id), unlockPlan(req.params.id)));

  const sendFile = (reply: FastifyReply, type: string, name: string, body: Buffer | string) =>
    reply.header("Content-Type", type).header("Content-Disposition", `attachment; filename="${name}"`).send(body);

  app.get<{ Params: { id: string } }>("/shows/:id/export.csv", async (req, reply) => {
    const show = await getShow(req.params.id);
    if (!show.plan) throw new HttpError(409, "Plan the show first.", "no_plan");
    return sendFile(reply, "text/csv; charset=utf-8", `house-mix-${slug(show.title)}-v${show.version}.csv`, planCsv(show));
  });
  app.get<{ Params: { id: string } }>("/shows/:id/export.pdf", async (req, reply) => {
    const show = await getShow(req.params.id);
    if (!show.plan) throw new HttpError(409, "Plan the show first.", "no_plan");
    return sendFile(reply, "application/pdf", `house-mix-${slug(show.title)}-v${show.version}.pdf`, await runOfShowPdf(show));
  });
  // Hear the night: real songs for the artist picks and timed playlists for the music slots (Apple's catalogue, no key).
  app.post<{ Params: { id: string }; Body: { force?: boolean } }>("/shows/:id/music", { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } }, async (req) => {
    const show = await getShow(req.params.id);
    if (req.body?.force || !show.music) assertEditable(show);
    return musicFor(req.params.id, Boolean(req.body?.force));
  });
  const withMusic = async (id: string) => {
    const show = await getShow(id);
    if (!show.plan) throw new HttpError(409, "Plan the show first.", "no_plan");
    if (!show.music) throw new HttpError(409, "Find the songs first (Hear the night).", "no_music");
    return show;
  };
  app.get<{ Params: { id: string } }>("/shows/:id/playlist.csv", async (req, reply) => {
    const show = await withMusic(req.params.id);
    return sendFile(reply, "text/csv; charset=utf-8", `house-mix-${slug(show.title)}-playlists.csv`, playlistCsv(show));
  });
  app.get<{ Params: { id: string } }>("/shows/:id/playlist.m3u8", async (req, reply) => {
    const show = await withMusic(req.params.id);
    return sendFile(reply, "audio/x-mpegurl; charset=utf-8", `house-mix-${slug(show.title)}.m3u8`, playlistM3u(show));
  });
  app.get<{ Params: { id: string } }>("/shows/:id/cuesheet.pdf", async (req, reply) => {
    const show = await getShow(req.params.id);
    if (!show.plan) throw new HttpError(409, "Plan the show first.", "no_plan");
    return sendFile(reply, "application/pdf", `house-mix-${slug(show.title)}-cue-sheet.pdf`, await cueSheetPdf(show));
  });
  app.get<{ Params: { id: string; itemId: string } }>("/shows/:id/items/:itemId/sponsor.pdf", async (req, reply) => {
    const show = await getShow(req.params.id);
    const item = show.plan?.slots.flatMap((s) => s.items).find((i) => i.id === req.params.itemId);
    if (!item) throw new HttpError(404, "Plan item not found.", "not_found");
    return sendFile(reply, "application/pdf", `sponsor-${slug(item.pick.name)}.pdf`, await sponsorPdf(show, item));
  });

  app.post<{ Params: { id: string }; Body: { force?: boolean } }>("/shows/:id/briefing", { config: { rateLimit: { max: 4, timeWindow: "1 minute" } } }, async (req) => {
    const show = await getShow(req.params.id);
    if (!show.plan) throw new HttpError(409, "Plan the show first.", "no_plan");
    if (!req.body?.force && show.briefing && show.briefing.planVersion === show.version && show.briefing.audio.available) return show.briefing;
    assertEditable(show);
    const { briefing } = await withClaude(req, () => buildBriefing(show));
    const fresh = await getShow(show.id);
    fresh.briefing = briefing;
    await saveShow(fresh);
    return briefing;
  });
  app.get<{ Params: { id: string }; Querystring: { v?: string } }>("/shows/:id/briefing.mp3", async (req, reply) => {
    const show = await getShow(req.params.id);
    const v = Number(req.query.v ?? show.briefing?.planVersion ?? show.version);
    const audio = await readAudio(show.id, v);
    if (!audio) throw new HttpError(404, "No audio for this briefing.", "not_found");
    return reply.header("Content-Type", "audio/mpeg").header("Cache-Control", "public, max-age=3600").send(audio);
  });

  /** Crowd map: where each side's taste concentrates in the show city (qloo_where_popular). */
  app.post<{ Params: { id: string }; Body: { force?: boolean } }>("/shows/:id/heatmap", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req) => {
    if (req.body?.force) await editable(req.params.id);
    return heatmapFor(req.params.id, Boolean(req.body?.force));
  });

  /** "Without Qloo": Claude alone plans the same brief; Qloo checks and ranks those picks against the plan's. */
  app.post<{ Params: { id: string }; Body: { force?: boolean } }>("/shows/:id/counterfactual", { config: { rateLimit: { max: 3, timeWindow: "1 minute" } } }, async (req) => {
    const show = await getShow(req.params.id);
    const force = Boolean(req.body?.force);
    // A stored comparison for this version is free to read; a new one is a Claude call.
    if (!force && show.counterfactual && show.counterfactual.planVersion === show.version) return show.counterfactual;
    assertEditable(show);
    return withClaude(req, () => counterfactualFor(req.params.id, force));
  });

  /** Ask House Mix: a grounded answer streamed as NDJSON (tool calls as they happen, then the checked answer). */
  app.post<{ Params: { id: string }; Body: { question?: string } }>("/shows/:id/ask", { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } }, async (req, reply) => {
    const question = String(req.body?.question ?? "");
    reply.raw.writeHead(200, {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": (req.headers.origin as string) ?? "*",
    });
    const write = (o: unknown) => reply.raw.write(`${JSON.stringify(o)}\n`);
    try {
      await editable(req.params.id);
      const answer = await withClaude(req, () => askShow(req.params.id, question, (e) => write(e)));
      write({ type: "answer", answer });
    } catch (caught) {
      const e = claudeProblem(caught) ?? caught;
      const err = e as HttpError;
      if (!(e instanceof HttpError)) app.log.error(e);
      write({ type: "error", code: err.code ?? "server_error", message: e instanceof HttpError ? err.message : "House Mix could not answer that right now." });
    }
    reply.raw.end();
    return reply;
  });
  app.post<{ Params: { id: string; askId: string; proposalId: string } }>("/shows/:id/asks/:askId/proposals/:proposalId/add", async (req) => (await editable(req.params.id), addProposal(req.params.id, req.params.askId, req.params.proposalId)));

  app.get<{ Params: { shareId: string } }>("/share/:shareId", async (req) => {
    const shows = await getStore().list<Show>("shows", { where: ["shareId", req.params.shareId], limit: 1 });
    const show = shows[0];
    if (!show) throw new HttpError(404, "This share link does not exist.", "not_found");
    return publicShow(show);
  });

  /** Tonight vs last night: one Qloo comparison across the two bills plus a plan diff. */
  app.get<{ Querystring: { a?: string; b?: string } }>("/compare", async (req) => {
    if (!req.query.a || !req.query.b) throw new HttpError(400, "Pass two show IDs as a and b.");
    const [a, b] = await Promise.all([getShow(req.query.a), getShow(req.query.b)]);
    const bill = (s: Show) => s.entities.filter((e) => e.kind === "side" && e.status === "resolved" && e.qlooId).map((e) => e.qlooId!);
    const { call, envelope } = await getQloo().call("qloo_compare_audiences", { group_a: bill(a).slice(0, 10), group_b: bill(b).slice(0, 10), limit: 12 }, { runId: `compare_${a.id}_${b.id}`, agent: "compare" });
    const names = (s: Show) => new Set((s.plan?.slots ?? []).flatMap((sl) => sl.items.filter((i) => i.approval.state !== "swapped" && i.approval.state !== "rejected").map((i) => i.pick.name)));
    const na = names(a);
    const nb = names(b);
    return {
      a: { id: a.id, title: a.title, mode: a.input.mode, date: a.input.date, venue: a.input.venue, crowd: a.plan?.crowd, slots: a.plan?.slots ?? [] },
      b: { id: b.id, title: b.title, mode: b.input.mode, date: b.input.date, venue: b.input.venue, crowd: b.plan?.crowd, slots: b.plan?.slots ?? [] },
      comparison: {
        callId: call.callId,
        status: call.status,
        summary: envelope.summary || call.error?.recovery || "",
        rows: compareOf(call).rows,
        source: call.cached ? "cache" : call.source,
      },
      diff: { onlyA: [...na].filter((n) => !nb.has(n)), onlyB: [...nb].filter((n) => !na.has(n)), both: [...na].filter((n) => nb.has(n)) },
    };
  });

  // Blind A/B rater backend (eval/ab_blind). Pairs are generated offline; ratings carry no personal data.
  app.get("/eval/pairs", async () => {
    try {
      const raw = JSON.parse(await fs.readFile(path.join(REPO_ROOT, "eval/ab_blind/pairs.public.json"), "utf8")) as unknown;
      return raw;
    } catch {
      return { pairs: [], note: "No blind pairs have been generated yet (they need live Qloo data)." };
    }
  });
  app.post("/eval/ratings", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const parsed = Rating.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    const r = parsed.data;
    await getStore().put("ratings", `${r.raterCode}_${r.pairId}`, { ...r, at: new Date().toISOString() });
    return reply.status(201).send({ ok: true });
  });
  app.get("/eval/ratings/count", async () => ({ count: (await getStore().list("ratings")).length }));

  app.addHook("onClose", async () => {
    await getQloo().close();
  });

  return app;
}

/** Shows left "planning" by a previous process have no live run; put them back. */
export async function recoverStaleRuns() {
  for (const s of await getStore().list<Show>("shows")) {
    if (s.status === "planning") {
      s.status = s.plan ? (s.lockedAt ? "locked" : "planned") : "ready_to_plan";
      await saveShow(s);
    }
  }
}
