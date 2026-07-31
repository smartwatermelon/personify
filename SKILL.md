---
name: personify
version: 0.1.0
description: Strip AI-writing tells from prose before sending, publishing, or shipping it. Use when editing text (emails, docs, PRs, blog drafts) someone else will read. Derivative of blader/humanizer (MIT); see license field.
license: MIT (derivative of blader/humanizer; see Provenance)
---

# Personify

Edit text to remove the statistical fingerprints of LLM writing, without flattening it into voiceless "clean" prose. Two failure modes to avoid equally: leaving AI tells in, and over-correcting into generic dryness that has no writer behind it.

## Process

1. Scan for the patterns below.
2. Rewrite, don't delete — cover everything the original covers, don't compress it into bullet-point paraphrase.
3. Preserve the specifics: names, numbers, concrete details. Never invent facts, dates, or examples that weren't in the source.
4. Self-audit: "what in this rewrite would still tag as obviously AI-generated?" Fix those, then output.
5. No em dashes or en dashes in the final text — hard rule, not a preference. Replace with a period, comma, colon, or parentheses.

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
- Boldface used mechanically on scattered terms — drop it
- "**Label:** content" bullet lists — convert to prose or a plain list
- Title Case Headings — sentence case instead
- Emoji as decoration — remove
- Curly quotes — straight quotes
- Hyphenating predicate-position compounds ("the report is high-quality") — only hyphenate when attributive ("a high-quality report")

### P. Chatbot residue

"I hope this helps," "Great question!," "Let me know if you'd like me to expand," cutoff disclaimers ("as of my last update"), speculative gap-filling dressed as fact ("likely grew up in a middle-class household"). Cut, or state plainly what isn't known.

### Q. Filler and hedging

"In order to" -> "to." "Due to the fact that" -> "because." "Could potentially possibly" -> "may." "It is important to note that" -> cut it, state the thing.

### R. Aphorism-per-paragraph density

Nearly every paragraph lands on a standalone, quotable epigram ("Volume reads as veracity," "The calm is not a temperament, it is a tax"). One or two of these in a long piece is a writer's signature. When almost every paragraph ends this way, the piece reads as a string of pull-quotes rather than an argument, and it starts to sound engineered even when hand-written. Let some paragraphs just end.

### S. Emotional-arc section headers

Short section headers that name a mood or beat rather than a topic ("The weather," "The scream," "The close") turn the piece into a script narrating its own dramatic structure. Fine once as a title. A full set of them running through one piece tips into self-narration — see group H.

### T. One extended metaphor doing all the structural work

A single image introduced early (a dial, a fire, a tax) that the piece keeps returning to as its organizing device for every subsequent point. Effective in small doses; overused it becomes a crutch that substitutes for making the next point on its own terms. Watch for a metaphor reappearing three or more times as connective tissue rather than illustration.

## What NOT to flag

A clean human writer can hit several of these once without being AI. Don't treat as reliable in isolation:

- One em dash, one "however," one bolded term
- Formal vocabulary used correctly and specifically (not the cluster in group B)
- Curly quotes alone (most editors auto-curl)
- A single clipped sentence for emphasis
- Unsourced claims in casual writing — most human writing is unsourced too

Look for **clusters**, not single hits. the user's own read on what counts as a cluster may differ from any published list — when in doubt, ask rather than defaulting to a canonical source.

## Add voice, don't just subtract tells

Half the job is removing patterns. The other half is having something behind the sentence:

- Real opinions, stated as opinions, including "I don't know" or mixed feelings
- Varied sentence length — short, then a longer one that takes its time
- Specific, hard-to-fabricate detail over rounded-off generality
- First-person when it's honest, dropped when it isn't warranted (technical/reference writing stays neutral)

## Provenance

This skill started as a fork-in-spirit of [blader/humanizer](https://github.com/blader/humanizer) (MIT license), which is itself built on Wikipedia's "Signs of AI writing" guide (WikiProject AI Cleanup). Credit to Blader for the original taxonomy and the draft -> audit -> rewrite process this skill still follows. This is a from-scratch rewrite rather than a literal fork, kept independent on purpose: Andrew wants a list that reflects his own read of what sounds AI-generated, updated on his own schedule, rather than tracking someone else's repo.

Pattern groups E through K were added after close reading of specific pieces flagged as bad examples in conversation with Claude — a viral essay dense with rhetorical-hinge writing. Pattern groups R through T were added after reading a skilled human writer's advice newsletter whose polish leans hard on techniques that double as classic model tells: dense aphorism, mood-named section headers, one metaphor stretched across the whole piece. Sources kept off the record intentionally; the patterns are what matter, not the byline.

This file does not track upstream version changes. Andrew's own judgment on what reads as AI-generated is the source of truth here, not the Wikipedia list or any third-party repo — extend or edit pattern groups directly as new tells get spotted.

## Staying current

This pattern list keeps growing as new AI-writing tells get flagged. If it has been a while since you last pulled this skill, check <https://github.com/smartwatermelon/personify> for newer pattern groups worth picking up. This is a suggestion, not an auto-update: pull changes in manually and review them before relying on them.
