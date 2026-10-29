import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const EVAL_ROOT = path.dirname(fileURLToPath(import.meta.url));
export const RESULTS = path.join(EVAL_ROOT, "results");

/** Metrics are never computed from mock data. */
export function requireLive(script: string) {
  if ((process.env.QLOO_MODE ?? "mock") !== "live") {
    console.error(`${script}: refusing to run with QLOO_MODE=${process.env.QLOO_MODE ?? "mock"}. Evals only run against live Qloo (npm run qloo:verify first).`);
    process.exit(3);
  }
}

export function readJson<T>(p: string, fallback?: T): T {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch (e) {
    if (fallback !== undefined) return fallback;
    throw e;
  }
}

export function writeResult(name: string, data: unknown) {
  fs.mkdirSync(RESULTS, { recursive: true });
  const file = path.join(RESULTS, `${name}.json`);
  fs.writeFileSync(file, `${JSON.stringify({ generatedAt: new Date().toISOString(), qlooMode: process.env.QLOO_MODE, ...(data as object) }, null, 2)}\n`);
  return file;
}

/** Deterministic PRNG (mulberry32) so randomised orders are reproducible from a seed. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Wilson score interval for a binomial proportion. */
export function wilson(successes: number, n: number, z = 1.96): { p: number; lo: number; hi: number } {
  if (n === 0) return { p: 0, lo: 0, hi: 0 };
  const p = successes / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { p, lo: Math.max(0, c - h), hi: Math.min(1, c + h) };
}

/**
 * Fleiss' kappa for N items rated by a variable number of raters into k categories.
 * counts[i][j] = raters who put item i in category j. Items with < 2 ratings are skipped.
 */
export function fleissKappa(counts: number[][]): number | undefined {
  const rows = counts.filter((r) => r.reduce((s, x) => s + x, 0) >= 2);
  if (rows.length < 2) return undefined;
  const k = rows[0]!.length;
  const total = rows.reduce((s, r) => s + r.reduce((a, b) => a + b, 0), 0);
  const pj = Array.from({ length: k }, (_, j) => rows.reduce((s, r) => s + r[j]!, 0) / total);
  const Pi = rows.map((r) => {
    const n = r.reduce((a, b) => a + b, 0);
    return (r.reduce((s, x) => s + x * x, 0) - n) / (n * (n - 1));
  });
  const Pbar = Pi.reduce((a, b) => a + b, 0) / rows.length;
  const Pe = pj.reduce((s, x) => s + x * x, 0);
  return Pe === 1 ? undefined : (Pbar - Pe) / (1 - Pe);
}

/** hit@k and reciprocal rank of the first true item in a ranked list. */
export function hitAndRr(ranked: string[], truth: Set<string>, k = 10): { hit: boolean; rr: number } {
  const idx = ranked.findIndex((x) => truth.has(x));
  return { hit: idx >= 0 && idx < k, rr: idx >= 0 ? 1 / (idx + 1) : 0 };
}

export const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, " ").trim();
