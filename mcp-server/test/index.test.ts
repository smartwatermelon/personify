import { describe, it, expect, vi, beforeEach } from "vitest";

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

const { handlePersonifyCall, VERBATIM_INSTRUCTION } =
  await import("../src/index.js");

describe("handlePersonifyCall", () => {
  beforeEach(() => {
    runPersonifyMock.mockReset();
    checkPersonifyVersionMock.mockReset();
  });

  it("returns personified text with no note when up to date", async () => {
    runPersonifyMock.mockResolvedValue({ ok: true, text: "clean text" });
    checkPersonifyVersionMock.mockResolvedValue({ stale: false });

    const result = await handlePersonifyCall("raw text");

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("clean text");
    expect(result.content[0].text.startsWith(VERBATIM_INSTRUCTION)).toBe(true);
  });

  it("appends the staleness note when the plugin is behind", async () => {
    runPersonifyMock.mockResolvedValue({ ok: true, text: "clean text" });
    checkPersonifyVersionMock.mockResolvedValue({
      stale: true,
      installed: "0.2.1",
      latest: "0.3.0",
    });

    const result = await handlePersonifyCall("raw text");

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("clean text[stale note]");
    expect(result.content[0].text.startsWith(VERBATIM_INSTRUCTION)).toBe(true);
  });

  it("surfaces a CLI failure as an MCP tool error, not silent fallback text", async () => {
    runPersonifyMock.mockResolvedValue({
      ok: false,
      error: "personify CLI exited with exit code 1: skill not found",
    });
    checkPersonifyVersionMock.mockResolvedValue({ stale: false });

    const result = await handlePersonifyCall("raw text");

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("skill not found");
  });
});
