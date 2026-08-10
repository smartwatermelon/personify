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

```bash
cd mcp-server
npm install
npm run build
```

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
