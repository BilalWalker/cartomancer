import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseMap } from "../src/map-loader.js";
import { saveMap } from "../src/map-saver.js";
import { loadValid, mapFileArbitrary } from "./helpers/arbitraries.js";

describe("map saver round trip with blockHeight", () => {
  // Feature: map-views, Property 21: Save and load round trip keeps blockHeight
  // Validates: Requirements 23.7
  it("loading saveMap(map) keeps blockHeight on props that have it and adds none to props that lack it", () => {
    let withHeight = 0;
    let withoutHeight = 0;

    fc.assert(
      fc.property(mapFileArbitrary(10), (file) => {
        const original = loadValid(file);
        const result = parseMap(saveMap(original));
        if (!("map" in result)) {
          throw new Error(
            `Saved map did not load: ${result.errors.map((e) => e.message).join("; ")}`,
          );
        }
        expect(result.map).toEqual(original);
        expect(result.map.props.length).toBe(original.props.length);
        original.props.forEach((prop, i) => {
          const loaded = result.map.props[i]!;
          if ("blockHeight" in prop) {
            withHeight++;
            expect(loaded.blockHeight).toBe(prop.blockHeight);
          } else {
            withoutHeight++;
            expect("blockHeight" in loaded).toBe(false);
          }
        });
      }),
      { numRuns: 200 },
    );

    expect(withHeight).toBeGreaterThan(0);
    expect(withoutHeight).toBeGreaterThan(0);
  });
});
