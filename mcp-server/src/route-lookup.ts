import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { destinationFlags, hasDestination } from "./cli-args.js";
import { configRoot } from "./paths.js";
import type { Destination } from "./types.js";

export const ROUTE_TIMEOUT_MS = 15_000;

// Only labels why no stamp landed; pangram_check.py decides and fails
// closed. Never calls Pangram.
export type RouteLookup =
  | { state: "off" }
  | { state: "no_destination" }
  | { state: "check" }
  | { state: "not_needed"; outcome: string; rule: string }
  | { state: "unknown"; error: string };

function run(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ ok: true; stdout: string } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { env, timeout: ROUTE_TIMEOUT_MS, shell: false },
      (err, stdout) => {
        if (err) resolve({ ok: false, error: err.message });
        else resolve({ ok: true, stdout: String(stdout) });
      },
    );
  });
}

export async function lookupRoute(
  env: NodeJS.ProcessEnv,
  destination: Destination,
): Promise<RouteLookup> {
  let raw: string;
  try {
    raw = await readFile(join(configRoot(env), "route-command"), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT")
      return { state: "off" };
    return { state: "unknown", error: `cannot read route-command: ${err}` };
  }
  if (!hasDestination(destination)) return { state: "no_destination" };

  const command = raw.trim();
  if (!isAbsolute(command) || command.includes("\n"))
    return {
      state: "unknown",
      error: "route-command is not one absolute path",
    };
  try {
    await access(command, constants.X_OK);
  } catch {
    return { state: "unknown", error: `${command} is not executable` };
  }

  const result = await run(
    command,
    ["route", ...destinationFlags(destination)],
    env,
  );
  if (!result.ok) return { state: "unknown", error: result.error };
  const [outcome = "", rule = ""] = (result.stdout.split("\n")[0] ?? "")
    .split("\t")
    .map((field) => field.trim());
  if (outcome === "pangram") return { state: "check" };
  if (outcome === "visual" || outcome === "exempt")
    return { state: "not_needed", outcome, rule };
  return { state: "unknown", error: `unknown route outcome: ${outcome}` };
}
