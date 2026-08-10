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
    statMock.mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );

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

  it("returns an error instead of throwing when readFile rejects (e.g. EACCES)", async () => {
    statMock.mockResolvedValue({ mode: 0o100600 });
    readFileMock.mockRejectedValue(
      Object.assign(new Error("EACCES"), { code: "EACCES" }),
    );

    const result = await loadOAuthToken({ tokenPath: "/fake/token" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("/fake/token");
      expect(result.error).toContain("EACCES");
    }
  });

  it("accepts a token directory with mode 700 or 755", async () => {
    statMock.mockImplementation((path: string) => {
      if (path === "/fake") {
        return Promise.resolve({ mode: 0o040755 });
      }
      return Promise.resolve({ mode: 0o100600 });
    });
    readFileMock.mockResolvedValue("sk-ant-oat01-abc123\n");

    const result = await loadOAuthToken({ tokenPath: "/fake/token" });

    expect(result).toEqual({ ok: true, token: "sk-ant-oat01-abc123" });
  });

  it("rejects a token directory that is group- or world-writable (e.g. 777)", async () => {
    statMock.mockImplementation((path: string) => {
      if (path === "/fake") {
        return Promise.resolve({ mode: 0o040777 });
      }
      return Promise.resolve({ mode: 0o100600 });
    });
    readFileMock.mockResolvedValue("sk-ant-oat01-abc123\n");

    const result = await loadOAuthToken({ tokenPath: "/fake/token" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("/fake");
      expect(result.error).toContain("writable");
    }
    expect(readFileMock).not.toHaveBeenCalled();
  });
});
