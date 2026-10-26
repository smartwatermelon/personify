# Regression set

Two fixed cases covering the structural rules no prose score can enforce. Both exercise a
universal surface rule rather than a prose quality: `ceremonial-pr-description`
and `over-commented-code`.

These are the cases that survive 2.0, and the reason is the detector's blind
spot. A detector scores how prose reads. Take a pull request description
with ceremonial headers, bolded labels, and a merge-readiness sign-off. A
detector passes it if the sentences themselves read human. Structure is
invisible to it. A rule nothing measures is a rule that quietly stops firing, so
these two get pinned down here.

Both rules are also the only ones a personal `VOICE.md` cannot override, so each
case must be run twice, once with a voice guide loaded and once without. The
format checks must pass identically both times. A future edit that restores the
general "the voice guide wins" precedence is the regression they exist to catch,
and it is invisible in a run with no voice guide.

The two bloated-prose cases from 1.x were deleted along with the taxonomy they
asserted against. They checked lettered pattern groups by name, and those groups
no longer exist.

## What each case records

Every case is a directory with four files:

| File | What it holds |
|------|---------------|
| `input.md` | The bloated original. |
| `expected-arm-a.md` | What a correct personify pass should produce. Not a string to diff against: a target to judge against, since there are many correct rewrites. The `arm-a` in the name is a leftover from the 1.x two-arm harness and means nothing now. |
| `checks.md` | The specific assertions that must hold, written so a human or a model can check them one at a time. |
| `notes.md` | What the case exercises and what a regression would look like. |

## Capture the actual output, always

Record what a run actually produced, not just the input and the expectation. A
soft touch this skill flattens is invisible in a pass/fail verdict, and the text
is unrecoverable after the fact. Cheap to capture now, impossible later.

Save outputs as `actual-<YYYY-MM-DD>-personify.md` inside the case directory.
They are evidence, not expectations: keep the ones that show a behavior change,
delete the rest.

## Running the set

There is no runner, on purpose. The thing being checked is a model's judgment
about structure and substance, which no assertion library evaluates. Run each
case by hand, or by dispatching a subagent per case:

1. Run `input.md` through the current `SKILL.md`.
2. Save the result as `actual-<date>-personify.md`.
3. Walk `checks.md` and mark each assertion pass or fail.
4. A failed check is either a regression to fix or an intentional change, in
   which case update `expected-arm-a.md` and `checks.md` in the same commit that
   changes `SKILL.md`, and say why in the commit message.

Scoring how these outputs read is not the test and does not replace it. A
rewrite can read as human and still carry a header.

## When to run it

Any commit touching the GitHub PR descriptions section, the Code comments
section, `rules/structure.md`, or Step 0's voice-guide precedence.
