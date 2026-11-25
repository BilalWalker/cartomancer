// Route finder entry: resolves the destination, snaps both ends and answers
// the simple cases. The shortest-path search is added in a later task.

import type { Point } from "./geometry.js";
import { isNoUsableRoad, snapToRoad } from "./snapping.js";
import type { Destination, EngineMap, NoWayResult, Route, RoutePart } from "./types.js";

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

  const startNodeId = nodeAt(map, from.roadId, from);
  const endNodeId = nodeAt(map, to.roadId, to);
  if (startNodeId !== undefined && endNodeId !== undefined) {
    const parts = shortestNodePath(map, startNodeId, endNodeId);
    if (parts) {
      return { parts, lengthWorldUnits: sumLengths(parts), destination };
    }
  }

  // Temporary answer until points inside roads and reasons are handled.
  return {
    reason: "separate-parts",
    message: "No way was found between the start and the destination.",
  };
}

/** The id of an end node of the road when the point lies exactly on it. */
function nodeAt(map: EngineMap, roadId: string, point: Point): string | undefined {
  const road = map.roads.find((candidate) => candidate.id === roadId);
  if (!road) return undefined;
  for (const nodeId of [road.fromNodeId, road.toNodeId]) {
    const node = map.nodes.find((candidate) => candidate.id === nodeId);
    if (node && Math.hypot(node.x - point.x, node.y - point.y) <= SAME_POINT_TOLERANCE) return nodeId;
  }
  return undefined;
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
 * Shortest chain of usable roads from one node to another (Dijkstra with a
 * binary heap). One-way roads are used only in their direction. Roads leave a
 * node in lowest-road-id order and a path is replaced only by a strictly
 * shorter one, so equal-length alternatives always resolve the same way.
 * Returns undefined when the end node cannot be reached.
 */
export function shortestNodePath(map: EngineMap, startNodeId: string, endNodeId: string): RoutePart[] | undefined {
  const nodes = new Map<string, Point>();
  for (const node of map.nodes) nodes.set(node.id, node);

  const roads = map.roads.filter((road) => map.usableRoadIds.has(road.id));
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
    addEdge(road.fromNodeId, { roadId: road.id, to: road.toNodeId, length, direction: "forward" });
    if (road.oneWay !== true) {
      addEdge(road.toNodeId, { roadId: road.id, to: road.fromNodeId, length, direction: "backward" });
    }
  }

  if (!nodes.has(startNodeId) || !nodes.has(endNodeId)) return undefined;

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
    const startPoint = nodes.get(step.prev) as Point;
    const endPoint = nodes.get(at) as Point;
    parts.push({
      roadId: step.edge.roadId,
      direction: step.edge.direction,
      start: { x: startPoint.x, y: startPoint.y },
      end: { x: endPoint.x, y: endPoint.y },
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
