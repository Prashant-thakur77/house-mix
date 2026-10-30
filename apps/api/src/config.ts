import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const API_ROOT = path.resolve(here, "..");
export const REPO_ROOT = path.resolve(API_ROOT, "../..");

function env(name: string, fallback = ""): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

/** Single source of truth for runtime configuration. Model IDs live here and nowhere else. */
export const config = {
  get qlooMode(): "mock" | "live" {
    return env("QLOO_MODE", "mock") === "live" ? "live" : "mock";
  },
  /** Default model for every Claude call (subagents, Critic, briefing, eval). */
  get model(): string {
    return env("HM_MODEL", "claude-sonnet-5-5");
  },
  /** Worker subagents (CrowdReader, Programmer, SponsorFit, Wildcard). */
  get workerModel(): string {
    return env("HM_WORKER_MODEL", config.model);
  },
  /** Planner (main agent thread). */
  get plannerModel(): string {
    return env("HM_PLANNER_MODEL", config.model);
  },
  get port(): number {
    return Number(env("PORT", "8787"));
  },
  get store(): "file" | "firestore" {
    return env("HM_STORE", "file") === "firestore" ? "firestore" : "file";
  },
  get dataDir(): string {
    return env("HM_DATA_DIR", path.join(REPO_ROOT, "data"));
  },
  get gcpProject(): string {
    return env("GOOGLE_CLOUD_PROJECT");
  },
  get audioBucket(): string {
    return env("HM_AUDIO_BUCKET");
  },
  /** QLOO_BIN, else the copy `npm run qloo:verify` installs in .qloo-harness/, else `qloo` on PATH. */
  get qlooBin(): string {
    const local = path.join(REPO_ROOT, ".qloo-harness/node_modules/.bin/qloo");
    return env("QLOO_BIN", fs.existsSync(local) ? local : "qloo");
  },
  get corsOrigins(): string[] {
    return env("HM_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  },
  /** Qloo calls allowed per plan run (cache hits are free). */
  qlooCallCap: Number(env("HM_QLOO_CALL_CAP", "40")),
  /** Hard ceiling on Claude spend per plan run. */
  runBudgetUsd: Number(env("HM_RUN_BUDGET_USD", "1.5")),
  cacheTtlMs: 24 * 60 * 60 * 1000,
  maxRetries: 2,
  get hasAnthropicKey(): boolean {
    return env("ANTHROPIC_API_KEY") !== "";
  },
  get publicBaseUrl(): string {
    return env("HM_PUBLIC_BASE_URL", `http://localhost:${config.port}`);
  },
  version: "1.0.0",
};
