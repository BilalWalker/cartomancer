import { describe, expect, it } from "vitest";
import { computeGuidance } from "../src/guidance";
import { headingOfSegment, signedAngleDifference } from "../src/geometry";
import type { Position, Route } from "../src/types";

type Pt = { x: number; y: number };

const position: Position = { x: 0, y: 0, headingDegrees: 0 };

function routeThrough(...points: Pt[]): Route {
  const parts = [];
  let length = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const start = points[i]!;
    const end = points[i + 1]!;
    parts.push({ roadId: `r${i}`, direction: "forward" as const, start, end });
    length += Math.hypot(end.x - start.x, end.y - start.y);
  }
  return { parts, lengthWorldUnits: length, destination: { point: points[points.length - 1]! } };
}

/** A route going right 100 units, then bending by the given angle in degrees. */
function bentRoute(angleDegrees: number): Route {
  const radians = (angleDegrees * Math.PI) / 180;
  const corner = { x: 100, y: 0 };
  const end = { x: corner.x + 50 * Math.cos(radians), y: 50 * Math.sin(radians) };
  return routeThrough({ x: 0, y: 0 }, corner, end);
}

describe("computeGuidance: straight-on skipping", () => {
  it("skips several straight-on points and reports the left turn at its distance", () => {
    const route = routeThrough(
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 40, y: 5 },
      { x: 70, y: 5 },
      { x: 100, y: 0 },
      { x: 100, y: -40 },
    );
    const g = computeGuidance(route, position, route.destination, 0);
    expect(g.nextTurn).toBe("left");
    const toTurn =
      20 + Math.hypot(20, 5) + 30 + Math.hypot(30, 5);
    expect(g.distanceToTurnWorldUnits).toBeCloseTo(toTurn);
    expect(g.distanceLeftWorldUnits).toBeCloseTo(toTurn + 40);
  });

  it("reports a distance left and no next turn when every point is straight on", () => {
    const route = routeThrough(
      { x: 0, y: 0 },
      { x: 25, y: 0 },
      { x: 50, y: 10 },
      { x: 90, y: 10 },
      { x: 120, y: 0 },
    );
    const g = computeGuidance(route, position, route.destination, 0);
    expect(g.active).toBe(true);
    expect(g.nextTurn).toBeUndefined();
    expect(g.distanceToTurnWorldUnits).toBeUndefined();
    expect(g.distanceLeftWorldUnits).toBeCloseTo(route.lengthWorldUnits);
  });

  it("skips a point at exactly 30 degrees", () => {
    // Exact 30 degree bend: direction (sqrt 3, 1) has heading 30 after the first part's heading 0.
    const end = { x: 100 + 50 * Math.sqrt(3), y: 50 };
    const route = routeThrough({ x: 0, y: 0 }, { x: 100, y: 0 }, end);
    const delta = signedAngleDifference(0, headingOfSegment({ x: 100, y: 0 }, end));
    expect(delta).toBeCloseTo(30, 10);
    expect(delta).toBeLessThanOrEqual(30);
    const g = computeGuidance(route, position, route.destination, 0);
    expect(g.nextTurn).toBeUndefined();
  });

  it("reports a point just above 30 degrees as a right turn", () => {
    const route = bentRoute(30.5);
    const g = computeGuidance(route, position, route.destination, 0);
    expect(g.nextTurn).toBe("right");
    expect(g.distanceToTurnWorldUnits).toBeCloseTo(100);
  });

  it("reports a point just above 30 degrees on the left side as a left turn", () => {
    const route = bentRoute(-30.5);
    const g = computeGuidance(route, position, route.destination, 0);
    expect(g.nextTurn).toBe("left");
    expect(g.distanceToTurnWorldUnits).toBeCloseTo(100);
  });
});
