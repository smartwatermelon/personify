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

const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));
const loadOAuthTokenMock = vi.fn();
vi.mock("../src/token.js", () => ({
  loadOAuthToken: (...args: unknown[]) => loadOAuthTokenMock(...args),
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
  loadOAuthTokenMock.mockResolvedValue({
    ok: true,
    token: "sk-ant-oat01-test",
  });
  root = await realpath(await mkdtemp(join(tmpdir(), "runner-")));
  installPath = join(root, "install");
  await mkdir(installPath, { recursive: true });
  await writeFile(join(installPath, "SKILL.md"), "");
  installed = join(root, "installed_plugins.json");
  await writeFile(
    installed,
    JSON.stringify({
      plugins: { "personify@personify": [{ installPath, version: "2.0.0" }] },
    }),
  );
  xdg = join(root, "xdg");
  await mkdir(join(xdg, "personify"), { recursive: true });
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

// Starts a run, waits for the spawn, and returns the child and its argv.
async function start(
  text = "some text",
  opts: {
    timeoutMs?: number;
    kind?: string;
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

  it("returns the file bytes as the rewritten text", async () => {
    const { child, promise, body } = await start();
    await writeFile(body, "Final text.\n");
    child.stdout.emit("data", Buffer.from(json("Done.")));
    child.emit("close", 0);
    expect(await promise).toEqual({ kind: "rewritten", text: "Final text.\n" });
  });

  // The model's final message is never the result: only the file is.
  it("ignores the model's stdout when the file was written", async () => {
    const { child, promise, body } = await start();
    await writeFile(body, "Draft.\n");
    child.stdout.emit("data", Buffer.from("plain words\n"));
    child.emit("close", 0);
    expect(await promise).toEqual({ kind: "rewritten", text: "Draft.\n" });
  });

  it("fails when the CLI writes an empty file", async () => {
    const { child, promise, body } = await start();
    await writeFile(body, " \n");
    child.stdout.emit("data", Buffer.from(json("Nothing to say.")));
    child.emit("close", 0);
    expect(await promise).toEqual({
      kind: "failed",
      error: "the CLI wrote an empty draft",
      report: "Nothing to say.",
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

  it("passes the kind into the CLI instruction", async () => {
    const { child, promise, args } = await start("t", { kind: "pr" });
    expect(args[1]).toContain("--kind pr");
    child.emit("close", 1);
    await promise;
  });

  it("allows only the length check script to run", async () => {
    const { child, promise, args } = await start();
    const bash = args.filter((a) => a.startsWith("Bash("));
    expect(bash).toEqual([
      `Bash(python3 ${installPath}/scripts/length_check.py:*)`,
    ]);
    child.emit("close", 1);
    await promise;
  });

  it("fails before spawning on a malformed kind", async () => {
    const outcome = await runPersonify("t", {
      installedPluginsPath: installed,
      env,
      kind: "PR --x",
    });
    expect(outcome.kind).toBe("failed");
    expect(spawnMock).not.toHaveBeenCalled();
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
