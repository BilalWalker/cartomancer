import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseMap } from "../src/map-loader.js";
import { saveMap } from "../src/map-saver.js";
import { loadValid, mapFileArbitrary } from "./helpers/arbitraries.js";

describe("map saver round trip", () => {
  // Feature: engine-core, Property 5: Map round trip
  // Validates: Requirements 6.1, 6.2, 6.3 (also 6.5)
  it("loading saveMap(map) gives a map equal to the original", () => {
    const roadKinds = new Set<string>();
    const areaKinds = new Set<string>();
    let withBackground = 0;
    let withoutBackground = 0;
    let withProps = 0;

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

        for (const r of original.roads) roadKinds.add(r.kind);
        for (const a of original.blockedAreas) areaKinds.add(a.kind);
        if (original.backgroundPicture !== undefined) withBackground++;
        else withoutBackground++;
        if (original.props.length > 0) withProps++;
      }),
      { numRuns: 200 },
    );

    expect([...roadKinds].sort()).toEqual(["corridor", "footpath", "main", "side"]);
    expect([...areaKinds].sort()).toEqual(["mountain", "wall", "water"]);
    expect(withBackground).toBeGreaterThan(0);
    expect(withoutBackground).toBeGreaterThan(0);
    expect(withProps).toBeGreaterThan(0);
  });
});
