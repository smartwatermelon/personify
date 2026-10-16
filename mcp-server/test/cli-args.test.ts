import { describe, it, expect } from "vitest";
import {
  buildCliArgs,
  buildInstruction,
  destinationFlags,
  hasDestination,
  validateDestination,
} from "../src/cli-args.js";

const base = {
  installPath: "/plug/2.0.0",
  voiceGuide: { path: "/repo/link.md", realpath: "/repo/real.md" },
  bodyPath: "/private/tmp/p-1/body.md",
};

describe("buildCliArgs", () => {
  // Measured 2026-09-22: --allowedTools is variadic, so a prompt placed after
  // it was consumed as a tool name and the model never saw the instruction.
  it("puts the prompt before --allowedTools", () => {
    const args = buildCliArgs(base);
    expect(args.slice(0, 5)).toEqual([
      "--print",
      buildInstruction(base.bodyPath),
      "--output-format",
      "json",
      "--allowedTools",
    ]);
  });

  // configRoot is never named in a rule any more: the only thing the skill
  // reads under it is VOICE.md, and that is granted by its own path/realpath
  // rules below, not by a blanket rule that would also expose the token.
  it("allows the path and realpath of a symlinked voice guide", () => {
    expect(buildCliArgs(base).slice(5)).toEqual([
      "Bash(python3 /plug/2.0.0/scripts/pangram_check.py:*)",
      "Read(//plug/2.0.0/**)",
      "Read(//repo/link.md)",
      "Read(//repo/real.md)",
      "Read(//private/tmp/p-1/body.md)",
      "Edit(//private/tmp/p-1/body.md)",
    ]);
  });

  it("does not duplicate the rule when the voice guide is not a symlink", () => {
    const rules = buildCliArgs({
      ...base,
      voiceGuide: { path: "/repo/real.md", realpath: "/repo/real.md" },
    }).slice(5);
    expect(rules).toEqual([
      "Bash(python3 /plug/2.0.0/scripts/pangram_check.py:*)",
      "Read(//plug/2.0.0/**)",
      "Read(//repo/real.md)",
      "Read(//private/tmp/p-1/body.md)",
      "Edit(//private/tmp/p-1/body.md)",
    ]);
  });

  it("omits both voice guide rules when no guide resolved", () => {
    const rules = buildCliArgs({ ...base, voiceGuide: null }).slice(5);
    expect(rules).toEqual([
      "Bash(python3 /plug/2.0.0/scripts/pangram_check.py:*)",
      "Read(//plug/2.0.0/**)",
      "Read(//private/tmp/p-1/body.md)",
      "Edit(//private/tmp/p-1/body.md)",
    ]);
  });

  it("never passes --permission-mode", () => {
    expect(buildCliArgs(base)).not.toContain("--permission-mode");
  });

  it("rejects a relative path rather than emit a rule that matches nothing", () => {
    expect(() => buildCliArgs({ ...base, bodyPath: "body.md" })).toThrow(
      /absolute/,
    );
  });

  it("names no rule with the config root, only the voice guide path itself", () => {
    const rules = buildCliArgs(base).slice(5);
    for (const rule of rules) {
      if (rule.endsWith("/**)")) {
        expect(rule).toBe("Read(//plug/2.0.0/**)");
      }
    }
  });

  // Regression for the config-root leak this replaces: a rule naming the
  // config directory would also cover the bridge's own OAuth token file,
  // which sits next to VOICE.md there.
  it("never emits a rule scoped to the config directory, even when the guide lives there", () => {
    const rules = buildCliArgs({
      ...base,
      voiceGuide: {
        path: "/home/u/.config/personify/VOICE.md",
        realpath: "/home/u/dotfiles/VOICE.md",
      },
    }).slice(5);
    const configRules = rules.filter((r) =>
      r.includes("/home/u/.config/personify"),
    );
    expect(configRules).toEqual(["Read(//home/u/.config/personify/VOICE.md)"]);
  });
});

describe("buildInstruction", () => {
  it("names the skill and the publish file", () => {
    const text = buildInstruction("/private/tmp/p-1/body.md");
    expect(text).toContain("personify:personify");
    expect(text).toContain("/private/tmp/p-1/body.md");
  });
});

describe("destination passthrough", () => {
  it("names the destination flags in the instruction", () => {
    const flags = destinationFlags({
      repo: "beacon-biosignals/x",
      dir: "/src/x",
      kind: "pr",
    });
    expect(flags).toEqual([
      "--kind",
      "pr",
      "--repo",
      "beacon-biosignals/x",
      "--dir",
      "/src/x",
    ]);
    const args = buildCliArgs({
      installPath: "/opt/p",
      voiceGuide: null,
      bodyPath: "/private/tmp/p-1/body.md",
      destinationFlags: flags,
    });
    expect(args[1]).toContain(
      "--kind pr --repo beacon-biosignals/x --dir /src/x",
    );
  });

  it("leaves the instruction unchanged with no destination", () => {
    expect(buildInstruction("/b.md", [])).toBe(buildInstruction("/b.md"));
    expect(buildInstruction("/b.md")).not.toContain("--");
  });

  it("rejects values that could break out of the command", () => {
    expect(validateDestination({ repo: "a/b; rm x" })).toMatch(/repo/);
    expect(validateDestination({ repo: "noslash" })).toMatch(/repo/);
    expect(validateDestination({ dir: "relative/path" })).toMatch(/dir/);
    expect(validateDestination({ dir: "/a b" })).toMatch(/dir/);
    expect(validateDestination({ dir: "/a$(x)" })).toMatch(/dir/);
    expect(validateDestination({ kind: "PR --x" })).toMatch(/kind/);
    expect(
      validateDestination({
        repo: "o/n",
        dir: "/a/b-c_d.e",
        kind: "pr-comment",
      }),
    ).toBeNull();
  });

  it("counts --kind copy alone as a destination, any other kind not", () => {
    expect(hasDestination({ kind: "copy" })).toBe(true);
    expect(hasDestination({ kind: "pr" })).toBe(false);
    expect(hasDestination({ dir: "/x" })).toBe(true);
    expect(hasDestination({})).toBe(false);
  });
});
