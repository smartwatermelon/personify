"""Tests for scripts/length_check.py.

Stdlib unittest, per tests/test_pangram_check.py, because CI runs
python3 -m unittest discover.
"""

from __future__ import annotations

import importlib.util
import pathlib
import subprocess
import sys
import unittest

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

    def test_single_paragraph_is_not_a_trailer(self):
        self.assertEqual(lc.measure("Note: keep this\n", "pr"), len("Note: keep this"))

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


if __name__ == "__main__":
    unittest.main()
