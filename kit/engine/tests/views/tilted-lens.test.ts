import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createCamera, screenToWorld, worldToScreen, type Camera, type Point } from "../../src/views/camera.js";
import {
  focalDistanceFor,
  NEAR_CLIP_FRACTION,
  projectTilted,
  unprojectTilted,
} from "../../src/views/tilted-projection.js";
import { isViewError, type ViewError } from "../../src/views/view-errors.js";
import { perspectiveCameraArb, tiltArb } from "./helpers/perspective-screen-check.js";

// Feature: map-views, Property 29: The lens puts the top edge on the ground and
// keeps the Far_Edge scale
// Validates: Requirements 26.3, 26.5

function num<T>(value: T | ViewError): T {
  if (isViewError(value)) throw new Error(value.message);
  return value;
}

/** Depth along the optical axis, in CSS pixels, of a world point. */
function depthPx(camera: Camera, tilt: number, ground: Point): number {
  const f = num(focalDistanceFor(tilt, camera.viewportHeight));
  const flat = num(worldToScreen(camera, ground));
  const g = camera.viewportHeight / 2 - flat.y;
  return f + g * Math.cos((tilt * Math.PI) / 180);
}

/** Screen width of a world segment of length `length` across the heading, centred on `centre`. */
function acrossWidth(camera: Camera, tilt: number, centre: Point, length: number): number {
  // World direction of the screen's right-hand axis.
  const origin = num(screenToWorld(camera, { x: 0, y: 0 }));
  const right = num(screenToWorld(camera, { x: 1, y: 0 }));
  const norm = Math.hypot(right.x - origin.x, right.y - origin.y);
  const dir = { x: (right.x - origin.x) / norm, y: (right.y - origin.y) / norm };
  const a = num(
    projectTilted(
      { x: centre.x - (dir.x * length) / 2, y: centre.y - (dir.y * length) / 2 },
      0,
      tilt,
      camera,
    ),
  );
  const b = num(
    projectTilted(
      { x: centre.x + (dir.x * length) / 2, y: centre.y + (dir.y * length) / 2 },
      0,
      tilt,
      camera,
    ),
  );
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe("Property 29: the lens", () => {
  it("(a) the top row has ground above the near clip and the horizon lies above the top edge", () => {
    fc.assert(
      fc.property(
        perspectiveCameraArb,
        tiltArb,
        fc.double({ min: 0, max: 1, noNaN: true }),
        (camera, tilt, u) => {
          const ground = num(unprojectTilted({ x: u * camera.viewportWidth, y: 0 }, tilt, camera));
          const f = num(focalDistanceFor(tilt, camera.viewportHeight));
          expect(depthPx(camera, tilt, ground)).toBeGreaterThan(NEAR_CLIP_FRACTION * f);
          const horizonRow =
            0.75 * camera.viewportHeight - f * Math.tan((tilt * Math.PI) / 180);
          expect(horizonRow).toBeLessThan(0);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("(b) a segment at the Far_Edge is at most 60% of the width at the player", () => {
    fc.assert(
      fc.property(
        perspectiveCameraArb,
        tiltArb,
        fc.double({ min: 0.5, max: 50, noNaN: true }),
        (camera, tilt, length) => {
          const farGround = num(
            unprojectTilted({ x: camera.viewportWidth / 2, y: 0 }, tilt, camera),
          );
          const player: Point = { x: camera.centerX, y: camera.centerY };
          const atFar = acrossWidth(camera, tilt, farGround, length);
          const atPlayer = acrossWidth(camera, tilt, player, length);
          expect(atFar).toBeLessThanOrEqual(0.6 * atPlayer);
          // The closed form gives exactly one half.
          expect(atFar / atPlayer).toBeCloseTo(0.5, 6);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("gives 0.5 for 400 x 300 and 375 x 500 at the default tilt of 35 degrees", () => {
    for (const [w, h] of [
      [400, 300],
      [375, 500],
    ] as const) {
      const camera = num(
        createCamera({ viewportWidth: w, viewportHeight: h, zoom: 2 }),
      );
      const far = num(unprojectTilted({ x: w / 2, y: 0 }, 35, camera));
      expect(acrossWidth(camera, 35, far, 10) / acrossWidth(camera, 35, { x: 0, y: 0 }, 10)).toBeCloseTo(0.5, 9);
    }
  });
});
