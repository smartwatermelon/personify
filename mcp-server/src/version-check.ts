import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { VersionCheckResult } from "./types.js";

const DEFAULT_INSTALLED_PLUGINS_PATH = join(
  homedir(),
  ".claude/plugins/installed_plugins.json",
);

// personify is installed from a custom github-sourced marketplace, not the
// curated claude-plugins-official marketplace. Confirmed by direct inspection
// of ~/.claude/plugins/plugin-catalog-cache.json on 2026-08-10: that cache's
// `catalog.plugins` map (255 entries) contains no "personify" key or mention
// anywhere in the file — it only tracks claude-plugins-official's listing.
// The authoritative source for a custom marketplace's latest version is the
// `version` field of the locally-cloned marketplace's own plugin manifest at
// ~/.claude/plugins/marketplaces/<marketplace>/.claude-plugin/plugin.json,
// which Claude Code refreshes when the marketplace is updated (autoUpdate,
// per ~/.claude/plugins/known_marketplaces.json).
const DEFAULT_CATALOG_CACHE_PATH = join(
  homedir(),
  ".claude/plugins/marketplaces/personify/.claude-plugin/plugin.json",
);

export async function checkPersonifyVersion(
  opts: { installedPluginsPath?: string; catalogCachePath?: string } = {},
): Promise<VersionCheckResult> {
  const installedPath =
    opts.installedPluginsPath ?? DEFAULT_INSTALLED_PLUGINS_PATH;
  const catalogPath = opts.catalogCachePath ?? DEFAULT_CATALOG_CACHE_PATH;

  try {
    const [installedRaw, catalogRaw] = await Promise.all([
      readFile(installedPath, "utf8"),
      readFile(catalogPath, "utf8"),
    ]);
    const installed = JSON.parse(installedRaw);
    const catalog = JSON.parse(catalogRaw);

    const installedEntry = installed?.plugins?.["personify@personify"]?.[0];
    const installedVersion: string | undefined = installedEntry?.version;

    // catalog here is the marketplace's own plugin.json manifest, whose
    // top-level `version` field is the latest published version.
    const latestVersion: string | undefined = catalog?.version;

    if (!installedVersion || !latestVersion) {
      return { stale: false };
    }
    if (installedVersion === latestVersion) {
      return { stale: false };
    }
    return { stale: true, installed: installedVersion, latest: latestVersion };
  } catch {
    // Fail open: a version-check problem must never block personify's
    // actual output, only skip the side-band note.
    return { stale: false };
  }
}

export function formatStalenessNote(result: VersionCheckResult): string | null {
  if (!result.stale) return null;
  return (
    `\n\n[personify: your Claude Code plugin is on v${result.installed}, ` +
    `v${result.latest} is available. Run /plugin update to refresh it.]`
  );
}
