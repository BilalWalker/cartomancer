import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Engine } from "../src/engine.js";
import { saveMap } from "../src/map-saver.js";
import { snapToRoad } from "../src/snapping.js";
import type { Destination, Position, Route } from "../src/types.js";
import { smallMapRouteArbitrary } from "./helpers/arbitraries.js";

/** A position far outside the small maps, so the player is well beyond the margin. */
const farPosition = fc
  .record({
    x: fc.integer({ min: 150, max: 400 }),
    y: fc.integer({ min: -400, max: 400 }),
    swap: fc.boolean(),
    negative: fc.boolean(),
    headingDegrees: fc.integer({ min: -179, max: 180 }),
  })
  .map(({ x, y, swap, negative, headingDegrees }): Position => {
    const sign = negative ? -1 : 1;
    return swap
      ? { x: y, y: sign * x, headingDegrees }
      : { x: sign * x, y, headingDegrees };
  });

describe("reroute result", () => {
  // Feature: engine-core, Property 19: A reroute starts where the player is and keeps the destination
  // **Validates: Requirements 14.1, 14.2, 14.3**
  it("starts the new route at the player and ends it at the same destination", () => {
    let rerouted = 0;
    let atPlayer = 0;
    fc.assert(
      fc.property(smallMapRouteArbitrary(), farPosition, (c, away) => {
        const engine = new Engine();
        expect(("map" in engine.loadMap(saveMap(c.map)))).toBe(true);
        engine.feedPosition(c.start, 0);
        const destination: Destination = c.destination;
        const first = engine.setDestination(destination);
        fc.pre("parts" in first && first.parts.length > 0);
        const oldRoute = first as Route;
        const oldEnd = oldRoute.parts[oldRoute.parts.length - 1]!.end;

        engine.feedPosition(away, 1000);
        engine.feedPosition(away, 2000);
        const next = engine.getRoute();
        fc.pre(next !== undefined && next !== oldRoute && next.parts.length > 0);
        rerouted++;

        const snappedPlayer = snapToRoad(c.map, away);
        expect("roadId" in snappedPlayer).toBe(true);
        const startPoint = next!.parts[0]!.start;
        expect(startPoint.x).toBeCloseTo((snappedPlayer as { x: number }).x, 9);
        expect(startPoint.y).toBeCloseTo((snappedPlayer as { y: number }).y, 9);
        const endPoint = next!.parts[next!.parts.length - 1]!.end;
        expect(endPoint.x).toBeCloseTo(oldEnd.x, 9);
        expect(endPoint.y).toBeCloseTo(oldEnd.y, 9);
        expect(next!.destination).toEqual(destination);
        atPlayer++;
      }),
      { numRuns: 200 },
    );
    // Non-vacuity: reroutes were found and checked.
    expect(rerouted).toBeGreaterThanOrEqual(20);
    expect(atPlayer).toBe(rerouted);
  });
});
