import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

// Same config directory as SKILL.md Step 0. An empty XDG_CONFIG_HOME falls
// through to ~/.config.
export function configRoot(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "personify");
}

export type VoiceGuide = { path: string; realpath: string };

// Same lookup order as SKILL.md Step 0. `path` is the candidate looked up,
// made absolute but not resolved through any symlink; `realpath` is its
// resolved target, which is what the CLI's Read rule has to name for a
// symlinked guide (~/.config/personify/VOICE.md usually is one).
export async function resolveVoiceGuide(
  env: NodeJS.ProcessEnv = process.env,
): Promise<VoiceGuide | null> {
  const candidate = env.PERSONIFY_VOICE || join(configRoot(env), "VOICE.md");
  const path = isAbsolute(candidate) ? candidate : resolve(candidate);
  try {
    return { path, realpath: await realpath(candidate) };
  } catch {
    // No guide is a supported state: the skill falls back to
    // VOICE.example.md, which the installPath Read rule already covers.
    return null;
  }
}
