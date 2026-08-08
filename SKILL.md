---
name: personify
version: 0.1.3
description: Strip AI-writing tells from prose before sending, publishing, or shipping it. Use when editing text (emails, docs, comments, PRs, blog drafts, essays) someone else will read. Reads an optional per-user voice guide (voice.md) and treats it as authoritative, so output sounds like a specific person rather than generically clean. Derivative of blader/humanizer (MIT); see license field.
license: MIT (derivative of blader/humanizer; see Provenance)
---

# Personify

Edit text to remove the statistical fingerprints of LLM writing, without flattening it into voiceless "clean" prose. Two failure modes to avoid equally: leaving AI tells in, and over-correcting into generic dryness that has no writer behind it.

## Step 0: Load the voice guide first

Before applying anything below, look for `voice.md` in this skill's directory.

- If `voice.md` exists, read it fully and treat it as authoritative. It describes one specific person's writing. Where it conflicts with any rule in this skill, the voice guide wins. The pattern groups below become a backstop for residue the voice guide doesn't address, not a filter that overrides it.
- If `voice.md` does not exist, read `voice.example.md` for what one looks like and how to build it. Without a voice guide this skill makes text non-robotic but not distinctive: clean, competent, anonymous. Proceed with the general rules and say so, so the user knows a voice guide is what turns "not obviously AI" into "sounds like them."

`voice.md` is personal and git-ignored, like `.env`. The committed `voice.example.md` documents the shape without containing anyone's voice. It must sit in the same directory as `SKILL.md` wherever the skill is installed, not just in the repo.

## Process

1. Scan for the patterns below.
2. Rewrite, don't delete: cover everything the original covers, don't compress it into bullet-point paraphrase.
3. Preserve the specifics: names, numbers, concrete details. Never invent facts, dates, or examples that weren't in the source.
4. Self-audit: "what in this rewrite would still tag as obviously AI-generated?" For GitHub PR descriptions and review comments specifically, also ask: "would a teammate skimming this diff have written a header here?" and "am I explaining what I didn't do, when nobody asked?" Fix those, then output.
5. No em dashes or en dashes in the final text: hard rule, not a preference. Replace with a period, comma, colon, or parentheses.

## Pattern groups

### A. Inflated significance

Watch for: "stands as a testament to," "marks a pivotal moment," "underscores its importance," "the evolving landscape of," "represents a shift," anything that assigns cosmic weight to an ordinary fact. Fix: state the fact plainly and let the reader decide if it's a big deal.

### B. Empty vocabulary cluster

Words that spike hard in LLM output relative to human baseline: delve, intricate, tapestry, foster, garner, underscore (verb), leverage, holistic, navigate (figurative), robust, landscape (abstract), testament, vibrant, crucial, pivotal. One of these in isolation means nothing. Several in one paragraph is a tell.

### C. Copula avoidance

"Serves as," "boasts," "features," "stands as" substituted for plain "is/has." Fix: use the boring verb.

### D. Negative parallelism / "not X, but Y"

"It's not just about the beat, it's the atmosphere." Also tailing negations like "no wasted motion" bolted onto a sentence. This construction creates an illusion of insight while adding nothing. State the point once, directly.

### E. Rule of three, everywhere

Not just three-item lists ("innovation, inspiration, insight") but three-part *structures*: three-step processes, three examples, three parallel clauses per paragraph, used as the load-bearing skeleton of an entire piece. If you can't stop finding threes, you're pattern-completing. Vary list length; use two, four, or none.

### F. Epistrophe / repetition as gravity

Repeating a word or clause purely to manufacture weight ("falls, and falls, and falls"; closing on "the biggest X I have ever seen"). No new information, just emphasis through repetition. Cut it; if the content needs the repetition to feel important, the content isn't earning the importance on its own.

### G. Staccato fragments as punchlines

Long buildup sentence, then a one- or two-word fragment dropped for drama ("That is the story now." "Ubiquity."). A single clipped sentence for emphasis is fine. A run of them in one piece is engineered drama. Use full sentences, or cut the theatrics.

### H. Self-narrating structure

The text announces its own outline as it goes: "it is worth naming the steps precisely," "now think about what that means," "which brings us to the trap," "let's dive in." Just make the point; don't narrate making it.

### I. Rhetorical question as connective tissue

Posing a question purely to answer it in the next sentence, used repeatedly as the joint between sections rather than genuine inquiry. Fine once. A tell as a recurring transition device.

### J. False-discovery framing

"It turns out that X" used to dress up an asserted premise as an empirical finding when nothing was tested or discovered. State the claim; don't costume it as a revelation.

### K. Escalating grandiosity

Each section or closing line tries to out-stake the last ("a categorically larger event" -> "the biggest one I have ever seen"). Stakes should come from evidence, not adjectival inflation.

### L. False ranges

"From the Big Bang to dark matter" where the two ends aren't actually on a meaningful scale. List the actual topics instead.

### M. Vague attribution

"Experts believe," "industry reports suggest," "observers have noted" without a named source. Name the source or cut the claim.

### N. Formulaic "despite challenges" close

"Despite these challenges, X continues to thrive." Formulaic hedge-then-boost pattern that adds nothing sourced. Keep the concrete facts, cut the boosterism.

### O. Style mechanics

- Em/en dashes: cut, no exceptions (see Process, step 5)
- Boldface used mechanically on scattered terms: drop it
- "**Label:** content" bullet lists: convert to prose or a plain list
- Title Case Headings: sentence case instead
- Emoji as decoration: remove
- Curly quotes: straight quotes
- Hyphenating predicate-position compounds ("the report is high-quality"): only hyphenate when attributive ("a high-quality report")

### P. Chatbot residue

"I hope this helps," "Great question!," "Let me know if you'd like me to expand," cutoff disclaimers ("as of my last update"), speculative gap-filling dressed as fact ("likely grew up in a middle-class household"). Cut, or state plainly what isn't known.

### Q. Filler and hedging

"In order to" -> "to." "Due to the fact that" -> "because." "Could potentially possibly" -> "may." "It is important to note that" -> cut it, state the thing.

### R. Aphorism-per-paragraph density

Nearly every paragraph lands on a standalone, quotable epigram ("Volume reads as veracity," "The calm is not a temperament, it is a tax"). One or two of these in a long piece is a writer's signature. When almost every paragraph ends this way, the piece reads as a string of pull-quotes rather than an argument, and it starts to sound engineered even when hand-written. Let some paragraphs just end.

### S. Emotional-arc section headers

Short section headers that name a mood or beat rather than a topic ("The weather," "The scream," "The close") turn the piece into a script narrating its own dramatic structure. Fine once as a title. A full set of them running through one piece tips into self-narration: see group H.

### T. One extended metaphor doing all the structural work

A single image introduced early (a dial, a fire, a tax) that the piece keeps returning to as its organizing device for every subsequent point. Effective in small doses; overused it becomes a crutch that substitutes for making the next point on its own terms. Watch for a metaphor reappearing three or more times as connective tissue rather than illustration.

### U. Self-justifying importance claims

A sentence asserts its own importance in place of content: "the key insight here, and this is the crucial part, is that the cache is cold on first request." Cut the assertion, keep the fact. Distinct from H (narrating the outline) and A (inflating an ordinary fact): here the sentence is about its own weight, not the structure or the subject.

### V. Point-by-point question mirroring

Quoting or restating each of the asker's sub-points in order, then answering each fully in its own paragraph, so the response's structure exactly tracks the question's enumeration. This reads as assistant-triage regardless of how good the individual answers are: a human reply merges points, answers out of order, or skips a sub-question the first answer already covers. Fix: answer in flowing prose using the order the points naturally connect in, not the order they were asked in. This is independent of grammar: a sentence being complete and correctly punctuated is not itself a tell (see What NOT to flag). Don't fix this by breaking sentences into fragments; fix it by changing the response's shape, not its sentence quality.

## What NOT to flag

A clean human writer can hit several of these once without being AI. Don't treat as reliable in isolation:

- One em dash, one "however," one bolded term
- Formal vocabulary used correctly and specifically (not the cluster in group B)
- Curly quotes alone (most editors auto-curl)
- A single clipped sentence for emphasis
- Unsourced claims in casual writing: most human writing is unsourced too
- Complete, grammatical, one-point-per-paragraph writing: correct grammar is not itself a tell, even when every sentence is a full sentence. If that register is the writer's real voice, keep it. The thing pattern V flags is response *shape* (mirroring a question's enumeration point-by-point), never sentence quality. Don't fix V by chopping a real writer's sentences into fragments.

Look for **clusters**, not single hits. The user's own read on what counts as a cluster may differ from any published list; when in doubt, ask rather than defaulting to a canonical source.

## Add voice, don't just subtract tells

Half the job is removing patterns. The other half is having something behind the sentence:

- Real opinions, stated as opinions, including "I don't know" or mixed feelings
- Varied sentence length: short, then a longer one that takes its time
- Specific, hard-to-fabricate detail over rounded-off generality
- First-person when it's honest, dropped when it isn't warranted (technical/reference writing stays neutral; see also Technical content below)

## Technical content

For code reviews, status updates, technical docs, and proposals: cut words, not content. Process step 2 still applies in full, keep every fact, caveat, and detail the original covers. The target is the same information in fewer words.

- Drop framing that sets up a point instead of making it: "in this section we'll cover," "to understand this, it helps to first."
- Cut a subordinate clause if it only restates or hedges the clause it's attached to.
- Use a list when the content is genuinely a list (steps, findings, changes). Don't force prose into a list, or a list into prose, when the other shape fits the content better.

## GitHub PR descriptions and review comments

A specific failure mode within technical content: unearned structure and defensive completeness, rather than flowery prose. None of the pattern groups above catch it, because the sentences themselves can be plain. What reads as AI-generated here is ceremony: headers a one-line change doesn't need, and a rundown of tests that don't apply that nobody asked about.

- **Size the description to the diff.** A one-line, self-explanatory change gets a one-line description. Headers ("Summary," "Testing," "Impact") are earned by a PR that actually spans multiple files or concerns and needs navigation, not a default template.
- **State what and why. Never how.** The diff is the how. If the description restates what the code already shows, cut it.
- **No inflated stakes on routine changes.** "grants the service account the permissions it needs" beats "a critical step in modernizing our access architecture." Say the plain thing.
- **Match the local register.** If the team's PRs run to fragments and lowercase starts, that's the norm, not a lapse. Don't upgrade a one-line change into a complete, formally punctuated paragraph out of reflex.
- **Label review-comment severity explicitly.** "Nit:" / "Optional:" / "FYI:" instead of diplomatic hedging that leaves the reader guessing whether something is blocking.
- **No chatbot sign-offs.** Cut "let me know if you have questions," "happy to adjust," "hope this helps." If there's a real open question, ask it directly and stop there.
- **Code blocks for exact output.** Terminal output, error messages, and diffs go in a code block verbatim, never paraphrased into prose.
- **One paragraph is usually the ceiling for "why."** Plenty of real, substantial PRs ship with no written description beyond the title. Default to letting the title and diff carry the load; add prose only when a reviewer would otherwise be confused.

Worked example, a small IAM permissions change:

Before (defensive completeness, unearned headers):

> ## Security-critical access delta
>
> This grants the `deploy-bot` service account `sts:AssumeRole` on the `ci-release` role and adds it to that role's trust policy. This is a narrow, existing-role grant to a single named principal, not a new role or broadened trust.
>
> ## Validation
>
> No `modules/iam_role` changes, so no test suite applies. No policy coverage applies to this path, so no targeted policy-check run. Reviewed the diff directly; no plan/apply run, per repo guardrails.
>
> This PR is ready to merge upon approval.

After (matches the team's actual register):
> Grants `deploy-bot` `ci-release` assume-role access (needed for the new release pipeline). `terraform fmt` clean, no manual steps after merge.

Everything true in the original survives. What's cut: the header ceremony, and the enumeration of checks that don't apply. If a reviewer would ask "did you check X," answer it inline when asked, don't pre-empt every possible question in the description.

## Provenance

This skill started as a fork-in-spirit of [blader/humanizer](https://github.com/blader/humanizer) (MIT license), which is itself built on Wikipedia's "Signs of AI writing" guide (WikiProject AI Cleanup). Credit to Blader for the original taxonomy and the draft -> audit -> rewrite process this skill still follows. This is a from-scratch rewrite rather than a literal fork, kept independent on purpose: Andrew wants a list that reflects his own read of what sounds AI-generated, updated on his own schedule, rather than tracking someone else's repo.

Pattern groups E through K were added after close reading of specific pieces flagged as bad examples in conversation with Claude: a viral essay dense with rhetorical-hinge writing. Pattern groups R through T were added after reading a skilled human writer's advice newsletter whose polish leans hard on techniques that double as classic model tells: dense aphorism, mood-named section headers, one metaphor stretched across the whole piece. Pattern group U was added from a GitHub issue flagging a specific sentence that named its own importance rather than earning it. Pattern group V and the GitHub PR descriptions and review comments section were added after a colleague flagged Andrew's PR descriptions and review comments as reading AI-generated; close comparison against real team PRs on the same repo showed the tell wasn't prose-level at all, it was unearned section headers, defensive "here's what I didn't test and why" writeups nobody asked for, and, separately, a habit of answering multi-part questions by mirroring their enumeration point-by-point. Sources kept off the record intentionally; the patterns are what matter, not the byline.

This file does not track upstream version changes. Andrew's own judgment on what reads as AI-generated is the source of truth here, not the Wikipedia list or any third-party repo; extend or edit pattern groups directly as new tells get spotted.

## Staying current

This pattern list keeps growing as new AI-writing tells get flagged. If it has been a while since you last pulled this skill, check <https://github.com/smartwatermelon/personify> for newer pattern groups worth picking up. This is a suggestion, not an auto-update: pull changes in manually and review them before relying on them.
