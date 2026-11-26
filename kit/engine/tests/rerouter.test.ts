import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Rerouter } from "../src/rerouter";
import { advance } from "../src/route-follower";
import type { Route } from "../src/types";
import { mapRouteSequenceArbitrary } from "./helpers/arbitraries";

// One straight road along y = 0, width 10 (edge at 5 from the centre line).
const road: Route = {
  parts: [{ roadId: "a", direction: "forward", start: { x: 0, y: 0 }, end: { x: 200, y: 0 } }],
  lengthWorldUnits: 200,
  destination: { point: { x: 200, y: 0 } },
};
const widthOf = () => 10;
const on = { x: 50, y: 0 };
// Edge distance 25 - 5 = 20 (beyond the default margin 15).
const off = { x: 50, y: 25 };
// Edge distance 10 (within the default margin).
const near = { x: 50, y: 15 };

describe("rerouter", () => {
  it("uses margin 15 and delay 1000 by default", () => {
    const r = new Rerouter();
    expect(r.margin).toBe(15);
    expect(r.delayMs).toBe(1000);
    // Exactly at the margin (edge distance 15) is not beyond it.
    expect(r.update(road, { x: 50, y: 20 }, 0, widthOf).requestReroute).toBe(false);
    expect(r.update(road, { x: 50, y: 20 }, 5000, widthOf).requestReroute).toBe(false);
    // Just beyond: nothing before the delay, a request at 1000 ms.
    expect(r.update(road, { x: 50, y: 20.5 }, 6000, widthOf).requestReroute).toBe(false);
    expect(r.update(road, { x: 50, y: 20.5 }, 6999, widthOf).requestReroute).toBe(false);
    expect(r.update(road, { x: 50, y: 20.5 }, 7000, widthOf).requestReroute).toBe(true);
  });

  it("honours a custom margin and delay", () => {
    const r = new Rerouter({ margin: 30, delayMs: 200 });
    expect(r.update(road, off, 0, widthOf).requestReroute).toBe(false);
    expect(r.update(road, off, 1000, widthOf).requestReroute).toBe(false);
    const wide = { x: 50, y: 40 }; // edge distance 35 > 30
    expect(r.update(road, wide, 2000, widthOf).requestReroute).toBe(false);
    expect(r.update(road, wide, 2199, widthOf).requestReroute).toBe(false);
    expect(r.update(road, wide, 2200, widthOf).requestReroute).toBe(true);
  });

  it("cancels when the player returns within the margin before the delay", () => {
    const r = new Rerouter();
    expect(r.update(road, off, 0, widthOf).requestReroute).toBe(false);
    expect(r.update(road, near, 900, widthOf).requestReroute).toBe(false);
    // A new stay starts at 1000, so 1000 ms later is needed again.
    expect(r.update(road, off, 1000, widthOf).requestReroute).toBe(false);
    expect(r.update(road, off, 1999, widthOf).requestReroute).toBe(false);
    expect(r.update(road, off, 2000, widthOf).requestReroute).toBe(true);
  });

  it("requests only once during one stay", () => {
    const r = new Rerouter();
    r.update(road, off, 0, widthOf);
    expect(r.update(road, off, 1000, widthOf).requestReroute).toBe(true);
    expect(r.update(road, off, 1500, widthOf).requestReroute).toBe(false);
    expect(r.update(road, off, 5000, widthOf).requestReroute).toBe(false);
  });

  it("requests again after the player returns and overstays afresh", () => {
    const r = new Rerouter();
    r.update(road, off, 0, widthOf);
    expect(r.update(road, off, 1000, widthOf).requestReroute).toBe(true);
    expect(r.update(road, on, 1100, widthOf).requestReroute).toBe(false);
    expect(r.update(road, off, 2000, widthOf).requestReroute).toBe(false);
    expect(r.update(road, off, 2999, widthOf).requestReroute).toBe(false);
    expect(r.update(road, off, 3000, widthOf).requestReroute).toBe(true);
  });

  it("never requests for an empty remaining route", () => {
    const r = new Rerouter();
    const empty: Route = { ...road, parts: [], lengthWorldUnits: 0 };
    expect(r.update(empty, off, 0, widthOf).requestReroute).toBe(false);
    expect(r.update(empty, off, 10000, widthOf).requestReroute).toBe(false);
  });

  it("measures a zero-length route (player at the destination) normally", () => {
    const r = new Rerouter();
    const zero: Route = {
      parts: [{ roadId: "a", direction: "forward", start: { x: 50, y: 0 }, end: { x: 50, y: 0 } }],
      lengthWorldUnits: 0,
      destination: { point: { x: 50, y: 0 } },
    };
    expect(r.update(zero, on, 0, widthOf).requestReroute).toBe(false);
    expect(r.update(zero, on, 10000, widthOf).requestReroute).toBe(false);
  });
});

describe("rerouter on the route (property)", () => {
  // Feature: engine-core, Property 18: Moving along the route never triggers a reroute
  // **Validates: Requirements 13.10**
  it("requests no reroute and the distance left never grows while moving along the route", () => {
    const EPS = 1e-6;
    let advancedCases = 0;
    fc.assert(
      fc.property(mapRouteSequenceArbitrary(), ({ map, route, positions }) => {
        expect(route.lengthWorldUnits).toBeGreaterThan(0);
        const widths = new Map(map.roads.map((r) => [r.id, r.width]));
        const roadWidthOf = (roadId: string): number => widths.get(roadId)!;
        const rerouter = new Rerouter();
        let progress = 0;
        let previousRemaining = route.lengthWorldUnits;
        let advanced = false;
        for (const position of positions) {
          const result = advance(route, progress, position);
          expect(result.remaining.lengthWorldUnits).toBeLessThanOrEqual(previousRemaining + EPS);
          const update = rerouter.update(
            result.remaining,
            position,
            position.timestampMs,
            roadWidthOf,
          );
          expect(update.requestReroute).toBe(false);
          if (result.progress > progress + 1e-9) advanced = true;
          progress = result.progress;
          previousRemaining = result.remaining.lengthWorldUnits;
        }
        if (advanced) advancedCases++;
      }),
      { numRuns: 200 },
    );
    // Non-vacuity: routes had positive length and progress advanced.
    expect(advancedCases).toBeGreaterThan(0);
  });
});
