# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

This repository *is* a single Claude Code Skill, packaged as an installable plugin: `SKILL.md` at the repo root defines "personify," a skill that keeps prose from reading as machine-written while preserving the writer's actual voice. As of 2.0 the runtime deliverable is five tracked paths, not one file: `SKILL.md`, `scripts/pangram_check.py` (the detector client), `scripts/length_check.py` (the length-cap checker), `rules/structure.md` (the PR-description and code-comment rules), and `VOICE.example.md` (the fallback Step 0 reads when no voice guide exists). Everything else exists to distribute and validate those.

**2.0 was a breaking rewrite.** The lettered A-Z taxonomy, the two-arm A/B harness, the blind reviewer, the evidence corpus, and the consolidation command are all deleted. What replaces them: draft guided by `VOICE.md` and seven hard rules, apply model judgment about what reads as machine-written, then submit the result to Pangram. A `Human` verdict passes; anything else stops and reports. There is no edit loop, and adding one back is the mistake the SKILL.md text is written to prevent: editing toward the detector was measured and does not move the verdict.

- `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` make `/plugin marketplace add twistedmelonman/personify` work in Claude Code. `plugin.json`'s `skills` field points at the repo root (`./`), since `SKILL.md` lives there rather than under the conventional `skills/<name>/` subdirectory; without it, the plugin loads and the skill still works, but Claude Desktop's plugin detail panel won't list it under "Skills." Keep this field if `SKILL.md`'s location ever changes.
- `.github/workflows/validate.yml` runs `scripts/validate_skill.py` and the unittest suite on push/PR. The validator checks SKILL.md's frontmatter has required keys and no non-portable ones (`compatibility`, `allowed-tools` break plugin-marketplace validation), asserts SKILL.md's `version` matches `.claude-plugin/plugin.json` exactly, requires `rules/structure.md` to exist and be referenced, and fails on any tracked Markdown file still citing a lettered pattern group. That last check is the guard against the half-state the 2.0 rewrite existed to prevent. `docs/superpowers/` and `docs/plans/` are exempt: they are dated design records of the harness that 2.0 replaced, so a group letter inside one is history rather than a dangling reference.
- `README.md` and `LICENSE` are independently written; `LICENSE`'s provenance note credits blader/humanizer for the original taxonomy this skill grew out of, without making this repo track that project's releases.
- `mcp-server/` is a separate Node/TypeScript package (its own `package.json`, tests via `vitest`) that bridges Claude Desktop to this skill by shelling out to the Claude Code CLI. It is versioned independently of `SKILL.md`/`plugin.json`: the lockstep version-bump rule below applies only to the skill content, not to this bridge. See `mcp-server/README.md`.

The `.claude/` directory, with no hyphen and distinct from `.claude-plugin/`, is boilerplate from a git template: project-specific config and hook scaffolding for Andrew's global Claude Code infrastructure at `~/.claude/`. Nothing in it is customized for this repo. `config.sh.template` is unmodified and `hooks/extensions/` only has the disabled example.

## Working on this repo

There is no build step. The only thing to run locally is the validator:

```bash
python3 scripts/validate_skill.py
python3 -m unittest discover -s tests -v
```

`mcp-server/` has its own vitest suite: `cd mcp-server && npm test`.

- **No lettered pattern groups.** The taxonomy is gone and no tracked file may cite a lettered group again; `scripts/validate_skill.py` fails the build on any surviving reference. A new rule is written as prose in the relevant SKILL.md section, or as a voice-guide rule if it is about what a message should say rather than how it reads.
- **The two surviving universal rules are the GitHub PR description structure and the code comment ratio.** Both outrank a personal `VOICE.md`, and both exist because Pangram cannot see structure: it will pass a ceremonial PR description whose prose reads human. They live in SKILL.md (canonical, with worked examples) and in `rules/structure.md` (compact restatement). Edit both together.
- Register-specific content rules (work register, task boards, PR review comments) belong in the user's own `VOICE.md` under `Register-specific notes`, not in SKILL.md. `VOICE.md` and `VOICE.corpus.md` are gitignored and are never edited from this repo; only `VOICE.example.md` is tracked.
- The "What NOT to flag" section exists to prevent over-correction (flattening legitimate human writing that happens to hit one pattern once). Keep new patterns consistent with that calibration: look for clusters, not single hits.
- Per the skill's own hard rule 1, no em dashes or en dashes should appear in rewritten output. This applies to edits to `SKILL.md` and `VOICE.example.md` themselves too, for consistency.
- This is explicitly framed as independent of, not synced with, the upstream `blader/humanizer` project it forked in spirit from. Don't try to reconcile rules against that repo.
- **Bump `version` on every content change to anything that ships to installs (`SKILL.md`, `rules/structure.md`, `scripts/pangram_check.py`, `scripts/length_check.py`, `VOICE.example.md`), in both `SKILL.md`'s frontmatter and `.claude-plugin/plugin.json`, keeping the two in lockstep with each other.** Installed plugin caches (`~/.claude/plugins/cache/`) key off this version field: `/plugin update` treats an unchanged version as nothing to pull, so a content edit with no version bump leaves users on stale, cached content even after the marketplace clone itself is current. This is unrelated to the point above about not syncing versions to blader/humanizer; that's about not chasing a third party's release numbers, not about never bumping this repo's own.
