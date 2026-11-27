import { describe, expect, it } from "vitest";
import type { EngineMap } from "../../src/types.js";
import { inspectMap } from "../../src/views/map-inspect.js";
import { isViewError } from "../../src/views/view-errors.js";

function baseMap(): EngineMap {
  return {
    formatVersion: 1,
    nodes: [
      { id: "n1", x: 0, y: 0 },
      { id: "n2", x: 100, y: 0 },
    ],
    roads: [
      { id: "r1", fromNodeId: "n1", toNodeId: "n2", width: 6, kind: "main" },
    ],
    places: [{ id: "p1", name: "Bank", category: "shop", x: 50, y: 5 }],
    blockedAreas: [],
    props: [],
    style: { colors: {}, lineStyles: {} },
    usableRoadIds: new Set(["r1"]),
    blockedRoads: [],
  };
}

function notices(result: ReturnType<typeof inspectMap>): string[] {
  if (isViewError(result)) throw new Error("expected notices");
  return result.notices.map((n) => n.message);
}

describe("inspectMap", () => {
  it("gives no notice for a normal map", () => {
    expect(notices(inspectMap(baseMap()))).toEqual([]);
  });

  it("notices a map with no roads", () => {
    const map = { ...baseMap(), roads: [], usableRoadIds: new Set<string>() };
    expect(notices(inspectMap(map))).toEqual([
      "The map has no roads, so no route can be drawn.",
    ]);
  });

  it("notices an empty map", () => {
    const map = {
      ...baseMap(),
      roads: [],
      places: [],
      usableRoadIds: new Set<string>(),
    };
    expect(notices(inspectMap(map))).toEqual([
      "The map is empty, so only the ground is drawn.",
    ]);
  });

  it("notices a map with no usable road", () => {
    const map = { ...baseMap(), usableRoadIds: new Set<string>() };
    expect(notices(inspectMap(map))).toEqual([
      "The map has no usable road, so every road is drawn as blocked.",
    ]);
  });

  it("names a road whose node has a non-finite coordinate, without the value", () => {
    const map = baseMap();
    map.nodes[1]!.x = Number.NaN;
    const result = inspectMap(map);
    expect(isViewError(result)).toBe(true);
    if (isViewError(result)) {
      expect(result.message).toContain('road "r1"');
      expect(result.message).not.toContain("NaN");
    }
  });

  it("names a place, prop and blocked area with a non-finite coordinate", () => {
    const place = baseMap();
    place.places[0]!.y = Number.POSITIVE_INFINITY;
    const prop = baseMap();
    prop.props = [
      { id: "b1", kind: "house", x: Number.NaN, y: 0, width: 1, height: 1, rotationDegrees: 0 },
    ];
    const area = baseMap();
    area.blockedAreas = [
      {
        id: "a1",
        kind: "water",
        polygon: [
          { x: 0, y: 0 },
          { x: 1, y: Number.NEGATIVE_INFINITY },
          { x: 2, y: 2 },
        ],
      },
    ];
    const messages = [place, prop, area].map((m) => {
      const r = inspectMap(m);
      return isViewError(r) ? r.message : "";
    });
    expect(messages[0]).toContain('place "p1"');
    expect(messages[1]).toContain('prop "b1"');
    expect(messages[2]).toContain('blocked area "a1"');
  });
});
