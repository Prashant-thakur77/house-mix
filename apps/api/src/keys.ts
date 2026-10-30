import { AsyncLocalStorage } from "node:async_hooks";
import type { FastifyRequest } from "fastify";
import type { Show } from "@housemix/shared";
import { HttpError } from "./shows/service.ts";

/**
 * Bring your own key. On the public site every Claude feature (planning, Ask, Without Qloo, the briefing) runs on the
 * visitor's own Anthropic API key, sent with that request in one header. The key lives only in memory for the work that
 * request starts (an AsyncLocalStorage context, so a plan running in the background keeps it); it is never stored, logged
 * or returned. With HM_REQUIRE_USER_KEY=1 the server's own key is never used for a visitor's request.
 *
 * HM_PROTECT_SEEDS=1 makes the demo shows read-only, so every visitor and judge sees the same plans; anyone can make
 * their own copy to approve, swap, ask and plan.
 */

export const KEY_HEADER = "x-anthropic-key";
const KEY_SHAPE = /^sk-ant-[A-Za-z0-9_-]{20,200}$/;

const context = new AsyncLocalStorage<{ apiKey: string }>();

export const userKeyRequired = () => process.env.HM_REQUIRE_USER_KEY === "1";
export const seedsReadOnly = () => process.env.HM_PROTECT_SEEDS === "1";

/** The visitor's key for the work in progress, if this request brought one. */
export const visitorKey = (): string | undefined => context.getStore()?.apiKey;

/** The key a request brought, checked for shape (Anthropic keys start "sk-ant-"); undefined when it brought none. */
export function keyFrom(req: FastifyRequest): string | undefined {
  const raw = req.headers[KEY_HEADER];
  const key = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (!key) return undefined;
  if (!KEY_SHAPE.test(key)) throw new HttpError(400, "That doesn't look like an Anthropic API key (they start with sk-ant-).", "user_key_invalid");
  return key;
}

/**
 * Runs a Claude feature for this request: with the visitor's key when they brought one, with the server's key only when
 * the deployment allows it (local development, scripts). Anything the work starts in the background keeps the key.
 */
export function withClaude<T>(req: FastifyRequest, fn: () => Promise<T>): Promise<T> {
  const apiKey = keyFrom(req);
  if (apiKey) return context.run({ apiKey }, fn);
  if (userKeyRequired()) {
    throw new HttpError(
      401,
      "This uses Claude. Add your own Anthropic API key (top right, “Your API key”): it stays in your browser and is used only for your requests.",
      "user_key_required",
    );
  }
  return fn();
}

/** Stops a change to a demo show when demo shows are read-only. */
export function assertEditable(show: Pick<Show, "seed">): void {
  if (seedsReadOnly() && show.seed) {
    throw new HttpError(403, "Demo shows stay the same for everyone. Make your own copy to approve, swap, ask and plan.", "seed_read_only");
  }
}

/** A Claude failure the visitor can fix (a rejected key, an account out of credit), as a plain message; else undefined. */
export function claudeProblem(e: unknown): HttpError | undefined {
  if (e instanceof HttpError) return undefined;
  const err = e as { status?: number; message?: string } | undefined;
  const message = String(err?.message ?? "");
  if (err?.status === 401 || /invalid x-api-key|invalid api key|authentication_error/i.test(message)) {
    return new HttpError(401, "Anthropic didn't accept that API key. Check it under “Your API key” and try again.", "user_key_invalid");
  }
  if (/credit balance|billing/i.test(message)) {
    return new HttpError(402, "Your Anthropic account is out of credit. Add credit at console.anthropic.com, then try again.", "user_key_no_credit");
  }
  return undefined;
}
