---
name: personify
version: 0.3.0
description: Strip AI-writing tells from prose before sending, publishing, or shipping it. Use when editing text (emails, docs, comments, PRs, blog drafts, essays) someone else will read. Compresses wordy phrasing and puts a person back in impersonal sentences, the two strongest reasons correct technical writing reads as machine-generated. Reads an optional per-user voice guide (VOICE.md) and treats it as authoritative, so output sounds like a specific person rather than generically clean. Derivative of blader/humanizer (MIT); see license field.
license: MIT (derivative of blader/humanizer; see Provenance)
---

# Personify

Edit text to remove the statistical fingerprints of LLM writing, without flattening it into voiceless "clean" prose. Two failure modes to avoid equally: leaving AI tells in, and over-correcting into generic dryness that has no writer behind it.

## Step 0: Load the voice guide first

Before applying anything below, you MUST actually check disk for the voice guide with a real tool call (Read, or `ls` via Bash). Do not infer its presence or absence from conversation context, memory, or a prior turn. Check these locations in order and use the first that exists:

1. The path in the `PERSONIFY_VOICE` environment variable, if set.
2. `VOICE.md` under the user's config directory: `$XDG_CONFIG_HOME/personify/VOICE.md`, or `~/.config/personify/VOICE.md` when `XDG_CONFIG_HOME` is unset.
3. `VOICE.md` in this skill's own directory (repo-local development only).

Never state that a voice guide is "missing," "not configured," or "not found" without having just run a tool call against that exact path in this turn. If you have not made that call yet, make it before saying anything about voice-guide status.

If a voice guide is found, read it fully and treat it as authoritative. It describes one specific person's writing. Where it conflicts with any rule in this skill, the voice guide wins; the pattern groups below are only a backstop for residue it doesn't address.

If no voice guide is found, read `VOICE.example.md` (in this skill's directory) for what one looks like and how to build it. Without a voice guide this skill makes text non-robotic but not distinctive: clean, competent, anonymous. Proceed with the general rules and say so, so the user knows a voice guide is what turns "not obviously AI" into "sounds like them."

The voice guide is personal and never committed (git-ignored, like `.env`). It lives at a stable path outside the plugin install on purpose: the plugin installs into a version-pinned directory that is replaced on every upgrade, so a guide kept inside the install would be lost on each update. The committed `VOICE.example.md` documents the shape without containing anyone's voice.

## Process

1. Scan for the patterns below.
2. Rewrite, don't delete: cover every fact the original covers, don't compress it into bullet-point paraphrase. This constrains what you cut, not how short you get: step 4 compresses hard, and the two agree because hedges and throat-clearing are not facts.
3. Preserve the specifics: names, numbers, concrete details. Never invent facts, dates, or examples that weren't in the source.
4. De-abstract, then compress. Two passes, in this order, and they matter more than anything else in this file for work communication. First: every sentence describing a judgment or an action, who did it (group X)? Put them in the sentence. Do this first, because compressing "it was decided that we should revisit the cache" can delete the clause that would have told you who decided. Second: every sentence, is the idea smaller than the word count (group W)? Cut until it isn't. Naming the actor usually makes the sentence shorter anyway.
5. Self-audit: "what in this rewrite would still tag as obviously AI-generated?" Then, for work communication: "would I actually type this to a coworker, or is it a memo?" and "how many words is this carrying that do no work?" For GitHub PR descriptions and review comments specifically, also ask: "would a teammate skimming this diff have written a header here?" and "am I explaining what I didn't do, when nobody asked?" Fix those, then output.
6. No em dashes or en dashes in the final text: hard rule, not a preference. Replace with a period, comma, or colon. Not parentheses (group O).

## Pattern groups

### A. Inflated significance

Watch for: "stands as a testament to," "marks a pivotal moment," "underscores its importance," "the evolving landscape of," "represents a shift," anything that assigns cosmic weight to an ordinary fact. Fix: state the fact plainly and let the reader decide if it's a big deal.

### B. Empty vocabulary cluster

Words that spike hard in LLM output relative to human baseline: delve, intricate, tapestry, foster, garner, underscore (verb), leverage, holistic, navigate (figurative), robust, landscape (abstract), testament, vibrant, crucial, pivotal.

Extended set: meticulous, bolster, interplay, multifaceted, nuanced (as filler), utilize, commence, facilitate, encompass, paramount, groundbreaking, cutting-edge, game-changing, transformative, revolutionize, seamless, comprehensive (describing your own output), endeavor, aforementioned, harness, spearhead, showcase, unprecedented, remarkable, profound, synergy, pain points, thought leadership, moving forward, circle back, rest assured, in essence, it goes without saying.

Stock phrases from the same distribution: "in today's [adjective] [noun]," "at its core," "in the realm of," "when it comes to," "this is where X comes in," "whether you're a X or a Y," "at the end of the day," "the bottom line is," "here's the thing," "in a nutshell," "without further ado," "in conclusion," "overall" as a paragraph opener, "firstly / secondly / thirdly," "I hope this finds you well," "please don't hesitate to reach out."

These are weighted signals, not banned words. One in isolation means nothing, and several of them are the correct word in a technical context: "robust" about a retry policy, "comprehensive" about someone else's test suite. Several in one paragraph is a tell. Judge the cluster, not the hit, and see What NOT to flag.

"utilize" and "commence" are the exception: those two are always "use" and "start," because the substitution never loses meaning. They live in group W's verb-inflation list, which is where hard substitutions belong. Everything above stays a weighted signal.

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

- Em/en dashes: cut, no exceptions (see Process, step 6). Replace with a period, comma, or colon. Not parentheses: see the aside rule below.
- Parenthetical asides: cut the aside, don't relocate it. Parentheses, appositives, and "which"/"that" clauses that add color rather than fact all get deleted. If the content matters it becomes its own short sentence; if it doesn't, it's gone. Facts, numbers, and technical caveats are never cut this way (see Process, step 3).
- Exclamation marks: at most one per long piece, and usually zero. Enthusiasm comes from word choice.
- Ellipses: only for genuinely trailing off, never as a transition.
- Semicolons: fine to use. Models underuse them and good human writers reach for them naturally.
- Markdown in plain-text contexts (email, DM, SMS, Slack): no headers, no bold, no asterisks. Raw asterisks rendering as literal symbols is an instant tell.
- Hashtag stacks: zero to two, integrated into the sentence.
- Emoji as bullet points: every line starting with a checkmark or flame is slop. One or two emoji in a casual post is fine.
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

Quoting or restating each of the asker's sub-points in order, then answering each fully in its own paragraph, so the response's structure exactly tracks the question's enumeration. This reads as assistant-triage regardless of how good the individual answers are: a human reply merges points, answers out of order, or skips a sub-question the first answer already covers. Fix: answer in flowing prose using the order the points naturally connect in, not the order they were asked in. Fix it by changing the response's shape, not by chopping sentences at random: the two problems are separate, and fragmenting a mirrored answer leaves it still mirrored. In long-form prose, complete correctly punctuated sentences are not themselves a tell (see What NOT to flag). In work communication, fragments are actively wanted, but for the reasons in Work register, not as a fix for V.

### W. Too many words for a simple concept

The highest-priority pattern in this skill, alongside X. A simple idea arrives wrapped in a construction three times its necessary size. The sentence is grammatical, accurate, and completely correct, which is exactly why it slips through: nothing is wrong with it except that nobody would say it that way.

The tell isn't vocabulary, it's ratio. Count the words against the idea underneath. "We should consider whether it might make sense to revisit the caching approach" carries one idea, "maybe we should redo the cache," in four times the words. Every extra word is doing hedging or throat-clearing rather than carrying meaning.

Specific constructions to cut:

- Nominalizations back to verbs: "perform an analysis of" to "analyze," "make a determination" to "decide," "provide clarification" to "clarify," "has a dependency on" to "needs."
- Verb inflation: "utilize" to "use," "commence" to "start," "facilitate" to "help," "implement a fix" to "fix," "leverage" to "use."
- Prepositional pileups: "in the event that" to "if," "for the purpose of" to "to," "with regard to" to "about," "in the vicinity of" to "near," "at this point in time" to "now," "on a daily basis" to "daily."
- Hedge stacks: "it seems like it might potentially be" to "may be." One hedge maximum, and only when the uncertainty is real.
- Setup clauses that delay the point: "what I'm seeing here is that the test fails" to "the test fails." "The reason for this is that" to "because."
- Existential openers: "there are several files that need updating" to "several files need updating." "It is the case that" to nothing.

Fix: say it the way you'd say it out loud to a coworker standing at your desk, then keep that version. If the short version sounds blunt or unpolished, that's the target, not a problem to fix. Blunt reads as human. Polished reads as generated.

Do not preserve length by relocating words. The compressed version is the output.

### X. Impersonal framing

The highest-priority pattern alongside W. A human made a choice, held an opinion, or did a thing, and the sentence hides that human behind a process, an abstraction, or a passive construction. This is the single strongest reason correct technical writing reads as machine-generated: machines have no first person, so prose with no first person reads as machine-written even when a person wrote it.

Watch for:

- Passive voice hiding the actor: "the config was updated" to "I updated the config." "It was decided that" to "we decided" or "I decided." "Mistakes were made" to who made them.
- Abstractions as grammatical subject: "this approach introduces risk" to "I think this breaks under load." "The implementation handles retries" to "it retries." "The changes address the issue" to "this fixes the bug."
- Opinions laundered as observations: "it may be worth considering X" to "I'd do X." "One could argue that" to "I think." "There are concerns about" to "I'm worried about."
- Missing subjects generally: if a sentence describes a judgment, someone made it. Name them, usually "I" or "we."
- Credential openers: "as the author of this module, I..." Just say the thing.

Fix: put a person in the sentence. "I," "we," "you," or a named human. State opinions as opinions and own them: "I think," "I'd rather," "I don't know," "this seems wrong to me." Hedging into impersonality to sound measured is the exact move that reads as AI.

Carve-outs, both narrow. Reference documentation and API docs stay neutral, because there genuinely is no actor. And a PR description narrating what its own diff does can lead with the verb ("gives `deploy-bot` assume-role"), since the author is unambiguous from the PR metadata. Everywhere else at work, including review comments, status updates, Slack, design docs, and email to the team, takes the first person. The carve-out is about actors that are already obvious, not permission to hedge: any sentence carrying a judgment, a doubt, or a decision names the person who holds it, PR descriptions included.

### Y. Uniform rhythm and parataxis

Two opposite failures, both measurable, both tells.

Uniform sentence length: three consecutive sentences of roughly the same length reads as generated regardless of content. Mix a four-word sentence against a thirty-word one. This needs three sentences to apply at all, so it's silent on a two-line Slack message. Don't manufacture length variance in something too short to have rhythm.

Parataxis: a run of short declaratives with no connective tissue. "The build failed. The cache was stale. I cleared it." Reads like a poem, signals AI immediately. Connect them so the syntax shows how the ideas relate: "build failed because the cache was stale, cleared it."

Related structural tells: identical paragraph shape throughout (topic sentence, explanation, example, transition, repeat), parallel structure across every section, and more than five to seven bullets in a row. Vary the shape. Let some paragraphs be one sentence. Let some end without a transition.

Note the interaction with W: compression is not permission to produce parataxis. Compress by cutting words, then connect what remains with conjunctions and subordination, not by chopping into a stack of stubs.

### Z. Hedging seesaw and corporate pep talk

Hedging seesaw: presenting both sides at equal weight to avoid committing. "There are benefits to X, though Y also has merits, and the right choice depends on context." Pick a side, state it plainly, give a counterpoint one sentence at most. If you genuinely don't know, say "I don't know" and stop, which is a position and reads as human.

Corporate pep talk: cheerleading register with no experience behind it. "Empower," "elevate," "supercharge," "unlock the power of," "move the needle," "take it to the next level," "bridge the gap," "streamline your workflow." Also the closing-boosterism reflex, which is group N seen from a different angle. Write like someone who has actually done the work, including the parts that were annoying.

Also in this family: filler transitions used as connective tissue, "moreover," "furthermore," "additionally," "notably," "importantly," "interestingly," "indeed." Delete them. The relationship between two sentences should come from their content, and if it doesn't, the transition word is patching a structural problem.

## What NOT to flag

A clean human writer can hit several of these once without being AI. Don't treat as reliable in isolation:

- One em dash, one "however," one bolded term
- Formal vocabulary used correctly and specifically (not the cluster in group B)
- Curly quotes alone (most editors auto-curl)
- A single clipped sentence for emphasis
- Unsourced claims in casual writing: most human writing is unsourced too
- Complete, grammatical, one-point-per-paragraph writing **in long-form prose**: in essays, articles, and personal writing, correct grammar is not itself a tell, and if that register is the writer's real voice, keep it. This protection does **not** extend to work communication: see Work register below, where the polished complete-sentence default is the primary thing to strip. The thing pattern V flags is response *shape* (mirroring a question's enumeration point-by-point), never sentence quality in prose.

Look for **clusters**, not single hits. The user's own read on what counts as a cluster may differ from any published list; when in doubt, ask rather than defaulting to a canonical source.

## Add voice, don't just subtract tells

Half the job is removing patterns. The other half is having something behind the sentence:

- Real opinions, stated as opinions, including "I don't know" or mixed feelings
- Varied sentence length: short, then a longer one that takes its time
- Specific, hard-to-fabricate detail over rounded-off generality
- First person by default, dropped only where the actor is genuinely absent (reference documentation) or already obvious (a PR description narrating its own diff). See group X for both carve-outs, and Technical content below.
- Contractions, and the shorter word over the more precise one when the precision isn't doing work

## Work register

Applies to PR descriptions, code review comments, Slack, status updates, tickets, and internal email. The typical case is a message to a colleague in the course of work.

How to classify anything not on that list, in order:

1. Is it reference material with no human actor (API docs, specs, generated documentation)? Neutral register. Stop here.
2. Is it a message to a person, or a short artifact a colleague reads and acts on? Work register, however formal the subject.
3. Is it long (roughly 800 words or more) and meant to be read as a piece of writing rather than as a message? Long-form. Keep the calibration in What NOT to flag: complete sentences, no forced informality.
4. Still ambiguous? Ask which register the user wants rather than guessing. Getting this wrong is expensive in both directions.

The two axes are audience and length, and they come apart. A company blog post is work by purpose but long-form by shape, so it takes classification step 3 above. A long design doc is the same: work-register vocabulary and first person, but complete sentences rather than lowercase fragments, because nobody skims a 4000-word architecture doc the way they skim Slack. A README sits between reference and message; if it explains decisions and tradeoffs, it takes the first person, and if it only documents an interface, it goes neutral. External email to a customer or vendor is work register with the informality dialed back: contractions and first person yes, lowercase starts and fragments no.

The premise: a careful writer's natural work register is polished, complete, evenly hedged, and impersonal, and that register is now indistinguishable from model output. Grammatical polish is not the goal here. Sounding like a specific tired person typing between meetings is the goal. Bias hard toward informal and short. When a rewrite feels too blunt or too casual, it is probably right.

Compression removes words. It never adds specificity. This is the failure mode of everything above: rewriting toward how you'd say it out loud pulls hard toward concrete mechanism, and concrete mechanism is often exactly what the source didn't have. "the invalidation logic may be the source of the stale reads" compresses to "cache invalidation was the cause," not to "cache invalidation was dropping the wrong keys." The second is punchier, sounds more human, and asserts something nobody established. If the vague version is what you know, ship the vague version short (Process, step 3).

The floor: blunt is the target, curt is not. Cutting hedges and softeners is the job. Cutting so far that a reader hears hostility or dismissal is a different failure, and it is not fixed by adding the hedges back. It is fixed by keeping the sentence short and the tone neutral.

Defaults, which override the general guidance elsewhere in this skill:

- Fragments are fine. Sentences without subjects are fine. Lowercase sentence starts are fine where the team does that. This applies to messages, not to long documents reached by classification step 3 above, which keep complete sentences while still taking the first person and the compression.
- Contractions always. "don't," "can't," "it's," "I'd." Never "do not" or "cannot" unless the emphasis is real.
- First person, always, per group X. "I checked," "I'd rather," "I don't know."
- No parenthetical asides, per group O. If it matters it's a sentence; otherwise it's gone.
- One hedge maximum per message, and only for real uncertainty. Delete "I think it might possibly," "it seems like," "arguably," "to some extent."
- No transition words doing structural work: "moreover," "furthermore," "additionally," "notably," "that said" as a reflex.
- Drop framing that sets up a point instead of making it: "in this section we'll cover," "to understand this, it helps to first," "just to give some context."
- Cut a subordinate clause if it only restates or hedges the clause it's attached to.
- Use a list when the content is genuinely a list (steps, findings, changes). Don't force prose into a list, or a list into prose.
- Skip the greeting and the sign-off in short internal messages. Start with the content.

What survives compression, and this is not negotiable: names, numbers, file paths, error text, technical caveats, and anything a reader would act on. What gets cut: hedges, qualifiers, restatements, throat-clearing, defensive completeness, and softening. Losing nuance is acceptable here. Losing a fact is not (Process, step 3).

Worked example, a status update:

Before:

> I wanted to provide a quick update on the caching work. After performing an analysis of the current implementation, it was determined that the invalidation logic may potentially be the source of the stale reads we've been observing. I've implemented a fix for this in #412, though it's worth noting that there could be additional edge cases we haven't yet identified, as testing so far has been limited to the read path. Please don't hesitate to reach out if you have any questions.

After:

> I found the stale reads: cache invalidation was the cause, fixed in #412. there might be more edge cases since I only tested the read path.

Every fact survives: the cause, the PR number, and the caveat that only the read path was tested. Gone: the update-about-an-update opener, the nominalization ("performing an analysis of" becomes the verb "found"), the passive with no actor ("it was determined" becomes "I found"), the hedge stack ("may potentially" becomes a single "might"), the "worth noting," and the sign-off.

Two things the rewrite does besides cutting. It starts with the finding instead of announcing that a finding is coming. And it connects clauses with a colon and "since" rather than stacking three bare declaratives, because compression is not a license for parataxis (group Y). "found the stale reads. cache invalidation was wrong. only tested the read path." would be shorter and worse: it loses the causal link and reads as generated in a different way.

## Technical content

Reference documentation, API docs, and published specs keep a neutral register: there is no actor to name, so group X's first-person rule doesn't apply. Everything else technical follows Work register above.

Even here, cut words, not content. Keep every fact, caveat, and detail the original covers. The target is the same information in fewer words.

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
> gives `deploy-bot` assume-role on `ci-release` so the new release pipeline can run. `terraform fmt` clean, nothing manual after merge.

Everything true in the original survives. What's cut: the header ceremony, and the enumeration of checks that don't apply. If a reviewer would ask "did you check X," answer it inline when asked, don't pre-empt every possible question in the description.

Note what the rewrite does beyond cutting. The parenthetical aside became a subordinate clause carrying the same fact ("so the new release pipeline can run"), because group O cuts asides rather than parking them in parentheses, and the reason survives as a fact. Two short clauses got connected instead of stacked, per group Y. The first person is optional here and only here: a PR description whose subject is the diff itself can lead with the verb, since the author is unambiguous from the PR metadata. The moment the description carries a judgment ("I'd rather do X," "I'm not sure this covers Y"), group X applies in full and the "I" goes back in.

## Provenance

This skill started as a fork-in-spirit of [blader/humanizer](https://github.com/blader/humanizer) (MIT license), which is itself built on Wikipedia's "Signs of AI writing" guide (WikiProject AI Cleanup). Credit to Blader for the original taxonomy and the draft -> audit -> rewrite process this skill still follows. This is a from-scratch rewrite rather than a literal fork, kept independent on purpose: Andrew wants a list that reflects his own read of what sounds AI-generated, updated on his own schedule, rather than tracking someone else's repo.

Pattern groups E through K were added after close reading of specific pieces flagged as bad examples in conversation with Claude: a viral essay dense with rhetorical-hinge writing. Pattern groups R through T were added after reading a skilled human writer's advice newsletter whose polish leans hard on techniques that double as classic model tells: dense aphorism, mood-named section headers, one metaphor stretched across the whole piece. Pattern group U was added from a GitHub issue flagging a specific sentence that named its own importance rather than earning it. Pattern group V and the GitHub PR descriptions and review comments section were added after a colleague flagged Andrew's PR descriptions and review comments as reading AI-generated; close comparison against real team PRs on the same repo showed the tell wasn't prose-level at all, it was unearned section headers, defensive "here's what I didn't test and why" writeups nobody asked for, and, separately, a habit of answering multi-part questions by mirroring their enumeration point-by-point. Sources kept off the record intentionally; the patterns are what matter, not the byline.

Pattern groups W through Z, the Work register section, and the expanded vocabulary in group B were added after a third warning from Andrew's manager that his writing read as AI-generated, in cases where no model output was involved at all. The diagnosis: his natural technical register is polished, complete, evenly hedged, and impersonal, which is now the model default. Groups Y and Z, the extended group B vocabulary, and the plain-text formatting rules in group O draw on [jalaalrd/anti-ai-slop-writing](https://github.com/jalaalrd/anti-ai-slop-writing) (MIT), rewritten to fit this skill's cluster-based calibration rather than its hard banned-word framing. Groups W and X are not from that repo; they were named by Andrew as the two patterns that matter most, and they carry the highest priority in this skill. That change also inverted this skill's earlier stance protecting complete grammatical prose in work contexts, which is why What NOT to flag and group V now scope that protection to long-form writing only. The register-classification list in Work register came out of adversarial review of that change: the first draft defined scope by enumerating work formats and long-form formats, which left most real inputs (company blog posts, long design docs, READMEs, external email) unclassified and let the model pick a branch arbitrarily.

Note for future edits: `scripts/validate_skill.py` requires pattern-group headings to run A, B, C with no gaps, so Z is the last available letter and the taxonomy is now full. The intended path for a twenty-seventh pattern is to merge related groups rather than extend the scheme to AA: several groups already overlap heavily (H and S both cover self-narration, A and K both cover inflation, N and Z both cover boosterism), and consolidating them would free letters while making the list easier to apply. Extending the validator to AA/AB is the fallback if merging would lose a distinction worth keeping.

This file does not track upstream version changes. Andrew's own judgment on what reads as AI-generated is the source of truth here, not the Wikipedia list or any third-party repo; extend or edit pattern groups directly as new tells get spotted.

## Staying current

This pattern list keeps growing as new AI-writing tells get flagged. If it has been a while since you last pulled this skill, check <https://github.com/smartwatermelon/personify> for newer pattern groups worth picking up. This is a suggestion, not an auto-update: pull changes in manually and review them before relying on them.
