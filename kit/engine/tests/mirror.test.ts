import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { mirrorHeading, mirrorMap } from "../src/mirror.js";
import type { EngineMap } from "../src/types.js";
import { loadValid, mapFileArbitrary } from "./helpers/arbitraries.js";

const sample: EngineMap = {
  formatVersion: 1,
  nodes: [
    { id: "a", x: 10, y: 5 },
    { id: "b", x: -20, y: 7 },
  ],
  roads: [{ id: "r1", fromNodeId: "a", toNodeId: "b", width: 6, kind: "main", oneWay: true }],
  places: [{ id: "p1", name: "Bank", category: "shop", x: 4, y: 9 }],
  blockedAreas: [
    {
      id: "w1",
      kind: "water",
      polygon: [
        { x: 1, y: 1 },
        { x: -3, y: 2 },
        { x: 0, y: 6 },
      ],
    },
  ],
  props: [{ id: "t1", kind: "tree", x: 8, y: 2, width: 3, height: 4, rotationDegrees: 30 }],
  backgroundPicture: { ref: "plan.png", scale: 2, opacity: 0.5 },
  style: { colors: { road: "#333" }, lineStyles: { road: { width: 2 } } },
  usableRoadIds: new Set(["r1"]),
  blockedRoads: [{ roadId: "r2", blockedAreaId: "w1" }],
};

describe("mirrorMap", () => {
  it("negates x of nodes, places, props and blocked area points", () => {
    const m = mirrorMap(sample);
    expect(m.nodes).toEqual([
      { id: "a", x: -10, y: 5 },
      { id: "b", x: 20, y: 7 },
    ]);
    expect(m.places[0]).toEqual({ id: "p1", name: "Bank", category: "shop", x: -4, y: 9 });
    expect(m.blockedAreas[0]?.polygon).toEqual([
      { x: -1, y: 1 },
      { x: 3, y: 2 },
      { x: 0, y: 6 },
    ]);
    expect(m.props[0]).toEqual({
      id: "t1", kind: "tree", x: -8, y: 2, width: 3, height: 4, rotationDegrees: -30,
    });
  });

  it("leaves roads, background, style and derived fields unchanged", () => {
    const m = mirrorMap(sample);
    expect(m.roads).toEqual(sample.roads);
    expect(m.backgroundPicture).toEqual(sample.backgroundPicture);
    expect(m.style).toEqual(sample.style);
    expect(m.usableRoadIds).toEqual(sample.usableRoadIds);
    expect(m.blockedRoads).toEqual(sample.blockedRoads);
  });

  it("does not change the input map", () => {
    mirrorMap(sample);
    expect(sample.nodes[0]?.x).toBe(10);
  });
});

describe("mirrorHeading", () => {
  it("maps 0 to 180 and 180 to 0", () => {
    expect(mirrorHeading(0)).toBe(180);
    expect(mirrorHeading(180)).toBe(0);
  });

  it("keeps straight down and straight up", () => {
    expect(mirrorHeading(90)).toBe(90);
    expect(mirrorHeading(-90)).toBe(-90);
  });
});

// Feature: engine-core, Property 26: Mirroring twice restores the original map
// **Validates: Requirements 17.4, 17.5**
describe("Property 26: mirroring twice restores the original map", () => {
  // Headings stay in (-180, 180], the range mirrorHeading returns.
  const headingArbitrary = fc.oneof(
    fc.integer({ min: -179, max: 180 }),
    fc.double({ min: -179.5, max: 180, noNaN: true }),
  );

  it("mirrorMap twice equals the original loaded map", () => {
    let withContent = 0;
    fc.assert(
      fc.property(mapFileArbitrary(), (file) => {
        const map = loadValid(file);
        const twice = mirrorMap(mirrorMap(map));
        expect(twice).toEqual(map);
        if (map.nodes.length > 0 && map.nodes.some((n) => n.x !== 0)) withContent++;
      }),
      { numRuns: 100 },
    );
    expect(withContent).toBeGreaterThan(0);
  });

  it("mirrorMap changes the map when it has a node away from x = 0", () => {
    let changed = 0;
    fc.assert(
      fc.property(mapFileArbitrary(), (file) => {
        const map = loadValid(file);
        if (map.nodes.some((n) => n.x !== 0)) {
          expect(mirrorMap(map)).not.toEqual(map);
          changed++;
        }
      }),
      { numRuns: 100 },
    );
    expect(changed).toBeGreaterThan(0);
  });

  it("mirrorHeading twice equals the heading", () => {
    fc.assert(
      fc.property(headingArbitrary, (h) => {
        expect(mirrorHeading(mirrorHeading(h))).toBeCloseTo(h, 9);
      }),
      { numRuns: 200 },
    );
  });
});
