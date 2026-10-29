/**
 * WCAG 2.x contrast check for the design tokens.
 *   npx tsx scripts/contrast.ts [design/tokens.json]
 * Prints a markdown table per theme and exits 1 if any pair is below its required ratio.
 */
import { readFileSync } from "node:fs";

interface TokenFile {
  themes: Record<string, Record<string, string>>;
  /** [foreground token, background token, required ratio] */
  pairs: [string, string, number][];
}

const channel = (v: number): number => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(full.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const file = process.argv[2] ?? "design/tokens.json";
const cfg = JSON.parse(readFileSync(file, "utf8")) as TokenFile;
let failures = 0;
for (const [theme, t] of Object.entries(cfg.themes)) {
  console.log(`\n#### ${theme}\n`);
  console.log("| Foreground | Background | Ratio | Needs | Result |");
  console.log("|---|---|---:|---:|---|");
  for (const [fg, bg, need] of cfg.pairs) {
    if (!t[fg] || !t[bg]) {
      console.log(`| \`${fg}\` | \`${bg}\` | missing token | ${need}:1 | **FAIL** |`);
      failures++;
      continue;
    }
    const r = contrast(t[fg], t[bg]);
    const ok = r >= need;
    if (!ok) failures++;
    console.log(`| \`${fg}\` ${t[fg]} | \`${bg}\` ${t[bg]} | ${r.toFixed(2)}:1 | ${need}:1 | ${ok ? "pass" : "**FAIL**"} |`);
  }
}
console.error(`\n${failures} failing pair(s)`);
process.exit(failures ? 1 : 0);
