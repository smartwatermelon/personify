import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Outcome } from "./types.js";

// In a live Desktop call, a structured result holding only the outcome reached
// the model with no content text at all. So the structured copy carries the
// text itself, unfenced, and not only the outcome.
export const OUTPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    outcome: { type: "string", enum: ["rewritten", "failed"] },
    text: { type: "string" },
    report: { type: "string" },
    error: { type: "string" },
    staleness: { type: "string" },
  },
  required: ["outcome"],
};

// A fence one backtick longer than the longest run in the text, so a report
// with its own code block cannot close the fence early.
function fence(text: string): string {
  const runs = [...text.matchAll(/`+/g)].map((m) => m[0].length);
  const marker = "`".repeat(Math.max(2, ...runs) + 1);
  const body = text.endsWith("\n") ? text : `${text}\n`;
  return `${marker}\n${body}${marker}`;
}

export function formatResult(
  outcome: Outcome,
  stalenessNote: string | null,
): CallToolResult {
  const staleness = stalenessNote ? { staleness: stalenessNote } : {};
  const noteBlock = stalenessNote
    ? [{ type: "text" as const, text: stalenessNote }]
    : [];

  if (outcome.kind === "rewritten") {
    // The first block is exactly the bytes the skill wrote. Nothing is
    // appended, so what the caller relays is what the skill produced.
    return {
      isError: false,
      content: [{ type: "text", text: outcome.text }, ...noteBlock],
      structuredContent: {
        outcome: "rewritten",
        text: outcome.text,
        ...staleness,
      },
    };
  }

  // A failed report can hold the model's whole draft, so it is fenced:
  // without a fence it could read as final text.
  const report = outcome.report ? `\n\n${fence(outcome.report)}` : "";
  return {
    isError: true,
    content: [
      { type: "text", text: `personify failed: ${outcome.error}${report}` },
      ...noteBlock,
    ],
    structuredContent: {
      outcome: "failed",
      error: outcome.error,
      ...(outcome.report ? { report: outcome.report } : {}),
      ...staleness,
    },
  };
}
