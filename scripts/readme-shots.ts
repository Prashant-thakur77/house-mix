/**
 * Viewport screenshots used by the README, taken from a running app (default http://localhost:3000).
 * Usage: npx tsx scripts/readme-shots.ts [baseUrl] [only ...]
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.argv[2] ?? "http://localhost:3000";
const only = process.argv.slice(3);
const out = (p: string) => path.join(ROOT, "design/app", p);

type Shot = { name: string; scheme: "light" | "dark"; run: (page: Page) => Promise<void>; file: string; fullPage?: boolean };
const shots: Shot[] = [
  {
    name: "hero",
    scheme: "dark",
    file: "landing/hero-desktop.png",
    run: async (page) => {
      await page.goto(`${base}/`);
      await page.waitForTimeout(2500);
    },
  },
  {
    name: "tested",
    scheme: "dark",
    file: "landing/tested-live.png",
    run: async (page) => {
      await page.goto(`${base}/`);
      await page.locator("#tested-title").evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 360));
      await page.waitForTimeout(1200);
    },
  },
  {
    name: "ask",
    scheme: "light",
    file: "show-concert-ask/viewport-light.png",
    run: async (page) => {
      await page.goto(`${base}/shows/seed-concert`);
      await page.getByRole("button", { name: /^ask$/i }).click();
      const answer = page.getByRole("dialog", { name: "Ask House Mix" }).locator("article").first();
      await answer
        .getByRole("button", { name: /qloo evidence/i })
        .first()
        .click();
      await page.waitForTimeout(800);
    },
  },
  {
    name: "without",
    scheme: "dark",
    file: "show-sports-without-qloo/viewport-dark.png",
    run: async (page) => {
      await page.goto(`${base}/shows/seed-sports`);
      const cf = page.getByRole("region", { name: "Without Qloo" });
      await cf.scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
    },
  },
  {
    name: "crowd",
    scheme: "light",
    file: "show-concert-crowd/viewport-light.png",
    run: async (page) => {
      await page.goto(`${base}/shows/seed-concert`);
      await page.getByText("Shared vs distinct").first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
    },
  },
  {
    name: "dining",
    scheme: "dark",
    file: "show-dining/viewport-dark.png",
    run: async (page) => {
      await page.goto(`${base}/shows/seed-dining`);
      await page.waitForTimeout(1500);
    },
  },
  {
    name: "night",
    scheme: "dark",
    file: "run-the-night/desktop-dark.png",
    run: async (page) => {
      await page.goto(`${base}/shows/seed-concert/live`);
      await page.getByRole("radio", { name: "300×" }).click();
      await page.getByRole("button", { name: /start the show/i }).click();
      await page.waitForTimeout(6000);
      await page.getByRole("button", { name: /^pause$/i }).click();
    },
  },
  {
    name: "venue",
    scheme: "dark",
    file: "run-the-night/venue-screen.png",
    run: async (page) => {
      await page.goto(`${base}/shows/seed-concert/live`);
      await page.getByRole("radio", { name: "300×" }).click();
      await page.getByRole("button", { name: /start the show/i }).click();
      await page.waitForTimeout(4000);
      await page.getByRole("button", { name: /venue screen/i }).click();
      await page.waitForTimeout(800);
    },
  },
];

const browser = await chromium.launch();
for (const s of shots.filter((x) => !only.length || only.includes(x.name))) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: s.scheme, deviceScaleFactor: 1 });
  await ctx.addInitScript((scheme) => localStorage.setItem("theme", scheme), s.scheme);
  const page = await ctx.newPage();
  await s.run(page);
  await page.screenshot({ path: out(s.file), fullPage: s.fullPage ?? false });
  console.log(`${s.name} -> design/app/${s.file}`);
  await ctx.close();
}
await browser.close();
