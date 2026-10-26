export type VersionCheckResult =
  { stale: false } | { stale: true; installed: string; latest: string };

export type Outcome =
  | { kind: "rewritten"; text: string }
  | { kind: "failed"; error: string; report?: string };
