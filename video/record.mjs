// Records House Mix's live site as crisp frames (Chrome's screencast, JPEG q92) and writes an exact-timed MP4, plus the
// moments the editor cuts on (marks, in seconds from the first frame).
//   node video/record.mjs <flow> [site]
//   flows: hero, finale, intake, plan, crowd, sponsor, ask, night; gfx-<scene> (graphics.html / three.html)
// Every step is something a visitor can do. "plan" is the one exception: it runs a real live plan, so it is recorded
// against a local build of the same app (pass its URL), labelled as such in the film.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = createRequire(path.join(ROOT, "package.json"))("playwright");

const FLOW = process.argv[2];
const SITE = process.argv[3] || "https://house-mix.vercel.app";
const WORK = `${process.env.HOME}/Videos/housemix`;
const OUT = `${WORK}/clips`;
const FRAMES = `${OUT}/frames-${FLOW}`;
rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });

// Headless Chrome on the laptop's GPU through ANGLE's OpenGL backend (the landing's point cloud and the 3D scene).
const browser = await chromium.launch({ args: ["--use-angle=gl", "--enable-gpu", "--ignore-gpu-blocklist"] });
// The site: 1536×864 at 1.25 renders its desktop layout into exactly 1920×1080 pixels. The drawn and 3D scenes are
// laid out at 1920×1080 themselves, so they get a window that size at 1×.
const DRAWN = FLOW.startsWith("gfx-");
const SCHEME = ["hero", "finale", "night"].includes(FLOW) ? "dark" : "light";
const ctx = await browser.newContext(
  DRAWN
    ? { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, colorScheme: "dark" }
    : { viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25, colorScheme: SCHEME, reducedMotion: "no-preference" },
);
await ctx.addInitScript((s) => {
  try {
    localStorage.setItem("theme", s);
  } catch {}
}, SCHEME);
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const frames = [];
let t0 = null;
cdp.on("Page.screencastFrame", async (f) => {
  const t = f.metadata.timestamp;
  if (t0 === null) t0 = t;
  const file = `${FRAMES}/${String(frames.length).padStart(5, "0")}.jpg`;
  writeFileSync(file, Buffer.from(f.data, "base64"));
  frames.push({ file, t: t - t0 });
  await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
});
const marks = {};
// Wall-clock marks on the screencast's clock: frames stop while the page is still, so a frame's time can be stale.
const mark = (name) => {
  marks[name] = t0 === null ? 0 : Date.now() / 1000 - t0;
  console.log("mark", name, marks[name].toFixed(2));
};
const wait = (ms) => page.waitForTimeout(ms);

/** A visible cursor with a soft red halo and a ripple on every click, drawn by the page so it records with it. */
async function cursor() {
  await page.addStyleTag({
    content: `#rec-cursor{position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;
      background:rgba(232,39,28,.30);box-shadow:0 0 0 2px rgba(232,39,28,.9),0 0 24px 6px rgba(232,39,28,.22);
      pointer-events:none;z-index:2147483647;transition:transform 120ms cubic-bezier(.16,1,.3,1)}
      #rec-cursor.down{transform:scale(.75)}
      .rec-ripple{position:fixed;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:2px solid rgba(232,39,28,.9);
      pointer-events:none;z-index:2147483646;animation:rec-ripple 600ms cubic-bezier(.16,1,.3,1) forwards}
      @keyframes rec-ripple{to{transform:scale(4);opacity:0}}
      nextjs-portal{display:none!important}`,
  });
  await page.evaluate(() => {
    const dot = Object.assign(document.createElement("div"), { id: "rec-cursor" });
    document.body.append(dot);
    addEventListener("mousemove", (e) => (dot.style.translate = `${e.clientX}px ${e.clientY}px`), true);
    addEventListener(
      "mousedown",
      (e) => {
        dot.classList.add("down");
        const r = Object.assign(document.createElement("div"), { className: "rec-ripple" });
        r.style.left = `${e.clientX}px`;
        r.style.top = `${e.clientY}px`;
        document.body.append(r);
        setTimeout(() => r.remove(), 700);
      },
      true,
    );
    addEventListener("mouseup", () => dot.classList.remove("down"), true);
  });
}

let mouse = { x: 768, y: 600 };
/** Glides the cursor to the middle of *locator*, eased, then clicks it. */
async function press(locator, { click = true } = {}) {
  await locator.scrollIntoViewIfNeeded();
  // Aim only once a smooth scroll has settled: the box stops moving between two reads.
  let box = await locator.boundingBox();
  for (let i = 0; i < 20; i++) {
    await wait(80);
    const next = await locator.boundingBox();
    if (next && box && Math.abs(next.y - box.y) < 0.5) break;
    box = next;
  }
  const to = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const steps = 24;
  for (let i = 1; i <= steps; i++) {
    const k = 1 - Math.pow(1 - i / steps, 3);
    await page.mouse.move(mouse.x + (to.x - mouse.x) * k, mouse.y + (to.y - mouse.y) * k);
    await wait(14);
  }
  mouse = to;
  if (click) {
    await wait(120);
    await page.mouse.down();
    await wait(90);
    await page.mouse.up();
  }
}

/** Types like a person into *locator* (the cursor glides there first). */
async function type(locator, text) {
  await press(locator);
  await locator.pressSequentially(text, { delay: 45 });
}

/** Smoothly scrolls the window (or *within*, a scrolling container) so *locator* sits *offset* px below its top. */
async function scrollTo(locator, offset = 110, within = null) {
  await locator.first().evaluate(
    (el, [o, sel]) => {
      const box = sel ? el.closest(sel) : null;
      if (box) box.scrollTo({ top: el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - o, behavior: "smooth" });
      else window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - o, behavior: "smooth" });
    },
    [offset, within],
  );
  await wait(900);
}

/** Scrolls the window by *dy* px over *ms*, eased, so a long move reads as one camera move. */
async function glide(dy, ms) {
  const from = await page.evaluate(() => window.scrollY);
  const n = Math.max(1, Math.round(ms / 16));
  for (let i = 1; i <= n; i++) {
    const k = 1 - Math.pow(1 - i / n, 3);
    await page.evaluate((y) => window.scrollTo(0, y), from + dy * k);
    await wait(16);
  }
}

async function start(url, ready) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  if (ready) await ready();
  await cursor();
  await page.mouse.move(mouse.x, mouse.y);
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  await wait(400);
  mark("start");
}

/** Fills the sports intake for Dodgers vs Giants and resolves it; leaves the console on the confirm cards. */
async function fixture() {
  await press(page.getByRole("radio", { name: /sports/i }));
  await wait(500);
  await type(page.getByLabel("Home team", { exact: true }), "Los Angeles Dodgers");
  await type(page.getByLabel("Away team", { exact: true }), "San Francisco Giants");
  await type(page.getByLabel("Venue", { exact: true }), "Dodger Stadium");
  await type(page.getByLabel("City", { exact: true }), "Los Angeles");
  mark("typed");
  await wait(500);
  await press(page.getByRole("button", { name: /resolve and continue/i }));
  mark("resolve");
  const venue = page.getByRole("article").filter({ has: page.getByRole("heading", { name: /which “dodger stadium”/i }) });
  await venue.waitFor({ timeout: 60_000 });
  await wait(600);
  mark("confirm");
  await wait(2600);
  await press(venue.locator("label").filter({ hasText: /Los Angeles, home/ }));
  await wait(500);
  await press(venue.getByRole("button", { name: "Confirm" }));
  mark("venueConfirmed");
  const city = page.getByRole("article").filter({ has: page.getByRole("heading", { name: /which “los angeles”/i }) });
  await city.waitFor({ timeout: 30_000 });
  await wait(1400);
  await press(city.locator("label").filter({ hasText: /most popular in Qloo/ }));
  await wait(400);
  await press(city.getByRole("button", { name: "Confirm" }));
  mark("cityConfirmed");
  await page.getByRole("button", { name: /build run-of-show/i, disabled: false }).waitFor({ timeout: 30_000 });
  await wait(1200);
}

const flows = {
  /** The landing's black HUD: the point-cloud figure, then the scroll that turns it into a crowd. */
  async hero() {
    await start(`${SITE}/`, () => wait(2500));
    await wait(4200);
    mark("figure");
    await glide(1100, 6500);
    mark("crowd");
    await wait(2500);
    mark("end");
  },

  /** The violet finale: the LED wordmark with its peak meters, the spinning record, now playing. */
  async finale() {
    await page.goto(`${SITE}/`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.locator("footer, section").last().scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await wait(1500);
    await cursor();
    await page.mouse.move(-50, -50);
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
    await wait(400);
    mark("start");
    await wait(8000);
    mark("end");
  },

  /** Intake on the live site: a fixture, every name to Qloo, the Dodger Stadium twin in Iowa, a person chooses. */
  async intake() {
    await start(`${SITE}/new`);
    await fixture();
    mark("end");
  },

  /** A real live plan, start to finish: the agents and every Qloo call streaming into the trace. */
  async plan() {
    await start(`${SITE}/new`);
    await fixture();
    await press(page.getByRole("button", { name: /build run-of-show/i }));
    mark("build");
    await page
      .getByText(/^Plan ready$/)
      .first()
      .waitFor({ timeout: 8 * 60_000 });
    mark("ready");
    await wait(2500);
    mark("end");
  },

  /** The crowd read on the seeded concert, then a pick's evidence: what Qloo said, and what drove it. */
  async crowd() {
    await start(`${SITE}/shows/seed-concert`);
    await scrollTo(page.getByText("Shared vs distinct").first(), 90, 'main, [class*="overflow-y-auto"]');
    mark("crowd");
    await wait(4500);
    const pick = page.getByRole("button", { name: "Open evidence for Brainstory" });
    await scrollTo(pick, 260, '[class*="overflow-y-auto"]');
    await press(pick);
    await page.getByRole("complementary", { name: "Evidence" }).waitFor();
    mark("drawer");
    await wait(5000);
    mark("end");
  },

  /** The sponsor slot on the seeded fixture: brands Qloo ranks for this crowd, the comparison, the activation, the one-pager. */
  async sponsor() {
    await start(`${SITE}/shows/seed-sports`);
    const slot = page.getByRole("heading", { name: "Sponsor activations" });
    await scrollTo(slot, 90, '[class*="overflow-y-auto"]');
    mark("slot");
    await wait(2600);
    await press(page.getByRole("button", { name: "Open evidence for Nike Training Club" }));
    const drawer = page.getByRole("complementary", { name: "Evidence" });
    await drawer.waitFor();
    mark("evidence");
    await wait(3800);
    await scrollTo(drawer.getByText(/compare_audiences/).first(), 180, '[aria-label="Evidence"]');
    mark("compare");
    await wait(3500);
    const pdf = drawer.getByRole("button", { name: /Sponsor one-pager/ });
    await scrollTo(pdf, 420, '[aria-label="Evidence"]');
    await press(pdf, { click: false });
    mark("export");
    await wait(2200);
    mark("end");
  },

  /** Ask House Mix on the dinner service: a sponsor question, answered only from Qloo, every line cited. */
  async ask() {
    await start(`${SITE}/shows/seed-dining`);
    await press(page.getByRole("button", { name: /^ask$/i }));
    const sheet = page.getByRole("dialog", { name: "Ask House Mix" });
    await sheet.waitFor();
    mark("ask");
    await wait(3500);
    await press(
      sheet
        .locator("article")
        .first()
        .getByRole("button", { name: /qloo evidence/i })
        .first(),
    );
    mark("evidence");
    await wait(3500);
    mark("end");
  },

  /** The use cases: a comedy room, a festival day and a restaurant's service, each a seeded show planned on live Qloo. */
  async comedy() {
    await usecase("seed-comedy", ["MC & openers", "Interval clips & podcasts"]);
  },
  async festival() {
    await usecase("seed-festival", ["Discovery stage", "Food village"]);
  },
  async dining() {
    await usecase("seed-dining", ["Peak service", "Drinks & pairings", "Late lounge set"]);
  },

  /** The five kinds of night on the intake: the cursor passes over each mode. */
  async modes() {
    await start(`${SITE}/new`);
    for (const name of [/concert/i, /comedy/i, /sports/i, /festival/i, /dining/i]) {
      await press(page.getByRole("radio", { name }), { click: false });
      mark(String(name).replaceAll("/", "").replace("i", ""));
      await wait(700);
    }
    await wait(600);
    mark("end");
  },

  /** Getting the night ready on the festival: the checklist, then its playlist as real songs, played, down to the
   * artists Qloo added when the picks ran short. */
  async listen() {
    const scroller = '[class*="overflow-y-auto"]';
    await start(`${SITE}/shows/seed-festival`);
    await scrollTo(page.locator("#ready-title"), 120, scroller);
    mark("ready");
    await wait(2200);
    await scrollTo(page.locator("#hear-title"), 110, scroller);
    mark("hear");
    await wait(1200);
    await press(page.getByRole("button", { name: /play the set/i }).first());
    await page.getByRole("region", { name: "Now previewing" }).waitFor();
    mark("play");
    await wait(2200);
    await press(page.getByRole("button", { name: /^Show all \d+ songs/ }));
    const fill = page.getByText("added by Qloo", { exact: true }).first();
    await scrollTo(fill, 330, scroller);
    await press(fill, { click: false });
    mark("fill");
    await wait(2600);
    mark("end");
  },

  /** The outreach pack on the fixture: a message per partner from its evidence; a sponsor's with its one-pager. */
  async outreach() {
    await start(`${SITE}/shows/seed-sports`);
    await wait(600);
    await press(page.getByRole("button", { name: /^Outreach/ }));
    const sheet = page.getByRole("dialog", { name: "Outreach pack" });
    await sheet.waitFor();
    mark("sheet");
    await wait(1600);
    const first = sheet.getByRole("article").first();
    await press(first.getByRole("button", { name: /open in email/i }), { click: false });
    mark("email");
    await wait(1500);
    const brand = sheet.getByRole("article").filter({ has: page.getByRole("button", { name: /one-pager/i }) }).first();
    await scrollTo(brand, 140, '[data-slot="sheet-content"] [class*="overflow-y-auto"]');
    await press(brand.getByRole("button", { name: /one-pager/i }), { click: false });
    mark("onepager");
    await wait(2200);
    mark("end");
  },

  /** Run the night on the fixture: the partnerships crew's cue arrives and is called. */
  async night() {
    await start(`${SITE}/shows/seed-sports/live`);
    await press(page.getByRole("radio", { name: "Partnerships" }));
    await wait(500);
    // Jump to a minute before the first song and the first partnerships cue (doors 13:00, the night ends 18:30).
    const track = page.locator('section[aria-label="The night"] [role="presentation"]');
    const box = await track.boundingBox();
    await press(track, { click: false });
    await page.mouse.click(box.x + box.width * (119 / 330), box.y + box.height / 2);
    await wait(500);
    await press(page.getByRole("radio", { name: "60×" }));
    await press(page.getByRole("button", { name: /^(start the show|resume)$/i }));
    mark("play");
    await page.getByText(/^Playing a 30-second preview/).waitFor({ timeout: 15_000 });
    mark("song");
    await wait(2500);
    const cue = page.getByRole("button", { name: /^Mark called: Activate/ }).first();
    await press(cue);
    mark("called");
    await wait(2500);
    mark("end");
  },
};

/** A seeded show's console, scrolled slot by slot (each slot heading held for a beat). */
async function usecase(id, slots) {
  await start(`${SITE}/shows/${id}`);
  await wait(800);
  for (const label of slots) {
    await scrollTo(page.getByRole("heading", { name: label }), 90, '[class*="overflow-y-auto"]');
    mark(label);
    await wait(2300);
  }
  mark("end");
}

/** A drawn scene from graphics.html or three.html, timed to its lines and their spoken words, recorded in real time. */
async function graphics(name) {
  const timeline = JSON.parse(readFileSync(`${WORK}/build/timeline.json`, "utf8"));
  const scene = timeline.scenes.find((x) => x.name === name);
  const cues = scene.cues ?? Object.fromEntries(scene.lines.map((l) => [l.id, +(l.start - scene.start).toFixed(3)]));
  const all = existsSync(`${WORK}/audio/words.json`) ? JSON.parse(readFileSync(`${WORK}/audio/words.json`, "utf8")) : {};
  const words = Object.fromEntries((scene.lines ?? []).map((l) => [l.id, (all[l.id] || []).map(([w, a]) => [w, a])]));
  const facts = readFileSync(`${WORK}/build/facts.json`, "utf8");
  const stills = pathToFileURL(`${WORK}/stills`).href;
  const hash = `scene=${name}&dur=${scene.dur}&cues=${encodeURIComponent(JSON.stringify(cues))}&words=${encodeURIComponent(JSON.stringify(words))}&facts=${encodeURIComponent(facts)}&stills=${encodeURIComponent(stills)}`;
  const file = name === "arch" ? "three.html" : "graphics.html";
  await page.goto(`${pathToFileURL(path.join(ROOT, "video", file)).href}#${hash}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30_000 });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  await wait(300);
  mark("start");
  await page.evaluate(() => window.__start());
  await wait(scene.dur * 1000 + 300);
  mark("end");
}

if (FLOW.startsWith("gfx-")) await graphics(FLOW.slice(4));
else await flows[FLOW]();
await cdp.send("Page.stopScreencast");
await browser.close();

// Exact-timed video: each frame lasts until the next one (the screencast only sends frames when something changes).
// The last frame lasts until the flow's end mark, so a still ending isn't cut short.
// At high frame rates the screencast can deliver frames out of order: sort them, and never write a zero duration.
frames.sort((a, b) => a.t - b.t);
const lastUntil = Math.max((frames.at(-1)?.t ?? 0) + 0.5, marks.end ?? 0);
const list = frames.map((f, i) => `file '${f.file}'\nduration ${Math.max(0.001, (frames[i + 1]?.t ?? lastUntil) - f.t).toFixed(4)}`).join("\n");
writeFileSync(`${FRAMES}/list.txt`, `${list}\nfile '${frames.at(-1).file}'\n`);
const r = spawnSync(
  "ffmpeg",
  [
    "-loglevel",
    "error",
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    `${FRAMES}/list.txt`,
    "-vf",
    "scale=1920:1080:flags=lanczos,fps=30,format=yuv420p",
    "-c:v",
    "libx264",
    "-crf",
    "16",
    "-preset",
    "medium",
    `${OUT}/${FLOW}.mp4`,
  ],
  { stdio: "inherit" },
);
writeFileSync(`${OUT}/${FLOW}.marks.json`, JSON.stringify(marks, null, 1));
// Kept when the encode fails, to see why.
if (r.status === 0) rmSync(FRAMES, { recursive: true, force: true });
console.log(FLOW, frames.length, "frames,", (frames.at(-1)?.t ?? 0).toFixed(1), "s; ffmpeg", r.status);
