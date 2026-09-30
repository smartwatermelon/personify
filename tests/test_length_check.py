"""Tests for scripts/length_check.py.

Stdlib unittest, per tests/test_pangram_check.py, because CI runs
python3 -m unittest discover.
"""

from __future__ import annotations

import importlib.util
import io
import pathlib
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "length_check.py"


def load_script():
    spec = importlib.util.spec_from_file_location("length_check", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


lc = load_script()


def run_cli(args: list[str], stdin: bytes = b"") -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        input=stdin,
        capture_output=True,
        check=False,
    )


class MeasureTests(unittest.TestCase):
    def test_commit_title_prefix_counts(self):
        r = lc.check_text("commit", "fix(scope): " + "x" * 39 + "\n")
        self.assertEqual((r[0].part, r[0].count, r[0].over), ("title", 51, True))

    def test_commit_title_only_passes(self):
        self.assertFalse(any(x.over for x in lc.check_text("commit", "docs: short\n")))

    def test_body_wrap_costs_nothing(self):
        self.assertEqual(lc.measure("a b\nc", "commit"), lc.measure("a b c", "commit"))

    def test_fenced_code_not_counted(self):
        self.assertEqual(lc.measure("see:\n```\n" + "y" * 500 + "\n```\n", "pr"), 4)

    def test_tilde_fence_not_counted(self):
        self.assertEqual(lc.measure("see:\n~~~~\n" + "y" * 500 + "\n~~~~\n", "pr"), 4)

    def test_trailers_not_counted(self):
        body = "Body.\n\nCloses #12\nFixes owner/repo#3\nCo-authored-by: A <a@b.c>\n"
        self.assertEqual(lc.measure(body, "pr"), 5)

    def test_advances_is_not_a_trailer(self):
        self.assertEqual(lc.measure("Body.\n\nAdvances #106\n", "pr"), len("Body. Advances #106"))

    def test_prose_label_is_not_a_trailer(self):
        body = "Body.\n\nWhy: " + "w" * 200
        self.assertEqual(lc.measure(body, "pr"), len("Body. Why: " + "w" * 200))

    def test_hyphenated_trailers_not_counted(self):
        body = "Body.\n\nSigned-off-by: A <a@b.c>\nChange-Id: I123\n"
        self.assertEqual(lc.measure(body, "pr"), 5)

    def test_single_paragraph_is_not_a_trailer(self):
        self.assertEqual(lc.measure("Note: keep this\n", "pr"), len("Note: keep this"))

    def test_lone_trailer_paragraph_is_counted(self):
        self.assertEqual(lc.measure("Signed-off-by: x\n", "pr"), len("Signed-off-by: x"))

    def test_crlf_same_as_lf(self):
        self.assertEqual(lc.measure("a\r\nb", "pr"), lc.measure("a\nb", "pr"))

    def test_docstring_doctest_not_counted(self):
        self.assertEqual(lc.measure("Add.\n\n>>> add(1, 2)\n3\n", "docstring"), 4)

    def test_doctest_counted_outside_docstring(self):
        self.assertGreater(lc.measure("Add.\n\n>>> add(1, 2)\n3\n", "pr"), 4)

    def test_code_points_not_bytes(self):
        self.assertEqual(lc.measure("éé", "pr"), 2)

    def test_unknown_kind_raises(self):
        with self.assertRaises(ValueError):
            lc.measure("x", "nope")

    def test_title_argument_rejected_for_commit(self):
        with self.assertRaises(ValueError):
            lc.check_text("commit", "x", title="t")


class CapTests(unittest.TestCase):
    def test_caps_match_spec(self):
        self.assertEqual(lc.CAPS["commit"], (50, 140))
        self.assertEqual(lc.CAPS["pr"], (70, 280))
        self.assertEqual(lc.CAPS["issue"], (70, None))
        self.assertEqual(lc.CAPS["line-comment"], (None, 280))
        self.assertEqual(lc.CAPS["pr-comment"], (None, 140))
        self.assertEqual(lc.CAPS["code-comment"], (None, 140))
        self.assertEqual(lc.CAPS["docstring"], (None, 280))
        self.assertEqual(len(lc.CAPS), 7)

    def test_at_cap_passes_one_over_fails(self):
        for kind, (_, cap) in lc.CAPS.items():
            if cap is None:
                continue
            for n, expect_over in ((cap, False), (cap + 1, True)):
                with self.subTest(kind=kind, n=n):
                    if kind == "commit":
                        results = lc.check_text(kind, "t\n\n" + "x" * n)
                    else:
                        results = lc.check_text(kind, "x" * n)
                    body = [r for r in results if r.part == "body"][0]
                    self.assertEqual(body.over, expect_over)

    def test_pr_title_cap(self):
        ok = lc.check_text("pr", "b", title="x" * 70)
        bad = lc.check_text("pr", "b", title="x" * 71)
        self.assertFalse(any(r.over for r in ok))
        self.assertTrue([r for r in bad if r.part == "title"][0].over)

    def test_issue_body_uncapped(self):
        r = lc.check_text("issue", "x" * 5000, title="t")
        self.assertFalse(any(x.over for x in r))


class CliTests(unittest.TestCase):
    def test_ok_exit_0(self):
        p = run_cli(["--kind", "pr-comment"], b"short\n")
        self.assertEqual(p.returncode, 0)
        self.assertEqual(p.stdout.decode(), "pr-comment body: 5/140 ok\n")

    def test_over_exit_1(self):
        p = run_cli(["--kind", "pr-comment"], b"x" * 141)
        self.assertEqual(p.returncode, 1)
        self.assertEqual(p.stdout.decode(), "pr-comment body: 141/140 over by 1\n")

    def test_unknown_kind_exit_5(self):
        self.assertEqual(run_cli(["--kind", "nope"], b"x").returncode, 5)

    def test_missing_kind_exit_5(self):
        self.assertEqual(run_cli([], b"x").returncode, 5)

    def test_title_with_commit_exit_5(self):
        self.assertEqual(run_cli(["--kind", "commit", "--title", "t"], b"x").returncode, 5)

    def test_crlf_normalized(self):
        p = run_cli(["--kind", "pr-comment"], b"a\r\nb\r\n")
        self.assertEqual(p.stdout.decode(), "pr-comment body: 3/140 ok\n")

    def test_commit_prints_both_parts(self):
        p = run_cli(["--kind", "commit"], b"docs: short\n\nbody\n")
        self.assertEqual(
            p.stdout.decode().splitlines(),
            ["commit title: 11/50 ok", "commit body: 4/140 ok"],
        )

    def test_invalid_utf8_exit_5(self):
        self.assertEqual(run_cli(["--kind", "pr"], b"\xff\xfe").returncode, 5)


def hunk(path, start, lines, deleted=0):
    """Build a -U0 unified diff that adds `lines` to `path` at line `start`."""
    out = [
        f"diff --git a/{path} b/{path}",
        "index 1111111..2222222 100644",
        f"--- a/{path}",
        f"+++ b/{path}",
        f"@@ -{start},{deleted} +{start},{len(lines)} @@",
    ]
    out += ["-old"] * deleted
    out += ["+" + line for line in lines]
    return "\n".join(out) + "\n"


TQ = '"' * 3


def diff_of(path, source_lines, added):
    """A -U0 diff of `path` in which exactly the 1-based line numbers `added` are new."""
    out = [f"diff --git a/{path} b/{path}", f"--- a/{path}", f"+++ b/{path}"]
    nums = sorted(added)
    i = 0
    while i < len(nums):
        j = i
        while j + 1 < len(nums) and nums[j + 1] == nums[j] + 1:
            j += 1
        out.append(f"@@ -{nums[i] - 1},0 +{nums[i]},{j - i + 1} @@")
        out += ["+" + source_lines[n - 1] for n in nums[i:j + 1]]
        i = j + 1
    return "\n".join(out) + "\n"


def blocks_of(source_lines, added, path="a.py", readable=True):
    diff = diff_of(path, source_lines, added)
    reader = {path: "\n".join(source_lines) + "\n"}.get if readable else None
    return lc.comment_blocks(diff, reader)


class DiffTests(unittest.TestCase):
    def test_added_comment_run_over_cap_fails(self):
        diff = hunk("a.py", 10, ["# " + "w" * 141])
        [b] = lc.comment_blocks(diff)
        self.assertEqual((b.path, b.line, b.kind), ("a.py", 10, "code-comment"))
        self.assertEqual(lc.measure(b.text, b.kind), 141)

    def test_extension_of_existing_run_checks_only_added_line(self):
        diff = hunk("a.py", 5, ["# more"])
        self.assertEqual([b.text for b in lc.comment_blocks(diff)], ["more"])

    def test_two_runs_split_by_code_are_two_blocks(self):
        diff = hunk("a.py", 1, ["# one", "x = 1", "# two", "# three"])
        blocks = lc.comment_blocks(diff)
        self.assertEqual([(b.line, b.text) for b in blocks], [(1, "one"), (3, "two\nthree")])

    def test_runs_split_by_deleted_line_are_two_blocks(self):
        diff = (
            "diff --git a/a.py b/a.py\n--- a/a.py\n+++ b/a.py\n"
            "@@ -1,0 +1,1 @@\n+# one\n-gone\n+# two\n"
        )
        self.assertEqual([b.text for b in lc.comment_blocks(diff)], ["one", "two"])

    def test_python_docstring_is_docstring_kind(self):
        src = ["def f():", f"    {TQ}Summary.", "", f"    More.{TQ}", "    # tail", "    return 1"]
        blocks = blocks_of(src, {2, 3, 4, 5})
        self.assertEqual([(b.kind, b.line) for b in blocks], [("docstring", 2), ("code-comment", 5)])
        self.assertEqual(blocks[0].text.split(), ["Summary.", "More."])

    def test_one_line_docstring(self):
        sq = "'" * 3
        [b] = blocks_of(["def f():", f"    {sq}Short.{sq}"], {2})
        self.assertEqual((b.kind, b.text), ("docstring", "Short."))

    def test_module_and_class_docstrings(self):
        src = [f"{TQ}Mod.{TQ}", "class C:", f"    {TQ}Cls.{TQ}"]
        self.assertEqual([b.text for b in blocks_of(src, {1, 3})], ["Mod.", "Cls."])

    def test_docstring_doctest_and_fence_collapse_like_task_1(self):
        body = [TQ + "Add.", "", ">>> add(1, 2)", "3", "```", "y" * 500, "```", TQ]
        [b] = blocks_of(["def f():"] + ["    " + x for x in body], set(range(2, 10)))
        self.assertEqual(lc.measure(b.text, b.kind), 4)

    def test_stray_closer_followed_by_code_is_not_swallowed(self):
        src = ["def f():", f"    {TQ}Old.", "    " + "w " * 200, f"    {TQ}", "def g():", "    return 1"]
        blocks = blocks_of(src, {4, 5, 6})
        self.assertEqual([lc.measure(b.text, b.kind) for b in blocks], [0])

    def test_bare_triple_quoted_call_argument_is_not_docstring(self):
        src = ["run(", f"    {TQ}" + "w " * 200, f"    {TQ},", ")"]
        self.assertEqual(blocks_of(src, {2, 3}), [])

    def test_hash_line_inside_string_is_not_comment(self):
        src = ["x = (", f"    {TQ}a", "# not a comment", f"    {TQ}", ")"]
        self.assertEqual(blocks_of(src, {2, 3, 4}), [])

    def test_added_docstring_over_cap_fails_via_cli_path(self):
        src = ["def f():", f"    {TQ}" + "w" * 281 + TQ]
        [b] = blocks_of(src, {2})
        self.assertEqual(lc.measure(b.text, b.kind), 281)

    def test_one_line_added_to_long_docstring_measures_only_that_line(self):
        src = ["def f():", f"    {TQ}" + "w" * 400, "    extra", f"    {TQ}"]
        [b] = blocks_of(src, {3})
        self.assertEqual((b.line, b.text), (3, "extra"))

    def test_unparseable_file_yields_no_docstring_block(self):
        src = ["def f(:", f"    {TQ}doc{TQ}"]
        self.assertEqual(blocks_of(src, {2}), [])

    def test_no_reader_yields_no_docstring_block(self):
        src = ["def f():", f"    {TQ}doc{TQ}", "    # note"]
        self.assertEqual([b.kind for b in blocks_of(src, {2, 3}, readable=False)], ["code-comment"])

    def test_jsdoc_is_docstring_and_block_comment_is_code_comment(self):
        diff = hunk("a.ts", 1, ["/**", " * Doc line.", " */", "/* plain", " * note */", "// eol"])
        got = [(b.kind, b.text.split()) for b in lc.comment_blocks(diff)]
        self.assertEqual(
            got,
            [
                ("docstring", ["Doc", "line."]),
                ("code-comment", ["plain", "note"]),
                ("code-comment", ["eol"]),
            ],
        )

    def test_hash_inside_js_string_is_not_a_comment(self):
        diff = hunk("a.js", 1, ['const s = "# not a comment";', "# also not"])
        self.assertEqual(lc.comment_blocks(diff), [])

    def test_shebang_extensionless_uses_hash_family(self):
        diff = hunk("bin/tool", 1, ["#!/bin/sh", "# note"])
        self.assertEqual([b.text for b in lc.comment_blocks(diff)], ["note"])

    def test_extensionless_without_shebang_skipped(self):
        self.assertEqual(lc.comment_blocks(hunk("Makefile", 1, ["# note"])), [])

    def test_unknown_extension_skipped(self):
        self.assertEqual(lc.comment_blocks(hunk("a.md", 1, ["# Heading"])), [])

    def test_deleted_lines_ignored(self):
        diff = (
            "diff --git a/a.py b/a.py\n--- a/a.py\n+++ b/a.py\n"
            "@@ -1,2 +0,0 @@\n-# " + "w" * 300 + "\n-# more\n"
        )
        self.assertEqual(lc.comment_blocks(diff), [])

    def test_deleted_file_and_binary_and_noise_skipped(self):
        diff = (
            "diff --git a/old.py b/old.py\ndeleted file mode 100644\nindex 1..0\n"
            "--- a/old.py\n+++ /dev/null\n@@ -1 +0,0 @@\n-# gone\n"
            "diff --git a/img.png b/img.png\nnew file mode 100644\n"
            "Binary files /dev/null and b/img.png differ\n"
            "diff --git a/r.py b/r.py\nsimilarity index 100%\n"
            "rename from r.py\nrename to r.py\n"
            "diff --git a/n.py b/n.py\n--- a/n.py\n+++ b/n.py\n"
            "@@ -3 +3 @@\n-x\n\\ No newline at end of file\n+# kept\n"
            "\\ No newline at end of file\n"
        )
        got = [(b.path, b.line, b.text) for b in lc.comment_blocks(diff)]
        self.assertEqual(got, [("n.py", 3, "kept")])

    def test_hunk_header_without_count(self):
        diff = "diff --git a/a.py b/a.py\n--- a/a.py\n+++ b/a.py\n@@ -7 +9 @@ def f():\n+# hi\n"
        [b] = lc.comment_blocks(diff)
        self.assertEqual(b.line, 9)

    def test_mnemonic_prefix_stripped_from_path(self):
        diff = hunk("a.py", 1, ["# hi"]).replace("b/a.py", "w/a.py").replace("a/a.py", "i/a.py")
        self.assertEqual([b.path for b in lc.comment_blocks(diff)], ["a.py"])

    def test_added_line_starting_with_plus_plus_is_content(self):
        diff = hunk("a.py", 1, ["++ x", "# c"])
        self.assertEqual([b.text for b in lc.comment_blocks(diff)], ["c"])

    def test_cli_diff_exit_codes(self):
        bad = hunk("a.py", 10, ["# " + "w" * 141]).encode()
        p = run_cli(["--diff"], bad)
        self.assertEqual(p.returncode, 1)
        self.assertEqual(p.stdout.decode(), "a.py:10: code-comment 141/140 over by 1\n")
        ok = run_cli(["--diff"], hunk("a.py", 10, ["# " + "w" * 140]).encode())
        self.assertEqual((ok.returncode, ok.stdout), (0, b""))
        self.assertEqual(run_cli(["--diff"], b"").returncode, 0)

    def test_cli_diff_docstring_uses_staged_file(self):
        def run_in_repo(doc_len):
            with tempfile.TemporaryDirectory() as tmp:
                git = ["git", "-C", tmp]
                subprocess.run([*git, "init", "-q"], check=True)
                (pathlib.Path(tmp) / "a.py").write_text(
                    f"def f():\n    {TQ}" + "w" * doc_len + f"{TQ}\n    return 1\n"
                )
                subprocess.run([*git, "add", "a.py"], check=True)
                diff = subprocess.run(
                    [*git, "diff", "--cached", "-U0", "--no-color"], capture_output=True, check=True
                ).stdout
                return subprocess.run(
                    [sys.executable, str(SCRIPT), "--diff"],
                    input=diff, capture_output=True, check=False, cwd=tmp,
                )

        ok = run_in_repo(280)
        self.assertEqual((ok.returncode, ok.stdout), (0, b""))
        bad = run_in_repo(281)
        self.assertEqual(bad.returncode, 1)
        self.assertEqual(bad.stdout.decode(), "a.py:2: docstring 281/280 over by 1\n")

    def test_cli_diff_with_kind_or_title_exit_5(self):
        self.assertEqual(run_cli(["--diff", "--kind", "pr"], b"").returncode, 5)
        self.assertEqual(run_cli(["--diff", "--title", "t"], b"").returncode, 5)

    def test_cli_diff_survives_non_utf8(self):
        diff = hunk("a.py", 1, ["# ok"]).encode() + b"+\xff\n"
        self.assertEqual(run_cli(["--diff"], diff).returncode, 0)


if __name__ == "__main__":
    unittest.main()


class RobustnessTests(unittest.TestCase):
    def test_parser_recursion_error_yields_no_docstrings(self):
        src = ["def f():", f"    {TQ}" + "w " * 200 + TQ]
        diff = diff_of("a.py", src, {2})
        with mock.patch.object(lc.ast, "parse", side_effect=RecursionError):
            self.assertEqual(lc.comment_blocks(diff, lambda p: "\n".join(src)), [])

    def test_parser_recursion_error_cli_exits_0(self):
        code = (
            "import ast, sys\n"
            f"sys.path.insert(0, {str(SCRIPT.parent)!r})\n"
            "import length_check as lc\n"
            "def boom(*a, **k): raise RecursionError\n"
            "ast.parse = boom\n"
            "lc._staged_file = lambda p: 'x = 1\\n'\n"
            "sys.exit(lc.main(['--diff']))\n"
        )
        diff = hunk("a.py", 1, ["x = 1"]).encode()
        p = subprocess.run([sys.executable, "-c", code], input=diff, capture_output=True, check=False)
        self.assertEqual((p.returncode, p.stdout), (0, b""))

    def test_unexpected_exception_exits_5(self):
        with mock.patch.object(lc, "comment_blocks", side_effect=KeyError("boom")):
            with mock.patch.object(sys, "stdin", mock.Mock(buffer=io.BytesIO(b""))):
                with mock.patch.object(sys, "stderr", io.StringIO()) as err:
                    self.assertEqual(lc.main(["--diff"]), 5)
        self.assertIn("internal error", err.getvalue())

    def test_bytes_literal_hash_lines_are_not_comments(self):
        src = ["x = b" + TQ, "# " + "w" * 200, "# " + "v" * 200, TQ]
        self.assertEqual(blocks_of(src, {2, 3}), [])

    def test_quoted_non_ascii_path_is_decoded(self):
        diff = hunk("a.py", 1, ["# hi"]).replace("+++ b/a.py", '+++ "b/caf\\303\\251.py"')
        [b] = lc.comment_blocks(diff)
        self.assertEqual(b.path, "caf\u00e9.py")

    def test_banner_lines_are_not_prose(self):
        bar = "# " + "=" * 74
        diff = hunk("a.sh", 2, [bar, "# Setup", bar])
        [b] = lc.comment_blocks(diff)
        self.assertEqual(lc.measure(b.text, b.kind), len("Setup"))

    def test_banner_only_run_yields_no_block(self):
        self.assertEqual(lc.comment_blocks(hunk("a.sh", 2, ["# " + "=" * 300])), [])
