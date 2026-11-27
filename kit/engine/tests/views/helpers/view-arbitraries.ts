import * as fc from "fast-check";
import type { Camera, Point } from "../../../src/views/camera.js";

/** A valid camera: centre within 1,000,000 units, zoom 0.001 to 1000, any rotation, viewport 1 to 16384. */
export const cameraArb: fc.Arbitrary<Camera> = fc.record({
  centerX: fc.double({ min: -1_000_000, max: 1_000_000, noNaN: true }),
  centerY: fc.double({ min: -1_000_000, max: 1_000_000, noNaN: true }),
  zoom: fc
    .double({ min: -3, max: 3, noNaN: true })
    .map((exponent) => Math.min(1000, Math.max(0.001, 10 ** exponent))),
  rotationDegrees: fc.double({ min: -1080, max: 1080, noNaN: true }),
  viewportWidth: fc.integer({ min: 1, max: 16384 }),
  viewportHeight: fc.integer({ min: 1, max: 16384 }),
});

/** A viewport size in CSS pixels. */
export const viewportArb: fc.Arbitrary<{ width: number; height: number }> = fc.record({
  width: fc.integer({ min: 1, max: 16384 }),
  height: fc.integer({ min: 1, max: 16384 }),
});

const unit = fc.double({ min: -1, max: 1, noNaN: true });

/** A world point within 100,000 CSS pixels divided by zoom of the camera centre. */
export function worldPointNear(camera: Camera): fc.Arbitrary<Point> {
  const reach = (100_000 / camera.zoom) * 0.7;
  return fc.record({ x: unit, y: unit }).map((u) => ({
    x: camera.centerX + u.x * reach,
    y: camera.centerY + u.y * reach,
  }));
}

/** A screen point within 100,000 CSS pixels of the viewport centre. */
export function screenPointNear(camera: Camera): fc.Arbitrary<Point> {
  return fc.record({ x: unit, y: unit }).map((u) => ({
    x: camera.viewportWidth / 2 + u.x * 70_000,
    y: camera.viewportHeight / 2 + u.y * 70_000,
  }));
}

/** A world point within 1,000 units of the camera centre. */
export function worldPointClose(camera: Camera): fc.Arbitrary<Point> {
  return fc.record({ x: unit, y: unit }).map((u) => ({
    x: camera.centerX + u.x * 1000,
    y: camera.centerY + u.y * 1000,
  }));
}
