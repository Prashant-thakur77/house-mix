import { defineConfig, devices } from "@playwright/test";
import os from "node:os";
import path from "node:path";

/** E2E runs its own API (mock Qloo by default, temp data dir) and web dev server, so it never touches demo data. */
const dataDir = process.env.E2E_DATA_DIR ?? path.join(os.tmpdir(), `housemix-e2e-${process.pid}`);
const mode = process.env.QLOO_MODE ?? "mock";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile|a11y/ },
  ],
  webServer: [
    {
      command: "npx tsx --env-file-if-exists=../../.env.local src/server.ts",
      cwd: "apps/api",
      url: "http://localhost:8788/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { PORT: "8788", HM_DATA_DIR: dataDir, QLOO_MODE: mode, HM_TTS: "off", MOCK_LATENCY_MS: "0", HM_CORS_ORIGINS: "http://localhost:3100", NODE_ENV: "test" },
    },
    {
      command: "npx next dev -p 3100",
      cwd: "apps/web",
      url: "http://localhost:3100",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { NEXT_PUBLIC_API_URL: "http://localhost:8788", NEXT_TELEMETRY_DISABLED: "1", NEXT_DIST_DIR: ".next-e2e" },
    },
  ],
});
