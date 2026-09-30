"""Tests for scripts/validate_skill.py.

Each fixture is a real temporary git repo, because the group-reference scan
lists files with `git ls-files` rather than rglob. A gitignored VOICE.md at the
repo root is full of group references on Andrew's machine and absent in CI, so
an rglob scan would fail locally and pass remotely. Testing against a real
repo is the only way to exercise the path that ships.

Stdlib unittest, per tests/test_pangram_check.py, because CI runs
python3 -m unittest discover.
"""

from __future__ import annotations

import importlib.util
import json
import pathlib
import shutil
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "validate_skill.py"

VERSION = "2.0.0"

FRONTMATTER = """---
name: personify
version: {version}
description: Strip AI-writing tells from prose before sending it.
license: MIT (derivative of blader/humanizer; see Provenance)
---

# Personify

The structural rules live in `rules/structure.md`.
The length check is `scripts/length_check.py`.
"""


def load_script():
    spec = importlib.util.spec_from_file_location("validate_skill", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class ValidatorCase(unittest.TestCase):
    def setUp(self):
        self.module = load_script()
        self.root = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.root, ignore_errors=True)

    def build(
        self,
        *,
        skill_version: str = VERSION,
        manifest_version: str = VERSION,
        skill_body: str | None = None,
        structure: bool = True,
        length_check: bool = True,
        extra: dict[str, str] | None = None,
    ) -> pathlib.Path:
        """Write a minimal repo, then git init and add it so git ls-files sees it."""
        body = FRONTMATTER.format(version=skill_version) if skill_body is None else skill_body
        (self.root / "SKILL.md").write_text(body, encoding="utf-8")

        (self.root / ".claude-plugin").mkdir(exist_ok=True)
        (self.root / ".claude-plugin" / "plugin.json").write_text(
            json.dumps({"name": "personify", "version": manifest_version}) + "\n",
            encoding="utf-8",
        )

        if structure:
            (self.root / "rules").mkdir(exist_ok=True)
            (self.root / "rules" / "structure.md").write_text(
                "# Structural rules\n\nNo headers, no bullets.\n", encoding="utf-8"
            )

        if length_check:
            (self.root / "scripts").mkdir(exist_ok=True)
            (self.root / "scripts" / "length_check.py").write_text(
                "# stub\n", encoding="utf-8"
            )

        for name, content in (extra or {}).items():
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")

        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)
        subprocess.run(
            ["git", "add", "-A"],
            cwd=self.root,
            check=True,
            capture_output=True,
        )
        return self.root

    def assertNoFailureMentions(self, failures, needle):
        matches = [f for f in failures if needle in f]
        self.assertEqual(matches, [], f"unexpected failure mentioning {needle!r}")


class TestValidTree(ValidatorCase):
    def test_a_valid_tree_passes(self):
        root = self.build()
        self.assertEqual(self.module.validate(root), [])


class TestVersionLockstep(ValidatorCase):
    def test_version_mismatch_is_caught(self):
        root = self.build(skill_version="2.0.0", manifest_version="1.3.1")
        failures = self.module.validate(root)
        self.assertTrue(
            any("version mismatch" in f for f in failures),
            f"expected a version mismatch failure, got {failures}",
        )

    def test_matching_versions_report_no_mismatch(self):
        root = self.build(skill_version="2.1.0", manifest_version="2.1.0")
        self.assertNoFailureMentions(self.module.validate(root), "version mismatch")


class TestStructureFile(ValidatorCase):
    def test_missing_structure_file_is_caught(self):
        root = self.build(structure=False)
        self.assertIn("rules/structure.md not found", self.module.validate(root))

    def test_unreferenced_structure_file_is_caught(self):
        body = FRONTMATTER.format(version=VERSION).replace(
            "The structural rules live in `rules/structure.md`.", "No reference here."
        )
        root = self.build(skill_body=body)
        failures = self.module.validate(root)
        self.assertTrue(
            any("must reference rules/structure.md" in f for f in failures),
            f"expected a missing-reference failure, got {failures}",
        )


class TestLengthCheckFile(ValidatorCase):
    def test_missing_length_check_fails(self):
        root = self.build(length_check=False)
        self.assertIn("scripts/length_check.py not found", self.module.validate(root))

    def test_unreferenced_length_check_fails(self):
        body = FRONTMATTER.format(version=VERSION).replace(
            "The length check is `scripts/length_check.py`.", "No reference here."
        )
        root = self.build(skill_body=body)
        failures = self.module.validate(root)
        self.assertTrue(
            any("must reference scripts/length_check.py" in f for f in failures),
            f"expected a missing-reference failure, got {failures}",
        )


class TestGroupReferences(ValidatorCase):
    def test_surviving_group_reference_is_caught(self):
        root = self.build(
            extra={"README.md": "First person always, per group W.\n"}
        )
        failures = self.module.validate(root)
        self.assertTrue(
            any("README.md:1" in f and "lettered pattern group" in f for f in failures),
            f"expected a group-reference failure, got {failures}",
        )

    def test_group_reference_in_skill_md_is_caught(self):
        body = FRONTMATTER.format(version=VERSION) + "\nApply groups V and W harder.\n"
        root = self.build(skill_body=body)
        failures = self.module.validate(root)
        self.assertTrue(
            any("SKILL.md" in f and "lettered pattern group" in f for f in failures),
            f"expected a SKILL.md group-reference failure, got {failures}",
        )

    def test_capitalized_group_reference_is_caught(self):
        root = self.build(extra={"notes.md": "Group Z was the funding test.\n"})
        failures = self.module.validate(root)
        self.assertTrue(
            any("notes.md" in f for f in failures),
            f"a sentence-initial 'Group Z' must be caught, got {failures}",
        )

    def test_reference_wrapped_across_lines_is_caught(self):
        """Prose here wraps at 80 columns, so "group" and "W" can land on two lines."""
        root = self.build(
            extra={"README.md": "Intro line.\nApply the rules in group\nW harder.\n"}
        )
        failures = self.module.validate(root)
        self.assertTrue(
            any("README.md:2" in f for f in failures),
            f"a group reference split by a line wrap must be caught, got {failures}",
        )

    def test_uppercase_group_reference_is_caught(self):
        root = self.build(extra={"notes.md": "See GROUP V for the rule.\n"})
        failures = self.module.validate(root)
        self.assertTrue(
            any("notes.md" in f for f in failures),
            f"an all-caps 'GROUP V' must be caught, got {failures}",
        )

    def test_paragraph_break_does_not_join_a_reference(self):
        root = self.build(
            extra={"notes.md": "We met in small groups\n\nA week later we met again.\n"}
        )
        self.assertNoFailureMentions(
            self.module.validate(root), "lettered pattern group"
        )

    def test_archive_docs_are_exempt(self):
        root = self.build(
            extra={
                "docs/superpowers/plans/2026-08-31-ab-harness.md": (
                    "Produces rules/taxonomy.md containing groups A through Z.\n"
                ),
                "docs/plans/voice-corpus-mining.md": "Cites group V here.\n",
            }
        )
        self.assertNoFailureMentions(
            self.module.validate(root), "lettered pattern group"
        )

    def test_untracked_file_is_not_scanned(self):
        """A gitignored VOICE.md must not fail the check."""
        root = self.build()
        (root / "VOICE.md").write_text("Suppress group E and group R.\n", encoding="utf-8")
        self.assertNoFailureMentions(
            self.module.validate(root), "lettered pattern group"
        )

    def test_ordinary_prose_is_not_flagged(self):
        root = self.build(
            extra={"notes.md": "The group met on Tuesday. A group of readers agreed.\n"}
        )
        self.assertNoFailureMentions(
            self.module.validate(root), "lettered pattern group"
        )


class TestGitUnavailable(ValidatorCase):
    def test_scan_fails_loudly_outside_a_git_repo(self):
        """A scan that cannot list files must fail, not pass with nothing scanned."""
        (self.root / "SKILL.md").write_text(FRONTMATTER.format(version=VERSION), encoding="utf-8")
        (self.root / ".claude-plugin").mkdir()
        (self.root / ".claude-plugin" / "plugin.json").write_text(
            json.dumps({"name": "personify", "version": VERSION}) + "\n", encoding="utf-8"
        )
        (self.root / "rules").mkdir()
        (self.root / "rules" / "structure.md").write_text("# Rules\n", encoding="utf-8")
        (self.root / "README.md").write_text("Per group W.\n", encoding="utf-8")
        failures = self.module.validate(self.root)
        self.assertTrue(
            any("git ls-files" in f for f in failures),
            f"expected a failure naming git ls-files, got {failures}",
        )


class TestFrontmatter(ValidatorCase):
    def test_missing_required_key_is_caught(self):
        body = FRONTMATTER.format(version=VERSION).replace(
            "license: MIT (derivative of blader/humanizer; see Provenance)\n", ""
        )
        root = self.build(skill_body=body)
        failures = self.module.validate(root)
        self.assertTrue(
            any("missing required key: license" in f for f in failures),
            f"expected a missing-license failure, got {failures}",
        )

    def test_nonportable_key_is_caught(self):
        body = FRONTMATTER.format(version=VERSION).replace(
            "license: MIT", "allowed-tools: Read, Bash\nlicense: MIT"
        )
        root = self.build(skill_body=body)
        failures = self.module.validate(root)
        self.assertTrue(
            any("nonportable frontmatter key: allowed-tools" in f for f in failures),
            f"expected a nonportable-key failure, got {failures}",
        )

    def test_missing_frontmatter_is_caught(self):
        root = self.build(skill_body="# Personify\n\nNo frontmatter at all.\n")
        self.assertEqual(
            self.module.validate(root),
            ["SKILL.md must start with YAML frontmatter"],
        )


class TestRealRepo(unittest.TestCase):
    """The shipped tree must pass its own validator."""

    def test_repo_validates(self):
        module = load_script()
        self.assertEqual(module.validate(ROOT), [])


if __name__ == "__main__":
    unittest.main()
