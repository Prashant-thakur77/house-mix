/**
 * Mock `qloo mcp`: a local stdio MCP server with the same 10 tools, input schemas,
 * output schema and result envelope as @qloo/qloo-harness 0.1.26, over fictional fixtures.
 * Started by QlooClient when QLOO_MODE=mock. Run directly: `tsx src/qloo/mock-server.ts`.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from "@modelcontextprotocol/sdk/types.js";
import { capabilities, execute, MOCK_TOOLS } from "./mock-engine.ts";

const server = new Server({ name: "qloo-harness", version: "0.1.26-house-mix-mock" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: MOCK_TOOLS as never }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  if (name === "qloo_capabilities") {
    const cap = capabilities();
    return { content: [{ type: "text", text: JSON.stringify(cap) }], structuredContent: cap };
  }
  if (!MOCK_TOOLS.some((t) => t.name === name)) throw new McpError(ErrorCode.InvalidParams, `Unknown Qloo MCP tool: ${name}`);
  // Simulated network latency keeps the live trace realistic.
  await new Promise((r) => setTimeout(r, Number(process.env.MOCK_LATENCY_MS ?? 120)));
  const env = execute(name, (args ?? {}) as Record<string, unknown>);
  return {
    content: [{ type: "text", text: JSON.stringify(env, null, 2) }],
    structuredContent: env,
    ...(env.status === "error" ? { isError: true } : {}),
  };
});

await server.connect(new StdioServerTransport());
