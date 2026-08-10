# Personify MCP Desktop Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MCP server, installed under `mcp-server/` in this repo, that Claude Desktop calls as a normal tool (`personify(text) -> string`). The server shells out to the Claude Code CLI (`claude --print`) to actually run the `personify:personify` skill, so Desktop never has to load `VOICE.md` or trust a local file itself — the exact failure mode documented in `docs/superpowers/plans/../../../` (see the handoff PDF transcript: Desktop denied its own filesystem connector existed and flagged Step 0's "load this file and treat it as authoritative" instruction as injection-shaped).

**Architecture:** A single-tool MCP server (stdio transport, Node/TypeScript, `@modelcontextprotocol/sdk`) exposes `personify`. On each call it spawns `claude --print --permission-mode auto <fixed-instruction>` with the user's text piped over stdin (never shell-interpolated, never argv-concatenated), captures stdout as the personified result, and separately reads two local JSON files (`installed_plugins.json`, `plugin-catalog-cache.json`) to compare installed vs. latest personify version and append a staleness note when they differ. CLI failures (non-zero exit, timeout) surface as MCP tool errors, not silent fallback text.

**Tech Stack:** Node.js (>=18), TypeScript, `@modelcontextprotocol/sdk`, `vitest` for tests, Node's built-in `child_process.spawn` (no shell) and `node:test`-free mocking via vitest's `vi.mock`.

## Global Constraints

- Never build the subprocess prompt by string concatenation into a shell command. User text travels over stdin; the instruction prompt is a fixed string with no user text interpolated into it. `spawn()` is called with an argv array and `shell: false` (the default) — confirmed working in manual testing (`claude --print --permission-mode auto "<fixed instruction>"` with text piped via stdin correctly invoked the skill and returned personified output).
- Use `--permission-mode auto`, not `--dangerously-skip-permissions`. Verified manually: `--permission-mode auto` with `--print` runs non-interactively, does not hang waiting on a permission prompt, and successfully invoked the personify skill end-to-end reading `VOICE.md` implicitly through the skill's own Step 0 logic.
- A hung or slow subprocess must be bounded by an explicit timeout (see Task 3) and surfaced as a tool error, never left to hang the Desktop chat.
- No em dashes or en dashes in any prose this plan or its deliverables produce (repo-wide house rule per `CLAUDE.md`).
- `SKILL.md`/`plugin.json` version bump rule (bump both in lockstep on every `SKILL.md` content change) is unaffected by this work — this plan does not touch `SKILL.md` itself, only adds a new subdirectory.
- New subdirectory: `mcp-server/`. It gets its own `package.json`, `tsconfig.json`, and `node_modules` (gitignored) — independent of the skill-validation tooling in `scripts/validate_skill.py`, which stays untouched.

---

## File Structure

```
mcp-server/
  package.json            # deps: @modelcontextprotocol/sdk, dev: typescript, vitest, @types/node
  tsconfig.json
  .gitignore               # node_modules/, dist/
  src/
    index.ts               # MCP server bootstrap: registers the `personify` tool, starts stdio transport
    cli-runner.ts           # spawns `claude --print`, pipes stdin, captures stdout/stderr, enforces timeout
    version-check.ts        # reads installed_plugins.json + plugin-catalog-cache.json, compares versions
    types.ts                # shared types: CliResult, VersionCheckResult
  test/
    cli-runner.test.ts      # unit tests, subprocess mocked
    version-check.test.ts   # unit tests, filesystem reads mocked
    index.test.ts            # unit test: tool handler wiring, success/error mapping
  README.md                 # install/config instructions for Desktop, manual verification checklist
```

Responsibility split:

- `cli-runner.ts` owns everything about invoking `claude --print` safely (argv construction, stdin, timeout, exit-code/stderr interpretation). It knows nothing about MCP.
- `version-check.ts` owns everything about reading local plugin metadata and producing a staleness note. It knows nothing about MCP or the CLI runner.
- `index.ts` is the thin MCP glue: wires the `personify` tool's handler to call `cli-runner` then `version-check`, and maps results/errors to the MCP tool-response shape.

---

### Task 1: Scaffold the `mcp-server/` package

**Files:**

- Create: `mcp-server/package.json`
- Create: `mcp-server/tsconfig.json`
- Create: `mcp-server/.gitignore`
- Create: `mcp-server/src/types.ts`

**Interfaces:**

- Produces: `CliResult` type (`{ ok: true, text: string } | { ok: false, error: string }`), `VersionCheckResult` type (`{ stale: false } | { stale: true, installed: string, latest: string }`) — both consumed by `cli-runner.ts`, `version-check.ts`, and `index.ts` in later tasks.

- [ ] **Step 1: Create the package directory and `package.json`**

```bash
mkdir -p /Users/andrewrich/Developer/personify/mcp-server/src /Users/andrewrich/Developer/personify/mcp-server/test
```

Write `mcp-server/package.json`:

```json
{
  "name": "@smartwatermelon/personify-mcp",
  "version": "0.1.0",
  "description": "MCP bridge that lets Claude Desktop run the personify skill via the Claude Code CLI",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.4"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  },
  "engines": {
    "node": ">=18"
  }
}
```

- [ ] **Step 2: Write `mcp-server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Write `mcp-server/.gitignore`**

```
node_modules/
dist/
*.log
```

- [ ] **Step 4: Write `mcp-server/src/types.ts`**

```typescript
export type CliResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

export type VersionCheckResult =
  | { stale: false }
  | { stale: true; installed: string; latest: string };
```

- [ ] **Step 5: Install dependencies**

```bash
cd /Users/andrewrich/Developer/personify/mcp-server && npm install
```

Expected: `node_modules/` created, `package-lock.json` written, no errors.

- [ ] **Step 6: Verify TypeScript compiles the empty scaffold**

```bash
cd /Users/andrewrich/Developer/personify/mcp-server && npx tsc --noEmit
```

Expected: no errors (only `types.ts` exists so far, and it's valid TS).

- [ ] **Step 7: Commit**

```bash
git -C /Users/andrewrich/Developer/personify add mcp-server/package.json mcp-server/package-lock.json mcp-server/tsconfig.json mcp-server/.gitignore mcp-server/src/types.ts
git -C /Users/andrewrich/Developer/personify commit -m "scaffold mcp-server package for Desktop bridge"
```

---

### Task 2: `cli-runner.ts` — safe subprocess invocation

**Files:**

- Create: `mcp-server/src/cli-runner.ts`
- Test: `mcp-server/test/cli-runner.test.ts`

**Interfaces:**

- Consumes: `CliResult` from `types.ts` (Task 1).
- Produces: `runPersonify(text: string, opts?: { timeoutMs?: number }): Promise<CliResult>` — consumed by `index.ts` in Task 4.
- Produces: exported constant `PERSONIFY_INSTRUCTION` (the fixed prompt string sent to `claude --print`) and `DEFAULT_TIMEOUT_MS` (30_000) — consumed by `index.ts` for documentation/logging purposes only, not required to be re-exported further.

The fixed instruction string, confirmed by manual testing to correctly invoke the skill via stdin:

```
Run the personify:personify skill on the text provided via stdin and return only the resulting text, no commentary, no preamble, no markdown code fence around it.
```

- [ ] **Step 1: Write the failing tests**

```typescript
// mcp-server/test/cli-runner.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";

const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

const { runPersonify } = await import("../src/cli-runner.js");

function makeFakeChild() {
  const child = new EventEmitter() as ChildProcess & {
    stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdin = { write: vi.fn(), end: vi.fn() };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

describe("runPersonify", () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it("spawns claude with a fixed argv, shell disabled, and writes text to stdin (no interpolation)", async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const resultPromise = runPersonify("some — text with an em dash");

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [cmd, args, spawnOpts] = spawnMock.mock.calls[0];
    expect(cmd).toBe("claude");
    expect(args).toEqual([
      "--print",
      "--permission-mode",
      "auto",
      expect.stringContaining("personify:personify"),
    ]);
    // The user text must never appear inside argv — only on stdin.
    for (const arg of args as string[]) {
      expect(arg).not.toContain("some — text with an em dash");
    }
    expect(spawnOpts).toMatchObject({ shell: false });
    expect(child.stdin.write).toHaveBeenCalledWith(
      "some — text with an em dash"
    );
    expect(child.stdin.end).toHaveBeenCalled();

    child.stdout.emit("data", Buffer.from("some, text with an em dash"));
    child.emit("close", 0);

    const result = await resultPromise;
    expect(result).toEqual({ ok: true, text: "some, text with an em dash" });
  });

  it("maps non-zero exit code to a CliResult error including stderr", async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const resultPromise = runPersonify("text");
    child.stderr.emit("data", Buffer.from("skill not found"));
    child.emit("close", 1);

    const result = await resultPromise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("skill not found");
      expect(result.error).toContain("exit code 1");
    }
  });

  it("times out a hung subprocess and kills it", async () => {
    vi.useFakeTimers();
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const resultPromise = runPersonify("text", { timeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);

    const result = await resultPromise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("timed out");
    }
    expect(child.kill).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("rejects empty input before spawning a subprocess", async () => {
    const result = await runPersonify("   ");
    expect(result).toEqual({ ok: false, error: "no text provided" });
    expect(spawnMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/andrewrich/Developer/personify/mcp-server && npx vitest run test/cli-runner.test.ts
```

Expected: FAIL — `../src/cli-runner.js` does not exist.

- [ ] **Step 3: Implement `cli-runner.ts`**

```typescript
// mcp-server/src/cli-runner.ts
import { spawn } from "node:child_process";
import type { CliResult } from "./types.js";

export const PERSONIFY_INSTRUCTION =
  "Run the personify:personify skill on the text provided via stdin and " +
  "return only the resulting text, no commentary, no preamble, no markdown " +
  "code fence around it.";

export const DEFAULT_TIMEOUT_MS = 30_000;

export function runPersonify(
  text: string,
  opts: { timeoutMs?: number } = {}
): Promise<CliResult> {
  if (text.trim().length === 0) {
    return Promise.resolve({ ok: false, error: "no text provided" });
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolve) => {
    const child = spawn(
      "claude",
      ["--print", "--permission-mode", "auto", PERSONIFY_INSTRUCTION],
      { shell: false, stdio: ["pipe", "pipe", "pipe"] }
    );

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      resolve({
        ok: false,
        error: `personify CLI call timed out after ${timeoutMs}ms`,
      });
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, error: `failed to spawn claude CLI: ${err.message}` });
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ ok: true, text: stdout.trim() });
      } else {
        resolve({
          ok: false,
          error: `personify CLI exited with exit code ${code}: ${stderr.trim() || stdout.trim()}`,
        });
      }
    });

    child.stdin?.write(text);
    child.stdin?.end();
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/andrewrich/Developer/personify/mcp-server && npx vitest run test/cli-runner.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git -C /Users/andrewrich/Developer/personify add mcp-server/src/cli-runner.ts mcp-server/test/cli-runner.test.ts
git -C /Users/andrewrich/Developer/personify commit -m "add cli-runner: safe, timeout-bounded claude --print invocation"
```

---

### Task 3: `version-check.ts` — staleness note

**Files:**

- Create: `mcp-server/src/version-check.ts`
- Test: `mcp-server/test/version-check.test.ts`

**Interfaces:**

- Consumes: `VersionCheckResult` from `types.ts` (Task 1).
- Produces: `checkPersonifyVersion(opts?: { installedPluginsPath?: string; catalogCachePath?: string }): Promise<VersionCheckResult>` and `formatStalenessNote(result: VersionCheckResult): string | null` — both consumed by `index.ts` in Task 4.

This reads two real files confirmed present during manual investigation:

- `~/.claude/plugins/installed_plugins.json` — keyed by `<plugin>@<marketplace>`, e.g. `personify@personify`, each entry an array of `{ scope, installPath, version, installedAt, lastUpdated, gitCommitSha }`.
- `~/.claude/plugins/plugin-catalog-cache.json` — shape `{ version, fetchedAt, catalog }`; the `catalog` field's exact structure for locating the personify marketplace entry's latest version must be inspected against the real file at implementation time (its top-level shape was confirmed but its nested plugin-listing structure was not fully enumerated during scoping — implementer must `python3 -c "import json; print(json.dumps(json.load(open(...)), indent=2))"` on the real file, find the `personify` entry under `catalog`, and match the test fixtures below to its actual shape before writing the parsing logic).

- [ ] **Step 1: Inspect the real catalog cache shape**

```bash
python3 -c "
import json
d = json.load(open('/Users/andrewrich/.claude/plugins/plugin-catalog-cache.json'))
catalog = d['catalog']
print(type(catalog))
if isinstance(catalog, list):
    for entry in catalog:
        if 'personify' in json.dumps(entry).lower():
            print(json.dumps(entry, indent=2)[:1500])
elif isinstance(catalog, dict):
    for k, v in catalog.items():
        if 'personify' in k.lower() or 'personify' in json.dumps(v).lower():
            print(k, json.dumps(v, indent=2)[:1500])
"
```

Record the exact path to the version string (e.g. `catalog.personify.plugins[0].version` or similar — fill in the real path found here before writing Step 3's implementation). This step has no pass/fail assertion; it's a research step whose output determines the parsing code below. If the shape found differs from the placeholder access pattern in Step 3's code, adjust Step 3 to match the real shape — do not guess.

- [ ] **Step 2: Write the failing tests**

```typescript
// mcp-server/test/version-check.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const readFileMock = vi.fn();
vi.mock("node:fs/promises", () => ({
  readFile: (...args: unknown[]) => readFileMock(...args),
}));

const { checkPersonifyVersion, formatStalenessNote } = await import(
  "../src/version-check.js"
);

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

describe("checkPersonifyVersion", () => {
  beforeEach(() => {
    readFileMock.mockReset();
  });

  it("returns stale:false when installed version matches latest", async () => {
    readFileMock
      .mockResolvedValueOnce(installedFixture)
      .mockResolvedValueOnce(
        JSON.stringify({ catalogVersionOf: "personify", latest: "0.2.1" })
      );

    const result = await checkPersonifyVersion({
      installedPluginsPath: "/fake/installed_plugins.json",
      catalogCachePath: "/fake/plugin-catalog-cache.json",
    });

    expect(result).toEqual({ stale: false });
  });

  it("returns stale:true with both versions when installed is behind latest", async () => {
    readFileMock
      .mockResolvedValueOnce(installedFixture)
      .mockResolvedValueOnce(
        JSON.stringify({ catalogVersionOf: "personify", latest: "0.3.0" })
      );

    const result = await checkPersonifyVersion({
      installedPluginsPath: "/fake/installed_plugins.json",
      catalogCachePath: "/fake/plugin-catalog-cache.json",
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
      catalogCachePath: "/fake/plugin-catalog-cache.json",
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
```

Note: the second `readFileMock` fixture (`{ catalogVersionOf: "personify", latest: "0.3.0" }`) is a **placeholder shape** for the test — replace it with the real `plugin-catalog-cache.json` structure found in Step 1 before finalizing this test, and adjust `version-check.ts`'s parsing logic (Step 3) to match. Do not ship parsing logic against a guessed shape.

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /Users/andrewrich/Developer/personify/mcp-server && npx vitest run test/version-check.test.ts
```

Expected: FAIL — `../src/version-check.js` does not exist.

- [ ] **Step 4: Implement `version-check.ts`**

Use the real shape discovered in Step 1 to extract the personify entry's latest version from the catalog cache. Skeleton (fill in the catalog-parsing line marked below once Step 1's real shape is known):

```typescript
// mcp-server/src/version-check.ts
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { VersionCheckResult } from "./types.js";

const DEFAULT_INSTALLED_PLUGINS_PATH = join(
  homedir(),
  ".claude/plugins/installed_plugins.json"
);
const DEFAULT_CATALOG_CACHE_PATH = join(
  homedir(),
  ".claude/plugins/plugin-catalog-cache.json"
);

export async function checkPersonifyVersion(
  opts: { installedPluginsPath?: string; catalogCachePath?: string } = {}
): Promise<VersionCheckResult> {
  const installedPath = opts.installedPluginsPath ?? DEFAULT_INSTALLED_PLUGINS_PATH;
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

    // FILL IN once Task 3 Step 1's real catalog shape is confirmed:
    // extract the personify marketplace's latest version from `catalog`.
    const latestVersion: string | undefined = catalog?.latest;

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
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/andrewrich/Developer/personify/mcp-server && npx vitest run test/version-check.test.ts
```

Expected: PASS (5 tests). If the real catalog shape from Step 1 differs from the `catalog?.latest` placeholder, update both the test fixture and the implementation together, then re-run until green.

- [ ] **Step 6: Commit**

```bash
git -C /Users/andrewrich/Developer/personify add mcp-server/src/version-check.ts mcp-server/test/version-check.test.ts
git -C /Users/andrewrich/Developer/personify commit -m "add version-check: staleness note for outdated personify plugin"
```

---

### Task 4: `index.ts` — MCP server wiring

**Files:**

- Create: `mcp-server/src/index.ts`
- Test: `mcp-server/test/index.test.ts`

**Interfaces:**

- Consumes: `runPersonify` from `cli-runner.ts` (Task 2), `checkPersonifyVersion` + `formatStalenessNote` from `version-check.ts` (Task 3).
- Produces: the runnable server entry point (no further consumers within this plan; this is the top of the dependency graph).

- [ ] **Step 1: Write the failing test for the tool handler logic**

Test the handler function directly (extracted for testability) rather than spinning up a full stdio transport in tests.

```typescript
// mcp-server/test/index.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const runPersonifyMock = vi.fn();
const checkPersonifyVersionMock = vi.fn();

vi.mock("../src/cli-runner.js", () => ({
  runPersonify: (...args: unknown[]) => runPersonifyMock(...args),
}));
vi.mock("../src/version-check.js", () => ({
  checkPersonifyVersion: (...args: unknown[]) => checkPersonifyVersionMock(...args),
  formatStalenessNote: (result: { stale: boolean }) =>
    result.stale ? "[stale note]" : null,
}));

const { handlePersonifyCall } = await import("../src/index.js");

describe("handlePersonifyCall", () => {
  beforeEach(() => {
    runPersonifyMock.mockReset();
    checkPersonifyVersionMock.mockReset();
  });

  it("returns personified text with no note when up to date", async () => {
    runPersonifyMock.mockResolvedValue({ ok: true, text: "clean text" });
    checkPersonifyVersionMock.mockResolvedValue({ stale: false });

    const result = await handlePersonifyCall("raw text");

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toBe("clean text");
  });

  it("appends the staleness note when the plugin is behind", async () => {
    runPersonifyMock.mockResolvedValue({ ok: true, text: "clean text" });
    checkPersonifyVersionMock.mockResolvedValue({
      stale: true,
      installed: "0.2.1",
      latest: "0.3.0",
    });

    const result = await handlePersonifyCall("raw text");

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toBe("clean text[stale note]");
  });

  it("surfaces a CLI failure as an MCP tool error, not silent fallback text", async () => {
    runPersonifyMock.mockResolvedValue({
      ok: false,
      error: "personify CLI exited with exit code 1: skill not found",
    });
    checkPersonifyVersionMock.mockResolvedValue({ stale: false });

    const result = await handlePersonifyCall("raw text");

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("skill not found");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/andrewrich/Developer/personify/mcp-server && npx vitest run test/index.test.ts
```

Expected: FAIL — `../src/index.js` does not exist.

- [ ] **Step 3: Implement `index.ts`**

```typescript
// mcp-server/src/index.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { runPersonify } from "./cli-runner.js";
import { checkPersonifyVersion, formatStalenessNote } from "./version-check.js";

interface ToolCallResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export async function handlePersonifyCall(text: string): Promise<ToolCallResult> {
  const [cliResult, versionResult] = await Promise.all([
    runPersonify(text),
    checkPersonifyVersion(),
  ]);

  if (!cliResult.ok) {
    return {
      isError: true,
      content: [{ type: "text", text: `personify failed: ${cliResult.error}` }],
    };
  }

  const note = formatStalenessNote(versionResult);
  return {
    content: [{ type: "text", text: cliResult.text + (note ?? "") }],
  };
}

export function createServer(): Server {
  const server = new Server(
    { name: "personify-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "personify",
        description:
          "Strip AI-writing tells from prose before sending, publishing, or " +
          "shipping it. Runs the personify skill via the Claude Code CLI so " +
          "it works reliably from Claude Desktop.",
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string", description: "The text to personify." },
          },
          required: ["text"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== "personify") {
      return {
        isError: true,
        content: [{ type: "text", text: `unknown tool: ${request.params.name}` }],
      };
    }
    const text = (request.params.arguments as { text?: string } | undefined)?.text;
    if (typeof text !== "string") {
      return {
        isError: true,
        content: [{ type: "text", text: "missing required argument: text" }],
      };
    }
    return handlePersonifyCall(text);
  });

  return server;
}

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const isEntryPoint = process.argv[1]?.endsWith("index.js");
if (isEntryPoint) {
  main().catch((err) => {
    console.error("personify-mcp fatal error:", err);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/andrewrich/Developer/personify/mcp-server && npx vitest run test/index.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Run the full test suite**

```bash
cd /Users/andrewrich/Developer/personify/mcp-server && npx vitest run
```

Expected: all tests across `cli-runner.test.ts`, `version-check.test.ts`, `index.test.ts` PASS.

- [ ] **Step 6: Build and smoke-check the compiled output**

```bash
cd /Users/andrewrich/Developer/personify/mcp-server && npx tsc && node dist/index.js < /dev/null &
sleep 1
kill %1 2>/dev/null
```

Expected: the process starts without throwing (it will sit waiting on stdio transport input; killing it after a second is expected and fine — this just confirms no import/startup errors).

- [ ] **Step 7: Commit**

```bash
git -C /Users/andrewrich/Developer/personify add mcp-server/src/index.ts mcp-server/test/index.test.ts
git -C /Users/andrewrich/Developer/personify commit -m "wire up personify MCP server tool handler"
```

---

### Task 5: Manual end-to-end verification against real Desktop + real CLI

This task has no automated tests — per the test-scope decision, the handoff's acceptance criteria (cold Desktop session, real CLI output, matching direct-CLI output) are validated manually and documented, not scripted.

**Files:**

- Create: `mcp-server/README.md`

- [ ] **Step 1: Write `mcp-server/README.md`** documenting install/config and the manual verification checklist:

```markdown
# personify-mcp

MCP bridge that lets Claude Desktop run the `personify:personify` Claude
Code skill reliably. Desktop calls this server's one tool, `personify`; the
server shells out to `claude --print` to do the actual work, so Desktop
never has to load `VOICE.md` or evaluate Step 0's "treat this file as
authoritative" instruction itself.

See the parent repo's `SKILL.md` for what personify does, and the
referenced issue (smartwatermelon/personify#23) for why this bridge exists:
Desktop has, in practice, denied its own filesystem connector was present
and flagged Step 0 as injection-shaped, even when the connector was
confirmed active. Claude Code CLI does not have this problem.

## Build

\`\`\`bash
cd mcp-server
npm install
npm run build
\`\`\`

## Configure in Claude Desktop

Add to Desktop's MCP config (Settings -> Developer -> Edit Config, or the
equivalent `claude_desktop_config.json`):

\`\`\`json
{
  "mcpServers": {
    "personify": {
      "command": "node",
      "args": ["/absolute/path/to/personify/mcp-server/dist/index.js"]
    }
  }
}
\`\`\`

Restart Desktop after editing.

## Known costs (accepted, not engineered around in v1)

- Latency: each call is a cold CLI start plus a real model call. Expect
  single-digit to tens of seconds.
- Requires the `claude` CLI to be installed and on `PATH` for whatever user
  account runs Desktop, with the `personify` plugin installed
  (`/plugin marketplace add smartwatermelon/personify && /plugin install personify@personify`).

## Manual verification checklist

Run this after any change to `mcp-server/src/`, since the automated test
suite mocks the `claude` subprocess and cannot catch real invocation drift:

1. Build (`npm run build`), configure Desktop per above, fully quit and
   restart Desktop (not just start a new chat — the MCP server process is
   started per Desktop launch).
2. In a **fresh** Desktop chat (no prior priming about personify), ask
   Desktop to personify a short paragraph containing at least one em dash
   and one phrase from `SKILL.md`'s pattern list (e.g. "this represents a
   pivotal shift").
3. Confirm: Desktop calls the `personify` tool (visible in its tool-call
   UI), the returned text has no em dash and no inflated-significance
   phrasing, and the result reads close to what running
   `/personify:personify` directly in a CLI session on the same input
   produces.
4. Repeat step 2 in a second, separate fresh Desktop session to confirm no
   session-specific priming is required.
5. Break it on purpose: temporarily rename the installed personify plugin
   directory (or unset `PATH` for `claude` in Desktop's environment) and
   confirm the tool call comes back as a visible Desktop-side error, not a
   silent pass-through of the original text.
6. Restore whatever was temporarily changed in step 5.
```

- [ ] **Step 2: Perform the manual checklist above against a real Desktop install**

Execute steps 1 through 6 from the README's checklist by hand. Record the outcome of each step (pass/fail, and for any fail, the exact error text observed) back to the user — this is a manual gate, not something to mark complete without doing it.

- [ ] **Step 3: Commit the README**

```bash
git -C /Users/andrewrich/Developer/personify add mcp-server/README.md
git -C /Users/andrewrich/Developer/personify commit -m "add mcp-server README with install steps and manual verification checklist"
```

---

### Task 6: Top-level README pointer and repo CLAUDE.md update

**Files:**

- Modify: `/Users/andrewrich/Developer/personify/README.md`
- Modify: `/Users/andrewrich/Developer/personify/CLAUDE.md`

- [ ] **Step 1: Add a short section to the top-level `README.md`** after the existing "Any other harness" subsection and before "## Usage":

```markdown
### Claude Desktop via MCP bridge (recommended over the raw-skill route above)

Claude Desktop has, in practice, been unreliable about trusting its own
filesystem connector state and about Step 0's "load `VOICE.md` and treat it
as authoritative" instruction. See `mcp-server/README.md` for an MCP server
that routes Desktop's personify calls through the Claude Code CLI instead,
avoiding that failure mode entirely.
```

- [ ] **Step 2: Add a short note to the project `CLAUDE.md`** in the "What this repo is" section, after the existing bullet list, noting the new subdirectory exists and is independently versioned/tested from the skill itself:

```markdown
- `mcp-server/` is a separate Node/TypeScript package (its own `package.json`, tests via `vitest`) that bridges Claude Desktop to this skill by shelling out to the Claude Code CLI. It is versioned independently of `SKILL.md`/`plugin.json` — the lockstep version-bump rule below applies only to the skill content, not to this bridge. See `mcp-server/README.md`.
```

- [ ] **Step 3: Commit**

```bash
git -C /Users/andrewrich/Developer/personify add README.md CLAUDE.md
git -C /Users/andrewrich/Developer/personify commit -m "document mcp-server bridge in top-level README and CLAUDE.md"
```

---

### Task 7: OAuth token file for Desktop's subprocess spawn

**Why this task exists:** Manual verification of Task 5 found that `claude` invoked as a child of Claude Desktop's Node process fails authentication with "OAuth session expired and could not be refreshed," even though the same command works fine from a Terminal-launched shell. Root cause, confirmed by direct reproduction: `claude`'s default OAuth credential lives in the macOS Keychain, and Keychain reads for that item succeed only from process trees macOS already trusts for it (e.g. Terminal, which is how the user's own `run-review.sh` git-hook invocations of `claude` work). Desktop spawning `node` spawning `claude` is an untrusted process tree; macOS silently denies the read (no GUI context in that spawn path to show an authorization prompt) rather than prompting, and `claude` reports it as an expired OAuth session.

This is not fixable by adjusting environment variables (confirmed by testing both a minimal env and a realistic launchd-style env — both reproduce the failure) and is not something end users should be asked to fix by editing macOS Keychain ACLs. The chosen fix: `claude setup-token` mints a long-lived (one-year), subscription-billed OAuth token via `CLAUDE_CODE_OAUTH_TOKEN`, entirely bypassing the Keychain read path. This does NOT switch billing to metered API usage — confirmed via Anthropic's docs (`https://code.claude.com/docs/en/authentication`): the token "authenticates with your Claude subscription and requires a Pro, Max, Team, or Enterprise plan." It sits below `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN`/`apiKeyHelper` in Claude Code's authentication precedence order and above default `/login` subscription credentials, so setting it only for this subprocess's own environment (not exported globally) affects only this bridge's own `claude` invocations.

**Files:**

- Create: `mcp-server/src/token.ts`
- Create: `mcp-server/token.example`
- Test: `mcp-server/test/token.test.ts`
- Modify: `mcp-server/src/cli-runner.ts`
- Modify: `mcp-server/test/cli-runner.test.ts`
- Modify: `mcp-server/README.md`

**Interfaces:**

- Produces: `loadOAuthToken(opts?: { tokenPath?: string }): Promise<{ ok: true; token: string } | { ok: false; error: string }>` in `token.ts`, exported alongside a constant `DEFAULT_TOKEN_PATH` resolving to `~/.config/personify/token` (honoring `XDG_CONFIG_HOME`, matching the existing convention `SKILL.md`'s Step 0 already uses for `VOICE.md`: `$XDG_CONFIG_HOME/personify/token`, or `~/.config/personify/token` when `XDG_CONFIG_HOME` is unset).
- Consumes (by `cli-runner.ts`): the above `loadOAuthToken` function, called once per `runPersonify` invocation, folding its result into the subprocess's `env`.

- [ ] **Step 1: Write the failing tests for `token.ts`**

```typescript
// mcp-server/test/token.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const readFileMock = vi.fn();
const statMock = vi.fn();
vi.mock("node:fs/promises", () => ({
  readFile: (...args: unknown[]) => readFileMock(...args),
  stat: (...args: unknown[]) => statMock(...args),
}));

const { loadOAuthToken } = await import("../src/token.js");

describe("loadOAuthToken", () => {
  beforeEach(() => {
    readFileMock.mockReset();
    statMock.mockReset();
  });

  it("returns the trimmed token when the file exists with mode 600", async () => {
    statMock.mockResolvedValue({ mode: 0o100600 });
    readFileMock.mockResolvedValue("sk-ant-oat01-abc123\n");

    const result = await loadOAuthToken({ tokenPath: "/fake/token" });

    expect(result).toEqual({ ok: true, token: "sk-ant-oat01-abc123" });
  });

  it("returns the trimmed token when the file exists with mode 400", async () => {
    statMock.mockResolvedValue({ mode: 0o100400 });
    readFileMock.mockResolvedValue("sk-ant-oat01-abc123\n");

    const result = await loadOAuthToken({ tokenPath: "/fake/token" });

    expect(result).toEqual({ ok: true, token: "sk-ant-oat01-abc123" });
  });

  it("rejects a token file with overly permissive mode (e.g. 644)", async () => {
    statMock.mockResolvedValue({ mode: 0o100644 });
    readFileMock.mockResolvedValue("sk-ant-oat01-abc123\n");

    const result = await loadOAuthToken({ tokenPath: "/fake/token" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("permissions");
      expect(result.error).toContain("/fake/token");
    }
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it("returns an error when the token file is missing", async () => {
    statMock.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

    const result = await loadOAuthToken({ tokenPath: "/fake/token" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("/fake/token");
      expect(result.error).toContain("setup-token");
    }
  });

  it("returns an error when the token file is empty or whitespace-only", async () => {
    statMock.mockResolvedValue({ mode: 0o100600 });
    readFileMock.mockResolvedValue("   \n");

    const result = await loadOAuthToken({ tokenPath: "/fake/token" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("empty");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/andrewrich/Developer/personify/mcp-server && npx vitest run test/token.test.ts
```

Expected: FAIL — `../src/token.js` does not exist.

- [ ] **Step 3: Implement `token.ts`**

```typescript
// mcp-server/src/token.ts
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_TOKEN_PATH = join(
  process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
  "personify",
  "token",
);

export type TokenResult =
  | { ok: true; token: string }
  | { ok: false; error: string };

export async function loadOAuthToken(
  opts: { tokenPath?: string } = {},
): Promise<TokenResult> {
  const tokenPath = opts.tokenPath ?? DEFAULT_TOKEN_PATH;

  let fileStat;
  try {
    fileStat = await stat(tokenPath);
  } catch {
    return {
      ok: false,
      error:
        `no OAuth token found at ${tokenPath}. Run "claude setup-token" ` +
        `and save the printed token to this path (see mcp-server/token.example ` +
        `for the expected format).`,
    };
  }

  // Only the owner may read or write: reject group/other permission bits.
  // 0o777 masks the permission bits out of the full mode returned by stat().
  const mode = fileStat.mode & 0o777;
  if (mode & 0o077) {
    return {
      ok: false,
      error:
        `${tokenPath} has overly permissive file permissions (mode ` +
        `${mode.toString(8)}). Run "chmod 600 ${tokenPath}" and try again.`,
    };
  }

  const raw = await readFile(tokenPath, "utf8");
  const token = raw.trim();
  if (token.length === 0) {
    return { ok: false, error: `${tokenPath} is empty. Run "claude setup-token" and save the printed token there.` };
  }

  return { ok: true, token };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/andrewrich/Developer/personify/mcp-server && npx vitest run test/token.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Write `mcp-server/token.example`**

```
# Personify MCP bridge: OAuth token for Desktop's subprocess calls
#
# This file holds a long-lived Claude Code OAuth token, generated with:
#
#     claude setup-token
#
# Copy the token that command prints (starts with "sk-ant-oat01-") into
# this file, on its own line, with no surrounding quotes or extra text.
# Then move this file to its real location and lock down its permissions:
#
#     mkdir -p ~/.config/personify
#     mv mcp-server/token.example ~/.config/personify/token
#     # edit ~/.config/personify/token: replace this comment block with
#     # just the token you copied
#     chmod 600 ~/.config/personify/token
#
# The MCP server refuses to read this file if its permissions are looser
# than 600 (owner read/write only) or 400 (owner read only).
#
# This token authenticates against your Claude subscription (Pro, Max,
# Team, or Enterprise), the same as running "claude" from a terminal. It
# does not use metered API billing.
#
# To see or revoke tokens you have generated this way, visit
# https://claude.ai/settings and look under the Claude Code section. Note:
# as of this writing, revocation there has been unreliable in some
# reported cases for already-minted setup-token credentials; if in doubt,
# also remove this file and re-run "claude setup-token" to mint a fresh one.

sk-ant-oat01-REPLACE-WITH-YOUR-ACTUAL-TOKEN
```

- [ ] **Step 6: Update `cli-runner.ts` to load and pass the token**

Modify the top of `mcp-server/src/cli-runner.ts` to import `loadOAuthToken`, and modify `runPersonify` to load the token before spawning and fold it into the child's environment. Replace the file's contents with:

```typescript
// mcp-server/src/cli-runner.ts
import { spawn } from "node:child_process";
import type { CliResult } from "./types.js";
import { loadOAuthToken } from "./token.js";

export const PERSONIFY_INSTRUCTION =
  "Run the personify:personify skill on the text provided via stdin and " +
  "return only the resulting text, no commentary, no preamble, no markdown " +
  "code fence around it.";

export const DEFAULT_TIMEOUT_MS = 30_000;

export async function runPersonify(
  text: string,
  opts: { timeoutMs?: number; tokenPath?: string } = {},
): Promise<CliResult> {
  if (text.trim().length === 0) {
    return { ok: false, error: "no text provided" };
  }

  const tokenResult = await loadOAuthToken({ tokenPath: opts.tokenPath });
  if (!tokenResult.ok) {
    return { ok: false, error: tokenResult.error };
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolve) => {
    const child = spawn(
      "claude",
      ["--print", "--permission-mode", "auto", PERSONIFY_INSTRUCTION],
      {
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: tokenResult.token },
      },
    );

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      const killTimer = setTimeout(() => child.kill("SIGKILL"), 5_000);
      killTimer.unref();
      resolve({
        ok: false,
        error: `personify CLI call timed out after ${timeoutMs}ms`,
      });
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        error: `failed to spawn claude CLI: ${err.message}`,
      });
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ ok: true, text: stdout.trim() });
      } else {
        resolve({
          ok: false,
          error: `personify CLI exited with exit code ${code}: ${stderr.trim() || stdout.trim()}`,
        });
      }
    });

    child.stdin?.on("error", () => {
      // Swallow EPIPE: the child exited before draining stdin. The real
      // outcome is reported by the close/error handlers above.
    });
    child.stdin?.write(text);
    child.stdin?.end();
  });
}
```

Note the signature change: `runPersonify` is now `async` (it awaits `loadOAuthToken` before spawning), and the empty-input short-circuit now returns a plain object instead of `Promise.resolve(...)` since the function itself is already a promise via `async`. Callers awaiting `runPersonify(...)` (in `index.ts`, added in Task 4) are unaffected: an `async function` returning `Promise<CliResult>` is call-compatible with the previous `Promise<CliResult>`-returning signature.

- [ ] **Step 7: Update `cli-runner.test.ts` to mock `token.ts` and account for the new async load step**

Add a mock for `../src/token.js` near the top of `mcp-server/test/cli-runner.test.ts` (alongside the existing `node:child_process` mock):

```typescript
const loadOAuthTokenMock = vi.fn();
vi.mock("../src/token.js", () => ({
  loadOAuthToken: (...args: unknown[]) => loadOAuthTokenMock(...args),
}));
```

In the `beforeEach`, reset it and set a default successful resolution so existing tests do not need to change their assertions about spawn/argv behavior:

```typescript
beforeEach(() => {
  spawnMock.mockReset();
  loadOAuthTokenMock.mockReset();
  loadOAuthTokenMock.mockResolvedValue({ ok: true, token: "sk-ant-oat01-test" });
});
```

Update the existing "spawns claude with a fixed argv..." test's assertion on `spawnOpts` to also check the token was folded into env:

```typescript
expect(spawnOpts).toMatchObject({
  shell: false,
  env: expect.objectContaining({ CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat01-test" }),
});
```

Add one new test:

```typescript
it("returns a tool error without spawning when the token cannot be loaded", async () => {
  loadOAuthTokenMock.mockResolvedValue({
    ok: false,
    error: "no OAuth token found at /fake/token. Run \"claude setup-token\"...",
  });

  const result = await runPersonify("some text");

  expect(result).toEqual({
    ok: false,
    error: "no OAuth token found at /fake/token. Run \"claude setup-token\"...",
  });
  expect(spawnMock).not.toHaveBeenCalled();
});
```

The existing "rejects empty input before spawning" test's assertion (`expect(spawnMock).not.toHaveBeenCalled()`) still holds unchanged: empty-input is checked before the token load, so `loadOAuthTokenMock` is also never called for that case, but no test currently asserts that negative and none needs to for this task.

- [ ] **Step 8: Run the full test suite**

```bash
cd /Users/andrewrich/Developer/personify/mcp-server && npx vitest run
```

Expected: all tests across `token.test.ts`, `cli-runner.test.ts`, `version-check.test.ts`, `index.test.ts` PASS.

- [ ] **Step 9: Run `tsc --noEmit`**

```bash
cd /Users/andrewrich/Developer/personify/mcp-server && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 10: Rewrite `mcp-server/README.md`'s Build and Configure sections**

Replace the "## Build" section with (fixing the also-reported issue that the build command needs to specify it runs from the repo root, not assume the reader is already inside `mcp-server/`):

```markdown
## Build

From the repo root:

\`\`\`bash
cd mcp-server
npm install
npm run build
\`\`\`
```

Insert a new section between "## Build" and "## Configure in Claude Desktop", explaining the OAuth token requirement:

```markdown
## Authenticate

Claude Desktop cannot use your regular `claude` login for this bridge.
`claude` normally reads your OAuth session from the macOS Keychain, and
Keychain access for that credential is restricted to process trees macOS
already trusts, like a Terminal-launched shell. Desktop launches this
server as a child of its own process, a different, untrusted process
tree, so the Keychain read is silently denied and `claude` reports it as
an expired OAuth session, even though your regular terminal `claude`
session is fine.

The fix is a separate, long-lived OAuth token scoped to this bridge only,
generated with:

\`\`\`bash
claude setup-token
\`\`\`

This opens a browser authorization flow (the same one `/login` uses) and,
once you approve it, prints a token to your terminal. This token
authenticates against your Claude subscription (Pro, Max, Team, or
Enterprise) exactly like your normal `claude` session does: it is not an
API key, and using it does not switch you to metered API billing.

Copy the printed token into `~/.config/personify/token` (see
`token.example` in this directory for the expected format), then lock
down its permissions so only you can read it:

\`\`\`bash
mkdir -p ~/.config/personify
# paste the token from "claude setup-token" into ~/.config/personify/token
chmod 600 ~/.config/personify/token
\`\`\`

The server refuses to start a `claude` call if this file is missing, empty,
or has permissions looser than 600 (owner read/write) or 400 (owner
read-only).

If `XDG_CONFIG_HOME` is set in your environment, the token is read from
`$XDG_CONFIG_HOME/personify/token` instead, matching where `VOICE.md`
lives for the Personify skill itself.

To see or revoke a token you generated this way, visit
[claude.ai/settings](https://claude.ai/settings) and look under the
Claude Code section. Revocation there has been reported as unreliable in
some cases for already-minted `setup-token` credentials; if a token stops
working (or you want to be certain it is gone), delete
`~/.config/personify/token` and run `claude setup-token` again for a
fresh one.
```

- [ ] **Step 11: Update the "Known costs" section's second bullet**

The existing bullet about requiring `claude` on `PATH` now also needs to mention the token file. Replace:

```markdown
- Requires the `claude` CLI to be installed and on `PATH` for whatever user
  account runs Desktop, with the `personify` plugin installed
  (`/plugin marketplace add smartwatermelon/personify && /plugin install personify@personify`).
```

with:

```markdown
- Requires the `claude` CLI to be installed and on `PATH` for whatever user
  account runs Desktop, with the `personify` plugin installed
  (`/plugin marketplace add smartwatermelon/personify && /plugin install personify@personify`),
  and requires the OAuth token file described above under "Authenticate."
```

- [ ] **Step 12: Verify em/en dash cleanliness in all new/changed prose**

```bash
grep -n $'—\|–' /Users/andrewrich/Developer/personify/mcp-server/README.md /Users/andrewrich/Developer/personify/mcp-server/token.example /Users/andrewrich/Developer/personify/mcp-server/src/token.ts /Users/andrewrich/Developer/personify/mcp-server/src/cli-runner.ts
```

Expected: no matches (adjust the grep syntax for your shell if the literal dash characters do not paste correctly; the point is zero matches across these files).

- [ ] **Step 13: Commit**

```bash
git -C /Users/andrewrich/Developer/personify add mcp-server/src/token.ts mcp-server/token.example mcp-server/test/token.test.ts mcp-server/src/cli-runner.ts mcp-server/test/cli-runner.test.ts mcp-server/README.md
git -C /Users/andrewrich/Developer/personify commit -m "feat(mcp-server): use claude setup-token OAuth token instead of Keychain

Claude Desktop spawns this server's subprocess in a process tree macOS
Keychain does not trust for the claude CLI's default OAuth credential,
which surfaced as a false 'OAuth session expired' error. Read a
long-lived, subscription-billed token from a permission-checked file
instead, generated once via 'claude setup-token'."
```

- [ ] **Step 14: Re-run the manual verification checklist's core scenario**

This is a manual step for the human to perform after Task 7 lands, not something a subagent can do. After `npm run build` picks up the change, generate a token with `claude setup-token`, save it to `~/.config/personify/token` with `chmod 600`, restart Desktop, and retry a sample personify request from a fresh Desktop chat. Confirm it now succeeds end-to-end and returns personified text, closing out the gap Task 5's manual checklist first surfaced.

### Task 8: Discourage Desktop from re-paraphrasing the tool's returned text

**Why this task exists:** With Task 7's auth fix working, a real end-to-end Desktop test surfaced a second, distinct problem. Driving the built server directly over the same JSON-RPC/stdio protocol Desktop uses, with the exact text Desktop was given, confirmed the server's raw tool-call response has zero em/en dashes and thorough editing (verified by direct reproduction, not assumption). But what Desktop actually displayed in the chat reintroduced an em dash and applied lighter editing than the tool's real output. The server is not the source of the defect: Desktop's own model is evidently treating the tool's returned text as material to paraphrase into its reply rather than content to relay verbatim. This can't be fixed inside `cli-runner.ts` or `version-check.ts` (their output is already correct); the only lever available from this codebase is strengthening the instructions Desktop sees about the tool and its result, with no protocol-level guarantee this fully closes the gap since it depends on Desktop's own model choosing to follow the hint.

**Files:**

- Modify: `mcp-server/src/index.ts`
- Modify: `mcp-server/test/index.test.ts`

**Interfaces:**

- No signature changes. `handlePersonifyCall`'s return shape (`CallToolResult`) is unchanged; only the tool's static `description` string and the successful-result `content[0].text` wrapping change.

- [ ] **Step 1: Update the failing/changing tests first**

The existing tests in `mcp-server/test/index.test.ts` assert `result.content[0].text` equals the CLI's returned text with an optional staleness note appended (e.g. `expect(result.content[0].text).toBe("clean text")` and `.toBe("clean text[stale note]")`). These assertions must change to account for a new wrapping instruction added around the successful result. Update the two success-path tests (the "returns personified text with no note when up to date" and "appends the staleness note when the plugin is behind" cases) to assert the text starts with the literal instruction line and ends with the original content, rather than an exact full-string match. Replace their assertions with:

```typescript
it("returns personified text with no note when up to date", async () => {
  runPersonifyMock.mockResolvedValue({ ok: true, text: "clean text" });
  checkPersonifyVersionMock.mockResolvedValue({ stale: false });

  const result = await handlePersonifyCall("raw text");

  expect(result.isError).toBeFalsy();
  expect(result.content[0].text).toContain("clean text");
  expect(result.content[0].text.startsWith("Return the following text to the user exactly as written")).toBe(true);
});

it("appends the staleness note when the plugin is behind", async () => {
  runPersonifyMock.mockResolvedValue({ ok: true, text: "clean text" });
  checkPersonifyVersionMock.mockResolvedValue({
    stale: true,
    installed: "0.2.1",
    latest: "0.3.0",
  });

  const result = await handlePersonifyCall("raw text");

  expect(result.isError).toBeFalsy();
  expect(result.content[0].text).toContain("clean text[stale note]");
  expect(result.content[0].text.startsWith("Return the following text to the user exactly as written")).toBe(true);
});
```

The third existing test (CLI failure surfaces as a tool error) is unaffected: the error path is not wrapped with this instruction, since a failure message is meant for Desktop to act on (e.g. offer to edit manually), not relay verbatim. Leave that test as-is.

- [ ] **Step 2: Run tests to verify they fail against the current implementation**

```bash
cd /Users/andrewrich/Developer/personify/mcp-server && npx vitest run test/index.test.ts
```

Expected: the two updated tests FAIL (the current implementation doesn't prepend any instruction line yet); the third (CLI-failure) test still PASSES unchanged.

- [ ] **Step 3: Update `handlePersonifyCall` in `mcp-server/src/index.ts`**

Add a constant near the top of the file and use it to wrap only the successful-result text (never the error path):

```typescript
const VERBATIM_INSTRUCTION =
  "Return the following text to the user exactly as written, with no " +
  "paraphrasing, no summarizing, and no further editing of any kind, not " +
  "even small stylistic changes. This text has already been fully edited " +
  "by the personify tool; treat it as final.\n\n";
```

Change the success-path `return` in `handlePersonifyCall` from:

```typescript
  const note = formatStalenessNote(versionResult);
  return {
    isError: false,
    content: [{ type: "text", text: cliResult.text + (note ?? "") }],
  };
```

to:

```typescript
  const note = formatStalenessNote(versionResult);
  return {
    isError: false,
    content: [
      { type: "text", text: VERBATIM_INSTRUCTION + cliResult.text + (note ?? "") },
    ],
  };
```

- [ ] **Step 4: Strengthen the tool's static description**

Change the `description` field in the `ListToolsRequestSchema` handler's `tools` array (currently "Strip AI-writing tells from prose before sending, publishing, or shipping it. Runs the personify skill via the Claude Code CLI so it works reliably from Claude Desktop.") to also state the verbatim-relay expectation up front, so Desktop's model has the expectation before it even calls the tool, not only after:

```typescript
description:
  "Strip AI-writing tells from prose before sending, publishing, or " +
  "shipping it. Runs the personify skill via the Claude Code CLI so " +
  "it works reliably from Claude Desktop. The tool's output is the " +
  "final, fully-edited text: relay it to the user exactly as returned, " +
  "without paraphrasing, summarizing, or further editing it.",
```

- [ ] **Step 5: Run the updated tests to verify they pass**

```bash
cd /Users/andrewrich/Developer/personify/mcp-server && npx vitest run test/index.test.ts
```

Expected: all 3 tests PASS.

- [ ] **Step 6: Run the full suite and `tsc --noEmit`**

```bash
cd /Users/andrewrich/Developer/personify/mcp-server && npx vitest run && npx tsc --noEmit
```

Expected: all tests across all 4 test files PASS; `tsc` clean.

- [ ] **Step 7: Em/en dash check**

```bash
grep -n $'—\|–' /Users/andrewrich/Developer/personify/mcp-server/src/index.ts
```

Expected: no matches.

- [ ] **Step 8: Commit**

```bash
git -C /Users/andrewrich/Developer/personify add mcp-server/src/index.ts mcp-server/test/index.test.ts
git -C /Users/andrewrich/Developer/personify commit -m "fix(mcp-server): instruct Desktop to relay personify output verbatim

A real end-to-end Desktop test showed the tool's raw JSON-RPC response
has no em dashes and thorough edits, but Desktop's displayed reply
reintroduced a dash and softened some edits: Desktop's own model was
treating the returned text as material to paraphrase rather than a
final answer to relay as-is. Strengthen both the tool description and
the per-call result with an explicit verbatim-relay instruction."
```

- [ ] **Step 9: Manual re-verification (human step, not a subagent task)**

After this lands and `npm run build` picks it up, restart Desktop and re-run the same test paragraph from the earlier manual test. Confirm the displayed reply now has zero em/en dashes and matches (or is very close to) the raw tool output verified by driving the server directly in this task's investigation. Note in the follow-up to the coordinator whether this instruction fully closed the gap or only partially helped, since Desktop's own paraphrasing behavior is outside this codebase's control and may need a different mitigation if it persists.

## Post-plan: PR and CI

This repo's `CLAUDE.md` (global, `~/.claude/CLAUDE.md`) requires: work on a branch (never main), local review before push, PR creation and merge as separate authorized steps, and CI monitoring after push. None of that is scripted into this plan's tasks — it happens at the session level (branch created before Task 1, PR opened after Task 6, per the standing protocol) rather than as a plan step, since it is not specific to this feature.
