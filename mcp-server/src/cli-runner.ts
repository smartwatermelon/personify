import { spawn } from "node:child_process";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildCliArgs,
  destinationFlags,
  validateDestination,
} from "./cli-args.js";
import { locateInstall } from "./install-locator.js";
import { checkPangramKey } from "./key-preflight.js";
import { configRoot, resolveVoiceGuide } from "./paths.js";
import { lookupRoute, type RouteLookup } from "./route-lookup.js";
import { checkStamp } from "./stamp-verifier.js";
import { loadOAuthToken } from "./token.js";
import type { Destination, Outcome } from "./types.js";

// One draft plus one Pangram check. Measured at 30 to 40 s on 2026-09-22.
// The check script can poll for about 220 s at worst. The CLI's Bash tool
// limit follows BASH_DEFAULT_TIMEOUT_MS from the user's settings (300 s on
// the maintainer's machine); when that is 180 s or more, this budget fires
// first. Every limit here fails closed.
export const DEFAULT_TIMEOUT_MS = 180_000;

export type RunOptions = {
  timeoutMs?: number;
  tokenPath?: string;
  installedPluginsPath?: string;
  env?: NodeJS.ProcessEnv;
  destination?: Destination;
};

// What to tell the reader when no stamp landed and the route explains why.
// The skill's own check makes the same decision; this only labels it.
export function routeNote(route: RouteLookup): string | undefined {
  if (route.state === "no_destination")
    return (
      "Pangram not run: no destination given. Pass repo, dir, or kind so " +
      "the route can decide whether this text needs a check."
    );
  if (route.state === "not_needed")
    return (
      `no Pangram check needed for this destination (route ` +
      `${route.outcome}, rule ${route.rule}). Review it before sending.`
    );
  return undefined;
}

type ChildResult =
  | { kind: "exited"; code: number | null; stdout: string; stderr: string }
  | { kind: "timeout"; stdout: string }
  | { kind: "spawn_error"; message: string };

// --output-format json puts the model's final message in `result`. It is
// only ever shown as a report; the outcome is decided by the file and stamp.
export function parseReport(stdout: string): string {
  try {
    const parsed = JSON.parse(stdout);
    if (typeof parsed?.result === "string") return parsed.result.trim();
  } catch {
    // Not JSON: show what the CLI printed.
  }
  return stdout.trim();
}

function runChild(
  args: string[],
  text: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<ChildResult> {
  return new Promise((resolve) => {
    // No cwd on purpose: Claude Code keys session transcripts by cwd, so a
    // per-call temp dir would create a new ~/.claude/projects/ entry each time.
    const child = spawn("claude", args, {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      env,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      const killTimer = setTimeout(() => child.kill("SIGKILL"), 5_000);
      killTimer.unref();
      resolve({ kind: "timeout", stdout });
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ kind: "spawn_error", message: err.message });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ kind: "exited", code, stdout, stderr });
    });
    child.stdin?.on("error", () => {
      // Swallow EPIPE: the child exited before draining stdin. The real
      // outcome is reported by the close/error handlers above.
    });
    child.stdin?.write(text);
    child.stdin?.end();
  });
}

export async function runPersonify(
  text: string,
  opts: RunOptions = {},
): Promise<Outcome> {
  if (text.trim().length === 0) {
    return { kind: "failed", error: "no text provided" };
  }
  const env = opts.env ?? process.env;
  const destination = opts.destination ?? {};
  const invalid = validateDestination(destination);
  if (invalid) return { kind: "failed", error: invalid };

  const install = await locateInstall(opts.installedPluginsPath);
  if (!install) {
    return {
      kind: "failed",
      error:
        "the personify plugin is not installed, or its install has no " +
        "scripts/pangram_check.py. Install it with " +
        "/plugin install personify@personify.",
    };
  }

  const key = await checkPangramKey(install.scriptPath, env);
  if (key.kind === "missing") return { kind: "failed", error: key.error };

  const token = await loadOAuthToken({ tokenPath: opts.tokenPath });
  if (!token.ok) return { kind: "failed", error: token.error };

  const root = configRoot(env);
  const route = await lookupRoute(env, destination);
  // realpath matters on macOS, where the temp dir sits behind a /var symlink
  // and a permission rule naming the unresolved path may not match.
  const dir = await realpath(await mkdtemp(join(tmpdir(), "personify-")));
  const bodyPath = join(dir, "body.md");
  try {
    const args = buildCliArgs({
      installPath: install.installPath,
      voiceGuide: await resolveVoiceGuide(env),
      bodyPath,
      destinationFlags: destinationFlags(destination),
    });
    const child = await runChild(
      args,
      text,
      { ...env, CLAUDE_CODE_OAUTH_TOKEN: token.token },
      opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );

    if (child.kind === "spawn_error") {
      return {
        kind: "failed",
        error: `failed to spawn claude CLI: ${child.message}`,
      };
    }
    if (child.kind === "timeout") {
      const report = parseReport(child.stdout);
      return {
        kind: "failed",
        error: `personify CLI call timed out after ${opts.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`,
        ...(report ? { report } : {}),
      };
    }
    const report = parseReport(child.stdout);
    if (child.code !== 0) {
      return {
        kind: "failed",
        error: `personify CLI exited with exit code ${child.code}: ${child.stderr.trim() || report}`,
      };
    }

    let bytes: Buffer;
    try {
      bytes = await readFile(bodyPath);
    } catch {
      return {
        kind: "failed",
        error: "the CLI finished without writing a draft",
        ...(report ? { report } : {}),
      };
    }

    const stamp = await checkStamp(bytes, join(root, "stamps"));
    if (stamp.verified) {
      return {
        kind: "verified",
        text: bytes.toString("utf8"),
        sha256: stamp.sha256,
        ...(stamp.taskId ? { taskId: stamp.taskId } : {}),
      };
    }
    const note = routeNote(route);
    return {
      kind: "not_verified",
      draft: bytes.toString("utf8"),
      sha256: stamp.sha256,
      report,
      ...(note ? { note } : {}),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
