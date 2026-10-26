import { describe, it, expect, vi, beforeEach } from "vitest";

const runPersonifyMock = vi.fn();
const checkPersonifyVersionMock = vi.fn();
vi.mock("../src/cli-runner.js", () => ({
  runPersonify: (...args: unknown[]) => runPersonifyMock(...args),
}));
vi.mock("../src/version-check.js", () => ({
  checkPersonifyVersion: (...args: unknown[]) =>
    checkPersonifyVersionMock(...args),
  formatStalenessNote: (r: { stale: boolean }) =>
    r.stale ? "\n\n[stale note]" : null,
}));

const { handlePersonifyCall, TOOL_DESCRIPTION } =
  await import("../src/index.js");

describe("handlePersonifyCall", () => {
  beforeEach(() => {
    runPersonifyMock.mockReset();
    checkPersonifyVersionMock.mockReset();
    checkPersonifyVersionMock.mockResolvedValue({ stale: false });
  });

  it("calls the runner with the text only", async () => {
    runPersonifyMock.mockResolvedValue({
      kind: "rewritten",
      text: "t",
    });
    await handlePersonifyCall("raw");
    expect(runPersonifyMock).toHaveBeenCalledWith("raw");
  });

  it("passes the kind through to the runner", async () => {
    runPersonifyMock.mockResolvedValue({
      kind: "rewritten",
      text: "t",
    });
    await handlePersonifyCall("raw", "copy");
    expect(runPersonifyMock).toHaveBeenCalledWith("raw", { kind: "copy" });
  });

  it("returns the rewritten text alone in the first block", async () => {
    runPersonifyMock.mockResolvedValue({
      kind: "rewritten",
      text: "Final.\n",
    });
    const r = await handlePersonifyCall("raw");
    expect(r.isError).toBe(false);
    expect(r.content[0]).toEqual({ type: "text", text: "Final.\n" });
  });

  it("puts a trimmed staleness note in a second block", async () => {
    runPersonifyMock.mockResolvedValue({
      kind: "rewritten",
      text: "Final.",
    });
    checkPersonifyVersionMock.mockResolvedValue({
      stale: true,
      installed: "2.0.0",
      latest: "2.1.0",
    });
    const r = await handlePersonifyCall("raw");
    expect(r.content[0].text).toBe("Final.");
    expect(r.content[1].text).toBe("[stale note]");
  });

  it("surfaces a failure as a tool error", async () => {
    runPersonifyMock.mockResolvedValue({
      kind: "failed",
      error: "skill not found",
    });
    const r = await handlePersonifyCall("raw");
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain("skill not found");
  });

  it("fences a failure report so it cannot read as final text", async () => {
    runPersonifyMock.mockResolvedValue({
      kind: "failed",
      error: "x",
      report: "draft text",
    });
    const r = await handlePersonifyCall("raw");
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toBe(
      "personify failed: x\n\n```\ndraft text\n```",
    );
  });

  it("carries no _meta relay key", async () => {
    runPersonifyMock.mockResolvedValue({
      kind: "rewritten",
      text: "t",
    });
    const r = await handlePersonifyCall("raw");
    expect(r._meta).toBeUndefined();
  });
});

describe("TOOL_DESCRIPTION", () => {
  it("tells the model to pass the kind", () => {
    for (const field of ['"kind"', "copy"]) {
      expect(TOOL_DESCRIPTION).toContain(field);
    }
  });

  it("tells the model to relay the text exactly", () => {
    expect(TOOL_DESCRIPTION).toContain("relay exactly that");
    expect(TOOL_DESCRIPTION).toContain("exactly as returned");
    expect(TOOL_DESCRIPTION).toMatch(/do not send/i);
  });

  it("names the failed branch and the first-content-block rule", () => {
    expect(TOOL_DESCRIPTION).toContain("personify failed");
    expect(TOOL_DESCRIPTION).toContain("first content block");
  });

  // A client that shows the model only structuredContent must still be told
  // which field holds the text for each outcome.
  it("names the structured fields for every outcome", () => {
    for (const field of ["outcome", "rewritten", "failed"]) {
      expect(TOOL_DESCRIPTION).toContain(field);
    }
    for (const field of ["text", "report", "error"]) {
      expect(TOOL_DESCRIPTION).toContain(`"${field}"`);
    }
  });

  it("no longer mentions a detector verdict", () => {
    expect(TOOL_DESCRIPTION).not.toMatch(/verified|detector|stamp/i);
  });
});
