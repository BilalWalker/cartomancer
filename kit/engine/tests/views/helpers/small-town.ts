// A small hand-written town for the View tests: four corner nodes, four
// roads (one of them crossing a lake), two places and two props.

import type { EngineMap } from "../../../src/types.js";

export function smallTown(): EngineMap {
  return {
    formatVersion: 1,
    nodes: [
      { id: "n1", x: 0, y: 0 },
      { id: "n2", x: 100, y: 0 },
      { id: "n3", x: 100, y: 100 },
      { id: "n4", x: 0, y: 100 },
    ],
    roads: [
      { id: "r1", fromNodeId: "n1", toNodeId: "n2", width: 6, kind: "main" },
      { id: "r2", fromNodeId: "n2", toNodeId: "n3", width: 4, kind: "side" },
      { id: "r3", fromNodeId: "n3", toNodeId: "n4", width: 4, kind: "footpath" },
      { id: "r4", fromNodeId: "n4", toNodeId: "n1", width: 4, kind: "side" },
    ],
    places: [
      { id: "p1", name: "Bakery", category: "shop", x: 50, y: 0 },
      { id: "p2", name: "Library", category: "public", x: 100, y: 50 },
    ],
    blockedAreas: [
      {
        id: "a1",
        kind: "water",
        polygon: [
          { x: 30, y: 30 },
          { x: 70, y: 30 },
          { x: 70, y: 70 },
          { x: 30, y: 70 },
        ],
      },
    ],
    props: [
      { id: "q1", kind: "tree", x: 20, y: 20, width: 8, height: 8, rotationDegrees: 0 },
      { id: "q2", kind: "picture:statue", x: 80, y: 20, width: 10, height: 6, rotationDegrees: 0 },
    ],
    style: { colors: {}, lineStyles: {} },
    usableRoadIds: new Set(["r1", "r2", "r3", "r4"]),
    blockedRoads: [],
  };
}
