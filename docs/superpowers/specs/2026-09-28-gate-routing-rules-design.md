# Gate routing rules design

Date: 2026-09-28
Status: approved in conversation, pending written review

## The problem this solves

Pangram 4 bills $0.05 per started 100 words. On 2026-09-30 the `default`
alias stops meaning Pangram 3.3.2, which billed $0.05 per started 1,000 words.
A 400-word text goes from $0.05 to $0.20, and a 1,000-word text from $0.05 to
$0.50. Today `gate-review.sh stage` refuses any text that has no Pangram check
record, so every commit, PR body and issue body that reaches the gate is
Pangram checked, in every repository. At the new price that volume is not
affordable.

The fix is to send far less text to Pangram without sending any less text past
a human. In Andrew's words: "Pangram checks only apply where my work
colleagues see the output, which is all I really need."

This design replaces the destination-based exempt list in
`2026-09-22-review-gate-boundary-design.md` with a small ordered rule table
that picks one of two review paths per text. It changes the strictness of the
default: an unclassified text was Pangram checked, and is now visually reviewed
only.

## Scope

Git commit messages and `gh` text (PR bodies, issue bodies, comments, review
bodies) only. These are the surfaces `hook-block-personify.sh` and
`gh-wrapper.sh` already gate. Slack, Asana and any other connector are out of
scope and stay ungated, as they are today.

## The rules

A text is routed by the first matching rule:

| # | Match | Outcome |
|---|---|---|
| 1 | Repository is exactly `andrewmrich/beacon-workspace` | `visual` |
| 2 | Author is `andrewmrich` | `pangram` |
| 3 | Anything else | `visual` |

Outcomes:

- `pangram`: the text is checked by Pangram once, then visually reviewed under
  the existing rules. A `Human` verdict and an `AI` verdict follow the current
  behavior, unchanged.
- `visual`: the text is visually reviewed in the existing BBEdit gate. No
  Pangram call is made.
- `exempt`: skips both. The parser accepts it and no rule uses it yet.

Rule 1 sits above rule 2 so the one carved-out repository is never checked,
whoever wrote the text. It is the one repository Andrew named as visually
reviewed only. Matching on the full `owner/name` string, not the bare
name, is deliberate: a same-named fork or a repository under another owner
falls through to rule 2 instead of silently skipping the check.

"Authored as `andrewmrich`" means the repository owner resolves to the
`andrewmrich` identity, using the mapping `gh-wrapper.sh` already applies to
route `gh`. It reads intended identity, not proof of who is logged in.
Employer-owned repositories and `andrewmrich`-owned repositories resolve to it,
as do unclaimed owners in a Beacon checkout or a fork of `beacon-biosignals`.
Repositories under `smartwatermelon`, `nightowlstudiollc` and
`twistedmelonman` resolve to `twistedmelonman`, so their text is visually
reviewed only. On a machine with no `andrewmrich` work, rule 2 never fires and
Pangram is never called.

## The rules file

`gate-rules.conf` lives in `claude-config` and `install.sh` links it into
`~/.claude/`. One rule per line, first match wins, blank lines and `#` comments
ignored:

```text
repo=andrewmrich/beacon-workspace   visual
author=andrewmrich                  pangram
*                                   visual
```

Matchers are `repo=<owner/name>`, `author=<login>` and `*`. Matching ignores
case, because GitHub names do and `gh-wrapper.sh` already lowercases owners.

An exemption Claude can edit is an exemption Claude can grant itself, which the
boundary spec already rules out. Two layers keep the file out of reach.
`~/.claude/gate-rules.conf` joins the paths `hook-block-gate-dir-write.sh` and
`hook-block-merge-locks-write.sh` already refuse to write. Those are forcing
functions, not locks: `hook-block-gate-dir-write.sh` documents that variable
spelled paths and an overridden environment get past it. The stronger layer is
review. The tracked copy changes only through a `claude-config` pull request,
which needs a human merge lock.

A missing file or a line the parser rejects blocks the publish. The message
names the file and the line. There is no silent fallback, so a typo cannot
quietly change which texts get checked.

## The router

`gate-route.sh` takes the destination as `owner/name` plus the checkout
directory and prints the outcome, the rule number that fired and a short
reason, for example `visual 3 no rule matched, default`. The banner and the
block messages both use that output.

An input the router cannot resolve, such as an owner with no remote, does not
match its rules. The text falls to a later rule, so an unresolved author
reaches rule 3 and gets `visual`. The router prints one line to stderr saying
which input was missing, so the fallthrough is visible. Nothing publishes
unreviewed, because the visual gate still fires.

The checkout directory is needed only for the Beacon-checkout fallback in the
identity mapping, which is cwd-relative by nature.

### Extracting the identity mapping

The owner-to-identity mapping is a `case` block inside
`_gh_wrapper_sync_identity`, mixed with token selection and `gh auth switch`.
It is not callable on its own. This design extracts it into a pure function,
`_gh_wrapper_identity_for_owner`. `_gh_wrapper_sync_identity` calls it, so `gh`
behavior does not change, and the router calls it too. One function decides
identity for both, which is the drift `gh-wrapper.sh`'s comments already warn
about.

## Who is trusted

Claude calls `gate-review.sh stage`. If the outcome came from arguments Claude
passes, Claude could label an `andrewmrich` text as `beacon-workspace` and skip
Pangram. So staging informs and the publish-time hook decides.

At stage time, `stage` calls the router with the repository it already infers
from the working directory. For a `pangram` outcome it requires a check record,
as now. For a `visual` outcome it stages without a record and adds a banner to
that item's header in the review buffer:

```text
# NOT PANGRAM REVIEWED (rule 3: no rule matched, default)
```

Header lines start with `#` and are stripped from the approved text, so the
banner appears in BBEdit and never enters the published bytes or the approval
hash. The banner names the rule that fired, and it appears per item, so a mixed
batch shows which items skipped the check.

At publish time, `hook-block-personify.sh` and `gh-wrapper.sh` extract the text
file from the real command, as today. They compute the destination and author
from the command itself and ignore any label from staging, then call the
router and check what the outcome requires:

- `visual`: the bytes must match a visual approval, as today.
- `pangram`: the bytes must match a visual approval and a check record must
  exist for those exact bytes. Records are keyed by the sha256 of the raw bytes
  in `~/.config/personify/checks/`, and `_record_path` already computes the
  path.

`gate-review.sh check <file>` becomes route-aware. It takes optional
`--repo <owner/name>` and `--dir <path>`, calls the router itself, and enforces
the record requirement. The hook and the wrapper only resolve the destination
from the command and pass it in, so the enforcement lives in one place. A
`check` call with no destination treats the destination as unresolved, which
routes to rule 3 and keeps every existing caller working. On failure `check`
prints one line naming the rule and whether a record exists.

If the hook's outcome is stricter than the outcome staging assumed, the publish
is blocked. The message reads "Pangram-gated by rule 2; no check ran on these
bytes" and names the fix. It differs from the message for an `AI` verdict,
which says a verdict exists, for the reason the boundary spec gives: an
unchecked text and a text that failed the check must not present identically.

## Tests

Bats, matching `test_gh_wrapper.bats`.

- Router, table driven. `andrewmrich/beacon-workspace` gives `visual` by rule
  1. A same-named repository under another owner falls to the author rule.
  Another `andrewmrich`-owned repository gives `pangram`. A personal-org
  repository gives `visual`. An unresolved owner gives `visual` plus the stderr
  line. Matching ignores case. A missing rules file, or a bad line, errors and
  names the file and line. `exempt` parses.
- Extraction. The existing `gh-wrapper` tests pass unchanged. New tests cover
  every branch of `_gh_wrapper_identity_for_owner`, including the Beacon
  checkout fallback.
- `gate-review.sh`. A `visual` item stages without a record and its buffer
  shows the banner. The banner is absent from the approved bytes and the hash
  is unchanged. A `pangram` item still refuses to stage without a record.
  `check --repo --dir` passes and fails correctly for each outcome, and a
  `check` with no destination behaves as it does today.
- Hook and wrapper. A `pangram` outcome with no record blocks with the "no
  check ran" message. With an `AI` record it shows the "verdict exists"
  message. A `visual` outcome passes with approval.
- Trust. A text staged as `visual` whose real outcome is `pangram` blocks at
  publish.

## Rollout

Four pull requests, in order:

1. `personify`: this spec and its plan. It supersedes the boundary spec's line
   that pull request descriptions are gated everywhere and its
   destination-based exempt list.
2. `dotfiles`: extract `_gh_wrapper_identity_for_owner`, no behavior change.
3. `claude-config`: the router, the rules file, and the `gate-review.sh`,
   hook-block-personify and write-protection changes. This is the one that
   reduces Pangram volume. The router sources the deployed `gh-wrapper.sh`,
   which is a symlink into the `dotfiles` checkout, so pull request 2 must be
   merged and pulled first.
4. `dotfiles`: the `gh` wrapper's approval gate passes the destination to
   `check`. Until this lands, manual `gh` calls reach `check` with no
   destination and route to `visual`. The Bash-tool hook covers the agent path
   in that window, and the two gates are redundant by design.

The model pin in `scripts/pangram_check.py` is a separate change and does not
depend on any of these.

## Known weaknesses

The record check proves a file exists, not that Pangram was called. Records are
unsigned. `hook-block-gate-dir-write.sh` refuses Bash writes into
`~/.config/personify/checks/`, but it is a regex forcing function, and its own
header lists the ways past it: variable spelled paths, and setting
`XDG_CONFIG_HOME` to a directory the agent controls. A hand-written record would
then satisfy the check. `stage` has the same exposure today. Reading the
record's contents would confirm a task id, a real verdict and a matching hash,
and still would not prove the call. Full protection needs a record signed with
a key the agent cannot read. This design does not close it.

Author is intended identity, resolved from the repository owner. A commit in a
`twistedmelonman` repository written with an employer email is treated as
`twistedmelonman`.

A `visual` outcome is only as good as the reading behind the approval. Saying
ship without reading makes it theater, as the boundary spec already records.

## Follow-ups, not in this design

- Harden check records so Claude cannot write one by hand.
- Add Slack and Asana as surfaces, with their own hook and identity signal.
  Both reach colleagues, so they are the surfaces the goal most affects. Texts
  under the 40-word floor are skipped by the checker, so most Slack messages
  would cost nothing.
- Decide what belongs under `exempt`.
- Decide whether an exempt repository exempts its commit messages.
- Resolve the boundary spec's open question about a chat override versus the
  BBEdit round trip.
