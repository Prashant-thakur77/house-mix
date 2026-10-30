import { afterAll, beforeAll, describe, expect, it } from "vitest";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Health, Show } from "@housemix/shared";
import { FileStore, getStore, setStore } from "../src/store/store.ts";
import { QlooClient, setQloo } from "../src/qloo/client.ts";
import { buildApp } from "../src/app.ts";
import { anthropic } from "../src/llm.ts";
import { claudeProblem, withClaude } from "../src/keys.ts";

// The public site's settings: Claude runs on each visitor's own key, and demo shows are read-only.
process.env.HM_REQUIRE_USER_KEY = "1";
process.env.HM_PROTECT_SEEDS = "1";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hm-keys-"));
process.env.MOCK_LATENCY_MS = "0";
setStore(new FileStore(dir));
setQloo(new QlooClient("mock"));
let app: FastifyInstance;
let mine: Show;
let demo: Show;
const KEY = "sk-ant-api03-visitor-test-key-0123456789abcdef";

const call = async (url: string, opts: { body?: unknown; key?: string; method?: "GET" | "POST" } = {}) => {
  const res = await app.inject({ method: opts.method ?? "POST", url, payload: (opts.body ?? {}) as object, headers: opts.key ? { "x-anthropic-key": opts.key } : {} });
  return { status: res.statusCode, text: res.body, body: (res.headers["content-type"] ?? "").includes("json") ? res.json() : undefined };
};

beforeAll(async () => {
  app = await buildApp();
  const input = { mode: "concert", sides: [{ role: "headliner", name: "Velvet Static" }], venue: "Hollywood Bowl", city: "Los Angeles", date: "2026-11-14", capacityTier: "arena" };
  mine = (await call("/shows", { body: input })).body as Show;
  demo = { ...(await call("/shows", { body: input })).body, seed: true } as Show;
  await getStore().put("shows", demo.id, demo);
});
afterAll(async () => {
  await app.close();
});

describe("bring your own key", () => {
  it("says so in the health check", async () => {
    const h = (await call("/health", { method: "GET" })).body as Health;
    expect(h.userKeyRequired).toBe(true);
    expect(h.seedsReadOnly).toBe(true);
  });

  it("refuses Claude features without the visitor's key, and never falls back to the server's", async () => {
    const run = await call(`/shows/${mine.id}/runs`);
    expect(run.status).toBe(401);
    expect(run.body.error).toBe("user_key_required");
    const cf = await call(`/shows/${mine.id}/counterfactual`);
    expect(cf.status).toBe(401);
    const ask = await call(`/shows/${mine.id}/ask`, { body: { question: "Who should open?" } });
    expect(ask.text).toContain('"code":"user_key_required"');
    expect(() => anthropic()).toThrow(/visitor's Anthropic key is required/);
  });

  it("rejects something that isn't a key, without echoing it", async () => {
    const run = await call(`/shows/${mine.id}/runs`, { key: "hello-not-a-key" });
    expect(run.status).toBe(400);
    expect(run.body.error).toBe("user_key_invalid");
    expect(run.text).not.toContain("hello-not-a-key");
  });

  it("lets a request with a key through to the work itself", async () => {
    // Past the gate, the plan stops on its own rule (the show isn't ready), before any Claude call.
    const run = await call(`/shows/${mine.id}/runs`, { key: KEY });
    expect(run.body.error).not.toBe("user_key_required");
    expect(run.text).not.toContain(KEY);
  });

  it("gives Claude the visitor's key for that work, and only that work", async () => {
    const req = { headers: { "x-anthropic-key": KEY } } as unknown as FastifyRequest;
    expect(await withClaude(req, async () => anthropic().apiKey)).toBe(KEY);
    // Work started inside keeps the key after an await (a plan runs in the background).
    expect(await withClaude(req, async () => new Promise((r) => setTimeout(() => r(anthropic().apiKey), 5)))).toBe(KEY);
    expect(() => anthropic()).toThrow();
  });
});

describe("a key that doesn't work", () => {
  it("says what to fix, in plain words", () => {
    // What Claude Code reports for a rejected key, and what the Anthropic SDK reports for an empty account.
    expect(claudeProblem(new Error("Claude Code returned an error result: Invalid API key · Fix external API key"))?.code).toBe("user_key_invalid");
    expect(claudeProblem(Object.assign(new Error("401 authentication_error"), { status: 401 }))?.code).toBe("user_key_invalid");
    expect(claudeProblem(new Error("Your credit balance is too low to access the Anthropic API."))?.code).toBe("user_key_no_credit");
    expect(claudeProblem(new Error("Qloo timed out"))).toBeUndefined();
  });
});

describe("demo shows stay the same for everyone", () => {
  it("refuses changes to a demo show, even with a key", async () => {
    for (const url of [`/shows/${demo.id}/items/x/approve`, `/shows/${demo.id}/approve-confident`, `/shows/${demo.id}/lock`, `/shows/${demo.id}/items/x/swap`]) {
      const r = await call(url);
      expect(r.status, url).toBe(403);
      expect(r.body.error).toBe("seed_read_only");
    }
    expect((await call(`/shows/${demo.id}/runs`, { key: KEY })).status).toBe(403);
    expect((await call(`/shows/${demo.id}/ask`, { body: { question: "Who should open?" }, key: KEY })).text).toContain("seed_read_only");
  });

  it("makes the visitor their own copy, which they can change", async () => {
    const r = await call(`/shows/${demo.id}/copy`);
    expect(r.status).toBe(201);
    const copy = r.body as Show;
    expect(copy.id).not.toBe(demo.id);
    expect(copy.seed).toBe(false);
    expect(copy.title).toBe(demo.title);
    // The copy accepts changes (this item doesn't exist, so it's a 404, not a refusal).
    expect((await call(`/shows/${copy.id}/items/x/approve`)).status).not.toBe(403);
    expect(((await call(`/shows/${demo.id}`, { method: "GET" })).body as Show).seed).toBe(true);
  });

  it("lists only the demo shows publicly", async () => {
    const list = (await call("/shows", { method: "GET" })).body as { id: string; seed: boolean }[];
    expect(list.map((s) => s.id)).toEqual([demo.id]);
  });
});
