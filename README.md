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

## License

MIT. See [LICENSE](LICENSE) for the full text and provenance note.
