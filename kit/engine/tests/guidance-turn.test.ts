import { describe, expect, it } from "vitest";
import { computeGuidance } from "../src/guidance";
import type { Position, Route } from "../src/types";

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
