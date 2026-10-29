import { expect, test } from "@playwright/test";

const API = "http://localhost:8788";

test("landing lists the seeded demo shows and the mode banner", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /program tonight/i })).toBeVisible();
  for (const t of [/Khruangbin/, /Taylor Tomlinson/, /Chelsea FC vs Arsenal FC/]) await expect(page.getByRole("link", { name: t }).first()).toBeVisible();
  if ((process.env.QLOO_MODE ?? "mock") === "mock") await expect(page.getByText("MOCK DATA")).toBeVisible();
  await expect(page.getByText("qloo_where_popular")).toBeVisible();
});

test("intake resolves names, Genesis needs confirmation, and nothing is auto-picked", async ({ page }) => {
  await page.goto("/new");
  await page.getByLabel("Headliner", { exact: true }).fill("Genesis");
  await page.getByLabel("Venue", { exact: true }).fill("Hollywood Bowl");
  await page.getByLabel("City", { exact: true }).fill("Los Angeles");
  await page.getByRole("button", { name: /resolve and continue/i }).click();
  await expect(page).toHaveURL(/\/shows\/s_/);
  await expect(page.getByRole("heading", { name: /which “genesis”/i })).toBeVisible();
  const build = page.getByRole("button", { name: /build run-of-show/i });
  await expect(build).toBeDisabled();
  const confirm = page.getByRole("button", { name: "Confirm" }).first();
  await expect(confirm).toBeDisabled();
  await page.getByRole("radio").first().check();
  await confirm.click();
  await expect(page.getByRole("heading", { name: /which “genesis”/i })).toHaveCount(0);
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

  await page.getByRole("button", { name: /^open evidence for/i }).first().click();
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
  await expect(page.getByRole("heading", { name: "Chelsea FC vs Arsenal FC" })).toBeVisible();
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
