// The Engine class: the one object an application talks to.

import { badInput, noMapLoaded } from "./errors.js";
import { computeGuidance } from "./guidance.js";
import { toSentence } from "./guidance-text.js";
import { parseMap } from "./map-loader.js";
import { Rerouter } from "./rerouter.js";
import { findRoute } from "./route-finder.js";
import { advance, DEFAULT_SEARCH_WINDOW, offRouteDistance } from "./route-follower.js";
import type {
  Destination,
  EngineError,
  EngineMap,
  EngineOptions,
  Guidance,
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
  private options: EngineOptions = {
    searchWindow: DEFAULT_SEARCH_WINDOW,
    rerouteMargin: 15,
    rerouteDelayMs: 1000,
    arrivalRadius: 10,
  };
  /** The last position fed to the engine; the start of any new route. */
  private lastPosition: Position | undefined;
  /** The destination last set, kept for guidance. */
  private destination: Destination | undefined;
  /** Decides when the player has left the route; reset with each new destination. */
  private rerouter: Rerouter | undefined;

  /** Load map file text. A failed load leaves the previous map in place. */
  loadMap(text: string): LoadResult {
    if (typeof (text as unknown) !== "string") {
      return { errors: [badInput("text", "must be the map file text")] };
    }
    const result = parseMap(text);
    if ("map" in result) {
      this.map = result.map;
      this.notices = result.notices;
      this.route = undefined;
      this.remainingRoute = undefined;
      this.lastNoWay = undefined;
      this.progress = 0;
      this.lastPosition = undefined;
      this.rerouter = undefined;
      this.destination = undefined;
    }
    return result;
  }

  /** Every place with its name and category, for an application's search. */
  getPlaces(): PlaceData[] {
    return this.map ? this.map.places.map((place) => ({ ...place })) : [];
  }

  /** A copy of the loaded map for read access, or undefined before a map is loaded. */
  getMap(): EngineMap | undefined {
    return this.map ? structuredClone(this.map) : undefined;
  }

  /** A copy of the last position fed to the engine, or undefined before one is fed or after a map is loaded. */
  getPosition(): Position | undefined {
    return this.lastPosition ? { ...this.lastPosition } : undefined;
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
    this.rerouter = undefined;
    this.destination = destination;
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

  /**
   * Feed the player's position. Keeps the follower progress and trims the
   * remaining route. Returns an error and changes nothing for bad input or
   * when no map is loaded.
   */
  feedPosition(position: Position, timestampMs: number): EngineError | undefined {
    if (!this.map) return noMapLoaded();
    const value = position as unknown as { x?: unknown; y?: unknown; headingDegrees?: unknown } | null;
    if (typeof value !== "object" || value === null) return badInput("position", "must be an object with x, y and headingDegrees");
    if (!isFiniteNumber(value.x)) return badInput("position.x");
    if (!isFiniteNumber(value.y)) return badInput("position.y");
    if (!isFiniteNumber(value.headingDegrees)) return badInput("position.headingDegrees");
    if (!isFiniteNumber(timestampMs)) return badInput("timestampMs");

    this.lastPosition = { x: value.x, y: value.y, headingDegrees: value.headingDegrees };
    if (this.route) {
      const result = advance(this.route, this.progress, this.lastPosition, this.options.searchWindow);
      this.progress = result.progress;
      this.remainingRoute = result.remaining;
      this.rerouteIfLeft(this.map, this.lastPosition, timestampMs);
    }
    return undefined;
  }

  /** Ask the rerouter whether the player has left the route; if so, find a new route. */
  private rerouteIfLeft(map: EngineMap, position: Position, timestampMs: number): void {
    if (!this.remainingRoute || !this.destination) return;
    const widths = new Map(map.roads.map((road) => [road.id, road.width]));
    const decision = this.getRerouter().update(
      this.remainingRoute,
      position,
      timestampMs,
      (roadId) => widths.get(roadId) ?? 0,
    );
    if (!decision.requestReroute) return;
    const found = findRoute(map, position, this.destination);
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
  }

  /** The rerouter for the current options; rebuilt when the options change. */
  private getRerouter(): Rerouter {
    if (
      !this.rerouter ||
      this.rerouter.margin !== this.options.rerouteMargin ||
      this.rerouter.delayMs !== this.options.rerouteDelayMs
    ) {
      this.rerouter = new Rerouter({
        margin: this.options.rerouteMargin,
        delayMs: this.options.rerouteDelayMs,
      });
    }
    return this.rerouter;
  }

  /**
   * Change the tuning options. Only the fields given change. Bad input
   * returns an error and changes nothing.
   */
  configure(options: Partial<EngineOptions>): EngineError | undefined {
    const value = options as unknown;
    if (typeof value !== "object" || value === null) return badInput("options", "must be an object");
    const given = value as Record<string, unknown>;
    for (const key of OPTION_KEYS) {
      const entry = given[key];
      if (entry !== undefined && !(isFiniteNumber(entry) && entry >= 0)) {
        return badInput(key, "must be a number that is zero or more");
      }
    }
    for (const key of OPTION_KEYS) {
      const entry = given[key];
      if (entry !== undefined) this.options[key] = entry as number;
    }
    return undefined;
  }

  /** Forget the destination, the route and any No_Way_Result. */
  clearDestination(): void {
    this.route = undefined;
    this.remainingRoute = undefined;
    this.lastNoWay = undefined;
    this.progress = 0;
    this.rerouter = undefined;
    this.destination = undefined;
  }

  /** Guidance data for the remaining route; inactive when there is no route. */
  getGuidance(): Guidance {
    const position = this.lastPosition;
    const map = this.map;
    if (!map || !position || !this.remainingRoute) return { active: false };
    const widths = new Map(map.roads.map((road) => [road.id, road.width]));
    const widthOf = (roadId: string): number => widths.get(roadId) ?? 0;
    const off =
      this.remainingRoute.parts.length === 0
        ? 0
        : offRouteDistance(this.remainingRoute, position, widthOf);
    return computeGuidance(
      this.remainingRoute,
      position,
      this.destination,
      off,
      this.options.rerouteMargin,
      this.options.arrivalRadius,
    );
  }

  /** The guidance in plain words. */
  getGuidanceSentence(): string {
    let placeName: string | undefined;
    if (this.map && this.destination && "placeId" in this.destination) {
      const id = this.destination.placeId;
      placeName = this.map.places.find((place) => place.id === id)?.name;
    }
    return toSentence(this.getGuidance(), this.lastNoWay, placeName);
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

const OPTION_KEYS = ["searchWindow", "rerouteMargin", "rerouteDelayMs", "arrivalRadius"] as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
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
