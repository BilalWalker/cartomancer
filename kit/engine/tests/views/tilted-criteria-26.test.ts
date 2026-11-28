// Requirement 26, criteria 3 and 4, measured on what the default Tilted_View
// actually draws on a Recording_Canvas (26.12): the stroke widths of a road and
// the screen areas of the faces of a building, at 400 x 300 and 375 x 500.

import { describe, expect, it } from "vitest";
import type { EngineMap, PropData } from "../../src/types.js";
import { RecordingCanvas } from "../../src/views/recording-canvas.js";
import { DEFAULT_STYLE } from "../../src/views/style.js";
import { DEFAULT_TILT_DEGREES, focalDistanceFor } from "../../src/views/tilted-projection.js";
import { DEFAULT_TILTED_ZOOM, TiltedView } from "../../src/views/tilted-view.js";
import { isViewError } from "../../src/views/view-errors.js";
import { sideFaces, topFaces, type Face } from "./helpers/tilted-faces.js";

const VIEWPORTS = [
  { width: 400, height: 300 },
  { width: 375, height: 500 },
];
const POSITION = { x: 0, y: 0, headingDegrees: 0 };
const ROAD_WIDTH = 8;

function emptyMap(): EngineMap {
  return {
    formatVersion: 1,
    nodes: [],
    roads: [],
    places: [],
    blockedAreas: [],
    props: [],
    style: { colors: {}, lineStyles: {} },
    usableRoadIds: new Set(),
    blockedRoads: [],
  };
}

/** One main road across the heading (heading 0 looks along +x), `ahead` world units in front of the player. */
function roadMap(ahead: number): EngineMap {
  return {
    ...emptyMap(),
    nodes: [
      { id: "a", x: ahead, y: -20 },
      { id: "b", x: ahead, y: 20 },
    ],
    roads: [{ id: "r", fromNodeId: "a", toNodeId: "b", width: ROAD_WIDTH, kind: "main" }],
    usableRoadIds: new Set(["r"]),
  };
}

function drawn(map: EngineMap, width: number, height: number): RecordingCanvas {
  const view = TiltedView.create(map, { width, height });
  if (isViewError(view)) throw new Error(view.message);
  const canvas = new RecordingCanvas();
  const result = view.draw(canvas, { position: POSITION }, 0);
  if (isViewError(result)) throw new Error(result.message);
  expect(result.drew).toBe(true);
  return canvas;
}

/** The pixel width and the highest end (smallest y) of the road fill, as drawn. */
function measureRoad(canvas: RecordingCanvas): { widthPx: number; topY: number } {
  const calls = canvas.getCalls();
  let widthPx = Number.NaN;
  let topY = Number.POSITIVE_INFINITY;
  let path: number[] = [];
  for (const call of calls) {
    if (call.op === "beginPath") path = [];
    else if (call.op === "moveTo" || call.op === "lineTo") path.push(call.args[1] as number);
    else if (call.op === "stroke" && call.state.strokeColor === DEFAULT_STYLE.roadColors.main) {
      widthPx = call.state.lineWidth;
      topY = Math.min(topY, ...path);
    }
  }
  return { widthPx, topY };
}

function area(face: Face): number {
  let sum = 0;
  for (let i = 0; i < face.points.length; i++) {
    const a = face.points[i]!;
    const b = face.points[(i + 1) % face.points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

describe("Requirement 26 measured on the Recording_Canvas", () => {
  for (const { width, height } of VIEWPORTS) {
    describe(`viewport ${width} x ${height}`, () => {
      it("26.3: a road at the Far_Edge is drawn at most 60% as wide as at the player", () => {
        // **Validates: Requirements 26.3, 26.12**
        const f = focalDistanceFor(DEFAULT_TILT_DEGREES, height);
        if (typeof f !== "number") throw new Error("no focal distance");
        // The top row of the viewport lies f / cos(tilt) CSS pixels ahead of the player on the ground.
        const farAhead = (f / Math.cos((DEFAULT_TILT_DEGREES * Math.PI) / 180) / DEFAULT_TILTED_ZOOM) * 0.999;
        const near = measureRoad(drawn(roadMap(0), width, height));
        const far = measureRoad(drawn(roadMap(farAhead), width, height));
        expect(Number.isFinite(near.widthPx)).toBe(true);
        expect(Number.isFinite(far.widthPx)).toBe(true);
        // The far road really is drawn at the top edge of the viewport.
        expect(far.topY).toBeGreaterThanOrEqual(0);
        expect(far.topY).toBeLessThan(2);
        const ratio = far.widthPx / near.widthPx;
        expect(ratio).toBeLessThanOrEqual(0.6);
      });

      it("26.4: the side faces of a building 20 units ahead are at least 25% of its top face", () => {
        // **Validates: Requirements 26.4, 26.12**
        const building: PropData = {
          id: "b",
          kind: "building",
          x: 20,
          y: 0,
          width: 12,
          height: 12,
          rotationDegrees: 0,
        };
        const canvas = drawn({ ...emptyMap(), props: [building] }, width, height);
        const tops = topFaces(canvas);
        expect(tops).toHaveLength(1);
        const sides = sideFaces(canvas);
        expect(sides.length).toBeGreaterThan(0);
        const topArea = area(tops[0]!);
        const sideArea = sides.reduce((sum, face) => sum + area(face), 0);
        const ratio = sideArea / topArea;
        expect(topArea).toBeGreaterThan(0);
        expect(ratio).toBeGreaterThanOrEqual(0.25);
      });
    });
  }
});
