/**
 * UI research + app screenshot tool.
 *
 * Reference mode (default): screenshots every site in scripts/ui-refs.json into
 *   design/refs/<slug>/{desktop,mobile}-{light,dark}.png and writes design/refs/_log.json.
 *   A dark capture is kept only when the site actually changes under `prefers-color-scheme: dark`;
 *   a single-scheme site gets one file per viewport, named after the scheme it really renders.
 *
 * App mode: screenshots the House Mix app routes in scripts/app-routes.json into
 *   design/app/<slug>/{desktop,mobile}-{light,dark}.png (both schemes always) and writes design/app/_log.json.
 *
 * Usage:
 *   npx tsx scripts/ui-research.ts                         # all reference sites
 *   npx tsx scripts/ui-research.ts --only linear,dice      # a subset (log entries are merged)
 *   npx tsx scripts/ui-research.ts --app http://localhost:3000 [--routes scripts/app-routes.json]
 *
 * Flags:
 *   --only a,b          only these slugs
 *   --viewports d,m     desktop and/or mobile (default both)
 *   --max-height 6000   clip full-page captures at this CSS-pixel height
 *   --format png|jpeg   default png; refs fall back to jpeg (q82) when a png exceeds 4 MB
 *   --reduced-motion    refs mode: emulate prefers-reduced-motion: reduce
 *   --motion            app mode: keep motion on (app mode emulates reduced motion by default for stable shots)
 *   --concurrency 3     sites captured in parallel
 *   UI_DEBUG=1          print per-step timings
 *
 * Config: per-site `actions` / `settleMs` in ui-refs.json (sound gates, intro animations); per-route
 * `actions` (click/fill/press/hover/waitFor/wait/scroll by selector or role+name, name may be "/regex/i"),
 * `waitFor` and `unlockScroll` in app-routes.json.
 */
import { chromium, devices, type Browser, type BrowserContext, type Frame, type Locator, type Page } from "playwright";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* ----------------------------------------------------------------------------- types */

type Scheme = "light" | "dark";
type ViewportName = "desktop" | "mobile";

interface RefSite {
  slug: string;
  url: string;
  category?: string;
  source?: string;
  /** e.g. click past a sound gate / intro screen */
  actions?: AppAction[];
  /** extra wait after load for intro animations (ms) */
  settleMs?: number;
}

type AppAction =
  | { type: "click"; selector?: string; role?: AriaRole; name?: string }
  | { type: "fill"; selector?: string; role?: AriaRole; name?: string; value: string }
  | { type: "press"; key: string }
  | { type: "hover"; selector?: string; role?: AriaRole; name?: string }
  | { type: "waitFor"; selector?: string; role?: AriaRole; name?: string; state?: "visible" | "attached" | "hidden" }
  | { type: "wait"; ms: number }
  | { type: "scroll"; y: number };

interface AppRoute {
  slug: string;
  path: string;
  actions?: AppAction[];
  /** selector that must be visible before capture; overrides the config-level default */
  waitFor?: string;
  /** release an inner scroll container so a full-page capture shows everything (off for viewport-fitted consoles) */
  unlockScroll?: boolean;
}

interface AppRoutesConfig {
  /** localStorage key a theme provider (e.g. next-themes) reads; set to the scheme before load */
  themeStorageKey?: string;
  waitFor?: string;
  routes: AppRoute[];
}

type AriaRole = Parameters<Page["getByRole"]>[0];

interface Target {
  slug: string;
  url: string;
  actions?: AppAction[];
  waitFor?: string;
  settleMs?: number;
  unlockScroll?: boolean;
  meta?: Record<string, string | undefined>;
}

interface CaptureFile {
  viewport: ViewportName;
  scheme: Scheme;
  file: string;
  width: number;
  height: number;
  fullHeight: number;
  bytes: number;
  brightness: number;
}

interface LogEntry {
  slug: string;
  url: string;
  status: "captured" | "skipped" | "error";
  reason?: string;
  hasDarkVariant?: boolean;
  renderedScheme?: Scheme | "both";
  consent?: string;
  title?: string;
  files?: CaptureFile[];
  capturedAt: string;
  meta?: Record<string, string | undefined>;
}

interface Options {
  mode: "refs" | "app";
  baseUrl?: string;
  routesFile: string;
  only?: Set<string>;
  viewports: ViewportName[];
  maxHeight: number;
  format: "png" | "jpeg";
  reducedMotion: boolean;
  concurrency: number;
}

/* ----------------------------------------------------------------------------- config */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REFS_FILE = path.join(ROOT, "scripts/ui-refs.json");

const VIEWPORTS: Record<ViewportName, { width: number; height: number; base: (typeof devices)[string] }> = {
  desktop: { width: 1440, height: 900, base: devices["Desktop Chrome"] },
  mobile: { width: 390, height: 844, base: devices["iPhone 13"] },
};

const NAV_TIMEOUT = 45_000;
const IDLE_TIMEOUT = 12_000;
const SITE_TIMEOUT = 240_000;
const PNG_MAX_BYTES = 4 * 1024 * 1024;
/** UI_DEBUG=1 prints per-step timings */
const DEBUG = Boolean(process.env.UI_DEBUG);

/** Heuristics for bot walls / challenge pages that block headless browsing. */
const BLOCK_PATTERNS = [
  /just a moment/i,
  /attention required/i,
  /access denied/i,
  /verif(y|ying) (that )?you are (a )?human/i,
  /are you a robot/i,
  /captcha/i,
  /request unsuccessful/i,
  /pardon our interruption/i,
  /checking your browser/i,
  /bot protection/i,
];

/* Consent buttons, most privacy-preserving first. Never accept. */
const CONSENT_SELECTORS: { label: string; selector: string }[] = [
  { label: "onetrust reject", selector: "#onetrust-reject-all-handler" },
  { label: "cookiebot decline", selector: "#CybotCookiebotDialogBodyButtonDecline" },
  { label: "didomi disagree", selector: "#didomi-notice-disagree-button" },
  { label: "usercentrics deny", selector: "[data-testid='uc-deny-all-button']" },
  { label: "cookieyes reject", selector: ".cky-btn-reject" },
  { label: "osano deny", selector: ".osano-cm-denyAll" },
  { label: "termly decline", selector: "[data-tid='banner-decline']" },
  { label: "iubenda reject", selector: ".iubenda-cs-reject-btn" },
  { label: "complianz deny", selector: ".cmplz-deny" },
  { label: "klaro decline", selector: ".cm-btn-decline" },
  { label: "axeptio refuse", selector: "#axeptio_btn_dismiss" },
];

const CONSENT_TEXT: { label: string; name: RegExp }[] = [
  { label: "reject all", name: /^\s*(reject|decline|deny|refuse)( all)?( cookies| optional cookies| non-essential( cookies)?)?\s*$/i },
  { label: "reject (contains)", name: /\b(reject|decline|deny|refuse) (all|optional|non-essential|additional)\b/i },
  { label: "necessary only", name: /\b((only|strictly) )?(necessary|essential|required)( cookies)?( only)?\b/i },
  { label: "continue without", name: /continue without (accepting|agreeing)|no,? thanks|i do not accept|disagree/i },
];

const CONSENT_CONTAINERS =
  "[id*='cookie' i], [class*='cookie' i], [id*='consent' i], [class*='consent' i], [aria-label*='cookie' i], [aria-label*='consent' i], [id*='gdpr' i], [class*='gdpr' i]";

/* ----------------------------------------------------------------------------- cli */

function parseArgs(argv: string[]): Options {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const has = (flag: string) => argv.includes(flag);
  const baseUrl = get("--app");
  const mode = baseUrl ? "app" : "refs";
  const viewports = (get("--viewports") ?? "desktop,mobile")
    .split(",")
    .map((v) => (v.trim().startsWith("m") ? "mobile" : "desktop")) as ViewportName[];
  const format = get("--format") === "jpeg" ? "jpeg" : "png";
  return {
    mode,
    baseUrl: baseUrl?.replace(/\/$/, ""),
    routesFile: path.resolve(ROOT, get("--routes") ?? "scripts/app-routes.json"),
    only: get("--only") ? new Set(get("--only")!.split(",").map((s) => s.trim())) : undefined,
    viewports: [...new Set(viewports)],
    maxHeight: Number(get("--max-height") ?? 6000),
    format,
    reducedMotion: mode === "app" ? !has("--motion") : has("--reduced-motion"),
    concurrency: Math.max(1, Number(get("--concurrency") ?? 3)),
  };
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

/* ----------------------------------------------------------------------------- page helpers */

function toLocator(page: Page, a: { selector?: string; role?: AriaRole; name?: string }): Locator {
  if (a.role) {
    const m = a.name?.match(/^\/(.*)\/([a-z]*)$/);
    const name = m ? new RegExp(m[1], m[2]) : a.name;
    return page.getByRole(a.role, name === undefined ? {} : { name }).first();
  }
  if (!a.selector) throw new Error("action needs a selector or role");
  return page.locator(a.selector).first();
}

async function runActions(page: Page, actions: AppAction[] = []): Promise<void> {
  for (const a of actions) {
    switch (a.type) {
      case "click":
        await toLocator(page, a).click({ timeout: 10_000 });
        break;
      case "fill":
        await toLocator(page, a).fill(a.value, { timeout: 10_000 });
        break;
      case "hover":
        await toLocator(page, a).hover({ timeout: 10_000 });
        break;
      case "press":
        await page.keyboard.press(a.key);
        break;
      case "waitFor":
        await toLocator(page, a).waitFor({ state: a.state ?? "visible", timeout: 15_000 });
        break;
      case "wait":
        await page.waitForTimeout(a.ms);
        break;
      case "scroll":
        await page.evaluate((y) => window.scrollTo(0, y), a.y);
        break;
    }
    await page.waitForTimeout(250);
  }
}

/**
 * Click the most privacy-preserving consent option available, in the page or any frame.
 * Order: reject / necessary-only, then (if the banner only offers "accept" + "settings") open settings and
 * save with optional categories left off, then close the banner. Never accepts.
 */
async function dismissConsent(page: Page): Promise<string> {
  const first = await clickRejectOption(page);
  if (first) return first;
  const settings = page
    .getByRole("button", { name: /cookie settings|manage (cookies|preferences|options|settings)|customi[sz]e|^preferences$|^settings$|more options/i })
    .first();
  if (await settings.isVisible().catch(() => false)) {
    await settings.click({ timeout: 3_000 }).catch(() => undefined);
    await page.waitForTimeout(800);
    const second = await clickRejectOption(page);
    if (second) return `settings -> ${second}`;
    const save = page
      .getByRole("button", { name: /save (my )?(preferences|choices|settings)|confirm (my )?(choices|selection)|allow selection|save and (close|exit)/i })
      .first();
    if (await save.isVisible().catch(() => false)) {
      await save.click({ timeout: 3_000 }).catch(() => undefined);
      await page.waitForTimeout(600);
      return "settings -> saved defaults (optional off)";
    }
  }
  return closeConsentBanner(page);
}

/** Main frame plus frames that look like consent managers (skips ad iframes, which can hang). */
function consentFrames(page: Page): Frame[] {
  const cmp = /consent|cmp|privacy|cookie|onetrust|didomi|sourcepoint|trustarc|usercentrics|quantcast|cookiebot|sp_message/i;
  return [page.mainFrame(), ...page.frames().filter((f) => f !== page.mainFrame() && cmp.test(f.url()))];
}

async function clickRejectOption(page: Page): Promise<string | null> {
  for (const frame of consentFrames(page)) {
    for (const { label, selector } of CONSENT_SELECTORS) {
      const loc = frame.locator(selector).first();
      if (await loc.isVisible().catch(() => false)) {
        await loc.click({ timeout: 3_000 }).catch(() => undefined);
        await page.waitForTimeout(600);
        return label;
      }
    }
  }
  for (const { label, name } of CONSENT_TEXT) {
    for (const frame of consentFrames(page)) {
      for (const role of ["button", "link"] as const) {
        const loc = frame.getByRole(role, { name }).first();
        if (await loc.isVisible().catch(() => false)) {
          await loc.click({ timeout: 3_000 }).catch(() => undefined);
          await page.waitForTimeout(600);
          return label;
        }
      }
    }
  }
  return null;
}

/** No reject option: close the banner (never accept). Only inside consent containers. */
async function closeConsentBanner(page: Page): Promise<string> {
  const close = page
    .locator(CONSENT_CONTAINERS)
    .getByRole("button", { name: /^(close|dismiss|×|✕|x)$|close (banner|cookie|notice|dialog|message)|^dismiss/i })
    .first();
  if (await close.isVisible().catch(() => false)) {
    await close.click({ timeout: 3_000 }).catch(() => undefined);
    await page.waitForTimeout(500);
    return "closed banner (no reject option)";
  }
  const lingering = await page
    .locator(CONSENT_CONTAINERS)
    .filter({ hasText: /cookie|consent/i })
    .first()
    .isVisible()
    .catch(() => false);
  return lingering ? "banner left visible (accept-only)" : "none";
}

/**
 * Some sites scroll an inner container (body overflow hidden) so a full-page capture is one screen tall.
 * Release the largest scroller and its ancestors so the document itself takes the full height.
 */
async function unlockInnerScroll(page: Page): Promise<boolean> {
  return page
    .evaluate(() => {
      const doc = document.documentElement;
      if (doc.scrollHeight > window.innerHeight + 40) return false;
      let best: HTMLElement | null = null;
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
        const oy = getComputedStyle(el).overflowY;
        if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 200) {
          if (!best || el.scrollHeight > best.scrollHeight) best = el;
        }
      }
      if (!best) return false;
      for (let el: HTMLElement | null = best; el; el = el.parentElement) {
        el.style.setProperty("overflow", "visible", "important");
        el.style.setProperty("height", "auto", "important");
        el.style.setProperty("max-height", "none", "important");
      }
      return true;
    })
    .catch(() => false);
}

/** Scroll through the page to trigger lazy images / reveal-on-scroll, then return to the top. */
async function warmScroll(page: Page, maxHeight: number): Promise<void> {
  await page
    .evaluate(async (limit) => {
      const step = Math.round(window.innerHeight * 0.8);
      const end = Math.min(document.documentElement.scrollHeight, limit);
      for (let y = 0; y < end; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 180));
      }
      window.scrollTo(0, 0);
    }, maxHeight)
    .catch(() => undefined);
  await page.waitForTimeout(700);
}

/**
 * Mean perceived brightness (0 = black, 1 = white) of a captured image, computed by decoding it on a
 * blank page (no site CSP) and averaging a 48px-wide downscale. Used to tell whether a site really
 * changes under dark emulation and which scheme a single-scheme site renders.
 */
async function imageBrightness(ctx: BrowserContext, buffer: Buffer, mime: string): Promise<number> {
  const scratch = await ctx.newPage();
  try {
    return await scratch.evaluate(
      async ({ b64, type }) => {
        const img = new Image();
        img.src = `data:${type};base64,${b64}`;
        await img.decode();
        const w = 48;
        const h = Math.max(1, Math.round((img.height * w) / img.width));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const g = canvas.getContext("2d")!;
        g.drawImage(img, 0, 0, w, h);
        const px = g.getImageData(0, 0, w, h).data;
        let sum = 0;
        for (let i = 0; i < px.length; i += 4) sum += (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
        return sum / (px.length / 4);
      },
      { b64: buffer.toString("base64"), type: mime },
    );
  } finally {
    await scratch.close();
  }
}

/** A real dark variant moves overall brightness a lot; reloads with different imagery do not. */
const DARK_DELTA = 0.12;
const schemeOf = (brightness: number): Scheme => (brightness < 0.4 ? "dark" : "light");

async function detectBlock(page: Page, status: number | undefined): Promise<string | null> {
  const title = await page.title().catch(() => "");
  const text = await page
    .evaluate(() => document.body?.innerText.slice(0, 2000) ?? "")
    .catch(() => "");
  const short = text.trim().length < 600;
  if (BLOCK_PATTERNS.some((p) => p.test(title))) return `challenge page (title: "${title}")`;
  if (short && BLOCK_PATTERNS.some((p) => p.test(text))) return `challenge page (body: "${text.trim().slice(0, 80)}")`;
  if (status && [401, 403, 429, 503].includes(status) && short) return `HTTP ${status}`;
  if (status && (status === 404 || status === 410 || status >= 500)) return `unreachable (HTTP ${status})`;
  return null;
}

/* ----------------------------------------------------------------------------- capture */

interface Shot {
  /** mean perceived brightness of the capture, 0..1 */
  brightness: number;
  buffer: Buffer;
  ext: "png" | "jpg";
  width: number;
  height: number;
  fullHeight: number;
  consent: string;
  title: string;
}

async function newContext(
  browser: Browser,
  viewport: ViewportName,
  scheme: Scheme,
  opts: Options,
  themeStorageKey?: string,
): Promise<BrowserContext> {
  const vp = VIEWPORTS[viewport];
  const ctx = await browser.newContext({
    ...vp.base,
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    colorScheme: scheme,
    reducedMotion: opts.reducedMotion ? "reduce" : "no-preference",
    locale: "en-GB",
    timezoneId: "Europe/London",
  });
  // tsx/esbuild keepNames wraps functions in __name(); functions passed to page.evaluate need it defined.
  await ctx.addInitScript("globalThis.__name = globalThis.__name || ((fn) => fn);");
  if (themeStorageKey) {
    await ctx.addInitScript(
      ([key, value]) => {
        try {
          localStorage.setItem(key, value);
        } catch {
          /* storage blocked */
        }
      },
      [themeStorageKey, scheme] as const,
    );
  }
  return ctx;
}

async function shoot(
  browser: Browser,
  target: Target,
  viewport: ViewportName,
  scheme: Scheme,
  opts: Options,
  themeStorageKey?: string,
): Promise<Shot> {
  const ctx = await newContext(browser, viewport, scheme, opts, themeStorageKey);
  const t0 = Date.now();
  const step = (name: string) => DEBUG && console.log(`    [${target.slug} ${viewport}-${scheme}] ${name} +${Date.now() - t0}ms`);
  try {
    const page = await ctx.newPage();
    // one retry: slow CDNs occasionally miss the first domcontentloaded deadline
    const res = await page
      .goto(target.url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT })
      .catch(() => page.goto(target.url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT }));
    await page.waitForLoadState("networkidle", { timeout: IDLE_TIMEOUT }).catch(() => undefined);
    await page.waitForTimeout(1_500); // late consent banners, fonts, entry animations

    step("loaded");
    const blocked = await detectBlock(page, res?.status());
    if (blocked) throw new BlockedError(blocked);

    // Never auto-click banners in our own app: a "Reject" there is a real plan action.
    const consent = opts.mode === "refs" ? await dismissConsent(page) : "skipped (own app)";
    step(`consent: ${consent}`);
    if (target.waitFor) {
      await page.locator(target.waitFor).first().waitFor({ state: "visible", timeout: 15_000 });
    }
    await runActions(page, target.actions);
    if (target.settleMs) await page.waitForTimeout(target.settleMs);
    if (opts.mode === "refs" || target.unlockScroll) await unlockInnerScroll(page);
    if (opts.mode === "refs") await warmScroll(page, opts.maxHeight);
    step("scrolled");
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);

    const fullHeight = await page.evaluate(() =>
      Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0),
    );
    const width = VIEWPORTS[viewport].width;
    const height = Math.max(VIEWPORTS[viewport].height, Math.min(fullHeight, opts.maxHeight));
    const clip = { x: 0, y: 0, width, height };

    let ext: "png" | "jpg" = opts.format === "jpeg" ? "jpg" : "png";
    let buffer =
      ext === "png"
        ? await page.screenshot({ fullPage: true, clip, animations: "allow", timeout: 60_000 })
        : await page.screenshot({ fullPage: true, clip, type: "jpeg", quality: 82, timeout: 60_000 });
    if (ext === "png" && opts.mode === "refs" && buffer.byteLength > PNG_MAX_BYTES) {
      buffer = await page.screenshot({ fullPage: true, clip, type: "jpeg", quality: 82, timeout: 60_000 });
      ext = "jpg";
    }
    const brightness = await imageBrightness(ctx, buffer, ext === "png" ? "image/png" : "image/jpeg");
    step(`shot ${ext} ${buffer.byteLength}B brightness=${brightness.toFixed(2)}`);
    return { brightness, buffer, ext, width, height, fullHeight, consent, title: await page.title() };
  } finally {
    await ctx.close();
  }
}

class BlockedError extends Error {}

async function save(dir: string, viewport: ViewportName, scheme: Scheme, shot: Shot): Promise<CaptureFile> {
  const file = path.join(dir, `${viewport}-${scheme}.${shot.ext}`);
  await writeFile(file, shot.buffer);
  return {
    viewport,
    scheme,
    file: path.relative(ROOT, file),
    width: shot.width,
    height: shot.height,
    fullHeight: shot.fullHeight,
    bytes: shot.buffer.byteLength,
    brightness: Number(shot.brightness.toFixed(3)),
  };
}

/**
 * Reference sites: shoot light + dark on desktop, keep dark only if the site really changes.
 * App routes: always both schemes.
 */
async function captureTarget(
  browser: Browser,
  target: Target,
  outRoot: string,
  opts: Options,
  themeStorageKey?: string,
): Promise<LogEntry> {
  const dir = path.join(outRoot, target.slug);
  const base: LogEntry = { slug: target.slug, url: target.url, status: "captured", capturedAt: new Date().toISOString(), meta: target.meta };
  try {
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    const files: CaptureFile[] = [];
    let hasDark: boolean | undefined;
    let rendered: Scheme | "both" = "both";
    let consent = "none";
    let title = "";

    const blockedViewports: string[] = [];
    for (const viewport of opts.viewports) {
      // A wall on one viewport (e.g. mobile only) keeps the other viewport's captures.
      const light = await shoot(browser, target, viewport, "light", opts, themeStorageKey).catch((e: unknown) => {
        if (e instanceof BlockedError && files.length) {
          blockedViewports.push(`${viewport}: ${e.message}`);
          return null;
        }
        throw e;
      });
      if (!light) continue;
      consent = consent === "none" ? light.consent : consent;
      title ||= light.title;
      if (hasDark === false) {
        files.push(await save(dir, viewport, rendered as Scheme, light));
        continue;
      }
      const dark = await shoot(browser, target, viewport, "dark", opts, themeStorageKey);
      if (hasDark === undefined) {
        hasDark = opts.mode === "app" || Math.abs(light.brightness - dark.brightness) > DARK_DELTA;
        rendered = hasDark ? "both" : schemeOf(light.brightness);
      }
      if (hasDark) {
        files.push(await save(dir, viewport, "light", light));
        files.push(await save(dir, viewport, "dark", dark));
      } else {
        files.push(await save(dir, viewport, rendered as Scheme, light));
      }
    }
    return {
      ...base,
      hasDarkVariant: hasDark,
      renderedScheme: rendered,
      consent,
      title,
      files,
      ...(blockedViewports.length ? { reason: `partially blocked: ${blockedViewports.join("; ")}` } : {}),
    };
  } catch (err) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    const message = err instanceof Error ? err.message.split("\n")[0] : String(err);
    return { ...base, status: err instanceof BlockedError ? "skipped" : "error", reason: message };
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label}: exceeded ${ms / 1000}s`)), ms)),
  ]);
}

async function pool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/* ----------------------------------------------------------------------------- main */

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  let targets: Target[];
  let outRoot: string;
  let themeStorageKey: string | undefined;

  if (opts.mode === "app") {
    const cfg = await readJson<AppRoutesConfig>(opts.routesFile);
    themeStorageKey = cfg.themeStorageKey;
    outRoot = path.join(ROOT, "design/app");
    targets = cfg.routes.map((r) => ({
      slug: r.slug,
      url: `${opts.baseUrl}${r.path}`,
      actions: r.actions,
      waitFor: r.waitFor ?? cfg.waitFor,
      unlockScroll: r.unlockScroll,
      meta: { path: r.path },
    }));
  } else {
    const cfg = await readJson<{ sites: RefSite[] }>(REFS_FILE);
    outRoot = path.join(ROOT, "design/refs");
    targets = cfg.sites.map((s) => ({
      slug: s.slug,
      url: s.url,
      actions: s.actions,
      settleMs: s.settleMs,
      meta: { category: s.category, source: s.source },
    }));
  }
  if (opts.only) targets = targets.filter((t) => opts.only!.has(t.slug));
  if (!targets.length) throw new Error("no targets selected");
  await mkdir(outRoot, { recursive: true });

  const browser = await chromium.launch();
  console.log(`[${opts.mode}] ${targets.length} target(s) -> ${path.relative(ROOT, outRoot)}/`);
  const results = await pool(targets, opts.concurrency, async (t) => {
    const started = Date.now();
    const entry = await withTimeout(captureTarget(browser, t, outRoot, opts, themeStorageKey), SITE_TIMEOUT, t.slug).catch(
      async (e: Error): Promise<LogEntry> => {
        await rm(path.join(outRoot, t.slug), { recursive: true, force: true }).catch(() => undefined);
        return { slug: t.slug, url: t.url, status: "error", reason: e.message, capturedAt: new Date().toISOString() };
      },
    );
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    const detail = entry.status === "captured" ? `${entry.files?.length} file(s), scheme=${entry.renderedScheme}, consent=${entry.consent}${entry.reason ? `, ${entry.reason}` : ""}` : entry.reason;
    console.log(`  ${entry.status.padEnd(8)} ${t.slug.padEnd(22)} ${secs}s  ${detail}`);
    return entry;
  });
  await browser.close();

  const logFile = path.join(outRoot, "_log.json");
  const previous: LogEntry[] = existsSync(logFile) ? (await readJson<{ entries: LogEntry[] }>(logFile)).entries : [];
  const merged = new Map(previous.map((e) => [e.slug, e]));
  for (const r of results) merged.set(r.slug, r);
  const entries = [...merged.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  await writeFile(
    logFile,
    JSON.stringify(
      {
        mode: opts.mode,
        baseUrl: opts.baseUrl,
        viewports: opts.viewports.map((v) => ({ name: v, ...VIEWPORTS[v], base: undefined })),
        maxHeight: opts.maxHeight,
        updatedAt: new Date().toISOString(),
        summary: {
          captured: entries.filter((e) => e.status === "captured").length,
          skipped: entries.filter((e) => e.status === "skipped").map((e) => `${e.slug}: ${e.reason}`),
          errors: entries.filter((e) => e.status === "error").map((e) => `${e.slug}: ${e.reason}`),
        },
        entries,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`log -> ${path.relative(ROOT, logFile)}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
