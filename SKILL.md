---
name: personify
version: 0.5.2
description: Strip AI-writing tells from prose before sending, publishing, or shipping it. Use when editing text (emails, docs, comments, PRs, blog drafts, essays) someone else will read. Compresses wordy phrasing, puts a person back in impersonal sentences, and reframes implementation detail as outcomes a non-expert reader can see the value in. Covers task boards and PR comments, not just prose. Reads an optional per-user voice guide (VOICE.md) and treats it as authoritative, so output sounds like a specific person rather than generically clean. Derivative of blader/humanizer (MIT); see license field.
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

The voice guide is personal and never committed (git-ignored, like `.env`). It lives at a stable path outside the plugin install on purpose: the plugin installs into a version-pinned directory that is replaced on every upgrade, so a guide kept inside the install would be lost on each update. The committed `VOICE.example.md` documents the structure without containing anyone's voice.

## Process

1. Scan for the patterns below.
2. Rewrite, don't delete: cover every fact the original covers, don't compress it into bullet-point paraphrase. This constrains what you cut, not how short you get: step 4 compresses hard, and the two agree because hedges and throat-clearing are not facts.
3. Preserve the specifics: names, numbers, concrete details. Never invent facts, dates, or examples that weren't in the source.
4. De-abstract, then compress. Two passes, in this order, and they matter more than anything else in this file for work communication. First: every sentence describing a judgment or an action, who did it (group W)? Put them in the sentence. Do this first, because compressing "it was decided that we should revisit the cache" can delete the clause that would have told you who decided. Second: every sentence, is the idea smaller than the word count (group V)? Cut until it isn't. Naming the actor usually makes the sentence shorter anyway.
5. Self-audit: "what in this rewrite would still tag as obviously AI-generated?" Then, for work communication: "would I actually type this to a coworker, or is it a memo?" and "how many words is this carrying that do no work?" For GitHub PR descriptions and review comments specifically, also ask: "would a teammate skimming this diff have written a header here?" and "am I explaining what I didn't do, when nobody asked?" Fix those, then output.
6. No em dashes or en dashes in the final text: hard rule, not a preference. Replace with a period, comma, or colon. Not parentheses (group O).

## Pattern groups

### A. Inflated significance

Watch for: "stands as a testament to," "marks a pivotal moment," "underscores its importance," "the evolving landscape of," "represents a shift," anything that assigns cosmic weight to an ordinary fact. Fix: state the fact plainly and let the reader decide if it's a big deal.

### B. Empty vocabulary cluster

Words that spike hard in LLM output relative to human baseline: delve, intricate, tapestry, foster, garner, underscore (verb), leverage, holistic, navigate (figurative), robust, landscape (abstract), shape (abstract, for a process or idea rather than a physical object), load-bearing (figurative, for anything other than an actual physical support), testament, vibrant, crucial, pivotal.

Extended set: meticulous, bolster, interplay, multifaceted, nuanced (as filler), utilize, commence, facilitate, encompass, paramount, groundbreaking, cutting-edge, game-changing, transformative, revolutionize, seamless, comprehensive (describing your own output), endeavor, aforementioned, harness, spearhead, showcase, unprecedented, remarkable, profound, synergy, pain points, thought leadership, moving forward, circle back, rest assured, in essence, it goes without saying.

Stock phrases from the same distribution: "in today's [adjective] [noun]," "at its core," "in the realm of," "when it comes to," "this is where X comes in," "whether you're a X or a Y," "at the end of the day," "the bottom line is," "here's the thing," "in a nutshell," "without further ado," "in conclusion," "overall" as a paragraph opener, "firstly / secondly / thirdly," "I hope this finds you well," "please don't hesitate to reach out."

These are weighted signals, not banned words. One in isolation means nothing, and several of them are the correct word in a technical context: "robust" about a retry policy, "comprehensive" about someone else's test suite. Several in one paragraph is a tell. Judge the cluster, not the hit, and see What NOT to flag.

"utilize" and "commence" are the exception: those two are always "use" and "start," because the substitution never loses meaning. They live in group V's verb-inflation list, which is where hard substitutions belong. Everything above stays a weighted signal.

### C. Copula avoidance

"Serves as," "boasts," "features," "stands as" substituted for plain "is/has." Fix: use the boring verb.

### D. Negative parallelism / "not X, but Y"

"It's not just about the beat, it's the atmosphere." Also tailing negations like "no wasted motion" bolted onto a sentence. This construction creates an illusion of insight while adding nothing. State the point once, directly.

### E. Rule of three, everywhere

Not just three-item lists ("innovation, inspiration, insight") but three-part *structures*: three-step processes, three examples, three parallel clauses per paragraph, used as the skeleton of an entire piece. If you can't stop finding threes, you're pattern-completing. Vary list length; use two, four, or none.

### F. Epistrophe / repetition as gravity

Repeating a word or clause purely to manufacture weight ("falls, and falls, and falls"; closing on "the biggest X I have ever seen"). No new information, just emphasis through repetition. Cut it; if the content needs the repetition to feel important, the content isn't earning the importance on its own.

### G. Staccato fragments as punchlines

Long buildup sentence, then a one- or two-word fragment dropped for drama ("That is the story now." "Ubiquity."). A single clipped sentence for emphasis is fine. A run of them in one piece is engineered drama. Use full sentences, or cut the theatrics.

### H. Self-narrating structure

The text announces its own outline as it goes: "it is worth naming the steps precisely," "now think about what that means," "which brings us to the trap," "let's dive in." Just make the point; don't narrate making it.

Emotional-arc section headers are the same tell in heading form. Short headers naming a mood or beat rather than a topic ("The weather," "The scream," "The close") turn the piece into a script narrating its own dramatic structure. Fine once as a title. A full set of them running through one piece is self-narration by another route.

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
- Parenthetical asides: no parentheses, and no relocating an aside into a different set of parentheses elsewhere. Sort by content first. An aside carrying color, hedging, or restatement gets deleted outright. An aside carrying a fact, number, or technical caveat is never deleted (Process, step 3): promote it into the sentence as a plain clause, or make it its own short sentence. The rule bans the parenthetical construction, not the information inside it. Same for appositives and "which"/"that" clauses.
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

### S. One extended metaphor doing all the structural work

A single image introduced early (a dial, a fire, a tax) that the piece keeps returning to as its organizing device for every subsequent point. Effective in small doses; overused it becomes a crutch that substitutes for making the next point on its own terms. Watch for a metaphor reappearing three or more times as connective tissue rather than illustration.

### T. Self-justifying importance claims

A sentence asserts its own importance in place of content: "the key insight here, and this is the crucial part, is that the cache is cold on first request." Cut the assertion, keep the fact. Distinct from H (narrating the outline) and A (inflating an ordinary fact): here the sentence is about its own weight, not the structure or the subject.

### U. Point-by-point question mirroring

Quoting or restating each of the asker's sub-points in order, then answering each fully in its own paragraph, so the response's structure exactly tracks the question's enumeration. This reads as assistant-triage regardless of how good the individual answers are: a human reply merges points, answers out of order, or skips a sub-question the first answer already covers. Fix: answer in flowing prose using the order the points naturally connect in, not the order they were asked in. Fix it by reorganizing the response, not by chopping sentences at random: the two problems are separate, and fragmenting a mirrored answer leaves it still mirrored. In long-form prose, complete correctly punctuated sentences are not themselves a tell (see What NOT to flag). In work communication, fragments are actively wanted, but for the reasons in Work register, not as a fix for this group.

### V. Too many words for a simple concept

The highest-priority pattern in this skill, alongside W. A simple idea arrives wrapped in a construction three times its necessary size. The sentence is grammatical, accurate, and completely correct, which is exactly why it slips through: nothing is wrong with it except that nobody would say it that way.

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

### W. Impersonal framing

The highest-priority pattern alongside V. A human made a choice, held an opinion, or did a thing, and the sentence hides that human behind a process, an abstraction, or a passive construction. This is the single strongest reason correct technical writing reads as machine-generated: machines have no first person, so prose with no first person reads as machine-written even when a person wrote it.

Watch for:

- Passive voice hiding the actor: "the config was updated" to "I updated the config." "It was decided that" to "we decided" or "I decided." "Mistakes were made" to who made them.
- Abstractions as grammatical subject: "this approach introduces risk" to "I think this breaks under load." "The implementation handles retries" to "it retries." "The changes address the issue" to "this fixes the bug."
- Opinions laundered as observations: "it may be worth considering X" to "I'd do X." "One could argue that" to "I think." "There are concerns about" to "I'm worried about."
- Missing subjects generally: if a sentence describes a judgment, someone made it. Name them, usually "I" or "we."
- Credential openers: "as the author of this module, I..." Just say the thing.

Fix: put a person in the sentence. "I," "we," "you," or a named human. State opinions as opinions and own them: "I think," "I'd rather," "I don't know," "this seems wrong to me." Hedging into impersonality to sound measured is the exact move that reads as AI.

Carve-outs, both narrow. Reference documentation and API docs stay neutral, because there genuinely is no actor. And a PR description narrating what its own diff does can lead with the verb ("gives `deploy-bot` assume-role"), since the author is unambiguous from the PR metadata. Everywhere else at work, including review comments, status updates, Slack, design docs, and email to the team, takes the first person. The carve-out is about actors that are already obvious, not permission to hedge: any sentence carrying a judgment, a doubt, or a decision names the person who holds it, PR descriptions included.

### X. Uniform rhythm and parataxis

Two opposite failures, both measurable, both tells.

Uniform sentence length: three consecutive sentences of roughly the same length reads as generated regardless of content. Mix a four-word sentence against a thirty-word one. This needs three sentences to apply at all, so it's silent on a two-line Slack message. Don't manufacture length variance in something too short to have rhythm.

Parataxis: a run of short declaratives with no connective tissue. "The build failed. The cache was stale. I cleared it." Reads like a poem, signals AI immediately. Connect them so the syntax shows how the ideas relate: "build failed because the cache was stale, cleared it."

Related structural tells: the same paragraph pattern repeated throughout (topic sentence, explanation, example, transition, repeat), parallel structure across every section, and more than five to seven bullets in a row. Vary it. Let some paragraphs be one sentence. Let some end without a transition.

Note the interaction with V: compression is not permission to produce parataxis. Compress by cutting words, then connect what remains with conjunctions and subordination, not by chopping into a stack of stubs.

### Y. Hedging seesaw and corporate pep talk

Hedging seesaw: presenting both sides at equal weight to avoid committing. "There are benefits to X, though Y also has merits, and the right choice depends on context." Pick a side, state it plainly, give a counterpoint one sentence at most. If you genuinely don't know, say "I don't know" and stop, which is a position and reads as human.

Corporate pep talk: cheerleading register with no experience behind it. "Empower," "elevate," "supercharge," "unlock the power of," "move the needle," "take it to the next level," "bridge the gap," "streamline your workflow." Also the closing-boosterism reflex, which is group N seen from a different angle. Write like someone who has actually done the work, including the parts that were annoying.

Also in this family: filler transitions used as connective tissue, "moreover," "furthermore," "additionally," "notably," "importantly," "interestingly," "indeed." Delete them. The relationship between two sentences should come from their content, and if it doesn't, the transition word is patching a structural problem.

### Z. Implementation described instead of outcome

The text lists what was built, in accurate technical terms, and never says what it produces or why anyone should care. Every noun is correct. The reader still cannot tell what they got. Compression does not fix this one, which is what separates it from V and W.

"Ingest glue for the staging bucket, flat-file index, no managed DB for a trial, single container deployment, matches the layout two other services already use" is the pattern. It is precise, dense, and honest, and it fails, because it answers "what did you assemble" when the reader asked "what can we do now that we could not do before."

The test, and it is a hard one to pass: **if this were shown to the person paying for the work, could they tell why it was worth paying for?** Not whether they would understand the jargon. Whether they could see the point. Apply it to every task title, milestone, status update, and PR description.

How to fix it:

- Lead with the end state, not the parts. "The package proxy is running and serving internal builds" rather than an inventory of the modules that make it run.
- Write titles as declarative end states, the thing being true when you are done: "config index deployed to the cluster with health checks" rather than "config index work."
- Name the capability, then the mechanism, and only if the mechanism matters to the reader. Implementation detail belongs in the body or in the diff.
- Cut the "follows the existing pattern" reassurance unless a reviewer specifically needs it. It is defensive completeness (see the GitHub section) and it reads as filler to anyone above the code.
- Never log something that happened as if it were work you did. "A teammate asked about pairing" is an event. "Paired with them on the registry auth patch" is work.

This pattern coexists with V (too many words) and is not the same failure. V is a long sentence carrying a small idea. Z is an accurate sentence carrying the wrong kind of idea, and it survives compression untouched: shortening a list of components just yields a shorter list of components. Fix Z first, because it changes what the sentence is about; then apply V to whatever survives.

Distinct from A (inflated significance) in the exact opposite direction. A dresses an ordinary fact in cosmic language. Z strips a genuinely valuable outcome down to plumbing. The fix for A is to deflate; the fix for Z is to state the value plainly, once, without adjectives.

## What NOT to flag

A clean human writer can hit several of these once without being AI. Don't treat as reliable in isolation:

- One em dash, one "however," one bolded term
- Formal vocabulary used correctly and specifically (not the cluster in group B)
- Curly quotes alone (most editors auto-curl)
- A single clipped sentence for emphasis
- Unsourced claims in casual writing: most human writing is unsourced too
- Complete, grammatical, one-point-per-paragraph writing **in long-form prose**: in essays, articles, and personal writing, correct grammar is not itself a tell, and if that register is the writer's real voice, keep it. This protection does **not** extend to work communication: see Work register below, where the polished complete-sentence default is the primary thing to strip. The thing pattern U flags is response *structure* (mirroring a question's enumeration point-by-point), never sentence quality in prose.

Look for **clusters**, not single hits. The user's own read on what counts as a cluster may differ from any published list; when in doubt, ask rather than defaulting to a canonical source.

## Add voice, don't just subtract tells

Half the job is removing patterns. The other half is having something behind the sentence:

- Real opinions, stated as opinions, including "I don't know" or mixed feelings
- Varied sentence length: short, then a longer one that takes its time
- Specific, hard-to-fabricate detail over rounded-off generality
- First person by default, dropped only where the actor is genuinely absent (reference documentation) or already obvious (a PR description narrating its own diff). See group W for both carve-outs, and Technical content below.
- Contractions, and the shorter word over the more precise one when the precision isn't doing work

## Work register

Applies to PR descriptions, code review comments, Slack, status updates, tickets, and internal email. The typical case is a message to a colleague in the course of work.

How to classify anything not on that list, in order:

1. Is it reference material with no human actor (API docs, specs, generated documentation)? Neutral register. Stop here.
2. Is it a message to a person, or a short artifact a colleague reads and acts on? Work register, however formal the subject. Stop here, regardless of length: a long ticket is still a ticket.
3. Is it long (roughly 800 words or more) and meant to be read as a piece of writing rather than as a message? Long-form. Keep the calibration in What NOT to flag: complete sentences, no forced informality. Groups V, W, and Z still apply in full, and What NOT to flag's protection of complete grammatical prose covers how sentences are put together only, never the amount of padding. See the paragraph below this list before applying it.
4. Still ambiguous? Ask which register the user wants rather than guessing. Getting this wrong is expensive in both directions.

Step 3 exempts a text from forced informality. It does not exempt it from groups V, W, and Z. Length is not evidence that the words are doing work: a 4000-word design doc can carry a 400-word idea, and the long-form classification is about how sentences are built and about register, never about the ratio of words to ideas. Run the V test (is the idea smaller than the word count?), the W test (who did this, and are they in the sentence?), and the Z test (could the person paying for this see why it was worth paying for?) on long-form text exactly as hard as on a Slack message. What changes at step 3 is that the compressed result keeps complete sentences and standard capitalization. What does not change is how much gets cut.

This is the loophole worth watching for, because it is the one that lets the original complaint back in. A padded status update classified as a message gets compressed. The same padding inside a long document can pass as "that register is just formal," and formal is precisely how the polished-but-empty writing reads.

The two axes are audience and length, and they come apart. A company blog post is work by purpose but long-form by nature, so it takes classification step 3 above. A long design doc is the same: work-register vocabulary and first person, but complete sentences rather than lowercase fragments, because nobody skims a 4000-word architecture doc the way they skim Slack. A README sits between reference and message; if it explains decisions and tradeoffs, it takes the first person, and if it only documents an interface, it goes neutral. External email to a customer or vendor is work register with the informality dialed back: contractions and first person yes, lowercase starts and fragments no.

The premise: a careful writer's natural work register is polished, complete, evenly hedged, and impersonal, and that register is now indistinguishable from model output. Grammatical polish is not the goal here. Sounding like a specific tired person typing between meetings is the goal. Bias hard toward informal and short. When a rewrite feels too blunt or too casual, it is probably right.

Compression removes words. It never adds specificity. This is the failure mode of everything above: rewriting toward how you'd say it out loud pulls hard toward concrete mechanism, and concrete mechanism is often exactly what the source didn't have. "the invalidation logic may be the source of the stale reads" compresses to "cache invalidation was the cause," not to "cache invalidation was dropping the wrong keys." The second is punchier, sounds more human, and asserts something nobody established. If the vague version is what you know, ship the vague version short (Process, step 3).

Write for a reader with no context. This is the rule that cuts hardest against the instinct to make a permanent record precise and technical. Task boards, milestones, and status updates get read by people who were not in the conversation, do not know the codebase, and are deciding whether the work was worth funding. Precision aimed at a peer reads as opacity to them, and opacity reads as either padding or as text nobody thought about. Assume the reader knows the goal and nothing about the implementation. Group Z is the pattern this produces when it goes wrong.

The floor: blunt is the target, curt is not. Cutting hedges and softeners is the job. Cutting so far that a reader hears hostility or dismissal is a different failure, and it is not fixed by adding the hedges back. It is fixed by keeping the sentence short and the tone neutral.

Defaults, which override the general guidance elsewhere in this skill:

- Fragments are fine. Sentences without subjects are fine. Lowercase sentence starts are fine where the team does that. This applies to messages, not to long documents reached by classification step 3 above, which keep complete sentences while still taking the first person and the compression.
- Contractions always. "don't," "can't," "it's," "I'd." Never "do not" or "cannot" unless the emphasis is real.
- First person, always, per group W. "I checked," "I'd rather," "I don't know."
- No parenthetical asides, per group O. If it carries a fact, promote it into the sentence as a clause; otherwise it's gone.
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

Two things the rewrite does besides cutting. It starts with the finding instead of announcing that a finding is coming. And it connects clauses with a colon and "since" rather than stacking three bare declaratives, because compression is not a license for parataxis (group X). "found the stale reads. cache invalidation was wrong. only tested the read path." would be shorter and worse: it loses the causal link and reads as generated in a different way.

## Technical content

Reference documentation, API docs, and published specs keep a neutral register: there is no actor to name, so group W's first-person rule doesn't apply. Everything else technical follows Work register above.

Even here, cut words, not content. Keep every fact, caveat, and detail the original covers. The target is the same information in fewer words.

## GitHub PR descriptions and review comments

A specific failure mode within technical content: unearned structure and defensive completeness, rather than flowery prose. None of the pattern groups above catch it, because the sentences themselves can be plain. What reads as AI-generated here is ceremony: headers a one-line change doesn't need, and a rundown of tests that don't apply that nobody asked about.

- **Size the description to the diff.** A one-line, self-explanatory change gets a one-line description. Headers ("Summary," "Testing," "Impact") are earned by a PR that actually spans multiple files or concerns and needs navigation, not a default template.
- **State what and why. Never how.** The diff is the how. If the description restates what the code already shows, cut it.
- **No inflated stakes on routine changes.** "grants the service account the permissions it needs" beats "a critical step in modernizing our access architecture." Say the plain thing.
- **Match the local register.** If the team's PRs run to fragments and lowercase starts, that's the norm, not a lapse. Don't upgrade a one-line change into a complete, formally punctuated paragraph out of reflex.
- **Label review-comment severity explicitly.** "Nit:" / "Optional:" / "FYI:" instead of diplomatic hedging that leaves the reader guessing whether something is blocking.
- **Say the one thing you concluded, not everything a review surfaced.** Your teammates can run the same automated review you can, so a comprehensive findings dump adds nothing they couldn't generate themselves, and it reads as generated precisely because it is what an automated tool produces. Value comes from judgment: which finding actually matters here, and what you think should happen. One considered comment beats eight correct ones. If you reviewed with a tool, that's fine, but what you post should be the conclusion you reached after reading it, in your words.
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

Note what the rewrite does beyond cutting. The parenthetical aside became a subordinate clause carrying the same fact ("so the new release pipeline can run"). Group O bans the parenthetical construction, not the information: the reason this grant exists is a fact a reviewer needs, so it gets promoted into the sentence rather than deleted. Had the aside been color rather than fact, it would be gone entirely. Two short clauses got connected instead of stacked, per group X. The first person is optional here and only here: a PR description whose subject is the diff itself can lead with the verb, since the author is unambiguous from the PR metadata. The moment the description carries a judgment ("I'd rather do X," "I'm not sure this covers Y"), group W applies in full and the "I" goes back in.

## Task boards and project trackers

Asana, Jira, Linear, and anything else leadership scrolls through. The failure here is not prose quality at all, so none of the pattern groups except Z will catch it. What gets flagged as AI-written on a task board is usually a title that describes implementation, a description dense with components, and a granularity that logs keystrokes rather than outcomes.

- **Titles are declarative end states.** The thing that is true when the task is done: "ingest trial is deployed and processing records," not "trial instance deployed" and not "work on ingest." A title that does not name its subject fails even when its description explains everything, because the board view shows titles.
- **One task per outcome, not per step.** A milestone-level task spanning a week and a half beats eight one-day tasks tracking the steps inside it. Use subtasks for your own checklist: they collapse out of the board view, so they give you granular progress tracking without turning the timeline into noise.
- **Set start dates, not just due dates.** A task with only an end date renders as a single day on a timeline, which misrepresents a week of work. Shift both ends as reality moves, including pulling the end date out when something takes longer. The board is a record of what happened, not a commitment you failed to hit.
- **Never log an event as a task.** "So-and-so asked about pairing" is something that happened to you. "Paired with so-and-so on the auth patch" is work you did. If you did not do it, it does not go on the board.
- **Descriptions answer why, not what.** The title says what. The description says what it enables and what it unblocks. A list of components (bucket, metadata store, single pod) belongs in the RFC or the PR, not here.
- **Apply the funding test from group Z to every title.** Could the person paying for this see why it was worth paying for?

Worked example, a data-ingest task:

Before, title and description:

> trial instance deployed
>
> Ingest glue for the staging bucket, flat-file index, no managed DB for a trial, single container deployment. Matches the layout two other services already use. Config only, no application source in this repo.

After:

> ingest trial is deployed and processing records
>
> Proves we can ingest one source end to end, so we can decide whether to extend it to the rest. Config only, no application source here. Single container, staging bucket, flat-file index instead of a managed DB, since it's a trial.

The title now names its subject and states an end state, and it is the same length as the one it replaces. The description leads with what the work proves and what it unblocks, then keeps the implementation choices in one clause at the end where a curious reader still finds them.

What the rewrite does not do is invent. "So we can decide whether to extend it" restates what a trial is for, not a roadmap claim about which source comes next: the original did not say, so neither does the rewrite. The only fact dropped is "matches the layout two other services already use," which is reviewer reassurance rather than a fact about the outcome, and belongs in the PR if anywhere. Everything else moves rather than disappears.

## Provenance

This skill started as a fork-in-spirit of [blader/humanizer](https://github.com/blader/humanizer) (MIT license), which is itself built on Wikipedia's "Signs of AI writing" guide (WikiProject AI Cleanup). Credit to Blader for the original taxonomy and the draft -> audit -> rewrite process this skill still follows. This is a from-scratch rewrite rather than a literal fork, kept independent on purpose: Andrew wants a list that reflects his own read of what sounds AI-generated, updated on his own schedule, rather than tracking someone else's repo.

Pattern groups E through K were added after close reading of specific pieces flagged as bad examples in conversation with Claude: a viral essay dense with rhetorical-hinge writing. Pattern groups R and S were added after reading a skilled human writer's advice newsletter whose polish leans hard on techniques that double as classic model tells: dense aphorism, mood-named section headers, one metaphor stretched across the whole piece. Pattern group T was added from a GitHub issue flagging a specific sentence that named its own importance rather than earning it. Pattern group U and the GitHub PR descriptions and review comments section were added after a colleague flagged Andrew's PR descriptions and review comments as reading AI-generated; close comparison against real team PRs on the same repo showed the tell wasn't prose-level at all, it was unearned section headers, defensive "here's what I didn't test and why" writeups nobody asked for, and, separately, a habit of answering multi-part questions by mirroring their enumeration point-by-point. Sources kept off the record intentionally; the patterns are what matter, not the byline.

Pattern groups V through Y, the Work register section, and the expanded vocabulary in group B were added after feedback that Andrew's writing read as AI-generated in cases where no model output was involved at all. The diagnosis: a natural technical register that's polished, complete, evenly hedged, and impersonal, which is now the model default. Groups X and Y, the extended group B vocabulary, and the plain-text formatting rules in group O draw on [jalaalrd/anti-ai-slop-writing](https://github.com/jalaalrd/anti-ai-slop-writing) (MIT), rewritten to fit this skill's cluster-based calibration rather than its hard banned-word framing. Groups V and W are not from that repo; they were named by Andrew as the two patterns that matter most, and they carry the highest priority in this skill. That change also inverted this skill's earlier stance protecting complete grammatical prose in work contexts, which is why What NOT to flag and group U now scope that protection to long-form writing only. The register-classification list in Work register came out of adversarial review of that change: the first draft defined scope by enumerating work formats and long-form formats, which left most real inputs (company blog posts, long design docs, READMEs, external email) unclassified and let the model pick a branch arbitrarily.

Group Z, the Task boards section, the "write for a reader with no context" rule, and the review-comment guidance about saying one thing rather than dumping findings all came from closer review of that feedback, which corrected the diagnosis. The actual complaint was "a lot of words but not a lot of substance," and the test given was whether the person paying for the work could see why it was worth paying for, which is a complaint about what the writing is about rather than how it is phrased. Compression and de-abstraction (groups V and W) are real fixes but they do not touch it: a shorter list of implementation components is still a list of implementation components. Most of the flagged examples were task titles and descriptions rather than prose, and the feedback explicitly said the direct conversational register was fine, which is why the fixes here are scoped to written records. Group S (emotional-arc section headers) was folded into H (self-narrating structure), which it already cross-referenced as the same tell, to free a letter for Z; the groups after it each moved back one letter accordingly, so the old U through Z are now T through Y.

Groups V, W, and Z carry a regression set in `tests/regression/`, added as a standing guardrail so they don't quietly lose priority to the easier-to-spot stylistic groups. Run it on any commit that touches a pattern group, the Process steps, Work register, or Task boards. The cases are judged by hand rather than diffed, and the set exists because these three groups trace to the actual complaint (a lot of words but not a lot of substance) while the stylistic groups are the ones a future edit will naturally optimize for, since they are easy to verify.

Note for future edits: `scripts/validate_skill.py` requires pattern-group headings to run A, B, C with no gaps, so Z is the last available letter and the taxonomy is now full. The intended path for a twenty-seventh pattern is to merge related groups rather than extend the scheme to AA: several groups already overlap heavily (H and S both cover self-narration, A and K both cover inflation, N and Z both cover boosterism), and consolidating them would free letters while making the list easier to apply. Extending the validator to AA/AB is the fallback if merging would lose a distinction worth keeping.

This file does not track upstream version changes. Andrew's own judgment on what reads as AI-generated is the source of truth here, not the Wikipedia list or any third-party repo; extend or edit pattern groups directly as new tells get spotted.

## Staying current

This pattern list keeps growing as new AI-writing tells get flagged. If it has been a while since you last pulled this skill, check <https://github.com/smartwatermelon/personify> for newer pattern groups worth picking up. This is a suggestion, not an auto-update: pull changes in manually and review them before relying on them.
