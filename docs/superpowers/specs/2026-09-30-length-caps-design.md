# Length caps design

Date: 2026-09-30
Status: approved in conversation, pending written review
Issue: #106

## The problem this solves

The skill spends most of its text on voice and on what reads as machine-written.
For the text Andrew produces most, code comments, commit messages and PR
descriptions, the bigger problem is length. A long comment or PR description
costs a reviewer time whether or not it reads human, and Pangram cannot see it.

A length cap is a better first gate than Pangram. It is deterministic and free,
and a rewrite toward a length limit converges. A rewrite toward a detector
verdict does not.

Text over its cap never reaches human review. It is rejected, rewritten shorter
and checked again.

## The caps

One unit is 140 characters.

| Kind | Title | Body |
|---|---|---|
| Commit message | 50, conventional-commit prefix included | 1 unit |
| PR description | 0.5 unit (70) | 2 units |
| Issue | 0.5 unit (70) | no hard cap |
| Line comment on a PR | | 2 units |
| PR comment, review body, issue comment | | 1 unit |
| Code comment | | 1 unit per comment |
| Docstring | | 2 units |

A line comment is attached to specific lines of the diff: why this is not quite
right, and a suggestion. It gets the PR description budget. A PR comment or a
review body is an overall view of the PR that points to the line comments for
detail, so it gets the commit body budget. GitHub stores PR conversation
comments and issue comments as the same object, so issue comments get the same
cap.

A code comment is one contiguous run of comment lines. A docstring is the
documentation block attached to a function, class or module: a Python
triple-quoted string directly under `def` or `class`, or a `/** */` block above
a declaration. Docstrings are human-read documentation, so they get the PR
description budget rather than the comment budget. If that cuts too much, the
cap is revisited.

The issue body follows the GitHub community guidance on effective issues. It is
subjective, so it stays guidance in the skill and is not enforced. Over-long
issues cost Andrew far less than over-long comments, commits and PRs.

## How to count

1. Remove fenced code blocks. In a docstring, also remove doctest and example
   blocks. Verbatim output is not prose and does not count.
2. Remove git trailers (`Closes #N`, `Co-authored-by:` and the like).
3. Collapse every run of whitespace, newlines included, to one space. Commit
   bodies wrap at 72 columns, and a wrap must not cost characters.
4. Trim, then count Unicode code points.

The conventional-commit prefix counts, because it is part of the title.

## The checker

`scripts/length_check.py` ships with the skill, next to `pangram_check.py`. It
is the one place the caps and the counting rule are defined.

It takes `--kind commit|pr|issue|line-comment|pr-comment|code-comment|docstring`
and the text on stdin. `pr-comment` covers PR comments, review bodies and issue
comments. For
`commit`, the first line is the title and the rest is the body. For `pr` and
`issue`, `--title` is optional. It prints the measured count, the cap, and the
overage for each part, and exits nonzero when any part is over.

Callers outside this repo find it the way `gate-review.sh` finds
`pangram_check.py` today: the `installPath` of `personify@personify` in
`~/.claude/plugins/installed_plugins.json`, then the claude.ai synced copy.

## Where it is enforced

Three enforcement points, because the kinds enter at three different places.

**Bodies and commit titles, at `gate-review.sh stage`.** This is the step
before BBEdit opens, so over-cap text never reaches Andrew. `stage` gains a
required `--kind`, one of the text kinds above. The commit title is in the same `-F` file,
so it is checked here too. The length check runs on every route except
`exempt`, not only `pangram`. twistedmelonman repos route `visual`, so for them
the length cap is the whole automated gate. The length check runs before the
Pangram record requirement, so an over-cap text costs nothing.

**PR and issue titles, at publish time.** They are passed inline with
`--title` and are not gated today. `hook-block-personify.sh` reads `--title`
and runs the checker.

**Code comments and docstrings, at pre-commit.** The gate never sees code. A
new check in dotfiles' global pre-commit hook, beside the `lint-*.sh` scripts,
runs the checker on each comment run and docstring in the added lines of the
staged diff. Only added lines are checked. Existing text is never
blocked or edited, even inside a block the commit touches. Comment syntax is found by file extension: `#` for Python, shell,
Ruby, YAML and TOML; `//` and `/* */` for JavaScript, TypeScript, Go, Rust,
Swift and the C family.

## Who is trusted

`--kind` is passed by Claude, so Claude could label a PR body as an issue to
get the soft cap. The routing design already solved this shape: staging
informs, and the publish-time hook decides. `hook-block-personify.sh` and
`gh-wrapper.sh` derive the kind from the real command and run the checker
again on the approved bytes. A mismatch blocks.

| Command | Kind |
|---|---|
| `git commit` | `commit` |
| `gh pr create`, `gh pr edit` | `pr` |
| `gh issue create`, `gh issue edit` | `issue` |
| `gh pr comment`, `gh issue comment`, `gh pr review` | `pr-comment` |
| `gh api` to `pulls/<n>/comments`, or a review-thread mutation | `line-comment` |
| `gh api` to `issues/<n>/comments`, or an `addComment` mutation | `pr-comment` |

## The skill

SKILL.md is reordered for the surfaces Andrew writes most:

1. Length cap, for the kind being written.
2. The structure rules for PR descriptions and code comments.
3. Pangram, only when the text is over the 40-word floor and the route is
   `pangram`.

Voice and prose guidance stays, after these. `rules/structure.md` gains the
caps and the counting rule, and SKILL.md and it are edited together as now.

Rejection means rewrite shorter and check again. That is a loop, and SKILL.md
forbids an edit loop against the detector. The two are different: a length
check is deterministic and converges, and the detector is neither. SKILL.md
says so, so the rules do not read as a contradiction.

At these caps most commit bodies and comments fall under the 40-word floor and
Pangram skips them. A 2-unit PR description is about 45 words, so some are
checked and some are not.

## Tests

- `length_check.py`, table driven: each kind at, under and over its cap; code
  blocks, trailers and wrapped lines do not count; the conventional-commit
  prefix does; a commit with no body passes; exit codes.
- `gate-review.sh`: `stage` without `--kind` fails; over-cap text is refused
  on a `visual` route and on a `pangram` route before the record check.
- Hook: an over-cap `--title` blocks; a text staged as `issue` and published
  with `gh pr` is rechecked as `pr` and blocks when over.
- Hook: each row of the command table maps to its kind; a line comment at 2
  units passes and a PR comment at 2 units blocks.
- Pre-commit: an added comment run over 1 unit fails; an existing over-cap
  comment in a touched block does not; a docstring at 2 units passes.

## Rollout

Four pull requests, in order:

1. `personify`: this spec and its plan.
2. `personify`: `length_check.py`, its tests, the SKILL.md and
   `rules/structure.md` changes, and the version bump in both files.
3. `claude-config`: `stage --kind`, the length check on every route, the
   publish-time recheck and the title check.
4. `dotfiles`: the pre-commit comment and docstring check.

## Known weaknesses

Comment detection is a heuristic. It does not parse the language, so a `#`
inside a string can be misread as a comment, and a file type it does not know
is not checked.

Characters are a proxy for reading time. A cap can be met by dropping the
sentence that mattered. The visual review is still the check on that.

`gh api --input <json>` is not gated today, so a review sent as one JSON
payload, with its body and line comments together, skips both the gate and the
caps. The pr-review skill stages its pending reviews exactly this way
(`gh api --method POST .../pulls/<n>/reviews --input review.json`). Its line
comments and review body are therefore uncapped until the hook learns to read
that JSON, or pr-review runs the checker itself. That is a follow-up, not part
of this rollout.
