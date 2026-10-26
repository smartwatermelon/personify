import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// This test exercises the real SDK: a real Server, a real Client, and a real
// in-process transport carrying real JSON-RPC messages between them. Only
// the CLI subprocess layer is mocked (the same boundary index.test.ts mocks),
// so an SDK API change (import paths, schema shapes, handler registration)
// would fail here even though it's invisible to index.test.ts's direct
// handlePersonifyCall() calls, which never touch the SDK's Server/transport
// wiring at all.
const runPersonifyMock = vi.fn();
const checkPersonifyVersionMock = vi.fn();

vi.mock("../src/cli-runner.js", () => ({
  runPersonify: (...args: unknown[]) => runPersonifyMock(...args),
}));
vi.mock("../src/version-check.js", () => ({
  checkPersonifyVersion: (...args: unknown[]) =>
    checkPersonifyVersionMock(...args),
  formatStalenessNote: (result: { stale: boolean }) =>
    result.stale ? "[stale note]" : null,
}));

const { createServer } = await import("../src/index.js");

describe("MCP SDK smoke test (real Server + real Client, in-process transport)", () => {
  // Server+Client pairs created via connectedClient() are tracked here and
  // torn down in afterEach. Client.close() cascades to the linked server
  // transport's close() (see InMemoryTransport#close), which in turn closes
  // the Server, so closing just the client would suffice — but both are
  // closed explicitly for clarity and to guard against that cascade
  // behavior changing upstream.
  let activePairs: Array<{ client: Client; server: Server }> = [];

  beforeEach(() => {
    runPersonifyMock.mockReset();
    checkPersonifyVersionMock.mockReset();
    activePairs = [];
  });

  afterEach(async () => {
    await Promise.all(
      activePairs.map(({ client, server }) =>
        Promise.all([client.close(), server.close()]),
      ),
    );
    activePairs = [];
  });

  async function connectedClient() {
    const server = createServer();
    const client = new Client({ name: "smoke-test-client", version: "0.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    activePairs.push({ client, server });
    return client;
  }

  it("lists the personify tool over a real handshake", async () => {
    const client = await connectedClient();

    const result = await client.listTools();

    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].name).toBe("personify");
    expect(result.tools[0].inputSchema.required).toEqual(["text"]);
  });

  it("advertises text plus an optional kind, and an output schema", async () => {
    const client = await connectedClient();
    const result = await client.listTools();
    const tool = result.tools[0];
    expect(Object.keys(tool.inputSchema.properties ?? {})).toEqual([
      "text",
      "kind",
    ]);
    expect(tool.inputSchema.required).toEqual(["text"]);
    expect(tool.outputSchema?.required).toEqual(["outcome"]);
  });

  it("passes kind through to the runner and ignores the old repo and dir", async () => {
    runPersonifyMock.mockResolvedValue({
      kind: "rewritten",
      text: "t",
    });
    checkPersonifyVersionMock.mockResolvedValue({ stale: false });
    const client = await connectedClient();
    await client.callTool({
      name: "personify",
      arguments: {
        text: "raw text",
        repo: "beacon-biosignals/x",
        dir: "/src/x",
        kind: "pr",
      },
    });
    expect(runPersonifyMock).toHaveBeenCalledWith("raw text", { kind: "pr" });
  });

  it("calls the runner with the text alone when no kind is given", async () => {
    runPersonifyMock.mockResolvedValue({
      kind: "rewritten",
      text: "t",
    });
    checkPersonifyVersionMock.mockResolvedValue({ stale: false });
    const client = await connectedClient();
    await client.callTool({ name: "personify", arguments: { text: "raw" } });
    expect(runPersonifyMock).toHaveBeenCalledWith("raw");
  });

  it("rejects a kind that is not a string", async () => {
    const client = await connectedClient();
    const result = await client.callTool({
      name: "personify",
      arguments: { text: "raw", kind: 7 },
    });
    expect(result.isError).toBe(true);
    expect(runPersonifyMock).not.toHaveBeenCalled();
  });

  it("calls the personify tool over a real handshake and gets a real result", async () => {
    runPersonifyMock.mockResolvedValue({
      kind: "rewritten",
      text: "clean text",
    });
    checkPersonifyVersionMock.mockResolvedValue({ stale: false });
    const client = await connectedClient();
    await client.listTools();

    const result = await client.callTool({
      name: "personify",
      arguments: { text: "raw text" },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("clean text");
    expect(result.structuredContent).toMatchObject({
      outcome: "rewritten",
      text: "clean text",
    });
  });

  it("surfaces a tool error over a real handshake, not a protocol-level failure", async () => {
    runPersonifyMock.mockResolvedValue({
      kind: "failed",
      error: "personify CLI exited with exit code 1: skill not found",
    });
    checkPersonifyVersionMock.mockResolvedValue({ stale: false });
    const client = await connectedClient();
    await client.listTools();

    const result = await client.callTool({
      name: "personify",
      arguments: { text: "raw text" },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("skill not found");
  });
});
