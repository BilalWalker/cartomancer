import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { screenToWorld, type Camera, type Point } from "../../src/views/camera.js";
import { focalDistanceFor, projectTilted } from "../../src/views/tilted-projection.js";
import { isViewError } from "../../src/views/view-errors.js";
import { perspectiveCameraArb, tiltArb } from "./helpers/perspective-screen-check.js";

// Feature: map-views, Property 28: Perspective narrowing
// Validates: Requirements 26.8, 12.20

function groundAt(camera: Camera, lateralPixels: number, forwardPixels: number): Point {
  // A world point at a lateral and a forward offset (pixels) from the player,
  // found with the plain camera transform.
  const world = screenToWorld(camera, {
    x: camera.viewportWidth / 2 + lateralPixels,
    y: camera.viewportHeight / 2 - forwardPixels,
  });
  if (isViewError(world)) throw new Error(world.message);
  return world;
}

function screenDistance(camera: Camera, tilt: number, a: Point, b: Point): number {
  const pa = projectTilted(a, 0, tilt, camera);
  const pb = projectTilted(b, 0, tilt, camera);
  if (isViewError(pa)) throw new Error(pa.message);
  if (isViewError(pb)) throw new Error(pb.message);
  return Math.hypot(pa.x - pb.x, pa.y - pb.y);
}

describe("Property 28: Perspective narrowing", () => {
  it("the same lateral separation looks smaller on a line that is farther from the viewer", () => {
    fc.assert(
      fc.property(
        perspectiveCameraArb,
        tiltArb,
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0.05, max: 1, noNaN: true }),
        fc.double({ min: -1, max: 1, noNaN: true }),
        (camera, tilt, u1, u2, separationShare, centreShare) => {
          const f = focalDistanceFor(tilt, camera.viewportHeight);
          if (isViewError(f)) throw new Error(f.message);
          const c = Math.cos((tilt * Math.PI) / 180);
          // Forward offsets of the bottom and top row of the viewport, in pixels.
          const gBottom = -f / (7 * c);
          const gTop = f / c;
          const gA = gBottom + Math.min(u1, u2) * (gTop - gBottom);
          const gB = gBottom + Math.max(u1, u2) * (gTop - gBottom);
          fc.pre(gB - gA >= 1);
          const separation = separationShare * (camera.viewportWidth / 4);
          // Points sit within 0.6 * separation of the vertical centre line of
          // the screen, which is inside the viewport.
          const centre = (centreShare * camera.viewportWidth) / 8;
          const near = screenDistance(
            camera,
            tilt,
            groundAt(camera, centre - separation / 2, gA),
            groundAt(camera, centre + separation / 2, gA),
          );
          const far = screenDistance(
            camera,
            tilt,
            groundAt(camera, centre - separation / 2, gB),
            groundAt(camera, centre + separation / 2, gB),
          );
          expect(far).toBeLessThan(near);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("holds in an example: a line at the player is wider than one at the top row", () => {
    const camera = {
      centerX: 0,
      centerY: 0,
      zoom: 1,
      rotationDegrees: 0,
      viewportWidth: 400,
      viewportHeight: 300,
    };
    const atPlayer = screenDistance(camera, 35, { x: -10, y: 0 }, { x: 10, y: 0 });
    const atTop = screenDistance(camera, 35, { x: -10, y: -400 }, { x: 10, y: -400 });
    expect(atTop).toBeLessThan(atPlayer);
    expect(atPlayer).toBeCloseTo(20, 9);
  });
});
