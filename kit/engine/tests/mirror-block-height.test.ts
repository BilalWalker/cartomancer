import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { mirrorMap } from "../src/mirror.js";
import { loadValid, mapFileArbitrary } from "./helpers/arbitraries.js";

describe("mirrorMap with blockHeight", () => {
  // Feature: map-views, Property 22: Mirroring keeps blockHeight and changes nothing else
  // Validates: Requirements 23.8
  it("keeps every prop's blockHeight and changes only x and rotation of props", () => {
    let withHeight = 0;
    let withoutHeight = 0;

    fc.assert(
      fc.property(mapFileArbitrary(10), (file) => {
        const original = loadValid(file);
        const mirrored = mirrorMap(original);

        expect(mirrored.props.length).toBe(original.props.length);
        original.props.forEach((prop, i) => {
          const m = mirrored.props[i]!;
          if ("blockHeight" in prop) {
            withHeight++;
            expect(m.blockHeight).toBe(prop.blockHeight);
          } else {
            withoutHeight++;
            expect("blockHeight" in m).toBe(false);
          }
          expect(m).toEqual({
            ...prop,
            x: 0 - prop.x,
            rotationDegrees: 0 - prop.rotationDegrees,
          });
        });

        // Nothing else about props changes: mirroring back restores the map.
        expect(mirrorMap(mirrored)).toEqual(original);
      }),
      { numRuns: 200 },
    );

    expect(withHeight).toBeGreaterThan(0);
    expect(withoutHeight).toBeGreaterThan(0);
  });

  it("keeps blockHeight 0 and a prop without blockHeight in a hand-written example", () => {
    const base = { id: "a", kind: "building", x: 5, y: 1, width: 2, height: 3, rotationDegrees: 10 };
    const file = {
      formatVersion: 1,
      nodes: [],
      roads: [],
      places: [],
      blockedAreas: [],
      style: { colors: {}, lineStyles: {} },
      props: [
        { ...base, id: "p1", blockHeight: 0 },
        { ...base, id: "p2" },
      ],
    };
    const mirrored = mirrorMap(loadValid(file as never));
    expect(mirrored.props[0]).toEqual({ ...base, id: "p1", x: -5, rotationDegrees: -10, blockHeight: 0 });
    expect("blockHeight" in mirrored.props[1]!).toBe(false);
  });
});
