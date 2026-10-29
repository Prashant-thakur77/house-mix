import { expect, test } from "@playwright/test";

test("mobile console uses tabs and has no horizontal scroll", async ({ page }) => {
  await page.goto("/shows/seed-comedy");
  await expect(page.getByRole("tab", { name: /plan/i })).toBeVisible();
  await page.getByRole("tab", { name: /trace/i }).click();
  await expect(page.getByRole("log", { name: /qloo tool calls/i })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
