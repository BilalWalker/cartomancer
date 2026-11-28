import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { BlockedAreaData, PlaceData, PropData, Route } from "../../src/types.js";
import { createCamera, screenToWorld, type Camera, type Point } from "../../src/views/camera.js";
import { RecordingCanvas } from "../../src/views/recording-canvas.js";
import { DEFAULT_STYLE } from "../../src/views/style.js";
import {
  drawTiltedBlockedAreas,
  drawTiltedDestinationMarker,
  drawTiltedFlatProps,
  drawTiltedGround,
  drawTiltedPlaceMarkers,
  drawTiltedPlayerMarker,
  drawTiltedRouteLine,
  type TiltedGroundView,
} from "../../src/views/tilted-ground.js";
import { focalDistanceFor, projectTilted } from "../../src/views/tilted-projection.js";
import { isViewError, type ViewError } from "../../src/views/view-errors.js";

function ok<T extends object>(value: T | ViewError): T {
  if (isViewError(value)) throw new Error(value.message);
  return value;
}

const TILT = 35;
const camera: Camera = ok(
  createCamera({
    centerX: 0,
    centerY: 0,
    zoom: 2,
    rotationDegrees: 0,
    viewportWidth: 400,
    viewportHeight: 300,
  }),
);
const view: TiltedGroundView = { camera, tiltAngleDegrees: TILT };
const f = focalDistanceFor(TILT, 300) as number;

/** The world point at forward offset g (CSS pixels, up the screen) and screen column sx. */
function worldAt(g: number, sx: number): Point {
  return ok(screenToWorld(camera, { x: sx, y: 150 - g }));
}

/** Forward offsets of the clips, from z = f + g cos(tilt). */
const cos = Math.cos((TILT * Math.PI) / 180);
const G_NEAR = (0.25 * f - f) / cos;
const G_FAR = (2.2 * f - f) / cos;

function allNumbers(rec: RecordingCanvas): number[] {
  const numbers: number[] = [];
  for (const call of rec.getCalls()) {
    for (const arg of call.args) {
      if (typeof arg === "number") numbers.push(arg);
      if (Array.isArray(arg)) for (const n of arg) if (typeof n === "number") numbers.push(n);
    }
  }
  return numbers;
}

function pathPoints(rec: RecordingCanvas): Point[] {
  return rec
    .getCalls()
    .filter((c) => c.op === "moveTo" || c.op === "lineTo")
    .map((c) => ({ x: c.args[0] as number, y: c.args[1] as number }));
}

function area(id: string, polygon: Point[]): BlockedAreaData {
  return { id, kind: "water", polygon };
}

function house(id: string, at: Point): PropData {
  return { id, kind: "house", x: at.x, y: at.y, width: 6, height: 6, rotationDegrees: 0 };
}

describe("tilted ground clipping", () => {
  it("cuts a polygon that crosses the near clip and keeps the rest", () => {
    const rec = new RecordingCanvas();
    const polygon = [worldAt(-700, 100), worldAt(-700, 300), worldAt(-100, 300), worldAt(-100, 100)];
    const notices = drawTiltedBlockedAreas(rec, DEFAULT_STYLE, [area("lake", polygon)], view);
    expect(notices).toEqual([]);
    const points = pathPoints(rec);
    expect(points).toHaveLength(4);
    expect(allNumbers(rec).every(Number.isFinite)).toBe(true);
    const projectedTop = ok(projectTilted(polygon[3]!, 0, TILT, camera, f));
    expect(points.map((p) => p.y)).toContainEqual(expect.closeTo(projectedTop.y, 6));
    // The cut edge is the near clip: far below the bottom of the Viewport.
    expect(Math.max(...points.map((p) => p.y))).toBeGreaterThan(300);
  });

  it("cuts a polygon at the far depth and gives no Notice for what is cut", () => {
    const rec = new RecordingCanvas();
    const polygon = [worldAt(100, 100), worldAt(100, 300), worldAt(G_FAR + 2000, 300), worldAt(G_FAR + 2000, 100)];
    const notices = drawTiltedBlockedAreas(rec, DEFAULT_STYLE, [area("far", polygon)], view);
    expect(notices).toEqual([]);
    const points = pathPoints(rec);
    expect(points).toHaveLength(4);
    expect(allNumbers(rec).every(Number.isFinite)).toBe(true);
    // The far cut lies above the top edge of the Viewport (the top row is at depth 2 f).
    expect(Math.min(...points.map((p) => p.y))).toBeLessThan(0);
  });

  it("draws nothing and says nothing for a polygon wholly behind the near clip or beyond the far depth", () => {
    const rec = new RecordingCanvas();
    const behind = [worldAt(-900, 100), worldAt(-900, 300), worldAt(-800, 300), worldAt(-800, 100)];
    const beyond = [
      worldAt(G_FAR + 100, 100),
      worldAt(G_FAR + 100, 300),
      worldAt(G_FAR + 200, 300),
      worldAt(G_FAR + 200, 100),
    ];
    const notices = drawTiltedBlockedAreas(rec, DEFAULT_STYLE, [area("a", behind), area("b", beyond)], view);
    expect(notices).toEqual([]);
    expect(rec.getCalls()).toHaveLength(0);
  });

  it("cuts a route segment that ends behind the eye at the near clip", () => {
    const rec = new RecordingCanvas();
    const start = worldAt(50, 200);
    const end = worldAt(-3000, 200);
    const route: Route = {
      parts: [{ roadId: "r1", direction: "forward", start, end }],
      lengthWorldUnits: 1000,
      destination: { point: end },
    };
    expect(drawTiltedRouteLine(rec, route, DEFAULT_STYLE, view)).toEqual([]);
    expect(drawTiltedDestinationMarker(rec, route, DEFAULT_STYLE, view)).toEqual([]);
    expect(rec.findCalls("stroke")).toHaveLength(2);
    const points = pathPoints(rec);
    expect(points).toHaveLength(4);
    const first = ok(projectTilted(start, 0, TILT, camera, f));
    expect(points[0]!.y).toBeCloseTo(first.y, 6);
    expect(points[1]!.y).toBeGreaterThan(300);
    expect(allNumbers(rec).every(Number.isFinite)).toBe(true);
    // The end is behind the eye, so no destination marker is drawn.
    expect(rec.findCalls("arc")).toHaveLength(0);
  });

  it("does not draw a prop under the near clip and names it in one Notice", () => {
    const rec = new RecordingCanvas();
    const props = [house("near-house", worldAt(-700, 200)), house("seen-house", worldAt(60, 200))];
    const notices = drawTiltedFlatProps(rec, DEFAULT_STYLE, props, view);
    expect(notices).toHaveLength(1);
    expect(notices[0]!.message).toContain("near-house");
    expect(rec.findCalls("fill")).toHaveLength(1);
    expect(pathPoints(rec)).toHaveLength(4);
  });

  it("draws a polygon that is fully visible point for point", () => {
    const rec = new RecordingCanvas();
    const polygon = [worldAt(20, 120), worldAt(20, 280), worldAt(150, 260), worldAt(160, 140)];
    expect(drawTiltedBlockedAreas(rec, DEFAULT_STYLE, [area("pond", polygon)], view)).toEqual([]);
    const expected = polygon.map((p) => ok(projectTilted(p, 0, TILT, camera, f)));
    const points = pathPoints(rec);
    expect(points).toHaveLength(4);
    points.forEach((p, i) => {
      expect(p.x).toBe(expected[i]!.x);
      expect(p.y).toBe(expected[i]!.y);
    });
    const identity = rec.findCalls("fill")[0]!.state.transform;
    expect(identity).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it("fills the whole Viewport with the ground colour", () => {
    const rec = new RecordingCanvas();
    expect(drawTiltedGround(rec, DEFAULT_STYLE, view)).toEqual([]);
    const points = pathPoints(rec);
    expect(rec.findCalls("fill")[0]!.state.fillColor).toBe(DEFAULT_STYLE.groundColor);
    expect(Math.min(...points.map((p) => p.x))).toBeCloseTo(0, 6);
    expect(Math.max(...points.map((p) => p.x))).toBeCloseTo(400, 6);
    expect(Math.min(...points.map((p) => p.y))).toBeCloseTo(0, 6);
    expect(Math.max(...points.map((p) => p.y))).toBeCloseTo(300, 6);
  });

  it("draws markers for a place and the player in range and skips those out of range", () => {
    const rec = new RecordingCanvas();
    const near = worldAt(-700, 200);
    const seen = worldAt(40, 200);
    const places: PlaceData[] = [
      { id: "p-near", name: "Behind", category: "x", x: near.x, y: near.y },
      { id: "p-seen", name: "Ahead", category: "x", x: seen.x, y: seen.y },
    ];
    expect(drawTiltedPlaceMarkers(rec, DEFAULT_STYLE, places, view)).toEqual([]);
    expect(rec.findCalls("arc")).toHaveLength(1);
    const player = worldAt(0, 200);
    expect(
      drawTiltedPlayerMarker(rec, { x: player.x, y: player.y, headingDegrees: 270 }, DEFAULT_STYLE, view),
    ).toEqual([]);
    expect(allNumbers(rec).every(Number.isFinite)).toBe(true);
  });

  it("reports a view that cannot project in one Notice and draws nothing", () => {
    const rec = new RecordingCanvas();
    const notices = drawTiltedBlockedAreas(
      rec,
      DEFAULT_STYLE,
      [area("a", [worldAt(10, 100), worldAt(10, 300), worldAt(100, 200)])],
      { camera, tiltAngleDegrees: 5 },
    );
    expect(notices).toHaveLength(1);
    expect(rec.getCalls()).toHaveLength(0);
  });

  it("never sends a number that is not finite to the canvas, wherever the shapes lie", () => {
    const coordinate = fc.double({ min: -5000, max: 5000, noNaN: true });
    const pointArb = fc.record({ x: coordinate, y: coordinate });
    fc.assert(
      fc.property(
        fc.array(pointArb, { minLength: 3, maxLength: 6 }),
        pointArb,
        pointArb,
        fc.integer({ min: 20, max: 70 }),
        fc.integer({ min: 0, max: 359 }),
        (polygon, a, b, tilt, rotation) => {
          const cam = ok(
            createCamera({
              centerX: a.x / 10,
              centerY: a.y / 10,
              zoom: 2,
              rotationDegrees: rotation,
              viewportWidth: 400,
              viewportHeight: 300,
            }),
          );
          const v: TiltedGroundView = { camera: cam, tiltAngleDegrees: tilt };
          const route: Route = {
            parts: [{ roadId: "r", direction: "forward", start: a, end: b }],
            lengthWorldUnits: 1,
            destination: { point: b },
          };
          const rec = new RecordingCanvas();
          drawTiltedGround(rec, DEFAULT_STYLE, v);
          drawTiltedBlockedAreas(rec, DEFAULT_STYLE, [area("z", polygon)], v);
          drawTiltedFlatProps(rec, DEFAULT_STYLE, [house("h", a)], v);
          drawTiltedRouteLine(rec, route, DEFAULT_STYLE, v);
          drawTiltedDestinationMarker(rec, route, DEFAULT_STYLE, v);
          drawTiltedPlaceMarkers(rec, DEFAULT_STYLE, [{ id: "pl", name: "P", category: "c", x: b.x, y: b.y }], v);
          drawTiltedPlayerMarker(rec, { x: a.x, y: a.y, headingDegrees: rotation }, DEFAULT_STYLE, v);
          return allNumbers(rec).every(Number.isFinite);
        },
      ),
      { numRuns: 200 },
    );
  });
});
