export type CliResult =
  { ok: true; text: string } | { ok: false; error: string };

export type VersionCheckResult =
  { stale: false } | { stale: true; installed: string; latest: string };
