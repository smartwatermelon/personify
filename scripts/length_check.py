#!/usr/bin/env python3
"""Check generated GitHub text against its length cap.

One unit is 140 characters. This file is the single place the caps live.
Reads the text as UTF-8 bytes on stdin, normalizes CRLF, and prints one line
per part:

    python3 length_check.py --kind pr --title "Add caps" < body.md

    <kind> <part>: <count>/<cap> ok
    <kind> <part>: <count>/<cap> over by <n>

Counting: fenced code blocks are dropped (docstrings also drop `>>>` blocks),
so is a final trailer paragraph, every whitespace run becomes one space, and
the result is trimmed and counted in code points.

Exit codes:
    0  every part is within its cap
    1  at least one part is over
    5  bad usage: unknown kind, --title with commit, undecodable stdin
"""

from __future__ import annotations

import argparse
import re
import sys
from typing import NamedTuple

CAPS: dict[str, tuple[int | None, int | None]] = {
    "commit": (50, 140),
    "pr": (70, 280),
    "issue": (70, None),
    "line-comment": (None, 280),
    "pr-comment": (None, 140),
    "code-comment": (None, 140),
    "docstring": (None, 280),
}

EXIT_OK = 0
EXIT_OVER = 1
EXIT_USAGE = 5

_FENCE = re.compile(r"^\s{0,3}(`{3,}|~{3,})")
_TRAILER = re.compile(
    r"^[A-Za-z][A-Za-z0-9-]*: \S"
    r"|^(close[sd]?|fix(e[sd])?|resolve[sd]?) ([\w.-]+/[\w.-]+)?#\d+$",
    re.IGNORECASE,
)


class Result(NamedTuple):
    part: str
    count: int
    cap: int | None

    @property
    def over(self) -> bool:
        return self.cap is not None and self.count > self.cap


def _drop_fences(lines: list[str]) -> list[str]:
    kept: list[str] = []
    fence: str | None = None
    for line in lines:
        m = _FENCE.match(line)
        if fence is None:
            if m:
                fence = m.group(1)
            else:
                kept.append(line)
        elif m and m.group(1)[0] == fence[0] and len(m.group(1)) >= len(fence):
            fence = None
    return kept


def _drop_doctests(lines: list[str]) -> list[str]:
    kept: list[str] = []
    in_doctest = False
    for line in lines:
        if line.lstrip().startswith(">>>"):
            in_doctest = True
        elif not line.strip():
            in_doctest = False
        if not in_doctest:
            kept.append(line)
    return kept


def _drop_trailer(lines: list[str]) -> list[str]:
    end = len(lines)
    while end and not lines[end - 1].strip():
        end -= 1
    start = end
    while start and lines[start - 1].strip():
        start -= 1
    last = lines[start:end]
    # A lone paragraph is prose, not a trailer block.
    if start == 0 or not last:
        return lines
    if all(_TRAILER.match(line.strip()) for line in last):
        return lines[:start]
    return lines


def measure(text: str, kind: str) -> int:
    if kind not in CAPS:
        raise ValueError(f"unknown kind: {kind}")
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    lines = _drop_fences(lines)
    if kind == "docstring":
        lines = _drop_doctests(lines)
    lines = _drop_trailer(lines)
    return len(" ".join("\n".join(lines).split()))


def check_text(kind: str, body: str, title: str | None = None) -> list[Result]:
    if kind not in CAPS:
        raise ValueError(f"unknown kind: {kind}")
    title_cap, body_cap = CAPS[kind]
    if kind == "commit":
        if title is not None:
            raise ValueError("--title is not accepted for commit; the title is the first line")
        first, _, rest = body.replace("\r\n", "\n").replace("\r", "\n").partition("\n")
        title, body = first, rest
    results: list[Result] = []
    if title is not None:
        results.append(Result("title", measure(title, kind), title_cap))
    results.append(Result("body", measure(body, kind), body_cap))
    return results


class _Parser(argparse.ArgumentParser):
    def error(self, message: str):
        self.print_usage(sys.stderr)
        print(f"length_check: {message}", file=sys.stderr)
        raise SystemExit(EXIT_USAGE)


def main(argv: list[str] | None = None) -> int:
    parser = _Parser(prog="length_check.py", description=__doc__.split("\n")[0])
    parser.add_argument("--kind", required=True, choices=sorted(CAPS))
    parser.add_argument("--title")
    args = parser.parse_args(argv)

    try:
        text = sys.stdin.buffer.read().decode("utf-8")
        results = check_text(args.kind, text, args.title)
    except ValueError as exc:
        print(f"length_check: {exc}", file=sys.stderr)
        return EXIT_USAGE

    for r in results:
        cap = "none" if r.cap is None else str(r.cap)
        status = f"over by {r.count - r.cap}" if r.over else "ok"
        print(f"{args.kind} {r.part}: {r.count}/{cap} {status}")
    return EXIT_OVER if any(r.over for r in results) else EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
