# Review gate boundary design

Date: 2026-09-22
Status: approved in conversation, pending written review

Partly superseded by `2026-09-28-gate-routing-rules-design.md`. That design
replaces this one's destination-based exempt list and its rule that pull
request descriptions are gated everywhere with an ordered routing table.

## The problem this solves

Personify 2.0 submits finished text to Pangram and stops on any verdict other
than `Human`. Applied to everything, that gate blocks constantly and teaches
nothing: text Claude drafted reads as machine-written because it is
machine-written, so the verdict is known before the call is made. The
measurement that matters was already taken. Andrew's own prose scores Human
1.0, and editing a Claude-assisted draft toward the detector moved the score
0.990, then 0.989, then 1.000.

The stated goal is not to defeat a detector. In Andrew's words: "I'm not trying
to fool anyone. I'm not trying to be perfect. I'm just wanting to have an
average reader look at it and not get the uncanny valley feeling."

So the gate needs a boundary. Some text is worth checking and some is not, and
the line has to be drawn somewhere an agent cannot move.

## Why a hook rather than a skill

A skill is advisory. An agent can fail to invoke it, invoke it on part of the
text, or invoke it and disregard what it returns. None of those are
hypothetical, and all of them produce the same outcome: unreviewed text
published under Andrew's name.

A hook fires whether or not the agent cooperates. That is the whole reason the
enforcement lives there.

The hook's check must not be another model evaluating model output. A subagent
asked whether its own text reads as machine-written is self-assessment wearing
a second context, and it will approve itself often enough to be useless. Every
check in this design is therefore external: a third-party API, or a
deterministic script. No inference at the gate.

## What decides: purpose, never visibility

Text is gated when Andrew cares what a reader thinks of it. That test does not
track whether the text is public.

Two cases settle it. A planning document in a public repository is world
readable and exists only for Andrew and Claude, so it is exempt. A
client-facing README in a private repository is read by a client under the
company's name, so it is gated. Visibility answers "can someone read this,"
and the real question is "does it matter what they think."

Ten of the thirty-three non-fork repositories across the three owned orgs are
private, so both sides of this distinction have real subjects. The earlier
count of zero private repositories was wrong: it came from a fine-grained PAT
that cannot see them.

## Who classifies

Not Claude. An exemption Claude asserts per artifact is an exemption Claude
can grant itself, which is the same forgery surface that `task_id` exists to
close. The judgment is softer than a forged token and the shape is identical.

The destination carries the classification, and Andrew declares what each
destination means in advance. Claude writes to a path or a surface; that
path's status was decided before the text existed. This is the mechanism
already used by `ARCHIVE_PREFIXES` in `scripts/validate_skill.py`, which has
been uncontroversial since it shipped.

## The three rules

In precedence order:

1. Text authored as `andrewmrich` is always gated. No exemption anywhere.
2. Text whose destination is on the exempt list is exempt.
3. Everything else is gated.

Rule 1 outranks rule 2, so an exempt-looking path inside an employer
repository is still gated.

Rule 1 keys on the authoring account rather than on ownership, because
ownership does not describe the professional surface. The `andrewmrich`
account owns one repository and it is a fork. That identity's real output is
pull requests, review comments and tickets on repositories the employer owns,
which no ownership check reaches.

Rule 3 is the fail-closed default. An unlisted destination is a gated one, so
a destination nobody has classified never falls through unchecked.

## The exempt list

Two kinds of entry, both declared by Andrew.

**Paths.** Matched against where a file is written. `docs/plans/` and
`docs/superpowers/` to start.

**Surfaces.** Keyed on repository identity together with artifact type,
because those come apart. An issue filed on an infrastructure repository is a
note to Andrew and Claude. A pull request description on that same repository
is read by a colleague.

Issues on named infrastructure repositories are exempt. Pull request
descriptions are gated everywhere, including Andrew's own repositories.

That asymmetry is deliberate. A colleague's reaction to Andrew's pull request
descriptions is the documented origin of this entire project.

## What a gated artifact does

1. Submit to Pangram once. There is no edit loop, because editing toward the
   detector was measured and does not converge.
2. A `Human` verdict writes a stamp and the publish proceeds.
3. Any other verdict shows Andrew the text and the verdict. He says ship, or
   he rewrites.

Expect `AI` on most text Claude drafts. That verdict is accurate rather than a
failure, and shipping anyway is a normal outcome: the pull request body for
PR1 scored AI 1.0 with the whole document flagged, and it shipped.

The approval carries the authority here, not the verdict. What the detector
supplies is the guarantee that Andrew is never unaware that a piece of text
reads as machine-written.

The override is a sentence in chat, not a review-gate round trip. A gate that
costs a BBEdit session for a routine pull request body is a gate that stops
getting used, and that failure is worse than the problem it was added to
solve.

## How this composes with the visual approval gate

A second gate already exists. `gh-wrapper.sh` and `hook-block-personify.sh`
refuse any PR body, issue body, comment or commit message whose exact bytes
Andrew has not approved in BBEdit through `gate-review.sh`. It asks whether
Andrew read these bytes. The Pangram gate asks whether the bytes read as
machine-written. Two questions, one surface.

Decided 2026-09-22, and the stated review bar ("zero unreviewed, by Pangram or
by me or both") is what makes it the right answer. Either reviewer suffices:

1. An exempt destination skips both gates.
2. A gated destination with a `Human` stamp on the exact bytes passes without
   visual approval.
3. A gated destination with an `AI` verdict falls through to the existing
   visual gate, and the block message says a verdict exists.
4. A gated destination where the check never ran falls through to the same
   visual gate, and the block message says the text is unreviewed. The two
   messages must differ, for the reason given under Cost.

This accepts the degenerate text weakness recorded below. Andrew's answer to
it: Pangram cannot detect human-written nonsense, but that is the
responsibility of the writer.

Still open: the override described above is a sentence in chat, and the
fallback here is a BBEdit round trip. A hook cannot hear chat, so the two
cannot both be literally true. Planning must say which one wins, or how a
chat override reaches the approval store.

Also open: commit messages go through the same approval store, but the exempt
list is keyed on repository plus artifact type, and a commit is not one of
the artifact types it names. Whether an exempt repository exempts its commit
messages is undecided.

## What this does not catch

Pangram cannot see structure. It will pass a ceremonial pull request
description whose sentences read as human, and the ceremony is what was
actually flagged: unearned section headers, defensive accounts of what was not
tested, implementation-shaped task titles.

A second layer covers that, and it is deliberately deferred to its own design
rather than folded in here. A deterministic text linter, no inference
involved, checking the rules that are already written down: no headers,
bullets, bolded labels or dashes in a pull request description, and a comment
to code ratio at or below 1:1. Each rule has a yes or no answer and traces to
existing text in `SKILL.md` or `VOICE.md`.

One requirement for that design, recorded here because it is easy to miss and
expensive to retrofit. The comment ratio counts anything a human reads as
explanatory prose, whether or not a parser calls it a comment. A bare triple
quoted string at statement position in Python is a string expression that the
interpreter evaluates and discards, so every tool that counts comment tokens
reports zero for it, while a human reviewer reads five lines of prose and
calls it over-commenting. The same trick appears as a heredoc in shell and as
`=begin` in Ruby.

The position of the same syntax changes the answer, which rules out both a
tokenizer and a regular expression. A triple quoted string as the first
statement of a module, class or function is a docstring, and `SKILL.md`
already exempts docstrings as reference material. The identical string
anywhere else at statement position is prose in disguise and counts. Assigned
or passed as an argument, it is data and does not. Distinguishing those needs
an abstract syntax tree walk, which is cheap and deterministic but makes the
linter per language rather than one pass over any file. Block comment forms in
Go, C, Java, JavaScript and SQL need the same treatment.

A third gap stays open and nothing automated closes it. Padding is a judgment:
the substance test asks whether the idea is smaller than the word count, and
the funding test asks whether the person paying could see why the work was
worth paying for. Neither is mechanical. Those stay with Andrew and `VOICE.md`.

So the coverage splits three ways. The linter catches structure, Pangram
catches machine-written prose, and substance is unautomated.

## Cost

Exempt text costs nothing: no API call and no blocker. Gated text costs about
$0.012 and one decision. Total spend to date across all measurement is roughly
$0.90.

The gate depends on a funded API key, so the key becomes infrastructure. A
missing key, a rejected key and an account out of credits must all fail
loudly, in the terminal, naming which of the three happened and what fixes it.

The client already separates these cases and exits 5 for each: no key found,
HTTP 401 or 403 for a rejected key, HTTP 402 for exhausted credits, which is
deliberately excluded from retry because an account out of credits stays out
of credits. What is missing is the loudness. The message goes to stderr and to
stdout as JSON, and a hook is exactly the context where nobody reads either.

The key moves to the macOS login keychain, read with `security
find-generic-password`. Measured on 2026-09-22: a write and a read both
succeed with no prompt and no controlling terminal, so a hook reaches it as
easily as a shell does. That makes it a better fit than 1Password for this one
secret, which is read on a hot path by non-interactive callers.

The same measurement undercut a premise the current client is built on. Its
documentation states that `op read` needs a TTY, and that this is why the key
file fallback is mandatory rather than a convenience. With stdin closed and no
controlling terminal, `op read` returned the secret normally. Whatever breaks
under launchd is therefore not TTY absence, and planning should establish what
it actually is instead of inheriting the stated reason. The resolution order
itself is unaffected: an explicitly exported key still wins as a deliberate
override.

A distinction the gate must preserve, because collapsing it defeats the whole
design. An `AI` verdict and an `UNAVAILABLE` result both fail closed, and they
mean opposite things. `AI` means the check ran and returned a real answer, so
Andrew's override is a decision made with information. `UNAVAILABLE` means the
check never ran, so overriding it publishes genuinely unreviewed text, which
is the single outcome the stated bar rules out. The two must not present
identically at the gate, or the second quietly becomes the first.

## Known weaknesses

The override is only as good as the reading behind it. Saying ship without
reading makes the gate theater, and nothing in this design prevents that.

A `Human` verdict is not evidence that text is fit to publish. It is evidence
that the detector did not recognize a model behind it, and those are different
claims. Measured on 2026-09-22: the string "word" repeated 60 times returns
`Human` with `fraction_human` 1.0 and writes a stamp, as do 50 repetitions of
"asdf" and a 60 word lorem ipsum. All three clear the 40 word floor, which
guards against text too short to classify and not against text too degenerate
to classify. Under this design that stamp authorizes a publish.

The practical risk is small, since no real artifact looks like that. It
matters because it locates the assumption the gate rests on. The detector
answers one narrow question, and the design must not read its answer as a
broader endorsement than it is.

The missing key path is hard to exercise interactively, which is its own
problem. Secret resolution falls through to `op read`, and `op read` succeeds
whenever a TTY is present, so clearing `PANGRAM_API_KEY` and pointing at an
empty configuration directory does not simulate a missing key in a terminal
session. The failure that most needs to be loud is the one least reachable
from the place a person would test it. Planning needs a way to exercise it
that does not depend on removing the developer's own credentials.

How the hook attaches to each publish surface (`gh pr create`, `git commit`,
Slack) has not been investigated, and must be settled during planning rather
than assumed.

The authoring identity is knowable, which an earlier draft of this section
denied. Measured 2026-09-22 on both this machine and `arich-mac.local`:
`~/.config/git/config` carries `includeIf "gitdir:~/Developer/beacon-biosignals/"`
pointing at `~/.gitconfig-beacon`, which sets the employer email, and
`gh-wrapper.sh` already routes `beacon-biosignals` and `andrewmrich` owners to
the `andrewmrich` account in `_gh_wrapper_sync_identity`. The earlier check
read `~/.gitconfig` only and missed it. On this machine the mechanism is
present but has nothing to act on: no employer checkout directory, no
`~/.gitconfig-beacon`, and no `andrewmrich` login. Rule 1 is inert here
because there is no employer work here, not because no identity exists.
