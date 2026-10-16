import type { Destination } from "./types.js";

// Names the publish file and any destination flags; restates no SKILL.md
// rule.
export function buildInstruction(
  bodyPath: string,
  destinationFlags: string[] = [],
): string {
  const flags =
    destinationFlags.length > 0
      ? " When you run the check, pass these destination flags to " +
        `pangram_check.py exactly as written: ${destinationFlags.join(" ")}.`
      : "";
  return (
    "Run the personify:personify skill on the text provided via stdin. " +
    `The file this text publishes from is ${bodyPath}. Write your final ` +
    "text to that file, then follow the skill's check against it." +
    flags
  );
}

// Values land in a prompt, then a shell command: no quotes or spaces.
const REPO_SHAPE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const DIR_SHAPE = /^\/[A-Za-z0-9_.\/@+-]*$/;
const KIND_SHAPE = /^[a-z][a-z-]*$/;

export function validateDestination(dest: Destination): string | null {
  if (dest.repo !== undefined && !REPO_SHAPE.test(dest.repo))
    return `repo must look like owner/name: ${JSON.stringify(dest.repo)}`;
  if (dest.dir !== undefined && !DIR_SHAPE.test(dest.dir))
    return (
      "dir must be an absolute path of letters, digits, and . _ / @ + - " +
      `only: ${JSON.stringify(dest.dir)}`
    );
  if (dest.kind !== undefined && !KIND_SHAPE.test(dest.kind))
    return `kind must be a lowercase word such as pr or copy: ${JSON.stringify(dest.kind)}`;
  return null;
}

// Same order as gate-review.sh route: --kind, --repo, --dir.
export function destinationFlags(dest: Destination): string[] {
  const flags: string[] = [];
  if (dest.kind) flags.push("--kind", dest.kind);
  if (dest.repo) flags.push("--repo", dest.repo);
  if (dest.dir) flags.push("--dir", dest.dir);
  return flags;
}

export function hasDestination(dest: Destination): boolean {
  return Boolean(dest.repo || dest.dir || dest.kind === "copy");
}

export type VoiceGuideInput = { path: string; realpath: string };

export type CliArgsInput = {
  installPath: string;
  voiceGuide: VoiceGuideInput | null;
  bodyPath: string;
  destinationFlags?: string[];
};

// Every rule here was measured on 2026-09-22 (see the spec). Under --print,
// anything not listed is denied without a prompt, which is the fail-closed
// behavior this relies on. Absolute paths in a permission rule take one
// extra leading slash, and file writes are granted by Edit, not Write.
// The double slash is not a typo: in a rule, `/path` is relative to the
// settings source (the working directory for CLI flags) and only `//path`
// is the filesystem root. See "Read and Edit" path patterns in
// https://code.claude.com/docs/en/permissions.
//
// There is no configRoot rule: the only thing the skill reads under the
// config directory is VOICE.md, granted below by its own path and realpath.
// A blanket Read(//<configRoot>/**) would also expose the bridge's OAuth
// token file, which lives in the same directory.
export function buildCliArgs(input: CliArgsInput): string[] {
  const paths = [input.installPath, input.bodyPath];
  if (input.voiceGuide)
    paths.push(input.voiceGuide.path, input.voiceGuide.realpath);
  for (const path of paths) {
    if (!path.startsWith("/")) {
      throw new Error(`permission rule path must be absolute: ${path}`);
    }
  }
  const voiceRules = input.voiceGuide
    ? [
        `Read(/${input.voiceGuide.path})`,
        // A symlinked guide needs both rules: Claude Code checks a Read
        // against the symlink path and its resolved target separately.
        ...(input.voiceGuide.realpath !== input.voiceGuide.path
          ? [`Read(/${input.voiceGuide.realpath})`]
          : []),
      ]
    : [];
  const rules = [
    `Bash(python3 ${input.installPath}/scripts/pangram_check.py:*)`,
    `Read(/${input.installPath}/**)`,
    ...voiceRules,
    // The check reads the file through a `< body.md` redirect, which the CLI
    // checks as a Read; Edit alone let the model write it but not check it.
    `Read(/${input.bodyPath})`,
    `Edit(/${input.bodyPath})`,
  ];
  // The prompt must come before --allowedTools, which is variadic.
  return [
    "--print",
    buildInstruction(input.bodyPath, input.destinationFlags),
    "--output-format",
    "json",
    "--allowedTools",
    ...rules,
  ];
}
