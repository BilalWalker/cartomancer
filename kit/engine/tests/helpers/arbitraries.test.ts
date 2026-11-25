import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { distancePointToSegment } from "../../src/geometry.js";
import {
  loadValid,
  mapFileArbitrary,
  mapWithPointOnRoadArbitrary,
  pointArbitrary,
} from "./arbitraries.js";

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

  it("points constructed on a road lie on that usable road", () => {
    fc.assert(
      fc.property(mapWithPointOnRoadArbitrary(), ({ map, roadId, onRoad }) => {
        expect(map.usableRoadIds.has(roadId)).toBe(true);
        const road = map.roads.find((r) => r.id === roadId)!;
        const a = map.nodes.find((n) => n.id === road.fromNodeId)!;
        const b = map.nodes.find((n) => n.id === road.toNodeId)!;
        expect(distancePointToSegment(onRoad, a, b)).toBeLessThan(1e-9);
      }),
      { numRuns: 100 },
    );
  });

  it("arbitrary points are finite", () => {
    fc.assert(
      fc.property(pointArbitrary(), (p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
      { numRuns: 100 },
    );
  });

  it("loadValid throws when the file does not load", () => {
    const bad = { formatVersion: 1, nodes: [], roads: [] } as never;
    expect(() => loadValid(bad)).toThrow();
  });
});
