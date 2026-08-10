import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { runPersonify } from "./cli-runner.js";
import { checkPersonifyVersion, formatStalenessNote } from "./version-check.js";

export async function handlePersonifyCall(
  text: string,
): Promise<CallToolResult> {
  const [cliResult, versionResult] = await Promise.all([
    runPersonify(text),
    checkPersonifyVersion(),
  ]);

  if (!cliResult.ok) {
    return {
      isError: true,
      content: [{ type: "text", text: `personify failed: ${cliResult.error}` }],
    };
  }

  const note = formatStalenessNote(versionResult);
  return {
    isError: false,
    content: [{ type: "text", text: cliResult.text + (note ?? "") }],
  };
}

export function createServer(): Server {
  const server = new Server(
    { name: "personify-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "personify",
        description:
          "Strip AI-writing tells from prose before sending, publishing, or " +
          "shipping it. Runs the personify skill via the Claude Code CLI so " +
          "it works reliably from Claude Desktop.",
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string", description: "The text to personify." },
          },
          required: ["text"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== "personify") {
      return {
        isError: true,
        content: [
          { type: "text", text: `unknown tool: ${request.params.name}` },
        ],
      };
    }
    const text = (request.params.arguments as { text?: string } | undefined)
      ?.text;
    if (typeof text !== "string") {
      return {
        isError: true,
        content: [{ type: "text", text: "missing required argument: text" }],
      };
    }
    return handlePersonifyCall(text);
  });

  return server;
}

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const isEntryPoint = process.argv[1]?.endsWith("index.js");
if (isEntryPoint) {
  main().catch((err) => {
    console.error("personify-mcp fatal error:", err);
    process.exit(1);
  });
}
