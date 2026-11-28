import { describe, expect, it } from "vitest";
import {
  BROWSER_GLOBAL_ALLOWLIST,
  BROWSER_GLOBAL_PATTERN,
  checkBrowserGlobals,
} from "./helpers/browser-global-scan";

// Stand-in file lists, with paths as the glob gives them.
function cleanFiles(): Record<string, string> {
  return {
    "../src/index.ts": "export {};",
    "../src/views/canvas-adapter.ts": "// adapter",
    "../src/views/input-binding.ts": "// binding",
    "../src/views/mount.ts": "// mount",
  };
}

describe("browser global allowlist", () => {
  it("holds exactly the three browser-facing files and the old pattern", () => {
    expect([...BROWSER_GLOBAL_ALLOWLIST]).toEqual([
      "src/views/canvas-adapter.ts",
      "src/views/input-binding.ts",
      "src/views/mount.ts",
    ]);
    expect(BROWSER_GLOBAL_PATTERN.source).toBe("\\b(window|document|HTMLCanvasElement)\\b");
  });

  it("gives an empty result when all three are present and clean", () => {
    expect(checkBrowserGlobals(cleanFiles(), BROWSER_GLOBAL_ALLOWLIST)).toEqual([]);
  });

  it("fails for an allowlisted path with no file and names it", () => {
    const files = cleanFiles();
    delete files["../src/views/mount.ts"];
    const problems = checkBrowserGlobals(files, BROWSER_GLOBAL_ALLOWLIST);
    expect(problems).toEqual([
      'The allowlisted path "src/views/mount.ts" does not exist under kit/engine/src, so the allowlist is out of date.',
    ]);
  });

  it("fails for a file outside the allowlist that mentions window and names the file", () => {
    const files = { ...cleanFiles(), "../src/views/minimap.ts": "const w = window.innerWidth;" };
    expect(checkBrowserGlobals(files, BROWSER_GLOBAL_ALLOWLIST)).toEqual([
      "src/views/minimap.ts mentions a browser global",
    ]);
  });

  it("lets an allowlisted file mention document", () => {
    const files = { ...cleanFiles(), "../src/views/mount.ts": "document.title; HTMLCanvasElement;" };
    expect(checkBrowserGlobals(files, BROWSER_GLOBAL_ALLOWLIST)).toEqual([]);
  });

  it("still scans src/views/mount-extra.ts and other near names", () => {
    const files = {
      ...cleanFiles(),
      "../src/views/mount-extra.ts": "window;",
      "../src/views/mount.test.ts": "document;",
      "../src/views/sub/mount.ts": "HTMLCanvasElement;",
    };
    expect(checkBrowserGlobals(files, BROWSER_GLOBAL_ALLOWLIST)).toEqual([
      "src/views/mount-extra.ts mentions a browser global",
      "src/views/mount.test.ts mentions a browser global",
      "src/views/sub/mount.ts mentions a browser global",
    ]);
  });

  it("reports a missing path before a scanned file", () => {
    const files: Record<string, string> = { ...cleanFiles(), "../src/other.ts": "window;" };
    delete files["../src/views/canvas-adapter.ts"];
    const problems = checkBrowserGlobals(files, BROWSER_GLOBAL_ALLOWLIST);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("src/views/canvas-adapter.ts");
    expect(problems[1]).toBe("src/other.ts mentions a browser global");
  });
});
