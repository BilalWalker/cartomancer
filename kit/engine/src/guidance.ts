import { classifyTurn, headingOfSegment, signedAngleDifference } from "./geometry";
import type { Destination, Guidance, NextTurn, Position, Route } from "./types";

/** Guidance when there is no route: nothing to follow. */
const INACTIVE: Guidance = { active: false };

/**
 * Guidance for the remaining route. With no route the fixed inactive
 * guidance is returned (no distance, no turn). Otherwise the distance left
 * equals the remaining route length. The player has arrived when that
 * length is at most the arrival radius and the off-route distance is at
 * most the margin; then distance left is zero and there is no next turn.
 */
export function computeGuidance(
  remainingRoute: Route | undefined,
  position: Position,
  _destination: Destination | undefined,
  offRouteDistance: number,
  margin = 15,
  arrivalRadius = 10,
): Guidance {
  if (remainingRoute === undefined) {
    return { ...INACTIVE };
  }
  // Arrival is decided along the route, never by straight-line distance.
  if (remainingRoute.lengthWorldUnits <= arrivalRadius && offRouteDistance <= margin) {
    return { active: true, distanceLeftWorldUnits: 0, arrived: true };
  }
  const guidance: Guidance = {
    active: true,
    distanceLeftWorldUnits: remainingRoute.lengthWorldUnits,
    arrived: false,
  };
  const next = playerFacesAway(remainingRoute, position)
    ? { turn: "turn-back" as NextTurn, distance: 0 }
    : findNextTurn(remainingRoute);
  if (next !== undefined) {
    guidance.nextTurn = next.turn;
    guidance.distanceToTurnWorldUnits = next.distance;
  }
  return guidance;
}

/**
 * True when the first route part with length points more than 150 degrees
 * away from the player's heading.
 */
function playerFacesAway(route: Route, position: Position): boolean {
  for (const part of route.parts) {
    if (Math.hypot(part.end.x - part.start.x, part.end.y - part.start.y) === 0) continue;
    const heading = headingOfSegment(part.start, part.end);
    return (
      classifyTurn(signedAngleDifference(position.headingDegrees, heading)) === "turn-back"
    );
  }
  return false;
}

/**
 * The first joint between consecutive route parts classified left, right
 * or turn back, with the distance along the route to it. Straight-on
 * joints are skipped. Parts without length have no heading and are ignored.
 */
function findNextTurn(route: Route): { turn: NextTurn; distance: number } | undefined {
  let travelled = 0;
  let previousHeading: number | undefined;
  for (const part of route.parts) {
    const length = Math.hypot(part.end.x - part.start.x, part.end.y - part.start.y);
    if (length === 0) continue;
    const heading = headingOfSegment(part.start, part.end);
    if (previousHeading !== undefined) {
      const turn = classifyTurn(signedAngleDifference(previousHeading, heading));
      if (turn !== "straight-on") {
        return { turn, distance: travelled };
      }
    }
    previousHeading = heading;
    travelled += length;
  }
  return undefined;
}
