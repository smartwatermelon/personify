// Names the publish file and, when known, the kind of text; restates no
// SKILL.md rule.
export function buildInstruction(bodyPath: string, kind?: string): string {
  const kindLine = kind
    ? ` The text is a ${kind}. Apply that kind's rules, and if ` +
      `length_check.py accepts --kind ${kind}, check the file with it.`
    : "";
  return (
    "Run the personify:personify skill on the text provided via stdin. " +
    `Write your final text to ${bodyPath}, and nothing else to that file.` +
    kindLine
  );
}

// The kind lands in a prompt, then a shell command: no quotes or spaces.
const KIND_SHAPE = /^[a-z][a-z-]*$/;

export function validateKind(kind: string): string | null {
  if (!KIND_SHAPE.test(kind))
    return `kind must be a lowercase word such as pr or copy: ${JSON.stringify(kind)}`;
  return null;
}

export type VoiceGuideInput = { path: string; realpath: string };

export type CliArgsInput = {
  installPath: string;
  voiceGuide: VoiceGuideInput | null;
  bodyPath: string;
  kind?: string;
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
    `Bash(python3 ${input.installPath}/scripts/length_check.py:*)`,
    `Read(/${input.installPath}/**)`,
    ...voiceRules,
    // The length check reads the file through a `< body.md` redirect, which
    // the CLI checks as a Read; Edit alone lets the model write it only.
    `Read(/${input.bodyPath})`,
    `Edit(/${input.bodyPath})`,
  ];
  // The prompt must come before --allowedTools, which is variadic.
  return [
    "--print",
    buildInstruction(input.bodyPath, input.kind),
    "--output-format",
    "json",
    "--allowedTools",
    ...rules,
  ];
}
