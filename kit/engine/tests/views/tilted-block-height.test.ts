import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { EngineMap, PropData } from "../../src/types.js";
import { DEFAULT_BLOCK_HEIGHTS, RAISED_KINDS } from "../../src/views/block-height.js";
import { DEFAULT_TILT_DEGREES, projectTilted } from "../../src/views/tilted-projection.js";
import { RecordingCanvas } from "../../src/views/recording-canvas.js";
import { TiltedView } from "../../src/views/tilted-view.js";
import { isViewError } from "../../src/views/view-errors.js";
import { smallTown } from "./helpers/small-town.js";
import { sideFaces, topFaces } from "./helpers/tilted-faces.js";

function makeView(map: EngineMap): TiltedView {
  const view = TiltedView.create(map);
  if (isViewError(view)) throw new Error(view.message);
  return view;
}

function corners(prop: PropData): { x: number; y: number }[] {
  const r = (prop.rotationDegrees * Math.PI) / 180;
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sy]) => {
    const lx = (sx! * prop.width) / 2;
    const ly = (sy! * prop.height) / 2;
    return {
      x: prop.x + lx * Math.cos(r) - ly * Math.sin(r),
      y: prop.y + lx * Math.sin(r) + ly * Math.cos(r),
    };
  });
}

/** Draws one prop and checks its top face lies `expectedHeight` above its footprint. */
function expectTopLift(prop: PropData, expectedHeight: number, heading = 0): void {
  const view = makeView({ ...smallTown(), props: [prop] });
  const canvas = new RecordingCanvas();
  const result = view.draw(canvas, { position: { x: 0, y: 0, headingDegrees: heading } }, 0);
  expect(isViewError(result)).toBe(false);
  const camera = view.getCamera()!;
  const faces = topFaces(canvas);
  expect(faces).toHaveLength(1);
  const liftPx = expectedHeight * camera.zoom * Math.cos((DEFAULT_TILT_DEGREES * Math.PI) / 180);
  corners(prop).forEach((corner, i) => {
    const base = projectTilted(corner, 0, DEFAULT_TILT_DEGREES, camera);
    if (isViewError(base)) throw new Error(base.message);
    const top = faces[0]!.points[i]!;
    expect(Math.abs(top.x - base.x)).toBeLessThanOrEqual(1e-6);
    expect(Math.abs(top.y - (base.y - liftPx))).toBeLessThanOrEqual(1e-6);
  });
}

describe("Tilted view block height", () => {
  it("lifts the top of a raised block above its footprint by the block height", () => {
    // Feature: map-views, Property 20: Raised block top lies above its footprint by the block height
    // **Validates: Requirements 12.15, 12.17, 12.19**
    fc.assert(
      fc.property(
        fc.constantFrom(...RAISED_KINDS),
        fc.option(fc.double({ min: 0, max: 100, noNaN: true }), { nil: undefined }),
        fc.double({ min: 1, max: 20, noNaN: true }),
        fc.double({ min: 1, max: 20, noNaN: true }),
        fc.double({ min: -360, max: 360, noNaN: true }),
        fc.double({ min: 10, max: 60, noNaN: true }),
        fc.double({ min: -30, max: 30, noNaN: true }),
        fc.constantFrom(0, 90, 180, 270),
        (kind, blockHeight, width, height, rotationDegrees, ahead, side, heading) => {
          const rad = (heading * Math.PI) / 180;
          const fx = Math.round(Math.cos(rad));
          const fy = Math.round(Math.sin(rad));
          const prop: PropData = {
            id: "b1",
            kind,
            x: fx * ahead - fy * side,
            y: fy * ahead + fx * side,
            width,
            height,
            rotationDegrees,
            ...(blockHeight === undefined ? {} : { blockHeight }),
          };
          expectTopLift(prop, blockHeight ?? DEFAULT_BLOCK_HEIGHTS[kind]!, heading);
        },
      ),
      { numRuns: 100 },
    );
  });

  const base = { id: "b1", x: 30, y: 0, width: 10, height: 10, rotationDegrees: 0 };

  it("uses the default height of the kind", () => {
    expectTopLift({ ...base, kind: "tower" }, 24);
  });

  it("uses blockHeight over the default", () => {
    expectTopLift({ ...base, kind: "building", blockHeight: 40 }, 40);
  });

  it("draws a block with blockHeight 0 with its top on its footprint and no side faces", () => {
    const prop: PropData = { ...base, kind: "building", blockHeight: 0 };
    expectTopLift(prop, 0);
    const view = makeView({ ...smallTown(), props: [prop] });
    const canvas = new RecordingCanvas();
    view.draw(canvas, { position: { x: 0, y: 0, headingDegrees: 0 } }, 0);
    expect(sideFaces(canvas)).toHaveLength(0);
  });

  it("never uses the footprint height as the block height", () => {
    expectTopLift({ ...base, kind: "building", height: 50 }, 12);
  });

  it("draws a kind outside the raised kinds flat, even with a blockHeight", () => {
    const view = makeView({ ...smallTown(), props: [{ ...base, kind: "tree", blockHeight: 30 }] });
    const canvas = new RecordingCanvas();
    view.draw(canvas, { position: { x: 0, y: 0, headingDegrees: 0 } }, 0);
    expect(topFaces(canvas)).toHaveLength(0);
    expect(sideFaces(canvas)).toHaveLength(0);
  });

  it("draws a block flat with a notice when its height cannot be used", () => {
    const view = makeView({ ...smallTown(), props: [{ ...base, kind: "building", blockHeight: -1 }] });
    const canvas = new RecordingCanvas();
    const result = view.draw(canvas, { position: { x: 0, y: 0, headingDegrees: 0 } }, 0);
    if (isViewError(result)) throw new Error(result.message);
    expect(topFaces(canvas)).toHaveLength(0);
    expect(result.notices.some((n) => n.message.includes('"b1"') && n.message.includes("flat"))).toBe(true);
  });
});

describe("Tilted view drawing", () => {
  const position = { x: 0, y: 0, headingDegrees: 0 };
  const town = (): EngineMap => ({
    ...smallTown(),
    props: [
      { id: "h1", kind: "house", x: 30, y: 10, width: 8, height: 8, rotationDegrees: 0 },
      { id: "t1", kind: "tower", x: 50, y: -10, width: 6, height: 6, rotationDegrees: 45 },
      { id: "q1", kind: "tree", x: 40, y: 0, width: 4, height: 4, rotationDegrees: 0 },
    ],
  });

  it("draws the fixture: ground first, raised blocks, then labels", () => {
    const view = makeView(town());
    const canvas = new RecordingCanvas();
    const result = view.draw(canvas, { position, destinationPlaceId: "p1" }, 0);
    if (isViewError(result)) throw new Error(result.message);
    expect(result.drew).toBe(true);
    const calls = canvas.getCalls();
    expect(calls[0]!.op).toBe("save");
    expect(topFaces(canvas)).toHaveLength(2);
    expect(sideFaces(canvas)).toHaveLength(8);
    const firstTop = calls.findIndex((c) => c.op === "fill" && c.state.fillColor === "#c9c2ae");
    const firstRoadFill = calls.findIndex((c) => c.op === "stroke");
    expect(firstRoadFill).toBeLessThan(firstTop);
  });

  it("puts the player in the lower half of the viewport", () => {
    const view = makeView(town());
    view.draw(new RecordingCanvas(), { position }, 0);
    const camera = view.getCamera()!;
    const sin = Math.sin((DEFAULT_TILT_DEGREES * Math.PI) / 180);
    const screen = projectTilted({ x: 0, y: 0 }, 0, DEFAULT_TILT_DEGREES, camera);
    if (isViewError(screen)) throw new Error(screen.message);
    expect(sin).toBeGreaterThan(0);
    expect(screen.y).toBeCloseTo(camera.viewportHeight * 0.75, 6);
    expect(screen.x).toBeCloseTo(camera.viewportWidth / 2, 6);
  });

  it("makes zero calls on a second draw when nothing changed", () => {
    const view = makeView(town());
    view.draw(new RecordingCanvas(), { position }, 0);
    const second = new RecordingCanvas();
    const result = view.draw(second, { position }, 0);
    if (isViewError(result)) throw new Error(result.message);
    expect(result.drew).toBe(false);
    expect(second.getCalls()).toHaveLength(0);
  });

  it("keeps the centre when it is resized and refuses a bad size or position", () => {
    const view = makeView(town());
    view.draw(new RecordingCanvas(), { position }, 0);
    const before = view.getCamera()!;
    expect(view.resize(300, 200)).toBeUndefined();
    const after = view.getCamera()!;
    expect([after.centerX, after.centerY]).toEqual([before.centerX, before.centerY]);
    expect(isViewError(view.resize(0, 100))).toBe(true);
    const bad = view.draw(new RecordingCanvas(), { position: { x: Number.NaN, y: 0, headingDegrees: 0 } }, 1);
    expect(isViewError(bad)).toBe(true);
  });
});
