import { describe, it, expect, vi, beforeEach } from "vitest";

const readFileMock = vi.fn();
vi.mock("node:fs/promises", () => ({
  readFile: (...args: unknown[]) => readFileMock(...args),
}));

const { checkPersonifyVersion, formatStalenessNote } =
  await import("../src/version-check.js");

const installedFixture = JSON.stringify({
  version: 2,
  plugins: {
    "personify@personify": [
      {
        scope: "user",
        installPath: "/fake/cache/personify/personify/0.2.1",
        version: "0.2.1",
        installedAt: "2026-07-31T17:03:24.042Z",
        lastUpdated: "2026-08-08T06:16:27.907Z",
        gitCommitSha: "abc123",
      },
    ],
  },
});

// Real shape confirmed on-disk at ~/.claude/plugins/marketplaces/personify/.claude-plugin/plugin.json.
// personify is a custom github-sourced marketplace, so it does not appear in
// ~/.claude/plugins/plugin-catalog-cache.json at all (that cache only covers the
// curated claude-plugins-official marketplace's `catalog.plugins` map). The
// authoritative "latest version" for a custom marketplace is the `version` field
// of the locally-cloned marketplace's own plugin manifest, which Claude Code
// refreshes on marketplace update (autoUpdate, per known_marketplaces.json).
const marketplacePluginManifestFixture = (version: string) =>
  JSON.stringify({
    $schema: "https://json.schemastore.org/claude-code-plugin-manifest.json",
    name: "personify",
    description:
      "Strip AI-writing tells from prose before it's sent, published, or shipped, without flattening it into voiceless generic writing.",
    version,
    author: {
      name: "smartwatermelon",
      url: "https://github.com/smartwatermelon",
    },
    homepage: "https://github.com/smartwatermelon/personify",
    repository: "https://github.com/smartwatermelon/personify",
    license: "MIT",
    keywords: ["writing", "editing", "ai-detection", "prose", "style", "skill"],
    skills: ["./"],
  });

describe("checkPersonifyVersion", () => {
  beforeEach(() => {
    readFileMock.mockReset();
  });

  it("returns stale:false when installed version matches latest", async () => {
    readFileMock
      .mockResolvedValueOnce(installedFixture)
      .mockResolvedValueOnce(marketplacePluginManifestFixture("0.2.1"));

    const result = await checkPersonifyVersion({
      installedPluginsPath: "/fake/installed_plugins.json",
      catalogCachePath:
        "/fake/marketplaces/personify/.claude-plugin/plugin.json",
    });

    expect(result).toEqual({ stale: false });
  });

  it("returns stale:true with both versions when installed is behind latest", async () => {
    readFileMock
      .mockResolvedValueOnce(installedFixture)
      .mockResolvedValueOnce(marketplacePluginManifestFixture("0.3.0"));

    const result = await checkPersonifyVersion({
      installedPluginsPath: "/fake/installed_plugins.json",
      catalogCachePath:
        "/fake/marketplaces/personify/.claude-plugin/plugin.json",
    });

    expect(result).toEqual({
      stale: true,
      installed: "0.2.1",
      latest: "0.3.0",
    });
  });

  it("returns stale:false (fails open) when either file is missing or unparseable", async () => {
    readFileMock.mockRejectedValueOnce(new Error("ENOENT"));

    const result = await checkPersonifyVersion({
      installedPluginsPath: "/fake/installed_plugins.json",
      catalogCachePath:
        "/fake/marketplaces/personify/.claude-plugin/plugin.json",
    });

    expect(result).toEqual({ stale: false });
  });
});

describe("formatStalenessNote", () => {
  it("returns null when not stale", () => {
    expect(formatStalenessNote({ stale: false })).toBeNull();
  });

  it("formats an installed-vs-latest note when stale", () => {
    const note = formatStalenessNote({
      stale: true,
      installed: "0.2.1",
      latest: "0.3.0",
    });
    expect(note).toContain("0.2.1");
    expect(note).toContain("0.3.0");
    expect(note).toContain("/plugin update");
  });
});
