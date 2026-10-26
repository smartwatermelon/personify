import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readInstalledEntry, locateInstall } from "../src/install-locator.js";

describe("install locator", () => {
  let dir: string;
  let installed: string;
  let installPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "install-"));
    installed = join(dir, "installed_plugins.json");
    installPath = join(dir, "cache", "2.0.0");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function writeInstalled(entry: unknown) {
    await writeFile(
      installed,
      JSON.stringify({ plugins: { "personify@personify": [entry] } }),
    );
  }

  it("reads installPath and version", async () => {
    await writeInstalled({ installPath, version: "2.0.0" });
    expect(await readInstalledEntry(installed)).toEqual({
      installPath,
      version: "2.0.0",
    });
  });

  it("returns null for a missing file, bad JSON, or no personify entry", async () => {
    expect(await readInstalledEntry(join(dir, "absent.json"))).toBeNull();
    await writeFile(installed, "{not json");
    expect(await readInstalledEntry(installed)).toBeNull();
    await writeFile(installed, JSON.stringify({ plugins: {} }));
    expect(await readInstalledEntry(installed)).toBeNull();
  });

  it("locates the install when its SKILL.md exists", async () => {
    await writeInstalled({ installPath, version: "2.0.0" });
    await mkdir(installPath, { recursive: true });
    await writeFile(join(installPath, "SKILL.md"), "");
    expect(await locateInstall(installed)).toEqual({
      installPath,
      version: "2.0.0",
    });
  });

  it("returns null when SKILL.md is missing", async () => {
    await writeInstalled({ installPath, version: "2.0.0" });
    expect(await locateInstall(installed)).toBeNull();
  });

  it("returns null when installPath is not absolute", async () => {
    await writeInstalled({ installPath: "relative/path", version: "2.0.0" });
    expect(await locateInstall(installed)).toBeNull();
  });
});
