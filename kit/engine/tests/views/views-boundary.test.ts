/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

// Raw text of every file under src/views, read through Vite's glob import so
// the engine keeps an empty dependency list. Files that do not exist yet are
// simply absent, so the scan guards each later file as it is added.
const viewSources = import.meta.glob("../../src/views/**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const packageText = import.meta.glob("../../package.json", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

// The only Views files allowed to reach browser services.
const BROWSER_FILES = ["canvas-adapter.ts", "input-binding.ts", "mount.ts"];

function fileName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1];
}

const scanned = Object.entries(viewSources).filter(
  ([path]) => !BROWSER_FILES.includes(fileName(path)),
);

describe("views boundary", () => {
  it("finds at least one Views file to scan", () => {
    expect(scanned.length).toBeGreaterThan(0);
  });

  it("uses no browser global outside the three browser-facing files", () => {
    const pattern =
      /\b(window|document|HTMLCanvasElement|ResizeObserver|requestAnimationFrame|matchMedia)\b/;
    for (const [path, text] of scanned) {
      expect(pattern.test(text), `${path} mentions a browser global`).toBe(false);
    }
  });

  it("mentions no application concept in any scanned Views file", () => {
    const pattern = /\b(car|mission|hospital|room)\b/i;
    for (const [path, text] of scanned) {
      expect(pattern.test(text), `${path} mentions an application concept`).toBe(false);
    }
  });

  it("keeps the engine package free of runtime dependencies", () => {
    const pkg = JSON.parse(Object.values(packageText)[0]);
    expect(pkg).not.toHaveProperty("dependencies");
  });
});
