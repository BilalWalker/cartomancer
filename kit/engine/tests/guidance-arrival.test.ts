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
