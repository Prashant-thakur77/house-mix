import { buildApp, recoverStaleRuns } from "./app.ts";
import { config } from "./config.ts";
import { getQloo } from "./qloo/client.ts";
import { importSeeds } from "./store/seed-import.ts";

const app = await buildApp();
await recoverStaleRuns();
const seeded = await importSeeds();
// Start the Qloo MCP child at boot and check readiness with qloo_capabilities.
const ready = await getQloo().ready();
app.log.info({ qlooMode: config.qlooMode, qlooReady: ready.ready, contract: ready.contractVersion, error: ready.error }, "qloo mcp started");
if (seeded) app.log.info({ seeded }, "seed shows imported");
await app.listen({ port: config.port, host: "0.0.0.0" });

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    void app.close().then(() => process.exit(0));
  });
}
