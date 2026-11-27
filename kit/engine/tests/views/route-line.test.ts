import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Position, Route, RoutePart } from "../../src/types";
import { createCamera, screenToWorld, type Camera, type Point } from "../../src/views/camera";
import {
  drawDestinationMarker,
  drawPlayerMarker,
  drawRouteLine,
  validatePosition,
  validateRoute,
} from "../../src/views/layers-route";
import { RecordingCanvas, type Matrix } from "../../src/views/recording-canvas";
import { DEFAULT_STYLE } from "../../src/views/style";
import { isViewError } from "../../src/views/view-errors";
import { cameraArb, worldPointClose } from "./helpers/view-arbitraries";

function routeOf(points: Point[]): Route {
  const parts: RoutePart[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    parts.push({
      roadId: `r${i}`,
      direction: "forward",
      start: points[i]!,
      end: points[i + 1]!,
    });
  }
  return { parts, lengthWorldUnits: 0, destination: { point: points[points.length - 1]! } };
}

function camera(init: Partial<Camera> = {}): Camera {
  const made = createCamera({ viewportWidth: 400, viewportHeight: 300, ...init });
  if (isViewError(made)) throw new Error(made.message);
  return made;
}

/** Sets the camera transform on a canvas the way a View does. */
function applyCamera(canvas: RecordingCanvas, cam: Camera): void {
  canvas.translate(cam.viewportWidth / 2, cam.viewportHeight / 2);
  canvas.rotate((cam.rotationDegrees * Math.PI) / 180);
  canvas.scale(cam.zoom, cam.zoom);
  canvas.translate(-cam.centerX, -cam.centerY);
}

function apply(m: Matrix, x: number, y: number): Point {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

describe("route line", () => {
  // Feature: map-views, Property 6: Route line lies on the remaining route
  // **Validates: Requirements 7.8**
  it("Property 6: every drawn point, taken back to world space, lies on the remaining route", () => {
    const scenario = cameraArb.chain((cam) =>
      fc
        .array(worldPointClose(cam), { minLength: 2, maxLength: 8 })
        .map((points) => ({ cam, points })),
    );
    fc.assert(
      fc.property(scenario, ({ cam, points }) => {
        const route = routeOf(points);
        const canvas = new RecordingCanvas();
        applyCamera(canvas, cam);
        expect(drawRouteLine(canvas, route, cam, DEFAULT_STYLE)).toEqual([]);
        const drawn = [...canvas.findCalls("moveTo"), ...canvas.findCalls("lineTo")];
        expect(drawn.length).toBeGreaterThan(0);
        for (const call of drawn) {
          const [x, y] = call.args as [number, number];
          const screen = apply(call.state.transform, x, y);
          const world = screenToWorld(cam, screen);
          if (isViewError(world)) throw new Error(world.message);
          const nearest = Math.min(
            ...route.parts.map((p) => distanceToSegment(world, p.start, p.end)),
          );
          expect(nearest).toBeLessThanOrEqual(0.01);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("draws the outline below the fill with round joins and caps", () => {
    const canvas = new RecordingCanvas();
    const cam = camera();
    drawRouteLine(canvas, routeOf([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]), cam, DEFAULT_STYLE);
    const strokes = canvas.findCalls("stroke");
    expect(strokes).toHaveLength(2);
    expect(strokes[0]!.state.strokeColor).toBe(DEFAULT_STYLE.routeLineOutlineColor);
    expect(strokes[1]!.state.strokeColor).toBe(DEFAULT_STYLE.routeLineColor);
    expect(strokes[0]!.state.lineWidth).toBeGreaterThan(strokes[1]!.state.lineWidth);
    expect(canvas.findCalls("setLineJoin")[0]!.args).toEqual(["round"]);
    expect(canvas.findCalls("setLineCap")[0]!.args).toEqual(["round"]);
    // One moveTo for the joined parts, one lineTo per part.
    expect(canvas.findCalls("moveTo")).toHaveLength(2);
    expect(canvas.findCalls("lineTo")).toHaveLength(4);
  });

  it("draws no line without a route or with a route without parts", () => {
    const cam = camera();
    const none = new RecordingCanvas();
    expect(drawRouteLine(none, undefined, cam, DEFAULT_STYLE)).toEqual([]);
    expect(none.getCalls()).toHaveLength(0);
    const empty = new RecordingCanvas();
    drawRouteLine(empty, routeOf([{ x: 1, y: 1 }]), cam, DEFAULT_STYLE);
    expect(empty.getCalls()).toHaveLength(0);
  });

  it.each([0.001, 0.01, 1, 1000])("keeps the fill between 4 and 12 pixels at zoom %s", (zoom) => {
    for (const widthPx of [0, 1, 6, 100]) {
      const style = { ...DEFAULT_STYLE, routeLineStyle: { widthPx } };
      const canvas = new RecordingCanvas();
      const cam = camera({ zoom });
      drawRouteLine(canvas, routeOf([{ x: 0, y: 0 }, { x: 5, y: 5 }]), cam, style);
      const fillPx = canvas.findCalls("stroke")[1]!.state.lineWidth * zoom;
      expect(fillPx).toBeGreaterThanOrEqual(4 - 1e-9);
      expect(fillPx).toBeLessThanOrEqual(12 + 1e-9);
    }
  });

  it("draws no line and gives a notice for a route with a point that is not finite", () => {
    const canvas = new RecordingCanvas();
    const route = routeOf([{ x: 0, y: 0 }, { x: Number.NaN, y: 1 }]);
    const notices = drawRouteLine(canvas, route, camera(), DEFAULT_STYLE);
    expect(notices).toHaveLength(1);
    expect(notices[0]!.message).toContain("could not be drawn");
    expect(canvas.getCalls()).toHaveLength(0);
    expect(validateRoute(route)).toBeDefined();
    expect(validateRoute(routeOf([{ x: 0, y: 0 }, { x: Infinity, y: 1 }]))).toBeDefined();
    expect(validateRoute(routeOf([{ x: 0, y: 0 }, { x: 1, y: 1 }]))).toBeUndefined();
  });
});

describe("destination marker", () => {
  it("is drawn at the end of the remaining route and not without a route", () => {
    const cam = camera();
    const canvas = new RecordingCanvas();
    drawDestinationMarker(canvas, routeOf([{ x: 0, y: 0 }, { x: 7, y: 9 }]), cam, DEFAULT_STYLE);
    expect(canvas.findCalls("arc")[0]!.args.slice(0, 2)).toEqual([7, 9]);
    const none = new RecordingCanvas();
    drawDestinationMarker(none, undefined, cam, DEFAULT_STYLE);
    expect(none.getCalls()).toHaveLength(0);
  });
});

describe("player marker", () => {
  const position: Position = { x: 10, y: 20, headingDegrees: 90 };

  it("points along the heading (90 degrees points down the screen)", () => {
    const canvas = new RecordingCanvas();
    drawPlayerMarker(canvas, position, camera(), DEFAULT_STYLE);
    const tip = canvas.findCalls("moveTo")[0]!.args as [number, number];
    expect(tip[0]).toBeCloseTo(10, 9);
    expect(tip[1]).toBeGreaterThan(20);
  });

  it.each([0.001, 1, 1000])("is between 10 and 24 pixels across at zoom %s", (zoom) => {
    for (const sizePx of [0, 10, 16, 24, 500, Number.NaN]) {
      const canvas = new RecordingCanvas();
      drawPlayerMarker(canvas, { x: 0, y: 0, headingDegrees: 0 }, camera({ zoom }), DEFAULT_STYLE, sizePx);
      const tip = canvas.findCalls("moveTo")[0]!.args as [number, number];
      const base = canvas.findCalls("lineTo").map((c) => c.args as [number, number]);
      const lengthPx = (tip[0] - (base[0]![0] + base[1]![0]) / 2) * zoom;
      expect(lengthPx).toBeGreaterThanOrEqual(10 - 1e-9);
      expect(lengthPx).toBeLessThanOrEqual(24 + 1e-9);
    }
  });

  it("draws nothing for a bad position and names the allowed range", () => {
    const bad: Position[] = [
      { x: Number.NaN, y: 0, headingDegrees: 0 },
      { x: 0, y: Infinity, headingDegrees: 0 },
      { x: 0, y: 0, headingDegrees: -Infinity },
      { x: 1_000_000.5, y: 0, headingDegrees: 0 },
      { x: 0, y: -1_000_000.5, headingDegrees: 0 },
    ];
    for (const p of bad) {
      const error = validatePosition(p);
      expect(error).toBeDefined();
      expect(error!.message).toContain("position");
      expect(error!.message).toContain("1,000,000");
      const canvas = new RecordingCanvas();
      const notices = drawPlayerMarker(canvas, p, camera(), DEFAULT_STYLE);
      expect(notices).toHaveLength(1);
      expect(canvas.getCalls()).toHaveLength(0);
    }
  });

  it("accepts the limits of the allowed range", () => {
    expect(validatePosition({ x: 1_000_000, y: -1_000_000, headingDegrees: 720 })).toBeUndefined();
    expect(validatePosition({ x: 0, y: 0, headingDegrees: 0 })).toBeUndefined();
  });
});
