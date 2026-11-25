// Route finder entry: resolves the destination, snaps both ends and answers
// the simple cases. The shortest-path search is added in a later task.

import type { Point } from "./geometry.js";
import { isNoUsableRoad, snapToRoad } from "./snapping.js";
import type { Destination, EngineMap, NoWayResult, Route } from "./types.js";

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

  // Temporary answer until the shortest-path search exists.
  return {
    reason: "separate-parts",
    message: "No way was found between the start and the destination.",
  };
}

function noUsableRoad(): NoWayResult {
  return {
    reason: "no-usable-road",
    message: "The map has no road you can use, so there is no route.",
  };
}
