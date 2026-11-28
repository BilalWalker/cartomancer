import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readJson(name: string): Record<string, unknown> {
  const url = new URL(`../${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as Record<string, unknown>;
}

describe("demo package scaffold", () => {
  it("has no dependencies field", () => {
    const pkg = readJson("package.json");
    expect("dependencies" in pkg).toBe(false);
  });

  it("has strict mode on", () => {
    const tsconfig = readJson("tsconfig.json") as {
      compilerOptions: { strict?: boolean };
    };
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });
});
