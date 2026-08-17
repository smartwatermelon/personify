# Personify

An agent skill that strips the statistical fingerprints of LLM writing out of prose before it goes out the door: emails, PR descriptions and review comments, docs, blog drafts, essays. It runs as a plain Markdown skill (`SKILL.md`), so any harness that supports skill-style instructions can use it.

Personify tracks its own pattern list on its own schedule. It started as a structural cousin of [blader/humanizer](https://github.com/blader/humanizer) (same idea, same MIT license, credited in [LICENSE](LICENSE)), but the taxonomy, wording, and version history here are independent and not synced against that project.

## Installation

### Claude Code plugin

```
/plugin marketplace add smartwatermelon/personify
/plugin install personify@personify
```

Once installed, invoke it as `/personify:personify`.

### Claude Code, project-local

Clone or copy `SKILL.md` into the project's skill directory so it's available to collaborators who check out the repo:

```bash
mkdir -p .claude/skills/personify
cp SKILL.md .claude/skills/personify/
```

### Claude Code, global

Copy it into your user-level skills directory instead, so it's available in every project:

```bash
mkdir -p ~/.claude/skills/personify
cp SKILL.md ~/.claude/skills/personify/
```

Reload or start a new session after installing.

### Claude Desktop

Claude Desktop reads skills from its own skills directory. Copy `SKILL.md` into a `personify/` folder there, matching the layout above, then restart Claude Desktop to pick it up.

### Any other harness

The entire runtime artifact is `SKILL.md`. Any agent harness that loads Markdown-based skills can use it by copying that one file into wherever the harness expects skill definitions.

### Claude Desktop via MCP bridge (recommended over the raw-skill route above)

Claude Desktop has, in practice, been unreliable about trusting its own
filesystem connector state and about Step 0's "load `VOICE.md` and treat it
as authoritative" instruction. See `mcp-server/README.md` for an MCP server
that routes Desktop's personify calls through the Claude Code CLI instead,
avoiding that failure mode entirely.

## Usage

Ask for it directly, or point it at a file:

```
Personify this text: [paste text]
```

```
Personify the writing in docs/launch-post.md
```

## What it does

`SKILL.md` covers the standard taxonomy of AI-writing tells (inflated significance, empty vocabulary clusters, copula avoidance, filler and hedging, chatbot residue, and more), plus patterns added after reviewing specific pieces of writing that leaned on AI-adjacent techniques without being AI-written. It also has a dedicated section for GitHub PR descriptions and review comments, where the tell is usually structural (unearned headers, defensive completeness) rather than prose-level. It documents what *not* to flag too, so a clean human writer who hits one of these patterns once isn't treated as a false positive. See the file itself for the full pattern list and provenance notes.

## Voice guide

Personify on its own makes prose non-robotic but not distinctive: clean, competent, and anonymous. The other half is an optional voice guide.

At load time (`SKILL.md` Step 0), Personify looks for a `VOICE.md`, checking in order: the `PERSONIFY_VOICE` environment variable, then `~/.config/personify/VOICE.md` (honoring `XDG_CONFIG_HOME`), then the skill's own directory for repo-local development. The first one found wins, is read in full, and is treated as authoritative: where the general pattern list and the voice guide disagree, the voice guide wins. If none is found, Personify runs in generic mode and says so.

`VOICE.md` describes how one specific person actually writes, compiled from a corpus of their own writing (blog posts, essays, long-form email, docs). It is personal and git-ignored, exactly like `.env`. The committed [`VOICE.example.md`](VOICE.example.md) documents the structure and how to build one, without containing anyone's actual voice.

Install the skill however you like, then put your voice guide at the stable path so upgrades never touch it:

```bash
mkdir -p ~/.config/personify
cp VOICE.example.md ~/.config/personify/VOICE.md   # then edit, or have an agent build it
```

Don't keep your real `VOICE.md` inside the installed plugin directory: plugins install into a version-pinned path that is replaced on every upgrade, so a guide kept there is lost the next time the plugin updates.

## Works with pr-review and dumbify

Personify is the middle of three sibling skills that compose into one path from
"review this PR" to a posted comment that reads like a person wrote it:

```text
pr-review    →    personify    →    dumbify
(find it)         (de-AI it)        (compress it)
```

[pr-review](https://github.com/smartwatermelon/pr-review) already calls
personify directly: its Phase 5 drafts the review, then runs the draft through
this skill before showing it to you for approval. If personify isn't installed,
pr-review says so and shows the plain draft rather than failing — the prose pass
isn't load-bearing for the review's substance.

[dumbify](https://github.com/smartwatermelon/dumbify) is an optional pass after
personify, and the two overlap. Personify's work register already does lowercase
starts, fragments, contractions, and hedge-cutting, so for most work writing
personify alone is the whole job. Dumbify pushes the register further than
personify will: its default level 2 is roughly where personify's work register
already lands, and levels 3–4 go past it. Order matters — personify first.
Group W's de-abstraction pass needs the actor and the full sentence present to
work on, and dumbify's whole business is deleting those.

Note that a `VOICE.md` outranks both. If your voice guide says you write in
complete sentences, that wins over dumbify's fragment preference, and stacking
dumbify on top will fight it.

## License

MIT. See [LICENSE](LICENSE) for the full text and provenance note.
