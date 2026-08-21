import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";

const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

const loadOAuthTokenMock = vi.fn();
vi.mock("../src/token.js", () => ({
  loadOAuthToken: (...args: unknown[]) => loadOAuthTokenMock(...args),
}));

const { runPersonify } = await import("../src/cli-runner.js");

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

describe("runPersonify", () => {
  beforeEach(() => {
    spawnMock.mockReset();
    loadOAuthTokenMock.mockReset();
    loadOAuthTokenMock.mockResolvedValue({
      ok: true,
      token: "sk-ant-oat01-test",
    });
  });

  it("spawns claude with a fixed argv, shell disabled, and writes text to stdin (no interpolation)", async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const resultPromise = runPersonify("some — text with an em dash");
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
    const [cmd, args, spawnOpts] = spawnMock.mock.calls[0];
    expect(cmd).toBe("claude");
    expect(args).toEqual([
      "--print",
      "--permission-mode",
      "auto",
      expect.stringContaining("personify:personify"),
    ]);
    // The user text must never appear inside argv — only on stdin.
    for (const arg of args as string[]) {
      expect(arg).not.toContain("some — text with an em dash");
    }
    expect(spawnOpts).toMatchObject({
      shell: false,
      env: expect.objectContaining({
        CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat01-test",
      }),
    });
    expect(child.stdin.write).toHaveBeenCalledWith(
      "some — text with an em dash",
    );
    expect(child.stdin.end).toHaveBeenCalled();

    child.stdout.emit("data", Buffer.from("some, text with an em dash"));
    child.emit("close", 0);

    const result = await resultPromise;
    expect(result).toEqual({ ok: true, text: "some, text with an em dash" });
  });

  // smartwatermelon/personify#50: PERSONIFY_INSTRUCTION already said "no
  // commentary, no preamble" and the CLI model emitted one anyway, so the
  // stripping pass runs on stdout rather than trusting the prompt.
  it("strips a leaked commentary preamble from CLI stdout", async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const resultPromise = runPersonify("draft text");
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
    child.stdout.emit(
      "data",
      Buffer.from(
        "This is an RFC/proposal document, long-form work writing, so I'll apply the voice guide's fingerprint and work-register rules.\n\nHere's the rewrite:\n\n# RFC: Personal Token Rollover\n\nEvery month my unused tokens evaporate.\n",
      ),
    );
    child.emit("close", 0);

    const result = await resultPromise;
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text.startsWith("# RFC: Personal Token Rollover")).toBe(
        true,
      );
      expect(result.text).not.toContain("so I'll apply");
      expect(result.text).not.toContain("Here's the rewrite:");
      expect(result.text).toContain("Every month my unused tokens evaporate.");
    }
  });

  it("maps non-zero exit code to a CliResult error including stderr", async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const resultPromise = runPersonify("text");
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
    child.stderr.emit("data", Buffer.from("skill not found"));
    child.emit("close", 1);

    const result = await resultPromise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("skill not found");
      expect(result.error).toContain("exit code 1");
    }
  });

  it("times out a hung subprocess and kills it", async () => {
    vi.useFakeTimers();
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const resultPromise = runPersonify("text", { timeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);

    const result = await resultPromise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("timed out");
    }
    expect(child.kill).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("swallows an EPIPE error on stdin instead of throwing or hanging", async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const resultPromise = runPersonify("some text");
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));

    // Simulate the child exiting before stdin drains: an EPIPE error event
    // fires on child.stdin. This must not become an uncaught exception.
    child.stdin.emit(
      "error",
      Object.assign(new Error("EPIPE"), { code: "EPIPE" }),
    );
    child.emit("close", 1);

    const result = await resultPromise;
    expect(result.ok).toBe(false);
  });

  it("rejects empty input before spawning a subprocess", async () => {
    const result = await runPersonify("   ");
    expect(result).toEqual({ ok: false, error: "no text provided" });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("returns a tool error without spawning when the token cannot be loaded", async () => {
    loadOAuthTokenMock.mockResolvedValue({
      ok: false,
      error: 'no OAuth token found at /fake/token. Run "claude setup-token"...',
    });

    const result = await runPersonify("some text");

    expect(result).toEqual({
      ok: false,
      error: 'no OAuth token found at /fake/token. Run "claude setup-token"...',
    });
    expect(spawnMock).not.toHaveBeenCalled();
  });
});
