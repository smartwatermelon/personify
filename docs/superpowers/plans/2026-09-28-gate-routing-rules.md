# Gate routing rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route each gated commit or `gh` text to a Pangram check or to visual review only, by repository and author, so Pangram volume drops sharply.

**Architecture:** A new `gate-route.sh` router in `claude-config` reads `gate-rules.conf` and answers `(repo, author)` with an outcome. `gate-review.sh stage` and `check` call it. The publish-time hook and the `gh` wrapper resolve the destination from the real command and pass it to `check`, so staging never decides. The author comes from a new pure function extracted from `gh-wrapper.sh`.

**Tech Stack:** Bash 5, `jq`, plain bash test scripts (`scripts/tests/test-*.sh` in `claude-config`, `bash/tests/test-*.sh` in `dotfiles`).

**Spec:** `docs/superpowers/specs/2026-09-28-gate-routing-rules-design.md`

Repositories, all under `/Users/andrewrich/Developer/`: `dotfiles`, `claude-config`, `personify`. The model pin (`d39204c`, branch `claude/fix-pangram-model-pin-e8feec17`) is independent and out of this plan.

## Global Constraints

- Rules are exactly: repo `andrewmrich/beacon-workspace` gives `visual`; author `andrewmrich` gives `pangram`; anything else gives `visual`. Outcomes accepted by the parser: `pangram`, `visual`, `exempt`.
- Matching ignores case. Repo match is the full `owner/name`, never the bare name.
- An unresolved repo or author does not match its matcher and prints one stderr line saying which input was missing. It never errors.
- A missing rules file, an unparseable line, or no matching rule blocks the publish with a message naming the file and line.
- The banner is `# NOT PANGRAM REVIEWED (rule <N>: <reason>)`. It is a `#` header line, so it never enters approved bytes or the hash.
- Shell: GNU Bash 5, `shellcheck -S info` clean, no `# shellcheck disable`, no `((var++))`, use `git -C <abs path>`, files end with a newline.
- Never `--no-verify`, never `git add .`, never commit to `main`. One branch per repository, named `claude/<type>-<description>-<session-id>`. The pre-push hook runs each repo's full suite.
- `GATE_RULES_FILE` and `GH_WRAPPER_LIB` env overrides exist for tests only. They are the same accepted class as `GATE_REVIEW_DIR`.

## Review Focus

- Remote URL spellings: `git@github.com:o/n.git`, `https://github.com/o/n`, an ssh host alias (`git@github-beacon:o/n.git`), a trailing slash. All normalize to lowercase `o/n`. Owned by Task 3.
- Mixed case (`AndrewMRich/Beacon-Workspace`) matches rule 1. Owned by Task 2.
- A rules file with tabs, CRLF line endings, trailing spaces, or blank and comment lines parses. Owned by Task 2.
- A directory that is not a repo, or a repo with no `origin`, routes to rule 3 with the stderr line and exit 0. Owned by Task 3.
- A rules file with no catch-all `*` and a text matching nothing blocks instead of guessing. Owned by Task 2.

---

## Pull request A: `dotfiles` (branch `claude/refactor-identity-for-owner-<sid>`)

### Task 1: Extract the identity mapping

**Files:**

- Modify: `/Users/andrewrich/Developer/dotfiles/bash/gh-wrapper.sh` (the `case "${owner,,}"` block in `_gh_wrapper_sync_identity`, about lines 331 to 345)
- Test: `/Users/andrewrich/Developer/dotfiles/bash/tests/test-gh-wrapper-identity.sh`

**Interfaces:**

- Produces: `_gh_wrapper_identity_for_owner <owner>` prints `andrewmrich` or `twistedmelonman` on stdout, exit 0. Reads the current directory for the Beacon-context fallback via `_gh_wrapper_is_beacon_context`. No side effects, no `gh` calls.
- Consumes: `_gh_wrapper_is_beacon_context` (exists).

- [ ] **Step 1: Add failing cases** to the identity test that call `_gh_wrapper_identity_for_owner` directly: `beacon-biosignals`, `AndrewMRich`, `smartwatermelon`, `NightOwlStudioLLC`, `twistedmelonman`, an unclaimed owner in a fixture checkout under `GH_WRAPPER_BEACON_DIR`, an unclaimed owner with an `upstream` remote on `beacon-biosignals`, and an unclaimed owner outside both. Assert the printed identity for each.
- [ ] **Step 2: Run** `bash /Users/andrewrich/Developer/dotfiles/bash/tests/test-gh-wrapper-identity.sh`. Expected: new cases FAIL with "command not found".
- [ ] **Step 3: Implement** `_gh_wrapper_identity_for_owner` by moving the `case` block verbatim into it. `_gh_wrapper_sync_identity` sets `desired="$(_gh_wrapper_identity_for_owner "${owner}")"`. Change nothing else in that function.
- [ ] **Step 4: Run** the identity test and `bash /Users/andrewrich/Developer/dotfiles/bash/tests/run-tests.sh`. Expected: all PASS, including every pre-existing `gh-wrapper` test unchanged. This is the proof of no behavior change.
- [ ] **Step 5: Run** `shellcheck -S info /Users/andrewrich/Developer/dotfiles/bash/gh-wrapper.sh`, then commit `refactor: extract gh identity mapping into a pure function`. Push, open the PR, and stop for CI and a human merge lock.

---

## Pull request B: `claude-config` (branch `claude/feat-gate-routing-<sid>`)

Start only after PR A is merged and `/Users/andrewrich/Developer/dotfiles` is on `main` and pulled, because `~/.config/bash/gh-wrapper.sh` is a symlink into it.

### Task 2: Rules file and parser

**Files:**

- Create: `/Users/andrewrich/Developer/claude-config/gate-rules.conf`
- Create: `/Users/andrewrich/Developer/claude-config/scripts/gate-route.sh` (executable)
- Test: `/Users/andrewrich/Developer/claude-config/scripts/tests/test-gate-route-rules.sh`

**Interfaces:**

- Produces: `gate-route.sh` with functions `_load_rules <file>` (fills arrays `RULE_KIND`, `RULE_VALUE`, `RULE_OUTCOME`, returns 4 with a stderr message naming file and line on any bad line or missing file) and `_match_rule <repo> <author>` (prints `<outcome>\t<rule number>\t<reason>`, returns 4 if nothing matches). Rules file path is `${GATE_RULES_FILE:-${HOME}/.claude/gate-rules.conf}`. The script only runs `main` when executed, not when sourced.
- `gate-rules.conf` content is the three spec rules, with a header comment naming the outcomes.

- [ ] **Step 1: Write failing tests** in `test-gate-route-rules.sh`, sourcing the script and using a temp rules file:
  - exact `andrewmrich/beacon-workspace` with author `andrewmrich` returns `visual 1`
  - `AndrewMRich/Beacon-Workspace` returns `visual 1`
  - `other/beacon-workspace` with author `andrewmrich` returns `pangram 2`
  - `twistedmelonman/x` with author `twistedmelonman` returns `visual 3`
  - empty repo and empty author return `visual 3`
  - the shipped `gate-rules.conf` parses and gives the same results
  - a file with tabs, CRLF, trailing spaces, blank lines and `#` comments parses
  - `exempt` parses as an outcome
  - unknown outcome word, unknown matcher, and a one-field line each return 4 and name the line number
  - a missing file returns 4 and names the file
  - a valid file with no `*` and a non-matching input returns 4 with "no rule matched"
- [ ] **Step 2: Run** `bash /Users/andrewrich/Developer/claude-config/scripts/tests/test-gate-route-rules.sh`. Expected: FAIL, script missing.
- [ ] **Step 3: Implement** the two functions. Strip `\r`, split on runs of whitespace, lowercase repo and author values at load. The reason string is `matched repo=<v>`, `matched author=<v>`, or `no rule matched, default` for `*`.
- [ ] **Step 4: Run** the test. Expected: all PASS. Run `shellcheck -S info` on both new shell files. Commit `feat: gate-rules.conf and rule parser`.

### Task 3: Destination and author resolution, and the router CLI

**Files:**

- Modify: `/Users/andrewrich/Developer/claude-config/scripts/gate-route.sh`
- Test: `/Users/andrewrich/Developer/claude-config/scripts/tests/test-gate-route-resolve.sh`

**Interfaces:**

- Produces: `_repo_from_dir <dir>` prints lowercase `owner/name` from `git -C <dir> config --get remote.origin.url`, or nothing. `_author_for_repo <owner/name> <dir>` prints the identity by sourcing `${GH_WRAPPER_LIB:-${HOME}/.config/bash/gh-wrapper.sh}` in a subshell, `cd`ing to `<dir>` when it is a directory, and calling `_gh_wrapper_identity_for_owner`. CLI: `gate-route.sh [--repo owner/name] [--dir path]` prints `<outcome>\t<rule>\t<reason>`, exit 0, exit 4 on a rules error. `--repo` wins over the remote. Missing repo prints `gate-route: repo unresolved` and missing author prints `gate-route: author unresolved` to stderr, once each.
- Consumes: `_load_rules`, `_match_rule` (Task 2); `_gh_wrapper_identity_for_owner` (PR A).

- [ ] **Step 1: Write failing tests** using scratch repos with `git init` and `git remote add origin <url>` under a sandboxed `HOME` (source `bash/tests/lib/git-env-isolation.sh` conventions from `dotfiles`, or `unset GIT_DIR GIT_WORK_TREE` in the test):
  - the five URL spellings from Review Focus each give the same `owner/name`
  - `--dir` on a repo whose origin is `andrewmrich/beacon-workspace` gives `visual 1`
  - origin `beacon-biosignals/x` gives `pangram 2`
  - origin `twistedmelonman/y` gives `visual 3`
  - `--repo beacon-biosignals/x --dir /nonexistent` gives `pangram 2`
  - a directory that is not a repo, and a repo with no origin, give `visual 3`, exit 0, and the stderr line
  - no arguments give `visual 3` with both stderr lines
- [ ] **Step 2: Run** the test. Expected: FAIL.
- [ ] **Step 3: Implement** the functions and `main`. URL normalization reuses the `sed -E 's#^(git@[^:]+:|[a-zA-Z]+://[^/]+/)##; s#\.git/?$##; s#/$##'` shape from `_gh_wrapper_resolve_owner`.
- [ ] **Step 4: Run** the test and Task 2's test. Expected: PASS. `shellcheck -S info`. Commit `feat: gate-route resolves destination and author`.

### Task 4: `stage` routes and adds the banner

**Files:**

- Modify: `/Users/andrewrich/Developer/claude-config/scripts/gate-review.sh` (`_cmd_stage` at line 173, the header loop near line 445, `_verdict_line` at line 155)
- Test: `/Users/andrewrich/Developer/claude-config/scripts/tests/test-gate-review-route.sh`

**Interfaces:**

- Consumes: `gate-route.sh` CLI (Task 3), called with `--dir "$(pwd)"`.
- Produces: `stage` writes a sidecar `${PENDING}/.route/<name>` holding `<outcome>\t<rule>\t<reason>`; `_verdict_line` prints `# <name>: NOT PANGRAM REVIEWED (rule <N>: <reason>)` when the sidecar says `visual` and no record exists. `stage` refuses without a record only when the outcome is `pangram`.

- [ ] **Step 1: Write failing tests** with `GATE_REVIEW_DIR` and `GATE_RULES_FILE` in a temp dir and a scratch repo as cwd:
  - a `visual` destination stages with no record and exits 0
  - a `pangram` destination without a record still exits 1 with today's message
  - the buffer header (call `_verdict_line` by sourcing, as `test-gate-review-approval.sh` does) contains the banner for the `visual` item
  - after approval, the approved bytes and `_hash` are identical to the staged text: the banner is not in them
  - the `.route` sidecar is not treated as an artifact by `open` or `check` (glob over `${PENDING}/*` skips dotfiles)
- [ ] **Step 2: Run** `bash /Users/andrewrich/Developer/claude-config/scripts/tests/test-gate-review-route.sh`. Expected: FAIL.
- [ ] **Step 3: Implement** the change. Router errors (exit 4) make `stage` exit 1 with the router's message.
- [ ] **Step 4: Run** the new test plus `test-gate-review-approval.sh` and `test-gate-review-suspend.sh`. Expected: PASS. `shellcheck -S info`. Commit `feat: stage routes by destination and shows a banner`.

### Task 5: `check` is route-aware

**Files:**

- Modify: `/Users/andrewrich/Developer/claude-config/scripts/gate-review.sh` (`_cmd_check` at line 818, dispatch at line 885)
- Test: `/Users/andrewrich/Developer/claude-config/scripts/tests/test-gate-review-route.sh`

**Interfaces:**

- Produces: `gate-review.sh check <file> [--repo <owner/name>] [--dir <path>]`. Exit 0 when the bytes match an approval and, for a `pangram` outcome, a record exists for the raw bytes. Exit 1 otherwise, printing one stderr line: `gate-review: rule <N> (pangram): no Pangram check ran on these bytes`, or `gate-review: rule <N> (pangram): verdict <V> recorded; no visual approval matches`, or `gate-review: rule <N> (visual): no visual approval matches`. With neither flag it behaves as today: destination unresolved, rule 3, no record needed. A router error exits 1 naming the file and line.

- [ ] **Step 1: Write failing tests** (same file as Task 4), each with an approved fixture text:
  - `--repo beacon-biosignals/x`, approved, no record: exit 1 and the "no Pangram check ran" line
  - same with a `FAIL` record: exit 0
  - same with a record but unapproved bytes: exit 1 and the "verdict AI recorded" line
  - `--repo twistedmelonman/y`, approved, no record: exit 0
  - `--repo andrewmrich/beacon-workspace`, approved, no record: exit 0
  - no flags, approved: exit 0, identical to today
  - a broken rules file: exit 1 and the message names the file
- [ ] **Step 2: Run** the test. Expected: new cases FAIL.
- [ ] **Step 3: Implement** flag parsing in the `check)` dispatch arm and the route call inside `_cmd_check`. Keep the hash loop unchanged.
- [ ] **Step 4: Run** the three gate-review tests. Expected: PASS. `shellcheck -S info`. Commit `feat: check enforces the Pangram record by rule`.

### Task 6: The hook resolves the destination

**Files:**

- Modify: `/Users/andrewrich/Developer/claude-config/scripts/hook-block-personify.sh` (`_verify_segment`, `_verify_path`, and the segment loop at the bottom)
- Test: `/Users/andrewrich/Developer/claude-config/scripts/tests/test-hook-personify-route.sh`

**Interfaces:**

- Consumes: `gate-review.sh check <file> --repo R --dir D` (Task 5).
- Produces: `_destination_for_segment <segment> <kind>` sets `DEST_DIR` and `DEST_REPO`. For a `git commit` segment, `DEST_DIR` is the value of a `-C <dir>` global option, else the hook input's `.cwd`. For a `gh` segment, `DEST_REPO` is the `-R`/`--repo` value, else the `repos/<owner>/<name>` path of a `gh api` call, and `DEST_DIR` is `.cwd`. `_verify_path` passes them as `--repo` and `--dir` when set.

- [ ] **Step 1: Write failing tests** by piping hook JSON (`{"tool_input":{"command":"..."},"cwd":"..."}`) into the hook against a scratch repo, approved fixture, and temp `GATE_REVIEW_DIR`:
  - `git -C <repo with origin beacon-biosignals/x> commit -F <approved abs path>` with no record blocks (exit 2) and stderr has "no Pangram check ran"
  - the same with a record passes (exit 0)
  - the same against a `twistedmelonman/y` repo passes with no record
  - `gh pr create --title t --body-file <approved> -R beacon-biosignals/x` with no record blocks
  - `gh pr create ...` from `.cwd` in the `beacon-workspace` repo passes with no record
  - a text staged as `visual` in one repo then committed in a `pangram` repo blocks (the trust test)
  - inline `-m` and relative paths still block as before
- [ ] **Step 2: Run** the test. Expected: FAIL.
- [ ] **Step 3: Implement** the resolver using the existing `_extract_path` style for `-C`, `-R` and `--repo`. Do not touch `_join_continuations` or the segment regexes.
- [ ] **Step 4: Run** the new test and `bash /Users/andrewrich/Developer/claude-config/scripts/tests/test-gate-matcher.sh`. Expected: PASS. `shellcheck -S info`. Commit `feat: hook passes the real destination to check`.

### Task 7: Protect and install the rules file

**Files:**

- Modify: `/Users/andrewrich/Developer/claude-config/scripts/hook-block-gate-dir-write.sh` (`_dirs` at the pattern near line 43), `/Users/andrewrich/Developer/claude-config/scripts/hook-block-merge-locks-write.sh`, `/Users/andrewrich/Developer/claude-config/install.sh`
- Modify: `/Users/andrewrich/Developer/claude-config/docs/INFRASTRUCTURE.md` (one paragraph on `gate-rules.conf`)
- Test: `/Users/andrewrich/Developer/claude-config/scripts/tests/test-gate-matcher.sh`

**Interfaces:**

- Produces: `install.sh` links `gate-rules.conf` to `~/.claude/gate-rules.conf` and `gate-route.sh` to `~/.claude/scripts/gate-route.sh`. Bash writes (`cp`, `>`, `tee`, `sed -i`, `mv`) and Write/Edit calls targeting `~/.claude/gate-rules.conf` are blocked. Reads pass.

- [ ] **Step 1: Write failing cases** in `test-gate-matcher.sh` style: a Bash `cp x ~/.claude/gate-rules.conf`, `echo x > ~/.claude/gate-rules.conf`, and a Write payload with that `file_path` each block; `cat ~/.claude/gate-rules.conf` passes; a path like `~/.claude/scripts/gate-rules-notes.md` is not matched.
- [ ] **Step 2: Run** the matcher test. Expected: new cases FAIL.
- [ ] **Step 3: Implement** the pattern additions. Add the two `install.sh` links following the existing `_ensure_symlink` calls, and make sure `install.sh --repair` reports them.
- [ ] **Step 4: Run** the matcher test and `bash /Users/andrewrich/Developer/claude-config/tests/test_install_sync_dry_run.bats` via `bats`. Expected: PASS. Then run the repo's full suite once. Commit `feat: protect and install gate-rules.conf`. Push, open the PR, stop for CI and a merge lock.
- [ ] **Step 5: After merge, run** `bash /Users/andrewrich/Developer/claude-config/install.sh --sync`, then `~/.claude/scripts/gate-route.sh --repo andrewmrich/beacon-workspace` (expect `visual 1`) and `--repo beacon-biosignals/x` (expect `pangram 2`).

---

## Pull request C: `dotfiles` (branch `claude/feat-wrapper-passes-destination-<sid>`)

Start only after PR B is merged and installed.

### Task 8: The wrapper passes the destination to `check`

**Files:**

- Modify: `/Users/andrewrich/Developer/dotfiles/bash/gh-wrapper.sh` (`_gh_wrapper_approval_gate`, the argument loop at about line 754 and the `check` call at about line 833)
- Test: `/Users/andrewrich/Developer/dotfiles/bash/tests/test-gh-wrapper-approval-gate.sh`

**Interfaces:**

- Consumes: `gate-review.sh check <file> --repo R --dir D` (Task 5).
- Produces: `_gh_wrapper_approval_gate` records the `-R`/`--repo` value (it already skips it) and, for `gh api`, the `repos/<owner>/<name>` path. It calls `"${gate}" check "${body_file}" --dir "${PWD}"` and adds `--repo` when known.

- [ ] **Step 1: Write failing cases** with a stub `gate-review.sh` that records its argv: `gh pr create --body-file <f> -R o/n` passes `--repo o/n --dir <pwd>`; without `-R` it passes `--dir` only; a `gh api repos/o/n/issues/1/comments -F body=@<f>` passes `--repo o/n`. Existing cases assert unchanged block and pass behavior.
- [ ] **Step 2: Run** `bash /Users/andrewrich/Developer/dotfiles/bash/tests/test-gh-wrapper-approval-gate.sh`. Expected: new cases FAIL.
- [ ] **Step 3: Implement** the capture and the extra arguments. Nothing else in the gate changes.
- [ ] **Step 4: Run** the approval-gate test and `bash /Users/andrewrich/Developer/dotfiles/bash/tests/run-tests.sh`. Expected: PASS. `shellcheck -S info`. Commit `feat: gh wrapper passes destination to the approval check`. Push, open the PR, stop for CI and a merge lock.

### Task 9: End-to-end check

**Files:**

- Create: `/Users/andrewrich/Developer/claude-config/scripts/tests/test-gate-routing-e2e.sh` (in PR B, run again after PR C)

- [ ] **Step 1: Write the test** with three scratch repos (origin `andrewmrich/beacon-workspace`, `beacon-biosignals/x`, `twistedmelonman/y`), a temp `GATE_REVIEW_DIR` and check-records directory. For each repo: stage a text, approve it by writing the approved copy as `test-gate-review-approval.sh` does, then run the hook on `git -C <repo> commit -F <approved>`. Assert: workspace and personal pass with no record and stage shows the banner; the employer repo blocks until a record exists, then passes.
- [ ] **Step 2: Run** it in PR B and again after PR C. Expected: PASS both times. Commit with PR B.
