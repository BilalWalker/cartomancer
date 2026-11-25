import { describe, expect, it } from "vitest";
import { distancePointToSegment, nearestPointOnSegment } from "../src/geometry";

describe("point to segment distance", () => {
  const a = { x: 0, y: 0 };
  const b = { x: 10, y: 0 };

  it("projects an interior point onto the segment", () => {
    const r = nearestPointOnSegment({ x: 4, y: 3 }, a, b);
    expect(r.point).toEqual({ x: 4, y: 0 });
    expect(r.t).toBeCloseTo(0.4);
    expect(r.distance).toBeCloseTo(3);
    expect(distancePointToSegment({ x: 4, y: 3 }, a, b)).toBeCloseTo(3);
  });

  it("clamps to the start point", () => {
    const r = nearestPointOnSegment({ x: -3, y: 4 }, a, b);
    expect(r.point).toEqual(a);
    expect(r.t).toBe(0);
    expect(r.distance).toBeCloseTo(5);
  });

  it("clamps to the end point", () => {
    const r = nearestPointOnSegment({ x: 13, y: 4 }, a, b);
    expect(r.point).toEqual(b);
    expect(r.t).toBe(1);
    expect(r.distance).toBeCloseTo(5);
  });

  it("handles a zero-length segment", () => {
    const r = nearestPointOnSegment({ x: 3, y: 4 }, a, a);
    expect(r.point).toEqual(a);
    expect(r.t).toBe(0);
    expect(r.distance).toBeCloseTo(5);
  });
});
