import { describe, expect, it } from "vitest";
import { parseMap } from "../src/map-loader.js";
import { saveMap } from "../src/map-saver.js";

const text = JSON.stringify({
  formatVersion: 1,
  nodes: [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 100, y: 0 },
    { id: "c", x: 100, y: 80 },
  ],
  roads: [
    { id: "r1", fromNodeId: "a", toNodeId: "b", width: 6, kind: "main" },
    { id: "r2", fromNodeId: "b", toNodeId: "c", width: 4, kind: "side", oneWay: true },
  ],
  places: [{ id: "p1", name: "Bank", category: "shop", x: 50, y: 0 }],
  blockedAreas: [
    {
      id: "lake",
      kind: "water",
      polygon: [
        { x: 10, y: 20 },
        { x: 40, y: 20 },
        { x: 25, y: 50 },
      ],
    },
  ],
  props: [
    { id: "t1", kind: "tree", x: 5, y: 5, width: 4, height: 4, rotationDegrees: 0 },
  ],
  style: {
    colors: { road: "#444444" },
    lineStyles: { main: { width: 3, dash: [4, 2] } },
  },
});

function load(source: string) {
  const result = parseMap(source);
  if (!("map" in result)) throw new Error("expected a map");
  return result.map;
}

describe("saveMap", () => {
  it("writes a map that loads back equal, without derived fields", () => {
    const original = load(text);
    const saved = saveMap(original);
    expect(load(saved)).toEqual(original);
    const parsed = JSON.parse(saved) as Record<string, unknown>;
    expect(parsed["formatVersion"]).toBe(1);
    expect(parsed).not.toHaveProperty("usableRoadIds");
    expect(parsed).not.toHaveProperty("blockedRoads");
    expect(parsed).not.toHaveProperty("backgroundPicture");
  });
});
