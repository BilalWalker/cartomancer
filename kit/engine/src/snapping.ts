// Snapping a point to the nearest usable road.

import { nearestPointOnSegment } from "./geometry.js";
import type { Point } from "./geometry.js";
import type { EngineMap, SnappedPoint } from "./types.js";

export interface NoUsableRoadResult {
  reason: "no-usable-road";
  message: string;
}

export function isNoUsableRoad(result: SnappedPoint | NoUsableRoadResult): result is NoUsableRoadResult {
  return "reason" in result;
}

/**
 * Finds the nearest point on any usable road. Roads left out of routing are
 * ignored. When two roads are equally near, the lowest road id wins.
 */
export function snapToRoad(map: EngineMap, point: Point): SnappedPoint | NoUsableRoadResult {
  const nodes = new Map<string, Point>();
  for (const node of map.nodes) nodes.set(node.id, node);

  const roads = map.roads.filter((road) => map.usableRoadIds.has(road.id));
  roads.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  let best: SnappedPoint | undefined;
  let bestDistance = Infinity;
  for (const road of roads) {
    const from = nodes.get(road.fromNodeId);
    const to = nodes.get(road.toNodeId);
    if (!from || !to) continue;
    const nearest = nearestPointOnSegment(point, from, to);
    if (nearest.distance < bestDistance) {
      bestDistance = nearest.distance;
      best = {
        x: nearest.point.x,
        y: nearest.point.y,
        roadId: road.id,
        distanceAlongRoad: nearest.t * Math.hypot(to.x - from.x, to.y - from.y),
      };
    }
  }

  if (!best) {
    return {
      reason: "no-usable-road",
      message: "The map has no road you can use, so there is nothing to snap to.",
    };
  }
  return best;
}
