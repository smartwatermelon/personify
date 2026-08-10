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

  it("preserves the original position of the mcpServers key in the object", () => {
    const existing = {
      mcpServers: { instapaper: { command: "node", args: ["/x/index.js"] } },
      coworkUserFilesPath: "/Users/someone/Claude",
    };

    const result = mergeConfig(existing, "/abs/path/to/dist/index.js");

    expect(Object.keys(result)).toEqual(["mcpServers", "coworkUserFilesPath"]);
  });

  it("throws a clear error when the existing config's top level is not an object", () => {
    expect(() => mergeConfig([1, 2, 3], "/abs/path/to/dist/index.js")).toThrow(
      "claude_desktop_config.json does not contain a valid JSON object at its top level",
    );
    expect(() =>
      mergeConfig("not an object", "/abs/path/to/dist/index.js"),
    ).toThrow(
      "claude_desktop_config.json does not contain a valid JSON object at its top level",
    );
  });
});
