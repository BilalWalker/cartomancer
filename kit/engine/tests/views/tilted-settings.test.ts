import { describe, expect, it } from "vitest";
import type { PropData } from "../../src/types.js";
import { RecordingCanvas } from "../../src/views/recording-canvas.js";
import { DEFAULT_TILT_DEGREES, projectTilted } from "../../src/views/tilted-projection.js";
import { TiltedView } from "../../src/views/tilted-view.js";
import { isViewError } from "../../src/views/view-errors.js";
import { modelLift } from "./helpers/perspective-screen-check.js";
import { smallTown } from "./helpers/small-town.js";
import { topFaces } from "./helpers/tilted-faces.js";

const position = { x: 0, y: 0, headingDegrees: 0 };
const prop: PropData = {
  id: "b1",
  kind: "building",
  x: 30,
  y: 0,
  width: 10,
  height: 10,
  rotationDegrees: 0,
};

function makeView(): TiltedView {
  const view = TiltedView.create({ ...smallTown(), props: [prop] });
  if (isViewError(view)) throw new Error(view.message);
  return view;
}

/** Draws once and returns the pixel lift of the first top-face corner above its footprint corner. */
function drawnLift(view: TiltedView, tilt: number): number {
  const canvas = new RecordingCanvas();
  const result = view.draw(canvas, { position }, 0);
  if (isViewError(result)) throw new Error(result.message);
  const faces = topFaces(canvas);
  expect(faces).toHaveLength(1);
  const camera = view.getCamera()!;
  const base = projectTilted({ x: prop.x - 5, y: prop.y - 5 }, 0, tilt, camera);
  if (isViewError(base)) throw new Error(base.message);
  return base.y - faces[0]!.points[0]!.y;
}

describe("Tilted view settings", () => {
  it("starts at a tilt of 35 degrees", () => {
    expect(makeView().getTiltAngle()).toBe(35);
    expect(DEFAULT_TILT_DEGREES).toBe(35);
  });

  it("draws a frame at the tilt boundaries 20 and 70 and keeps the player on the player row", () => {
    for (const degrees of [20, 70]) {
      const view = makeView();
      expect(view.setTiltAngle(degrees)).toBeUndefined();
      const canvas = new RecordingCanvas();
      const result = view.draw(canvas, { position }, 0);
      if (isViewError(result)) throw new Error(result.message);
      expect(result.drew).toBe(true);
      expect(topFaces(canvas)).toHaveLength(1);
      const camera = view.getCamera()!;
      const player = projectTilted({ x: 0, y: 0 }, 0, degrees, camera);
      if (isViewError(player)) throw new Error(player.message);
      expect(player.y).toBeCloseTo(0.75 * camera.viewportHeight, 6);
    }
  });

  it("accepts the tilt boundaries 20 and 70 and a value between", () => {
    const view = makeView();
    for (const degrees of [20, 70, 33.5]) {
      expect(view.setTiltAngle(degrees)).toBeUndefined();
      expect(view.getTiltAngle()).toBe(degrees);
    }
  });

  it("refuses a tilt out of range or not finite and keeps the old angle", () => {
    const view = makeView();
    expect(view.setTiltAngle(30)).toBeUndefined();
    for (const bad of [19.99, 70.01, 0, -45, Number.NaN, Number.POSITIVE_INFINITY]) {
      const error = view.setTiltAngle(bad);
      expect(isViewError(error)).toBe(true);
      expect(view.getTiltAngle()).toBe(30);
    }
  });

  it("accepts the height factor boundaries 0 and 100", () => {
    const view = makeView();
    expect(view.setHeightFactor("building", 0)).toBeUndefined();
    expect(view.setHeightFactor("building", 100)).toBeUndefined();
    expect(view.setHeightFactor("building", 1)).toBeUndefined();
  });

  it("refuses a height factor out of range or not finite", () => {
    const view = makeView();
    for (const bad of [-0.01, 100.01, Number.NaN, Number.NEGATIVE_INFINITY]) {
      const error = view.setHeightFactor("building", bad);
      expect(isViewError(error)).toBe(true);
      if (isViewError(error)) expect(error.message).toContain("building");
    }
  });

  it("keeps the old factor when a new one is refused", () => {
    const view = makeView();
    expect(view.setHeightFactor("building", 2)).toBeUndefined();
    expect(isViewError(view.setHeightFactor("building", 101))).toBe(true);
    const lift = drawnLift(view, 35);
    const plain = drawnLift(makeView(), 35);
    expect(lift).toBeCloseTo(plain * 2, 6);
  });

  it("changes the drawn top lift when the height factor changes", () => {
    const plain = drawnLift(makeView(), 35);
    const view = makeView();
    expect(view.setHeightFactor("building", 3)).toBeUndefined();
    const tall = drawnLift(view, 35);
    expect(plain).toBeGreaterThan(0);
    expect(tall).toBeCloseTo(plain * 3, 6);
  });

  it("draws the block flat when the factor is 0", () => {
    const view = makeView();
    expect(view.setHeightFactor("building", 0)).toBeUndefined();
    expect(drawnLift(view, 35)).toBeCloseTo(0, 6);
  });

  it("makes a new frame due after a setting changes", () => {
    const view = makeView();
    view.draw(new RecordingCanvas(), { position }, 0);
    expect(view.setTiltAngle(60)).toBeUndefined();
    const result = view.draw(new RecordingCanvas(), { position }, 1);
    if (isViewError(result)) throw new Error(result.message);
    expect(result.drew).toBe(true);
  });

  it("uses the new tilt when drawing", () => {
    const view = makeView();
    expect(view.setTiltAngle(60)).toBeUndefined();
    const lift = drawnLift(view, 60);
    // Independent pinhole model: 12 units * zoom 2 * cos(60) times f / z of the corner (25, -5).
    const expected = modelLift(view.getCamera()!, 60, { x: prop.x - 5, y: prop.y - 5 }, 12);
    expect(lift).toBeCloseTo(expected, 6);
    expect(lift).toBeLessThan(12 * 2 * Math.cos((60 * Math.PI) / 180));
  });
});
