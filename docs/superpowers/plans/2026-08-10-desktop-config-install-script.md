# Desktop Config Install Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "hand-edit `claude_desktop_config.json`" step in `mcp-server/README.md`'s "Configure in Claude Desktop" section with a Node script that merges (or updates) the `personify` entry into that file automatically, without disturbing any other `mcpServers` entries or top-level config keys.

**Architecture:** A single Node script, `mcp-server/scripts/install-desktop-config.mjs`, run via `npm run install-desktop-config` from `mcp-server/`. It resolves the absolute path to `dist/index.js` from its own location (so it works regardless of where the repo is cloned), locates `claude_desktop_config.json` at the macOS-standard path, reads it if present (or starts from `{}` if absent), deep-merges just `mcpServers.personify` into the existing object graph (creating `mcpServers` if missing) while leaving every other key and every other server entry byte-for-byte untouched, and writes the result back with the same 2-space JSON formatting the file already uses. A pure `mergeConfig` function holds the merge logic so it can be unit-tested with vitest without touching the real filesystem; a thin CLI wrapper handles path resolution, file I/O, and console output.

**Tech Stack:** Node.js (`node:fs/promises`, `node:path`, `node:os`, `node:url`), vitest (matches the rest of `mcp-server/`), no new dependencies.

## Global Constraints

- No new npm dependencies — use only Node built-ins, matching the rest of `mcp-server/` (see `mcp-server/package.json`: only `@modelcontextprotocol/sdk` as a runtime dep).
- No em dashes or en dashes in any new prose (README updates, code comments, commit messages) — this repo's hard rule (`CLAUDE.md`: "Per the skill's own hard rule... no em dashes or en dashes should appear in rewritten output... this applies to edits to `SKILL.md` itself too, for consistency" — the MCP bridge's own final review caught 3 violations of this in its own prose, so this needs explicit verification, not assumption).
- Must be idempotent: running the script twice in a row must produce the same file content the second time (no duplicate keys, no reordering churn beyond what a stable JSON merge naturally does).
- Must never overwrite or drop any `mcpServers` entry other than `personify`, and must never touch any top-level key other than `mcpServers` (the real config on this machine has `coworkUserFilesPath` and a large `preferences` object alongside `mcpServers` — the merge must leave these untouched).
- Must never print the contents of other `mcpServers` entries or other top-level keys to the console: some entries carry live credentials (e.g. an `env` block with API keys/passwords), and the script's own output must not leak them into terminal scrollback or logs. Only report success/failure for the `personify` entry itself (e.g. its resolved absolute path), never dump the full file.
- macOS only for this issue (per the issue's explicit "Out of scope": "Any Windows/Linux Desktop config path support unless someone actually needs it"). The script should fail with a clear error message on other platforms rather than silently writing to a wrong/nonexistent path.
- Out of scope (per the issue): automating the OAuth token setup step (`claude setup-token` / `~/.config/personify/token`) — that stays a separate manual step in the README's existing "Authenticate" section. Do not touch that section.
- Follow the existing `mcp-server/` conventions: `opts` parameter with an overridable path (for testability), matching the pattern already used in `version-check.ts` and `token.ts` (e.g. `checkPersonifyVersion(opts: { installedPluginsPath?: string; ... } = {})`).
- Bump nothing in `SKILL.md` or `.claude-plugin/plugin.json` for this change: this is `mcp-server/`-only work, versioned independently per this repo's `CLAUDE.md` ("mcp-server/... is versioned independently of SKILL.md/plugin.json: the lockstep version-bump rule below applies only to the skill content, not to this bridge").

---

### Task 1: `mergeConfig` pure function with tests

**Files:**

- Create: `mcp-server/src/desktop-config.ts`
- Test: `mcp-server/test/desktop-config.test.ts`

**Interfaces:**

- Produces: `mergeConfig(existing: unknown, serverEntryPath: string): Record<string, unknown>` in `desktop-config.ts`. Takes the parsed existing config (or `undefined`/`{}` if the file didn't exist or was empty) and the absolute path to `dist/index.js`, returns a new config object with `mcpServers.personify` set to `{ command: "node", args: [serverEntryPath] }`, every other key of `existing` (top-level and within `mcpServers`) preserved unchanged. Does not touch the filesystem. Throws `Error("claude_desktop_config.json does not contain a valid JSON object at its top level")` if `existing` is a non-null value that is not a plain object (e.g. an array or a string), so a malformed config fails loudly instead of being silently discarded.
- Produces: `DEFAULT_DESKTOP_CONFIG_PATH: string` constant in `desktop-config.ts`, resolving to `~/Library/Application Support/Claude/claude_desktop_config.json` via `join(homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json")`.

- [ ] **Step 1: Write the failing tests**

```typescript
// mcp-server/test/desktop-config.test.ts
import { describe, it, expect } from "vitest";
import { mergeConfig } from "../src/desktop-config.js";

describe("mergeConfig", () => {
  it("creates mcpServers.personify when the config is empty", () => {
    const result = mergeConfig({}, "/abs/path/to/dist/index.js");

    expect(result).toEqual({
      mcpServers: {
        personify: {
          command: "node",
          args: ["/abs/path/to/dist/index.js"],
        },
      },
    });
  });

  it("creates mcpServers.personify when the config file did not exist (undefined input)", () => {
    const result = mergeConfig(undefined, "/abs/path/to/dist/index.js");

    expect(result).toEqual({
      mcpServers: {
        personify: {
          command: "node",
          args: ["/abs/path/to/dist/index.js"],
        },
      },
    });
  });

  it("adds mcpServers.personify without disturbing an existing sibling server", () => {
    const existing = {
      mcpServers: {
        instapaper: {
          command: "node",
          args: ["/some/other/path/build/index.js"],
          env: { INSTAPAPER_CONSUMER_KEY: "secret-key-value" },
        },
      },
    };

    const result = mergeConfig(existing, "/abs/path/to/dist/index.js");

    expect(result).toEqual({
      mcpServers: {
        instapaper: {
          command: "node",
          args: ["/some/other/path/build/index.js"],
          env: { INSTAPAPER_CONSUMER_KEY: "secret-key-value" },
        },
        personify: {
          command: "node",
          args: ["/abs/path/to/dist/index.js"],
        },
      },
    });
  });

  it("updates an existing personify entry in place (idempotent path change)", () => {
    const existing = {
      mcpServers: {
        personify: {
          command: "node",
          args: ["/old/stale/path/dist/index.js"],
        },
      },
    };

    const result = mergeConfig(existing, "/new/path/dist/index.js");

    expect(result).toEqual({
      mcpServers: {
        personify: {
          command: "node",
          args: ["/new/path/dist/index.js"],
        },
      },
    });
  });

  it("preserves top-level keys outside mcpServers", () => {
    const existing = {
      mcpServers: {},
      coworkUserFilesPath: "/Users/someone/Claude",
      preferences: { menuBarEnabled: false, nested: { a: 1, b: [1, 2, 3] } },
    };

    const result = mergeConfig(existing, "/abs/path/to/dist/index.js");

    expect(result).toEqual({
      mcpServers: {
        personify: {
          command: "node",
          args: ["/abs/path/to/dist/index.js"],
        },
      },
      coworkUserFilesPath: "/Users/someone/Claude",
      preferences: { menuBarEnabled: false, nested: { a: 1, b: [1, 2, 3] } },
    });
  });

  it("running the merge twice with the same path produces an identical result (idempotency)", () => {
    const existing = {
      mcpServers: { instapaper: { command: "node", args: ["/x/index.js"] } },
    };

    const first = mergeConfig(existing, "/abs/path/to/dist/index.js");
    const second = mergeConfig(first, "/abs/path/to/dist/index.js");

    expect(second).toEqual(first);
  });

  it("throws a clear error when the existing config's top level is not an object", () => {
    expect(() => mergeConfig([1, 2, 3], "/abs/path/to/dist/index.js")).toThrow(
      "claude_desktop_config.json does not contain a valid JSON object at its top level",
    );
    expect(() => mergeConfig("not an object", "/abs/path/to/dist/index.js")).toThrow(
      "claude_desktop_config.json does not contain a valid JSON object at its top level",
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/andrewrich/Developer/personify/mcp-server && npx vitest run test/desktop-config.test.ts
```

Expected: FAIL, `../src/desktop-config.js` does not exist.

- [ ] **Step 3: Implement `desktop-config.ts`**

```typescript
// mcp-server/src/desktop-config.ts
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_DESKTOP_CONFIG_PATH = join(
  homedir(),
  "Library",
  "Application Support",
  "Claude",
  "claude_desktop_config.json",
);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mergeConfig(
  existing: unknown,
  serverEntryPath: string,
): Record<string, unknown> {
  if (existing !== undefined && !isPlainObject(existing)) {
    throw new Error(
      "claude_desktop_config.json does not contain a valid JSON object at its top level",
    );
  }

  const base: Record<string, unknown> = existing ? { ...existing } : {};
  const existingServers = isPlainObject(base.mcpServers) ? base.mcpServers : {};

  return {
    ...base,
    mcpServers: {
      ...existingServers,
      personify: {
        command: "node",
        args: [serverEntryPath],
      },
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/andrewrich/Developer/personify/mcp-server && npx vitest run test/desktop-config.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 5: Run `tsc --noEmit`**

```bash
cd /Users/andrewrich/Developer/personify/mcp-server && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git -C /Users/andrewrich/Developer/personify add mcp-server/src/desktop-config.ts mcp-server/test/desktop-config.test.ts
git -C /Users/andrewrich/Developer/personify commit -m "feat(mcp-server): add pure mergeConfig function for Desktop config"
```

---

### Task 2: CLI wrapper script and `npm run` wiring

**Files:**

- Create: `mcp-server/scripts/install-desktop-config.mjs`
- Modify: `mcp-server/package.json`
- Modify: `mcp-server/README.md`

**Interfaces:**

- Consumes: `mergeConfig` and `DEFAULT_DESKTOP_CONFIG_PATH` from `../src/desktop-config.js` (Task 1). Note: `tsconfig.json`'s `outDir` flattens `src/` into `dist/` directly (confirmed by building: `src/index.ts` produces `dist/index.js`, not `dist/src/index.js`), so `desktop-config.ts` compiles to `dist/desktop-config.js`, not `dist/src/desktop-config.js`. The script imports the compiled output at `../dist/desktop-config.js`, not the `.ts` source, since it runs standalone via `node` and is not itself compiled by `tsc`.
- No new exports consumed by later tasks; this is the terminal integration point for this plan.

- [ ] **Step 1: Write the script**

```javascript
// mcp-server/scripts/install-desktop-config.mjs
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  mergeConfig,
  DEFAULT_DESKTOP_CONFIG_PATH,
} from "../dist/desktop-config.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const serverEntryPath = join(scriptDir, "..", "dist", "index.js");

async function main() {
  if (process.platform !== "darwin") {
    console.error(
      "install-desktop-config only supports macOS today. " +
        "See mcp-server/README.md's \"Configure in Claude Desktop\" section " +
        "for manual instructions on other platforms.",
    );
    process.exitCode = 1;
    return;
  }

  let existing;
  try {
    const raw = await readFile(DEFAULT_DESKTOP_CONFIG_PATH, "utf8");
    existing = raw.trim().length === 0 ? undefined : JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") {
      existing = undefined;
    } else if (err instanceof SyntaxError) {
      console.error(
        `${DEFAULT_DESKTOP_CONFIG_PATH} exists but is not valid JSON. ` +
          "Fix or remove it, then run this script again. Refusing to overwrite " +
          "a file that might contain other configuration.",
      );
      process.exitCode = 1;
      return;
    } else {
      throw err;
    }
  }

  let merged;
  try {
    merged = mergeConfig(existing, serverEntryPath);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }

  await mkdir(dirname(DEFAULT_DESKTOP_CONFIG_PATH), { recursive: true });
  await writeFile(
    DEFAULT_DESKTOP_CONFIG_PATH,
    JSON.stringify(merged, null, 2) + "\n",
    "utf8",
  );

  console.log(
    `Configured personify in ${DEFAULT_DESKTOP_CONFIG_PATH} (command: node ${serverEntryPath}). ` +
      "Restart Claude Desktop for the change to take effect.",
  );
}

main().catch((err) => {
  console.error("install-desktop-config failed:", err.message);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Add the `npm run` script**

Modify `mcp-server/package.json`'s `scripts` block, adding `install-desktop-config` after `build`:

```json
  "scripts": {
    "build": "tsc",
    "install-desktop-config": "npm run build && node scripts/install-desktop-config.mjs",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

- [ ] **Step 3: Manually verify against the real config file**

This step is exploratory verification, not something to script blindly against a file that may contain live credentials (see Global Constraints). Before running against the real file, back it up:

```bash
cp "$HOME/Library/Application Support/Claude/claude_desktop_config.json" /tmp/claude_desktop_config.json.bak
```

Then run the script for real:

```bash
cd /Users/andrewrich/Developer/personify/mcp-server && npm run install-desktop-config
```

Expected: prints a success line with the resolved path to `dist/index.js` under this repo, and exits 0. Then diff against the backup to confirm only the `personify` entry changed:

```bash
diff /tmp/claude_desktop_config.json.bak "$HOME/Library/Application Support/Claude/claude_desktop_config.json"
```

Expected: the diff shows only the `personify.args` line changing (or no diff at all, if the path was already correct), nothing else. If anything else differs, stop and investigate before proceeding; restore from the backup if needed (`cp /tmp/claude_desktop_config.json.bak "$HOME/Library/Application Support/Claude/claude_desktop_config.json"`).

Run it a second time to confirm idempotency:

```bash
cd /Users/andrewrich/Developer/personify/mcp-server && npm run install-desktop-config
diff /tmp/claude_desktop_config.json.bak "$HOME/Library/Application Support/Claude/claude_desktop_config.json"
```

Expected: identical diff output to the first run (no further changes, no duplication).

- [ ] **Step 4: Replace the README's "Configure in Claude Desktop" section**

Replace this block in `mcp-server/README.md`:

```markdown
## Configure in Claude Desktop

Add to Desktop's MCP config (Settings -> Developer -> Edit Config, or the
equivalent `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "personify": {
      "command": "node",
      "args": ["/absolute/path/to/personify/mcp-server/dist/index.js"]
    }
  }
}
```

Restart Desktop after editing.

```

with:

```markdown
## Configure in Claude Desktop

From `mcp-server/`, after building:

```bash
npm run install-desktop-config
```

This merges a `personify` entry into
`~/Library/Application Support/Claude/claude_desktop_config.json` (creating
the file if it does not exist yet), using the absolute path to this repo's
`dist/index.js`. It only ever touches the `personify` key under
`mcpServers`; any other MCP servers or settings already in that file are
left exactly as they are. Running it again (for example after moving the
repo, or to pick up a rebuilt `dist/`) safely updates the entry in place
rather than duplicating it.

Restart Desktop after running it.

macOS only for now. On other platforms, add the following to
`claude_desktop_config.json` by hand instead (path varies by OS; see
[Anthropic's MCP docs](https://modelcontextprotocol.io) for where Desktop
looks for it there):

```json
{
  "mcpServers": {
    "personify": {
      "command": "node",
      "args": ["/absolute/path/to/personify/mcp-server/dist/index.js"]
    }
  }
}
```

```

- [ ] **Step 5: Verify em/en dash cleanliness in all new/changed prose**

```bash
grep -n $'—\|–' /Users/andrewrich/Developer/personify/mcp-server/README.md /Users/andrewrich/Developer/personify/mcp-server/scripts/install-desktop-config.mjs /Users/andrewrich/Developer/personify/mcp-server/src/desktop-config.ts
```

Expected: no matches.

- [ ] **Step 6: Run the full test suite and `tsc --noEmit` one more time**

```bash
cd /Users/andrewrich/Developer/personify/mcp-server && npx vitest run && npx tsc --noEmit
```

Expected: all tests pass, `tsc` clean.

- [ ] **Step 7: Commit**

```bash
git -C /Users/andrewrich/Developer/personify add mcp-server/scripts/install-desktop-config.mjs mcp-server/package.json mcp-server/README.md
git -C /Users/andrewrich/Developer/personify commit -m "feat(mcp-server): add npm run install-desktop-config to automate Desktop config setup

Replaces the hand-edit-JSON step in the README with a script that merges
the personify entry into claude_desktop_config.json, preserving every
other MCP server and setting already in that file. Closes #24."
```

## Post-plan: PR and CI

This repo's `CLAUDE.md` (global, `~/.claude/CLAUDE.md`) requires: work on a branch (never main), local review before push, PR creation and merge as separate authorized steps, and CI monitoring after push. None of that is scripted into this plan's tasks. It happens at the session level (branch already created before Task 1, PR opened after Task 2, per the standing protocol) rather than as a plan step, since it is not specific to this feature.
