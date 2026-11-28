/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { BROWSER_GLOBAL_ALLOWLIST, checkBrowserGlobals } from "./helpers/browser-global-scan";

// Files are read as raw text through Vite's glob import, so the test needs no
// Node type package and the engine keeps an empty dependency list.
const sources = import.meta.glob("../src/**/*", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const packageText = import.meta.glob("../package.json", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const tsconfigText = import.meta.glob("../tsconfig.json", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

describe("engine package smoke test", () => {
  it("declares no runtime dependencies", () => {
    const pkg = JSON.parse(Object.values(packageText)[0]);
    expect(pkg).not.toHaveProperty("dependencies");
  });

  it("compiles in strict mode", () => {
    const tsconfig = JSON.parse(Object.values(tsconfigText)[0]);
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });

  it("imports the entry point in Node", async () => {
    const entry = await import("../src/index");
    expect(entry).toBeDefined();
  });

  it("finds at least one source file to scan", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(0);
  });

  it("uses no browser global in any source file", () => {
    expect(checkBrowserGlobals(sources, BROWSER_GLOBAL_ALLOWLIST)).toEqual([]);
  });

  it("mentions no application concept in any source file", () => {
    const pattern = /\b(car|mission|hospital|room)\b/i;
    for (const [file, text] of Object.entries(sources)) {
      expect(pattern.test(text), `${file} mentions an application concept`).toBe(false);
    }
  });
});
