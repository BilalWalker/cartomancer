import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { computeGuidance } from "../src/guidance";
import { classifyTurn, headingOfSegment, signedAngleDifference } from "../src/geometry";
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

// Feature: engine-core, Property 21: The next turn is never straight on
// **Validates: Requirements 15.2, 15.9, 15.10, 15.11**
describe("computeGuidance: property, the next turn is never straight on", () => {
  // Each step has a heading in multiples of 15 degrees (so bends of exactly
  // 30 and 150 degrees occur) and a length of at least 11, so the route is
  // always longer than the arrival radius.
  const stepArb = fc.record({
    steps: fc.integer({ min: -12, max: 12 }),
    length: fc.integer({ min: 11, max: 60 }),
  });
  const routeArb = fc.tuple(
    fc.integer({ min: -100, max: 100 }),
    fc.integer({ min: -100, max: 100 }),
    fc.array(stepArb, { minLength: 1, maxLength: 8 }),
  );

  it("reports the first non straight-on joint, or no turn when none remains", () => {
    let withTurn = 0;
    let withoutTurn = 0;
    let skippedSomething = 0;
    fc.assert(
      fc.property(routeArb, ([x0, y0, steps]) => {
        const points: Pt[] = [{ x: x0, y: y0 }];
        for (const step of steps) {
          const last = points[points.length - 1]!;
          const radians = (step.steps * 15 * Math.PI) / 180;
          points.push({
            x: last.x + step.length * Math.cos(radians),
            y: last.y + step.length * Math.sin(radians),
          });
        }
        const route = routeThrough(...points);
        const firstHeading = headingOfSegment(points[0]!, points[1]!);
        const player: Position = { x: x0, y: y0, headingDegrees: firstHeading };
        const g = computeGuidance(route, player, route.destination, 0);

        // Reference answer, written straight from the requirement.
        let expectedTurn: string | undefined;
        let expectedDistance = 0;
        let skipped = 0;
        for (let i = 1; i + 1 < points.length; i++) {
          expectedDistance += Math.hypot(
            points[i]!.x - points[i - 1]!.x,
            points[i]!.y - points[i - 1]!.y,
          );
          const before = headingOfSegment(points[i - 1]!, points[i]!);
          const after = headingOfSegment(points[i]!, points[i + 1]!);
          const turn = classifyTurn(signedAngleDifference(before, after));
          if (turn !== "straight-on") {
            expectedTurn = turn;
            break;
          }
          skipped++;
        }

        expect(g.active).toBe(true);
        expect(g.arrived).toBe(false);
        expect(g.distanceLeftWorldUnits).toBeCloseTo(route.lengthWorldUnits, 6);
        expect(g.nextTurn as string | undefined).not.toBe("straight-on");
        if (expectedTurn === undefined) {
          withoutTurn++;
          expect(g.nextTurn).toBeUndefined();
          expect(g.distanceToTurnWorldUnits).toBeUndefined();
        } else {
          withTurn++;
          if (skipped > 0) skippedSomething++;
          expect(g.nextTurn).toBe(expectedTurn);
          expect(g.distanceToTurnWorldUnits).toBeCloseTo(expectedDistance, 6);
        }
      }),
      { numRuns: 300 },
    );
    expect(withTurn).toBeGreaterThan(0);
    expect(withoutTurn).toBeGreaterThan(0);
    expect(skippedSomething).toBeGreaterThan(0);
  });
});
