import { describe, expect, it } from "vitest";
import { advance } from "../src/route-follower";
import type { Route, RoutePart } from "../src/types";

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
