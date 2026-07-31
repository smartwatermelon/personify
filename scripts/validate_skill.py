#!/usr/bin/env python3
"""Sanity-check SKILL.md structure. Not a version-lockstep validator: this repo
tracks its own pattern list independently rather than syncing against another
project's release cadence."""

from __future__ import annotations

import re
import string
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILL_PATH = ROOT / "SKILL.md"


def fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    if not SKILL_PATH.exists():
        fail("SKILL.md not found")

    text = SKILL_PATH.read_text()

    frontmatter_match = re.match(r"\A---\n(.*?)\n---\n", text, re.DOTALL)
    if frontmatter_match is None:
        fail("SKILL.md must start with YAML frontmatter")
    frontmatter = frontmatter_match.group(1)

    for required_key in ("name:", "description:", "version:", "license:"):
        if not re.search(rf"(?m)^{re.escape(required_key)}", frontmatter):
            key = required_key[:-1]
            fail(f"SKILL.md frontmatter missing required key: {key}")

    for nonportable_key in ("compatibility:", "allowed-tools:"):
        if re.search(rf"(?m)^{re.escape(nonportable_key)}", frontmatter):
            key = nonportable_key[:-1]
            fail(f"Remove nonportable frontmatter key: {key}")

    heading_letters = re.findall(r"(?m)^### ([A-Z])\. ", text)
    if not heading_letters:
        fail("No pattern-group headings found (expected '### A. ...' style)")

    expected = list(string.ascii_uppercase[: len(heading_letters)])
    if heading_letters != expected:
        fail(
            "Pattern-group headings must run A, B, C... with no gaps "
            f"or repeats; found {heading_letters}"
        )

    first, last = heading_letters[0], heading_letters[-1]
    count = len(heading_letters)
    print(f"SKILL.md is valid: {count} pattern groups ({first}-{last})")


if __name__ == "__main__":
    main()
