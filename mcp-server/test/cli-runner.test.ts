import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import {
  mkdtemp,
  rm,
  writeFile,
  mkdir,
  realpath,
  access,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));
const loadOAuthTokenMock = vi.fn();
vi.mock("../src/token.js", () => ({
  loadOAuthToken: (...args: unknown[]) => loadOAuthTokenMock(...args),
}));

const checkPangramKeyMock = vi.fn();
vi.mock("../src/key-preflight.js", () => ({
  checkPangramKey: (...args: unknown[]) => checkPangramKeyMock(...args),
}));

const lookupRouteMock = vi.fn();
vi.mock("../src/route-lookup.js", () => ({
  lookupRoute: (...args: unknown[]) => lookupRouteMock(...args),
}));

const { runPersonify, parseReport, DEFAULT_TIMEOUT_MS } =
  await import("../src/cli-runner.js");

function makeFakeChild() {
  const child = new EventEmitter() as ChildProcess & {
    stdin: EventEmitter & {
      write: ReturnType<typeof vi.fn>;
      end: ReturnType<typeof vi.fn>;
    };
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };
  const stdin = new EventEmitter() as EventEmitter & {
    write: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };
  stdin.write = vi.fn();
  stdin.end = vi.fn();
  child.stdin = stdin;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

let root: string;
let installed: string;
let installPath: string;
let xdg: string;
let env: NodeJS.ProcessEnv;

beforeEach(async () => {
  spawnMock.mockReset();
  loadOAuthTokenMock.mockReset();
  checkPangramKeyMock.mockReset();
  checkPangramKeyMock.mockResolvedValue({ kind: "ok" });
  lookupRouteMock.mockReset();
  lookupRouteMock.mockResolvedValue({ state: "off" });
  loadOAuthTokenMock.mockResolvedValue({
    ok: true,
    token: "sk-ant-oat01-test",
  });
  root = await realpath(await mkdtemp(join(tmpdir(), "runner-")));
  installPath = join(root, "install");
  await mkdir(join(installPath, "scripts"), { recursive: true });
  await writeFile(join(installPath, "scripts", "pangram_check.py"), "");
  installed = join(root, "installed_plugins.json");
  await writeFile(
    installed,
    JSON.stringify({
      plugins: { "personify@personify": [{ installPath, version: "2.0.0" }] },
    }),
  );
  xdg = join(root, "xdg");
  await mkdir(join(xdg, "personify", "stamps"), { recursive: true });
  env = { XDG_CONFIG_HOME: xdg, PATH: process.env.PATH };
});
afterEach(async () => {
  vi.useRealTimers();
  await rm(root, { recursive: true, force: true });
});

function bodyPathFrom(args: string[]): string {
  const rule = args.find((a) => a.startsWith("Edit(/"))!;
  return rule.slice("Edit(/".length, -1);
}

async function stamp(bytes: Buffer) {
  const sha = createHash("sha256").update(bytes).digest("hex");
  await writeFile(
    join(xdg, "personify", "stamps", `${sha}.json`),
    JSON.stringify({ sha256: sha, verdict: "Human", task_id: "t-9" }),
  );
  return sha;
}

// Starts a run, waits for the spawn, and returns the child and its argv.
async function start(
  text = "some text",
  opts: {
    timeoutMs?: number;
    destination?: { repo?: string; dir?: string; kind?: string };
  } = {},
) {
  const child = makeFakeChild();
  spawnMock.mockReturnValue(child);
  const promise = runPersonify(text, {
    installedPluginsPath: installed,
    env,
    ...opts,
  });
  await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
  const [cmd, args, spawnOpts] = spawnMock.mock.calls[0];
  return {
    child,
    promise,
    cmd,
    args: args as string[],
    spawnOpts,
    body: bodyPathFrom(args as string[]),
  };
}

const json = (result: string) => JSON.stringify({ type: "result", result });

describe("runPersonify", () => {
  // No cwd: Claude Code keys session transcripts by cwd under
  // ~/.claude/projects/, so a fresh temp dir as cwd would leave one new
  // project directory per call (observed after the 2026-09-22 spike).
  it("spawns claude without a shell or a cwd, text on stdin only", async () => {
    const { child, promise, cmd, args, spawnOpts } =
      await start("secret — text");
    expect(cmd).toBe("claude");
    for (const arg of args) expect(arg).not.toContain("secret — text");
    expect(spawnOpts).toMatchObject({
      shell: false,
      env: expect.objectContaining({
        CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat01-test",
      }),
    });
    expect(spawnOpts).not.toHaveProperty("cwd");
    expect(child.stdin.write).toHaveBeenCalledWith("secret — text");
    child.emit("close", 1);
    await promise;
  });

  // Review focus 1: os.tmpdir() on macOS is a symlink, and the Edit rule has
  // to name the real path or the CLI denies the write. TMPDIR points at a
  // symlink made here, so this fails on Linux CI too if realpath is dropped.
  it("names the realpath of the temp dir in the Edit rule", async () => {
    const realTmp = join(root, "real-tmp");
    const linkTmp = join(root, "link-tmp");
    await mkdir(realTmp);
    await symlink(realTmp, linkTmp);
    const saved = process.env.TMPDIR;
    process.env.TMPDIR = linkTmp;
    try {
      const { child, promise, body } = await start();
      expect(body.startsWith(`${realTmp}/`)).toBe(true);
      child.emit("close", 1);
      await promise;
    } finally {
      if (saved === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = saved;
    }
  });

  it("returns verified with the file bytes when a Human stamp matches", async () => {
    const { child, promise, body } = await start();
    const bytes = Buffer.from("Final text.\n", "utf8");
    await writeFile(body, bytes);
    const sha = await stamp(bytes);
    child.stdout.emit("data", Buffer.from(json("Passed.")));
    child.emit("close", 0);
    expect(await promise).toEqual({
      kind: "verified",
      text: "Final text.\n",
      sha256: sha,
      taskId: "t-9",
    });
  });

  it("returns not_verified with the model's report when no stamp exists", async () => {
    const { child, promise, body } = await start();
    await writeFile(body, "Draft.\n");
    child.stdout.emit("data", Buffer.from(json("Verdict AI, 1.0.")));
    child.emit("close", 0);
    const outcome = await promise;
    expect(outcome).toMatchObject({
      kind: "not_verified",
      draft: "Draft.\n",
      report: "Verdict AI, 1.0.",
    });
  });

  // Review focus 3: stamps follow XDG_CONFIG_HOME, as the script writes them.
  it("looks for stamps under XDG_CONFIG_HOME", async () => {
    const { child, promise, body } = await start();
    const bytes = Buffer.from("Final.\n");
    await writeFile(body, bytes);
    await stamp(bytes);
    child.emit("close", 0);
    expect((await promise).kind).toBe("verified");
  });

  // Review focus 4: the outcome comes from the file and stamp, not stdout.
  it("falls back to raw stdout as the report when it is not JSON", async () => {
    const { child, promise, body } = await start();
    await writeFile(body, "Draft.\n");
    child.stdout.emit("data", Buffer.from("plain words\n"));
    child.emit("close", 0);
    expect(await promise).toMatchObject({
      kind: "not_verified",
      report: "plain words",
    });
  });

  it("fails when the CLI exits 0 without writing the file", async () => {
    const { child, promise } = await start();
    child.stdout.emit("data", Buffer.from(json("Permission denied.")));
    child.emit("close", 0);
    expect(await promise).toMatchObject({
      kind: "failed",
      report: "Permission denied.",
    });
  });

  it("fails on a non-zero exit with stderr in the error", async () => {
    const { child, promise } = await start();
    child.stderr.emit("data", Buffer.from("skill not found"));
    child.emit("close", 1);
    const outcome = await promise;
    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") {
      expect(outcome.error).toContain("exit code 1");
      expect(outcome.error).toContain("skill not found");
    }
  });

  it("times out, kills the child, and fails", async () => {
    vi.useFakeTimers();
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);
    const promise = runPersonify("text", {
      installedPluginsPath: installed,
      env,
      timeoutMs: 1000,
    });
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(1000);
    vi.useRealTimers();
    const outcome = await promise;
    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") expect(outcome.error).toContain("timed out");
    expect(child.kill).toHaveBeenCalled();
  });

  it("fails on a spawn error", async () => {
    const { child, promise } = await start();
    child.emit("error", new Error("ENOENT"));
    const outcome = await promise;
    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed")
      expect(outcome.error).toContain("failed to spawn claude CLI");
  });

  it.each([
    [
      "success",
      {},
      async (c: EventEmitter, body: string) => {
        await writeFile(body, "x\n");
        c.emit("close", 0);
      },
    ],
    [
      "non-zero exit",
      {},
      async (c: EventEmitter) => {
        c.emit("close", 1);
      },
    ],
    [
      "timeout",
      { timeoutMs: 1 },
      // No signal from the test: the runner's own timer fires the close.
      async () => {},
    ],
    [
      "spawn error",
      {},
      async (c: EventEmitter) => {
        c.emit("error", new Error("boom"));
      },
    ],
  ])("removes the temp dir after %s", async (_name, opts, finish) => {
    const { child, promise, body } = await start("some text", opts);
    await finish(child, body);
    await promise;
    await expect(access(join(body, ".."))).rejects.toThrow();
  });

  it("swallows EPIPE on stdin", async () => {
    const { child, promise } = await start();
    child.stdin.emit(
      "error",
      Object.assign(new Error("EPIPE"), { code: "EPIPE" }),
    );
    child.emit("close", 1);
    expect((await promise).kind).toBe("failed");
  });

  it("rejects empty input before spawning", async () => {
    const outcome = await runPersonify("   ", {
      installedPluginsPath: installed,
      env,
    });
    expect(outcome).toEqual({ kind: "failed", error: "no text provided" });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("fails before spawning when the plugin is not installed", async () => {
    const outcome = await runPersonify("text", {
      installedPluginsPath: join(root, "absent.json"),
      env,
    });
    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed")
      expect(outcome.error).toContain("not installed");
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("fails before spawning when the token cannot be loaded", async () => {
    loadOAuthTokenMock.mockResolvedValue({
      ok: false,
      error: "no OAuth token found",
    });
    const outcome = await runPersonify("text", {
      installedPluginsPath: installed,
      env,
    });
    expect(outcome).toEqual({ kind: "failed", error: "no OAuth token found" });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("runs the key preflight against the installed script", async () => {
    const { child, promise } = await start();
    expect(checkPangramKeyMock).toHaveBeenCalledWith(
      join(installPath, "scripts", "pangram_check.py"),
      env,
    );
    child.emit("close", 1);
    await promise;
  });

  it("fails with the script's message, before spawning, when no key resolves", async () => {
    checkPangramKeyMock.mockResolvedValue({
      kind: "missing",
      error: "no Pangram API key found. Run --install-key.",
    });
    const outcome = await runPersonify("text", {
      installedPluginsPath: installed,
      env,
    });
    expect(outcome).toEqual({
      kind: "failed",
      error: "no Pangram API key found. Run --install-key.",
    });
    expect(spawnMock).not.toHaveBeenCalled();
    expect(loadOAuthTokenMock).not.toHaveBeenCalled();
  });

  it("proceeds as before when the preflight is skipped", async () => {
    checkPangramKeyMock.mockResolvedValue({
      kind: "skipped",
      reason: "the check script predates --check-key",
    });
    const { child, promise, body } = await start();
    await writeFile(body, "Draft.\n");
    child.emit("close", 0);
    expect((await promise).kind).toBe("not_verified");
  });

  it("passes the destination flags into the CLI instruction", async () => {
    const { child, promise, args } = await start("t", {
      destination: { repo: "beacon-biosignals/x", kind: "pr" },
    });
    expect(args[1]).toContain("--kind pr --repo beacon-biosignals/x");
    expect(lookupRouteMock).toHaveBeenCalledWith(env, {
      repo: "beacon-biosignals/x",
      kind: "pr",
    });
    child.emit("close", 1);
    await promise;
  });

  it("fails before spawning on a malformed destination", async () => {
    const outcome = await runPersonify("t", {
      installedPluginsPath: installed,
      env,
      destination: { dir: "relative" },
    });
    expect(outcome.kind).toBe("failed");
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("says Pangram did not run when the route needs a destination and none was given", async () => {
    lookupRouteMock.mockResolvedValue({ state: "no_destination" });
    const { child, promise, body } = await start();
    await writeFile(body, "Rewritten draft.\n");
    child.stdout.emit("data", Buffer.from(json("Check refused.")));
    child.emit("close", 0);
    const outcome = await promise;
    expect(outcome).toMatchObject({
      kind: "not_verified",
      draft: "Rewritten draft.\n",
      report: "Check refused.",
    });
    expect(outcome.kind === "not_verified" && outcome.note).toContain(
      "Pangram not run: no destination given",
    );
  });

  it("says no check was needed when the route is exempt", async () => {
    lookupRouteMock.mockResolvedValue({
      state: "not_needed",
      outcome: "exempt",
      rule: "2",
    });
    const { child, promise, body } = await start("t", {
      destination: { repo: "someone/else" },
    });
    await writeFile(body, "Draft.\n");
    child.emit("close", 0);
    const outcome = await promise;
    expect(outcome.kind === "not_verified" && outcome.note).toContain(
      "no Pangram check needed for this destination (route exempt, rule 2)",
    );
  });

  it("skips the key preflight when the route keeps the text from Pangram", async () => {
    checkPangramKeyMock.mockResolvedValue({
      kind: "missing",
      error: "no Pangram API key found.",
    });
    for (const route of [
      { state: "not_needed", outcome: "visual", rule: "3" },
      { state: "no_destination" },
    ]) {
      spawnMock.mockReset();
      checkPangramKeyMock.mockClear();
      lookupRouteMock.mockResolvedValue(route);
      const { child, promise, body } = await start("t", {
        destination: { repo: "someone/else" },
      });
      await writeFile(body, "Draft.\n");
      child.emit("close", 0);
      expect((await promise).kind).toBe("not_verified");
      expect(checkPangramKeyMock).not.toHaveBeenCalled();
    }
  });

  it("still runs the key preflight when the route asks for a check", async () => {
    lookupRouteMock.mockResolvedValue({ state: "check" });
    checkPangramKeyMock.mockResolvedValue({
      kind: "missing",
      error: "no Pangram API key found.",
    });
    const outcome = await runPersonify("t", {
      installedPluginsPath: installed,
      env,
      destination: { repo: "beacon-biosignals/x" },
    });
    expect(outcome).toEqual({
      kind: "failed",
      error: "no Pangram API key found.",
    });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("adds no note when the route asked for a check", async () => {
    lookupRouteMock.mockResolvedValue({ state: "check" });
    const { child, promise, body } = await start("t", {
      destination: { repo: "beacon-biosignals/x" },
    });
    await writeFile(body, "Draft.\n");
    child.emit("close", 0);
    const outcome = await promise;
    expect(outcome.kind).toBe("not_verified");
    expect(outcome).not.toHaveProperty("note");
  });

  it("keeps the 180s budget", () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(180_000);
  });
});

describe("parseReport", () => {
  it("reads result from the CLI's JSON output", () => {
    expect(parseReport(json("hello"))).toBe("hello");
  });
  it("falls back to trimmed stdout", () => {
    expect(parseReport("  not json \n")).toBe("not json");
  });
});
