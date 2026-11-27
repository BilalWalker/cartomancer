import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import {
  createCamera,
  panCamera,
  screenToWorld,
  worldToScreen,
  zoomCamera,
  type Camera,
  type Point,
} from "../../src/views/camera.js";
import { isViewError } from "../../src/views/view-errors.js";
import { cameraArb, screenPointNear } from "./helpers/view-arbitraries.js";

function mustCamera(init: Partial<Camera>): Camera {
  const camera = createCamera(init);
  if (isViewError(camera)) throw new Error(camera.message);
  return camera;
}

function mustPoint(value: Point | { message: string }): Point {
  if (isViewError(value)) throw new Error(value.message);
  return value as Point;
}

describe("zoom and pan at an anchor", () => {
  it("Feature: map-views, Property 10: Zoom keeps the anchor point fixed in world space", () => {
    // Feature: map-views, Property 10: Zoom keeps the anchor point fixed in world space
    // **Validates: Requirements 10.8**
    fc.assert(
      fc.property(
        cameraArb.chain((camera) =>
          fc.tuple(
            fc.constant(camera),
            screenPointNear(camera),
            fc.double({ min: 0.1, max: 10, noNaN: true }),
          ),
        ),
        ([camera, anchor, factor]) => {
          const before = mustPoint(screenToWorld(camera, anchor));
          const zoomed = zoomCamera(camera, anchor, factor);
          expect(isViewError(zoomed)).toBe(false);
          const after = mustPoint(worldToScreen(zoomed as Camera, before));
          expect(Math.abs(after.x - anchor.x)).toBeLessThan(0.001);
          expect(Math.abs(after.y - anchor.y)).toBeLessThan(0.001);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("zooms in by the factor and keeps the viewport centre fixed when anchored there", () => {
    const camera = mustCamera({ centerX: 10, centerY: 20, zoom: 2, viewportWidth: 200, viewportHeight: 100 });
    const zoomed = zoomCamera(camera, { x: 100, y: 50 }, 2) as Camera;
    expect(zoomed.zoom).toBe(4);
    expect(zoomed.centerX).toBeCloseTo(10, 9);
    expect(zoomed.centerY).toBeCloseTo(20, 9);
  });

  it("holds the zoom within its limits and still keeps the anchor fixed", () => {
    const camera = mustCamera({ zoom: 900, viewportWidth: 200, viewportHeight: 100 });
    const anchor = { x: 30, y: 70 };
    const before = mustPoint(screenToWorld(camera, anchor));
    const zoomed = zoomCamera(camera, anchor, 10) as Camera;
    expect(zoomed.zoom).toBe(1000);
    const after = mustPoint(worldToScreen(zoomed, before));
    expect(after.x).toBeCloseTo(30, 6);
    expect(after.y).toBeCloseTo(70, 6);
  });

  it("pan keeps the world point under the pointer", () => {
    const camera = mustCamera({ centerX: 5, centerY: -3, zoom: 3, rotationDegrees: 40 });
    const pointer = { x: 120, y: 80 };
    const world = mustPoint(screenToWorld(camera, pointer));
    const panned = panCamera(camera, { dx: 25, dy: -15 }) as Camera;
    const after = mustPoint(worldToScreen(panned, world));
    expect(after.x).toBeCloseTo(145, 6);
    expect(after.y).toBeCloseTo(65, 6);
  });

  it("returns an error and leaves the camera unchanged for a bad factor", () => {
    const camera = mustCamera({});
    const copy = { ...camera };
    for (const factor of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const result = zoomCamera(camera, { x: 10, y: 10 }, factor);
      expect(isViewError(result)).toBe(true);
      if (isViewError(result)) expect(result.message).toContain("zoom factor");
    }
    expect(camera).toEqual(copy);
  });

  it("returns an error for a bad anchor or a bad pan distance", () => {
    const camera = mustCamera({});
    expect(isViewError(zoomCamera(camera, { x: Number.NaN, y: 0 }, 2))).toBe(true);
    expect(isViewError(zoomCamera(camera, { x: 0, y: Number.POSITIVE_INFINITY }, 2))).toBe(true);
    expect(isViewError(panCamera(camera, { dx: Number.NaN, dy: 0 }))).toBe(true);
    expect(isViewError(panCamera(camera, { dx: 0, dy: Number.NEGATIVE_INFINITY }))).toBe(true);
  });

  it("accepts factors just above 0 and returns the lower zoom limit", () => {
    const camera = mustCamera({ zoom: 1 });
    const zoomed = zoomCamera(camera, { x: 0, y: 0 }, Number.MIN_VALUE) as Camera;
    expect(zoomed.zoom).toBe(0.001);
  });
});
