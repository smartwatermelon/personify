// The CLI-side model sometimes narrates its own editing plan before emitting
// the personified text, despite PERSONIFY_INSTRUCTION saying "no commentary,
// no preamble" (smartwatermelon/personify#50). Prompt wording alone did not
// hold, so the leak is also removed here.
//
// The stripping is deliberately conservative. A false negative leaves a stray
// sentence the user can see and ignore; a false positive silently eats the
// first paragraph of their document. Every rule below therefore requires the
// candidate to look like commentary *about* the editing task, and none of
// them will remove the only paragraph present.
//
// Why strip rather than detect-and-retry, which would have no false-positive
// mode at all: a retry costs a second cold CLI start plus a second model call,
// and DEFAULT_TIMEOUT_MS is 30s for the first one. There is no headroom for a
// second inside a Desktop tool call. If that budget ever grows, retry is the
// better design and this file should shrink to a detector.

// Meta-commentary announcing what the model is about to do.
//
// Two failed approaches are worth recording, because the fix sits between
// them. Enumerating announcing verbs (apply|use|run|rewrite|edit) missed a
// live leak built on "classify," and 17 of 23 plausible verbs slipped through:
// the model picks its verb from the whole language, so verb lists never close.
// Widening to this skill's general vocabulary (long-form, compression, "step
// 3", first person) plus any first-person phrase went far too far the other
// way, eating 9 of 10 realistic paragraphs about writing, since people who use
// this tool write about writing constantly.
//
// What actually separates the two is narrower than either: a named rule
// artifact AND a first-person authoring clause, in the same sentence. Both
// halves are required. A person writing about writing says "per the voice
// guide, we cut hedges" or "I keep using the voice guide when I draft"; they
// mention the artifact without announcing that they are editing this text by
// it. A preamble says "so I'll apply the voice guide's rules." An earlier
// draft matched a preposition plus the bare noun, with no authoring clause,
// and ate the first paragraph of all seven of those realistic sentences.
//
// Gap quantifiers are bounded rather than open. Sentence-scoped [^.]* was
// clean O(n^2) on a long unpunctuated paragraph (367ms at 104KB); the bound
// makes that 0ms and costs nothing, since a real preamble clause is short.
const RULE_ARTIFACT = String.raw`(?:voice guide's|voice guide|work[- ]register|classification step|pattern group|group [A-Z]\b(?=[^.]{0,200}\b(?:rule|pattern|tell|apply|applies)))`;

const COMMENTARY_PATTERNS: RegExp[] = [
  // The rule artifact plus its rules/notes/fingerprint, the shape both #50
  // fixtures use: "I'll apply the voice guide's fingerprint and work-register
  // rules". The first-person authoring clause is required: without it this
  // fires on someone merely discussing the rules ("our voice guide's rules are
  // mostly fine"), which is content, not commentary.
  new RegExp(
    String.raw`\b(?:I(?:'ll| will| am|'m)|let me|applying|apply|using)\b[^.]{0,200}${RULE_ARTIFACT}[^.]{0,200}\b(?:rules|notes|fingerprint|override|calibration)\b`,
    "i",
  ),
  // A first-person announcement that classifies the text into this skill's own
  // register scheme: "so I'll classify it under step 3 (long-form work
  // register)", "I'm treating this as long-form work register".
  new RegExp(
    String.raw`\b(?:I(?:'ll| will| am|'m)|let me)\b[^.]{0,200}\b(?:classify|classifying|treat|treating|register)\b[^.]{0,200}\b(?:work register|work-register|long-form work|step \d)\b`,
    "i",
  ),
];

// Handoff lines the model emits between its commentary and the real output.
//
// Deliberately narrow. A bare "Final:" or "Revised:" is document structure (a
// changelog entry, a before/after comparison), not a handoff, so the label
// alone is not enough: the line must name the act of rewriting. "Here's the
// final tally from the retro" is likewise real content, which is why the
// pattern anchors on the whole line and allows no trailing sentence.
const HANDOFF_PATTERN =
  /^here(?:'s| is) (?:the|my) (?:rewrite|edit|revised|personified|personified text|final version|edited text)\s*:?\s*$/i;

function looksLikeCommentary(paragraph: string): boolean {
  return COMMENTARY_PATTERNS.some((pattern) => pattern.test(paragraph));
}

// Normalize CRLF up front so paragraph splitting and the returned text never
// carry stray carriage returns into output that is otherwise LF-only.
function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

// Only unwrap a fence when the fenced body itself leads with commentary. A
// fence is often the content: someone personifying prose around a shell
// snippet would otherwise get the snippet silently unwrapped.
function stripWrappingFence(text: string): string {
  const match = /^(`{3,})[^\n]*\n([\s\S]*?)\n?\1`*$/.exec(text.trim());
  if (match === null) return text;
  const fence = match[1];
  const body = match[2].trim();
  // The body must contain no fence marker of its own. Without this, the lazy
  // match spans intervening fences, so a document that merely opens and closes
  // with a code block gets its outermost pair deleted and the rest left
  // unbalanced, which is a corrupt document (smartwatermelon/personify#51).
  // Compared against the opener's own length: inside a four-backtick fence, a
  // run of three backticks is legal content, not a nested fence.
  if (body.includes(fence)) return text;
  const leadParagraph = body.split(/\n\s*\n/)[0]?.trim() ?? "";
  const leadsWithCommentary =
    looksLikeCommentary(leadParagraph) || HANDOFF_PATTERN.test(leadParagraph);
  return leadsWithCommentary ? body : text;
}

/**
 * Remove the CLI model's meta-commentary preamble from personified output.
 *
 * Returns the original text unchanged when nothing looks like a preamble, and
 * never returns an empty result for non-empty input: if every paragraph is
 * preamble-shaped, the input is passed through so a caller sees something
 * rather than silence.
 */
export function stripCliPreamble(text: string): string {
  if (text.trim().length === 0) return "";

  const unfenced = stripWrappingFence(normalizeNewlines(text));
  const paragraphs = unfenced.split(/\n\s*\n/);

  // A single paragraph is the whole output. Removing it would leave nothing,
  // and a one-paragraph result is far more likely to be the user's text than
  // an orphaned preamble.
  if (paragraphs.length < 2) return unfenced.trim();

  // The observed leak is at most two paragraphs: one commentary, one handoff
  // (smartwatermelon/personify#50). Bounding the loop keeps a false positive
  // from cascading through a document: without it, "at least one paragraph
  // survives" is the only guarantee, which is nearly worthless on a long text.
  const MAX_STRIPPED_PARAGRAPHS = 2;

  let start = 0;
  // Only leading paragraphs are candidates, and only while paragraphs remain
  // after them. Commentary never appears mid-document.
  while (start < paragraphs.length - 1 && start < MAX_STRIPPED_PARAGRAPHS) {
    const candidate = paragraphs[start].trim();
    // Text inside a code fence is code, whatever it says. A fenced block whose
    // contents happen to read like commentary is still the user's content
    // (smartwatermelon/personify#51).
    if (/^`{3,}/.test(candidate)) break;
    if (looksLikeCommentary(candidate) || HANDOFF_PATTERN.test(candidate)) {
      start += 1;
      continue;
    }
    break;
  }

  if (start === 0) return unfenced.trim();

  const stripped = paragraphs.slice(start).join("\n\n").trim();
  if (stripped.length === 0) return unfenced.trim();

  // Leave a trace on stderr. This deletes text the user wrote or expected, and
  // without a record a false positive reaches them as a document mysteriously
  // missing its opening paragraph, with nothing to reproduce from.
  console.error(
    `[personify] stripped ${start} leading paragraph(s) as CLI preamble: ` +
      JSON.stringify(paragraphs.slice(0, start).join("\n\n").slice(0, 200)),
  );
  return stripped;
}
