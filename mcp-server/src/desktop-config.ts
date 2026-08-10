import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_DESKTOP_CONFIG_PATH = join(
  homedir(),
  "Library",
  "Application Support",
  "Claude",
  "claude_desktop_config.json",
);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mergeConfig(
  existing: unknown,
  serverEntryPath: string,
): Record<string, unknown> {
  if (existing !== undefined && !isPlainObject(existing)) {
    throw new Error(
      "claude_desktop_config.json does not contain a valid JSON object at its top level",
    );
  }

  const base: Record<string, unknown> = existing ? { ...existing } : {};
  const existingServers = isPlainObject(base.mcpServers) ? base.mcpServers : {};

  // Overwrite mcpServers in place (rather than spreading it in after ...base)
  // so its position in the key order matches the original file: only the
  // personify sub-key should look different in a diff, not the whole file.
  base.mcpServers = {
    ...existingServers,
    personify: {
      command: "node",
      args: [serverEntryPath],
    },
  };
  return base;
}
