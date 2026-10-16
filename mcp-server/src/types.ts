export type VersionCheckResult =
  { stale: false } | { stale: true; installed: string; latest: string };

// Where the text will publish. Passed through to pangram_check.py as
// --repo, --dir and --kind, for its opt-in route guard.
export type Destination = { repo?: string; dir?: string; kind?: string };

export type Outcome =
  | { kind: "verified"; text: string; sha256: string; taskId?: string }
  | {
      kind: "not_verified";
      draft: string;
      sha256: string;
      report: string;
      // Why no verdict exists, when the bridge knows: the route said no check
      // was needed, or no destination was given. Replaces the default line.
      note?: string;
    }
  | { kind: "failed"; error: string; report?: string };
