import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { EngineMap, PropData } from "../../src/types.js";
import { DEFAULT_BLOCK_HEIGHTS, RAISED_KINDS } from "../../src/views/block-height.js";
import { DEFAULT_TILT_DEGREES, projectTilted } from "../../src/views/tilted-projection.js";
import { RecordingCanvas } from "../../src/views/recording-canvas.js";
import { DEFAULT_STYLE } from "../../src/views/style.js";
import { TiltedView } from "../../src/views/tilted-view.js";
import { isViewError } from "../../src/views/view-errors.js";
import { modelLift, modelProject, tiltArb } from "./helpers/perspective-screen-check.js";
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

/**
 * Draws one prop and checks its top face lies `expectedHeight` above its
 * footprint under the Perspective_Projection: each top corner is the footprint
 * corner of an independent pinhole model, moved up by
 * `expectedHeight * zoom * cos(tilt)` times the scale `f / z` of that corner.
 * At the player the scale is 1.
 */
function expectTopLift(
  prop: PropData,
  expectedHeight: number,
  options: { heading?: number; tilt?: number; factor?: number } = {},
): void {
  const { heading = 0, tilt = DEFAULT_TILT_DEGREES, factor = 1 } = options;
  const view = makeView({ ...smallTown(), props: [prop] });
  expect(view.setTiltAngle(tilt)).toBeUndefined();
  expect(view.setHeightFactor(prop.kind, factor)).toBeUndefined();
  const canvas = new RecordingCanvas();
  const result = view.draw(canvas, { position: { x: 0, y: 0, headingDegrees: heading } }, 0);
  expect(isViewError(result)).toBe(false);
  const camera = view.getCamera()!;
  const faces = topFaces(canvas);
  expect(faces).toHaveLength(1);
  corners(prop).forEach((corner, i) => {
    const base = modelProject(camera, tilt, corner, 0);
    const liftPx = modelLift(camera, tilt, corner, expectedHeight * factor);
    const top = faces[0]!.points[i]!;
    expect(Math.abs(top.x - base.x)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(top.y - (base.y - liftPx))).toBeLessThanOrEqual(0.01);
    // The production projection agrees with the model at the same height.
    const projected = projectTilted(corner, expectedHeight * factor, tilt, camera);
    if (isViewError(projected)) throw new Error(projected.message);
    expect(Math.abs(top.y - projected.y)).toBeLessThanOrEqual(0.01);
  });
}

describe("Tilted view block height", () => {
  it("lifts the top of a raised block above its footprint by the block height", () => {
    // Feature: map-views, Property 20 (restated): Raised block top lies above its footprint by the block height, scaled by depth
    // **Validates: Requirements 12.15, 12.17, 12.19, 12.20, 26.2**
    fc.assert(
      fc.property(
        tiltArb,
        fc.constantFrom(...RAISED_KINDS),
        fc.option(fc.double({ min: 0, max: 100, noNaN: true }), { nil: undefined }),
        fc.double({ min: 1, max: 20, noNaN: true }),
        fc.double({ min: 1, max: 20, noNaN: true }),
        fc.double({ min: -360, max: 360, noNaN: true }),
        fc.double({ min: 10, max: 60, noNaN: true }),
        fc.double({ min: -30, max: 30, noNaN: true }),
        fc.constantFrom(0, 90, 180, 270),
        (tilt, kind, blockHeight, width, height, rotationDegrees, ahead, side, heading) => {
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
          expectTopLift(prop, blockHeight ?? DEFAULT_BLOCK_HEIGHTS[kind]!, { heading, tilt });
        },
      ),
      { numRuns: 100 },
    );
  });

  it("lifts a corner at the player by blockHeight * cos(tilt) * factor * zoom within 0.01 px", () => {
    // Feature: map-views, Property 20 (restated), the lift at the player is exact
    // **Validates: Requirements 12.15, 12.20, 26.2**
    fc.assert(
      fc.property(
        tiltArb,
        fc.double({ min: 0, max: 10, noNaN: true }),
        fc.double({ min: 1, max: 60, noNaN: true }),
        fc.double({ min: 1, max: 12, noNaN: true }),
        (tilt, factor, blockHeight, size) => {
          // The first footprint corner lies on the player, at the world origin.
          const prop: PropData = {
            id: "b1",
            kind: "building",
            x: size / 2,
            y: size / 2,
            width: size,
            height: size,
            rotationDegrees: 0,
            blockHeight,
          };
          const view = makeView({ ...smallTown(), props: [prop] });
          expect(view.setTiltAngle(tilt)).toBeUndefined();
          expect(view.setHeightFactor("building", factor)).toBeUndefined();
          const canvas = new RecordingCanvas();
          view.draw(canvas, { position: { x: 0, y: 0, headingDegrees: 0 } }, 0);
          const camera = view.getCamera()!;
          const top = topFaces(canvas)[0]!.points[0]!;
          const groundRow = 0.75 * camera.viewportHeight;
          const expected = blockHeight * Math.cos((tilt * Math.PI) / 180) * factor * camera.zoom;
          expect(Math.abs(groundRow - top.y - expected)).toBeLessThanOrEqual(0.01);
          expect(Math.abs(top.x - camera.viewportWidth / 2)).toBeLessThanOrEqual(0.01);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("scales the lift by f / z, so a farther block of the same height is lifted less", () => {
    const heightOf = (ahead: number): number => {
      const prop: PropData = { id: "b", kind: "tower", x: ahead, y: 0, width: 6, height: 6, rotationDegrees: 0 };
      const view = makeView({ ...smallTown(), props: [prop] });
      const canvas = new RecordingCanvas();
      view.draw(canvas, { position: { x: 0, y: 0, headingDegrees: 0 } }, 0);
      const camera = view.getCamera()!;
      const base = modelProject(camera, DEFAULT_TILT_DEGREES, { x: ahead - 3, y: -3 }, 0);
      return base.y - topFaces(canvas)[0]!.points[0]!.y;
    };
    const near = heightOf(10);
    const far = heightOf(100);
    expect(far).toBeLessThan(near);
    const player = 24 * 2 * Math.cos((DEFAULT_TILT_DEGREES * Math.PI) / 180);
    expect(near).toBeLessThan(player);
    expect(far).toBeGreaterThan(0);
  });

  const base = { id: "b1", x: 30, y: 0, width: 10, height: 10, rotationDegrees: 0 };

  it("uses the default height of the kind", () => {
    expectTopLift({ ...base, kind: "tower" }, 24);
  });

  it("uses blockHeight over the default", () => {
    expectTopLift({ ...base, kind: "building", blockHeight: 40 }, 40);
  });

  it("applies the height factor of the kind", () => {
    expectTopLift({ ...base, kind: "house" }, 6, { factor: 2.5 });
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
    // The eye lies behind the player on the heading line (x < 0). Back faces are
    // culled: h1 at (30, 10) shows its face towards -x and its face towards -y;
    // the turned tower t1 at (50, -10) shows its two faces that look towards -x.
    expect(sideFaces(canvas)).toHaveLength(4);
    const firstTop = calls.findIndex((c) => c.op === "fill" && c.state.fillColor === "#c9c2ae");
    const firstRoadFill = calls.findIndex((c) => c.op === "stroke");
    expect(firstRoadFill).toBeLessThan(firstTop);
  });

  it("culls back faces: a block on the heading line shows one side face, an off-line block two", () => {
    const sideCount = (y: number): number => {
      const prop: PropData = { id: "b", kind: "building", x: 30, y, width: 10, height: 10, rotationDegrees: 0 };
      const view = makeView({ ...smallTown(), props: [prop] });
      const canvas = new RecordingCanvas();
      view.draw(canvas, { position }, 0);
      return sideFaces(canvas).length;
    };
    expect(sideCount(0)).toBe(1);
    expect(sideCount(10)).toBe(2);
    expect(sideCount(-10)).toBe(2);
  });

  it("draws the farther side face before the nearer one, then the top face", () => {
    const prop: PropData = { id: "b", kind: "building", x: 30, y: 10, width: 10, height: 10, rotationDegrees: 0 };
    const view = makeView({ ...smallTown(), props: [prop] });
    const canvas = new RecordingCanvas();
    view.draw(canvas, { position }, 0);
    const calls = canvas.getCalls();
    const sideIndexes = calls
      .map((c, i) => (c.op === "fill" && c.state.fillColor === DEFAULT_STYLE.raisedBlockSideColor ? i : -1))
      .filter((i) => i >= 0);
    const topIndex = calls.findIndex((c) => c.op === "fill" && c.state.fillColor === "#c9c2ae");
    expect(sideIndexes.length).toBe(sideFaces(canvas).length);
    expect(Math.max(...sideIndexes)).toBeLessThan(topIndex);
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
