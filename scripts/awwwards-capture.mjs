import { chromium } from "/home/prashant/projects/HouseMix/node_modules/playwright/index.mjs";
import fs from "node:fs";
const SITES = JSON.parse(fs.readFileSync("sites.json", "utf8"));
const only = process.argv.slice(2);
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
async function consent(p) {
  for (const re of [/^(accept|accept all|allow all|agree|i agree|ok|got it|enter|enter site|continue|start|explore|sound off|without sound|no sound)$/i]) {
    const btn = p.getByRole("button", { name: re }).first();
    if (await btn.count().catch(() => 0)) await btn.click({ timeout: 1500 }).catch(() => {});
    const link = p.getByRole("link", { name: re }).first();
    if (await link.count().catch(() => 0)) await link.click({ timeout: 1500, noWaitAfter: true }).catch(() => {});
  }
}
async function run(site) {
  const dir = `frames/${site.slug}`;
  fs.mkdirSync(dir, { recursive: true });
  const log = { slug: site.slug, url: site.url, notes: [] };
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, userAgent: UA, recordVideo: { dir: `video/${site.slug}`, size: { width: 960, height: 600 } } });
  const p = await ctx.newPage();
  try {
    await p.goto(site.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    for (const [i, t] of [[0, 600], [1, 1800], [2, 3800]].entries()) {
      await p.waitForTimeout(t[1] - (i ? [600, 1800, 3800][i - 1] : 0));
      await p.screenshot({ path: `${dir}/intro-${i}.jpg`, quality: 70, type: "jpeg" });
    }
    await consent(p);
    await p.waitForTimeout(1500);
    // pointer sweep for cursor-reactive heroes
    for (const [x, y] of [[300, 300], [900, 500], [1200, 250]]) { await p.mouse.move(x, y, { steps: 8 }); await p.waitForTimeout(250); }
    await p.screenshot({ path: `${dir}/hero.jpg`, quality: 70, type: "jpeg" });
    const total = await p.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
    log.height = total;
    let n = 0;
    for (let k = 0; k < 14; k++) {
      for (let s = 0; s < 6; s++) { await p.mouse.wheel(0, 140); await p.waitForTimeout(90); }
      await p.waitForTimeout(700);
      await p.screenshot({ path: `${dir}/scroll-${String(k).padStart(2, "0")}.jpg`, quality: 70, type: "jpeg" });
      n++;
      const at = await p.evaluate(() => window.scrollY + window.innerHeight);
      if (k > 3 && at >= total - 5) break;
    }
    log.frames = n;
    // hover the first few links/buttons for micro-interactions
    const targets = p.locator("a:visible, button:visible");
    const c = Math.min(await targets.count(), 3);
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(600);
    for (let i = 0; i < c; i++) await targets.nth(i).hover({ timeout: 1000 }).catch(() => {});
    await p.screenshot({ path: `${dir}/hover.jpg`, quality: 70, type: "jpeg" });
    log.fonts = await p.evaluate(() => [...new Set([...document.querySelectorAll("h1,h2,h3,p,a,button")].slice(0, 60).map((e) => getComputedStyle(e).fontFamily.split(",")[0].replace(/"/g, "")))].slice(0, 5));
    log.libs = await p.evaluate(() => ({ three: !!window.THREE || !!document.querySelector("canvas"), gsap: !!window.gsap, lenis: !!document.querySelector(".lenis, html.lenis"), webgl: document.querySelectorAll("canvas").length }));
  } catch (e) { log.notes.push(e.message.slice(0, 120)); }
  await ctx.close();
  // mobile
  const m = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA.replace("X11; Linux x86_64", "Linux; Android 14; Pixel 7") + " Mobile" });
  const mp = await m.newPage();
  try {
    await mp.goto(site.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await mp.waitForTimeout(4000); await consent(mp); await mp.waitForTimeout(800);
    await mp.screenshot({ path: `${dir}/m-0.jpg`, quality: 65, type: "jpeg" });
    for (let k = 1; k <= 2; k++) { await mp.evaluate(() => window.scrollBy(0, window.innerHeight * 1.1)); await mp.waitForTimeout(1200); await mp.screenshot({ path: `${dir}/m-${k}.jpg`, quality: 65, type: "jpeg" }); }
  } catch (e) { log.notes.push("mobile: " + e.message.slice(0, 80)); }
  await m.close();
  return log;
}
const list = SITES.filter((s) => !only.length || only.includes(s.slug));
const logs = [];
for (let i = 0; i < list.length; i += 3) logs.push(...(await Promise.all(list.slice(i, i + 3).map(run))));
fs.writeFileSync(`log-${Date.now()}.json`, JSON.stringify(logs, null, 1));
for (const l of logs) console.log(l.slug, l.frames, l.height, JSON.stringify(l.libs), l.fonts?.join("/"), l.notes.join(" | "));
await b.close();
