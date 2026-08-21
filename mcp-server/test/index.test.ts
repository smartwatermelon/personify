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

const { handlePersonifyCall, VERBATIM_INSTRUCTION, INSTRUCTION_META_KEY } =
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
    expect(result.content[0].text).toBe("clean text");
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
    expect(result.content[0].text).toBe("clean text[stale note]");
  });

  // smartwatermelon/personify#50: the verbatim-relay instruction is addressed
  // to the calling model, not to the reader. Putting it in the text content
  // meant Desktop rendered it above every result.
  it("keeps the verbatim-relay instruction out of the user-visible text", async () => {
    runPersonifyMock.mockResolvedValue({ ok: true, text: "clean text" });
    checkPersonifyVersionMock.mockResolvedValue({ stale: false });

    const result = await handlePersonifyCall("raw text");

    expect(result.content[0].text).not.toContain(VERBATIM_INSTRUCTION);
    expect(result.content[0].text).not.toContain("exactly as written");
  });

  // Named for what it proves. The SDK does not forward a result's _meta into
  // model context, so this asserts the field is set, not that anything reads it.
  it("sets the namespaced instruction key on the result _meta", async () => {
    runPersonifyMock.mockResolvedValue({ ok: true, text: "clean text" });
    checkPersonifyVersionMock.mockResolvedValue({ stale: false });

    const result = await handlePersonifyCall("raw text");

    expect(result._meta?.[INSTRUCTION_META_KEY]).toBe(
      VERBATIM_INSTRUCTION.trim(),
    );
  });

  // End-to-end guard for smartwatermelon/personify#50. The reported output was
  // two separate leaks concatenated: the relay instruction prepended here, and
  // the CLI model's own meta-commentary coming up through runPersonify. Neither
  // may reach content[0].text.
  it("returns only the personified text when the CLI leaks a commentary preamble", async () => {
    runPersonifyMock.mockResolvedValue({
      ok: true,
      // What runPersonify returns after its own stripping pass.
      text: "# RFC: Personal Token Rollover\n\nEvery month my unused tokens evaporate.",
    });
    checkPersonifyVersionMock.mockResolvedValue({ stale: false });

    const result = await handlePersonifyCall("raw text");

    const text = result.content[0].text as string;
    expect(text.startsWith("# RFC: Personal Token Rollover")).toBe(true);
    expect(text).not.toContain("exactly as written");
    expect(text).not.toContain("so I'll apply");
    expect(text).not.toContain("Here's the rewrite:");
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
