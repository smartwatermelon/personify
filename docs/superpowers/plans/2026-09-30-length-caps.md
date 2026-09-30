# Length Caps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reject over-length commits, PR and issue text, review comments, code comments and docstrings before a human sees them.

**Architecture:** One checker, `scripts/length_check.py`, ships in personify and holds every cap and the counting rule. claude-config's gate calls it at `stage` and again at publish time, with the kind taken from the real command. dotfiles' pre-commit runs it over the staged diff for comments and docstrings, and its `gh` wrapper passes the kind to the gate.

**Tech Stack:** Python 3 stdlib (unittest), Bash 5 (shellcheck -S info clean), pre-commit framework.

**Spec:** `docs/superpowers/specs/2026-09-30-length-caps-design.md`

## Global Constraints

- One unit is 140 characters. Caps, verbatim from the spec:
  - commit: title 50 (conventional-commit prefix counts), body 140
  - pr: title 70, body 280
  - issue: title 70, body uncapped
  - line-comment: 280
  - pr-comment (PR comment, review body, issue comment): 140
  - code-comment: 140 per contiguous run of comment lines
  - docstring: 280
- Counting: remove fenced code blocks (and, for docstrings, `>>>` example blocks); remove trailers; collapse every whitespace run, newlines included, to one space; trim; count Unicode code points.
- Only new content is checked. Existing text is never blocked or edited.
- The length check runs on every gate route except `exempt`, and before the Pangram record check.
- Three PRs, in order: personify, claude-config, dotfiles. Each repo's own test suite passes before its PR.
- personify: bump `version` from 2.0.4 to 2.1.0 in both `SKILL.md` and `.claude-plugin/plugin.json`. No em or en dashes in SKILL.md or rules/structure.md.
- Every commit and PR body in this plan must itself meet the caps, and goes through the approval gate: write it to a file at an absolute path, run `~/.claude/scripts/gate-review.sh stage <label> <file>` then `open` from the repo's checkout, wait for Andrew to approve in BBEdit, then `git commit -F` or `gh pr create --body-file` with the path under `~/.claude/gate-review/approved/`. After PR B merges, `stage` also takes `--kind`.
- Shell: no `# shellcheck disable`, no `((x++))` under `set -e`.

## Review Focus

1. A commit message with a body and only trailers after it (`Co-authored-by:` block) measures the body alone. Owned by Task 1.
2. A `Closes #12` or `Fixes owner/repo#12` line in the last paragraph is a trailer; `Advances #106` is not. Owned by Task 1.
3. A commit message with a title and no body passes, and a CRLF-ending file measures the same as LF. Owned by Task 1.
4. A diff that extends an existing comment run by one line checks only the added line. Owned by Task 2.
5. The gh wrapper and every existing `gate-review.sh check` caller keep working before the dotfiles PR lands: `check` without `--kind` skips the length check. Owned by Task 4.

---

## PR A: personify

This plan file is the first commit on PR A's branch.

### Task 1: Text checker

**Files:**

- Create: `scripts/length_check.py`
- Test: `tests/test_length_check.py` (load the module with `importlib` as `tests/test_pangram_check.py` does)

**Interfaces:**

- Produces:
  - `CAPS: dict[str, tuple[int | None, int | None]]`, kind to (title cap, body cap). Keys exactly: `commit pr issue line-comment pr-comment code-comment docstring`.
  - `measure(text: str, kind: str) -> int`
  - `check_text(kind: str, body: str, title: str | None = None) -> list[Result]`, where `Result` is a `NamedTuple(part: str, count: int, cap: int | None)` with property `over -> bool`. For `commit`, the title is the first line of `body` and the rest is the body; a `title` argument is an error for `commit`.
  - CLI: `length_check.py --kind K [--title T] < file`. Prints one line per part: `<kind> <part>: <count>/<cap> ok` or `... over by <n>`. Exit 0 all ok, 1 any over, 5 bad usage (unknown kind, `--title` with commit). Reads stdin as UTF-8 bytes and normalizes CRLF.

- [ ] **Step 1: Write the failing tests**

```python
def test_commit_title_prefix_counts(self):
    r = lc.check_text("commit", "fix(scope): " + "x" * 39 + "\n")
    self.assertEqual((r[0].part, r[0].count, r[0].over), ("title", 51, True))

def test_commit_title_only_passes(self):
    self.assertFalse(any(x.over for x in lc.check_text("commit", "docs: short\n")))

def test_body_wrap_costs_nothing(self):
    self.assertEqual(lc.measure("a b\nc", "commit"), lc.measure("a b c", "commit"))

def test_fenced_code_not_counted(self):
    self.assertEqual(lc.measure("see:\n```\n" + "y" * 500 + "\n```\n", "pr"), 4)

def test_trailers_not_counted(self):
    body = "Body.\n\nCloses #12\nFixes owner/repo#3\nCo-authored-by: A <a@b.c>\n"
    self.assertEqual(lc.measure(body, "pr"), 5)

def test_advances_is_not_a_trailer(self):
    self.assertEqual(lc.measure("Body.\n\nAdvances #106\n", "pr"), len("Body. Advances #106"))

def test_crlf_same_as_lf(self):
    self.assertEqual(lc.measure("a\r\nb", "pr"), lc.measure("a\nb", "pr"))

def test_docstring_doctest_not_counted(self):
    self.assertEqual(lc.measure("Add.\n\n>>> add(1, 2)\n3\n", "docstring"), 4)

def test_caps_match_spec(self):
    self.assertEqual(lc.CAPS["commit"], (50, 140))
    self.assertEqual(lc.CAPS["pr"], (70, 280))
    self.assertEqual(lc.CAPS["issue"], (70, None))
    self.assertEqual(lc.CAPS["line-comment"], (None, 280))
    self.assertEqual(lc.CAPS["pr-comment"], (None, 140))
    self.assertEqual(lc.CAPS["code-comment"], (None, 140))
    self.assertEqual(lc.CAPS["docstring"], (None, 280))

def test_at_cap_passes_one_over_fails(self):  # every kind with a body cap
    ...  # "x" * cap passes, "x" * (cap + 1) fails, via subTest per kind

def test_cli_exit_codes(self):  # subprocess: 0 ok, 1 over, 5 unknown kind, 5 --title with commit
    ...
```

- [ ] **Step 2: Run to verify they fail**

Run: `python3 -m unittest tests.test_length_check -v`
Expected: FAIL, the script does not exist.

- [ ] **Step 3: Implement `scripts/length_check.py`**

Trailer rule: if the last paragraph (after the final blank line) has every line matching either `^[A-Za-z][A-Za-z0-9-]*: \S` or `^(close[sd]?|fix(e[sd])?|resolve[sd]?) ([\w.-]+/[\w.-]+)?#\d+$` (case-insensitive), drop it. Fenced block: from a line starting with three or more backticks or tildes to the matching close. Doctest block: from a line starting `>>>` to the next blank line. Module docstring on the top, matching pangram_check.py's style, states the exit codes.

- [ ] **Step 4: Run to verify they pass**

Run: `python3 -m unittest tests.test_length_check -v`
Expected: PASS.

- [ ] **Step 5: Commit** `feat: add length checker for generated text`

### Task 2: Diff mode for code comments and docstrings

**Files:**

- Modify: `scripts/length_check.py`
- Test: `tests/test_length_check.py`

**Interfaces:**

- Consumes: `check_text`, `CAPS` from Task 1.
- Produces:
  - `comment_blocks(diff: str) -> list[Block]`, `Block` a `NamedTuple(path: str, line: int, kind: str, text: str)`, `kind` is `code-comment` or `docstring`, `line` is the new-file line of the block's first added line.
  - CLI: `length_check.py --diff < unified-diff` (the caller runs `git diff --cached -U0 --no-color`). Prints `<path>:<line>: <kind> <count>/<cap> over by <n>` per failing block. Exit 0, 1, or 5 as in Task 1.

Detection, by file extension:

- `#` family: `.py .sh .bash .rb .yaml .yml .toml`, plus extensionless files whose first added line is a `#!` shebang.
- `//` and `/* */` family: `.js .jsx .ts .tsx .go .rs .swift .c .h .cc .cpp .hpp .java .kt`.
- A code comment is a run of consecutive added lines whose stripped text starts with the family's line marker, or one `/* */` block (not `/**`). Only added lines count: a run is broken by any non-added line.
- A docstring is an added Python triple-quoted block (`"""` or `'''`) that opens at the start of a stripped line, or an added `/**` block. Deliberate deviation from the spec, which says "directly under `def` or `class`": a `-U0` diff often omits the `def` line, and a bare triple-quoted block at line start is a docstring in practice. Comment markers (`#`, `//`, `*`, `/**`, `*/`, quotes) are removed before measuring.
- Unknown extensions are skipped.

- [ ] **Step 1: Write the failing tests**

```python
def test_added_comment_run_over_cap_fails(self):
    diff = hunk("a.py", 10, ["# " + "w" * 141])
    [b] = lc.comment_blocks(diff)
    self.assertEqual((b.path, b.line, b.kind), ("a.py", 10, "code-comment"))

def test_extension_of_existing_run_checks_only_added_line(self):
    # -U0 diff adds one short "# more" line after existing comment lines
    self.assertEqual([b.text for b in lc.comment_blocks(diff)], ["more"])

def test_two_runs_split_by_code_are_two_blocks(self): ...
def test_python_docstring_is_docstring_kind(self): ...
def test_jsdoc_is_docstring_and_block_comment_is_code_comment(self): ...
def test_hash_inside_js_string_is_not_a_comment(self): ...  # '//' family only for .js
def test_unknown_extension_skipped(self): ...
def test_deleted_lines_ignored(self): ...
def test_cli_diff_exit_codes(self): ...
```

`hunk(path, start, lines)` is a test helper that builds a `-U0` unified diff.

- [ ] **Step 2: Run to verify they fail**

Run: `python3 -m unittest tests.test_length_check -v`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement `comment_blocks` and `--diff`**

- [ ] **Step 4: Run to verify they pass**

Run: `python3 -m unittest discover -s tests -v`
Expected: PASS, all suites.

- [ ] **Step 5: Commit** `feat: check comments and docstrings in a diff`

### Task 3: Skill text and version

**Files:**

- Modify: `SKILL.md`, `rules/structure.md`, `.claude-plugin/plugin.json`, `README.md`, `CLAUDE.md`
- Modify: `scripts/validate_skill.py` and `tests/test_validate_skill.py`

Changes:

1. `SKILL.md`: reorder so the GitHub surfaces come first. After "The hard rules" and "The judgment instruction" (with its "Output target"), which stay where they are, the order is: a new "Length caps" section, then the existing "GitHub PR descriptions" and "Code comments" sections moved up unchanged except for cap wording, then "The check" and everything after it. Voice and prose sections keep their text. The "Length caps" section holds the caps table, the counting rule, and the command `python3 scripts/length_check.py --kind <kind> < file`. Say to run it first, and to rewrite shorter and rerun on exit 1. State why this loop is allowed and the detector loop is not: the length check is deterministic and converges. The agent runs the checker itself. Do not tell it to pass `--kind` to `stage`: that flag does not exist until PR B, and SKILL.md ships first. The existing text about the `stage` step (around SKILL.md:140) stays accurate as written. Under "The check", say Pangram runs only on text over the 40-word floor, which after the caps is mostly PR descriptions.
2. `rules/structure.md`: add the same caps and counting rule, compact. Replace "at most one comment per logical block" wording so it agrees with the 140-char cap; the docstring exemption from the 1:1 ratio stays, and docstrings get the 280 cap.
3. `README.md` and `CLAUDE.md`: name `scripts/length_check.py` as a shipped runtime file beside `pangram_check.py`.
4. Version 2.0.4 to 2.1.0 in both version fields.
5. Validator: require `scripts/length_check.py` to exist and be referenced from SKILL.md, the same way it treats `rules/structure.md`.

- [ ] **Step 1: Write the failing validator test** `test_missing_length_check_fails`, mirroring the existing `rules/structure.md` test.
- [ ] **Step 2: Run it** with `python3 -m unittest tests.test_validate_skill -v`. Expected: FAIL.
- [ ] **Step 3: Make the five changes above.**
- [ ] **Step 4: Run** `python3 scripts/validate_skill.py && python3 -m unittest discover -s tests -v`, and check SKILL.md and rules/structure.md for U+2013 and U+2014. Expected: validator passes, all tests pass, zero dashes.
- [ ] **Step 5: Commit** `feat: length caps in skill text (2.1.0)`

Then open PR A. The body is at most 280 characters.

**Human step between PR A and PR B.** This machine loads personify from claude.ai sync, not from `enabledPlugins`, so `/plugin update` does not deliver 2.1.0. After PR A merges, Andrew re-uploads the skill to claude.ai. Check: `~/.claude/scripts/gate-review.sh hint /etc/hosts` prints a path, and `scripts/length_check.py` exists in that directory. PR B does not start until this passes.

---

## PR B: claude-config

### Task 4: Gate calls the checker

**Files:**

- Modify: `scripts/gate-review.sh`
- Modify: `scripts/hook-block-personify.sh`
- Test: `scripts/tests/test-gate-review-length.sh` (new), `scripts/tests/test-hook-personify-length.sh` (new), in the style of `test-gate-review-route.sh`
- Modify: `docs/INFRASTRUCTURE.md` (Visual Approval Gate section, including line 71's `stage` usage and line 98's "PR and issue titles are not gated", which becomes "titles get a length check only")
- Modify: `scripts/hook-block-gate-dir-write.sh:125` and `scripts/gate-review.sh:23,302`, the other printed `stage` usages, to show `--kind`
- Modify: `scripts/hook-block-personify.sh:774-775` comment on the "locked decision that PR titles stay ungated", so it says titles get a length check and still no visual approval

**Interfaces:**

- Consumes: the `length_check.py` CLI from Tasks 1 and 2.
- Produces:
  - `gate-review.sh personify-path`: prints the personify install directory, found by the lookup `_check_hint` uses today; exit 1 with the "not installed" message if none. `_check_hint` is rewritten to call the same function.
  - `gate-review.sh stage --kind <kind> <name> <file>`: `--kind` is required and must be one of the seven kinds. After routing, and before the Pangram record check, it runs the checker unless the route is `exempt`. Over-cap prints the checker's lines prefixed `gate-review:` and exits 1. Nothing is staged.
  - `gate-review.sh check [--kind <kind>] <file> [--repo R] [--dir D]`: with `--kind`, runs the checker on the file after routing (not on `exempt`), failing with `gate-review: over length: <checker line>`. Without `--kind`, no length check, so existing callers are unchanged.
  - `hook-block-personify.sh` derives the kind per segment and passes `--kind` to `check`:

    | Segment | Kind |
    |---|---|
    | `git commit` | `commit` |
    | `gh pr create`, `gh pr edit` | `pr` |
    | `gh issue create`, `gh issue edit` | `issue` |
    | `gh pr comment`, `gh issue comment`, `gh pr review` | `pr-comment` |
    | `gh api` path matching `pulls/[0-9]+/comments` | `line-comment` |
    | `gh api` path matching `issues/[0-9]+/comments` | `pr-comment` |

    No GraphQL row: `_verify_api_segment` already denies any GraphQL mutation that carries a body, before `check` runs. A `gh api` body segment matching neither path is checked as `pr-comment`, the stricter of the two.

  - The hook also checks titles. On `gh pr create|edit` or `gh issue create|edit` with `-t`, `--title`, or `--title=`, it extracts the value the way `_extract_path` (line 310) extracts file flags, quoted forms included, and runs `length_check.py --kind <pr|issue> --title "<value>" < /dev/null`. It denies when over. A value holding `$`, a backtick, or `$(` cannot be measured and is denied, matching the unexpandable `-C` rule at lines 354-356. This runs whether or not a body flag is present. It is a length check only: titles still need no visual approval. Suspension (`_suspended`) skips it like the other checks.

- [ ] **Step 1: Write failing tests.** Stage: missing `--kind` fails; over-cap text is refused on a `visual` route; on a `pangram` route, the refusal is the length one, not the record one; `exempt` stages over-cap text. Check: `--kind` over-cap fails; no `--kind` passes as today. Hook: one case per row of the kind table; a 2-unit text passes as `line-comment` and is denied as `pr-comment`; a 71-char `--title` on `gh pr create` is denied; a text staged as `issue` and published with `gh pr create` is rechecked as `pr`. Title: `--title "$(cat f)"` is denied as unmeasurable. Point `CLAUDE_CONFIG_DIR` at a temp fixture whose `installed_plugins.json` names a directory into which the test copies `length_check.py` at run time from `${PERSONIFY_CHECKOUT:-$HOME/Developer/personify}`. Nothing is committed as a snapshot, so the fixture cannot drift; the test skips with a message when the checkout is absent.
- [ ] **Step 2: Run** `bash scripts/tests/test-gate-review-length.sh && bash scripts/tests/test-hook-personify-length.sh`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** both new tests, every `scripts/tests/test-gate-*.sh` and `test-hook-personify-route.sh`, and `shellcheck -S info` on both scripts. Expected: all pass, no findings.
- [ ] **Step 5: Commit** `feat: enforce length caps in the approval gate`

Then open PR B.

---

## PR C: dotfiles

### Task 5: gh wrapper kind and pre-commit comment check

**Files:**

- Modify: `bash/gh-wrapper.sh` (`_gh_wrapper_approval_gate`)
- Create: `git/hooks/lint-length.sh`
- Modify: `pre-commit/config.yaml` (add a local hook beside `lint-markdown`)
- Test: `bash/tests/test-lint-length.sh` (new), `bash/tests/test-gh-wrapper-approval-gate.sh` extended

**Interfaces:**

- Consumes: `gate-review.sh personify-path` and `check --kind` from Task 4; `length_check.py --diff` from Task 2.
- Produces:
  - `_gh_wrapper_approval_gate` passes `--kind` to `check`, derived from the `gh` subcommand with the same table as Task 4 (`gh api` rows included). Titles stay unchecked in the wrapper: it covers Andrew's own manual `gh` calls, and the spec puts title caps on the agent path only.
  - `lint-length.sh`: runs `git diff --cached -U0 --no-color | python3 "$(~/.claude/scripts/gate-review.sh personify-path)/scripts/length_check.py" --diff`. Exits with the checker's code. When `personify-path` fails, it prints that message and exits 1 (fail closed; see the open decision below).
  - `pre-commit/config.yaml`: a `repo: local` hook `id: length-caps`, `entry: bash -c '$HOME/.config/git/hooks/lint-length.sh'`, `language: system`, `pass_filenames: false`, `always_run: true`. It reads the staged diff, not file arguments.
  - `lint-length.sh` exits 0 without checking when `MERGE_HEAD`, `CHERRY_PICK_HEAD` or `REVERT_HEAD` exists in the git dir (`git rev-parse --absolute-git-dir`).
  - `lint-length.sh` runs git diff with `--no-ext-diff --src-prefix=a/ --dst-prefix=b/`, so user diff config cannot change the paths.
  - A documented per-file bypass for license headers and vendored files, designed in this task. `.gitattributes` `-diff` works today, but it also hides the file from `git diff` and `git log -p`.

- [ ] **Step 1: Write failing tests.** lint-length: in a temp repo, a staged 150-char `#` comment fails and names `path:line`; a staged 100-char one passes; an unchanged over-cap comment in a file with other staged edits passes; a missing personify path fails with the message. A merge in progress (`MERGE_HEAD`, and likewise the other two) passes unchecked; a user `diff.noprefix` or `diff.external` setting does not change the result; a file under the per-file bypass passes. gh wrapper: each subcommand row passes the expected `--kind`.
- [ ] **Step 2: Run** `bash bash/tests/test-lint-length.sh` and the gh-wrapper bats file. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the two test files, dotfiles' full suite, and `shellcheck -S info` on both scripts. Expected: all pass, no findings.
- [ ] **Step 5: Commit** `feat: length caps for comments and gh wrapper`

Then open PR C.

## Decision: fail closed, with a human bypass

`core.hooksPath` is global, so a fail-closed `lint-length.sh` blocks every commit in every repo whenever the personify path does not resolve. Andrew chose fail closed on 2026-09-30, to adjust later if it hurts. A human bypass must exist: pre-commit's `SKIP=length-caps git commit ...`, run by Andrew. Task 5 verifies that an agent cannot use `SKIP=` past the Bash hook chain the way it cannot use `--no-verify`. If it can, Task 5 reports that rather than adding a new block, and the failure message names only the human bypass.
