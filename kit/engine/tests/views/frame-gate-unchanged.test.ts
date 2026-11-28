import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { EngineMap } from "../../src/types.js";
import { drawMapLayers } from "../../src/views/draw-map-layers.js";
import { drawIfDue, FrameGate, type FrameInputs } from "../../src/views/frame-gate.js";
import { RecordingCanvas } from "../../src/views/recording-canvas.js";
import { DEFAULT_STYLE } from "../../src/views/style.js";
import type { VisibleSet } from "../../src/views/visible-set.js";

const map: EngineMap = {
  formatVersion: 1,
  nodes: [
    { id: "n0", x: 0, y: 0 },
    { id: "n1", x: 100, y: 0 },
  ],
  roads: [{ id: "r0", fromNodeId: "n0", toNodeId: "n1", width: 6, kind: "main", oneWay: false }],
  places: [{ id: "p0", name: "Bank", category: "shop", x: 50, y: 10 }],
  blockedAreas: [],
  props: [],
  style: { colors: {}, lineStyles: {} },
  usableRoadIds: new Set(["r0"]),
  blockedRoads: [],
};
const visible: VisibleSet = {
  roadIds: new Set(["r0"]),
  blockedAreaIds: new Set(),
  propIds: new Set(),
  placeIds: new Set(["p0"]),
  roadsTested: 1,
};

const versionArb = fc.integer({ min: 0, max: 1000 });
const inputsArb: fc.Arbitrary<FrameInputs> = fc.record({
  mapVersion: versionArb,
  routeVersion: versionArb,
  positionVersion: versionArb,
  cameraVersion: versionArb,
  viewportVersion: versionArb,
  styleVersion: versionArb,
  settling: fc.constant(false),
  canvasVisible: fc.constant(true),
});
const cameraArb = fc.record({
  centerX: fc.double({ min: 0, max: 100, noNaN: true }),
  centerY: fc.double({ min: -20, max: 20, noNaN: true }),
  zoom: fc.double({ min: 0.5, max: 8, noNaN: true }),
  rotationDegrees: fc.double({ min: -360, max: 360, noNaN: true }),
  viewportWidth: fc.integer({ min: 100, max: 600 }),
  viewportHeight: fc.integer({ min: 100, max: 600 }),
});
const positionArb = fc.record({
  x: fc.double({ min: 0, max: 100, noNaN: true }),
  y: fc.double({ min: -10, max: 10, noNaN: true }),
  headingDegrees: fc.double({ min: -360, max: 360, noNaN: true }),
});

describe("FrameGate with drawMapLayers", () => {
  it("makes zero drawing calls on a second draw with nothing changed", () => {
    // Feature: map-views, Property 19: An unchanged frame makes zero drawing calls
    // **Validates: Requirements 14.4, 14.9, 14.10, 22.6**
    fc.assert(
      fc.property(inputsArb, cameraArb, positionArb, (inputs, camera, position) => {
        const gate = new FrameGate();
        const rec = new RecordingCanvas();
        const draw = (): void => {
          drawMapLayers(rec, { map, style: DEFAULT_STYLE, camera, visible, position });
        };
        expect(drawIfDue(gate, inputs, draw)).toBe(true);
        const afterFirst = rec.getCalls().length;
        expect(afterFirst).toBeGreaterThan(0);
        expect(drawIfDue(gate, inputs, draw)).toBe(false);
        expect(rec.getCalls().length).toBe(afterFirst);
      }),
      { numRuns: 100 },
    );
  });
});
