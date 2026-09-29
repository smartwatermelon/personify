---
name: personify
version: 2.0.4
description: Draft in your own register, then check the result against a detector before sending, publishing, or shipping it. Use when editing text (emails, docs, comments, PRs, blog drafts, essays) someone else will read. Reads an optional per-user voice guide (VOICE.md) and treats it as authoritative, so output sounds like a specific person rather than generically clean. Submits the result to Pangram and stops when the verdict is not Human, rather than editing toward a score. Also carries the structural rules for GitHub PR descriptions and code comments, which no detector can see. Derivative of blader/humanizer (MIT); see license field.
license: MIT (derivative of blader/humanizer; see Provenance)
---

# Personify

Write text that does not read as machine-written, then verify that claim against
a detector instead of asserting it.

This is the 2.0 break, and it is a large one. Version 1.x carried a lettered
taxonomy of AI-writing tells, an A/B harness that ran two rule sets against every
text, a blind reviewer, and an evidence corpus. All of it is gone. What replaces
it: draft in the writer's own register guided by their voice guide, apply current
model judgment about what reads as machine-written, then submit the result to
Pangram's detector. A Human verdict passes. Anything else stops and reports.

Two failure modes to avoid equally: leaving AI tells in, and over-correcting into
generic dryness that has no writer behind it.

One consequence, stated up front because it will surprise a caller. A draft
written by a model and edited by a model still reads as model-written, and the
detector says so. Most Claude-drafted artifacts fail this check. That is the
expected result, not a malfunction.

## Step 0: Load the voice guide first

Before applying anything below, you MUST actually check disk for the voice guide with a real tool call (Read, or `ls` via Bash). Do not infer its presence or absence from conversation context, memory, or a prior turn. Check these locations in order and use the first that exists:

1. The path in the `PERSONIFY_VOICE` environment variable, if set.
2. `VOICE.md` under the user's config directory: `$XDG_CONFIG_HOME/personify/VOICE.md`, or `~/.config/personify/VOICE.md` when `XDG_CONFIG_HOME` is unset.
3. `VOICE.md` in this skill's own directory (repo-local development only).

Read only the first hit; do not merge two guides. If a guide exists at both 2 and 3, the config copy wins and the skill-directory copy is dead weight that will drift. Tell the user, naming both paths and suggesting a symlink, since silent staleness is the usual outcome: edits land in the repo copy while this skill keeps loading the config one.

Never state that a voice guide is "missing," "not configured," or "not found" without having just run a tool call against that exact path in this turn. If you have not made that call yet, make it before saying anything about voice-guide status.

If a voice guide is found, read it fully and treat it as authoritative. It describes one specific person's writing. Where it conflicts with any rule in this skill, the voice guide wins. The voice guide is more load-bearing in 2.0, not less: with the taxonomy gone, it is the main thing that makes output sound like a person rather than like clean anonymous prose.

Two exceptions, and only these two: the GitHub PR descriptions section and the Code comments section are universal rules about the structure of an artifact, not preferences about how a person writes. The voice guide does not override either one. It still sets word choice, rhythm, and bluntness inside those artifacts; it never restores a header, a bullet, a bolded label, a dash, or a comment the code already explains. A voice guide that tries to is stale and should be edited, since a structural rule for a surface is not a voice.

If no voice guide is found, read `VOICE.example.md` (in this skill's directory) for what one looks like and how to build it. Without a voice guide this skill makes text non-robotic but not distinctive: clean, competent, anonymous. Proceed with the general rules and say so, so the user knows a voice guide is what turns "not obviously AI" into "sounds like them."

The voice guide is personal and never committed (git-ignored, like `.env`). It lives at a stable path outside the plugin install on purpose: the plugin installs into a version-pinned directory that is replaced on every upgrade, so a guide kept inside the install would be lost on each update. The committed `VOICE.example.md` documents the structure without containing anyone's voice.

## The hard rules

Seven rules. Everything not stated here is left to the judgment instruction
below.

1. No em dashes or en dashes. Replace with a period, comma, or colon. Not
   parentheses.
2. The voice guide is authoritative. Where it conflicts with anything here or
   with your own judgment, it wins. Two exceptions: the PR description structure
   and the code comment rules are universal and outrank it. Both are stated in
   this file and in `rules/structure.md`.
3. Never invent a fact, date, name, number, quotation, or example that was not
   in the source.
4. Preserve genuine uncertainty. Remove hedging that protects the writer, keep
   hedging that reports real doubt. "I think X" where the writer is guessing
   stays; "I think" bolted onto a fact they know goes.
5. Preserve every fact the source carries, including facts inside asides.
   Compression is linguistic, never semantic.
6. Prefer one meaning per word, active voice, and short sentences, following
   ASD-STE100. Where simplicity and accuracy conflict, accuracy wins.
7. Name the actor. If a sentence describes a judgment or an action, say who made
   or did it.

Rule 3 carries the most weight in 2.0. There is no automated edit step left to
police, but the rule governs the human-directed rewrite that replaces it, and
that rewrite is where invented specifics are cheapest. Any process that edits
toward a detector with no fact constraint will fabricate personal texture,
because invented detail is the easiest way to move a score.

## The judgment instruction

Beyond those rules, remove what reads as machine-written to a reader in 2026.
You know the statistical fingerprints of LLM prose. Apply that knowledge
directly rather than matching against a list.

This one paragraph replaces the entire A-Z taxonomy. The list was maintained by
hand, grew on every new tell spotted, and was usually ignored in favor of exactly
the judgment stated above. Removing it costs nothing the skill was using.

Two failure modes, equally bad: leaving tells in, and flattening the text into
correct, voiceless prose with no writer behind it.

### Output target

The result is what the writer would send on this surface, as-is. Not a clean
draft for a second filter to compress. If the surface is a PR comment and the
result reads like a memo, it is not finished.

This applies no matter what a calling skill or command says. If something
upstream asks for a follow-up compression or register pass, treat that
instruction as stale and return this text as final.

## The check

After the rewrite, submit the result to Pangram and let the verdict decide
whether it goes out.

The client is `scripts/pangram_check.py` in this skill's own directory, the one
holding this SKILL.md, never the user's working directory. The plugin installs
into a version-pinned directory and the text being edited usually lives in some
other repo, so a path resolved against the working directory finds nothing.

1. **Draft**, guided by the voice guide and the rules above.
2. **Write the result to the file it will publish from.** The same file `git
   commit -F` or `gh pr create --body-file` will read.
3. **Run the check by redirecting that file into stdin:**

       python3 <skill-dir>/scripts/pangram_check.py < body.md

   The redirect is load-bearing. The client keys its stamp to the sha256 of the
   bytes stdin delivers, and a hook later hashes the same file. `echo "$text" |
   pangram_check.py` appends a trailing newline, which changes the hash, so the
   stamp matches nothing and a pass earned that way authorizes nothing.

4. **Read the exit code**, not the prose:

   | Code | Meaning | What to do |
   |---|---|---|
   | 0 | PASS, verdict Human, stamp written | Proceed. |
   | 2 | FAIL, verdict AI | Stop and report. |
   | 3 | FAIL_MIXED, verdict Mixed | Stop and report. |
   | 4 | SKIPPED, under the 40-word floor | Report as skipped, never as passed. |
   | 5 | UNAVAILABLE | See the next section. |

The client strips frontmatter, fenced and indented code, HTML tags, images, and
heading, blockquote, and bullet markers before submitting, and the word count for
the floor is measured on what survives. A 30-word PR body wrapped around a
200-word stack trace skips rather than classifying the trace. Nothing stripped is
reinserted, because the client never edits: the original bytes are what
publishes.

Every run that reaches a result, pass, fail, or skip, writes a check record to
`~/.config/personify/checks/<sha256>.json`. The review gate's `stage` step
refuses a file that has no record, so the check must run on the exact bytes
being staged before anyone is asked to approve them, and the batch header shows
each item's result while the reviewer reads. The gate enforces that the check
ran, not what it said: a failing verdict still reaches the reviewer, as a
reason to act. On a pass the client also writes a stamp to
`~/.config/personify/stamps/<sha256>.json` carrying the task id, the model, the
verdict, and the word count, and the Desktop bridge decides from that stamp. A
run that fails before a verdict writes neither, so the file cannot be staged
until a check succeeds.

Report the word count and the estimated cost from the JSON on stdout. At the
production model this is five cents per started hundred words, so a 400-word
text costs about twenty cents, and printing it makes an accidental expensive
run visible immediately.

**The model is Pangram 4, pinned by name as `pangram-4`, and the client sends
it without being asked.** The `default` alias is not used: it pointed at
Pangram 3.3.2 until that model retired on 2026-09-30, then at Pangram 4 at ten
times the per-word price for long texts, so the bill would have changed with
the date. `PANGRAM_MODEL` overrides the pin; a model other than `pangram-4`
reports no cost estimate, because its price is not known here.

### There is no edit loop, and do not add one

**Exactly one submission per artifact.** Never auto-edit after a failing verdict
and never resubmit edited text expecting a different answer. A retry happens only
on a transport error, never on a result.

This was measured rather than assumed, and the measurement is the reason the rule
exists. One Claude-assisted post was edited twice toward the voice guide with
every fact preserved. The score went 0.990, then 0.989, then 1.000: the second
rewrite scored worse than the original. Across all three rounds the humanizer
score stayed near zero, between 0.007 and 0.016, which means the text was never
caught as adversarially humanized. It simply still read as AI-written, because it
was.

So a non-Human verdict is not an instruction to edit harder. After one, stop and
report the verdict. Do not rewrite and resubmit on your own, even from scratch: a
fresh draft of the same content is the same artifact, and submitting it again is
the loop this section rules out. Two paths follow, and both belong to the human
rather than to the agent:

- **Rewrite from the source material**, not from the draft. Go back to the facts
  and write the artifact again.
- **Route to manual review**, which is where an unresolved verdict belongs.

The instinct to add a loop back is strong, and every version of it has been
tried. Editing does not move the verdict.

## When the check is unavailable

Exit code 5 covers every case where no verdict exists: no API key resolved, a
transport failure, a rejected key, an account out of credits, or a task that
came back failed. Exit code 4 covers text under the 40-word floor.

**Fail closed in every one of them.** Route the text to manual review and say
which case fired. The JSON on stdout names it.

**Never report a skip or an outage as a pass.** Below 40 words the detector
produces false passes in the dangerous direction: a measured sample of AI-written
prose at 15 words came back Human at 1.0. That is why the floor is double the
measured boundary. A short text is routed by the surface's own rules and never
stamped as verified.

The client resolves its key from `PANGRAM_API_KEY`, then the macOS login
Keychain item `personify-pangram-key`, then `~/.config/personify/pangram-key`
at mode 600, then `op read`. An explicitly exported key wins as a deliberate
override. The Keychain and the file have to exist as sources because a
headless caller gets neither an environment nor a TTY.

When no key resolves, say so plainly and give the install command, which
copies the key from 1Password into the Keychain once, from a terminal:

```bash
python3 <skill dir>/scripts/pangram_check.py --install-key
```

`--check-key` reports whether a key resolves, without a network call.

## What NOT to flag

The job is removing what reads as machine-written, not sanding every text down to
the same surface. A clean human writer hits any of these without being a model:

- One em dash, one "however," one bolded term
- Formal vocabulary used correctly and specifically
- Curly quotes alone, since most editors auto-curl them
- A single clipped sentence for emphasis
- Unsourced claims in casual writing, because most human writing is unsourced
- Complete, grammatical, one-point-per-paragraph writing **in long-form prose**.
  In essays, articles, and personal writing, correct grammar is not a tell, and
  where that register is the writer's real voice, keep it.

The failure this section guards against is flattening legitimate human writing:
treating a single hit as proof and sanding off something that was working. It is
the second of the two failure modes named at the top of this file, and it counts
equally against the result.

Where the writer's own read differs from anything here, the writer wins. Ask
rather than defaulting to a published list.

## Add voice, don't just subtract tells

Half the job is removing patterns. The other half is having something behind the
sentence:

- Real opinions, stated as opinions, including "I don't know" or mixed feelings
- Varied sentence length: short, then a longer one that takes its time
- Specific, hard-to-fabricate detail over rounded-off generality
- First person by default, dropped only where the actor is genuinely absent
  (reference documentation) or already obvious (a PR description narrating its
  own diff)
- Contractions, and the shorter word over the more precise one when the precision
  is not doing work

This is the half a detector cannot help with. Pangram tells you the prose reads
machine-written; it does not tell you the writer is missing.

## Technical content

Reference documentation, API docs, and published specs keep a neutral register:
there is no actor to name, so rule 7 and the first-person default above do not apply.

Everything else technical follows the voice guide. Even in neutral register, cut
words rather than content: keep every fact, caveat, and detail the original
carries, in fewer words.

## GitHub PR descriptions

A pull request description has a defined structure. It is not a conversation, a
presentation, or a talk. The reader is a competent code reviewer who is about to
read the diff, so the description exists to tell them what they cannot get from
the diff: what was wrong, and what this does about it.

This section is a universal rule, not a voice preference. It applies to every
writer on every repo, and it outranks the voice guide. A `VOICE.md` never
reopens a header, a bullet, a bolded label, or a dash on this surface. Step 0's
"the voice guide wins" and hard rule 2 both carve this section out by name. The
voice guide still sets word choice, sentence rhythm, and how blunt the sentences
are; it does not set the structure.

**The detector cannot see any of this.** Pangram scores how the prose reads, so
it will pass a description carrying ceremonial headers and a merge-readiness
sign-off as long as the sentences read human. Structure is enforced here or
nowhere. `rules/structure.md` carries the same rules in compact form for a caller
that needs them without the rest of this file.

**Hard format.** No headers. No bold. No bullets. No numbered lists. No em
dashes or en dashes. Plain paragraphs only. This overrides any general
preference for using a list when the content is a list: on this surface there
are no lists.

**Four parts, in this order, as plain prose:**

1. The problem, stated plainly: when I do X, I get Y. I should get Z.
2. The evidence, only when it is not already obvious from context. Show it or
   link it.
3. The solution, in a brief sum-up that assumes the reader will read the code.
4. References, only when something had to be consulted that is not obvious and
   not already part of the codebase.

Do not number or label the parts in the output. They are the order the prose
runs in, not a template to fill. Parts 2 and 4 get skipped when they do not
apply, and skipping them is the normal case. A one-line change gets one line:
the problem and the fix in a sentence.

Two rules that survive from the general technical guidance. Never say how: the
diff is the how, so a description that restates what the code already shows gets
cut. And no inflated stakes on a routine change: "grants the service account the
permissions it needs" beats "a critical step in modernizing our access
architecture."

Three things that look like facts and are not, and all three get cut whatever
the source says. A passing test suite: CI reports it, so "the full suite passes
locally" carries nothing. A check that was not run: "I didn't test against
staging," "no integration tests apply here," "no plan/apply run." A cosmetic
part of the diff: a formatting cleanup, a rename, an import reorder, which the
reviewer sees in the diff and did not need announced. Part 3 covers what the
change does, not an inventory of the diff and not a pre-emptive defense of it.
If a reviewer wants to know whether you tested something, they will ask, and
answering then is cheap. The exception is a real caveat a reader acts on: "this
is untested against Postgres 14, which is what staging runs" names a risk, where
"I didn't test against staging" only names an absence.

Exact output stays exact. Terminal output, error messages, and diffs go in a
code block verbatim, never paraphrased. A code block is not formatting ceremony
and the no-headers rule does not touch it. Part 2 is usually where it lands.
Verbatim also means the Code comments section below does not reach inside it: a
snippet quoted in a description is evidence, not comments being edited.

**Never invent the problem statement.** Part 1 is the part a padded description
most often lacks, and it is the one part that cannot be derived from the diff or
from the rest of the text. If the source does not carry it, say so and ask, per
hard rule 3. An agent calling this skill while opening a PR has the branch, the
diff, and the issue, so it should supply the problem statement in the input
rather than leave the skill to guess at one.

Worked example, a small IAM permissions change:

Before (unearned headers, a rundown of checks nobody asked for, no problem
statement):

> ## Security-critical access delta
>
> This grants the `deploy-bot` service account `sts:AssumeRole` on the `ci-release` role and adds it to that role's trust policy. This is a narrow, existing-role grant to a single named principal, not a new role or broadened trust.
>
> ## Validation
>
> No `modules/iam_role` changes, so no test suite applies. No policy coverage applies to this path, so no targeted policy-check run. Reviewed the diff directly; no plan/apply run, per repo guardrails.
>
> This PR is ready to merge upon approval.

The source never says what was broken, so the rewrite cannot state it. Asking
for it is the correct move, and the answer here was that the release pipeline
fails at the assume-role step.

After:

> When the release pipeline runs, it fails at the assume-role step. It should be able to assume `ci-release`.
>
> ```
> AccessDenied: User: arn:aws:sts::...:assumed-role/deploy-bot is not authorized to perform: sts:AssumeRole on resource: arn:aws:iam::...:role/ci-release
> ```
>
> Gives `deploy-bot` assume-role on `ci-release` and adds it to that role's trust policy. Existing role, one named principal. Nothing manual after merge.

Every fact in the original survives. What is cut: both headers, the enumeration
of checks that do not apply, and the merge-readiness sign-off. What is added is
the problem statement and the error it produces, which came from asking rather
than from guessing. The parenthetical aside became a clause carrying the same
fact, since the construction is what goes and not the information. Two short
clauses got connected rather than stacked, because compression is not a license
for a row of bare declaratives.

The first person is optional here and only here: a description whose subject is
the diff itself can lead with the verb, since the PR metadata names the author.
The moment it carries a judgment ("I'd rather do X," "I'm not sure this covers
Y"), hard rule 7 applies in full and the "I" goes back in.

## Code comments

Also a universal rule that outranks the voice guide, on the same terms as the PR
description section above, and equally invisible to the detector.

The ratio of comment lines to code lines is never more than 1:1, and should be
far lower. At most one comment per logical block, and only where an informed
reading of the code by a competent reviewer would not already tell them. No
explanations, no conversation, no links, and no "because X and Y, then Z, and
also, and also."

One comment means one, not one physical line: a comment that wraps to a second
line to stay inside the line limit is still one comment. What the rule forbids
is a second comment on the same block and a comment that runs to a paragraph.
If one comment needs three lines to say its thing, the thing is probably two
facts, and one of them is likely already in the code.

What a comment is for is the thing the code cannot say: why this way rather than
the obvious way, a constraint that is not visible locally, a workaround and what
it works around. A comment that narrates the line under it is the tell. So is a
comment that argues with the reader.

Before:

    # Increment the retry counter by one so that we can keep track of how many
    # times we have attempted this request. This is important because we need
    # to avoid retrying forever, and also because the backoff calculation
    # below depends on this value being accurate.
    retries += 1
    # Calculate the backoff delay using exponential backoff
    delay = base * (2 ** retries)

After:

    retries += 1
    delay = base * (2 ** retries)

Both comments went because the code says it. Six comment lines against two code
lines also fails the ratio on its own. Had the base been an odd number chosen to
dodge a thundering-herd problem, that would be the one line worth keeping, since
no reading of the code recovers it.

Docstrings and generated API documentation are not code comments for this rule.
They are reference material and take the neutral register under Technical
content above. The 1:1 ratio does not apply to them.

## Provenance

This skill started as a fork-in-spirit of [blader/humanizer](https://github.com/blader/humanizer) (MIT license), which is itself built on Wikipedia's "Signs of AI writing" guide (WikiProject AI Cleanup). Credit to Blader for the original taxonomy and the draft, audit, rewrite process this skill grew out of. It was a from-scratch rewrite rather than a literal fork, and was never synced against that project's releases.

Version 1.x built on that start: a hand-maintained lettered taxonomy of 22 groups lettered across the range A to Z, with retired letters left as gaps, a two-arm harness that ran the taxonomy against unaided model judgment on every text, a blind reviewer that picked a winner, and an evidence corpus feeding a consolidation command that proposed rule changes. The taxonomy grew every time a new tell got spotted.

**2.0 deletes all of it.** The reason is that the growth stopped paying for itself. The rules were usually ignored in favor of the judgment instruction that sat beside them, and maintaining the list was work that did not improve output. The replacement thesis: stop encoding what AI writing looks like and measure it instead, letting an external classifier hold the line the rule list was trying to hold.

Three measurements made that switch defensible, all taken 2026-09-21 against Pangram:

Nine posts from one writer split correctly. Every pre-2024 post scored Human at 1.0 and every 2026 post scored AI at 1.0, and the author confirmed the 2026 posts were the model-assisted ones. That retired the standing worry that a genuinely distinctive human register would be flagged as machine-written: the detector was not flagging how he writes.

Editing toward the detector does not converge. Two rounds of rewriting a model-assisted post moved the score 0.990, then 0.989, then 1.000, so the second rewrite scored worse than the first. The humanizer score stayed near zero throughout, meaning the failure was not adversarial: the text still read as AI-written because it was. That killed the edit loop the original design assumed.

The detector is unreliable below 20 words and produces false passes there, so the floor sits at 40, double the measured boundary.

The two surface sections that survive, GitHub PR descriptions and Code comments, came from Andrew on 2026-09-17 as a specification rather than as a diagnosis of flagged writing. Both are universal rules and both outrank the voice guide, which is otherwise authoritative here. They survive 2.0 for a reason the rest of the taxonomy did not: they are structural, and a detector that scores prose cannot see structure at all. It will pass a ceremonial PR description whose sentences read human. `rules/structure.md` carries them in compact form.

The register-specific content that 1.x kept here (work register, task boards, PR review comments) belongs in the voice guide instead, where content rules about what a message should say belong. That move is a separate edit to a personal, gitignored file and is not part of this change. Those rules were never detector-judgeable either, but they are personal rather than universal, which is the difference.

This file does not track upstream version changes. The writer's own judgment about what reads as machine-written is the source of truth, checked against the detector rather than against any published list.
