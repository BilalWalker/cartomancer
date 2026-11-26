import type { Destination, Guidance, Position, Route } from "./types";

/** Guidance when there is no route: nothing to follow. */
const INACTIVE: Guidance = { active: false };

/**
 * Guidance for the remaining route. With no route the fixed inactive
 * guidance is returned (no distance, no turn). Otherwise the distance left
 * equals the remaining route length. Next turn and arrival come in later
 * steps; the extra parameters are accepted now so the signature is stable.
 */
export function computeGuidance(
  remainingRoute: Route | undefined,
  _position: Position,
  _destination: Destination | undefined,
  _offRouteDistance: number,
  _margin = 15,
  _arrivalRadius = 10,
): Guidance {
  if (remainingRoute === undefined) {
    return { ...INACTIVE };
  }
  return { active: true, distanceLeftWorldUnits: remainingRoute.lengthWorldUnits };
}
