import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { stripCliPreamble } from "../src/strip-preamble.js";

// Both fixtures below are verbatim from smartwatermelon/personify#50: two
// separate calls in one session that leaked the CLI model's own meta-reasoning
// ahead of the personified text.
const ISSUE_50_SAMPLE_A = `This is long-form personal essay/blog writing (satire register, given "a modest proposal" framing and the corporate-cruelty subject matter), so I'll apply the voice guide's satire notes and personify the text now.

# RFC: Personal Token Rollover for the Enterprise Plan (a modest proposal)

Every month my unused tokens evaporate.`;

const ISSUE_50_SAMPLE_B = `This is an RFC/proposal document, long-form work writing, so I'll apply the voice guide's fingerprint and work-register rules (no em dashes, first person where judgment is stated, cut inflation and filler) while keeping complete sentences since it's a substantive written proposal, not a Slack message.

Here's the rewrite:

# RFC: Personal Token Rollover

Every month my unused tokens evaporate.`;

describe("stripCliPreamble", () => {
  // Stripping logs to stderr; silence it so test output stays readable.
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("strips the meta-commentary preamble from issue #50 sample A", () => {
    const out = stripCliPreamble(ISSUE_50_SAMPLE_A);
    expect(out.startsWith("# RFC: Personal Token Rollover")).toBe(true);
    expect(out).not.toContain("so I'll apply");
    expect(out).toContain("Every month my unused tokens evaporate.");
  });

  it("strips both the meta-commentary and the 'Here's the rewrite:' handoff from sample B", () => {
    const out = stripCliPreamble(ISSUE_50_SAMPLE_B);
    expect(out.startsWith("# RFC: Personal Token Rollover")).toBe(true);
    expect(out).not.toContain("so I'll apply");
    expect(out).not.toContain("Here's the rewrite:");
  });

  it("strips a bare handoff line with no preceding commentary", () => {
    const out = stripCliPreamble(
      "Here's the rewrite:\n\nthe cache was stale, cleared it.",
    );
    expect(out).toBe("the cache was stale, cleared it.");
  });

  it("unwraps a code fence only when the fenced body leads with commentary", () => {
    const out = stripCliPreamble(
      "```\nHere's the rewrite:\n\nthe cache was stale, cleared it.\n```",
    );
    expect(out).toBe("the cache was stale, cleared it.");
  });

  it("leaves clean output untouched", () => {
    const clean =
      "I found the stale reads: cache invalidation was the cause, fixed in #412.";
    expect(stripCliPreamble(clean)).toBe(clean);
  });

  // Over-stripping guards. The personified text itself can legitimately open
  // with first person, with the word "this," or with prose that discusses
  // writing — none of that makes it a preamble.
  it("does not strip a first-person opening that is the actual content", () => {
    const text =
      "I'll take the on-call shift Thursday so you can be at the offsite.";
    expect(stripCliPreamble(text)).toBe(text);
  });

  it("does not strip content that happens to discuss the voice guide", () => {
    const text =
      "This is the section of the voice guide I keep re-reading, and I still think it's wrong about hedging.";
    expect(stripCliPreamble(text)).toBe(text);
  });

  it("does not strip a single-paragraph output even if it mentions rewriting", () => {
    const text =
      "I rewrote the onboarding doc. It's shorter and it names an owner for each step.";
    expect(stripCliPreamble(text)).toBe(text);
  });

  // Regression guards found by probing the first draft of the heuristic: a
  // "this is <kind of writing>" sentence is something people actually write.
  // Only the task-announcing clause makes it a preamble.
  it("does not strip a message that describes itself as a message", () => {
    const text =
      "This is a short internal message about our writing guidelines.\n\nI think we should drop the style guide.";
    expect(stripCliPreamble(text)).toBe(text);
  });

  it("does not strip an essay that opens by naming itself an essay", () => {
    const text =
      "This is an essay I have been putting off for months.\n\nIt starts badly and gets worse.";
    expect(stripCliPreamble(text)).toBe(text);
  });

  it("does not strip 'I'll apply' used as real content", () => {
    const text =
      "I'll apply for the staff role next cycle.\n\nLet me know if you think that's a mistake.";
    expect(stripCliPreamble(text)).toBe(text);
  });

  it("handles CRLF line endings", () => {
    const out = stripCliPreamble(
      "This is an RFC document, long-form work writing, so I'll apply the voice guide's rules.\r\n\r\n# Title\r\n\r\nBody text.",
    );
    expect(out.startsWith("# Title")).toBe(true);
    expect(out).not.toContain("so I'll apply");
    expect(out).not.toContain("\r");
  });

  it("does not strip a paragraph that merely discusses work-register rules", () => {
    const text =
      "I think our work-register rules are too strict.\n\nNobody follows them.";
    expect(stripCliPreamble(text)).toBe(text);
  });

  // Unwrapping is only safe when the fence wraps commentary-led output. A
  // fence that IS the content (a shell snippet someone wants personified
  // around) must survive.
  it("does not unwrap a code fence that is the entire content", () => {
    const text = "```\nnpm run build\n```";
    expect(stripCliPreamble(text)).toBe(text);
  });

  // False positives found by adversarial review. Each deleted the first
  // paragraph of ordinary writing. The common cause: matching an editing verb
  // without requiring that it be aimed at the text in hand.
  it.each([
    [
      "so I'll use",
      "The old runbook was wrong, so I'll use the new one from now on.",
    ],
    [
      "so I'll rewrite",
      "The intro buries the point, so I'll rewrite it before Friday.",
    ],
    [
      "so I'll edit",
      "Legal flagged two lines, so I'll edit the contract tonight.",
    ],
    ["voice guide as topic", "Our voice guide's rules are mostly fine."],
    [
      "running the skill as content",
      "I keep running the skill on every draft.",
    ],
    [
      "apply agreed rules",
      "I'll apply the rules we agreed on in the style meeting.",
    ],
    [
      "work-register as topic",
      "The work-register rules in our guide need updating.",
    ],
  ])("does not strip ordinary writing: %s", (_label, first) => {
    const text = `${first}\n\nSecond paragraph survives too.`;
    expect(stripCliPreamble(text)).toBe(text);
  });

  // A bare section label is document structure, not a handoff line.
  it.each([
    ["Final:", "Final:\n\nWe ship Tuesday."],
    ["Revised:", "Revised:\n\nThe new numbers are in."],
    [
      "Here's the final tally",
      "Here's the final tally from the retro.\n\nWe closed 14 of 20.",
    ],
  ])("does not strip the section label %s", (_label, text) => {
    expect(stripCliPreamble(text)).toBe(text);
  });

  // Documents that open and close with a code fence must not have the
  // outermost pair deleted while inner fences survive.
  it("does not unwrap a document containing two separate code fences", () => {
    const text =
      "```js\nconst a = 1;\n```\n\nThen we call it.\n\n```js\nconst b = 2;\n```";
    expect(stripCliPreamble(text)).toBe(text);
  });

  it("does not mangle a four-backtick fence", () => {
    const text = "````\nsome ``` inside\n````";
    expect(stripCliPreamble(text)).toBe(text);
  });

  // Bounded stripping: a false positive must not cascade through a document.
  it("never strips more than the commentary-plus-handoff shape", () => {
    const text = [
      "This is an RFC, long-form work writing, so I'll apply the voice guide's rules.",
      "Here's the rewrite:",
      "I'll apply the rules we agreed on in the style meeting.",
      "Real content.",
    ].join("\n\n");
    const out = stripCliPreamble(text);
    expect(out).toContain("I'll apply the rules we agreed on");
    expect(out).not.toContain("voice guide's rules");
  });

  // smartwatermelon/personify#51. The lazy body match could span intervening
  // fences, so a multi-fence document whose first block was commentary-shaped
  // got its outermost fence pair deleted and the rest left unbalanced.
  it("does not unwrap a multi-fence document whose first block looks like commentary", () => {
    const text = [
      "```",
      "This is an RFC, long-form work writing, so I'll apply the voice guide's rules.",
      "```",
      "",
      "Then we call it.",
      "",
      "```js",
      "const b = 2;",
      "```",
    ].join("\n");
    const out = stripCliPreamble(text);
    // Fence markers must be conserved: unbalanced fences are a corrupt document.
    expect((out.match(/```/g) ?? []).length % 2).toBe(0);
    expect(out).toBe(text);
  });

  it("never returns empty when the input is entirely preamble-shaped", () => {
    const onlyPreamble =
      "This is long-form work writing, so I'll apply the voice guide's rules now.";
    // Nothing survives stripping, so the original is returned rather than "".
    expect(stripCliPreamble(onlyPreamble)).toBe(onlyPreamble);
  });

  it("returns empty string for empty input", () => {
    expect(stripCliPreamble("")).toBe("");
  });
});
