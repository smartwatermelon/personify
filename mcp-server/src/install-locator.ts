import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_INSTALLED_PLUGINS_PATH = join(
  homedir(),
  ".claude/plugins/installed_plugins.json",
);

const PLUGIN_KEY = "personify@personify";

export type InstalledEntry = { installPath: string; version: string };

export async function readInstalledEntry(
  path: string = DEFAULT_INSTALLED_PLUGINS_PATH,
): Promise<InstalledEntry | null> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    const entry = parsed?.plugins?.[PLUGIN_KEY]?.[0];
    if (
      typeof entry?.installPath !== "string" ||
      typeof entry?.version !== "string"
    ) {
      return null;
    }
    return { installPath: entry.installPath, version: entry.version };
  } catch {
    return null;
  }
}

// Points the CLI at the installed skill, so a missing or half-removed install
// fails before a run.
export async function locateInstall(
  path: string = DEFAULT_INSTALLED_PLUGINS_PATH,
): Promise<InstalledEntry | null> {
  const entry = await readInstalledEntry(path);
  if (!entry || !entry.installPath.startsWith("/")) return null;
  try {
    await access(join(entry.installPath, "SKILL.md"), constants.R_OK);
  } catch {
    return null;
  }
  return entry;
}
