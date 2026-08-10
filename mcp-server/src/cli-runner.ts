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
