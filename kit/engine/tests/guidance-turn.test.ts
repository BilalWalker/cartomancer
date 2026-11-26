import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { classifyTurn, headingOfSegment, signedAngleDifference } from "../src/geometry";
import { computeGuidance } from "../src/guidance";
import { findRoute } from "../src/route-finder";
import type { Position, Route } from "../src/types";
import { gridRouteArbitrary, smallMapRouteArbitrary } from "./helpers/arbitraries";

const position: Position = { x: 0, y: 0, headingDegrees: 0 };

describe("computeGuidance: distance left and inactive state", () => {
  it("gives distance left equal to the remaining route length", () => {
    const route: Route = {
      parts: [
        { roadId: "r1", direction: "forward", start: { x: 0, y: 0 }, end: { x: 40, y: 0 } },
      ],
      lengthWorldUnits: 40,
      destination: { point: { x: 40, y: 0 } },
    };
    const g = computeGuidance(route, position, route.destination, 0);
    expect(g.active).toBe(true);
    expect(g.distanceLeftWorldUnits).toBe(40);
    expect(g.nextTurn).toBeUndefined();
  });

  it("gives the inactive guidance when there is no route", () => {
    const g = computeGuidance(undefined, position, undefined, 0);
    expect(g).toEqual({ active: false });
    expect(g.distanceLeftWorldUnits).toBeUndefined();
    expect(g.nextTurn).toBeUndefined();
  });
});

type Pt = { x: number; y: number };

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

describe("computeGuidance: next turn per class", () => {
  const cases: Array<[string, Pt, string]> = [
    ["left", { x: 50, y: -50 }, "left"],
    ["right", { x: 50, y: 50 }, "right"],
    ["turn back", { x: 0, y: 5 }, "turn-back"],
  ];
  for (const [name, last, expected] of cases) {
    it(`reports ${name} with the distance to the joint`, () => {
      const route = routeThrough({ x: 0, y: 0 }, { x: 50, y: 0 }, last);
      const g = computeGuidance(route, position, route.destination, 0);
      expect(g.nextTurn).toBe(expected);
      expect(g.distanceToTurnWorldUnits).toBeCloseTo(50);
    });
  }

  it("reports no next turn for a straight route and keeps the distance left", () => {
    const route = routeThrough({ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 });
    const g = computeGuidance(route, position, route.destination, 0);
    expect(g.nextTurn).toBeUndefined();
    expect(g.distanceToTurnWorldUnits).toBeUndefined();
    expect(g.distanceLeftWorldUnits).toBeCloseTo(100);
  });

  it("skips a straight-on joint and reports the later turn", () => {
    const route = routeThrough({ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 60, y: 0 }, { x: 60, y: -40 });
    const g = computeGuidance(route, position, route.destination, 0);
    expect(g.nextTurn).toBe("left");
    expect(g.distanceToTurnWorldUnits).toBeCloseTo(60);
  });
});

describe("computeGuidance: turn back from the player heading", () => {
  const route = routeThrough({ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 });

  it("does not turn the player back at exactly 150 degrees", () => {
    const g = computeGuidance(route, { x: 0, y: 0, headingDegrees: 150 }, route.destination, 0);
    expect(g.nextTurn).toBeUndefined();
  });

  it("turns the player back at 151 degrees, at distance zero", () => {
    const g = computeGuidance(route, { x: 0, y: 0, headingDegrees: 151 }, route.destination, 0);
    expect(g.nextTurn).toBe("turn-back");
    expect(g.distanceToTurnWorldUnits).toBe(0);
    expect(g.distanceLeftWorldUnits).toBeCloseTo(100);
  });

  it("turns the player back at minus 151 degrees as well", () => {
    const g = computeGuidance(route, { x: 0, y: 0, headingDegrees: -151 }, route.destination, 0);
    expect(g.nextTurn).toBe("turn-back");
    expect(g.distanceToTurnWorldUnits).toBe(0);
  });
});

// Feature: engine-core, Property 20: Turn classification follows the signed angle bands
// **Validates: Requirements 15.3, 15.4**
describe("Property 20: turn classification follows the signed angle bands", () => {
  // Expected class from the bands, written without the engine helpers.
  function expectedClass(change: number): string {
    const size = Math.abs(change);
    if (size <= 30) return "straight-on";
    if (size > 150) return "turn-back";
    return change > 0 ? "right" : "left";
  }

  it("classifies the normalised change of two headings by the bands", () => {
    const seen = new Set<string>();
    let boundaryCases = 0;
    let wrapCases = 0;
    fc.assert(
      fc.property(
        fc.integer({ min: -360, max: 360 }),
        fc.integer({ min: -180, max: 180 }),
        (before, rawChange) => {
          const after = before + rawChange;
          // Normalise to (-180, 180]: -180 and 180 are the same turn.
          const change = rawChange === -180 ? 180 : rawChange;
          const delta = signedAngleDifference(before, after);
          expect(delta).toBeCloseTo(change, 9);
          const cls = classifyTurn(delta);
          expect(cls).toBe(expectedClass(change));
          seen.add(cls);
          if (Math.abs(change) === 30 || Math.abs(change) === 150) boundaryCases++;
          if (after > 180 || after < -180) wrapCases++;
        },
      ),
      { numRuns: 500 },
    );
    expect([...seen].sort()).toEqual(["left", "right", "straight-on", "turn-back"]);
    expect(boundaryCases).toBeGreaterThan(0);
    expect(wrapCases).toBeGreaterThan(0);
  });

  it("hits both band edges exactly, with both signs", () => {
    for (const [change, cls] of [
      [30, "straight-on"],
      [-30, "straight-on"],
      [31, "right"],
      [-31, "left"],
      [150, "right"],
      [-150, "left"],
      [151, "turn-back"],
      [-151, "turn-back"],
      [180, "turn-back"],
      [-180, "turn-back"],
    ] as const) {
      expect(classifyTurn(signedAngleDifference(170, 170 + change))).toBe(cls);
    }
  });

  it("applies the same bands to the player heading against the first route part", () => {
    let turnBacks = 0;
    let others = 0;
    fc.assert(
      fc.property(
        fc.constantFrom(0, 90, 180, -90),
        fc.integer({ min: -180, max: 180 }),
        (partHeading, rawChange) => {
          const dx = partHeading === 0 ? 50 : partHeading === 180 ? -50 : 0;
          const dy = partHeading === 90 ? 50 : partHeading === -90 ? -50 : 0;
          const route = routeThrough({ x: 0, y: 0 }, { x: dx, y: dy });
          const player: Position = { x: 0, y: 0, headingDegrees: partHeading - rawChange };
          const g = computeGuidance(route, player, route.destination, 0);
          // Player heading minus the change means part heading is player + change.
          if (expectedClass(rawChange === -180 ? 180 : rawChange) === "turn-back") {
            turnBacks++;
            expect(g.nextTurn).toBe("turn-back");
            expect(g.distanceToTurnWorldUnits).toBe(0);
          } else {
            others++;
            expect(g.nextTurn).toBeUndefined();
          }
          expect(g.distanceLeftWorldUnits).toBeCloseTo(50);
        },
      ),
      { numRuns: 500 },
    );
    expect(turnBacks).toBeGreaterThan(0);
    expect(others).toBeGreaterThan(0);
  });
});

// Feature: engine-core, Property 23: Guidance distance left starts equal to route length
// **Validates: Requirements 15.1, 15.8**
describe("Property 23: guidance distance left starts equal to route length", () => {
  it("equals the route length at the route start, within 0.000001", () => {
    let cases = 0;
    let found = 0;
    let withLength = 0;
    let beyondDefaultRadius = 0;
    fc.assert(
      fc.property(fc.oneof(smallMapRouteArbitrary(), gridRouteArbitrary()), ({ map, start, destination }) => {
        cases++;
        const result = findRoute(map, start, destination);
        if (!("parts" in result)) return;
        found++;
        const first = result.parts[0];
        const here: Position =
          first === undefined
            ? start
            : {
                x: first.start.x,
                y: first.start.y,
                headingDegrees: headingOfSegment(first.start, first.end),
              };

        // Radius zero keeps arrival from replacing the distance with zero
        // (a zero-length route is then arrived with distance zero, equal to its length).
        const g = computeGuidance(result, here, destination, 0, 15, 0);
        expect(g.active).toBe(true);
        expect(Math.abs(g.distanceLeftWorldUnits! - result.lengthWorldUnits)).toBeLessThanOrEqual(1e-6);

        if (result.lengthWorldUnits > 0) withLength++;
        if (result.lengthWorldUnits > 10) {
          beyondDefaultRadius++;
          // With the default radius the distance is the route length as well.
          const d = computeGuidance(result, here, destination, 0);
          expect(Math.abs(d.distanceLeftWorldUnits! - result.lengthWorldUnits)).toBeLessThanOrEqual(1e-6);
        }
      }),
      { numRuns: 200 },
    );
    expect(cases).toBeGreaterThanOrEqual(200);
    expect(found).toBeGreaterThan(0);
    expect(withLength).toBeGreaterThan(0);
    expect(beyondDefaultRadius).toBeGreaterThan(0);
  });
});
