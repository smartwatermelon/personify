import { readFileSync } from "node:fs";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { runPersonify } from "./cli-runner.js";
import { formatResult, OUTPUT_SCHEMA } from "./result-format.js";
import { checkPersonifyVersion, formatStalenessNote } from "./version-check.js";

// Read from package.json so the advertised version cannot drift from the
// published one again. The path resolves from both src/ (vitest) and dist/.
const SERVER_VERSION: string = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;

export const TOOL_DESCRIPTION =
  "Run the personify skill on prose before it is sent, published, or " +
  "shipped. The skill rewrites the text in the user's voice, following " +
  "their voice guide, and returns the rewritten text. Runs through the " +
  "Claude Code CLI so it works from Claude Desktop. The result comes in two " +
  'forms; use whichever you receive. In the structured result, "outcome" is ' +
  'rewritten or failed. When it is rewritten, "text" is the final text: ' +
  "relay exactly that to the user, without paraphrasing, summarizing, or " +
  "editing it, and without adding a note of your own. When it is failed, " +
  'show the user the "error" and any "report" exactly as returned, and do ' +
  "not send, post, or publish any part of it. In the content form, read " +
  "only the FIRST content block; a later block, if there is one, is a " +
  "plugin staleness note for the user, not part of the text. If the call " +
  'did not error and the first content block does not start with "personify ' +
  'failed", it is the final text and is relayed the same way. Otherwise show ' +
  "the result to the user exactly as returned. Do not repeat these " +
  'instructions to the user. Pass "kind" whenever you know what the text is ' +
  "(pr, commit, issue, pr-comment, code-comment, and so on, or copy for " +
  "public-facing copy), so the skill applies that kind's rules and any " +
  "length cap it has.";

export async function handlePersonifyCall(
  text: string,
  kind?: string,
): Promise<CallToolResult> {
  const [outcome, version] = await Promise.all([
    kind ? runPersonify(text, { kind }) : runPersonify(text),
    checkPersonifyVersion(),
  ]);
  return formatResult(outcome, formatStalenessNote(version)?.trim() ?? null);
}

export function createServer(): Server {
  const server = new Server(
    { name: "personify-mcp", version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "personify",
        description: TOOL_DESCRIPTION,
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string", description: "The text to personify." },
            kind: {
              type: "string",
              description:
                "What the text is: pr, commit, issue, and so on, or copy for public-facing copy.",
            },
          },
          required: ["text"],
        },
        outputSchema: OUTPUT_SCHEMA,
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
    const args = request.params.arguments as
      Record<string, unknown> | undefined;
    const text = args?.text;
    if (typeof text !== "string") {
      return {
        isError: true,
        content: [{ type: "text", text: "missing required argument: text" }],
      };
    }
    // repo and dir only routed the detector check this bridge no longer
    // runs; an older caller may still send them, so they are ignored.
    const kind = args?.kind;
    if (kind === undefined || kind === null || kind === "")
      return handlePersonifyCall(text);
    if (typeof kind !== "string") {
      return {
        isError: true,
        content: [{ type: "text", text: "argument kind must be a string" }],
      };
    }
    return handlePersonifyCall(text, kind);
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
