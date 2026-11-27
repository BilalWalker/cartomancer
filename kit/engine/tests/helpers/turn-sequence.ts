import { headingOfSegment } from "../../src/geometry.js";
import { computeGuidance } from "../../src/guidance.js";
import { findRoute } from "../../src/route-finder.js";
import { advance } from "../../src/route-follower.js";
import type { Destination, EngineMap, NextTurn, Position, Route } from "../../src/types.js";

/** What guidance said at one position on the walk. */
export interface TurnStep {
  nextTurn: NextTurn | undefined;
  distanceToTurn: number | undefined;
  distanceLeft: number | undefined;
}

/** A route found on a map and the guidance recorded while walking along it. */
export interface TurnSequence {
  routeLength: number;
  roadIds: string[];
  /** Heading of every part that has length, in order. */
  partHeadings: number[];
  steps: TurnStep[];
}

/** Distance between the positions of the walk, in world units. */
export const WALK_STEP = 7;

/** Most positions the walk visits. */
export const WALK_MAX_STEPS = 60;

function partLength(route: Route, i: number): number {
  const part = route.parts[i]!;
  return Math.hypot(part.end.x - part.start.x, part.end.y - part.start.y);
}

/** The position `distance` along the route, with the heading of the part it lies on. */
function positionAt(route: Route, distance: number): Position {
  let start = 0;
  let last: Position | undefined;
  for (let i = 0; i < route.parts.length; i++) {
    const length = partLength(route, i);
    if (length === 0) continue;
    const part = route.parts[i]!;
    const f = Math.min(1, Math.max(0, (distance - start) / length));
    last = {
      x: part.start.x + (part.end.x - part.start.x) * f,
      y: part.start.y + (part.end.y - part.start.y) * f,
      headingDegrees: headingOfSegment(part.start, part.end),
    };
    if (distance <= start + length) return last;
    start += length;
  }
  return last ?? { x: 0, y: 0, headingDegrees: 0 };
}

/**
 * Find a route with `findRoute`, then walk positions along it with `advance`
 * and record the next turn and its distance from `computeGuidance`.
 * Returns undefined when there is no route. Does not use the Engine class.
 */
export function turnSequence(
  map: EngineMap,
  start: Position,
  destination: Destination,
): TurnSequence | undefined {
  const found = findRoute(map, start, destination);
  if (!("parts" in found)) return undefined;
  const route = found;

  const partHeadings: number[] = [];
  for (const part of route.parts) {
    if (Math.hypot(part.end.x - part.start.x, part.end.y - part.start.y) > 0) {
      partHeadings.push(headingOfSegment(part.start, part.end));
    }
  }

  const steps: TurnStep[] = [];
  let progress = 0;
  for (let i = 0; i < WALK_MAX_STEPS; i++) {
    const distance = i * WALK_STEP;
    if (distance > route.lengthWorldUnits) break;
    const position = positionAt(route, distance);
    const moved = advance(route, progress, position);
    progress = moved.progress;
    const guidance = computeGuidance(moved.remaining, position, destination, 0);
    steps.push({
      nextTurn: guidance.nextTurn,
      distanceToTurn: guidance.distanceToTurnWorldUnits,
      distanceLeft: guidance.distanceLeftWorldUnits,
    });
  }

  return {
    routeLength: route.lengthWorldUnits,
    roadIds: route.parts.map((p) => p.roadId),
    partHeadings,
    steps,
  };
}
