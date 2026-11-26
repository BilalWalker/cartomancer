import { describe, expect, it } from "vitest";
import { computeGuidance } from "../src/guidance";
import { parseMap } from "../src/map-loader";
import { findRoute } from "../src/route-finder";
import type { Position } from "../src/types";

// The destination (8, 0) is 8 units from the start in a straight line,
// inside the default arrival radius of 10. A wall stands between them, so
// the direct road is unusable and the route goes round by 68 units.
const mapText = JSON.stringify({
  formatVersion: 1,
  nodes: [
    { id: "a", x: 0, y: 0 },
    { id: "c", x: 0, y: -30 },
    { id: "d", x: 8, y: -30 },
    { id: "e", x: 8, y: 0 },
  ],
  roads: [
    { id: "direct", fromNodeId: "a", toNodeId: "e", width: 4, kind: "main" },
    { id: "up", fromNodeId: "a", toNodeId: "c", width: 4, kind: "main" },
    { id: "across", fromNodeId: "c", toNodeId: "d", width: 4, kind: "main" },
    { id: "down", fromNodeId: "d", toNodeId: "e", width: 4, kind: "main" },
  ],
  places: [],
  blockedAreas: [
    {
      id: "wall",
      kind: "wall",
      polygon: [
        { x: 3, y: -5 },
        { x: 5, y: -5 },
        { x: 5, y: 5 },
        { x: 3, y: 5 },
      ],
    },
  ],
  props: [],
  style: { colors: {}, lineStyles: {} },
});

describe("computeGuidance: destination behind a blocked area", () => {
  it("is not arrived and reports the route distance, not the straight-line one", () => {
    const loaded = parseMap(mapText);
    if (!("map" in loaded)) throw new Error("expected a map");
    const start = { x: 0, y: 0 };
    const destination = { point: { x: 8, y: 0 } };

    const route = findRoute(loaded.map, start, destination);
    if (!("parts" in route)) throw new Error("expected a route");
    expect(route.lengthWorldUnits).toBeCloseTo(68);

    const position: Position = { x: 0, y: 0, headingDegrees: 0 };
    const guidance = computeGuidance(route, position, destination, 0);

    expect(guidance.arrived).toBe(false);
    expect(guidance.distanceLeftWorldUnits).toBeCloseTo(route.lengthWorldUnits);
    expect(guidance.distanceLeftWorldUnits).toBeGreaterThan(10);
  });
});
