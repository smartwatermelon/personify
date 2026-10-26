# Personify

An agent skill that keeps text from reading as machine-written before anyone else reads it. It covers emails, PR descriptions and review comments, docs, blog drafts, and essays. The draft follows your own register, stays inside a length cap for its surface, and keeps the structural rules for PR descriptions and code comments. It is a style and voice advisor: it does not certify the result.

Personify 2.0 was a break from 1.x. The hand-maintained taxonomy of AI-writing tells is gone, along with the A/B harness and the evidence corpus that fed it. Two things replace them: a per-user voice guide, and current model judgment about what reads as machine-written. 3.0 removes the AI-text detector check that 2.x ran on every result. It cost money on every call and decided nothing a human reviewer did not decide anyway.

It started as a structural cousin of [blader/humanizer](https://github.com/blader/humanizer), with the same idea and the same MIT license, and [LICENSE](LICENSE) credits it. The wording, the rules, and the version history here are independent and were never synced against that project.

## How it works

1. **Draft**, guided by your `VOICE.md` and seven hard rules, among them no dashes, never invent a fact, preserve every fact, and name the actor.
2. **Fit the cap.** The length checker, `scripts/length_check.py`, counts the text against the cap for its kind: commit, PR, comment, and so on. It says by how much the text is over, and the draft is rewritten until it fits.
3. **Return the text.** What comes back is what the writer would send on that surface, as-is.

## Structure, not just prose

Two rules are about how an artifact is *shaped*, not how its prose *reads*. Take a pull request description with ceremonial headers, bolded labels, and a "ready to merge upon approval" sign-off. Anything that scores prose will pass it, as long as the sentences read human.

- **GitHub PR descriptions.** No headers, no bullets, no bold, no dashes. Four parts as plain prose: the problem, the evidence, the solution, references.
- **Code comments.** Never more than 1:1 comment lines to code lines, and far lower in practice. A comment is for what the code cannot say.

Both are universal rules and both outrank a personal `VOICE.md`, which is otherwise authoritative. They also live in [`rules/structure.md`](rules/structure.md) for a caller that wants them without the rest of the skill.

## Installation

The runtime artifact is the skill directory, not `SKILL.md` alone: `scripts/length_check.py`, `rules/structure.md`, and `VOICE.example.md` ship with it. Step 0 falls back to `VOICE.example.md` from the skill directory when no voice guide exists.

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

Claude Desktop reads skills from its own skills directory. Copy the same paths into a `personify/` folder there, then restart Desktop.

In practice Desktop has been unreliable about trusting its own filesystem connector state and about Step 0's "load `VOICE.md` and treat it as authoritative" instruction. See [`mcp-server/README.md`](mcp-server/README.md) for a bridge that routes Desktop's calls through the Claude Code CLI instead.

## Usage

Ask for it directly, or point it at a file:

```
Personify this text: [paste text]
```

```
Personify the writing in docs/launch-post.md
```

The length check runs standalone too:

```bash
python3 scripts/length_check.py --kind pr < body.md
```

Exit codes: 0 inside the cap, 1 over it, 5 bad usage or an internal error.

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
