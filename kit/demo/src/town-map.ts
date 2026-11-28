// Town_Map: a small invented town written by hand as a map file. It has no
// real-world data. Roads form a grid of 12 junctions with a short spur to the
// east; a lake blocks one street; one street is one-way.
//
//   a---b---c---d          y = 0
//   |   |   |   |
//   e---f---g---h---m      y = 150
//   |   |   |   |   |
//   i---j---k---l---n      y = 300
//
// x runs 0, 150, 300, 450 and 600 across.

import type { MapFile } from "../../engine/src/types.js";

export const townMap: MapFile = {
  formatVersion: 1,
  nodes: [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 150, y: 0 },
    { id: "c", x: 300, y: 0 },
    { id: "d", x: 450, y: 0 },
    { id: "e", x: 0, y: 150 },
    { id: "f", x: 150, y: 150 },
    { id: "g", x: 300, y: 150 },
    { id: "h", x: 450, y: 150 },
    { id: "m", x: 600, y: 150 },
    { id: "i", x: 0, y: 300 },
    { id: "j", x: 150, y: 300 },
    { id: "k", x: 300, y: 300 },
    { id: "l", x: 450, y: 300 },
    { id: "n", x: 600, y: 300 },
  ],
  roads: [
    // Main streets along the top and the middle.
    { id: "r-ab", fromNodeId: "a", toNodeId: "b", width: 8, kind: "main" },
    { id: "r-bc", fromNodeId: "b", toNodeId: "c", width: 8, kind: "main" },
    { id: "r-cd", fromNodeId: "c", toNodeId: "d", width: 8, kind: "main" },
    { id: "r-ef", fromNodeId: "e", toNodeId: "f", width: 8, kind: "main" },
    { id: "r-fg", fromNodeId: "f", toNodeId: "g", width: 8, kind: "main" },
    { id: "r-gh", fromNodeId: "g", toNodeId: "h", width: 8, kind: "main" },
    { id: "r-hm", fromNodeId: "h", toNodeId: "m", width: 8, kind: "main" },
    // Side streets across the town.
    { id: "r-ae", fromNodeId: "a", toNodeId: "e", width: 5, kind: "side" },
    { id: "r-bf", fromNodeId: "b", toNodeId: "f", width: 5, kind: "side" },
    { id: "r-cg", fromNodeId: "c", toNodeId: "g", width: 5, kind: "side" },
    { id: "r-dh", fromNodeId: "d", toNodeId: "h", width: 5, kind: "side" },
    { id: "r-ei", fromNodeId: "e", toNodeId: "i", width: 5, kind: "side" },
    { id: "r-fj", fromNodeId: "f", toNodeId: "j", width: 5, kind: "side" },
    // This street crosses the lake, so it is blocked.
    { id: "r-gk", fromNodeId: "g", toNodeId: "k", width: 5, kind: "side" },
    { id: "r-hl", fromNodeId: "h", toNodeId: "l", width: 5, kind: "side" },
    { id: "r-jk", fromNodeId: "j", toNodeId: "k", width: 5, kind: "side" },
    // One-way street: traffic goes from the west end to the east end only.
    { id: "r-ij", fromNodeId: "i", toNodeId: "j", width: 5, kind: "side", oneWay: true },
    // Footpaths along the south and east edges.
    { id: "r-kl", fromNodeId: "k", toNodeId: "l", width: 3, kind: "footpath" },
    { id: "r-ln", fromNodeId: "l", toNodeId: "n", width: 3, kind: "footpath" },
    { id: "r-mn", fromNodeId: "m", toNodeId: "n", width: 3, kind: "footpath" },
  ],
  places: [
    { id: "p-bakery", name: "Bakery", category: "shop", x: 75, y: 0 },
    { id: "p-library", name: "Library", category: "public", x: 150, y: 75 },
    { id: "p-clinic", name: "Clinic", category: "health", x: 300, y: 75 },
    { id: "p-station", name: "Station", category: "transport", x: 225, y: 150 },
    { id: "p-market", name: "Market", category: "shop", x: 450, y: 225 },
    { id: "p-mill", name: "Old Mill", category: "landmark", x: 525, y: 150 },
    { id: "p-parkgate", name: "Park Gate", category: "landmark", x: 75, y: 300 },
  ],
  blockedAreas: [
    {
      id: "area-lake",
      kind: "water",
      polygon: [
        { x: 270, y: 195 },
        { x: 335, y: 195 },
        { x: 335, y: 255 },
        { x: 270, y: 255 },
      ],
    },
  ],
  props: [
    { id: "q-building", kind: "building", x: 60, y: 70, width: 40, height: 30, rotationDegrees: 0 },
    { id: "q-house", kind: "house", x: 225, y: 75, width: 20, height: 20, rotationDegrees: 0 },
    { id: "q-tower", kind: "tower", x: 375, y: 75, width: 16, height: 16, rotationDegrees: 0, blockHeight: 40 },
    { id: "q-wall", kind: "wall-block", x: 75, y: 225, width: 30, height: 10, rotationDegrees: 0 },
    { id: "q-tree-1", kind: "tree", x: 375, y: 225, width: 10, height: 10, rotationDegrees: 0 },
    { id: "q-tree-2", kind: "tree", x: 525, y: 225, width: 10, height: 10, rotationDegrees: 0 },
  ],
  style: { colors: {}, lineStyles: {} },
};

/** The Town_Map as map file text, ready for `Engine.loadMap` or `parseMap`. */
export const townMapText: string = JSON.stringify(townMap);
