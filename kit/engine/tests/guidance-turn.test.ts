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
