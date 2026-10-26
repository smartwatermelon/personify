import { describe, it, expect } from "vitest";
import { formatResult } from "../src/result-format.js";

describe("formatResult", () => {
  it("returns only the rewritten bytes in the first block", () => {
    const r = formatResult({ kind: "rewritten", text: "Final.\n" }, null);
    expect(r.isError).toBe(false);
    expect(r.content).toEqual([{ type: "text", text: "Final.\n" }]);
    expect(r.structuredContent).toEqual({
      outcome: "rewritten",
      text: "Final.\n",
    });
  });

  // Desktop's model can receive only the structured copy, so it must carry
  // the text itself, byte for byte, not just the outcome.
  it("carries the same bytes in structuredContent as in content", () => {
    const text = "Line one.\n\nLine two, kept.\n";
    const r = formatResult({ kind: "rewritten", text }, "[update available]");
    expect(r.structuredContent?.text).toBe(r.content[0].text);
    expect(r.structuredContent?.text).toBe(text);
  });

  it("puts the staleness note in its own block, never in the text", () => {
    const r = formatResult(
      { kind: "rewritten", text: "Final." },
      "[update available]",
    );
    expect(r.content[0]).toEqual({ type: "text", text: "Final." });
    expect(r.content[1]).toEqual({ type: "text", text: "[update available]" });
    expect(r.structuredContent).toMatchObject({
      staleness: "[update available]",
    });
  });

  it("reports a failure as a tool error with the model's output fenced", () => {
    const r = formatResult(
      { kind: "failed", error: "timed out", report: "partial" },
      null,
    );
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toBe(
      "personify failed: timed out\n\n```\npartial\n```",
    );
    expect(r.structuredContent).toEqual({
      outcome: "failed",
      error: "timed out",
      report: "partial",
    });
  });

  it("fences a report that contains its own code fence with a longer fence", () => {
    const report = "Body.\n\n```sh\nnpm test\n```\n";
    const r = formatResult({ kind: "failed", error: "x", report }, null);
    const text = r.content[0].text as string;
    expect(text).toContain("````\n" + report + "````");
  });

  it("reports a failure without a report", () => {
    const r = formatResult({ kind: "failed", error: "no text provided" }, null);
    expect(r.content[0].text).toBe("personify failed: no text provided");
    expect(r.structuredContent).toEqual({
      outcome: "failed",
      error: "no text provided",
    });
  });
});
