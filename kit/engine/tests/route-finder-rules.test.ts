import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseMap } from "../src/map-loader.js";
import { segmentCrossesPolygon } from "../src/geometry.js";
import { findRoute } from "../src/route-finder.js";
import { isNoUsableRoad, snapToRoad } from "../src/snapping.js";
import type { EngineMap } from "../src/types.js";
import { gridRouteArbitrary, smallMapRouteArbitrary } from "./helpers/arbitraries.js";

function load(roads: unknown[], blockedAreas: unknown[] = []): EngineMap {
  const text = JSON.stringify({
    formatVersion: 1,
    nodes: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 100, y: 0 },
    ],
    roads,
    places: [{ id: "shop", name: "Shop", category: "store", x: 40, y: 10 }],
    blockedAreas,
    props: [],
    style: { colors: {}, lineStyles: {} },
  });
  const result = parseMap(text);
  if (!("map" in result)) throw new Error("expected a map");
  return result.map;
}

const road = { id: "r1", fromNodeId: "a", toNodeId: "b", width: 6, kind: "main" };

describe("findRoute entry cases", () => {
  it("names a missing place in the answer", () => {
    const result = findRoute(load([road]), { x: 0, y: 0 }, { placeId: "ghost" });
    expect(result).toMatchObject({ reason: "missing-place", placeId: "ghost" });
    expect("message" in result && result.message).toContain("ghost");
    expect("message" in result && result.message).not.toContain("at ");
  });

  it("says there is no usable road when the map has none", () => {
    const result = findRoute(load([]), { x: 0, y: 0 }, { point: { x: 50, y: 0 } });
    expect(result).toMatchObject({ reason: "no-usable-road" });
    expect("message" in result && result.message).not.toContain("at ");
  });

  it("says there is no usable road when every road is blocked", () => {
    const wall = {
      id: "w",
      kind: "wall",
      polygon: [
        { x: 40, y: -5 },
        { x: 60, y: -5 },
        { x: 60, y: 5 },
        { x: 40, y: 5 },
      ],
    };
    const result = findRoute(load([road], [wall]), { x: 0, y: 0 }, { point: { x: 10, y: 0 } });
    expect(result).toMatchObject({ reason: "no-usable-road" });
  });

  it("gives a zero-length route when both ends snap to the same point", () => {
    const result = findRoute(load([road]), { x: 30, y: 8 }, { point: { x: 30, y: -12 } });
    expect(result).toEqual({
      parts: [],
      lengthWorldUnits: 0,
      destination: { point: { x: 30, y: -12 } },
    });
  });

  it("gives a zero-length route to a place that snaps to the start", () => {
    const result = findRoute(load([road]), { x: 40, y: 0 }, { placeId: "shop" });
    expect(result).toMatchObject({ lengthWorldUnits: 0, parts: [] });
  });

  it("returns the temporary separate-parts answer when the parts are not joined", () => {
    const text = JSON.stringify({
      formatVersion: 1,
      nodes: [
        { id: "a", x: 0, y: 0 },
        { id: "b", x: 100, y: 0 },
        { id: "c", x: 0, y: 50 },
        { id: "d", x: 100, y: 50 },
      ],
      roads: [
        { id: "r1", fromNodeId: "a", toNodeId: "b", width: 6, kind: "main" },
        { id: "r2", fromNodeId: "c", toNodeId: "d", width: 6, kind: "main" },
      ],
      places: [],
      blockedAreas: [],
      props: [],
      style: { colors: {}, lineStyles: {} },
    });
    const loaded = parseMap(text);
    if (!("map" in loaded)) throw new Error("expected a map");
    const result = findRoute(loaded.map, { x: 10, y: 0 }, { point: { x: 90, y: 50 } });
    expect(result).toMatchObject({ reason: "separate-parts" });
    expect("message" in result && result.message).not.toContain("at ");
  });
});

describe("points inside roads", () => {
  const oneWay = { ...road, oneWay: true };

  it("routes between two points on the same two-way road in both directions", () => {
    const map = load([road]);
    expect(findRoute(map, { x: 20, y: 0 }, { point: { x: 70, y: 0 } })).toMatchObject({
      lengthWorldUnits: 50,
      parts: [{ roadId: "r1", direction: "forward", start: { x: 20, y: 0 }, end: { x: 70, y: 0 } }],
    });
    expect(findRoute(map, { x: 70, y: 0 }, { point: { x: 20, y: 0 } })).toMatchObject({
      lengthWorldUnits: 50,
      parts: [{ roadId: "r1", direction: "backward", start: { x: 70, y: 0 }, end: { x: 20, y: 0 } }],
    });
  });

  it("leaves a one-way road from a start inside it only in the allowed direction", () => {
    const map = load([oneWay]);
    expect(findRoute(map, { x: 30, y: 0 }, { point: { x: 100, y: 0 } })).toMatchObject({
      lengthWorldUnits: 70,
      parts: [{ roadId: "r1", direction: "forward", start: { x: 30, y: 0 }, end: { x: 100, y: 0 } }],
    });
    expect("parts" in findRoute(map, { x: 30, y: 0 }, { point: { x: 0, y: 0 } })).toBe(false);
  });

  it("enters a one-way road to a destination inside it only in the allowed direction", () => {
    const map = load([oneWay]);
    expect(findRoute(map, { x: 0, y: 0 }, { point: { x: 60, y: 0 } })).toMatchObject({
      lengthWorldUnits: 60,
      parts: [{ roadId: "r1", direction: "forward", start: { x: 0, y: 0 }, end: { x: 60, y: 0 } }],
    });
    expect("parts" in findRoute(map, { x: 100, y: 0 }, { point: { x: 60, y: 0 } })).toBe(false);
  });

  it("gives no route against a one-way road when there is no way round", () => {
    const result = findRoute(load([oneWay]), { x: 70, y: 0 }, { point: { x: 20, y: 0 } });
    expect("parts" in result).toBe(false);
  });
});

describe("zero-length route property", () => {
  // Feature: engine-core, Property 9: Same-point start and destination give a zero-length route
  // **Validates: Requirements 8.4**
  it("a start and a destination that snap to the same point give a route of length zero", () => {
    let checked = 0;
    fc.assert(
      fc.property(fc.oneof(smallMapRouteArbitrary(), gridRouteArbitrary()), ({ map, start }) => {
        const snapped = snapToRoad(map, start);
        if (isNoUsableRoad(snapped)) return;
        checked++;

        // Destination 1: the very same raw point as the start.
        const sameRaw = findRoute(map, start, { point: { x: start.x, y: start.y } });
        // Destination 2: the snapped point itself, which snaps to itself.
        const sameSnapped = findRoute(map, start, { point: { x: snapped.x, y: snapped.y } });

        for (const result of [sameRaw, sameSnapped]) {
          expect("parts" in result).toBe(true);
          if (!("parts" in result)) return;
          expect(result.lengthWorldUnits).toBe(0);
          expect(result.parts).toHaveLength(0);
        }
      }),
      { numRuns: 200 },
    );
    expect(checked).toBeGreaterThan(0);
  });
});

describe("route rules property", () => {
  // Feature: engine-core, Property 13: Routes never break the usable-road or one-way rules
  // **Validates: Requirements 5.3, 11.1, 11.2, 11.3, 11.4, 11.5**
  it("no route uses a blocked road or travels a one-way road against its direction", () => {
    const pointOn = (map: EngineMap, pick: number, fraction: number) => {
      const oneWays = map.roads.filter((r) => r.oneWay === true);
      const pool = oneWays.length > 0 ? oneWays : map.roads;
      if (pool.length === 0) return undefined;
      const road = pool[pick % pool.length]!;
      const from = map.nodes.find((n) => n.id === road.fromNodeId)!;
      const to = map.nodes.find((n) => n.id === road.toNodeId)!;
      return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction };
    };
    const cases = fc
      .tuple(
        fc.oneof(smallMapRouteArbitrary(), smallMapRouteArbitrary(), gridRouteArbitrary()),
        fc.nat(50),
        fc.nat(50),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.boolean(),
        fc.boolean(),
      )
      .map(([base, pickA, pickB, fracA, fracB, startOnRoad, endOnRoad]) => {
        const s = startOnRoad ? pointOn(base.map, pickA, fracA) : undefined;
        const e = endOnRoad ? pointOn(base.map, pickB, fracB) : undefined;
        return {
          map: base.map,
          start: s === undefined ? base.start : { ...base.start, x: s.x, y: s.y },
          destination: e === undefined ? base.destination : { point: e },
        };
      });

    let mapsWithBlocked = 0;
    let mapsWithOneWay = 0;
    let routesFound = 0;
    let routesOnOneWay = 0;
    let routesOnPartialOneWay = 0;
    const EPS = 1e-6;

    fc.assert(
      fc.property(cases, ({ map, start, destination }) => {
        const nodeAt = (id: string) => map.nodes.find((n) => n.id === id)!;
        const blockedIds = new Set<string>();
        // Independent blocked check: geometry only, not the loader's list.
        for (const road of map.roads) {
          const a = nodeAt(road.fromNodeId);
          const b = nodeAt(road.toNodeId);
          if (map.blockedAreas.some((area) => segmentCrossesPolygon(a, b, area.polygon))) {
            blockedIds.add(road.id);
          }
        }
        if (blockedIds.size > 0) mapsWithBlocked++;
        if (map.roads.some((r) => r.oneWay === true)) mapsWithOneWay++;

        const result = findRoute(map, start, destination);
        if (!("parts" in result)) return;
        routesFound++;

        for (const [index, part] of result.parts.entries()) {
          const road = map.roads.find((r) => r.id === part.roadId);
          expect(road, `road ${part.roadId} exists`).toBeDefined();
          if (road === undefined) return;
          expect(blockedIds.has(road.id), `road ${road.id} is blocked`).toBe(false);
          expect(map.usableRoadIds.has(road.id)).toBe(true);
          expect(map.blockedRoads.some((b) => b.roadId === road.id)).toBe(false);

          const from = nodeAt(road.fromNodeId);
          const to = nodeAt(road.toNodeId);
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const len = Math.hypot(dx, dy);
          const along = (p: { x: number; y: number }) => ((p.x - from.x) * dx + (p.y - from.y) * dy) / len;
          const travelled = along(part.end) - along(part.start);

          if (road.oneWay === true) {
            routesOnOneWay++;
            if (index === 0 || index === result.parts.length - 1) {
              const partial =
                (part.start.x !== from.x || part.start.y !== from.y) &&
                (part.start.x !== to.x || part.start.y !== to.y);
              const partialEnd =
                (part.end.x !== from.x || part.end.y !== from.y) &&
                (part.end.x !== to.x || part.end.y !== to.y);
              if (partial || partialEnd) routesOnPartialOneWay++;
            }
            expect(part.direction, `one-way ${road.id} direction field`).toBe("forward");
            expect(travelled, `one-way ${road.id} geometry`).toBeGreaterThanOrEqual(-EPS);
          }
          // Direction field and geometry agree on every road.
          if (Math.abs(travelled) > EPS) {
            expect(part.direction).toBe(travelled > 0 ? "forward" : "backward");
          }
        }
      }),
      { numRuns: 300 },
    );

    expect(mapsWithBlocked).toBeGreaterThan(0);
    expect(mapsWithOneWay).toBeGreaterThan(0);
    expect(routesFound).toBeGreaterThan(0);
    expect(routesOnOneWay).toBeGreaterThan(0);
    expect(routesOnPartialOneWay).toBeGreaterThan(0);
  });
});

describe("determinism property", () => {
  // Feature: engine-core, Property 10: Route finding is deterministic
  // **Validates: Requirements 8.5**
  it("two calls with the same inputs return equal routes, also on grids with equal-length alternatives", () => {
    let routesFound = 0;
    fc.assert(
      fc.property(
        fc.oneof(gridRouteArbitrary(), gridRouteArbitrary(), smallMapRouteArbitrary()),
        ({ map, start, destination }) => {
          const first = findRoute(map, start, destination);
          const second = findRoute(map, start, destination);
          expect(second).toEqual(first);
          if ("parts" in first) routesFound++;
        },
      ),
      { numRuns: 200 },
    );
    expect(routesFound).toBeGreaterThan(0);
  });
});
