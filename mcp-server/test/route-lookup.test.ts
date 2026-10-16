import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lookupRoute } from "../src/route-lookup.js";

let root: string;
let env: NodeJS.ProcessEnv;
let argvFile: string;

// A real route-command script, like the one gate-review.sh provides. It
// records its argv one per line so the passthrough can be asserted.
async function router(body: string, mode = 0o755): Promise<string> {
  const script = join(root, "route-command.sh");
  await writeFile(
    script,
    `#!/bin/sh\nfor a in "$@"; do printf '%s\\n' "$a"; done > '${argvFile}'\n${body}\n`,
  );
  await chmod(script, mode);
  await mkdir(join(root, "xdg", "personify"), { recursive: true });
  await writeFile(
    join(root, "xdg", "personify", "route-command"),
    `${script}\n`,
  );
  return script;
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "route-"));
  argvFile = join(root, "argv");
  env = { XDG_CONFIG_HOME: join(root, "xdg"), PATH: process.env.PATH };
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("lookupRoute", () => {
  it("is off when no route-command file exists", async () => {
    expect(await lookupRoute(env, { repo: "a/b" })).toEqual({ state: "off" });
  });

  it("reports a missing destination without running the router", async () => {
    await router("printf 'pangram\\t1\\tx\\n'");
    expect(await lookupRoute(env, {})).toEqual({ state: "no_destination" });
    expect(await lookupRoute(env, { kind: "pr" })).toEqual({
      state: "no_destination",
    });
    await expect(readFile(argvFile, "utf8")).rejects.toThrow();
  });

  it("passes the destination through and reads an exempt route", async () => {
    await router("printf 'exempt\\t2\\tnot beacon\\n'");
    expect(
      await lookupRoute(env, { kind: "pr", repo: "a/b", dir: "/src/x" }),
    ).toEqual({ state: "not_needed", outcome: "exempt", rule: "2" });
    expect((await readFile(argvFile, "utf8")).split("\n")).toEqual([
      "route",
      "--kind",
      "pr",
      "--repo",
      "a/b",
      "--dir",
      "/src/x",
      "",
    ]);
  });

  it("reads a pangram route as a check", async () => {
    await router("printf 'pangram\\t1\\tbeacon\\n'");
    expect(await lookupRoute(env, { kind: "copy" })).toEqual({
      state: "check",
    });
  });

  it("is unknown on a non-zero exit, garbage, or a non-executable router", async () => {
    await router("exit 3");
    expect((await lookupRoute(env, { repo: "a/b" })).state).toBe("unknown");
    await router("echo nonsense");
    expect((await lookupRoute(env, { repo: "a/b" })).state).toBe("unknown");
    await router("printf 'exempt\\t2\\tx\\n'", 0o644);
    expect((await lookupRoute(env, { repo: "a/b" })).state).toBe("unknown");
  });

  it("is unknown, not off, when route-command exists but cannot be read", async () => {
    await mkdir(join(root, "xdg", "personify", "route-command"), {
      recursive: true,
    });
    expect((await lookupRoute(env, { repo: "a/b" })).state).toBe("unknown");
  });
});
