import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { checkValue, type LedgerCall, type QlooStatus, type QlooToolName } from "@housemix/shared";
import { API_ROOT, config } from "../config.ts";
import { getStore } from "../store/store.ts";
import { extractResultIds, inputIdsOf, issuesOf, normalisedResults } from "./normalize.ts";

/** The result envelope every `qloo mcp` tool returns (see docs/QLOO_CONTRACT.md). */
export interface Envelope {
  schema_version?: string;
  operation?: string;
  status: QlooStatus;
  summary: string;
  interpretation?: unknown;
  results: unknown;
  result_count: number;
  warnings?: string[];
  query_intent?: unknown;
  error?: { code: string; layer?: string; retryable: boolean; recovery: string };
  execution?: { transport: string; transport_name: string; correlation_id: string; duration_ms: number };
  provenance?: { source: string; endpoint: string; documentation: string; transport?: string; requests?: unknown[] };
  [k: string]: unknown;
}

export interface CallContext {
  runId: string;
  agent?: string;
  budget?: Budget;
  /** Called after every call completes (live trace). */
  onCall?: (call: LedgerCall, envelope: Envelope) => void;
}

export class Budget {
  used = 0;
  cacheHits = 0;
  retries = 0;
  constructor(readonly cap: number) {}
  get remaining() {
    return Math.max(0, this.cap - this.used);
  }
}

export interface CallResult {
  call: LedgerCall;
  envelope: Envelope;
}

interface CacheDoc {
  key: string;
  tool: string;
  envelope: Envelope;
  storedAt: number;
}

const MOCK_SERVER = path.join(API_ROOT, "src/qloo/mock-server.ts");

/** Canonical JSON: sorted keys, so equal arguments always hash the same. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as object)
      .sort()
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Bump when the mock's behaviour changes, so cached mock envelopes are not reused. */
export const MOCK_VERSION = "mock-8";

export function cacheKey(mode: string, tool: string, args: unknown): string {
  const ns = mode === "mock" ? MOCK_VERSION : mode;
  return createHash("sha256")
    .update(`${ns}|${tool}|${canonical(args)}`)
    .digest("hex");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function synthetic(tool: string, code: string, summary: string, recovery: string): Envelope {
  return {
    schema_version: "1.0-preview.1",
    operation: tool.replace(/^qloo_/, ""),
    status: "error",
    summary,
    results: [],
    result_count: 0,
    error: { code, layer: "house_mix", retryable: false, recovery },
  };
}

/** Parses a CallToolResult into an envelope, defensively (mirrors the kit's backend.mjs). */
export function parseEnvelope(result: { structuredContent?: unknown; content?: unknown }): Envelope {
  let raw = result.structuredContent as Record<string, unknown> | undefined;
  if (!raw) {
    const text = Array.isArray(result.content) ? (result.content as { type: string; text?: string }[]).find((c) => c.type === "text")?.text : undefined;
    try {
      raw = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      raw = { summary: text ?? "" };
    }
  }
  if (raw.status === undefined) {
    return {
      ...raw,
      status: "error",
      summary: String(raw.summary ?? "Qloo returned no status."),
      results: raw.results ?? [],
      result_count: Number(raw.result_count ?? 0),
      error: { code: "UNKNOWN", retryable: false, recovery: "Check the Qloo MCP server logs.", ...(raw.error as object) },
    } as Envelope;
  }
  return {
    ...raw,
    summary: String(raw.summary ?? ""),
    results: raw.results ?? [],
    result_count: Number(raw.result_count ?? 0),
  } as Envelope;
}

/**
 * One pooled MCP client for the whole API process. It starts `qloo mcp` (live) or the
 * schema-identical mock server (mock) as a stdio child with `env: process.env`, so
 * QLOO_API_KEY reaches the server. Every Qloo call in House Mix goes through `call()`.
 */
export class QlooClient {
  private client: Client | undefined;
  private connecting: Promise<Client> | undefined;
  private tools: { name: string; description?: string; inputSchema: unknown; annotations?: unknown }[] = [];
  readonly mode: "mock" | "live";

  constructor(mode: "mock" | "live" = config.qlooMode) {
    this.mode = mode;
  }

  private transport() {
    if (this.mode === "live") {
      return new StdioClientTransport({ command: config.qlooBin, args: ["mcp"], env: process.env as Record<string, string>, stderr: "pipe" });
    }
    return new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", MOCK_SERVER],
      env: process.env as Record<string, string>,
      cwd: API_ROOT,
      stderr: "pipe",
    });
  }

  async connect(): Promise<Client> {
    if (this.client) return this.client;
    if (!this.connecting) {
      this.connecting = (async () => {
        const client = new Client({ name: "house-mix-api", version: config.version });
        const transport = this.transport();
        transport.onclose = () => {
          this.client = undefined;
          this.connecting = undefined;
        };
        try {
          await client.connect(transport);
        } catch (error) {
          this.connecting = undefined;
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            throw new Error("Cannot start `qloo`. Install it with: npm install --global @qloo/qloo-harness");
          }
          throw error;
        }
        const listed = await client.listTools();
        this.tools = listed.tools as typeof this.tools;
        this.client = client;
        return client;
      })();
    }
    return this.connecting;
  }

  async listTools() {
    await this.connect();
    return this.tools;
  }

  async capabilities(): Promise<Record<string, unknown>> {
    const client = await this.connect();
    const res = await client.callTool({ name: "qloo_capabilities", arguments: {} });
    return (res.structuredContent ?? {}) as Record<string, unknown>;
  }

  async ready(): Promise<{ ready: boolean; contractVersion?: string; error?: string }> {
    try {
      const cap = await this.capabilities();
      const adapter = (cap.adapter ?? {}) as { ready?: boolean };
      return { ready: Boolean(adapter.ready), contractVersion: cap.contract_version as string | undefined };
    } catch (e) {
      return { ready: false, error: (e as Error).message };
    }
  }

  /**
   * Calls one Qloo tool with caching, the kit's retry rule (retry only when
   * error.retryable is true, at most twice), the per-run budget, and the PII guard.
   * Records a ledger entry for every call so evidence can be built server-side.
   */
  async call(tool: Exclude<QlooToolName, "qloo_capabilities">, args: Record<string, unknown>, ctx: CallContext): Promise<CallResult> {
    const store = getStore();
    const started = Date.now();
    const callId = `c_${randomUUID().slice(0, 12)}`;
    let envelope: Envelope;
    let cached = false;
    let attempts = 0;

    const guard = checkValue(args);
    if (!guard.ok) {
      envelope = synthetic(tool, "HM_GUARD", `Blocked before reaching Qloo: ${guard.detail} at ${guard.path}.`, guard.message ?? "");
    } else {
      const key = cacheKey(this.mode, tool, args);
      const hit = await store.get<CacheDoc>("cache", key);
      if (hit && Date.now() - hit.storedAt < config.cacheTtlMs) {
        envelope = hit.envelope;
        cached = true;
        if (ctx.budget) ctx.budget.cacheHits++;
      } else if (ctx.budget && ctx.budget.remaining <= 0) {
        envelope = synthetic(tool, "HM_BUDGET", `Qloo call budget for this plan is used up (${ctx.budget.cap} calls).`, "Reuse results already gathered in this run; cite existing call IDs.");
      } else {
        if (ctx.budget) ctx.budget.used++;
        const client = await this.connect();
        for (;;) {
          attempts++;
          try {
            envelope = parseEnvelope((await client.callTool({ name: tool, arguments: args })) as { structuredContent?: unknown; content?: unknown });
          } catch (e) {
            envelope = {
              status: "error",
              summary: `MCP transport failure: ${(e as Error).message}`,
              results: [],
              result_count: 0,
              error: { code: "MCP_TRANSPORT", layer: "transport", retryable: true, recovery: "The Qloo MCP server restarted; retry the call." },
            };
          }
          const retryable = envelope.status === "error" && envelope.error?.retryable === true;
          if (!retryable || attempts > config.maxRetries) break;
          if (ctx.budget) ctx.budget.retries++;
          await sleep(400 * 3 ** (attempts - 1));
        }
        if (envelope.status !== "error") {
          await store.put<CacheDoc>("cache", key, { key, tool, envelope, storedAt: Date.now() });
        }
      }
    }

    const results = normalisedResults(tool, envelope);
    const call: LedgerCall = {
      callId,
      runId: ctx.runId,
      agent: ctx.agent ?? "system",
      tool,
      args,
      status: envelope.status,
      summary: envelope.summary ?? "",
      warnings: envelope.warnings ?? [],
      results,
      resultIds: extractResultIds(tool, envelope),
      inputIds: inputIdsOf(envelope.interpretation),
      issues: envelope.status === "needs_input" ? issuesOf(envelope as { resolution?: unknown }) : [],
      error: envelope.error ? { code: envelope.error.code, retryable: envelope.error.retryable, recovery: envelope.error.recovery } : undefined,
      endpoint: envelope.provenance?.endpoint,
      durationMs: Date.now() - started,
      cached,
      attempts,
      source: this.mode,
      at: new Date().toISOString(),
    };
    await store.put("ledger", callId, call);
    ctx.onCall?.(call, envelope);
    return { call, envelope };
  }

  async close() {
    await this.client?.close();
    this.client = undefined;
    this.connecting = undefined;
  }
}

let shared: QlooClient | undefined;
export function getQloo(): QlooClient {
  if (!shared) shared = new QlooClient();
  return shared;
}
export function setQloo(c: QlooClient) {
  shared = c;
}
