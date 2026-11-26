import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { computeGuidance } from "../src/guidance";
import type { Position, Route } from "../src/types";

const position: Position = { x: 0, y: 0, headingDegrees: 0 };

/** A straight route to the right with a bend at the end so a turn exists. */
function routeOfLength(length: number): Route {
  const start = { x: 0, y: 0 };
  const corner = { x: length / 2, y: 0 };
  const end = { x: length / 2, y: -length / 2 };
  return {
    parts: [
      { roadId: "a", direction: "forward", start, end: corner },
      { roadId: "b", direction: "forward", start: corner, end },
    ],
    lengthWorldUnits: length,
    destination: { point: end },
  };
}

describe("computeGuidance: arrival along the route", () => {
  it("is arrived just inside the radius, with zero distance and no turn", () => {
    const g = computeGuidance(routeOfLength(9.99), position, undefined, 0);
    expect(g.arrived).toBe(true);
    expect(g.distanceLeftWorldUnits).toBe(0);
    expect(g.nextTurn).toBeUndefined();
    expect(g.distanceToTurnWorldUnits).toBeUndefined();
  });

  it("is arrived exactly on the radius", () => {
    const g = computeGuidance(routeOfLength(10), position, undefined, 0);
    expect(g.arrived).toBe(true);
    expect(g.distanceLeftWorldUnits).toBe(0);
  });

  it("is not arrived just outside the radius", () => {
    const g = computeGuidance(routeOfLength(10.01), position, undefined, 0);
    expect(g.arrived).toBe(false);
    expect(g.distanceLeftWorldUnits).toBeCloseTo(10.01);
    expect(g.nextTurn).toBe("left");
  });

  it("uses a custom radius", () => {
    expect(computeGuidance(routeOfLength(30), position, undefined, 0, 15, 30).arrived).toBe(true);
    expect(computeGuidance(routeOfLength(30.5), position, undefined, 0, 15, 30).arrived).toBe(false);
    expect(computeGuidance(routeOfLength(9), position, undefined, 0, 15, 5).arrived).toBe(false);
  });

  it("is not arrived within the radius but beyond the margin", () => {
    const g = computeGuidance(routeOfLength(5), position, undefined, 15.01);
    expect(g.arrived).toBe(false);
    expect(g.distanceLeftWorldUnits).toBeCloseTo(5);
  });

  it("is arrived when the off-route distance equals the margin", () => {
    expect(computeGuidance(routeOfLength(5), position, undefined, 15).arrived).toBe(true);
  });
});

// Feature: engine-core, Property 22: Arrival depends on distance along the route and on being on the route
// **Validates: Requirements 15.5, 15.6, 15.12**
describe("computeGuidance: property, arrival along the route", () => {
  type Pt = { x: number; y: number };

  // Routes wander in multiples of 15 degrees, so they bend, loop back and
  // end close to where they started while still being long.
  const stepArb = fc.record({
    steps: fc.integer({ min: -12, max: 12 }),
    length: fc.integer({ min: 1, max: 40 }),
  });
  const caseArb = fc.record({
    x0: fc.integer({ min: -100, max: 100 }),
    y0: fc.integer({ min: -100, max: 100 }),
    steps: fc.array(stepArb, { minLength: 1, maxLength: 8 }),
    // Radius is either free or pinned to the route length (the boundary).
    radiusKind: fc.constantFrom("free", "at-length", "just-below"),
    radiusFree: fc.integer({ min: 1, max: 80 }),
    margin: fc.integer({ min: 1, max: 30 }),
    offKind: fc.constantFrom("free", "at-margin", "just-over"),
    offFree: fc.integer({ min: 0, max: 40 }),
    heading: fc.integer({ min: -180, max: 180 }),
    farX: fc.integer({ min: -5000, max: 5000 }),
    farY: fc.integer({ min: -5000, max: 5000 }),
  });

  it("is set exactly when the route left is within the radius and the player is on the route", () => {
    let arrived = 0;
    let notArrived = 0;
    let offRouteBlocked = 0;
    let straightLineClose = 0;
    fc.assert(
      fc.property(caseArb, (c) => {
        const points: Pt[] = [{ x: c.x0, y: c.y0 }];
        for (const step of c.steps) {
          const last = points[points.length - 1]!;
          const radians = (step.steps * 15 * Math.PI) / 180;
          points.push({
            x: last.x + step.length * Math.cos(radians),
            y: last.y + step.length * Math.sin(radians),
          });
        }
        const parts = [];
        let length = 0;
        for (let i = 0; i + 1 < points.length; i++) {
          parts.push({
            roadId: `r${i}`,
            direction: "forward" as const,
            start: points[i]!,
            end: points[i + 1]!,
          });
          length += Math.hypot(points[i + 1]!.x - points[i]!.x, points[i + 1]!.y - points[i]!.y);
        }
        const destinationPoint = points[points.length - 1]!;
        const route: Route = { parts, lengthWorldUnits: length, destination: { point: destinationPoint } };

        const radius =
          c.radiusKind === "at-length"
            ? length
            : c.radiusKind === "just-below"
              ? length - 0.001
              : c.radiusFree;
        const off =
          c.offKind === "at-margin"
            ? c.margin
            : c.offKind === "just-over"
              ? c.margin + 0.001
              : c.offFree;

        const expectedArrived = length <= radius && off <= c.margin;

        const here: Position = { x: c.x0, y: c.y0, headingDegrees: c.heading };
        const atDestination: Position = { ...here, x: destinationPoint.x, y: destinationPoint.y };
        const far: Position = { ...here, x: c.farX, y: c.farY };

        const g = computeGuidance(route, here, route.destination, off, c.margin, radius);
        expect(g.active).toBe(true);
        expect(g.arrived).toBe(expectedArrived);

        // The straight-line position never decides the outcome.
        const gNear = computeGuidance(route, atDestination, route.destination, off, c.margin, radius);
        const gFar = computeGuidance(route, far, route.destination, off, c.margin, radius);
        expect(gNear.arrived).toBe(expectedArrived);
        expect(gFar.arrived).toBe(expectedArrived);

        if (expectedArrived) {
          arrived++;
          expect(g.distanceLeftWorldUnits).toBe(0);
          expect(g.nextTurn).toBeUndefined();
          expect(g.distanceToTurnWorldUnits).toBeUndefined();
        } else {
          notArrived++;
          expect(g.distanceLeftWorldUnits).toBeCloseTo(length, 6);
          if (length <= radius) offRouteBlocked++;
          if (
            Math.hypot(c.x0 - destinationPoint.x, c.y0 - destinationPoint.y) <= radius &&
            length > radius
          ) {
            straightLineClose++;
          }
        }
      }),
      { numRuns: 300 },
    );
    expect(arrived).toBeGreaterThan(0);
    expect(notArrived).toBeGreaterThan(0);
    expect(offRouteBlocked).toBeGreaterThan(0);
    expect(straightLineClose).toBeGreaterThan(0);
  });
});
