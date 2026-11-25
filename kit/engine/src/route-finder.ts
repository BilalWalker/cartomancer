// Route finder entry: resolves the destination, snaps both ends and answers
// the simple cases. The shortest-path search is added in a later task.

import type { Point } from "./geometry.js";
import { isNoUsableRoad, snapToRoad } from "./snapping.js";
import type { Destination, EngineMap, NoWayResult, RoadData, Route, RoutePart, SnappedPoint } from "./types.js";

const SAME_POINT_TOLERANCE = 1e-9;

/**
 * Finds a route from a start point to a destination. Returns either a route or
 * a No_Way_Result, never both.
 */
export function findRoute(map: EngineMap, start: Point, destination: Destination): Route | NoWayResult {
  let target: Point;
  if ("placeId" in destination) {
    const place = map.places.find((candidate) => candidate.id === destination.placeId);
    if (!place) {
      return {
        reason: "missing-place",
        message: `The map has no place with the id "${destination.placeId}", so there is no route to it.`,
        placeId: destination.placeId,
      };
    }
    target = { x: place.x, y: place.y };
  } else {
    target = destination.point;
  }

  const from = snapToRoad(map, start);
  if (isNoUsableRoad(from)) return noUsableRoad();
  const to = snapToRoad(map, target);
  if (isNoUsableRoad(to)) return noUsableRoad();

  if (Math.hypot(from.x - to.x, from.y - to.y) <= SAME_POINT_TOLERANCE) {
    return { parts: [], lengthWorldUnits: 0, destination };
  }

  const nodes = new Map<string, Point>();
  for (const node of map.nodes) nodes.set(node.id, node);
  const roadsById = new Map<string, RoadData>();
  for (const road of map.roads) roadsById.set(road.id, road);

  const startAt = locate(nodes, roadsById, from);
  const endAt = locate(nodes, roadsById, to);
  const parts = shortestPath(map, nodes, roadsById, startAt, endAt, {});
  if (parts) {
    return { parts, lengthWorldUnits: sumLengths(parts), destination };
  }

  // No way. Work out why by relaxing one rule at a time. When both a one-way
  // road and blocked roads would each explain it, the one-way reason is given.
  if (shortestPath(map, nodes, roadsById, startAt, endAt, { ignoreOneWay: true })) {
    return {
      reason: "one-way-blocks-the-way",
      message:
        "There is no way to the destination because a one-way road points the wrong direction. The roads are joined, but only against the arrows.",
    };
  }
  if (shortestPath(map, nodes, roadsById, startAt, endAt, { allowBlocked: true })) {
    return {
      reason: "blocked-roads-cut-the-way",
      message:
        "There is no way to the destination because blocked roads cut the way. The roads would be joined if the blocked areas were not in the way.",
    };
  }
  return {
    reason: "separate-parts",
    message: "There is no way to the destination because the start and the destination are in separate parts of the map, and no road joins them.",
  };
}

interface SearchOptions {
  /** Treat every one-way road as two-way (used only to explain a failure). */
  ignoreOneWay?: boolean;
  /** Allow blocked roads (used only to explain a failure). */
  allowBlocked?: boolean;
}

/** Where a snapped point sits: exactly on a node, or inside a road. */
type Location =
  | { kind: "node"; nodeId: string }
  | { kind: "inside"; roadId: string; distance: number; point: Point };

function locate(nodes: Map<string, Point>, roadsById: Map<string, RoadData>, snapped: SnappedPoint): Location {
  const road = roadsById.get(snapped.roadId) as RoadData;
  for (const nodeId of [road.fromNodeId, road.toNodeId]) {
    const node = nodes.get(nodeId) as Point;
    if (Math.hypot(node.x - snapped.x, node.y - snapped.y) <= SAME_POINT_TOLERANCE) return { kind: "node", nodeId };
  }
  return { kind: "inside", roadId: road.id, distance: snapped.distanceAlongRoad, point: { x: snapped.x, y: snapped.y } };
}

function sumLengths(parts: RoutePart[]): number {
  let total = 0;
  for (const part of parts) total += Math.hypot(part.end.x - part.start.x, part.end.y - part.start.y);
  return total;
}

interface Edge {
  roadId: string;
  to: string;
  length: number;
  direction: "forward" | "backward";
  from: Point;
  target: Point;
}

interface HeapItem {
  dist: number;
  seq: number;
  node: string;
}

function less(a: HeapItem, b: HeapItem): boolean {
  return a.dist < b.dist || (a.dist === b.dist && a.seq < b.seq);
}

/** Binary min-heap ordered by distance, then insertion order. */
class MinHeap {
  private items: HeapItem[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: HeapItem): void {
    const items = this.items;
    let i = items.length;
    items.push(item);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!less(items[i], items[parent])) break;
      [items[i], items[parent]] = [items[parent], items[i]];
      i = parent;
    }
  }

  pop(): HeapItem | undefined {
    const items = this.items;
    if (items.length === 0) return undefined;
    const top = items[0];
    const last = items.pop() as HeapItem;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if (l < items.length && less(items[l], items[smallest])) smallest = l;
        if (r < items.length && less(items[r], items[smallest])) smallest = r;
        if (smallest === i) break;
        [items[i], items[smallest]] = [items[smallest], items[i]];
        i = smallest;
      }
    }
    return top;
  }
}

/**
 * Shortest chain of usable roads between two locations (Dijkstra with a
 * binary heap). A location is a node or a point inside a road; for a point
 * inside a road, two virtual nodes get partial edges to the road's ends, and
 * a one-way road is left or entered only in its allowed direction. Roads leave
 * a node in lowest-road-id order and a path is replaced only by a strictly
 * shorter one, so equal-length alternatives always resolve the same way.
 * Returns undefined when the end cannot be reached.
 */
function shortestPath(
  map: EngineMap,
  nodes: Map<string, Point>,
  roadsById: Map<string, RoadData>,
  startAt: Location,
  endAt: Location,
  options: SearchOptions,
): RoutePart[] | undefined {
  const oneWay = (road: RoadData): boolean => options.ignoreOneWay !== true && road.oneWay === true;
  const START = "\u0000start";
  const END = "\u0000end";
  const startNodeId = startAt.kind === "node" ? startAt.nodeId : START;
  const endNodeId = endAt.kind === "node" ? endAt.nodeId : END;

  const roads = map.roads.filter((road) => options.allowBlocked === true || map.usableRoadIds.has(road.id));
  roads.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const adjacency = new Map<string, Edge[]>();
  const addEdge = (from: string, edge: Edge): void => {
    const list = adjacency.get(from);
    if (list) list.push(edge);
    else adjacency.set(from, [edge]);
  };
  for (const road of roads) {
    const a = nodes.get(road.fromNodeId);
    const b = nodes.get(road.toNodeId);
    if (!a || !b) continue;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    addEdge(road.fromNodeId, { roadId: road.id, to: road.toNodeId, length, direction: "forward", from: a, target: b });
    if (!oneWay(road)) {
      addEdge(road.toNodeId, { roadId: road.id, to: road.fromNodeId, length, direction: "backward", from: b, target: a });
    }
  }

  // Partial edges for points inside roads.
  const partial = (roadId: string, from: string, to: string, direction: "forward" | "backward", p: Point, q: Point) =>
    addEdge(from, { roadId, to, length: Math.hypot(q.x - p.x, q.y - p.y), direction, from: p, target: q });
  if (startAt.kind === "inside") {
    const road = roadsById.get(startAt.roadId) as RoadData;
    const a = nodes.get(road.fromNodeId) as Point;
    const b = nodes.get(road.toNodeId) as Point;
    partial(road.id, START, road.toNodeId, "forward", startAt.point, b);
    if (!oneWay(road)) partial(road.id, START, road.fromNodeId, "backward", startAt.point, a);
  }
  if (endAt.kind === "inside") {
    const road = roadsById.get(endAt.roadId) as RoadData;
    const a = nodes.get(road.fromNodeId) as Point;
    const b = nodes.get(road.toNodeId) as Point;
    partial(road.id, road.fromNodeId, END, "forward", a, endAt.point);
    if (!oneWay(road)) partial(road.id, road.toNodeId, END, "backward", b, endAt.point);
  }
  if (startAt.kind === "inside" && endAt.kind === "inside" && startAt.roadId === endAt.roadId) {
    const road = roadsById.get(startAt.roadId) as RoadData;
    if (endAt.distance > startAt.distance) partial(road.id, START, END, "forward", startAt.point, endAt.point);
    else if (!oneWay(road)) partial(road.id, START, END, "backward", startAt.point, endAt.point);
  }

  const dist = new Map<string, number>([[startNodeId, 0]]);
  const via = new Map<string, { prev: string; edge: Edge }>();
  const done = new Set<string>();
  const heap = new MinHeap();
  let seq = 0;
  heap.push({ dist: 0, seq: seq++, node: startNodeId });

  while (heap.size > 0) {
    const current = heap.pop() as HeapItem;
    if (done.has(current.node)) continue;
    done.add(current.node);
    if (current.node === endNodeId) break;
    for (const edge of adjacency.get(current.node) ?? []) {
      if (done.has(edge.to)) continue;
      const candidate = current.dist + edge.length;
      const known = dist.get(edge.to);
      if (known === undefined || candidate < known) {
        dist.set(edge.to, candidate);
        via.set(edge.to, { prev: current.node, edge });
        heap.push({ dist: candidate, seq: seq++, node: edge.to });
      }
    }
  }

  if (!done.has(endNodeId)) return undefined;

  const parts: RoutePart[] = [];
  let at = endNodeId;
  while (at !== startNodeId) {
    const step = via.get(at) as { prev: string; edge: Edge };
    parts.push({
      roadId: step.edge.roadId,
      direction: step.edge.direction,
      start: { x: step.edge.from.x, y: step.edge.from.y },
      end: { x: step.edge.target.x, y: step.edge.target.y },
    });
    at = step.prev;
  }
  parts.reverse();
  return parts;
}

function noUsableRoad(): NoWayResult {
  return {
    reason: "no-usable-road",
    message: "The map has no road you can use, so there is no route.",
  };
}
