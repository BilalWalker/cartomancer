import { describe, expect, it } from "vitest";
import { parseMap } from "../src/map-loader.js";
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
