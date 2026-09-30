#!/usr/bin/env python3
"""Check generated GitHub text against its length cap (140 characters per unit).

Usage: length_check.py --kind K [--title T] < text, or --diff < unified-diff.
Exit 0 ok, 1 over a cap, 5 bad usage.
"""
from __future__ import annotations

import argparse
import ast
import os
import re
import subprocess
import sys
from collections.abc import Callable
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
# Git trailers need a hyphenated token, so prose like "Why: ..." still counts.
_TRAILER = re.compile(
    r"^[A-Za-z][A-Za-z0-9]*(-[A-Za-z0-9]+)+: \S"
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


# Drops fences, doctests (docstring only) and a final trailer paragraph; whitespace runs collapse.
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


class Block(NamedTuple):
    path: str
    line: int
    kind: str
    text: str


_HASH_EXTS = {".py", ".sh", ".bash", ".rb", ".yaml", ".yml", ".toml"}
_SLASH_EXTS = {
    ".js", ".jsx", ".ts", ".tsx", ".go", ".rs", ".swift",
    ".c", ".h", ".cc", ".cpp", ".hpp", ".java", ".kt",
}  # fmt: skip
_HUNK = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@")

Segment = list[tuple[int, str]]


def _added_segments(diff: str) -> list[tuple[str, list[Segment]]]:
    """Split a unified diff into (path, segments of consecutive added lines)."""
    files: list[tuple[str, list[Segment]]] = []
    segments: list[Segment] | None = None
    in_hunk = False
    lineno = 0
    for raw in diff.replace("\r\n", "\n").split("\n"):
        if raw.startswith("diff "):
            segments, in_hunk = None, False
        elif not in_hunk and raw.startswith("+++ "):
            path = raw[4:].rstrip("\t").strip('"')
            if path == "/dev/null":
                segments = None
            else:
                segments = []
                # Also covers diff.mnemonicPrefix (i/, w/, c/).
                files.append((re.sub(r"^[abciwo]/", "", path), segments))
        elif (m := _HUNK.match(raw)) and segments is not None:
            in_hunk, lineno = True, int(m.group(1))
            segments.append([])
        elif in_hunk and segments is not None:
            if raw.startswith("+"):
                segments[-1].append((lineno, raw[1:]))
                lineno += 1
            elif raw.startswith("\\"):
                continue
            elif raw.startswith("-"):
                segments.append([])
            else:
                segments.append([])
                lineno += 1
    return files


def _take_block(seg: Segment, i: int, opener: str) -> tuple[str, int]:
    lines: list[str] = []
    j = i
    while j < len(seg):
        s = seg[j][1].strip()
        if j == i:
            s = s[len(opener):]
        closed = "*/" in s
        if closed:
            s = s[: s.index("*/")]
        lines.append(s if j == i else re.sub(r"^\*+\s?", "", s))
        j += 1
        if closed:
            break
    return "\n".join(lines), j


def _scan(seg: Segment, ext: str, skip: frozenset[int] = frozenset()) -> list[Block]:
    """Blocks in one run of added lines; path is filled in by the caller.

    Lines in `skip` are string-literal lines and never start or extend a comment.
    """
    hash_family = ext in _HASH_EXTS or ext == ""
    marker = "#" if hash_family else "//"
    out: list[Block] = []
    run: list[tuple[int, str]] = []

    def flush() -> None:
        if run:
            out.append(Block("", run[0][0], "code-comment", "\n".join(t for _, t in run)))
            run.clear()

    i = 0
    while i < len(seg):
        no, s = seg[i][0], seg[i][1].strip()
        if no in skip:
            flush()
            i += 1
            continue
        if s.startswith(marker) and not s.startswith("#!"):
            run.append((no, re.sub(r"^" + re.escape(marker[0]) + r"+\s?", "", s)))
            i += 1
            continue
        flush()
        kind, text, nxt = "", "", i + 1
        if not hash_family and s.startswith("/*"):
            doc = s.startswith("/**") and not s.startswith("/**/")
            kind = "docstring" if doc else "code-comment"
            text, nxt = _take_block(seg, i, "/**" if doc else "/*")
        if kind:
            out.append(Block("", no, kind, text))
        i = nxt
    flush()
    return out


_OPEN_QUOTE = re.compile(r"^[rRuUbBfF]{0,2}(\"{3}|'{3}|\"|')")
_CLOSE_QUOTE = re.compile(r"(\"{3}|'{3}|\"|')\s*$")


def _python_strings(source: str) -> tuple[list[tuple[int, int]], frozenset[int]] | None:
    """Docstring (first, last) line spans and every line inside a multi-line string."""
    try:
        tree = ast.parse(source)
    except (SyntaxError, ValueError):
        return None
    docs: list[tuple[int, int]] = []
    string_lines: set[int] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            if node.end_lineno and node.end_lineno > node.lineno:
                string_lines.update(range(node.lineno, node.end_lineno + 1))
        if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            first = node.body[0] if node.body else None
            if (
                isinstance(first, ast.Expr)
                and isinstance(first.value, ast.Constant)
                and isinstance(first.value.value, str)
                and first.end_lineno
            ):
                docs.append((first.lineno, first.end_lineno))
    return sorted(docs), frozenset(string_lines)


def _python_docstrings(
    path: str, added: dict[int, str], read_file: Callable[[str], str | None] | None
) -> tuple[list[Block], frozenset[int]]:
    source = read_file(path) if read_file else None
    found = _python_strings(source) if source is not None else None
    if found is None:
        return [], frozenset()
    docs, string_lines = found
    blocks: list[Block] = []
    for lo, hi in docs:
        lines = [(n, added[n].strip()) for n in range(lo, hi + 1) if n in added]
        if not lines:
            continue
        texts = []
        for n, t in lines:
            if n == lo:
                t = _OPEN_QUOTE.sub("", t, count=1)
            if n == hi:
                t = _CLOSE_QUOTE.sub("", t, count=1)
            texts.append(t)
        blocks.append(Block(path, lines[0][0], "docstring", "\n".join(texts)))
    return blocks, string_lines


def comment_blocks(
    diff: str, read_file: Callable[[str], str | None] | None = None
) -> list[Block]:
    """Code comments and docstrings that a unified diff adds.

    Python docstrings need the new file text from `read_file(path)`; without it
    (or if it does not parse) a .py file yields no docstring blocks.
    """
    blocks: list[Block] = []
    for path, segments in _added_segments(diff):
        ext = os.path.splitext(path)[1]
        first = next((seg[0][1] for seg in segments if seg), "")
        if ext == "" and not first.startswith("#!"):
            continue
        if ext not in _HASH_EXTS | _SLASH_EXTS | {""}:
            continue
        found: list[Block] = []
        skip: frozenset[int] = frozenset()
        if ext == ".py":
            added = {n: t for seg in segments for n, t in seg}
            found, skip = _python_docstrings(path, added, read_file)
        for seg in segments:
            found.extend(b._replace(path=path) for b in _scan(seg, ext, skip))
        blocks.extend(sorted(found, key=lambda b: b.line))
    return blocks


def _staged_file(path: str) -> str | None:
    try:
        r = subprocess.run(["git", "show", f":{path}"], capture_output=True, check=False)
    except OSError:
        return None
    return r.stdout.decode("utf-8", errors="replace") if r.returncode == 0 else None


class _Parser(argparse.ArgumentParser):
    def error(self, message: str):
        self.print_usage(sys.stderr)
        print(f"length_check: {message}", file=sys.stderr)
        raise SystemExit(EXIT_USAGE)


def main(argv: list[str] | None = None) -> int:
    parser = _Parser(prog="length_check.py", description=__doc__.split("\n")[0])
    parser.add_argument("--kind", choices=sorted(CAPS))
    parser.add_argument("--title")
    parser.add_argument("--diff", action="store_true")
    args = parser.parse_args(argv)
    if args.diff and (args.kind or args.title is not None):
        parser.error("--diff cannot be combined with --kind or --title")
    if not args.diff and not args.kind:
        parser.error("--kind is required unless --diff is given")

    if args.diff:
        # A commit must not fail because some file in the diff is not UTF-8.
        diff = sys.stdin.buffer.read().decode("utf-8", errors="replace")
        over = False
        for b in comment_blocks(diff, _staged_file):
            cap = CAPS[b.kind][1]
            count = measure(b.text, b.kind)
            if cap is not None and count > cap:
                over = True
                print(f"{b.path}:{b.line}: {b.kind} {count}/{cap} over by {count - cap}")
        return EXIT_OVER if over else EXIT_OK

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
