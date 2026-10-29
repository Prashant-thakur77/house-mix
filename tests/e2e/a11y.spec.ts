import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PAGES = ["/", "/new", "/shows/seed-concert", "/shows/seed-sports", "/compare?a=seed-concert&b=seed-comedy", "/rate"];

for (const scheme of ["light", "dark"] as const) {
  for (const path of PAGES) {
    test(`axe: ${path} (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude("nextjs-portal").analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    });
  }
}
