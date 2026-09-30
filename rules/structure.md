# Structural rules

Two surfaces have a defined shape rather than a preferred voice: a GitHub pull
request description, and a block of code comments. Both rules are universal.
They apply to every writer on every repo, and they outrank the voice guide.

**These rules exist because a detector cannot see them.** Pangram scores how
machine-written prose reads. It will pass a PR description carrying ceremonial
headers, bolded labels, and a "ready to merge upon approval" sign-off, as long
as the sentences themselves read human. Structure is invisible to it, so
structure is enforced here instead.

`SKILL.md` is canonical for both rules and carries the worked examples. This
file is the compact statement of the same rules, for a caller that needs them
without the rest of the skill.

## Length caps

One unit is 140 characters. Caps: commit title 50 (prefix counts) and body 140;
PR title 70 and body 280; issue title 70 and body not enforced; line comment on
a PR 280; PR comment, review body and issue comment 140; code comment 140 per
contiguous run of comment lines; docstring 280.

Fenced code blocks, docstring `>>>` examples and trailers (`Co-authored-by:`,
`Closes #N`) do not count. Whitespace runs collapse to one space. Check with
`python3 scripts/length_check.py --kind <kind> < file` (`commit`, `pr`,
`issue`, `line-comment`, `pr-comment`, `code-comment`, `docstring`). On exit 1,
rewrite shorter and run it again: a length count is deterministic, so this loop
converges.

## GitHub PR descriptions

The reader is a competent code reviewer who is about to read the diff. The
description tells them what the diff cannot: what was wrong, and what this does
about it.

**Hard format.** No headers. No bold. No bullets. No numbered lists. No em
dashes or en dashes. Plain paragraphs only.

**Four parts, in this order, as plain prose:**

1. The problem, stated plainly: when I do X, I get Y. I should get Z.
2. The evidence, only when it is not already obvious from context.
3. The solution, in a brief sum-up that assumes the reader will read the code.
4. References, only when something not obvious had to be consulted.

Do not number or label the parts in the output. Parts 2 and 4 get skipped when
they do not apply, which is the normal case.

Never say how: the diff is the how. No inflated stakes on a routine change.

Three things that look like facts and are not, and all three get cut: a passing
test suite, a check that was not run, and a cosmetic part of the diff. A real
caveat a reader acts on is different and stays.

Exact output stays exact. Terminal output, error messages, and diffs go in a
code block verbatim. A code block is not formatting ceremony.

**Never invent the problem statement.** If the source does not carry it, say so
and ask.

## Code comments

The ratio of comment lines to code lines is never more than 1:1, and should be
far lower. At most one comment per logical block, and only where a competent
reader of the code would not already know it.

One comment means one, not one physical line. A comment that wraps to a second
line is still one comment, and the 140-character cap covers the whole run. A
second comment on the same block is not.

A comment is for what the code cannot say: why this way rather than the obvious
way, a constraint that is not visible locally, a workaround and what it works
around. A comment that narrates the line under it is the tell.

Docstrings and generated API documentation are not code comments for this rule.
They are reference material. The 1:1 ratio does not apply to them, but the
280-character docstring cap does.
