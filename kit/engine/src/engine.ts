// The Engine class: the one object an application talks to.

import { badInput, noMapLoaded } from "./errors.js";
import { parseMap } from "./map-loader.js";
import { findRoute } from "./route-finder.js";
import type {
  Destination,
  EngineError,
  EngineMap,
  LoadResult,
  NoWayResult,
  Notice,
  PlaceData,
  Position,
  Route,
} from "./types.js";

export class Engine {
  private map: EngineMap | undefined;
  private notices: Notice[] = [];
  private route: Route | undefined;
  private remainingRoute: Route | undefined;
  private lastNoWay: NoWayResult | undefined;
  private progress = 0;
  /** The last position fed to the engine; the start of any new route. */
  private lastPosition: Position | undefined;

  /** Load map file text. A failed load leaves the previous map in place. */
  loadMap(text: string): LoadResult {
    const result = parseMap(text);
    if ("map" in result) {
      this.map = result.map;
      this.notices = result.notices;
      this.route = undefined;
      this.remainingRoute = undefined;
      this.lastNoWay = undefined;
      this.progress = 0;
      this.lastPosition = undefined;
    }
    return result;
  }

  /** Every place with its name and category, for an application's search. */
  getPlaces(): PlaceData[] {
    return this.map ? this.map.places.map((place) => ({ ...place })) : [];
  }

  /** Roads left out of routing, each with its notices. */
  getBlockedRoads(): { roadId: string; notices: Notice[] }[] {
    if (!this.map) return [];
    return this.map.blockedRoads.map(({ roadId }) => ({
      roadId,
      notices: this.notices.filter((notice) => notice.roadId === roadId),
    }));
  }

  /**
   * Set the destination and find a route from the last known position.
   * Returns the route (with its length) or a No_Way_Result, which is also
   * kept for getLastNoWayResult. Bad input returns an error and changes nothing.
   */
  setDestination(destination: Destination): Route | NoWayResult | EngineError {
    if (!this.map) return noMapLoaded();
    const invalid = checkDestination(destination);
    if (invalid) return invalid;

    let found: Route | NoWayResult;
    if ("placeId" in destination && !this.map.places.some((place) => place.id === destination.placeId)) {
      found = {
        reason: "missing-place",
        message: `The map has no place with the id "${destination.placeId}", so there is no route to it.`,
        placeId: destination.placeId,
      };
    } else if (!this.lastPosition) {
      return badInput("position", "is not known yet, so feed a position before setting a destination");
    } else {
      found = findRoute(this.map, this.lastPosition, destination);
    }

    this.progress = 0;
    if ("parts" in found) {
      this.route = found;
      this.remainingRoute = found;
      this.lastNoWay = undefined;
    } else {
      this.route = undefined;
      this.remainingRoute = undefined;
      this.lastNoWay = found;
    }
    return found;
  }

  /** Forget the destination, the route and any No_Way_Result. */
  clearDestination(): void {
    this.route = undefined;
    this.remainingRoute = undefined;
    this.lastNoWay = undefined;
    this.progress = 0;
  }

  /** The whole route found for the current destination. */
  getRoute(): Route | undefined {
    return this.route;
  }

  /** The part of the route not yet travelled. */
  getRemainingRoute(): Route | undefined {
    return this.remainingRoute;
  }

  /** The reason the last destination could not be reached, if any. */
  getLastNoWayResult(): NoWayResult | undefined {
    return this.lastNoWay;
  }
}

function checkDestination(destination: Destination): EngineError | undefined {
  const value = destination as unknown;
  if (typeof value !== "object" || value === null) return badInput("destination", "must be a place id or a point");
  if ("placeId" in value) {
    return typeof value.placeId === "string" ? undefined : badInput("placeId", "must be text");
  }
  if ("point" in value) {
    const point = value.point as { x?: unknown; y?: unknown } | null;
    const ok =
      typeof point === "object" &&
      point !== null &&
      typeof point.x === "number" &&
      Number.isFinite(point.x) &&
      typeof point.y === "number" &&
      Number.isFinite(point.y);
    return ok ? undefined : badInput("point");
  }
  return badInput("destination", "must be a place id or a point");
}
