// Deterministic large map generator for the benchmark and tests.
// Builds a 50 x 50 grid of nodes (4,900 roads) and adds 100 diagonal roads
// in distinct cells, giving exactly 5,000 roads. The undirected graph is
// connected. A seeded generator drives every random choice.

import type { MapFile, NodeData, PlaceData, RoadData, RoadKind } from "../src/types.js";

export const LARGE_MAP_ROAD_COUNT = 5000;

const GRID = 50;
const SPACING = 100;
const JITTER = 20;
const DIAGONALS = LARGE_MAP_ROAD_COUNT - 2 * GRID * (GRID - 1);
const PLACE_COUNT = 20;

/** Small seeded generator (mulberry32). Returns numbers in [0, 1). */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Make the map file object for a seed. */
export function generateLargeMapFile(seed: number): MapFile {
  const random = seededRandom(seed);
  const nodes: NodeData[] = [];
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      nodes.push({
        id: `n${row}_${col}`,
        x: Math.round(col * SPACING + (random() * 2 - 1) * JITTER),
        y: Math.round(row * SPACING + (random() * 2 - 1) * JITTER),
      });
    }
  }

  const roads: RoadData[] = [];
  const kinds: RoadKind[] = ["main", "side", "footpath"];
  const addRoad = (from: string, to: string): void => {
    const kind = kinds[Math.floor(random() * kinds.length)] ?? "side";
    const road: RoadData = {
      id: `r${roads.length}`,
      fromNodeId: from,
      toNodeId: to,
      width: kind === "main" ? 12 : kind === "side" ? 8 : 4,
      kind,
    };
    if (random() < 0.03) road.oneWay = true;
    roads.push(road);
  };
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      if (col + 1 < GRID) addRoad(`n${row}_${col}`, `n${row}_${col + 1}`);
      if (row + 1 < GRID) addRoad(`n${row}_${col}`, `n${row + 1}_${col}`);
    }
  }

  // Diagonals in distinct cells, chosen by a seeded partial shuffle.
  const cells: number[] = [];
  for (let i = 0; i < (GRID - 1) * (GRID - 1); i++) cells.push(i);
  for (let i = 0; i < DIAGONALS; i++) {
    const j = i + Math.floor(random() * (cells.length - i));
    const picked = cells[j] as number;
    cells[j] = cells[i] as number;
    cells[i] = picked;
    const row = Math.floor(picked / (GRID - 1));
    const col = picked % (GRID - 1);
    addRoad(`n${row}_${col}`, `n${row + 1}_${col + 1}`);
  }

  const places: PlaceData[] = [];
  for (let i = 0; i < PLACE_COUNT; i++) {
    const node = nodes[Math.floor(random() * nodes.length)] as NodeData;
    places.push({
      id: `p${i}`,
      name: `Place ${i + 1}`,
      category: "landmark",
      x: node.x,
      y: node.y,
    });
  }

  return {
    formatVersion: 1,
    nodes,
    roads,
    places,
    blockedAreas: [],
    props: [],
    style: {
      colors: { road: "#444444", background: "#eeeeee" },
      lineStyles: { road: { width: 2 } },
    },
  };
}

/** Make the map file text for a seed. The same seed gives the same text. */
export function generateLargeMap(seed: number): string {
  return JSON.stringify(generateLargeMapFile(seed));
}
