# V/W/Z regression set

A small fixed set of bloated inputs that any edit to `SKILL.md` gets checked
against, so groups V (too many words), W (impersonal framing), and Z
(implementation instead of outcome) don't quietly lose priority to the
easier-to-spot stylistic groups. Filed as a standing guardrail in
smartwatermelon/personify#49.

Why these three groups get a regression set and the others don't: they are the
ones that trace to the actual complaint this skill exists to fix. The
Provenance section records it as "a lot of words but not a lot of substance,"
which is a complaint about the ratio of words to ideas and about what the
writing is about, not about em dashes or rule-of-three. Stylistic tells are
easy to spot and easy to verify, so they are the ones a future edit will
naturally optimize for. These are not, so they get pinned down here.

## What each case records

Every case is a directory with four files:

| File | What it holds |
|------|---------------|
| `input.md` | The bloated original. |
| `expected.md` | What a correct personify pass should produce. Not a string to diff against: a target to judge against, since there are many correct rewrites. |
| `checks.md` | The specific assertions that must hold, written so a human or a model can check them one at a time. |
| `notes.md` | Which groups the case exercises and what a regression would look like. |

## Capture the intermediate, always

When a case is run through the full chain, record the **post-personify,
pre-dumbify** text, not just the input and the final output. Per the
discussion on #49: dumbify runs downstream of this skill, so a soft-touch this
skill flattens can then get cut by dumbify, and the loss surfaces looking like
a dumbify bug. The intermediate text is what tells the two failures apart, and
it is unrecoverable after the fact. Cheap to capture now, impossible later.

Save intermediates as `actual-<YYYY-MM-DD>-personify.md` inside the case
directory. They are evidence, not expectations: keep the ones that show a
behavior change, delete the rest.

## Running the set

There is no runner, on purpose. The thing being checked is a model's judgment
about register and substance, which no assertion library evaluates. Run each
case by hand, or by dispatching a subagent per case:

1. Run `input.md` through the current `SKILL.md`.
2. Save the result as `actual-<date>-personify.md`.
3. Walk `checks.md` and mark each assertion pass or fail.
4. A failed check is either a regression to fix or an intentional change, in
   which case update `expected.md` and `checks.md` in the same commit that
   changes `SKILL.md`, and say why in the commit message.

## When to run it

Any commit touching a pattern group, the Process steps, the Work register
section, or the Task boards section. Especially any commit that adds or
re-letters a pattern group, since that is when priority quietly shifts.
