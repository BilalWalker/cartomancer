import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { distancePointToSegment } from "../src/geometry.js";
import { parseMap } from "../src/map-loader.js";
import { loadValid, mapFileArbitrary, mapWithPointOnRoadArbitrary, pointArbitrary } from "./helpers/arbitraries.js";
import { isNoUsableRoad, snapToRoad } from "../src/snapping.js";
import type { EngineMap } from "../src/types.js";

const road = (id: string, fromNodeId: string, toNodeId: string) => ({
  id,
  fromNodeId,
  toNodeId,
  width: 6,
  kind: "main" as const,
});

function load(roads: unknown[], blockedAreas: unknown[] = []): EngineMap {
  const text = JSON.stringify({
    formatVersion: 1,
    nodes: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 100, y: 0 },
      { id: "c", x: 0, y: 40 },
      { id: "d", x: 100, y: 40 },
    ],
    roads,
    places: [],
    blockedAreas,
    props: [],
    style: { colors: {}, lineStyles: {} },
  });
  const result = parseMap(text);
  if (!("map" in result)) throw new Error("expected a map");
  return result.map;
}

describe("snapToRoad", () => {
  it("snaps to the nearest road", () => {
    const map = load([road("top", "a", "b"), road("bottom", "c", "d")]);
    const snapped = snapToRoad(map, { x: 30, y: 10 });
    expect(snapped).toEqual({ x: 30, y: 0, roadId: "top", distanceAlongRoad: 30 });
  });

  it("gives a tie to the lowest road id", () => {
    const map = load([road("z", "a", "b"), road("m", "c", "d")]);
    const snapped = snapToRoad(map, { x: 50, y: 20 });
    expect(isNoUsableRoad(snapped)).toBe(false);
    expect(snapped).toMatchObject({ roadId: "m" });
  });

  it("ignores a blocked road", () => {
    const lake = {
      id: "lake",
      kind: "water",
      polygon: [
        { x: 40, y: -5 },
        { x: 60, y: -5 },
        { x: 60, y: 5 },
        { x: 40, y: 5 },
      ],
    };
    const map = load([road("top", "a", "b"), road("bottom", "c", "d")], [lake]);
    const snapped = snapToRoad(map, { x: 50, y: 2 });
    expect(snapped).toMatchObject({ roadId: "bottom", x: 50, y: 40 });
  });

  it("returns a point already on a road unchanged", () => {
    const map = load([road("top", "a", "b")]);
    expect(snapToRoad(map, { x: 70, y: 0 })).toEqual({ x: 70, y: 0, roadId: "top", distanceAlongRoad: 70 });
  });

  it("returns a typed result when no road is usable", () => {
    const map = load([]);
    const result = snapToRoad(map, { x: 1, y: 1 });
    expect(isNoUsableRoad(result)).toBe(true);
    expect(result).toMatchObject({ reason: "no-usable-road" });
  });
});

describe("snapToRoad properties", () => {
  // Feature: engine-core, Property 7: Snapping finds the nearest usable point
  // **Validates: Requirements 7.2, 7.4, 7.5**
  it("snapped distance is at most the distance to every sampled point on every usable road", () => {
    fc.assert(
      fc.property(
        mapWithPointOnRoadArbitrary(),
        pointArbitrary(),
        ({ map }, point) => {
          const snapped = snapToRoad(map, point);
          if (isNoUsableRoad(snapped)) throw new Error("expected a usable road");
          const snappedDistance = Math.hypot(snapped.x - point.x, snapped.y - point.y);
          const byId = new Map(map.nodes.map((n) => [n.id, n]));
          for (const road of map.roads) {
            if (!map.usableRoadIds.has(road.id)) continue;
            const a = byId.get(road.fromNodeId)!;
            const b = byId.get(road.toNodeId)!;
            for (let i = 0; i <= 20; i++) {
              const t = i / 20;
              const sample = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
              const d = Math.hypot(sample.x - point.x, sample.y - point.y);
              expect(snappedDistance).toBeLessThanOrEqual(d + 1e-9);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: engine-core, Property 7: Snapping finds the nearest usable point
  // **Validates: Requirements 7.2, 7.4, 7.5**
  it("a point on a usable road snaps to itself within 0.001", () => {
    fc.assert(
      fc.property(mapWithPointOnRoadArbitrary(), ({ map, onRoad }) => {
        const snapped = snapToRoad(map, onRoad);
        if (isNoUsableRoad(snapped)) throw new Error("expected a usable road");
        expect(Math.hypot(snapped.x - onRoad.x, snapped.y - onRoad.y)).toBeLessThan(0.001);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: engine-core, Property 7: Snapping finds the nearest usable point
  // **Validates: Requirements 7.2, 7.4, 7.5**
  it("equally near roads always give the lowest road id, and the same point the same road", () => {
    fc.assert(
      fc.property(
        mapFileArbitrary().filter((file) => file.roads.length > 0),
        pointArbitrary(),
        (file, point) => {
          // Add a same-direction copy of the first road, with an id that sorts before all others.
          // Same direction makes the two distances bit-identical (a reversed copy rounds differently).
          const first = file.roads[0]!;
          const duplicate = { ...first, id: "!dup" };
          const map = loadValid({ ...file, roads: [...file.roads, duplicate] });
          const snapped = snapToRoad(map, point);
          if (isNoUsableRoad(snapped)) {
            expect(map.usableRoadIds.size).toBe(0);
            return;
          }
          expect(snapToRoad(map, point)).toEqual(snapped);

          const byId = new Map(map.nodes.map((n) => [n.id, n]));
          const distanceTo = (roadId: string): number => {
            const road = map.roads.find((r) => r.id === roadId)!;
            return distancePointToSegment(point, byId.get(road.fromNodeId)!, byId.get(road.toNodeId)!);
          };
          const best = distanceTo(snapped.roadId);
          for (const road of map.roads) {
            if (!map.usableRoadIds.has(road.id)) continue;
            const d = distanceTo(road.id);
            expect(d).toBeGreaterThanOrEqual(best);
            if (d === best) expect(snapped.roadId <= road.id).toBe(true);
          }
          // The duplicate is usable exactly when the original is, and ties with it.
          if (map.usableRoadIds.has(first.id)) {
            expect(map.usableRoadIds.has("!dup")).toBe(true);
            if (distanceTo(first.id) === best) expect(snapped.roadId <= "!dup").toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
