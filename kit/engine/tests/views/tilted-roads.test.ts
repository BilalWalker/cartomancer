import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { EngineMap, RoadData, RoadKind } from "../../src/types.js";
import { createCamera, screenToWorld, type Camera, type Point } from "../../src/views/camera.js";
import { RecordingCanvas } from "../../src/views/recording-canvas.js";
import { DEFAULT_STYLE } from "../../src/views/style.js";
import type { TiltedGroundView } from "../../src/views/tilted-ground.js";
import { focalDistanceFor } from "../../src/views/tilted-projection.js";
import {
  drawTiltedBlockedRoadMarks,
  drawTiltedRoadFills,
  drawTiltedRoadOutlines,
} from "../../src/views/tilted-roads.js";
import { isViewError, type ViewError } from "../../src/views/view-errors.js";

function ok<T extends object>(value: T | ViewError): T {
  if (isViewError(value)) throw new Error(value.message);
  return value;
}

const TILT = 35;
const ZOOM = 2;
const camera: Camera = ok(
  createCamera({ centerX: 0, centerY: 0, zoom: ZOOM, rotationDegrees: 0, viewportWidth: 400, viewportHeight: 300 }),
);
const view: TiltedGroundView = { camera, tiltAngleDegrees: TILT };
const f = focalDistanceFor(TILT, 300) as number;
const cosT = Math.cos((TILT * Math.PI) / 180);
const sinT = Math.sin((TILT * Math.PI) / 180);
const G_NEAR = (0.25 * f - f) / cosT;
const KINDS: RoadKind[] = ["main", "side", "footpath", "corridor"];

/** The world point at forward offset g (CSS pixels, up the screen) and screen column sx. */
function worldAt(g: number, sx: number): Point {
  return ok(screenToWorld(camera, { x: sx, y: 150 - g }));
}

interface Spec {
  from: Point;
  to: Point;
  width: number;
  kind?: RoadKind;
  usable?: boolean;
}

function buildMap(specs: Spec[]): EngineMap {
  const nodes: EngineMap["nodes"] = [];
  const roads: RoadData[] = [];
  const usableRoadIds = new Set<string>();
  specs.forEach((s, i) => {
    nodes.push({ id: `a${i}`, x: s.from.x, y: s.from.y }, { id: `b${i}`, x: s.to.x, y: s.to.y });
    roads.push({ id: `r${i}`, fromNodeId: `a${i}`, toNodeId: `b${i}`, width: s.width, kind: s.kind ?? "main" });
    if (s.usable !== false) usableRoadIds.add(`r${i}`);
  });
  return {
    formatVersion: 1,
    nodes,
    roads,
    places: [],
    blockedAreas: [],
    props: [],
    style: { colors: {}, lineStyles: {} },
    usableRoadIds,
    blockedRoads: [],
  };
}

function ids(map: EngineMap): string[] {
  return map.roads.map((r) => r.id);
}

function pathPoints(rec: RecordingCanvas): Point[] {
  return rec
    .getCalls()
    .filter((c) => c.op === "moveTo" || c.op === "lineTo")
    .map((c) => ({ x: c.args[0] as number, y: c.args[1] as number }));
}

function widths(rec: RecordingCanvas): number[] {
  return rec.findCalls("setLineWidth").map((c) => c.args[0] as number);
}

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

/** Paths begun by the outline, fill and blocked passes together. */
function pathCount(map: EngineMap): number {
  const rec = new RecordingCanvas();
  drawTiltedRoadOutlines(rec, map, ids(map), view, DEFAULT_STYLE);
  drawTiltedRoadFills(rec, map, ids(map), view, DEFAULT_STYLE);
  drawTiltedBlockedRoadMarks(rec, map, ids(map), view, DEFAULT_STYLE);
  return rec.getPathCount();
}

/** Roads of one kind and width on one line across the heading, `n` usable and `m` blocked. */
function lineMap(n: number, m: number, kind: RoadKind, width: number, g: number): EngineMap {
  const specs: Spec[] = [];
  for (let i = 0; i < n + m; i++) {
    const sx = 20 + (i % 300);
    specs.push({ from: worldAt(g, sx), to: worldAt(g, sx + 1), width, kind: i < n ? kind : "side", usable: i < n });
  }
  return buildMap(specs);
}

describe("tilted roads", () => {
  it("Property 18 (restated): path count does not depend on the number of roads, under perspective", () => {
    // Feature: map-views, Property 18: Path count does not depend on the number of roads
    // **Validates: Requirements 5.10, 5.11, 22.1, 22.2, 22.5**
    fc.assert(
      fc.property(
        fc.constantFrom(...KINDS),
        fc.double({ min: 0.5, max: 10, noNaN: true }),
        fc.double({ min: -100, max: 140, noNaN: true }),
        fc.integer({ min: 1, max: 1500 }),
        fc.integer({ min: 1, max: 1500 }),
        (kind, width, g, n, m) => {
          const one = pathCount(lineMap(1, 1, kind, width, g));
          const many = pathCount(lineMap(n, m, kind, width, g));
          expect(many).toBe(one);
        },
      ),
      { numRuns: 25 },
    );
  });

  it("Property 18 (restated): roads at different depths use at most the distinct pixel widths in 0.5 px steps", () => {
    // **Validates: Requirements 5.10, 5.11, 22.1, 22.2, 22.5**
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 8, noNaN: true }),
        fc.array(fc.tuple(fc.double({ min: -120, max: 150, noNaN: true }), fc.double({ min: 20, max: 380, noNaN: true })), {
          minLength: 1,
          maxLength: 300,
        }),
        (width, spots) => {
          const map = buildMap(spots.map(([g, sx]) => ({ from: worldAt(g, sx), to: worldAt(g, sx + 1), width })));
          const gs = spots.map(([g]) => g);
          const rawAt = (g: number): number => (width * ZOOM * f) / (f + g * cosT);
          const hi = rawAt(Math.min(...gs));
          const lo = Math.max(1, rawAt(Math.max(...gs)));
          const bins = Math.floor((Math.max(hi, lo) - lo) / 0.5) + 2;
          const rec = new RecordingCanvas();
          drawTiltedRoadFills(rec, map, ids(map), view, DEFAULT_STYLE);
          expect(rec.getPathCount()).toBeLessThanOrEqual(bins);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("draws 5,000 roads on one line in the same paths as 1 road", () => {
    expect(pathCount(lineMap(5000, 0, "main", 8, 50))).toBe(pathCount(lineMap(1, 0, "main", 8, 50)));
    expect(pathCount(lineMap(5000, 0, "main", 8, 50))).toBe(2);
  });

  it("cuts a road that crosses the near clip and draws the part in front", () => {
    const map = buildMap([{ from: worldAt(100, 200), to: worldAt(G_NEAR - 500, 200), width: 4 }]);
    const rec = new RecordingCanvas();
    expect(drawTiltedRoadFills(rec, map, ids(map), view, DEFAULT_STYLE)).toEqual([]);
    const points = pathPoints(rec);
    expect(points.length).toBeGreaterThanOrEqual(2);
    expect(allNumbers(rec).every(Number.isFinite)).toBe(true);
    // The cut end sits at the near clip, z = 0.25 f: y = 0.75 H - f g sin(t) / z.
    const nearY = 225 - (f * G_NEAR * sinT) / (0.25 * f);
    expect(Math.max(...points.map((p) => p.y))).toBeCloseTo(nearY, 3);
  });

  it("draws nothing for a road wholly behind the near clip", () => {
    const map = buildMap([{ from: worldAt(G_NEAR - 300, 100), to: worldAt(G_NEAR - 600, 300), width: 4 }]);
    const rec = new RecordingCanvas();
    expect(drawTiltedRoadFills(rec, map, ids(map), view, DEFAULT_STYLE)).toEqual([]);
    expect(rec.getPathCount()).toBe(0);
  });

  it("gives a road running away from the viewer narrower pixel widths", () => {
    const width = 6;
    const map = buildMap([{ from: worldAt(-80, 200), to: worldAt(200, 200), width }]);
    const rec = new RecordingCanvas();
    drawTiltedRoadFills(rec, map, ids(map), view, DEFAULT_STYLE);
    const w = widths(rec);
    const rawAt = (g: number): number => (width * ZOOM * f) / (f + g * cosT);
    expect(new Set(w).size).toBeGreaterThanOrEqual(3);
    // Batches are sorted by width, so the first is the farthest piece and the last the nearest.
    expect(w[0]!).toBeLessThan(w[w.length - 1]!);
    expect(w[w.length - 1]!).toBeGreaterThanOrEqual(rawAt(-80) / 1.05 - 0.5);
    expect(w[w.length - 1]!).toBeLessThanOrEqual(rawAt(-80) + 0.5);
    expect(w[0]!).toBeGreaterThanOrEqual(rawAt(200) - 0.5);
    expect(w[0]!).toBeLessThanOrEqual(rawAt(200) * 1.05 + 0.5);
    expect(w.every((x) => Number.isInteger(x * 2))).toBe(true);
  });

  it("never draws a road thinner than 1 px", () => {
    const map = buildMap([{ from: worldAt(0, 100), to: worldAt(100, 300), width: 0.01 }]);
    const rec = new RecordingCanvas();
    drawTiltedRoadFills(rec, map, ids(map), view, DEFAULT_STYLE);
    expect(widths(rec).length).toBeGreaterThan(0);
    expect(widths(rec).every((x) => x === 1)).toBe(true);
  });

  it("draws blocked roads dashed in their own paths and usable roads not at all there", () => {
    const map = buildMap([
      { from: worldAt(20, 100), to: worldAt(20, 200), width: 6 },
      { from: worldAt(20, 210), to: worldAt(20, 300), width: 6, usable: false },
    ]);
    const rec = new RecordingCanvas();
    drawTiltedBlockedRoadMarks(rec, map, ids(map), view, DEFAULT_STYLE);
    expect(rec.getPathCount()).toBe(1);
    expect(rec.findCalls("setStrokeColor")[0]!.args).toEqual([DEFAULT_STYLE.blockedRoadColor]);
    expect(rec.findCalls("moveTo")).toHaveLength(1);
  });

  it("leaves out a road with a bad width and names it in a Notice", () => {
    for (const width of [0, -1, NaN, Infinity]) {
      const map = buildMap([
        { from: worldAt(20, 100), to: worldAt(20, 200), width },
        { from: worldAt(20, 210), to: worldAt(20, 300), width: 6 },
      ]);
      const rec = new RecordingCanvas();
      const notices = drawTiltedRoadFills(rec, map, ids(map), view, DEFAULT_STYLE);
      expect(notices).toHaveLength(1);
      expect(notices[0]!.message).toContain('"r0"');
      expect(notices[0]!.message).toContain("greater than 0");
      expect(rec.findCalls("moveTo")).toHaveLength(1);
    }
  });

  it("returns a Notice and draws nothing for a tilt that is not usable", () => {
    const map = buildMap([{ from: worldAt(20, 100), to: worldAt(20, 200), width: 6 }]);
    const rec = new RecordingCanvas();
    const notices = drawTiltedRoadFills(rec, map, ids(map), { camera, tiltAngleDegrees: 5 }, DEFAULT_STYLE);
    expect(notices).toHaveLength(1);
    expect(rec.getPathCount()).toBe(0);
  });
});
