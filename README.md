# Personify

An agent skill that keeps text from reading as machine-written before anyone else reads it: emails, PR descriptions and review comments, docs, blog drafts, essays. The draft follows your own register, and then a detector checks the result rather than the skill declaring it clean.

Personify 2.0 is a break from 1.x. The hand-maintained taxonomy of AI-writing tells is gone, along with the A/B harness and the evidence corpus that fed it. Three things replace them: a per-user voice guide, current model judgment about what reads as machine-written, and [Pangram](https://www.pangram.com/), which returns a verdict on the finished text.

It started as a structural cousin of [blader/humanizer](https://github.com/blader/humanizer), with the same idea and the same MIT license, and [LICENSE](LICENSE) credits it. The wording, the rules, and the version history here are independent and were never synced against that project.

## How it works

1. **Draft**, guided by your `VOICE.md` and seven hard rules, among them no dashes, never invent a fact, preserve every fact, and name the actor.
2. **Check.** The result goes to `scripts/pangram_check.py`, which submits it to Pangram once and reports a verdict.
3. **A `Human` verdict passes.** Anything else stops and reports the score and the flagged spans.

There is no edit loop, and this is deliberate. Editing a draft toward the detector was measured and does not work: two rounds of rewriting moved the score from 0.990 to 0.989 to 1.000, so the second rewrite scored worse than the original. A failing verdict means rewriting from the source material, or routing the text to a human. It never means editing harder.

Text under 40 words is skipped rather than classified. Below that the detector produces false passes, including the dangerous direction where AI-written prose comes back Human.

## What a detector cannot see

Two rules survive independently of Pangram, because Pangram scores how prose *reads* and cannot see how an artifact is *shaped*. It will pass a pull request description carrying ceremonial headers, bolded labels, and a "ready to merge upon approval" sign-off, as long as the sentences read human.

- **GitHub PR descriptions.** No headers, no bullets, no bold, no dashes. Four parts as plain prose: the problem, the evidence, the solution, references.
- **Code comments.** Never more than 1:1 comment lines to code lines, and far lower in practice. A comment is for what the code cannot say.

Both are universal rules and both outrank a personal `VOICE.md`, which is otherwise authoritative. They also live in [`rules/structure.md`](rules/structure.md) for a caller that wants them without the rest of the skill.

## Installation

The runtime artifact is the skill directory, not `SKILL.md` alone: `scripts/pangram_check.py`, `scripts/length_check.py`, `rules/structure.md`, and `VOICE.example.md` ship with it. Step 0 falls back to `VOICE.example.md` from the skill directory when no voice guide exists.

### Claude Code plugin

```
/plugin marketplace add twistedmelonman/personify
/plugin install personify@personify
```

Once installed, invoke it as `/personify:personify`.

### Claude Code, project-local or global

Copy the skill directory so the script comes with it:

```bash
mkdir -p .claude/skills/personify        # or ~/.claude/skills/personify
cp -R SKILL.md VOICE.example.md rules scripts .claude/skills/personify/
```

Reload or start a new session after installing.

### Claude Desktop

Claude Desktop reads skills from its own skills directory. Copy the same four paths into a `personify/` folder there, then restart Desktop.

In practice Desktop has been unreliable about trusting its own filesystem connector state and about Step 0's "load `VOICE.md` and treat it as authoritative" instruction. See [`mcp-server/README.md`](mcp-server/README.md) for a bridge that routes Desktop's calls through the Claude Code CLI instead.

## Pangram API key

The check needs a Pangram account. If you sign up through [my referral link](https://pangram.cello.so/hxm2HIQtCr7), you get 20% off the first three months of your subscription, and I get $10 if you sign up for a paid plan.

The check needs a key, and each machine needs it installed once. 1Password holds the canonical copy; the macOS login Keychain holds the per-machine copy. After installing the plugin, run this once from a terminal signed in to 1Password:

```bash
python3 ~/.claude/plugins/cache/personify/personify/<version>/scripts/pangram_check.py --install-key
```

The exact path is the plugin's install path (listed in `~/.claude/plugins/installed_plugins.json`), or `scripts/pangram_check.py` in a copied skill directory. It reads the key with `op read` and stores it as the Keychain item `personify-pangram-key`. Without 1Password, add the item by hand; `security` prompts for the key, which keeps it out of shell history:

```bash
security add-generic-password -U -a "$(id -un)" -s personify-pangram-key -w
```

`--check-key` confirms a key resolves, without calling Pangram. The client resolves one from four places, in order:

1. `PANGRAM_API_KEY` in the environment, which wins as a deliberate override.
2. The login Keychain item `personify-pangram-key`, skipped where `security` does not exist.
3. `~/.config/personify/pangram-key`, mode 600 in a directory that is not group- or world-writable.
4. `op read "op://Automation/Pangram/API Key"`, the 1Password bootstrap path.

The Keychain and the file have to exist as sources because a headless caller (an MCP server under launchd, a git hook) gets no exported environment, so neither `PANGRAM_API_KEY` nor the terminal session that `op` depends on is there. Off macOS, use the file:

```bash
mkdir -p ~/.config/personify
printf '%s' "$PANGRAM_API_KEY" > ~/.config/personify/pangram-key
chmod 600 ~/.config/personify/pangram-key
```

With no key the check exits 5 (unavailable), names the install command, and the text routes to manual review. It never reports an outage as a pass.

Pangram 4 is the production model, pinned by name. Pangram bills it at $0.05 per started 100 words, so a 400-word text costs about $0.20, and the check prints the estimate. `PANGRAM_MODEL` overrides the pin.

## Usage

Ask for it directly, or point it at a file:

```
Personify this text: [paste text]
```

```
Personify the writing in docs/launch-post.md
```

The check itself runs standalone too. Redirect the file into stdin rather than piping through `echo`, because the stamp is keyed to the exact bytes and `echo` appends a newline:

```bash
python3 scripts/pangram_check.py < body.md
```

Every result also writes a check record to `~/.config/personify/checks/<sha256>.json`, keyed the same way, and the review gate's `stage` step refuses to queue a file with no matching record. So the redirect decides not just what the stamp is keyed to, but whether the text can be staged at all.

Exit codes: 0 pass, 2 AI, 3 mixed, 4 skipped (under the word floor), 5 unavailable.

## Voice guide

Personify on its own makes prose non-robotic but not distinctive: clean, competent, anonymous. The other half is a voice guide, and 2.0 leans on it harder than 1.x did, since it is now the main thing making output sound like a particular person.

At load time (`SKILL.md` Step 0), Personify looks for a `VOICE.md`, checking in order: the `PERSONIFY_VOICE` environment variable, then `~/.config/personify/VOICE.md` (honoring `XDG_CONFIG_HOME`), then the skill's own directory for repo-local development. The first one found wins, is read in full, and is treated as authoritative. If none is found, Personify runs in generic mode and says so.

`VOICE.md` describes how one specific person actually writes, compiled from a corpus of their own writing. It is personal and git-ignored, exactly like `.env`. The committed [`VOICE.example.md`](VOICE.example.md) documents the structure without containing anyone's actual voice.

```bash
mkdir -p ~/.config/personify
cp VOICE.example.md ~/.config/personify/VOICE.md   # then edit, or have an agent build it
```

Don't keep your real `VOICE.md` inside the installed plugin directory: plugins install into a version-pinned path that is replaced on every upgrade, so a guide kept there is lost the next time the plugin updates.

**If you also have this repo checked out,** symlink instead of copying. Step 0 takes the first path that exists, so a config copy shadows the repo one: you edit `VOICE.md` in the checkout, the skill keeps loading the config copy, and the edits never take effect.

```bash
ln -sf "$PWD/VOICE.md" ~/.config/personify/VOICE.md
```

To check which file is actually live: `ls -l ~/.config/personify/VOICE.md`.

## Works with pr-review

Personify is the last prose pass on the path from "review this PR" to a posted comment that reads like a person wrote it.

[pr-review](https://github.com/smartwatermelon/pr-review) calls personify directly: it drafts the review, then runs the draft through this skill before showing it to you for approval. If personify isn't installed, pr-review says so and shows the plain draft rather than failing.

**Personify's output is final. Do not chain a further compression pass onto it.** A second pass that strips actors and full sentences undoes the rule that puts a person back in the sentence, which is one of the seven hard rules here. A `VOICE.md` outranks any such pass anyway: if your voice guide says you write in complete sentences, that is the target.

## Development

No build step. The validator and the test suite are the local checks:

```bash
python3 scripts/validate_skill.py
python3 -m unittest discover -s tests -v
cd mcp-server && npm test
```

The validator checks frontmatter keys, asserts `SKILL.md`'s version matches `.claude-plugin/plugin.json` exactly, and fails on any tracked Markdown file still citing a lettered pattern group from the deleted 1.x taxonomy.

## License

MIT. See [LICENSE](LICENSE) for the full text and provenance note.
