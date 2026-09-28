#!/usr/bin/env python3
"""Submit text to Pangram's detector once and report the verdict.

Reads raw bytes on stdin, writes a JSON result on stdout, and writes every
diagnostic to stderr. On a Human verdict it records a stamp keyed by the
sha256 of the raw stdin bytes, so a hook can later confirm that the exact
bytes being published were classified.

There is no edit loop. Measured data (Phase 0 of the Personify 2.0 plan)
shows that editing prose toward the detector does not move the verdict, so
the client submits each artifact exactly once. It retries only on transport
failures, never on a result.

INVOCATION CONTRACT, and it is load-bearing. Redirect the file into stdin:

    python3 pangram_check.py < body.md

Two flags run without reading stdin and without touching the network:

    python3 pangram_check.py --check-key     exit 0 if a key resolves, else 5
    python3 pangram_check.py --install-key   copy the key from 1Password into
                                             the macOS login Keychain

The stamp is keyed by the sha256 of the bytes stdin delivers, and the hook
hashes the file that `git commit -F` or `gh pr create --body-file` reads. Those
two hashes match only when stdin IS that file. `echo "$text" | pangram_check.py`
appends a trailing newline, changing the hash, and the stamp then matches
nothing. A pass earned that way silently fails to authorize the publish.

Exit codes:
    0  PASS         verdict Human; a stamp was written
    2  FAIL         verdict AI
    3  FAIL_MIXED   verdict Mixed
    4  SKIPPED      under the 40-word floor; no verdict, no stamp
    5  UNAVAILABLE  no secret, transport failure, STAGE_FAILED, bad usage

Every result (0, 2, 3, 4) also writes a check record to
checks/<sha256>.json. An error before a verdict (5) writes none.

Any unexpected exception also exits 5, so a caller that reads the exit code
fails closed rather than mistaking a crash for a pass.
"""

from __future__ import annotations

import hashlib
import json
import os
import pwd
import re
import shlex
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable

BASE_URL = "https://text.external-api.pangram.com"

EXIT_PASS = 0
EXIT_FAIL = 2
EXIT_FAIL_MIXED = 3
EXIT_SKIPPED = 4
EXIT_UNAVAILABLE = 5

# Below this many words the detector is not reliable in either direction. At
# 15 words a measured sample of AI-written prose came back Human at 1.0, so a
# short text is skipped rather than trusted. Never stamp a skipped text.
WORD_FLOOR = 40

# Pinned by name. The literal "default" alias routes to Pangram 3.3.2 until it
# retires on 2026-09-30, then to Pangram 4 at a tenfold price for long texts,
# so relying on it makes the bill depend on the date.
DEFAULT_MODEL = "pangram-4"

# The only prices the API is hardcoded against, because pricing is not exposed
# by any endpoint: (dollars, words per billing unit). Pangram bills each started
# unit, so a 101-word text costs two units. An unknown model, "default"
# included, reports a null cost rather than a wrong one.
PRICE_PER_UNIT = {"pangram-4": (0.05, 100)}

# A window is flagged when its label is anything other than Human Written.
# Key on the exact strings the API returns; the observed set is below.
HUMAN_LABEL = "Human Written"
KNOWN_LABELS = ("AI-Generated", "Lightly AI-Assisted", HUMAN_LABEL)

POLL_ATTEMPTS = 30
POLL_INITIAL_DELAY = 1.0
POLL_MAX_DELAY = 8.0
OP_TIMEOUT_SECONDS = 15
OP_ITEM_REFERENCE = "op://Automation/Pangram/API Key"
KEYCHAIN_SERVICE = "personify-pangram-key"
KEYCHAIN_TIMEOUT_SECONDS = 5
SCRIPT_PATH = Path(__file__).resolve()


class TransportError(Exception):
    """A failure to reach the API or an HTTP status that carries no verdict.

    `status` is the HTTP status when there was one, and None for a network
    level failure. Only transport errors are ever retried.

    Both args go to super().__init__ so the exception survives copy and
    pickle, which is what flake8-bugbear's B042 is about. `str(exc)` would
    then render the whole tuple, so `message` is kept as its own attribute
    and every caller formats that rather than the exception itself.
    """

    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message, status)
        self.message = message
        self.status = status

    def __str__(self) -> str:
        return self.message


class CheckError(Exception):
    """An unrecoverable condition that maps to a specific exit code.

    Same B042 shape as TransportError above.
    """

    def __init__(self, message: str, code: int = EXIT_UNAVAILABLE) -> None:
        super().__init__(message, code)
        self.message = message
        self.code = code

    def __str__(self) -> str:
        return self.message


def strip_markup(raw: str) -> str:
    """Remove the parts of a document that have no business being classified.

    Nothing is reinserted. The client never edits text, so the original bytes
    are what publishes and this stripped form is only what Pangram sees.
    """
    text = re.sub(r"^---\n.*?\n---\n", "", raw, flags=re.DOTALL)
    text = re.sub(r"```.*?```", "", text, flags=re.DOTALL)
    text = re.sub(r"(?m)^(?: {4}|\t).*$", "", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"(?m)^#{1,6}\s+", "", text)
    text = re.sub(r"(?m)^>\s?", "", text)
    text = re.sub(r"(?m)^[-*+]\s+", "", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


def word_count(text: str) -> int:
    return len(text.split())


def config_root(env: dict[str, str]) -> Path:
    base = env.get("XDG_CONFIG_HOME") or os.path.join(
        os.path.expanduser("~"), ".config"
    )
    return Path(base) / "personify"


def read_key_file(path: Path) -> str | None:
    """Read the API key from a file, enforcing the checks token.ts enforces.

    Returns None when the file is absent. Raises CheckError when the file is
    present but unsafe, because silently falling through to another source
    would hide a real permissions problem.
    """
    try:
        file_stat = path.stat()
    except OSError:
        return None

    mode = file_stat.st_mode & 0o777
    if mode & 0o077:
        raise CheckError(
            f"{path} has overly permissive file permissions (mode "
            f"{mode:o}). Run \"chmod 600 {path}\" and try again."
        )

    parent = path.parent
    try:
        dir_mode = parent.stat().st_mode & 0o777
    except OSError as err:
        raise CheckError(f"could not check permissions on {parent}: {err}")
    if dir_mode & 0o022:
        raise CheckError(
            f"{parent} is group- or world-writable (mode {dir_mode:o}), which "
            f"lets other local users replace the key file. Run "
            f"\"chmod go-w {parent}\" and try again."
        )

    try:
        raw = path.read_text(encoding="utf-8")
    except OSError as err:
        raise CheckError(f"could not read {path}: {err}")

    key = raw.strip()
    if not key:
        raise CheckError(f"{path} is empty. Write the Pangram API key there.")
    return key


def read_op_secret(reference: str = OP_ITEM_REFERENCE) -> str | None:
    """Fetch the key from 1Password, or return None if that is not possible.

    `op read` needs a TTY, which hooks and the MCP server do not have, so this
    is the bootstrap path rather than the everyday one.
    """
    try:
        result = subprocess.run(
            ["op", "read", reference],
            capture_output=True,
            text=True,
            timeout=OP_TIMEOUT_SECONDS,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if result.returncode != 0:
        return None
    key = result.stdout.strip()
    return key or None


def keychain_account() -> str:
    """The login name, read from the password database like `id -un`.

    Claude Desktop launches with a near-empty environment, so $USER may be
    unset where this runs.
    """
    return pwd.getpwuid(os.getuid()).pw_name


def read_keychain_secret() -> str | None:
    """Fetch the key from the macOS login Keychain, or return None.

    Skipped where `security` is not on PATH, which is every non-macOS host.
    """
    if shutil.which("security") is None:
        return None
    try:
        result = subprocess.run(
            [
                "security",
                "find-generic-password",
                "-a",
                keychain_account(),
                "-s",
                KEYCHAIN_SERVICE,
                "-w",
            ],
            capture_output=True,
            text=True,
            timeout=KEYCHAIN_TIMEOUT_SECONDS,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if result.returncode != 0:
        return None
    key = result.stdout.strip()
    return key or None


def write_keychain_secret(key: str) -> bool:
    """Store the key in the login Keychain, replacing any existing item."""
    if shutil.which("security") is None:
        return False
    try:
        result = subprocess.run(
            [
                "security",
                "add-generic-password",
                "-U",
                "-a",
                keychain_account(),
                "-s",
                KEYCHAIN_SERVICE,
                "-w",
                key,
            ],
            capture_output=True,
            text=True,
            timeout=KEYCHAIN_TIMEOUT_SECONDS,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    return result.returncode == 0


def install_key_command() -> str:
    return f"python3 {shlex.quote(str(SCRIPT_PATH))} --install-key"


def manual_keychain_command() -> str:
    # `-w` last with no value makes `security` prompt, which keeps the key out
    # of shell history.
    return (
        f'security add-generic-password -U -a "$(id -un)" '
        f"-s {KEYCHAIN_SERVICE} -w"
    )


def missing_key_message(env: dict[str, str]) -> str:
    return (
        "no Pangram API key found, so nothing can be verified. Install the key "
        "once from a terminal with:\n\n"
        f"    {install_key_command()}\n\n"
        "That copies it from 1Password into the macOS login Keychain. Without "
        "1Password, add it by hand; security prompts for the key:\n\n"
        f"    {manual_keychain_command()}\n\n"
        "Other sources, checked in this order: PANGRAM_API_KEY, the Keychain "
        f"item {KEYCHAIN_SERVICE}, {config_root(env) / 'pangram-key'} at mode "
        f'600, and "op read {OP_ITEM_REFERENCE}".'
    )


def resolve_key(
    env: dict[str, str],
    op_read: Callable[[], str | None] = read_op_secret,
    keychain_read: Callable[[], str | None] = read_keychain_secret,
) -> str:
    """Resolve the API key: env var, Keychain, key file, then 1Password.

    Claude Desktop launches MCP servers under launchd with a near-empty
    environment and `op read` fails without a TTY, so the Keychain copy and
    the key file are the sources reachable there. When the env var is set it
    wins, which keeps a one-off override working.
    """
    from_env = env.get("PANGRAM_API_KEY", "").strip()
    if from_env:
        return from_env

    from_keychain = keychain_read()
    if from_keychain:
        return from_keychain

    from_file = read_key_file(config_root(env) / "pangram-key")
    if from_file:
        return from_file

    from_op = op_read()
    if from_op:
        return from_op

    raise CheckError(missing_key_message(env))


def check_key(
    env: dict[str, str],
    op_read: Callable[[], str | None] = read_op_secret,
    keychain_read: Callable[[], str | None] = read_keychain_secret,
) -> tuple[int, dict]:
    """Report whether a key resolves, without printing it or calling Pangram."""
    try:
        resolve_key(env, op_read=op_read, keychain_read=keychain_read)
    except CheckError as err:
        return err.code, {"status": "UNAVAILABLE", "error": err.message}
    return EXIT_PASS, {"status": "KEY_OK"}


def install_key(
    op_read: Callable[[], str | None] = read_op_secret,
    keychain_write: Callable[[str], bool] = write_keychain_secret,
) -> tuple[int, str]:
    """Copy the key from 1Password into the Keychain. Never echoes the key."""
    manual = (
        "Add it by hand instead; security prompts for the key:\n\n"
        f"    {manual_keychain_command()}"
    )
    key = op_read()
    if not key:
        return EXIT_UNAVAILABLE, (
            f'could not read the key with "op read {OP_ITEM_REFERENCE}". '
            "Run this from a terminal signed in to 1Password. " + manual
        )
    if not keychain_write(key):
        return EXIT_UNAVAILABLE, (
            f"could not write the Keychain item {KEYCHAIN_SERVICE}. " + manual
        )
    return EXIT_PASS, (
        f"stored the Pangram API key in the login Keychain as {KEYCHAIN_SERVICE}."
    )


def urllib_request(api_key: str) -> Callable[[str, str, dict | None], dict]:
    """Build the real transport. Tests inject a replayer instead of patching."""

    def request(method: str, path: str, payload: dict | None = None) -> dict:
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        req = urllib.request.Request(
            f"{BASE_URL}{path}",
            data=data,
            method=method,
            headers={
                "x-api-key": api_key,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                body = response.read().decode("utf-8")
        except urllib.error.HTTPError as err:
            detail = ""
            try:
                detail = err.read().decode("utf-8", "replace")[:400]
            except Exception:  # noqa: BLE001 - the status matters, not this read
                pass
            raise TransportError(
                f"{method} {path} returned HTTP {err.code}. {detail}".strip(),
                status=err.code,
            )
        except urllib.error.URLError as err:
            raise TransportError(f"{method} {path} failed: {err.reason}")
        except OSError as err:
            raise TransportError(f"{method} {path} failed: {err}")
        try:
            return json.loads(body)
        except json.JSONDecodeError as err:
            raise TransportError(f"{method} {path} returned invalid JSON: {err}")

    return request


def lazy_request(
    env: dict[str, str],
) -> Callable[[str, str, dict | None], dict]:
    """Defer key resolution until the first call actually needs it.

    `check` tests the word floor before it makes any request, so a short text
    must not fail for want of a credential it was never going to use.
    """
    holder: dict[str, Callable[[str, str, dict | None], dict]] = {}

    def request(method: str, path: str, payload: dict | None = None) -> dict:
        if "impl" not in holder:
            holder["impl"] = urllib_request(resolve_key(env))
        return holder["impl"](method, path, payload)

    return request


def is_retryable(status: int | None) -> bool:
    """Retry a network failure, a 429, and a 5xx. Never retry anything else.

    402 is deliberately excluded: an account out of credits stays out of
    credits, and a retry only burns another call.
    """
    if status is None:
        return True
    if status == 429:
        return True
    return 500 <= status < 600


def describe_status(status: int | None, message: str) -> str:
    if status == 402:
        return (
            "Pangram rejected the request for lack of credits (HTTP 402). Top "
            f"up the account before retrying. {message}"
        )
    if status == 401 or status == 403:
        return f"Pangram rejected the API key (HTTP {status}). {message}"
    if status == 413:
        return f"the text is too large for Pangram (HTTP 413). {message}"
    if status == 422:
        return f"Pangram rejected the request body (HTTP 422). {message}"
    return message


def call_with_retry(
    request: Callable[[str, str, dict | None], dict],
    method: str,
    path: str,
    payload: dict | None,
    sleep: Callable[[float], None],
) -> dict:
    """Make one call, retrying at most once and only on a transport error."""
    try:
        return request(method, path, payload)
    except TransportError as first:
        if not is_retryable(first.status):
            raise CheckError(describe_status(first.status, str(first)))
        sleep(POLL_INITIAL_DELAY)
        try:
            return request(method, path, payload)
        except TransportError as second:
            raise CheckError(describe_status(second.status, str(second)))


def select_model(
    request: Callable[[str, str, dict | None], dict],
    env: dict[str, str],
    sleep: Callable[[float], None],
) -> str:
    """Pick the model, checking it against the live list rather than a constant.

    `model` becomes a required field on the POST after 2026-09-30, so it is
    always sent explicitly.
    """
    listing = call_with_retry(request, "GET", "/models", None, sleep)
    models = listing.get("models") or []
    requested = env.get("PANGRAM_MODEL", "").strip() or DEFAULT_MODEL
    if models and requested not in models:
        raise CheckError(
            f"model {requested!r} is not offered by Pangram. Available: "
            f"{', '.join(models)}."
        )
    return requested


def submit_and_poll(
    request: Callable[[str, str, dict | None], dict],
    text: str,
    model: str,
    sleep: Callable[[float], None],
) -> tuple[str, dict]:
    """Submit the text once and poll until the task settles."""
    created = call_with_retry(
        request,
        "POST",
        "/task",
        {"text": text, "model": model, "public_dashboard_link": False},
        sleep,
    )
    task_id = created.get("task_id")
    if not task_id:
        raise CheckError(f"Pangram returned no task_id: {created!r}")

    delay = POLL_INITIAL_DELAY
    result: dict = {}
    for _ in range(POLL_ATTEMPTS):
        result = call_with_retry(request, "GET", f"/task/{task_id}", None, sleep)
        stage = result.get("stage")
        if stage in ("STAGE_SUCCESS", "STAGE_FAILED"):
            break
        sleep(delay)
        delay = min(delay * 2, POLL_MAX_DELAY)
    else:
        raise CheckError(
            f"task {task_id} did not settle after {POLL_ATTEMPTS} polls."
        )

    if result.get("stage") == "STAGE_FAILED":
        # STAGE_FAILED comes back with prediction_short "", which is an error
        # and never a verdict. Treating it as one would read as a pass.
        raise CheckError(f"Pangram task {task_id} failed (STAGE_FAILED).")

    return task_id, result


def merge_windows(windows: Iterable[dict]) -> list[tuple[int, int]]:
    """Union flagged windows into maximal spans.

    Touching windows merge as well as overlapping ones: on v3 a 400-word text
    came back as [0, 2043] then [2043, 2258], adjacent rather than
    overlapping, and a contiguous flagged region is one region.
    """
    bounds = sorted(
        (int(w["start_index"]), int(w["end_index"]))
        for w in windows
        if w.get("label") != HUMAN_LABEL
    )
    merged: list[tuple[int, int]] = []
    for start, end in bounds:
        if merged and start <= merged[-1][1]:
            previous_start, previous_end = merged[-1]
            merged[-1] = (previous_start, max(previous_end, end))
        else:
            merged.append((start, end))
    return merged


def _normalized_words(text: str) -> list[str]:
    return text.split()


def anchor_span(span_text: str, submitted: str, probe_words: int = 5) -> dict:
    """Locate a span in the submitted text by content rather than by index.

    Window indices refer to the normalized text the API returns, not to what
    was submitted, so matching them against the original would silently
    misplace a span. Matching leading and trailing words whitespace
    insensitively is the only anchoring that survives normalization.
    """
    span_words = _normalized_words(span_text)
    if not span_words:
        return {"located": False, "reason": "the flagged span is empty"}

    head = " ".join(span_words[:probe_words])
    tail = " ".join(span_words[-probe_words:])
    flat = " ".join(_normalized_words(submitted))

    start = flat.find(head)
    if start < 0:
        return {
            "located": False,
            "reason": "could not find the start of the flagged span in the submitted text",
        }
    end = flat.rfind(tail)
    if end < 0 or end < start:
        return {
            "located": False,
            "reason": "could not find the end of the flagged span in the submitted text",
        }
    located = flat[start:end + len(tail)]
    # Report the edges rather than the whole span. A flagged span is often the
    # entire document, and echoing it back would repeat the artifact inside
    # the report without telling the reader anything more.
    if len(located) > 220:
        excerpt = f"{located[:100]} [...] {located[-100:]}"
    else:
        excerpt = located
    return {
        "located": True,
        "start": start,
        "end": end + len(tail),
        "excerpt": excerpt,
    }


def flagged_spans(result: dict, submitted: str) -> list[dict]:
    windows = result.get("windows") or []
    normalized = result.get("text") or ""
    spans = []
    for start, end in merge_windows(windows):
        span_text = normalized[start:end]
        span = {
            "normalized_start": start,
            "normalized_end": end,
            "word_count": word_count(span_text),
        }
        span.update(anchor_span(span_text, submitted))
        spans.append(span)
    return spans


def estimated_cost(model: str, words: int) -> float | None:
    price = PRICE_PER_UNIT.get(model)
    if price is None:
        return None
    dollars, unit_words = price
    return round(dollars * -(-words // unit_words), 6)


def _write_private_json(directory: Path, digest: str, payload: dict) -> Path:
    """Write <directory>/<digest>.json at 0600 inside a 0700 directory.

    Default umask would leave the file 0644 in a 0755 directory, where any
    local process could overwrite it. The temp file is created with the narrow
    mode rather than chmod'd afterwards, so the bytes are never on disk at a
    wider mode even briefly. mkdir's `mode` argument is masked by umask and
    does nothing to an existing directory, so the chmod runs explicitly.
    """
    directory.mkdir(parents=True, exist_ok=True)
    os.chmod(directory, 0o700)
    path = directory / f"{digest}.json"
    temporary = directory / f".{digest}.json.tmp"
    body = json.dumps(payload, indent=2) + "\n"
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        handle.write(body)
    os.replace(temporary, path)
    return path


def write_stamp(
    env: dict[str, str],
    digest: str,
    payload: dict,
) -> Path:
    """Record a verified Human verdict, keyed by the raw-bytes hash.

    The stamp carries `task_id` because that is what makes it hard to forge:
    GET /task/{id} can be re-read and returns both the verdict and the
    classified text, so a checker can confirm a stamp against Pangram rather
    than trusting bytes an agent could have written with echo.

    Stamps live under the personify config dir, never under
    ~/.claude/gate-review/, which hook-block-gate-dir-write.sh blocks.
    """
    return _write_private_json(config_root(env) / "stamps", digest, payload)


def write_check_record(env: dict[str, str], digest: str, record: dict) -> Path:
    """Record that these exact bytes were checked, whatever the result.

    The review gate's `stage` refuses a file with no record, so this is what
    proves Pangram saw the text before a person was asked to approve it. It
    proves the check ran, not that it passed: FAIL and SKIPPED are recorded
    exactly as PASS is. Only a stamp authorizes anything on its own.
    """
    return _write_private_json(config_root(env) / "checks", digest, record)


def check(
    raw: bytes,
    *,
    request: Callable[[str, str, dict | None], dict],
    env: dict[str, str] | None = None,
    sleep: Callable[[float], None] = time.sleep,
    now: Callable[[], datetime] | None = None,
) -> tuple[int, dict]:
    """Classify one artifact and return (exit code, report).

    `raw` is the exact bytes that will publish. The hash is taken over those
    bytes before any decoding or stripping, because the hook hashes the same
    file that `git commit -F` or `--body-file` reads. A hash of stripped text
    would never match a stamp.
    """
    env = dict(os.environ) if env is None else env
    clock = now or (lambda: datetime.now(timezone.utc))

    digest = hashlib.sha256(raw).hexdigest()
    decoded = raw.decode("utf-8", errors="replace")
    submitted = strip_markup(decoded)
    words = word_count(submitted)

    def record(status: str, **fields: Any) -> str:
        entry = {
            "sha256": digest,
            "status": status,
            "verdict": None,
            "fraction_ai": None,
            "word_count": words,
            "task_id": None,
            "model": None,
            "timestamp": clock().replace(microsecond=0).isoformat(),
        }
        entry.update(fields)
        return str(write_check_record(env, digest, entry))

    # The floor is checked before the key is resolved, so a short reply never
    # shells out to 1Password and a skip needs no credential at all.
    if words < WORD_FLOOR:
        report = {
            "status": "SKIPPED",
            "verdict": None,
            "sha256": digest,
            "word_count": words,
            "reason": (
                f"{words} words is under the {WORD_FLOOR}-word floor, below "
                "which the detector produces false passes. No verdict, no stamp."
            ),
        }
        report["record_path"] = record("SKIPPED")
        return EXIT_SKIPPED, report

    model = select_model(request, env, sleep)
    task_id, result = submit_and_poll(request, submitted, model, sleep)

    verdict = result.get("prediction_short") or ""
    if not verdict:
        raise CheckError(f"Pangram task {task_id} returned no verdict.")

    version = result.get("version")
    report: dict[str, Any] = {
        "status": "PASS" if verdict == "Human" else "FAIL",
        "verdict": verdict,
        "sha256": digest,
        "task_id": task_id,
        "model": model,
        "api_version": version,
        "word_count": words,
        "estimated_cost_usd": estimated_cost(model, words),
        "fraction_ai": result.get("fraction_ai"),
        "fraction_ai_assisted": result.get("fraction_ai_assisted"),
        "fraction_human": result.get("fraction_human"),
        "flagged_spans": [] if verdict == "Human" else flagged_spans(result, submitted),
    }

    report["record_path"] = record(
        report["status"],
        verdict=verdict,
        fraction_ai=report["fraction_ai"],
        task_id=task_id,
        model=model,
    )

    if verdict == "Human":
        stamp = {
            "sha256": digest,
            "task_id": task_id,
            "model": model,
            "api_version": version,
            "verdict": verdict,
            "timestamp": clock().replace(microsecond=0).isoformat(),
            "word_count": words,
        }
        report["stamp_path"] = str(write_stamp(env, digest, stamp))
        return EXIT_PASS, report

    if verdict == "Mixed":
        return EXIT_FAIL_MIXED, report
    return EXIT_FAIL, report


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    env = dict(os.environ)
    if argv == ["--check-key"]:
        try:
            code, report = check_key(env)
        except Exception as err:  # noqa: BLE001 - fail closed, as below
            code, report = EXIT_UNAVAILABLE, {"status": "UNAVAILABLE", "error": str(err)}
        print(json.dumps(report, indent=2))
        if code != EXIT_PASS:
            print(f"pangram_check: {report['error']}", file=sys.stderr)
        return code
    if argv == ["--install-key"]:
        code, message = install_key()
        print(f"pangram_check: {message}", file=sys.stderr)
        return code
    if argv:
        print(__doc__, file=sys.stderr)
        return EXIT_UNAVAILABLE

    raw = sys.stdin.buffer.read()
    try:
        # The key is resolved lazily, on the first request, so that a text
        # under the word floor skips without needing a credential at all.
        code, report = check(raw, request=lazy_request(env), env=env)
    except CheckError as err:
        print(json.dumps({"status": "UNAVAILABLE", "error": str(err)}, indent=2))
        print(f"pangram_check: {err}", file=sys.stderr)
        return err.code
    except Exception as err:  # noqa: BLE001 - fail closed on anything unexpected
        import traceback

        traceback.print_exc(file=sys.stderr)
        print(json.dumps({"status": "UNAVAILABLE", "error": str(err)}, indent=2))
        return EXIT_UNAVAILABLE

    print(json.dumps(report, indent=2))
    return code


if __name__ == "__main__":
    sys.exit(main())
