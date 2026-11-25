import { describe, expect, it } from "vitest";
import { parseMap } from "../src/map-loader.js";
import { findRoute } from "../src/route-finder.js";
import type { EngineMap } from "../src/types.js";

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

  it("returns the temporary separate-parts answer for other cases", () => {
    const result = findRoute(load([road]), { x: 10, y: 0 }, { point: { x: 90, y: 0 } });
    expect(result).toMatchObject({ reason: "separate-parts" });
    expect("message" in result && result.message).not.toContain("at ");
  });
});
