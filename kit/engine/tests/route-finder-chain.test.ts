import { describe, expect, it } from "vitest";
import { parseMap } from "../src/map-loader.js";
import { findRoute } from "../src/route-finder.js";
import type { EngineMap, NoWayResult, Route } from "../src/types.js";

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
