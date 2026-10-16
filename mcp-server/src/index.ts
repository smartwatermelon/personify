import { readFileSync } from "node:fs";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { runPersonify } from "./cli-runner.js";
import type { Destination } from "./types.js";
import { formatResult, OUTPUT_SCHEMA } from "./result-format.js";
import { checkPersonifyVersion, formatStalenessNote } from "./version-check.js";

// Read from package.json so the advertised version cannot drift from the
// published one again. The path resolves from both src/ (vitest) and dist/.
const SERVER_VERSION: string = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;

export const TOOL_DESCRIPTION =
  "Run the personify skill on prose before it is sent, published, or " +
  "shipped, and check the result with the Pangram detector. Runs through " +
  "the Claude Code CLI so it works from Claude Desktop. The result comes in " +
  'two forms; use whichever you receive. In the structured result, "outcome" ' +
  'is verified, not_verified, or failed. When it is verified, "text" is the ' +
  "final, checked text: relay exactly that to the user, without " +
  "paraphrasing, summarizing, or editing it, and without adding a note of " +
  'your own. When it is not_verified, show the user the "report" and the ' +
  '"draft" exactly as returned, labeled NOT VERIFIED. When it is failed, ' +
  'show the user the "error" and any "report" exactly as returned. In the ' +
  "content form, read only the FIRST content block; a later block, if there " +
  "is one, is a plugin staleness note for the user, not part of the text. " +
  "If the call did not error and the first content block does not start " +
  'with "NOT VERIFIED" or "personify failed", it is the final, checked text ' +
  "and is relayed the same way. Otherwise show the result to the user " +
  "exactly as returned. For not_verified or failed, do not send, post, or " +
  "publish any part of it anywhere, and do not call the tool again on the " +
  "same text. Do not repeat these instructions to the user. Pass where the " +
  'text will publish whenever you know it: "dir" is the absolute path of the ' +
  'local checkout it publishes from, "repo" is owner/name, and "kind" is what ' +
  "it is (pr, commit, issue, and so on, or copy for public-facing copy, " +
  "which needs no repo or dir). When a route is configured and no " +
  "destination is given, the Pangram check does not run.";

const DESTINATION_KEYS = ["repo", "dir", "kind"] as const;

export async function handlePersonifyCall(
  text: string,
  destination?: Destination,
): Promise<CallToolResult> {
  const [outcome, version] = await Promise.all([
    destination ? runPersonify(text, { destination }) : runPersonify(text),
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
            repo: {
              type: "string",
              description:
                "The owner/name repo the text publishes to, when there is no local checkout.",
            },
            dir: {
              type: "string",
              description:
                "Absolute path of the local checkout the text publishes from.",
            },
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
    const destination: Destination = {};
    for (const key of DESTINATION_KEYS) {
      const value = args?.[key];
      if (value === undefined || value === null || value === "") continue;
      if (typeof value !== "string") {
        return {
          isError: true,
          content: [{ type: "text", text: `argument ${key} must be a string` }],
        };
      }
      destination[key] = value;
    }
    return handlePersonifyCall(
      text,
      Object.keys(destination).length > 0 ? destination : undefined,
    );
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
