import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { advance, offRouteDistance } from "../src/route-follower";
import type { Route, RoutePart } from "../src/types";
import { mapRouteSequenceArbitrary } from "./helpers/arbitraries";

function part(roadId: string, sx: number, sy: number, ex: number, ey: number): RoutePart {
  return { roadId, direction: "forward", start: { x: sx, y: sy }, end: { x: ex, y: ey } };
}

function route(parts: RoutePart[]): Route {
  const lengthWorldUnits = parts.reduce(
    (sum, p) => sum + Math.hypot(p.end.x - p.start.x, p.end.y - p.start.y),
    0,
  );
  return { parts, lengthWorldUnits, destination: { point: { x: 0, y: 0 } } };
}

// Two straight parts: 100 units east, then 100 units south.
const lShape = route([part("a", 0, 0, 100, 0), part("b", 100, 0, 100, 100)]);

describe("route follower", () => {
  it("trims nothing when the player stands at the start", () => {
    const result = advance(lShape, 0, { x: 0, y: 0 });
    expect(result.progress).toBe(0);
    expect(result.remaining.lengthWorldUnits).toBeCloseTo(200);
    expect(result.remaining.parts).toHaveLength(2);
  });

  it("removes the part before a position on the route", () => {
    const result = advance(lShape, 0, { x: 40, y: 0 });
    expect(result.progress).toBeCloseTo(40);
    expect(result.remaining.lengthWorldUnits).toBeCloseTo(160);
    expect(result.remaining.parts[0].start).toEqual({ x: 40, y: 0 });
    expect(result.remaining.parts[1]).toEqual(lShape.parts[1]);
  });

  it("moves ahead into the next part and drops the finished one", () => {
    const result = advance(lShape, 40, { x: 100, y: 30 });
    expect(result.progress).toBeCloseTo(130);
    expect(result.remaining.parts).toHaveLength(1);
    expect(result.remaining.parts[0].roadId).toBe("b");
    expect(result.remaining.lengthWorldUnits).toBeCloseTo(70);
  });

  it("keeps the removed part removed when the player steps back", () => {
    const first = advance(lShape, 0, { x: 60, y: 0 });
    const back = advance(lShape, first.progress, { x: 20, y: 0 });
    expect(back.progress).toBeCloseTo(60);
    expect(back.remaining.lengthWorldUnits).toBeCloseTo(first.remaining.lengthWorldUnits);
    expect(back.remaining.parts[0].start).toEqual({ x: 60, y: 0 });
  });

  it("uses the nearest allowed point when the position is far away", () => {
    const result = advance(lShape, 0, { x: 5000, y: 5000 });
    // Window is 100, so the nearest point in range is the corner at distance 100.
    expect(result.progress).toBeCloseTo(100);
    expect(result.remaining.lengthWorldUnits).toBeCloseTo(100);
  });

  it("keeps progress at zero when the position is far behind the start", () => {
    const result = advance(lShape, 0, { x: -5000, y: 0 });
    expect(result.progress).toBe(0);
    expect(result.remaining.lengthWorldUnits).toBeCloseTo(200);
  });

  it("uses a caller-supplied window in place of the default 100", () => {
    const long = route([part("a", 0, 0, 500, 0)]);
    const defaultWindow = advance(long, 0, { x: 300, y: 0 });
    expect(defaultWindow.progress).toBeCloseTo(100);
    const wide = advance(long, 0, { x: 300, y: 0 }, 400);
    expect(wide.progress).toBeCloseTo(300);
    const narrow = advance(long, 0, { x: 300, y: 0 }, 20);
    expect(narrow.progress).toBeCloseTo(20);
  });

  it("does not jump to a closer later stretch beyond the window of a loop", () => {
    // East 200, south 10, west 200: the last stretch passes close to the first.
    const loop = route([
      part("a", 0, 0, 200, 0),
      part("b", 200, 0, 200, 10),
      part("c", 200, 10, 0, 10),
    ]);
    // (150, 10) lies on the last stretch (distance 260 along), beyond the window.
    const result = advance(loop, 0, { x: 150, y: 10 });
    expect(result.progress).toBeLessThanOrEqual(100);
    expect(result.progress).toBeCloseTo(100);
    // Nothing beyond the window is removed.
    expect(result.remaining.parts.slice(1)).toEqual(loop.parts.slice(1));
    expect(result.remaining.lengthWorldUnits).toBeCloseTo(loop.lengthWorldUnits - 100);
  });
});

describe("off-route distance", () => {
  const straight = route([part("r", 0, 0, 100, 0)]);
  const wide = (): number => 20;
  const narrow = (): number => 4;
  const margin = 15;

  it("is negative on the centre line", () => {
    expect(offRouteDistance(straight, { x: 50, y: 0 }, wide)).toBe(-10);
  });

  it("is zero at the road edge", () => {
    expect(offRouteDistance(straight, { x: 50, y: 10 }, wide)).toBe(0);
  });

  it("is exactly the margin at half width plus margin on a wide road", () => {
    const value = offRouteDistance(straight, { x: 50, y: 10 + margin }, wide);
    expect(value).toBe(margin);
    expect(value > margin).toBe(false);
  });

  it("is exactly the margin at half width plus margin on a narrow road", () => {
    const value = offRouteDistance(straight, { x: 50, y: 2 + margin }, narrow);
    expect(value).toBe(margin);
  });

  it("gives different values for the same centre-line distance on different widths", () => {
    const position = { x: 50, y: 20 };
    expect(offRouteDistance(straight, position, wide)).toBe(10);
    expect(offRouteDistance(straight, position, narrow)).toBe(18);
    expect(offRouteDistance(straight, position, wide) > margin).toBe(false);
    expect(offRouteDistance(straight, position, narrow) > margin).toBe(true);
  });

  it("uses the width of the road nearest to the position", () => {
    const two = route([part("a", 0, 0, 100, 0), part("b", 100, 0, 100, 100)]);
    const widthOf = (id: string): number => (id === "a" ? 10 : 30);
    expect(offRouteDistance(two, { x: 130, y: 50 }, widthOf)).toBe(15);
  });

  it("is infinite for an empty route", () => {
    expect(offRouteDistance(route([]), { x: 0, y: 0 }, wide)).toBe(Infinity);
  });
});

describe("following properties", () => {
  // Feature: engine-core, Property 14: Following the route never increases the distance left
  // **Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.7**
  it("Property 14: the distance left never grows and the removed part does not return", () => {
    const EPS = 1e-6;
    let advancedCases = 0;
    let backwardCases = 0;
    fc.assert(
      fc.property(mapRouteSequenceArbitrary(), ({ route, positions }) => {
        let previousRemaining = route.lengthWorldUnits;
        let progress = 0;
        let previousProjection = 0;
        let advanced = false;
        let backward = false;
        for (const position of positions) {
          // The nearest route point over the whole route, independent of the
          // follower's progress, shows whether the player stepped back.
          const projection = advance(route, 0, position, route.lengthWorldUnits).progress;
          if (projection < previousProjection - 0.1) backward = true;
          previousProjection = projection;

          const result = advance(route, progress, position);
          expect(result.progress).toBeGreaterThanOrEqual(progress);
          expect(result.remaining.lengthWorldUnits).toBeLessThanOrEqual(previousRemaining + EPS);
          expect(result.remaining.lengthWorldUnits).toBeLessThanOrEqual(route.lengthWorldUnits + EPS);
          // The removed part does not return: what is left is exactly the
          // route length minus the progress.
          expect(
            Math.abs(result.remaining.lengthWorldUnits - (route.lengthWorldUnits - result.progress)),
          ).toBeLessThan(1e-4);
          if (result.progress > progress + 1e-9) advanced = true;
          previousRemaining = result.remaining.lengthWorldUnits;
          progress = result.progress;
        }
        if (advanced) advancedCases++;
        if (backward) backwardCases++;
      }),
      { numRuns: 200 },
    );
    // Non-vacuity: progress moved forward and backward steps happened.
    expect(advancedCases).toBeGreaterThan(0);
    expect(backwardCases).toBeGreaterThan(0);
  });
});
