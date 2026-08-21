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
// Every pattern requires two things in the same sentence: a verb announcing
// the editing work, and a reference to the machinery doing it (the skill, the
// voice guide, a register, "the text"). Requiring only the verb is what made
// earlier drafts eat real writing, since "so I'll edit the contract tonight"
// and "so I'll use the new runbook" are ordinary sentences about ordinary
// work. Requiring only the machinery is just as wrong: this skill's own users
// write *about* the skill, so "our voice guide's rules are mostly fine" is
// content, not commentary.
const MACHINERY = String.raw`(?:voice guide|personify|the skill|work-register|register|the text|rewrite)`;

const COMMENTARY_PATTERNS: RegExp[] = [
  // "...so I'll apply the voice guide's satire notes and personify the text"
  new RegExp(
    String.raw`\bso I(?:'ll| will)\s+(?:apply|use|run|personify|rewrite|edit)\b[^.]*\b${MACHINERY}\b`,
    "i",
  ),
  // "I'll apply the voice guide's fingerprint and work-register rules"
  new RegExp(
    String.raw`\bI(?:'ll| will)\s+(?:apply|personify|rewrite|edit)\s+(?:the|this|it)\b[^.]*\b${MACHINERY}\b`,
    "i",
  ),
  // "applying the voice guide's rules now" / "running the personify skill on this"
  new RegExp(
    String.raw`\b(?:applying|running)\s+the\s+${MACHINERY}\b[^.]*\b(?:now|on (?:this|the) (?:text|draft)|rules)\b`,
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
