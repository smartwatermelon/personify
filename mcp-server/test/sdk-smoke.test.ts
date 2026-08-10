import { describe, it, expect, vi, beforeEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
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
  beforeEach(() => {
    runPersonifyMock.mockReset();
    checkPersonifyVersionMock.mockReset();
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
    return client;
  }

  it("lists the personify tool over a real handshake", async () => {
    const client = await connectedClient();

    const result = await client.listTools();

    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].name).toBe("personify");
    expect(result.tools[0].inputSchema.required).toEqual(["text"]);
  });

  it("calls the personify tool over a real handshake and gets a real result", async () => {
    runPersonifyMock.mockResolvedValue({ ok: true, text: "clean text" });
    checkPersonifyVersionMock.mockResolvedValue({ stale: false });
    const client = await connectedClient();

    const result = await client.callTool({
      name: "personify",
      arguments: { text: "raw text" },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("clean text");
  });

  it("surfaces a tool error over a real handshake, not a protocol-level failure", async () => {
    runPersonifyMock.mockResolvedValue({
      ok: false,
      error: "personify CLI exited with exit code 1: skill not found",
    });
    checkPersonifyVersionMock.mockResolvedValue({ stale: false });
    const client = await connectedClient();

    const result = await client.callTool({
      name: "personify",
      arguments: { text: "raw text" },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("skill not found");
  });
});
