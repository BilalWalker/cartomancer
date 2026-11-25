// Independent brute-force shortest path, used to check the route finder.
//
// It shares no code with src/route-finder.ts and does not use src/snapping.ts.
// Choice about snapped points: this helper accepts points that are already
// placed on a road ("road id plus distance along the road from its from-node"),
// so it needs no snapping of its own. A test that starts from free points must
// compute the placement independently, or take it from the snapped point the
// route finder returned and check that separately.
//
// Method: every usable road is cut at the start and end points that lie on it.
// The pieces become directed edges (both ways, or forward only for a one-way
// road). Every simple path (no vertex visited twice) from the start to the end
// is enumerated by depth-first search and the shortest is kept. This is
// exponential, so use it only on small maps.

import type { EngineMap } from "../../src/types.js";

/** The parts of a map the search reads. Types only; no engine code is run. */
export type SearchMap = Pick<EngineMap, "nodes" | "roads" | "usableRoadIds">;

/** A point on a road: distance in world units from the road's from-node. */
export interface RoadPoint {
  roadId: string;
  distanceAlongRoad: number;
}

/** A point at a node. */
export interface NodePoint {
  nodeId: string;
}

export type SearchPoint = RoadPoint | NodePoint;

export interface SearchResult {
  /** Total length of the shortest path. */
  length: number;
  /** Vertex names from start to end: node ids, "@start" and "@end". */
  vertices: string[];
}

interface Edge {
  to: string;
  length: number;
}

const START = "@start";
const END = "@end";

export function exhaustiveShortestPath(
  map: SearchMap,
  start: SearchPoint,
  end: SearchPoint,
): SearchResult | undefined {
  const nodeById = new Map(map.nodes.map((n) => [n.id, n]));
  const adjacency = new Map<string, Edge[]>();
  const addEdge = (from: string, to: string, length: number): void => {
    const list = adjacency.get(from);
    if (list) list.push({ to, length });
    else adjacency.set(from, [{ to, length }]);
  };

  // Start or end given as a node: name the vertex directly.
  const vertexOf = (p: SearchPoint, virtual: string): string =>
    "nodeId" in p ? p.nodeId : virtual;

  const startVertex = vertexOf(start, START);
  const endVertex = vertexOf(end, END);

  // Both points at the same place on the same road: nothing to travel.
  if (
    "roadId" in start &&
    "roadId" in end &&
    start.roadId === end.roadId &&
    start.distanceAlongRoad === end.distanceAlongRoad
  ) {
    return { length: 0, vertices: [START, END] };
  }
  if (startVertex === endVertex) return { length: 0, vertices: [startVertex] };

  for (const road of map.roads) {
    if (!map.usableRoadIds.has(road.id)) continue;
    const a = nodeById.get(road.fromNodeId);
    const b = nodeById.get(road.toNodeId);
    if (!a || !b) continue;
    const total = Math.hypot(b.x - a.x, b.y - a.y);

    // Cut points on this road, in order from the from-node to the to-node.
    const cuts: { at: number; vertex: string }[] = [
      { at: 0, vertex: road.fromNodeId },
      { at: total, vertex: road.toNodeId },
    ];
    if ("roadId" in start && start.roadId === road.id) {
      cuts.push({ at: start.distanceAlongRoad, vertex: START });
    }
    if ("roadId" in end && end.roadId === road.id) {
      cuts.push({ at: end.distanceAlongRoad, vertex: END });
    }
    cuts.sort((p, q) => p.at - q.at);

    for (let i = 0; i + 1 < cuts.length; i++) {
      const from = cuts[i]!;
      const to = cuts[i + 1]!;
      const length = to.at - from.at;
      addEdge(from.vertex, to.vertex, length);
      if (road.oneWay !== true) addEdge(to.vertex, from.vertex, length);
    }
  }

  let best: SearchResult | undefined;
  const visited = new Set<string>([startVertex]);
  const path: string[] = [startVertex];

  const walk = (vertex: string, length: number): void => {
    if (best !== undefined && length >= best.length) return;
    if (vertex === endVertex) {
      best = { length, vertices: [...path] };
      return;
    }
    for (const edge of adjacency.get(vertex) ?? []) {
      if (visited.has(edge.to)) continue;
      visited.add(edge.to);
      path.push(edge.to);
      walk(edge.to, length + edge.length);
      path.pop();
      visited.delete(edge.to);
    }
  };
  walk(startVertex, 0);
  return best;
}
