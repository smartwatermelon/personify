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

  it("treats a four-backtick fenced block as content, not commentary", () => {
    const text = [
      "````",
      "This is an RFC, long-form work writing, so I'll apply the voice guide's rules.",
      "````",
      "",
      "Real content follows.",
    ].join("\n");
    expect(stripCliPreamble(text)).toBe(text);
  });

  // smartwatermelon/personify#52: three backticks are legal content inside a
  // four-backtick fence, so the inner-fence guard compares against the
  // opener's own length rather than a hardcoded marker.
  it("unwraps a four-backtick fence whose body holds a legal triple-backtick run", () => {
    const text = [
      "````",
      "Here's the rewrite:",
      "",
      "```",
      "npm run build",
      "```",
      "````",
    ].join("\n");
    const out = stripCliPreamble(text);
    expect(out).toBe("```\nnpm run build\n```");
  });

  // Captured from a live `claude --print` run against merged main, which the
  // mocked suite could not have caught. The model picked the verb "classify",
  // which no enumerated verb list contained, so the leak went straight through
  // to the user. Enumerating verbs is the wrong shape: the reliable signal is
  // that the paragraph names this skill's own internal machinery.
  it("strips a live-captured preamble that uses an unlisted verb", () => {
    const leaked =
      "This is an RFC document \u2014 long-form, work-adjacent but reads as writing rather than a message, so I'll classify it under step 3 (long-form work register): complete sentences, first person applied throughout since it's full of unattributed judgments, zero em dashes per the voice guide's work override (an RFC is a written record, not the blog), and heavy compression on the V/Z violations throughout.";
    const out = stripCliPreamble(
      `${leaked}\n\n# RFC: Consolidating the Deployment Pipelines\n\nThis is a proposal to merge three pipelines.`,
    );
    expect(out.startsWith("# RFC: Consolidating")).toBe(true);
    expect(out).not.toContain("so I'll classify");
  });

  it.each([
    "classify",
    "treat",
    "handle",
    "approach",
    "keep",
    "compress",
    "scope",
  ])("strips a preamble announcing the work with the verb %s", (verb) => {
    const text = `This is an RFC, long-form work writing, so I'll ${verb} it under the work-register rules.\n\n# Title\n\nBody.`;
    const out = stripCliPreamble(text);
    expect(out.startsWith("# Title")).toBe(true);
  });

  // The machinery signal must stay specific to this skill's vocabulary. These
  // reference writing in general, not the skill's rules, and are real content.
  it.each([
    [
      "general editing plan",
      "The intro buries the point, so I'll rewrite it before Friday.",
    ],
    [
      "general classification",
      "This is a support ticket, so I'll route it to the platform team.",
    ],
    [
      "style opinion",
      "This is a design doc, so I'll keep it formal throughout.",
    ],
  ])("does not strip ordinary planning: %s", (_label, first) => {
    const text = `${first}\n\nSecond paragraph survives.`;
    expect(stripCliPreamble(text)).toBe(text);
  });

  // The negative cases above are short and skill-vocabulary-free, which an
  // earlier over-broad design passed while eating realistic prose. These are
  // multi-sentence paragraphs that DO discuss the skill's own subject matter,
  // which is what this tool's users actually write.
  it.each([
    [
      "preposition + voice guide",
      "Per the voice guide, we cut hedges from every draft.",
    ],
    ["using the voice guide", "I keep using the voice guide when I draft."],
    [
      "apply it to the handbook",
      "We should apply the voice guide to the whole handbook.",
    ],
    ["citing the voice guide", "This example is from the voice guide, page 4."],
    ["following it", "Following the voice guide got us better copy."],
    [
      "work-register conventions",
      "Under work-register conventions we drop articles.",
    ],
    [
      "team applying it",
      "The team is applying the voice guide inconsistently.",
    ],
    [
      "multi-sentence about the rules",
      "Compression is the topic of chapter 9. It covers the work-register rules in detail. Later on, I'll get to the entropy coders.",
    ],
  ])(
    "does not strip prose that discusses the skill's subject: %s",
    (_l, first) => {
      const text = `${first}\n\nThat is now the policy.\n\nAsk me if unclear.`;
      expect(stripCliPreamble(text)).toBe(text);
    },
  );

  it("logs the stripped prefix to stderr so a false positive is diagnosable", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    stripCliPreamble(
      "Here's the rewrite:\n\n# Title\n\nBody text that survives.",
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0][0])).toContain("Here's the rewrite:");
  });

  it("stays fast on a long unpunctuated paragraph", () => {
    const long = `I will ${"a ".repeat(40000)}voice guide rules`;
    const t0 = Date.now();
    stripCliPreamble(`${long}\n\nbody`);
    expect(Date.now() - t0).toBeLessThan(250);
  });

  // smartwatermelon/personify#55. The pattern comment promised a first-person
  // authoring clause, but the bare apply/applying/using anchors did not
  // require a subject, so third-person sentences naming a rule artifact plus a
  // terminal word were eaten. Five of six realistic cases lost paragraph one.
  it.each([
    [
      "we should apply",
      "We should apply the voice guide's fingerprint rules across all drafts.",
    ],
    [
      "the team is applying",
      "The team is applying the voice guide's rules inconsistently.",
    ],
    [
      "marketing keeps using",
      "Marketing keeps using the voice guide's notes as a style bible.",
    ],
    [
      "everyone should apply",
      "Everyone should apply the work-register rules to status updates.",
    ],
    [
      "she's applying",
      "She's applying the voice guide's calibration to the whole handbook.",
    ],
  ])("does not strip third-person discussion of the rules: %s", (_l, first) => {
    const text = `${first}\n\nThat is now the policy.\n\nAsk me if unclear.`;
    expect(stripCliPreamble(text)).toBe(text);
  });

  // smartwatermelon/personify#53. CommonMark lets a closer be longer than its
  // opener, but no tool output produces one, and accepting it widened the
  // unwrap surface for nothing.
  it("does not unwrap a fence whose closer is longer than its opener", () => {
    const text = "```\nHere's the rewrite:\n\nthe cache was stale.\n`````";
    expect(stripCliPreamble(text)).toBe(text);
  });

  // Dropping the bare apply/using anchors for #55 opened a false negative: a
  // model can narrate without an explicit "I". The distinguishing feature is
  // position. A preamble opens the paragraph with the gerund; third-person
  // prose puts a subject in front of it ("the team is applying...").
  it.each([
    "Applying the voice guide's rules now:",
    "Using the work-register rules for this one.",
    "Applying the voice guide's satire notes to the text.",
  ])("strips a subjectless narrating preamble: %s", (first) => {
    const out = stripCliPreamble(`${first}\n\n# Title\n\nBody.`);
    expect(out.startsWith("# Title")).toBe(true);
  });

  // The negative cases for #55 were all third person, so they could not detect
  // that the first-person anchor had the identical defect: it required only
  // co-occurrence of "I'll" and a rule artifact within the same 200 characters,
  // not an editing verb governed by that subject. Eight of nine of these lost
  // paragraph one. This is the tool's core population writing about writing.
  it.each([
    [
      "let me push back",
      "Let me push back on the work-register rules before we adopt them.",
    ],
    [
      "I'll be honest",
      "I'll be honest: the voice guide's rules made my writing worse.",
    ],
    ["I am tired", "I am tired of arguing about the voice guide's rules."],
    [
      "I will never understand",
      "I will never understand why the voice guide's rules ban semicolons.",
    ],
    [
      "teaching the intern",
      "I'm using the voice guide's notes to teach the intern.",
    ],
    [
      "asking legal",
      "I'll ask legal whether the voice guide's rules create any obligation.",
    ],
    [
      "too strict",
      "I think the voice guide's rules are too strict for external email.",
    ],
    [
      "bring it up at standup",
      "I'll bring the work-register rules up at standup tomorrow.",
    ],
    [
      "let me know",
      "Let me know if the voice guide's notes are still accurate.",
    ],
  ])("does not strip first-person prose about the rules: %s", (_l, first) => {
    const text = `${first}\n\nThat is now the policy.\n\nAsk me if unclear.`;
    expect(stripCliPreamble(text)).toBe(text);
  });

  // #53, the other direction: a closer SHORTER than its opener is just as
  // mismatched, and the surplus opener backticks get absorbed by the info
  // string unless the opener run is anchored to its full length.
  it.each([
    ["open 4, close 3", "````\nHere's the rewrite:\n\nconst a = 1;\n```"],
    ["open 5, close 3", "`````\nHere's the rewrite:\n\nconst a = 1;\n```"],
    ["open 5, close 4", "`````\nHere's the rewrite:\n\nconst a = 1;\n````"],
  ])("does not unwrap a fence whose closer is shorter: %s", (_l, text) => {
    expect(stripCliPreamble(text)).toBe(text);
  });

  // Captured live after the #53/#55 fixes: a preamble with no first-person
  // subject at all ("goes through classification step 3", "Apply groups V, W, Z
  // hard"). Syntax-based patterns cannot reach it, but it stacks seven distinct
  // pieces of this skill's jargon in one paragraph, which ordinary prose never
  // does.
  it("strips a jargon-dense preamble that names no actor", () => {
    const leaked =
      "This is a design RFC document \u2014 long-form work writing (>800 words territory in style even if shorter here), goes through classification step 3: work register, first person, but complete sentences retained. Em dashes zero per voice guide overrides. Apply groups V, W, Z hard.";
    const out = stripCliPreamble(
      `${leaked}\n\n# RFC: Consolidating\n\nBody text here.`,
    );
    expect(out.startsWith("# RFC: Consolidating")).toBe(true);
  });

  // The density rule must not fire on prose that mentions one or two terms.
  it.each([
    ["one term", "I'll bring the work-register rules up at standup tomorrow."],
    ["two terms", "The voice guide says first person, which I think is right."],
    [
      "two terms, opinionated",
      "Our long-form docs still use em dashes and nobody minds.",
    ],
  ])("does not strip prose with only incidental jargon: %s", (_l, first) => {
    const text = `${first}\n\nThat is now the policy.\n\nAsk me if unclear.`;
    expect(stripCliPreamble(text)).toBe(text);
  });

  // Bare "register" and "compression" are ordinary English, so counting them as
  // jargon let writing about writing reach the density threshold on its own.
  it.each([
    [
      "linguistics",
      "The register of long-form writing differs from speech. Em dashes and hedging both signal a first person stance.",
    ],
    [
      "music",
      "Her voice register sits low, and the long-form pieces let it breathe. Compression in the mix flattens em dashes of silence.",
    ],
    [
      "retail",
      "I need to register the new POS terminal. The long-form contract mentions compression of the fee schedule and hedging on renewals.",
    ],
  ])(
    "does not strip essays that use the terms in their ordinary senses: %s",
    (_l, first) => {
      const text = `${first}\n\nSecond paragraph.\n\nThird.`;
      expect(stripCliPreamble(text)).toBe(text);
    },
  );

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
