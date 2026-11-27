import { describe, expect, it } from "vitest";
import { mirrorHeading, mirrorMap } from "../src/mirror.js";
import type { EngineMap } from "../src/types.js";

const sample: EngineMap = {
  formatVersion: 1,
  nodes: [
    { id: "a", x: 10, y: 5 },
    { id: "b", x: -20, y: 7 },
  ],
  roads: [{ id: "r1", fromNodeId: "a", toNodeId: "b", width: 6, kind: "main", oneWay: true }],
  places: [{ id: "p1", name: "Bank", category: "shop", x: 4, y: 9 }],
  blockedAreas: [
    {
      id: "w1",
      kind: "water",
      polygon: [
        { x: 1, y: 1 },
        { x: -3, y: 2 },
        { x: 0, y: 6 },
      ],
    },
  ],
  props: [{ id: "t1", kind: "tree", x: 8, y: 2, width: 3, height: 4, rotationDegrees: 30 }],
  backgroundPicture: { ref: "plan.png", scale: 2, opacity: 0.5 },
  style: { colors: { road: "#333" }, lineStyles: { road: { width: 2 } } },
  usableRoadIds: new Set(["r1"]),
  blockedRoads: [{ roadId: "r2", blockedAreaId: "w1" }],
};

describe("mirrorMap", () => {
  it("negates x of nodes, places, props and blocked area points", () => {
    const m = mirrorMap(sample);
    expect(m.nodes).toEqual([
      { id: "a", x: -10, y: 5 },
      { id: "b", x: 20, y: 7 },
    ]);
    expect(m.places[0]).toEqual({ id: "p1", name: "Bank", category: "shop", x: -4, y: 9 });
    expect(m.blockedAreas[0]?.polygon).toEqual([
      { x: -1, y: 1 },
      { x: 3, y: 2 },
      { x: 0, y: 6 },
    ]);
    expect(m.props[0]).toEqual({
      id: "t1", kind: "tree", x: -8, y: 2, width: 3, height: 4, rotationDegrees: -30,
    });
  });

  it("leaves roads, background, style and derived fields unchanged", () => {
    const m = mirrorMap(sample);
    expect(m.roads).toEqual(sample.roads);
    expect(m.backgroundPicture).toEqual(sample.backgroundPicture);
    expect(m.style).toEqual(sample.style);
    expect(m.usableRoadIds).toEqual(sample.usableRoadIds);
    expect(m.blockedRoads).toEqual(sample.blockedRoads);
  });

  it("does not change the input map", () => {
    mirrorMap(sample);
    expect(sample.nodes[0]?.x).toBe(10);
  });
});

describe("mirrorHeading", () => {
  it("maps 0 to 180 and 180 to 0", () => {
    expect(mirrorHeading(0)).toBe(180);
    expect(mirrorHeading(180)).toBe(0);
  });

  it("keeps straight down and straight up", () => {
    expect(mirrorHeading(90)).toBe(90);
    expect(mirrorHeading(-90)).toBe(-90);
  });
});
