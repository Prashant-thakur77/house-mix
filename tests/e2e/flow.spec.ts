import { expect, test } from "@playwright/test";

const API = "http://localhost:8788";

test("landing lists the seeded demo shows and the mode banner", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /program the night/i })).toBeVisible();
  for (const t of [/Khruangbin/, /Taylor Tomlinson/, /Chelsea FC vs Arsenal F\.?C\.?/]) await expect(page.getByRole("link", { name: t }).first()).toBeVisible();
  if ((process.env.QLOO_MODE ?? "mock") === "mock") await expect(page.getByText("MOCK DATA").first()).toBeVisible();
  // The landing explains how it works, Qloo's role, the sponsor tools and the safety rules.
  await expect(page.getByRole("heading", { name: /how it works/i })).toBeAttached();
  await expect(page.getByRole("heading", { name: /every pick is on file/i })).toBeVisible();
  await expect(page.getByText(/powered by qloo/i).first()).toBeVisible();
  await expect(page.getByText(/for sponsors and brand partners/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: /find your crowd before the doors open/i })).toBeVisible();
});

test("intake resolves names, Genesis needs confirmation, and nothing is auto-picked", async ({ page }) => {
  await page.goto("/new");
  await page.getByLabel("Headliner", { exact: true }).fill("Genesis");
  await page.getByLabel("Venue", { exact: true }).fill("Hollywood Bowl");
  await page.getByLabel("City", { exact: true }).fill("Los Angeles");
  await page.getByRole("button", { name: /resolve and continue/i }).click();
  await expect(page).toHaveURL(/\/shows\/s_/);
  // The mock makes the band ambiguous; live Qloo resolves the band and asks about the venue and the city.
  const live = process.env.QLOO_MODE === "live";
  const first = live ? /which “hollywood bowl”/i : /which “genesis”/i;
  await expect(page.getByRole("heading", { name: first })).toBeVisible();
  const build = page.getByRole("button", { name: /build run-of-show/i });
  await expect(build).toBeDisabled();
  const cards = page.getByRole("article").filter({ has: page.getByRole("heading", { name: /^which “/i }) });
  const n = await cards.count();
  for (let k = 0; k < n; k++) {
    const card = cards.first();
    const confirm = card.getByRole("button", { name: "Confirm" });
    await expect(confirm).toBeDisabled();
    await card.getByRole("radio").first().check();
    await confirm.click();
    await expect(cards).toHaveCount(n - k - 1);
  }
  await expect(build).toBeEnabled();
});

test("personal data in the intake is refused before it reaches Qloo", async ({ page }) => {
  await page.goto("/new");
  await page.getByLabel("Headliner", { exact: true }).fill("Khruangbin");
  await page.getByLabel("Venue", { exact: true }).fill("Hollywood Bowl");
  await page.getByLabel("City", { exact: true }).fill("Los Angeles");
  await page.getByLabel("Notes for the agent").fill("send the guest list to booker@example.com");
  await page.getByRole("button", { name: /resolve and continue/i }).click();
  await expect(page.getByText(/does not accept personal data/i)).toBeVisible();
  await expect(page).toHaveURL(/\/new$/);
});

test("console: evidence drawer, approve, swap re-ranks with Qloo, reject records a signal", async ({ page }) => {
  await page.goto("/shows/seed-concert");
  await expect(page.getByRole("heading", { name: "Run of show" })).toBeVisible();
  await expect(page.getByRole("log", { name: /qloo tool calls/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Crowd read" })).toBeVisible();

  await page
    .getByRole("button", { name: /^open evidence for/i })
    .first()
    .click();
  const aside = page.getByRole("complementary", { name: "Evidence" });
  await expect(aside.getByText("Qloo says")).toBeVisible();
  await expect(aside.getByText("Our interpretation")).toBeVisible();
  await expect(aside.getByText(/qloo_(rank|recommend)/).first()).toBeVisible();
  await aside.getByRole("button", { name: "Close evidence" }).click();

  const cards = page.locator("article[data-item-id]");
  await cards.nth(0).getByRole("button", { name: "Approve" }).click();
  await expect(cards.nth(0).getByText("Approved")).toBeVisible();

  await cards.nth(1).getByRole("button", { name: "Swap" }).click();
  await expect(page.getByText(/swapped in/i).first()).toBeVisible();
  await expect(page.getByText("Swapped out").first()).toBeVisible();

  const target = cards.nth(3);
  await target.getByRole("button", { name: "Reject" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Wrong energy for this slot" }).click();
  await dialog.getByRole("button", { name: "Reject" }).click();
  await expect(page.getByText("Negative signals for the next plan")).toBeVisible();
  await expect(page.getByText("Wrong energy for this slot").first()).toBeVisible();
});

test("exports and share link work without login", async ({ page, request }) => {
  const pdf = await request.get(`${API}/shows/seed-sports/export.pdf`);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  const csv = await request.get(`${API}/shows/seed-sports/export.csv`);
  expect(await csv.text()).toContain("qloo_says");
  const show = await (await request.get(`${API}/shows/seed-sports`)).json();
  const brand = show.plan.slots.find((s: { kind: string }) => s.kind === "brand").items[0];
  const sp = await request.get(`${API}/shows/seed-sports/items/${brand.id}/sponsor.pdf`);
  expect(sp.status()).toBe(200);
  await page.goto(`/shows/seed-sports/share?k=${show.shareId}`);
  await expect(page.getByText("Shared plan · read only")).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Chelsea FC vs Arsenal F\.?C\.?$/ })).toBeVisible();
  await expect(page.getByText("Limitations")).toBeVisible();
});

test("compare tonight vs last night calls qloo_compare_audiences", async ({ page }) => {
  await page.goto("/compare?a=seed-concert&b=seed-festival");
  await expect(page.getByRole("heading", { name: "How the crowds differ" })).toBeVisible();
  await expect(page.getByText("qloo_compare_audiences")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Plan side by side" })).toBeVisible();
});

test("every mode has its own intake fields", async ({ page }) => {
  await page.goto("/new");
  await page.getByRole("radio", { name: /sports/i }).click();
  await expect(page.getByLabel("Home team")).toBeVisible();
  await expect(page.getByLabel("Away team")).toBeVisible();
  await page.getByRole("radio", { name: /comedy/i }).click();
  await expect(page.getByRole("button", { name: /add mc \/ opener/i })).toBeVisible();
  await page.getByRole("radio", { name: /festival/i }).click();
  await expect(page.getByLabel("Stage for act 1")).toBeVisible();
});

test("console: crowd map, Without Qloo comparison and a cited Ask answer", async ({ page }) => {
  await page.goto("/shows/seed-concert");
  const map = page.getByRole("region", { name: /taste concentrates/i });
  await expect(map).toBeVisible();
  await expect(map.getByRole("img", { name: /qloo heatmap of los angeles/i })).toBeVisible();
  await expect(map.getByText("Street teams & flyering")).toBeVisible();
  await map.getByText(/areas as a table/i).click();
  await expect(map.getByRole("table")).toBeVisible();

  const cf = page.getByRole("region", { name: "Without Qloo" });
  await expect(cf).toBeVisible();
  await expect(cf.getByText(/claude-alone picks qloo could find/i)).toBeVisible();
  await expect(cf.getByText("Claude alone").first()).toBeVisible();
  await expect(cf.getByText(/not an independent quality test/i)).toBeVisible();

  await page.getByRole("button", { name: /^ask$/i }).click();
  const sheet = page.getByRole("dialog", { name: "Ask House Mix" });
  await expect(sheet).toBeVisible();
  const answer = sheet.locator("article").first();
  await expect(answer.getByText("House Mix, from Qloo")).toBeVisible();
  await answer
    .getByRole("button", { name: /qloo evidence/i })
    .first()
    .click();
  await expect(answer.getByText(/^qloo_/).first()).toBeVisible();

  // Personal data is refused before anything reaches Claude or Qloo.
  await sheet.getByLabel("Your question").fill("email the plan to booker@example.com");
  await sheet.getByRole("button", { name: /^ask$/i }).click();
  await expect(page.getByText(/personal data/i).first()).toBeVisible();
});

test("run the night: the clock plays the plan, cues can be called, the venue screen opens", async ({ page }) => {
  await page.goto("/shows/seed-concert");
  await page.getByRole("button", { name: /run the night/i }).click();
  await expect(page).toHaveURL(/\/shows\/seed-concert\/live$/);
  await expect(page.getByRole("heading", { name: /crew cues/i })).toBeVisible();
  await page.getByRole("radio", { name: "300×" }).click();
  await page.getByRole("button", { name: /start the show/i }).click();
  const stage = page.getByRole("region", { name: "On stage now" });
  await expect(stage.getByText(/now playing/i)).toBeVisible({ timeout: 10_000 });
  // A real 30-second preview when House Mix found the artist's songs (live data), otherwise a synthesized cue.
  await expect(stage.getByText(/synthesized cue|30-second preview/i)).toBeVisible();
  await page.getByRole("button", { name: /^pause$/i }).click();
  const first = page.getByRole("button", { name: /^mark called:/i }).first();
  await first.click();
  await expect(page.getByText(/1\/\d+ called/i)).toBeVisible();
  await page.getByRole("button", { name: /\+5 min late/i }).click();
  await expect(page.getByText(/running 5 min late/i)).toBeVisible();
  await page.getByRole("button", { name: /venue screen/i }).click();
  await expect(page.getByRole("dialog", { name: "Venue screen" })).toBeVisible();
});

test("dining mode: a restaurant and its theme resolve, and the seeded dinner service runs", async ({ page }) => {
  await page.goto("/new");
  await page.getByRole("radio", { name: /dining/i }).click();
  await page.getByLabel("Your restaurant or bar", { exact: true }).fill("Dishoom Shoreditch");
  await page.getByLabel("Venue", { exact: true }).fill("Dishoom Shoreditch");
  await page.getByLabel("City", { exact: true }).fill("London");
  await page.getByRole("button", { name: /resolve and continue/i }).click();
  await expect(page).toHaveURL(/\/shows\/s_/);
  await expect(page.getByRole("heading", { level: 1, name: /dishoom shoreditch: dinner service/i })).toBeVisible();
  await page.goto("/shows/seed-dining/live");
  await expect(page.getByText(/arrivals & early seating/i).first()).toBeVisible();
  await expect(page.getByRole("radio", { name: "F&B" })).toBeVisible();
});

test("get the night ready: a checklist from names to doors, and an outreach pack built from the evidence", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/shows/seed-sports");
  const ready = page.getByRole("region", { name: /of \d+ done/ }).or(page.locator("section[aria-labelledby='ready-title']"));
  await expect(ready.first()).toBeVisible();
  await expect(page.getByText("Names confirmed with Qloo")).toBeVisible();
  await expect(page.getByText("Partners contacted")).toBeVisible();
  await page.getByRole("button", { name: /^Outreach/ }).click();
  const sheet = page.getByRole("dialog", { name: "Outreach pack" });
  await expect(sheet).toBeVisible();
  const first = sheet.getByRole("article").first();
  await expect(first).toContainText(/Qloo's taste data/);
  // Base UI renders the link with a button role.
  const mail = first.getByRole("button", { name: /open in email/i });
  await expect(mail).toHaveAttribute("href", /^mailto:\?subject=/);
  await first.getByRole("button", { name: /^copy/i }).click();
  // Only a copy that worked counts as contacted, and what was copied is the message itself.
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/Qloo's taste data/);
  await page.keyboard.press("Escape");
  await expect(page.getByText(/1 of \d+ messaged/)).toBeVisible();
});

test("hear the night: real songs per pick, playlists timed to the slots, exports for the venue", async ({ page, request }) => {
  const live = process.env.QLOO_MODE === "live";
  await page.goto("/shows/seed-dining");
  await expect(page.getByRole("heading", { name: "The playlists, as real songs" })).toBeVisible();
  const cue = await request.get(`${API}/shows/seed-dining/cuesheet.pdf`);
  expect(cue.status()).toBe(200);
  expect((await cue.body()).subarray(0, 4).toString()).toBe("%PDF");
  if (!live) {
    // Mock artists are fictional: the page says so instead of inventing songs.
    await expect(page.getByText(/no songs to play/i)).toBeVisible();
    expect((await request.get(`${API}/shows/seed-dining/playlist.csv`)).status()).toBe(409);
    return;
  }
  const csv = await (await request.get(`${API}/shows/seed-dining/playlist.csv`)).text();
  expect(csv.split("\n")[0]).toContain("apple_music");
  expect(csv.split("\n").length).toBeGreaterThan(20);
  await page.getByRole("button", { name: "Play the set" }).first().click();
  const bar = page.getByRole("region", { name: "Now previewing" });
  await expect(bar).toBeVisible();
  await expect(bar).toContainText("30-second preview");
  await expect(bar.getByRole("link", { name: /apple music/i })).toHaveAttribute("href", /music\.apple\.com/);
  await bar.getByRole("button", { name: "Stop previews" }).click();
  await expect(bar).toHaveCount(0);
});
