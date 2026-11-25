import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { distancePointToSegment } from "../../src/geometry.js";
import {
  SMALL_MAP_MAX_NODES,
  gridMapFileArbitrary,
  gridRouteArbitrary,
  loadValid,
  mapFileArbitrary,
  mapWithPointOnRoadArbitrary,
  pointArbitrary,
  smallMapFileArbitrary,
  smallMapRouteArbitrary,
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

  it("small maps have at most 12 nodes, load, and include one-way roads and blocked areas over many runs", () => {
    let oneWay = 0;
    let blocked = 0;
    fc.assert(
      fc.property(smallMapFileArbitrary(), (file) => {
        expect(file.nodes.length).toBeLessThanOrEqual(SMALL_MAP_MAX_NODES);
        expect(file.nodes.length).toBeGreaterThanOrEqual(2);
        const map = loadValid(file);
        if (file.roads.some((r) => r.oneWay === true)) oneWay++;
        if (map.blockedRoads.length > 0) blocked++;
      }),
      { numRuns: 200 },
    );
    expect(oneWay).toBeGreaterThan(0);
    expect(blocked).toBeGreaterThan(0);
  });

  it("grid maps load and every road has the same length", () => {
    fc.assert(
      fc.property(gridMapFileArbitrary(), (file) => {
        const map = loadValid(file);
        expect(map.usableRoadIds.size).toBe(file.roads.length);
        for (const road of file.roads) {
          const a = file.nodes.find((n) => n.id === road.fromNodeId)!;
          const b = file.nodes.find((n) => n.id === road.toNodeId)!;
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBe(10);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("route cases give finite starts and destinations that name existing places or points", () => {
    fc.assert(
      fc.property(smallMapRouteArbitrary(), ({ map, start, destination }) => {
        expect(map.nodes.length).toBeLessThanOrEqual(SMALL_MAP_MAX_NODES);
        expect(Number.isFinite(start.x + start.y + start.headingDegrees)).toBe(true);
        if ("placeId" in destination) {
          expect(map.places.some((p) => p.id === destination.placeId)).toBe(true);
        } else {
          expect(Number.isFinite(destination.point.x + destination.point.y)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
    fc.assert(
      fc.property(gridRouteArbitrary(), ({ map }) => map.nodes.length <= 16),
      { numRuns: 50 },
    );
  });

  it("loadValid throws when the file does not load", () => {
    const bad = { formatVersion: 1, nodes: [], roads: [] } as never;
    expect(() => loadValid(bad)).toThrow();
  });
});
