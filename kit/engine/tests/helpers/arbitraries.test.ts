import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { loadValid, mapFileArbitrary } from "./arbitraries.js";

describe("map arbitraries", () => {
  it("every generated file loads without errors", () => {
    fc.assert(
      fc.property(mapFileArbitrary(), (file) => {
        const map = loadValid(file);
        expect(map.nodes.length).toBe(file.nodes.length);
      }),
      { numRuns: 100 },
    );
  });

  it("loadValid throws when the file does not load", () => {
    const bad = { formatVersion: 1, nodes: [], roads: [] } as never;
    expect(() => loadValid(bad)).toThrow();
  });
});
