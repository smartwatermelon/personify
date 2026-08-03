# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

This repository *is* a single Claude Code Skill, packaged as an installable plugin: `SKILL.md` at the repo root defines "personify," a skill that edits prose to remove statistical fingerprints of LLM-generated writing (em dashes, inflated-significance phrasing, rule-of-three padding, vague attribution, etc.) while preserving the writer's actual voice. `SKILL.md`'s content is the entire functional deliverable; everything else in the repo exists to distribute and validate that one file.

- `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` make `/plugin marketplace add smartwatermelon/personify` work in Claude Code.
- `.github/workflows/validate.yml` runs `scripts/validate_skill.py` on push/PR: checks SKILL.md's frontmatter has required keys and no non-portable ones (`compatibility`, `allowed-tools` break plugin-marketplace validation), and that pattern-group headings run A, B, C... with no gaps. It deliberately does *not* cross-check version numbers against blader/humanizer's releases the way that project's own validator does — personify's version history isn't kept in lockstep with anything external. It also doesn't enforce a bump on every SKILL.md change, but one is needed anyway: see the version-bump note below.
- `README.md` and `LICENSE` are independently written; `LICENSE`'s provenance note credits blader/humanizer for the original taxonomy this skill grew out of, without making this repo track that project's releases.

The `.claude/` directory (note: no hyphen, different from `.claude-plugin/`) is boilerplate from a git template (project-specific config/hook scaffolding for Andrew's global Claude Code infrastructure at `~/.claude/`). Nothing in it is customized for this repo — `config.sh.template` is unmodified and `hooks/extensions/` only has the disabled example.

## Working on this repo

There is no build step. The only thing to run locally is the validator:

```bash
python3 scripts/validate_skill.py
```

- The skill's pattern taxonomy (sections A–U, growing) is Andrew's own, extended over time as he flags new AI-writing tells in conversation. When adding a new pattern group, follow the existing format: a short label, a description of the tell, and a one-line fix. Append new letters rather than renumbering existing ones — the Provenance section at the bottom references which pattern ranges came from which source conversations.
- The "What NOT to flag" section exists to prevent over-correction (flattening legitimate human writing that happens to hit one pattern once). Keep new patterns consistent with that calibration: look for clusters, not single hits.
- Per the skill's own hard rule (Process step 5), no em dashes or en dashes should appear in rewritten output — this applies to edits to `SKILL.md` itself too, for consistency.
- This is explicitly framed as independent of, not synced with, the upstream `blader/humanizer` project it forked in spirit from — don't try to reconcile pattern lists against that repo.
- **Bump `version` on every content change to `SKILL.md`, in both `SKILL.md`'s frontmatter and `.claude-plugin/plugin.json`, keeping the two in lockstep with each other.** Installed plugin caches (`~/.claude/plugins/cache/`) key off this version field: `/plugin update` treats an unchanged version as nothing to pull, so a content edit with no version bump leaves users on stale, cached content even after the marketplace clone itself is current. This is unrelated to the point above about not syncing versions to blader/humanizer; that's about not chasing a third party's release numbers, not about never bumping this repo's own.
