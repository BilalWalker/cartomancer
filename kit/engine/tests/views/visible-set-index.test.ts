import { describe, expect, it } from "vitest";
import type { EngineMap } from "../../src/types.js";
import {
  buildSpatialIndex,
  cellKey,
  propBounds,
} from "../../src/views/visible-set.js";

function map(): EngineMap {
  return {
    formatVersion: 1,
    nodes: [
      { id: "n1", x: 0, y: 0 },
      { id: "n2", x: 100, y: 0 },
      { id: "n3", x: 100, y: 40 },
    ],
    roads: [
      { id: "r1", fromNodeId: "n1", toNodeId: "n2", width: 6, kind: "main" },
      { id: "r2", fromNodeId: "n2", toNodeId: "n3", width: 4, kind: "side" },
      { id: "r3", fromNodeId: "n1", toNodeId: "gone", width: 4, kind: "side" },
    ],
    places: [{ id: "p1", name: "Bank", category: "shop", x: 50, y: 5 }],
    blockedAreas: [
      {
        id: "a1",
        kind: "water",
        polygon: [
          { x: 200, y: 200 },
          { x: 230, y: 200 },
          { x: 230, y: 230 },
        ],
      },
    ],
    props: [
      { id: "b1", kind: "house", x: 20, y: 20, width: 10, height: 4, rotationDegrees: 90 },
    ],
    style: { colors: {}, lineStyles: {} },
    usableRoadIds: new Set(["r1", "r2"]),
    blockedRoads: [],
  };
}

describe("buildSpatialIndex", () => {
  it("uses the median road length as the cell size", () => {
    // lengths 100 and 40 -> median 70
    expect(buildSpatialIndex(map()).cellSize).toBe(70);
  });

  it("keeps the cell size at 10 or more on tiny maps", () => {
    const tiny = map();
    tiny.nodes = [
      { id: "n1", x: 0, y: 0 },
      { id: "n2", x: 1, y: 0 },
    ];
    tiny.roads = [tiny.roads[0]!];
    expect(buildSpatialIndex(tiny).cellSize).toBe(10);
  });

  it("indexes roads, areas, props and places and skips roads with a missing node", () => {
    const index = buildSpatialIndex(map());
    const ids = index.items.map((i) => `${i.kind}:${i.id}`);
    expect(ids).toEqual([
      "road:r1",
      "road:r2",
      "blockedArea:a1",
      "prop:b1",
      "place:p1",
    ]);
  });

  it("places an item in every cell its box overlaps", () => {
    const index = buildSpatialIndex(map());
    const r1 = index.items.findIndex((i) => i.id === "r1");
    // r1 spans x 0..100 at y 0, cell size 70 -> cells x 0 and 1, y 0
    expect(index.cells.get(cellKey(0, 0))).toContain(r1);
    expect(index.cells.get(cellKey(1, 0))).toContain(r1);
    expect(index.cells.get(cellKey(2, 0))).toBeUndefined();
  });

  it("makes the bounds of a rotated prop from its turned rectangle", () => {
    const b = propBounds({ x: 20, y: 20, width: 10, height: 4, rotationDegrees: 90 });
    expect(b.minX).toBeCloseTo(18);
    expect(b.maxX).toBeCloseTo(22);
    expect(b.minY).toBeCloseTo(15);
    expect(b.maxY).toBeCloseTo(25);
  });
});
