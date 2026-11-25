import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { distancePointToSegment } from "../src/geometry.js";
import { parseMap } from "../src/map-loader.js";
import { findRoute } from "../src/route-finder.js";
import { isNoUsableRoad, snapToRoad } from "../src/snapping.js";
import type { EngineMap, NoWayResult, Route } from "../src/types.js";
import { gridRouteArbitrary, smallMapRouteArbitrary } from "./helpers/arbitraries.js";

function load(nodes: [string, number, number][], roads: [string, string, string, boolean?][]): EngineMap {
  const text = JSON.stringify({
    formatVersion: 1,
    nodes: nodes.map(([id, x, y]) => ({ id, x, y })),
    roads: roads.map(([id, fromNodeId, toNodeId, oneWay]) => ({
      id,
      fromNodeId,
      toNodeId,
      width: 6,
      kind: "side",
      ...(oneWay ? { oneWay: true } : {}),
    })),
    places: [],
    blockedAreas: [],
    props: [],
    style: { colors: {}, lineStyles: {} },
  });
  const result = parseMap(text);
  if (!("map" in result)) throw new Error("expected a map");
  return result.map;
}

function asRoute(result: Route | NoWayResult): Route {
  if (!("parts" in result)) throw new Error(`expected a route, got: ${result.message}`);
  return result;
}

describe("shortest path between nodes", () => {
  it("crosses a 3 by 3 grid corner to corner in four steps", () => {
    const nodes: [string, number, number][] = [];
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) nodes.push([`n${row}${col}`, col * 10, row * 10]);
    const roads: [string, string, string][] = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 2; col++) roads.push([`h${row}${col}`, `n${row}${col}`, `n${row}${col + 1}`]);
    }
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3; col++) roads.push([`v${row}${col}`, `n${row}${col}`, `n${row + 1}${col}`]);
    }
    const route = asRoute(findRoute(load(nodes, roads), { x: 0, y: 0 }, { point: { x: 20, y: 20 } }));
    expect(route.parts).toHaveLength(4);
    expect(route.lengthWorldUnits).toBeCloseTo(40, 9);
    expect(route.parts[0].start).toEqual({ x: 0, y: 0 });
    expect(route.parts[3].end).toEqual({ x: 20, y: 20 });
    for (let i = 1; i < route.parts.length; i++) expect(route.parts[i].start).toEqual(route.parts[i - 1].end);
  });

  it("goes round a one-way road that points the wrong way", () => {
    const map = load(
      [
        ["a", 0, 0],
        ["b", 10, 0],
        ["c", 0, 10],
        ["d", 10, 10],
      ],
      [
        ["r1", "b", "a", true],
        ["r2", "a", "c"],
        ["r3", "c", "d"],
        ["r4", "d", "b"],
      ],
    );
    const detour = asRoute(findRoute(map, { x: 0, y: 0 }, { point: { x: 10, y: 0 } }));
    expect(detour.parts.map((part) => part.roadId)).toEqual(["r2", "r3", "r4"]);
    expect(detour.lengthWorldUnits).toBeCloseTo(30, 9);

    const direct = asRoute(findRoute(map, { x: 10, y: 0 }, { point: { x: 0, y: 0 } }));
    expect(direct.parts.map((part) => part.roadId)).toEqual(["r1"]);
    expect(direct.parts[0].direction).toBe("forward");
  });

  it("reports backward direction on a two-way road travelled against its nodes", () => {
    const map = load(
      [
        ["a", 0, 0],
        ["b", 10, 0],
      ],
      [["r1", "a", "b"]],
    );
    const route = asRoute(findRoute(map, { x: 10, y: 0 }, { point: { x: 0, y: 0 } }));
    expect(route.parts).toEqual([
      { roadId: "r1", direction: "backward", start: { x: 10, y: 0 }, end: { x: 0, y: 0 } },
    ]);
  });

  it("always gives the same answer for two equal routes, using the lowest road id first", () => {
    const map = load(
      [
        ["a", 0, 0],
        ["b", 10, 0],
        ["c", 10, 10],
        ["d", 0, 10],
      ],
      [
        ["r1", "a", "b"],
        ["r2", "b", "c"],
        ["r3", "a", "d"],
        ["r4", "d", "c"],
      ],
    );
    const first = findRoute(map, { x: 0, y: 0 }, { point: { x: 10, y: 10 } });
    for (let i = 0; i < 20; i++) expect(findRoute(map, { x: 0, y: 0 }, { point: { x: 10, y: 10 } })).toEqual(first);
    expect(asRoute(first).parts.map((part) => part.roadId)).toEqual(["r1", "r2"]);
  });

  it("goes round when both points are on the same one-way road and the destination is behind", () => {
    // Square a(0,0) -> b(10,0) one-way, then b -> d(10,10) -> c(0,10) -> a.
    const map = load(
      [
        ["a", 0, 0],
        ["b", 10, 0],
        ["c", 0, 10],
        ["d", 10, 10],
      ],
      [
        ["r1", "a", "b", true],
        ["r2", "b", "d"],
        ["r3", "d", "c"],
        ["r4", "c", "a"],
      ],
    );
    const forward = asRoute(findRoute(map, { x: 2, y: 0 }, { point: { x: 8, y: 0 } }));
    expect(forward.parts).toEqual([{ roadId: "r1", direction: "forward", start: { x: 2, y: 0 }, end: { x: 8, y: 0 } }]);

    const round = asRoute(findRoute(map, { x: 8, y: 0 }, { point: { x: 2, y: 0 } }));
    expect(round.parts.map((part) => part.roadId)).toEqual(["r1", "r2", "r3", "r4", "r1"]);
    expect(round.parts[0].start).toEqual({ x: 8, y: 0 });
    expect(round.parts[0].end).toEqual({ x: 10, y: 0 });
    expect(round.parts[4].start).toEqual({ x: 0, y: 0 });
    expect(round.parts[4].end).toEqual({ x: 2, y: 0 });
    expect(round.lengthWorldUnits).toBeCloseTo(2 + 10 + 10 + 10 + 2, 9);
    for (let i = 1; i < round.parts.length; i++) expect(round.parts[i].start).toEqual(round.parts[i - 1].end);
  });

  it("starts inside a one-way road and ends inside another road", () => {
    const map = load(
      [
        ["a", 0, 0],
        ["b", 10, 0],
        ["c", 20, 0],
      ],
      [
        ["r1", "a", "b", true],
        ["r2", "b", "c"],
      ],
    );
    const route = asRoute(findRoute(map, { x: 4, y: 0 }, { point: { x: 15, y: 0 } }));
    expect(route.parts).toEqual([
      { roadId: "r1", direction: "forward", start: { x: 4, y: 0 }, end: { x: 10, y: 0 } },
      { roadId: "r2", direction: "forward", start: { x: 10, y: 0 }, end: { x: 15, y: 0 } },
    ]);
    expect(route.lengthWorldUnits).toBeCloseTo(11, 9);
  });

  it("ends inside a one-way road that can only be entered from its start", () => {
    const map = load(
      [
        ["a", 0, 0],
        ["b", 10, 0],
        ["c", 10, 10],
      ],
      [
        ["r1", "a", "b", true],
        ["r2", "b", "c"],
        ["r3", "c", "a"],
      ],
    );
    const route = asRoute(findRoute(map, { x: 10, y: 10 }, { point: { x: 6, y: 0 } }));
    expect(route.parts.map((part) => part.roadId)).toEqual(["r3", "r1"]);
    expect(route.parts[1].end).toEqual({ x: 6, y: 0 });
    expect(route.lengthWorldUnits).toBeCloseTo(Math.hypot(10, 10) + 6, 9);
  });

  it("still returns no route when the parts are separate", () => {
    const map = load(
      [
        ["a", 0, 0],
        ["b", 10, 0],
        ["c", 50, 0],
        ["d", 60, 0],
      ],
      [
        ["r1", "a", "b"],
        ["r2", "c", "d"],
      ],
    );
    const result = findRoute(map, { x: 0, y: 0 }, { point: { x: 60, y: 0 } });
    expect("parts" in result).toBe(false);
  });
});

describe("route chain property", () => {
  const TOLERANCE = 1e-6;

  // Feature: engine-core, Property 8: A returned route is an unbroken chain of usable roads
  // **Validates: Requirements 8.1, 8.2, 8.6, 8.7**
  it("every returned route is an unbroken chain of usable roads from the snapped start to the snapped destination", () => {
    let routesFound = 0;
    let cases = 0;
    const cases$ = fc.oneof(smallMapRouteArbitrary(), gridRouteArbitrary());
    fc.assert(
      fc.property(cases$, ({ map, start, destination }) => {
        cases++;
        const result = findRoute(map, start, destination);
        if (!("parts" in result)) return;
        routesFound++;

        const target =
          "placeId" in destination
            ? map.places.find((place) => place.id === destination.placeId)!
            : destination.point;
        const snappedStart = snapToRoad(map, start);
        const snappedEnd = snapToRoad(map, target);
        expect(isNoUsableRoad(snappedStart)).toBe(false);
        expect(isNoUsableRoad(snappedEnd)).toBe(false);
        if (isNoUsableRoad(snappedStart) || isNoUsableRoad(snappedEnd)) return;

        if (result.parts.length === 0) {
          // A zero-length route: both ends snap to the same point.
          expect(Math.hypot(snappedStart.x - snappedEnd.x, snappedStart.y - snappedEnd.y)).toBeLessThanOrEqual(1e-9);
          return;
        }

        const first = result.parts[0]!;
        const last = result.parts[result.parts.length - 1]!;
        expect(Math.hypot(first.start.x - snappedStart.x, first.start.y - snappedStart.y)).toBeLessThanOrEqual(TOLERANCE);
        expect(Math.hypot(last.end.x - snappedEnd.x, last.end.y - snappedEnd.y)).toBeLessThanOrEqual(TOLERANCE);

        const nodes = new Map(map.nodes.map((node) => [node.id, node]));
        const roads = new Map(map.roads.map((road) => [road.id, road]));
        for (let i = 0; i < result.parts.length; i++) {
          const part = result.parts[i]!;
          if (i > 0) {
            const previous = result.parts[i - 1]!;
            expect(Math.hypot(part.start.x - previous.end.x, part.start.y - previous.end.y)).toBeLessThanOrEqual(TOLERANCE);
          }
          const road = roads.get(part.roadId);
          expect(road).toBeDefined();
          expect(map.usableRoadIds.has(part.roadId)).toBe(true);
          const a = nodes.get(road!.fromNodeId)!;
          const b = nodes.get(road!.toNodeId)!;
          expect(distancePointToSegment(part.start, a, b)).toBeLessThanOrEqual(TOLERANCE);
          expect(distancePointToSegment(part.end, a, b)).toBeLessThanOrEqual(TOLERANCE);
        }
      }),
      { numRuns: 300 },
    );
    // Non-vacuity: routes were found in a good share of the cases.
    expect(routesFound).toBeGreaterThanOrEqual(cases * 0.2);
  });
});
