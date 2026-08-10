import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const DEFAULT_TOKEN_PATH = join(
  process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
  "personify",
  "token",
);

export type TokenResult =
  { ok: true; token: string } | { ok: false; error: string };

export async function loadOAuthToken(
  opts: { tokenPath?: string } = {},
): Promise<TokenResult> {
  const tokenPath = opts.tokenPath ?? DEFAULT_TOKEN_PATH;

  let fileStat;
  try {
    fileStat = await stat(tokenPath);
  } catch {
    return {
      ok: false,
      error:
        `no OAuth token found at ${tokenPath}. Run "claude setup-token" ` +
        `and save the printed token to this path (see mcp-server/token.example ` +
        `for the expected format).`,
    };
  }

  // Only the owner may read or write: reject group/other permission bits.
  // 0o777 masks the permission bits out of the full mode returned by stat().
  const mode = fileStat.mode & 0o777;
  if (mode & 0o077) {
    return {
      ok: false,
      error:
        `${tokenPath} has overly permissive file permissions (mode ` +
        `${mode.toString(8)}). Run "chmod 600 ${tokenPath}" and try again.`,
    };
  }

  const tokenDir = dirname(tokenPath);
  let dirStat;
  try {
    dirStat = await stat(tokenDir);
  } catch (err) {
    return {
      ok: false,
      error: `could not check permissions on ${tokenDir}: ${(err as NodeJS.ErrnoException).code ?? "unknown error"}.`,
    };
  }
  const dirMode = dirStat.mode & 0o777;
  if (dirMode & 0o022) {
    return {
      ok: false,
      error:
        `${tokenDir} is group- or world-writable (mode ${dirMode.toString(8)}), ` +
        `which lets other local users replace or delete the token file. Run ` +
        `"chmod go-w ${tokenDir}" and try again.`,
    };
  }

  let raw: string;
  try {
    raw = await readFile(tokenPath, "utf8");
  } catch (err) {
    return {
      ok: false,
      error: `could not read ${tokenPath}: ${(err as NodeJS.ErrnoException).code ?? "unknown error"}.`,
    };
  }
  const token = raw.trim();
  if (token.length === 0) {
    return {
      ok: false,
      error: `${tokenPath} is empty. Run "claude setup-token" and save the printed token there.`,
    };
  }

  return { ok: true, token };
}
