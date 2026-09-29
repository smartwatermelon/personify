"""Tests for scripts/pangram_check.py.

No test touches the network. The transport is injected, matching the
dependency-injection shape the script exposes, so a fixture replayer stands in
for urllib rather than urlopen being patched.

The API responses under tests/fixtures/pangram/ with no "synthetic_" prefix are
verbatim captures from the real API, paired with the exact text submitted. The
synthetic_ ones are hand-written, because no sample of them could be induced on
demand: a failed stage, an intermediate poll, and the model listing.

Stdlib unittest, per tests/test_validate_skill.py, because CI runs
python3 -m unittest discover.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import pathlib
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "pangram_check.py"
FIXTURES = ROOT / "tests" / "fixtures" / "pangram"


def load_script():
    spec = importlib.util.spec_from_file_location("pangram_check", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


pangram = load_script()


def fixture_json(name: str) -> dict:
    return json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))


def fixture_text(name: str) -> str:
    return (FIXTURES / f"{name}.txt").read_text(encoding="utf-8")


class Replayer:
    """Stands in for the urllib transport and records what it was asked.

    `task_responses` is consumed in order, so a test can make the first poll
    return an intermediate stage and the second return a result.
    """

    def __init__(self, task_responses, models=None, post_error=None, get_error=None):
        self.task_responses = list(task_responses)
        self.models = models or fixture_json("synthetic_models")
        self.post_error = post_error
        self.get_error = get_error
        self.calls = []

    def __call__(self, method, path, payload=None):
        self.calls.append((method, path, payload))
        if method == "GET" and path == "/models":
            return self.models
        if method == "POST" and path == "/task":
            if self.post_error is not None:
                raise self.post_error
            return {"task_id": "task-abc123"}
        if method == "GET" and path.startswith("/task/"):
            if self.get_error is not None:
                raise self.get_error
            return self.task_responses.pop(0)
        raise AssertionError(f"unexpected call: {method} {path}")

    def posts(self):
        return [c for c in self.calls if c[0] == "POST"]


def no_sleep(_seconds):
    return None


def failing_op():
    return None


def no_keychain():
    return None


class TempConfig:
    """Give a test its own XDG_CONFIG_HOME so no real stamp is ever written."""

    def __init__(self):
        self.directory = tempfile.TemporaryDirectory()
        self.env = {"XDG_CONFIG_HOME": self.directory.name}

    def stamps(self):
        return pathlib.Path(self.directory.name) / "personify" / "stamps"

    def checks(self):
        return pathlib.Path(self.directory.name) / "personify" / "checks"

    def cleanup(self):
        self.directory.cleanup()


class VerdictBranchTests(unittest.TestCase):
    def setUp(self):
        self.config = TempConfig()
        self.addCleanup(self.config.cleanup)

    def run_check(self, raw, replayer, env=None):
        environment = dict(self.config.env)
        if env:
            environment.update(env)
        return pangram.check(
            raw, request=replayer, env=environment, sleep=no_sleep
        )

    def test_human_verdict_passes_and_writes_a_stamp(self):
        raw = fixture_text("human_long").encode("utf-8")
        replayer = Replayer([fixture_json("human_long")])
        code, report = self.run_check(raw, replayer)
        self.assertEqual(code, pangram.EXIT_PASS)
        self.assertEqual(report["verdict"], "Human")
        self.assertEqual(report["status"], "PASS")
        self.assertTrue(pathlib.Path(report["stamp_path"]).exists())

    def test_ai_verdict_fails_with_no_stamp(self):
        raw = fixture_text("ai_short").encode("utf-8")
        replayer = Replayer([fixture_json("ai_short")])
        code, report = self.run_check(raw, replayer)
        self.assertEqual(code, pangram.EXIT_FAIL)
        self.assertEqual(report["verdict"], "AI")
        self.assertNotIn("stamp_path", report)
        self.assertFalse(self.config.stamps().exists())

    def test_mixed_verdict_has_its_own_exit_code(self):
        # The captured Mixed response came from a 15-word text, which is under
        # the floor. Pair it with a long input so the floor does not preempt
        # the branch under test.
        raw = fixture_text("ai_short").encode("utf-8")
        replayer = Replayer([fixture_json("mixed_short")])
        code, report = self.run_check(raw, replayer)
        self.assertEqual(code, pangram.EXIT_FAIL_MIXED)
        self.assertEqual(report["verdict"], "Mixed")
        self.assertNotIn("stamp_path", report)

    def test_exactly_one_submission_per_artifact(self):
        raw = fixture_text("ai_short").encode("utf-8")
        replayer = Replayer([fixture_json("ai_short")])
        self.run_check(raw, replayer)
        self.assertEqual(len(replayer.posts()), 1)

    def test_stage_failed_is_an_error_not_a_verdict(self):
        raw = fixture_text("ai_short").encode("utf-8")
        replayer = Replayer([fixture_json("synthetic_stage_failed")])
        with self.assertRaises(pangram.CheckError) as caught:
            self.run_check(raw, replayer)
        self.assertEqual(caught.exception.code, pangram.EXIT_UNAVAILABLE)
        self.assertIn("STAGE_FAILED", str(caught.exception))

    def test_polling_continues_past_an_intermediate_stage(self):
        raw = fixture_text("human_long").encode("utf-8")
        replayer = Replayer(
            [fixture_json("synthetic_stage_pending"), fixture_json("human_long")]
        )
        code, _ = self.run_check(raw, replayer)
        self.assertEqual(code, pangram.EXIT_PASS)
        polls = [c for c in replayer.calls if c[1].startswith("/task/")]
        self.assertEqual(len(polls), 2)

    def test_model_is_always_sent_in_the_post_payload(self):
        raw = fixture_text("ai_short").encode("utf-8")
        replayer = Replayer([fixture_json("ai_short")])
        _, report = self.run_check(raw, replayer)
        payload = replayer.posts()[0][2]
        self.assertEqual(payload["model"], "pangram-4")
        self.assertIs(payload["public_dashboard_link"], False)
        self.assertEqual(report["model"], "pangram-4")
        self.assertAlmostEqual(
            report["estimated_cost_usd"],
            0.05 * -(-report["word_count"] // 100),
            places=6,
        )

    def test_model_override_is_honored_and_reports_no_cost_when_unpriced(self):
        raw = fixture_text("ai_short").encode("utf-8")
        replayer = Replayer([fixture_json("ai_short")])
        _, report = self.run_check(
            raw, replayer, env={"PANGRAM_MODEL": "default"}
        )
        self.assertEqual(replayer.posts()[0][2]["model"], "default")
        self.assertEqual(report["model"], "default")
        self.assertIsNone(report["estimated_cost_usd"])

    def test_unknown_model_is_rejected_before_submitting(self):
        raw = fixture_text("ai_short").encode("utf-8")
        replayer = Replayer([fixture_json("ai_short")])
        with self.assertRaises(pangram.CheckError) as caught:
            self.run_check(raw, replayer, env={"PANGRAM_MODEL": "pangram-9"})
        self.assertIn("pangram-9", str(caught.exception))
        self.assertEqual(replayer.posts(), [])

    def test_api_version_is_echoed(self):
        raw = fixture_text("human_long").encode("utf-8")
        _, report = self.run_check(raw, Replayer([fixture_json("human_long")]))
        self.assertEqual(report["api_version"], "3.3.2")


class TransportErrorTests(unittest.TestCase):
    def setUp(self):
        self.config = TempConfig()
        self.addCleanup(self.config.cleanup)

    def run_with_post_error(self, error):
        replayer = Replayer([], post_error=error)
        raw = fixture_text("ai_short").encode("utf-8")
        with self.assertRaises(pangram.CheckError) as caught:
            pangram.check(
                raw, request=replayer, env=dict(self.config.env), sleep=no_sleep
            )
        return caught.exception, replayer

    def test_402_names_credits_and_does_not_retry(self):
        error, replayer = self.run_with_post_error(
            pangram.TransportError("no credits", status=402)
        )
        self.assertIn("credit", str(error).lower())
        self.assertEqual(len(replayer.posts()), 1)

    def test_429_retries_exactly_once_then_fails_closed(self):
        error, replayer = self.run_with_post_error(
            pangram.TransportError("rate limited", status=429)
        )
        self.assertEqual(error.code, pangram.EXIT_UNAVAILABLE)
        self.assertEqual(len(replayer.posts()), 2)

    def test_503_retries_exactly_once_then_fails_closed(self):
        error, replayer = self.run_with_post_error(
            pangram.TransportError("unavailable", status=503)
        )
        self.assertEqual(error.code, pangram.EXIT_UNAVAILABLE)
        self.assertEqual(len(replayer.posts()), 2)

    def test_network_failure_retries_once_then_fails_closed(self):
        error, replayer = self.run_with_post_error(
            pangram.TransportError("connection refused", status=None)
        )
        self.assertEqual(error.code, pangram.EXIT_UNAVAILABLE)
        self.assertEqual(len(replayer.posts()), 2)

    def test_422_does_not_retry(self):
        _, replayer = self.run_with_post_error(
            pangram.TransportError("bad body", status=422)
        )
        self.assertEqual(len(replayer.posts()), 1)

    def test_retry_classification(self):
        self.assertTrue(pangram.is_retryable(None))
        self.assertTrue(pangram.is_retryable(429))
        self.assertTrue(pangram.is_retryable(500))
        self.assertTrue(pangram.is_retryable(503))
        self.assertFalse(pangram.is_retryable(402))
        self.assertFalse(pangram.is_retryable(401))
        self.assertFalse(pangram.is_retryable(413))


class SecretResolutionTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = pathlib.Path(self.directory.name)
        self.personify = self.root / "personify"
        self.personify.mkdir()
        self.key_file = self.personify / "pangram-key"
        self.env = {"XDG_CONFIG_HOME": str(self.root)}

    def write_key(self, contents="secret-key\n", mode=0o600):
        self.key_file.write_text(contents, encoding="utf-8")
        os.chmod(self.key_file, mode)

    def resolve(self, env=None, op_read=failing_op, keychain_read=no_keychain):
        return pangram.resolve_key(
            dict(self.env) if env is None else env,
            op_read=op_read,
            keychain_read=keychain_read,
        )

    def test_missing_secret_fails_closed(self):
        with self.assertRaises(pangram.CheckError) as caught:
            self.resolve()
        self.assertIn("no Pangram API key", str(caught.exception))

    def test_missing_secret_names_the_install_commands(self):
        with self.assertRaises(pangram.CheckError) as caught:
            self.resolve()
        message = str(caught.exception)
        self.assertIn(f"{pangram.SCRIPT_PATH} --install-key", message)
        self.assertIn(
            "security add-generic-password -U -a \"$(id -un)\" "
            "-s personify-pangram-key -w",
            message,
        )
        # The manual command ends at -w so `security` prompts for the key.
        self.assertRegex(message, r"-s personify-pangram-key -w\n")

    def test_key_file_is_read_when_the_env_var_is_absent(self):
        self.write_key()
        self.assertEqual(self.resolve(), "secret-key")

    def test_env_var_wins_over_the_key_file(self):
        self.write_key("from-file\n")
        env = dict(self.env, PANGRAM_API_KEY="from-env")
        self.assertEqual(self.resolve(env), "from-env")

    def test_env_var_wins_over_the_keychain(self):
        env = dict(self.env, PANGRAM_API_KEY="from-env")
        self.assertEqual(
            self.resolve(env, keychain_read=lambda: "from-keychain"), "from-env"
        )

    def test_keychain_wins_over_the_key_file_and_one_password(self):
        self.write_key("from-file\n")
        self.assertEqual(
            self.resolve(
                op_read=lambda: "from-op", keychain_read=lambda: "from-keychain"
            ),
            "from-keychain",
        )

    def test_key_file_wins_over_one_password(self):
        self.write_key("from-file\n")
        self.assertEqual(self.resolve(op_read=lambda: "from-op"), "from-file")

    def test_one_password_is_the_last_resort(self):
        self.assertEqual(self.resolve(op_read=lambda: "from-op"), "from-op")

    def test_group_readable_key_file_is_rejected(self):
        self.write_key(mode=0o644)
        with self.assertRaises(pangram.CheckError) as caught:
            self.resolve()
        self.assertIn("permissive", str(caught.exception))

    def test_world_writable_parent_directory_is_rejected(self):
        self.write_key()
        original = stat.S_IMODE(self.personify.stat().st_mode)
        os.chmod(self.personify, 0o777)
        self.addCleanup(os.chmod, self.personify, original)
        with self.assertRaises(pangram.CheckError) as caught:
            self.resolve()
        self.assertIn("world-writable", str(caught.exception))

    def test_empty_key_file_is_rejected(self):
        self.write_key("   \n")
        with self.assertRaises(pangram.CheckError) as caught:
            self.resolve()
        self.assertIn("empty", str(caught.exception))


class CheckKeyTests(unittest.TestCase):
    def setUp(self):
        self.config = TempConfig()
        self.addCleanup(self.config.cleanup)

    def test_a_resolvable_key_exits_zero_without_echoing_it(self):
        code, report = pangram.check_key(
            dict(self.config.env),
            op_read=failing_op,
            keychain_read=lambda: "sk-secret-value",
        )
        self.assertEqual(code, pangram.EXIT_PASS)
        self.assertEqual(report, {"status": "KEY_OK"})
        self.assertNotIn("sk-secret-value", json.dumps(report))

    def test_no_key_exits_unavailable_with_the_install_message(self):
        code, report = pangram.check_key(
            dict(self.config.env), op_read=failing_op, keychain_read=no_keychain
        )
        self.assertEqual(code, pangram.EXIT_UNAVAILABLE)
        self.assertEqual(report["status"], "UNAVAILABLE")
        self.assertIn("no Pangram API key", report["error"])
        self.assertIn("--install-key", report["error"])


class InstallKeyTests(unittest.TestCase):
    def test_copies_the_one_password_key_into_the_keychain(self):
        written = []

        def keychain_write(key):
            written.append(key)
            return True

        code, message = pangram.install_key(
            op_read=lambda: "sk-secret-value", keychain_write=keychain_write
        )
        self.assertEqual(code, pangram.EXIT_PASS)
        self.assertEqual(written, ["sk-secret-value"])
        self.assertNotIn("sk-secret-value", message)
        self.assertIn("personify-pangram-key", message)

    def test_an_unreadable_one_password_prints_the_manual_command(self):
        written = []
        code, message = pangram.install_key(
            op_read=failing_op, keychain_write=lambda k: written.append(k) or True
        )
        self.assertEqual(code, pangram.EXIT_UNAVAILABLE)
        self.assertEqual(written, [])
        self.assertIn("op read", message)
        self.assertTrue(message.rstrip().endswith("-s personify-pangram-key -w"))

    def test_a_failed_keychain_write_prints_the_manual_command(self):
        code, message = pangram.install_key(
            op_read=lambda: "sk-secret-value", keychain_write=lambda _key: False
        )
        self.assertEqual(code, pangram.EXIT_UNAVAILABLE)
        self.assertNotIn("sk-secret-value", message)
        self.assertTrue(message.rstrip().endswith("-s personify-pangram-key -w"))


class KeychainTests(unittest.TestCase):
    """The real Keychain calls, with `security` itself always faked."""

    def setUp(self):
        which = mock.patch.object(
            pangram.shutil, "which", return_value="/usr/bin/security"
        )
        which.start()
        self.addCleanup(which.stop)

    def test_reads_the_named_item_for_the_current_user(self):
        completed = subprocess.CompletedProcess(
            ["security"], 0, stdout="sk-from-keychain\n", stderr=""
        )
        with mock.patch.object(
            pangram.subprocess, "run", return_value=completed
        ) as run:
            self.assertEqual(pangram.read_keychain_secret(), "sk-from-keychain")
        argv = run.call_args.args[0]
        self.assertEqual(
            argv,
            [
                "security",
                "find-generic-password",
                "-a",
                pangram.keychain_account(),
                "-s",
                "personify-pangram-key",
                "-w",
            ],
        )
        self.assertEqual(
            run.call_args.kwargs["timeout"], pangram.KEYCHAIN_TIMEOUT_SECONDS
        )

    def test_a_missing_item_resolves_to_nothing(self):
        completed = subprocess.CompletedProcess(
            ["security"], 44, stdout="", stderr="could not be found"
        )
        with mock.patch.object(pangram.subprocess, "run", return_value=completed):
            self.assertIsNone(pangram.read_keychain_secret())

    def test_a_timeout_resolves_to_nothing(self):
        with mock.patch.object(
            pangram.subprocess,
            "run",
            side_effect=subprocess.TimeoutExpired("security", 5),
        ):
            self.assertIsNone(pangram.read_keychain_secret())

    def test_no_security_binary_skips_the_keychain(self):
        with mock.patch.object(pangram.shutil, "which", return_value=None):
            with mock.patch.object(pangram.subprocess, "run") as run:
                self.assertIsNone(pangram.read_keychain_secret())
                self.assertFalse(pangram.write_keychain_secret("sk"))
        run.assert_not_called()

    def test_write_updates_the_item_in_place(self):
        completed = subprocess.CompletedProcess(["security"], 0, stdout="", stderr="")
        with mock.patch.object(
            pangram.subprocess, "run", return_value=completed
        ) as run:
            self.assertTrue(pangram.write_keychain_secret("sk-new"))
        argv = run.call_args.args[0]
        self.assertEqual(argv[:2], ["security", "add-generic-password"])
        self.assertIn("-U", argv)
        self.assertEqual(argv[-2:], ["-w", "sk-new"])

    def test_a_failed_write_reports_false(self):
        completed = subprocess.CompletedProcess(["security"], 1, stdout="", stderr="")
        with mock.patch.object(pangram.subprocess, "run", return_value=completed):
            self.assertFalse(pangram.write_keychain_secret("sk-new"))


class LengthFloorTests(unittest.TestCase):
    """The floor is the branch where a bug produces a false pass.

    At 15 words the detector scored genuinely AI-written prose as Human 1.0,
    so a short text must never receive a verdict and must never be stamped.
    """

    def setUp(self):
        self.config = TempConfig()
        self.addCleanup(self.config.cleanup)

    def run_check(self, raw):
        replayer = Replayer([fixture_json("human_long")])
        code, report = pangram.check(
            raw, request=replayer, env=dict(self.config.env), sleep=no_sleep
        )
        return code, report, replayer

    def test_short_text_is_skipped(self):
        raw = fixture_text("mixed_short").encode("utf-8")
        code, report, replayer = self.run_check(raw)
        self.assertEqual(code, pangram.EXIT_SKIPPED)
        self.assertEqual(report["status"], "SKIPPED")
        self.assertIsNone(report["verdict"])
        self.assertEqual(replayer.calls, [])

    def test_a_skipped_text_writes_no_stamp(self):
        raw = fixture_text("mixed_short").encode("utf-8")
        _, report, _ = self.run_check(raw)
        self.assertNotIn("stamp_path", report)
        self.assertFalse(self.config.stamps().exists())

    def test_thirty_nine_words_skips_and_forty_proceeds(self):
        thirty_nine = " ".join(f"word{n}" for n in range(39)).encode("utf-8")
        code, report, _ = self.run_check(thirty_nine)
        self.assertEqual(code, pangram.EXIT_SKIPPED)
        self.assertEqual(report["word_count"], 39)

        forty = " ".join(f"word{n}" for n in range(40)).encode("utf-8")
        code, report, replayer = self.run_check(forty)
        self.assertEqual(code, pangram.EXIT_PASS)
        self.assertEqual(report["word_count"], 40)
        self.assertEqual(len(replayer.posts()), 1)

    def test_the_floor_is_measured_after_stripping(self):
        # A long fenced code block strips to nothing, so the text is skipped
        # even though the raw bytes are well over forty words.
        body = "\n".join(f"line {n} of program output" for n in range(40))
        raw = f"```\n{body}\n```\n".encode("utf-8")
        code, report, _ = self.run_check(raw)
        self.assertEqual(code, pangram.EXIT_SKIPPED)
        self.assertEqual(report["word_count"], 0)


class StrippingTests(unittest.TestCase):
    def test_stripping_is_idempotent_on_already_stripped_text(self):
        text = fixture_text("markdown_stripped")
        once = pangram.strip_markup(text)
        self.assertEqual(pangram.strip_markup(once), once)

    def test_markup_wrapped_around_the_fixture_strips_back_to_it(self):
        text = fixture_text("markdown_stripped")
        wrapped = (
            "---\ntitle: A post\n---\n"
            f"{text}\n\n"
            "```python\nprint('not prose')\n```\n"
            "<div class='note'></div>\n"
            "![a picture](/img/a.png)\n"
        )
        self.assertEqual(
            pangram.strip_markup(wrapped).split(),
            pangram.strip_markup(text).split(),
        )

    def test_html_tags_go_but_the_text_inside_them_stays(self):
        # Tag removal is not element removal. Prose wrapped in a span is still
        # prose, and dropping it would shrink the word count wrongly.
        self.assertEqual(
            pangram.strip_markup("<em>real prose</em> continues"),
            "real prose continues",
        )

    def test_links_keep_their_text(self):
        self.assertEqual(
            pangram.strip_markup("see [the docs](https://example.com) for more"),
            "see the docs for more",
        )

    def test_blockquotes_and_headings_lose_their_markers(self):
        self.assertEqual(
            pangram.strip_markup("## A heading\n\n> quoted line\n"),
            "A heading\n\nquoted line",
        )


class HashIdentityTests(unittest.TestCase):
    def setUp(self):
        self.config = TempConfig()
        self.addCleanup(self.config.cleanup)

    def test_hash_is_over_raw_bytes_not_stripped_text(self):
        raw = ("# A heading\n\n" + fixture_text("human_long")).encode("utf-8")
        replayer = Replayer([fixture_json("human_long")])
        _, report = pangram.check(
            raw, request=replayer, env=dict(self.config.env), sleep=no_sleep
        )
        stripped = pangram.strip_markup(raw.decode("utf-8"))
        self.assertEqual(report["sha256"], hashlib.sha256(raw).hexdigest())
        self.assertNotEqual(
            report["sha256"], hashlib.sha256(stripped.encode("utf-8")).hexdigest()
        )

    def test_stamp_records_the_task_id_and_the_raw_hash(self):
        raw = fixture_text("human_long").encode("utf-8")
        replayer = Replayer([fixture_json("human_long")])
        _, report = pangram.check(
            raw, request=replayer, env=dict(self.config.env), sleep=no_sleep
        )
        stamp = json.loads(
            pathlib.Path(report["stamp_path"]).read_text(encoding="utf-8")
        )
        self.assertEqual(stamp["sha256"], hashlib.sha256(raw).hexdigest())
        self.assertEqual(stamp["task_id"], "task-abc123")
        self.assertEqual(stamp["verdict"], "Human")
        self.assertEqual(stamp["model"], "pangram-4")
        self.assertEqual(stamp["api_version"], "3.3.2")
        self.assertEqual(stamp["word_count"], report["word_count"])
        self.assertTrue(stamp["timestamp"].endswith("+00:00"))

    def test_the_stamp_file_is_named_for_the_hash(self):
        raw = fixture_text("human_long").encode("utf-8")
        replayer = Replayer([fixture_json("human_long")])
        _, report = pangram.check(
            raw, request=replayer, env=dict(self.config.env), sleep=no_sleep
        )
        expected = hashlib.sha256(raw).hexdigest() + ".json"
        self.assertEqual(pathlib.Path(report["stamp_path"]).name, expected)

    def test_stamps_do_not_land_in_the_gate_review_directory(self):
        raw = fixture_text("human_long").encode("utf-8")
        replayer = Replayer([fixture_json("human_long")])
        _, report = pangram.check(
            raw, request=replayer, env=dict(self.config.env), sleep=no_sleep
        )
        self.assertNotIn("gate-review", report["stamp_path"])
        self.assertIn(
            os.path.join("personify", "stamps"), report["stamp_path"]
        )

    def test_the_stamp_is_not_writable_by_other_local_processes(self):
        # A stamp is what a hook trusts to allow a publish. Under the default
        # umask it would land 0644 in a 0755 directory, where any local process
        # could overwrite one and manufacture a pass. Assert the narrow mode
        # rather than the umask that happens to be set when the suite runs.
        raw = fixture_text("human_long").encode("utf-8")
        replayer = Replayer([fixture_json("human_long")])
        _, report = pangram.check(
            raw, request=replayer, env=dict(self.config.env), sleep=no_sleep
        )
        stamp = pathlib.Path(report["stamp_path"])
        self.assertEqual(stamp.stat().st_mode & 0o777, 0o600)
        self.assertEqual(stamp.parent.stat().st_mode & 0o777, 0o700)

    def test_a_pre_existing_wide_open_stamp_dir_is_tightened(self):
        # mkdir's mode argument does nothing when the directory already exists,
        # so a dir created 0777 by something else must still be narrowed.
        stamps = pangram.config_root(self.config.env) / "stamps"
        stamps.mkdir(parents=True, exist_ok=True)
        os.chmod(stamps, 0o777)
        raw = fixture_text("human_long").encode("utf-8")
        replayer = Replayer([fixture_json("human_long")])
        pangram.check(
            raw, request=replayer, env=dict(self.config.env), sleep=no_sleep
        )
        self.assertEqual(stamps.stat().st_mode & 0o777, 0o700)


class CheckRecordTests(unittest.TestCase):
    """Every result leaves a record, so the review gate can prove the check ran.

    The gate enforces that Pangram saw the text, not what it said, so a FAIL
    and a SKIPPED leave a record exactly as a PASS does. An error leaves none:
    nothing was learned about the text.
    """

    def setUp(self):
        self.config = TempConfig()
        self.addCleanup(self.config.cleanup)

    def run_check(self, raw, responses, env=None):
        environment = dict(self.config.env)
        if env:
            environment.update(env)
        return pangram.check(
            raw, request=Replayer(responses), env=environment, sleep=no_sleep
        )

    def read_record(self, report):
        return json.loads(
            pathlib.Path(report["record_path"]).read_text(encoding="utf-8")
        )

    def test_a_pass_writes_a_record(self):
        raw = fixture_text("human_long").encode("utf-8")
        _, report = self.run_check(raw, [fixture_json("human_long")])
        record = self.read_record(report)
        self.assertEqual(record["status"], "PASS")
        self.assertEqual(record["verdict"], "Human")
        self.assertEqual(record["sha256"], hashlib.sha256(raw).hexdigest())
        self.assertEqual(record["task_id"], report["task_id"])
        self.assertEqual(record["word_count"], report["word_count"])
        self.assertEqual(record["fraction_ai"], report["fraction_ai"])

    def test_a_fail_writes_a_record_and_still_no_stamp(self):
        raw = fixture_text("ai_short").encode("utf-8")
        _, report = self.run_check(raw, [fixture_json("ai_short")])
        record = self.read_record(report)
        self.assertEqual(record["status"], "FAIL")
        self.assertEqual(record["verdict"], "AI")
        self.assertFalse(self.config.stamps().exists())

    def test_a_mixed_verdict_records_as_fail_mixed(self):
        raw = fixture_text("ai_short").encode("utf-8")
        _, report = self.run_check(raw, [fixture_json("mixed_short")])
        record = self.read_record(report)
        self.assertEqual(record["status"], "FAIL")
        self.assertEqual(record["verdict"], "Mixed")

    def test_a_skip_writes_a_record_with_no_verdict(self):
        raw = fixture_text("mixed_short").encode("utf-8")
        code, report = self.run_check(raw, [fixture_json("human_long")])
        self.assertEqual(code, pangram.EXIT_SKIPPED)
        record = self.read_record(report)
        self.assertEqual(record["status"], "SKIPPED")
        self.assertIsNone(record["verdict"])
        self.assertIsNone(record["task_id"])
        self.assertEqual(record["word_count"], report["word_count"])
        self.assertFalse(self.config.stamps().exists())

    def test_an_error_writes_no_record(self):
        raw = fixture_text("ai_short").encode("utf-8")
        failing = Replayer(
            [fixture_json("ai_short")],
            post_error=pangram.TransportError("no credits", status=402),
        )
        with self.assertRaises(pangram.CheckError):
            pangram.check(
                raw, request=failing, env=dict(self.config.env), sleep=no_sleep
            )
        self.assertFalse(self.config.checks().exists())

    def test_the_record_is_named_for_the_raw_hash(self):
        # Trailing whitespace is part of the key. gate-review hashes the raw
        # staged file, so a key over stripped text would never match.
        raw = (fixture_text("ai_short") + "  \n\n").encode("utf-8")
        _, report = self.run_check(raw, [fixture_json("ai_short")])
        self.assertEqual(
            pathlib.Path(report["record_path"]).name,
            hashlib.sha256(raw).hexdigest() + ".json",
        )

    def test_records_are_private(self):
        raw = fixture_text("ai_short").encode("utf-8")
        _, report = self.run_check(raw, [fixture_json("ai_short")])
        path = pathlib.Path(report["record_path"])
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(path.parent.stat().st_mode & 0o777, 0o700)

    def test_an_empty_xdg_config_home_falls_back_to_home(self):
        with tempfile.TemporaryDirectory() as home:
            with mock.patch.dict(os.environ, {"HOME": home}):
                raw = fixture_text("mixed_short").encode("utf-8")
                _, report = pangram.check(
                    raw,
                    request=Replayer([]),
                    env={"XDG_CONFIG_HOME": ""},
                    sleep=no_sleep,
                )
                self.assertTrue(
                    report["record_path"].startswith(
                        os.path.join(home, ".config", "personify", "checks")
                    )
                )


class WindowMergeTests(unittest.TestCase):
    def test_adjacent_windows_merge_into_one_span(self):
        # The captured v3 response returns [0, 2043] then [2043, 2258]:
        # touching, not overlapping. A contiguous flagged region is one region.
        windows = fixture_json("ai_multiwindow")["windows"]
        self.assertEqual(len(windows), 2)
        self.assertEqual(pangram.merge_windows(windows), [(0, 2258)])

    def test_overlapping_windows_merge(self):
        windows = [
            {"label": "AI-Generated", "start_index": 0, "end_index": 100},
            {"label": "AI-Generated", "start_index": 60, "end_index": 180},
        ]
        self.assertEqual(pangram.merge_windows(windows), [(0, 180)])

    def test_disjoint_windows_stay_separate(self):
        windows = [
            {"label": "AI-Generated", "start_index": 0, "end_index": 100},
            {"label": "AI-Generated", "start_index": 400, "end_index": 500},
        ]
        self.assertEqual(pangram.merge_windows(windows), [(0, 100), (400, 500)])

    def test_human_windows_are_not_flagged(self):
        windows = fixture_json("human_long")["windows"]
        self.assertEqual(pangram.merge_windows(windows), [])

    def test_lightly_ai_assisted_counts_as_flagged(self):
        windows = fixture_json("mixed_short")["windows"]
        self.assertEqual([w["label"] for w in windows], ["Lightly AI-Assisted"])
        self.assertEqual(pangram.merge_windows(windows), [(0, 104)])


class AnchoringTests(unittest.TestCase):
    def setUp(self):
        self.config = TempConfig()
        self.addCleanup(self.config.cleanup)

    def test_content_anchoring_locates_a_real_span(self):
        submitted = fixture_text("ai_multiwindow")
        raw = submitted.encode("utf-8")
        replayer = Replayer([fixture_json("ai_multiwindow")])
        _, report = pangram.check(
            raw, request=replayer, env=dict(self.config.env), sleep=no_sleep
        )
        self.assertEqual(len(report["flagged_spans"]), 1)
        span = report["flagged_spans"][0]
        self.assertTrue(span["located"])
        self.assertIn("Chrome stopped loading", span["excerpt"])

    def test_anchoring_fails_gracefully_when_the_span_is_absent(self):
        result = anchor_target = fixture_json("ai_multiwindow")
        result = dict(anchor_target, text="Entirely unrelated returned text.")
        spans = pangram.flagged_spans(result, fixture_text("ai_multiwindow"))
        self.assertEqual(len(spans), 1)
        self.assertFalse(spans[0]["located"])
        self.assertIn("could not find", spans[0]["reason"])

    def test_anchoring_is_whitespace_insensitive(self):
        submitted = "The first sentence here.\n\n\nAnd   a second     sentence."
        located = pangram.anchor_span(
            "The first sentence here. And a second sentence.", submitted
        )
        self.assertTrue(located["located"])

    def test_an_empty_span_reports_rather_than_guessing(self):
        result = pangram.anchor_span("", "some submitted text")
        self.assertFalse(result["located"])


class CommandLineTests(unittest.TestCase):
    """Exercise the script as a process, which is how hooks will call it."""

    def run_cli(self, stdin: bytes, env_overrides=None):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        empty_path = pathlib.Path(directory.name) / "empty-bin"
        empty_path.mkdir()
        # PATH is deliberately empty so the real `op` binary is unreachable.
        # Inheriting it would let a test resolve a live credential and make a
        # real API call. Python itself is launched by absolute path.
        env = {
            "PATH": str(empty_path),
            "HOME": directory.name,
            "XDG_CONFIG_HOME": directory.name,
        }
        if env_overrides:
            env.update(env_overrides)
        return subprocess.run(
            [sys.executable, str(SCRIPT)],
            input=stdin,
            capture_output=True,
            env=env,
        )

    def test_short_text_skips_without_any_credential(self):
        result = self.run_cli(b"Too short to classify at all.")
        self.assertEqual(result.returncode, pangram.EXIT_SKIPPED)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "SKIPPED")
        self.assertIsNone(payload["verdict"])
        self.assertNotIn("stamp_path", payload)

    def test_missing_secret_exits_unavailable(self):
        long_text = " ".join(f"word{n}" for n in range(60)).encode("utf-8")
        result = self.run_cli(long_text)
        self.assertEqual(result.returncode, pangram.EXIT_UNAVAILABLE)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "UNAVAILABLE")
        # Assert which branch fired, so the test cannot pass for the wrong
        # reason (a network error, say, rather than the missing credential).
        self.assertIn("no Pangram API key", payload["error"])

    def run_flag(self, flag, env_overrides=None):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        empty_path = pathlib.Path(directory.name) / "empty-bin"
        empty_path.mkdir()
        # Empty PATH: neither `op` nor `security` is reachable from a test.
        env = {
            "PATH": str(empty_path),
            "HOME": directory.name,
            "XDG_CONFIG_HOME": directory.name,
        }
        env.update(env_overrides or {})
        return subprocess.run(
            [sys.executable, str(SCRIPT), flag],
            stdin=subprocess.DEVNULL,
            capture_output=True,
            env=env,
            timeout=30,
        )

    def test_check_key_without_a_key_exits_unavailable_loudly(self):
        result = self.run_flag("--check-key")
        self.assertEqual(result.returncode, pangram.EXIT_UNAVAILABLE)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "UNAVAILABLE")
        self.assertIn("--install-key", payload["error"])
        self.assertIn(b"no Pangram API key", result.stderr)

    def test_check_key_with_a_key_exits_zero_and_never_prints_it(self):
        result = self.run_flag("--check-key", {"PANGRAM_API_KEY": "sk-cli-secret"})
        self.assertEqual(result.returncode, pangram.EXIT_PASS)
        self.assertEqual(json.loads(result.stdout), {"status": "KEY_OK"})
        self.assertNotIn(b"sk-cli-secret", result.stdout + result.stderr)

    def test_install_key_without_op_prints_the_manual_command(self):
        result = self.run_flag("--install-key")
        self.assertEqual(result.returncode, pangram.EXIT_UNAVAILABLE)
        self.assertIn(
            b"security add-generic-password -U -a \"$(id -un)\" "
            b"-s personify-pangram-key -w",
            result.stderr,
        )

    def test_arguments_are_rejected(self):
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--unexpected"],
            input=b"",
            capture_output=True,
        )
        self.assertEqual(result.returncode, pangram.EXIT_UNAVAILABLE)

    def test_exit_codes_are_distinct(self):
        codes = [
            pangram.EXIT_PASS,
            pangram.EXIT_FAIL,
            pangram.EXIT_FAIL_MIXED,
            pangram.EXIT_SKIPPED,
            pangram.EXIT_UNAVAILABLE,
        ]
        self.assertEqual(len(set(codes)), len(codes))
        self.assertNotIn(1, codes)


class CostReportingTests(unittest.TestCase):
    def test_v4_bills_each_started_hundred_words(self):
        self.assertEqual(pangram.estimated_cost("pangram-4", 100), 0.05)
        self.assertEqual(pangram.estimated_cost("pangram-4", 101), 0.1)
        self.assertEqual(pangram.estimated_cost("pangram-4", 400), 0.2)

    def test_the_default_alias_is_unpriced_because_its_target_moves(self):
        self.assertIsNone(pangram.estimated_cost("default", 200))

    def test_an_unknown_model_reports_no_cost_rather_than_a_wrong_one(self):
        self.assertIsNone(pangram.estimated_cost("pangram-99", 200))


class OnePasswordFallbackTests(unittest.TestCase):
    def test_a_missing_op_binary_resolves_to_nothing(self):
        with mock.patch.object(
            pangram.subprocess, "run", side_effect=FileNotFoundError()
        ):
            self.assertIsNone(pangram.read_op_secret())

    def test_a_timeout_resolves_to_nothing(self):
        with mock.patch.object(
            pangram.subprocess,
            "run",
            side_effect=subprocess.TimeoutExpired("op", 15),
        ):
            self.assertIsNone(pangram.read_op_secret())

    def test_a_nonzero_exit_resolves_to_nothing(self):
        completed = subprocess.CompletedProcess(["op"], 1, stdout="", stderr="no tty")
        with mock.patch.object(pangram.subprocess, "run", return_value=completed):
            self.assertIsNone(pangram.read_op_secret())


if __name__ == "__main__":
    unittest.main()
