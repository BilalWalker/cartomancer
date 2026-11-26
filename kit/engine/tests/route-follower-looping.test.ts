import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { nearestPointOnSegment } from "../src/geometry";
import type { Point } from "../src/geometry";
import { advance, DEFAULT_SEARCH_WINDOW } from "../src/route-follower";
import type { Route } from "../src/types";
import { loopingRouteCaseArbitrary } from "./helpers/arbitraries";
import type { LoopingRouteCase } from "./helpers/arbitraries";

const EPS = 1e-6;
const SAMPLE_STEP = 2;

function partLength(p: { start: Point; end: Point }): number {
  return Math.hypot(p.end.x - p.start.x, p.end.y - p.start.y);
}

/** The point at `distance` along the route (clamped to its ends). */
function pointAt(route: Route, distance: number): Point {
  let start = 0;
  for (const p of route.parts) {
    const length = partLength(p);
    if (length > 0 && distance <= start + length) {
      const f = (distance - start) / length;
      return { x: p.start.x + (p.end.x - p.start.x) * f, y: p.start.y + (p.end.y - p.start.y) * f };
    }
    start += length;
  }
  const last = route.parts[route.parts.length - 1]!;
  return { x: last.end.x, y: last.end.y };
}

function distanceToRoute(parts: Route["parts"], point: Point): number {
  let best = Infinity;
  for (const p of parts) {
    best = Math.min(best, nearestPointOnSegment(point, p.start, p.end).distance);
  }
  return best;
}

/** Runs the follower over the sequence; returns how many positions had a closer stretch beyond the window. */
function checkCase(c: LoopingRouteCase, useDefaultWindow: boolean): number {
  const window = useDefaultWindow ? DEFAULT_SEARCH_WINDOW : c.searchWindow;
  const total = c.route.lengthWorldUnits;
  let progress = 0;
  let windowMattered = 0;
  for (const position of c.positions) {
    const previous = progress;
    const result = useDefaultWindow
      ? advance(c.route, previous, position)
      : advance(c.route, previous, position, window);
    progress = result.progress;

    // Progress never goes back and never jumps further than the window.
    expect(progress).toBeGreaterThanOrEqual(previous - EPS);
    expect(progress).toBeLessThanOrEqual(previous + window + EPS);

    // No part beyond the window is removed.
    expect(result.remaining.lengthWorldUnits).toBeGreaterThanOrEqual(total - (previous + window) - EPS);
    expect(result.remaining.lengthWorldUnits).toBeCloseTo(total - progress, 5);

    // Every untravelled stretch is still on the remaining route.
    for (let d = progress; d < total; d += SAMPLE_STEP) {
      expect(distanceToRoute(result.remaining.parts, pointAt(c.route, d))).toBeLessThanOrEqual(1e-5);
    }
    expect(distanceToRoute(result.remaining.parts, pointAt(c.route, total))).toBeLessThanOrEqual(1e-5);

    // Did a stretch beyond the window lie closer than the stretch at progress?
    const atProgress = Math.hypot(
      position.x - pointAt(c.route, progress).x,
      position.y - pointAt(c.route, progress).y,
    );
    let beyond = Infinity;
    for (let d = previous + window + SAMPLE_STEP; d <= total; d += SAMPLE_STEP) {
      const q = pointAt(c.route, d);
      beyond = Math.min(beyond, Math.hypot(position.x - q.x, position.y - q.y));
    }
    if (beyond < atProgress - 1e-9) windowMattered++;
  }
  return windowMattered;
}

describe("following looping routes", () => {
  // Feature: engine-core, Property 15: The follower never jumps ahead on a looping route
  // **Validates: Requirements 12.1, 12.2, 12.5, 12.6, 12.8**
  it("Property 15: caller-supplied and default windows never let progress jump ahead", () => {
    let windowMattered = 0;
    fc.assert(
      fc.property(loopingRouteCaseArbitrary(), fc.boolean(), (c, useDefault) => {
        const cc = useDefault ? { ...c, searchWindow: DEFAULT_SEARCH_WINDOW } : c;
        windowMattered += checkCase(cc, useDefault);
      }),
      { numRuns: 300 },
    );
    // Non-vacuity: the window decided the outcome in some cases.
    expect(windowMattered).toBeGreaterThan(0);
  });
});
