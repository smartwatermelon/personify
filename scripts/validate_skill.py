#!/usr/bin/env python3
"""Sanity-check the 2.0 skill: frontmatter, version lockstep, and the guard
against a surviving taxonomy reference.

The A-Z taxonomy is gone as of 2.0, so this no longer validates letter
ascension or requires rules/taxonomy.md. What it validates instead is the
half-state PR2 existed to prevent: a tracked file that still cites a lettered
pattern group after the groups themselves were deleted.

Importable: validate(root) returns a list of failure strings and never exits,
so tests can drive it against a temporary tree. main() is what exits nonzero.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

REQUIRED_KEYS = ("name:", "description:", "version:", "license:")
NONPORTABLE_KEYS = ("compatibility:", "allowed-tools:")

# "group W", "Groups V and W", "GROUP Z". Case-insensitive on the word because
# Provenance used "Group Z" at a sentence start, which a lowercase-only pattern
# misses. Matched against the whole file, and the gap may hold one newline,
# because prose here wraps at 80 columns and splits "group" from its letter. A
# blank line may not, so a paragraph ending in "groups" does not join the next.
GROUP_REFERENCE = re.compile(r"\b(?i:groups?)(?:[ \t]+|[ \t]*\n[ \t]*)[A-Z]\b")

# Dated design records of the A/B harness that 2.0 replaced. They describe what
# the repo used to do, so a group letter inside one is history rather than a
# dangling reference, and rewriting them would falsify the record.
ARCHIVE_PREFIXES = ("docs/superpowers/", "docs/plans/")


def tracked_markdown(root: Path) -> list[Path]:
    """List tracked .md files via git, never rglob.

    VOICE.md and VOICE.corpus.md are gitignored and full of group references
    on Andrew's own machine. An rglob scan would fail locally and pass in CI,
    which is the worst shape a check can have. For the same reason a git
    failure raises rather than returning an empty list: an empty list scans
    nothing and passes.
    """
    result = subprocess.run(
        ["git", "ls-files", "-z", "--", "*.md"],
        cwd=root,
        capture_output=True,
        text=True,
        check=True,
    )
    return [root / name for name in result.stdout.split("\0") if name]


def is_archive(root: Path, path: Path) -> bool:
    relative = path.relative_to(root).as_posix()
    return relative.startswith(ARCHIVE_PREFIXES)


def frontmatter_of(text: str) -> str | None:
    match = re.match(r"\A---\n(.*?)\n---\n", text, re.DOTALL)
    return None if match is None else match.group(1)


def frontmatter_version(frontmatter: str) -> str | None:
    match = re.search(r"(?m)^version:\s*(.+?)\s*$", frontmatter)
    return None if match is None else match.group(1).strip().strip("\"'")


def validate(root: Path) -> list[str]:
    failures: list[str] = []

    skill_path = root / "SKILL.md"
    if not skill_path.exists():
        return ["SKILL.md not found"]
    text = skill_path.read_text(encoding="utf-8")

    frontmatter = frontmatter_of(text)
    if frontmatter is None:
        return ["SKILL.md must start with YAML frontmatter"]

    for required_key in REQUIRED_KEYS:
        if not re.search(rf"(?m)^{re.escape(required_key)}", frontmatter):
            failures.append(
                f"SKILL.md frontmatter missing required key: {required_key[:-1]}"
            )

    for nonportable_key in NONPORTABLE_KEYS:
        if re.search(rf"(?m)^{re.escape(nonportable_key)}", frontmatter):
            failures.append(
                f"Remove nonportable frontmatter key: {nonportable_key[:-1]}"
            )

    # Version lockstep. Installed plugin caches key off plugin.json's version,
    # so a SKILL.md edit that leaves the two apart ships stale content to every
    # install that already has the old version cached.
    manifest_path = root / ".claude-plugin" / "plugin.json"
    skill_version = frontmatter_version(frontmatter)
    if not manifest_path.exists():
        failures.append(".claude-plugin/plugin.json not found")
    else:
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as err:
            failures.append(f".claude-plugin/plugin.json is unreadable: {err}")
        else:
            manifest_version = manifest.get("version")
            if skill_version != manifest_version:
                failures.append(
                    f"version mismatch: SKILL.md says {skill_version!r} and "
                    f".claude-plugin/plugin.json says {manifest_version!r}. "
                    "They must match exactly."
                )

    # The structural rules Pangram cannot see live in their own file, because
    # they survive independently of any detector.
    structure_path = root / "rules" / "structure.md"
    if not structure_path.exists():
        failures.append("rules/structure.md not found")
    elif "rules/structure.md" not in text:
        failures.append("SKILL.md must reference rules/structure.md")

    # The length checker ships with the skill and is the one definition of the
    # caps, so a missing or unreferenced copy leaves the caps unenforceable.
    length_path = root / "scripts" / "length_check.py"
    if not length_path.exists():
        failures.append("scripts/length_check.py not found")
    elif "scripts/length_check.py" not in text:
        failures.append("SKILL.md must reference scripts/length_check.py")

    # The guard this validator exists for. A lettered group reference in a
    # tracked file after the taxonomy is gone points at nothing.
    try:
        tracked = tracked_markdown(root)
    except (OSError, subprocess.CalledProcessError) as err:
        failures.append(
            f"git ls-files failed, so the group-reference scan could not run: {err}"
        )
        tracked = []
    for path in tracked:
        if is_archive(root, path):
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except OSError:
            continue
        for match in GROUP_REFERENCE.finditer(content):
            number = content.count("\n", 0, match.start()) + 1
            relative = path.relative_to(root).as_posix()
            failures.append(
                f"{relative}:{number} references a lettered pattern group, "
                "which 2.0 deleted. State the rule in prose instead."
            )

    return failures


def main() -> None:
    failures = validate(ROOT)
    if failures:
        for failure in failures:
            print(f"FAIL: {failure}", file=sys.stderr)
        sys.exit(1)
    print("SKILL.md is valid: frontmatter, version lockstep, no group references")


if __name__ == "__main__":
    main()
