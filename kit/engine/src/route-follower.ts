// Route follower: trims the travelled part of a route using a progress value
// (distance along the original route) and a search range.

import { nearestPointOnSegment } from "./geometry";
import type { Point } from "./geometry";
import type { Route, RoutePart } from "./types";

/** Default search range in world units. */
export const DEFAULT_SEARCH_WINDOW = 100;

export interface AdvanceResult {
  /** The part of the route from the new progress to the destination. */
  remaining: Route;
  /** Distance along the original route; never smaller than the progress given. */
  progress: number;
}

function partLength(part: RoutePart): number {
  return Math.hypot(part.end.x - part.start.x, part.end.y - part.start.y);
}

/**
 * Off_Route_Distance: the distance from `position` to the nearest point of the
 * remaining route, minus half the width of the road in use at that point.
 * Zero or negative on the road surface. An empty route has no road to be on,
 * so the result is Infinity. Ties go to the earliest part.
 */
export function offRouteDistance(
  remaining: Route,
  position: Point,
  roadWidthOf: (roadId: string) => number,
): number {
  let bestDistance = Infinity;
  let bestRoadId: string | undefined;
  for (const part of remaining.parts) {
    const nearest = nearestPointOnSegment(position, part.start, part.end);
    if (nearest.distance < bestDistance) {
      bestDistance = nearest.distance;
      bestRoadId = part.roadId;
    }
  }
  if (bestRoadId === undefined) return Infinity;
  return bestDistance - roadWidthOf(bestRoadId) / 2;
}

/**
 * Move along `route` (the original route, not a trimmed copy). Looks for the
 * point nearest to `position` only among route points whose distance along the
 * route lies in [progress, progress + searchWindow]. The new progress is the
 * distance along the route of that point, and the part before it is removed.
 */
export function advance(
  route: Route,
  progress: number,
  position: Point,
  searchWindow: number = DEFAULT_SEARCH_WINDOW,
): AdvanceResult {
  const from = Math.max(0, progress);
  const to = from + Math.max(0, searchWindow);
  const lengths = route.parts.map(partLength);

  let bestDistance = Infinity;
  let bestProgress = from;
  let bestIndex = -1;
  let bestPoint: Point | undefined;

  let start = 0;
  for (let i = 0; i < route.parts.length; i++) {
    const length = lengths[i];
    const end = start + length;
    if (end >= from && start <= to) {
      const part = route.parts[i];
      const lo = Math.max(from, start);
      const hi = Math.min(to, end);
      let a: Point = part.start;
      let b: Point = part.end;
      if (length > 0) {
        const fa = (lo - start) / length;
        const fb = (hi - start) / length;
        a = { x: part.start.x + (part.end.x - part.start.x) * fa, y: part.start.y + (part.end.y - part.start.y) * fa };
        b = { x: part.start.x + (part.end.x - part.start.x) * fb, y: part.start.y + (part.end.y - part.start.y) * fb };
      }
      const nearest = nearestPointOnSegment(position, a, b);
      // Strictly smaller keeps the earliest of equally near points.
      if (nearest.distance < bestDistance) {
        bestDistance = nearest.distance;
        bestIndex = i;
        bestPoint = nearest.point;
        bestProgress = Math.min(hi, Math.max(lo, lo + nearest.t * (hi - lo)));
      }
    }
    start = end;
  }

  if (bestIndex < 0 || bestPoint === undefined) {
    // Empty route, or progress lies beyond the route: nothing left.
    return { remaining: { ...route, parts: [], lengthWorldUnits: 0 }, progress: from };
  }

  const parts: RoutePart[] = [];
  for (let i = bestIndex; i < route.parts.length; i++) {
    const part = route.parts[i];
    if (i === bestIndex) {
      const trimmed: RoutePart = { ...part, start: { x: bestPoint.x, y: bestPoint.y } };
      // A zero-length leftover is dropped when more parts follow.
      if (partLength(trimmed) > 0 || bestIndex === route.parts.length - 1) parts.push(trimmed);
    } else {
      parts.push(part);
    }
  }
  const remainingLength = parts.reduce((sum, part) => sum + partLength(part), 0);
  return {
    remaining: { ...route, parts, lengthWorldUnits: remainingLength },
    progress: bestProgress,
  };
}
