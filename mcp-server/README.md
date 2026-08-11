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

## Prerequisites

- **Node.js >= 18** (check with `node --version`). Install via
  [nodejs.org](https://nodejs.org) or `brew install node`.
- **npm** (bundled with Node; check with `npm --version`).
- **TypeScript compiler (`tsc`)**. `npm install` pulls in TypeScript as a
  dev dependency, and `npm run build` resolves `tsc` from
  `node_modules/.bin` automatically, so a project-local install is normally
  enough. You only need `tsc` available globally (check with
  `tsc --version`) if you invoke it directly outside of `npm run build`,
  e.g. `brew install typescript` on macOS or `npm install -g typescript`.
- The **`claude` CLI** on `PATH` (check with `claude --version`), with the
  `personify` plugin installed (see "Known costs" below). This is needed
  both to build the plugin dependency and to generate the OAuth token in
  "Authenticate."

If `npm install` or `npm run build` fail, run the three `--version` checks
above first; a missing or too-old Node/npm/tsc produces confusing
module-resolution or syntax errors rather than a clear "not found" message.

## Build

From the repo root:

```bash
cd mcp-server
npm install
npm run build
```

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

This opens a browser authorization flow (the same one `/login` uses) and,
once you approve it, prints a token to your terminal. This token
authenticates against your Claude subscription (Pro, Max, Team, or
Enterprise) exactly like your normal `claude` session does: it is not an
API key, and using it does not switch you to metered API billing.

Copy the printed token into `~/.config/personify/token` (see
`token.example` in this directory for the expected format), then lock
down its permissions so only you can read it:

```bash
mkdir -p ~/.config/personify
# paste the token from "claude setup-token" into ~/.config/personify/token
chmod 600 ~/.config/personify/token
```

The server refuses to start a `claude` call if this file is missing, empty,
or has permissions looser than 600 (owner read/write) or 400 (owner
read-only).

If `XDG_CONFIG_HOME` is set in the environment Claude Desktop itself
launches with, not just your shell, the token is read from
`$XDG_CONFIG_HOME/personify/token` instead. Note that GUI-launched apps on
macOS do not inherit your shell's exports; if you rely on a custom
`XDG_CONFIG_HOME`, set it explicitly via the `env` block in
`claude_desktop_config.json` rather than assuming Desktop sees your
shell's value.

To see or revoke a token you generated this way, visit
[claude.ai/settings](https://claude.ai/settings) and look under the
Claude Code section. Revocation there has been reported as unreliable in
some cases for already-minted `setup-token` credentials; if a token stops
working (or you want to be certain it is gone), delete
`~/.config/personify/token` and run `claude setup-token` again for a
fresh one.

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

## Known costs (accepted, not engineered around in v1)

- Latency: each call is a cold CLI start plus a real model call. Expect
  single-digit to tens of seconds.
- Requires the `claude` CLI to be installed and on `PATH` for whatever user
  account runs Desktop, with the `personify` plugin installed
  (`/plugin marketplace add smartwatermelon/personify && /plugin install personify@personify`),
  and requires the OAuth token file described above under "Authenticate."

## Manual verification checklist

Run this after any change to `mcp-server/src/`, since the automated test
suite mocks the `claude` subprocess and cannot catch real invocation drift:

1. Build (`npm run build`), configure Desktop per above, fully quit and
   restart Desktop (not just start a new chat: the MCP server process is
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
