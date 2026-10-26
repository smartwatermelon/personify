# personify-mcp

MCP bridge that lets Claude Desktop run the `personify:personify` Claude
Code skill reliably. Desktop calls this server's one tool, `personify`; the
server shells out to `claude --print` to do the actual work, so Desktop
never has to load `VOICE.md` or evaluate Step 0's "treat this file as
authoritative" instruction itself.

See the parent repo's `SKILL.md` for what personify does. The bridge exists
because of [Build MCP service for Claude Desktop compatibility](https://github.com/twistedmelonman/personify/issues/23):
Desktop has, in practice, denied its own filesystem connector was present
and flagged Step 0 as injection-shaped, even when the connector was
confirmed active. Claude Code CLI does not have this problem.

## Prerequisites

- **Node.js 20.19 or later in the 20 line, or 22.12 or later.** Check with
  `node --version`. Install from [nodejs.org](https://nodejs.org) or with
  `brew install node`.
- **npm**, which ships with Node. Check with `npm --version`.
- **TypeScript.** `npm ci` installs it as a dev dependency and
  `npm run build` finds `tsc` in `node_modules/.bin`. A global `tsc` is only
  needed to run it outside `npm run build`.
- The **`claude` CLI** on `PATH`, checked with `claude --version`, with the
  `personify` plugin installed as shown under "Known costs" below. The
  bridge runs the skill through it, and "Authenticate" uses it to generate
  the OAuth token.

If `npm ci` or `npm run build` fails, run the `--version` checks above
first. A missing or too-old Node, npm, or `tsc` produces confusing
module-resolution or syntax errors rather than a clear "not found" message.

## Build

From the repo root:

```bash
cd mcp-server
npm ci
```

`npm ci` builds `dist/` through the `prepare` script, and every build clears
`dist/` first, so a source file that was deleted does not leave a stale
module behind.

Desktop does not run `dist/index.js` directly. It runs the launcher,
`bin/personify-mcp`, which rebuilds `dist/` when it is missing or older than
anything in `src/` (running `npm ci` first when `node_modules` is missing or
out of date) and then execs the server. A `git pull` therefore takes effect
on the next Desktop restart, with no manual rebuild. The launcher writes its
build output to stderr, since stdout is the MCP protocol channel; when a
build fails it prints the reason to stderr and exits non-zero, and Desktop
shows the server as failed.

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

```bash
claude setup-token
```

This opens the same browser authorization flow `/login` uses and, once you
approve it, prints a token to your terminal. The token authenticates against
your Claude subscription, whether Pro, Max, Team, or Enterprise, exactly like
your normal `claude` session does: it is not an API key, and using it does
not switch you to metered API billing.

Copy the printed token into `~/.config/personify/token`, in the format
`token.example` in this directory shows, then lock down its permissions so
only you can read it:

```bash
mkdir -p ~/.config/personify
# paste the token from "claude setup-token" into ~/.config/personify/token
chmod 600 ~/.config/personify/token
```

The server refuses to start a `claude` call if this file is missing, empty,
or has permissions looser than 600, owner read and write, or 400, owner
read-only.

If `XDG_CONFIG_HOME` is set in the environment Claude Desktop itself
launches with, not just your shell, the token is read from
`$XDG_CONFIG_HOME/personify/token` instead. GUI-launched apps on
macOS do not inherit your shell's exports; if you rely on a custom
`XDG_CONFIG_HOME`, set it explicitly via the `env` block in
`claude_desktop_config.json` rather than assuming Desktop sees your
shell's value.

To see or revoke a token you generated this way, visit
[claude.ai/settings](https://claude.ai/settings) and look under the
Claude Code section. Revocation there may not invalidate a token that
already exists:
[issue 43801 on the Claude Code tracker](https://github.com/anthropics/claude-code/issues/43801)
reports OAuth tokens still working days after revoking every Claude Code
instance on claude.ai. That report is about the VS Code extension's login,
not `setup-token` specifically. If a token stops working, or you want to be
certain it is gone, delete `~/.config/personify/token` and run
`claude setup-token` again for a fresh one.

## Configure in Claude Desktop

From `mcp-server/`, after building:

```bash
npm run install-desktop-config
```

This merges a `personify` entry into
`~/Library/Application Support/Claude/claude_desktop_config.json`, creating
the file if it does not exist yet. The entry's command is the absolute path
to this repo's `bin/personify-mcp` launcher, with no arguments. It only ever
touches the `personify` key under `mcpServers`; any other MCP servers or
settings already in that file are left exactly as they are. Running it again,
for example after moving the repo, updates the entry in place rather than
duplicating it, and it replaces an older `node .../dist/index.js` entry with
the launcher.

Fully quit and restart Desktop after the first install. Desktop reads this
file only at launch. After that, a `git pull` needs only a Desktop restart;
the launcher rebuilds whatever changed.

macOS only for now. On other platforms, add the following to
`claude_desktop_config.json` by hand instead (path varies by OS; see
[Anthropic's MCP docs](https://modelcontextprotocol.io) for where Desktop
looks for it there):

```json
{
  "mcpServers": {
    "personify": {
      "command": "/absolute/path/to/personify/mcp-server/bin/personify-mcp",
      "args": []
    }
  }
}
```

## Known costs (accepted, not engineered around)

- Latency: each call is a cold CLI start and one model draft. Bridge 0.6
  also ran a detector check. With it, a call took 30 to 40 seconds and used
  about 30 cents of Claude usage (measured 2026-09-22). Dropping that check
  removed a step and added none.
- Requires the `claude` CLI to be installed and on `PATH` for whatever user
  account runs Desktop, with the `personify` plugin installed
  (`/plugin marketplace add twistedmelonman/personify && /plugin install personify@personify`),
  and requires the OAuth token file described above under "Authenticate."

## What the tool returns

The bridge runs the `personify:personify` skill through the `claude` CLI.
It returns what the skill wrote to its draft file, not the model's report of
what it did. There is no detector check and no verdict: 0.7.0 removed both.

| Outcome | How the bridge knows | `content` | `isError` |
|---|---|---|---|
| rewritten | the CLI exited 0 and the draft file exists and is not blank | First block: the bytes of the draft file, nothing else | false |
| failed | the draft file is missing or blank, or the CLI timed out, failed to spawn, or exited non-zero, or a precondition failed | `personify failed: <reason>`, plus the model's last output, fenced, when there is one | true |

`structuredContent` carries the same result in fields, declared through the
tool's `outputSchema`. The fields are `outcome`, then `text` when rewritten,
or `error` and an optional `report` when failed, plus `staleness` where it
applies. The text is in both places because clients differ in which one
reaches the model. A live Desktop call on 2026-09-23 returned a structured
result that held only the outcome. Desktop's model received those fields and
no content text at all, so it had nothing to show. The structured `text` is
the same bytes as the first content block, and nothing is prepended or
appended to it. A version-staleness note, when there is one, rides in a
separate second content block and in `structuredContent.staleness`.

The tool description covers both forms. For the structured form it keys on
`outcome`. For the content form only the FIRST content block matters. A
second block, when there is one, is a plugin staleness note for the user,
not part of the text. Say the call did not error, and that first block does
not start with `personify failed`. Then it is final, and is relayed exactly
as returned. Otherwise it should be shown to the reader as returned, with
nothing in it sent, posted, or published anywhere.

The tool takes `text`, and an optional `kind` (`pr`, `commit`,
`pr-comment`, `copy`, and so on). The kind goes into the instruction. The
skill then applies that kind's rules, and runs its length check with
`--kind` when the checker knows that kind. Bridge 0.6 and earlier also took
`repo` and `dir` to route the detector check. A caller that still sends
them is not refused, and both are ignored.

Each call has a 180 s budget. If it expires before the CLI finishes, the
outcome is `failed`.

## Permissions

The bridge calls `claude --print` with an allowlist of four to six rules,
depending on whether a voice guide resolves and whether it is a symlink, and
nothing else. Everything not covered by one of these rules is denied without
a prompt. Each placeholder is an absolute path, so the rule starts with
`//`, which is how Claude Code spells a filesystem-root path in a permission
rule:

- `Bash(python3 <installPath>/scripts/length_check.py:*)`, running the
  installed personify plugin's own length checker.
- `Read(/<installPath>/**)`, the installed personify plugin's own files.
- `Read(/<voice guide path>)`, only present when a voice guide resolves.
- `Read(/<voice guide realpath>)`, only present when the voice guide is a
  symlink and its realpath differs from its path. Claude Code checks a Read
  against a symlink separately from a Read against its resolved target, so a
  symlinked guide (the usual case for `~/.config/personify/VOICE.md`) needs
  both rules.
- `Read(/<body.md realpath>)`, so the length check can take the draft
  through a `< body.md` redirect. The CLI treats that redirect as a read of a file
  outside the working directory, and denies it without this rule.
- `Edit(/<body.md realpath>)`, the one draft file the skill writes to. Writes
  are granted through `Edit`, not `Write`.

There is deliberately no rule covering the personify config directory as a
whole. The only thing the skill reads there is `VOICE.md`, which is granted
above; a blanket `Read(/<configRoot>/**)` rule would also let the spawned
model read `~/.config/personify/token`, the bridge's own OAuth token, which
lives in the same directory.

User-level Claude Code settings still load in the spawned CLI. A
user-level allow rule you have configured separately (in
`~/.claude/settings.json`, for example) also applies here, on top of the
rules above; it is not sandboxed away by this allowlist.

## Manual verification checklist

Run this after any change to `mcp-server/src/`, since the automated test
suite mocks the `claude` subprocess and cannot catch real invocation drift.

1. Build (`npm run build`), configure Desktop per above, fully quit and
   restart Desktop (not just start a new chat: the MCP server process is
   started per Desktop launch).
2. Open a **fresh** Desktop chat, with no prior priming about personify.
   Ask Desktop to personify a paragraph of at least 40 words that contains
   at least one em dash. Use a long, substantive input where practical. The
   issue
   [personify tool leaks internal instruction preamble into its output](https://github.com/twistedmelonman/personify/issues/50)
   reproduced on long-form drafts and not on short ones.
3. Confirm the outcome matches one of these two shapes (see "What the
   tool returns" above):
   - **rewritten**: the reply is the edited text alone, with no em dash and
     no relay instruction shown to the reader.
   - **failed**: the reply reads `personify failed: <reason>`, shown to
     Desktop as a tool error, not as text to relay.
   In every case, confirm Desktop calls the `personify` tool, which shows
   in its tool-call UI. Also confirm Desktop never sends, posts, or
   publishes a `failed` result anywhere.
4. Repeat step 2 in a second, separate fresh Desktop session to confirm no
   session-specific priming is required.
5. Break it on purpose: temporarily rename the installed personify plugin
   directory (or unset `PATH` for `claude` in Desktop's environment) and
   confirm the tool call comes back as a visible Desktop-side error, not a
   silent pass-through of the original text.
6. Restore whatever was temporarily changed in step 5.
