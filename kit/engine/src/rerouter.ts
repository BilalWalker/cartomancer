// Rerouter: decides when the player has left the route. Driven only by the
// timestamps passed in; it never reads the system clock.

import type { Point } from "./geometry";
import { offRouteDistance } from "./route-follower";
import type { Route } from "./types";

export const DEFAULT_REROUTE_MARGIN = 15;
export const DEFAULT_REROUTE_DELAY_MS = 1000;

export interface RerouterOptions {
  /** World units beyond the road edge before the player counts as off the route. */
  margin?: number;
  /** Milliseconds the player must stay beyond the margin before a request. */
  delayMs?: number;
}

export interface RerouterResult {
  requestReroute: boolean;
}

export class Rerouter {
  readonly margin: number;
  readonly delayMs: number;
  /** Timestamp at which the player went beyond the margin; undefined while within it. */
  private offSince: number | undefined;
  /** True after a request, until the player returns within the margin. */
  private fired = false;

  constructor(options: RerouterOptions = {}) {
    this.margin = options.margin ?? DEFAULT_REROUTE_MARGIN;
    this.delayMs = options.delayMs ?? DEFAULT_REROUTE_DELAY_MS;
  }

  /**
   * Feed the remaining route and the position with its timestamp. Returns
   * `requestReroute: true` once per stay beyond the margin, when the stay
   * has lasted the delay. A route with no parts (nothing left to be off) is
   * treated as within the margin: it cancels any timing and never requests.
   * A zero-length route still has one part, so it is measured normally.
   */
  update(
    remainingRoute: Route,
    position: Point,
    timestampMs: number,
    roadWidthOf: (roadId: string) => number,
  ): RerouterResult {
    const distance =
      remainingRoute.parts.length === 0
        ? 0
        : offRouteDistance(remainingRoute, position, roadWidthOf);

    if (!(distance > this.margin)) {
      this.offSince = undefined;
      this.fired = false;
      return { requestReroute: false };
    }
    if (this.fired) return { requestReroute: false };
    if (this.offSince === undefined) this.offSince = timestampMs;
    if (timestampMs - this.offSince >= this.delayMs) {
      this.fired = true;
      this.offSince = undefined;
      return { requestReroute: true };
    }
    return { requestReroute: false };
  }
}
