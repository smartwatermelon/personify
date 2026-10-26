import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, symlink, realpath } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { configRoot, resolveVoiceGuide } from "../src/paths.js";

describe("configRoot", () => {
  it("uses XDG_CONFIG_HOME when set", () => {
    expect(configRoot({ XDG_CONFIG_HOME: "/xdg" })).toBe("/xdg/personify");
  });

  it("falls back to ~/.config when XDG_CONFIG_HOME is unset or empty", () => {
    const expected = join(homedir(), ".config", "personify");
    expect(configRoot({})).toBe(expected);
    expect(configRoot({ XDG_CONFIG_HOME: "" })).toBe(expected);
  });
});

describe("resolveVoiceGuide", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await realpath(await mkdtemp(join(tmpdir(), "voice-")));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("prefers PERSONIFY_VOICE and returns both its path and its realpath", async () => {
    const target = join(dir, "real.md");
    const link = join(dir, "link.md");
    await writeFile(target, "voice");
    await symlink(target, link);
    expect(await resolveVoiceGuide({ PERSONIFY_VOICE: link })).toEqual({
      path: link,
      realpath: target,
    });
  });

  it("uses <configRoot>/VOICE.md when PERSONIFY_VOICE is unset", async () => {
    const root = join(dir, "personify");
    await import("node:fs/promises").then((fs) => fs.mkdir(root));
    const guide = join(root, "VOICE.md");
    await writeFile(guide, "voice");
    expect(await resolveVoiceGuide({ XDG_CONFIG_HOME: dir })).toEqual({
      path: guide,
      realpath: guide,
    });
  });

  it("returns null for a missing file or a dangling symlink", async () => {
    expect(
      await resolveVoiceGuide({ PERSONIFY_VOICE: join(dir, "nope.md") }),
    ).toBeNull();
    await symlink(join(dir, "gone.md"), join(dir, "dangling.md"));
    expect(
      await resolveVoiceGuide({ PERSONIFY_VOICE: join(dir, "dangling.md") }),
    ).toBeNull();
  });
});
