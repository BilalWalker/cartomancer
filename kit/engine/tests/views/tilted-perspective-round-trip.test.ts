import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Point } from "../../src/views/camera.js";
import { projectPerspective, unprojectPerspective } from "../../src/views/tilted-projection.js";
import { isViewError } from "../../src/views/view-errors.js";
import { perspectiveCameraArb, tiltArb } from "./helpers/perspective-screen-check.js";

// Feature: map-views, Property 14 (restated): Tilted projection round trip at
// ground level under perspective
// Validates: Requirements 12.12, 26.6

const inViewport = (camera: { viewportWidth: number; viewportHeight: number }): fc.Arbitrary<Point> =>
  fc
    .record({ u: fc.double({ min: 0, max: 1, noNaN: true }), v: fc.double({ min: 0, max: 1, noNaN: true }) })
    .map(({ u, v }) => ({ x: u * camera.viewportWidth, y: v * camera.viewportHeight }));

const caseArb = perspectiveCameraArb.chain((camera) =>
  fc.tuple(inViewport(camera), tiltArb).map(([screen, tilt]) => ({ camera, screen, tilt })),
);

describe("Property 14 (restated): round trip under the Perspective_Projection", () => {
  it("ground point to screen and back returns the ground point within 0.001 world units", () => {
    fc.assert(
      fc.property(caseArb, ({ camera, screen, tilt }) => {
        // A ground point whose projection lies inside the viewport.
        const ground = unprojectPerspective(screen, tilt, camera);
        if (isViewError(ground)) throw new Error(ground.message);
        const projected = projectPerspective(ground, 0, tilt, camera);
        if (isViewError(projected)) throw new Error(projected.message);
        const back = unprojectPerspective(projected, tilt, camera);
        if (isViewError(back)) throw new Error(back.message);
        expect(Math.abs(back.x - ground.x)).toBeLessThanOrEqual(0.001);
        expect(Math.abs(back.y - ground.y)).toBeLessThanOrEqual(0.001);
      }),
      { numRuns: 300 },
    );
  });

  it("screen point to ground and back returns the screen point within 0.001 CSS pixels", () => {
    fc.assert(
      fc.property(caseArb, ({ camera, screen, tilt }) => {
        const ground = unprojectPerspective(screen, tilt, camera);
        if (isViewError(ground)) throw new Error(ground.message);
        const back = projectPerspective(ground, 0, tilt, camera);
        if (isViewError(back)) throw new Error(back.message);
        expect(Math.abs(back.x - screen.x)).toBeLessThanOrEqual(0.001);
        expect(Math.abs(back.y - screen.y)).toBeLessThanOrEqual(0.001);
      }),
      { numRuns: 300 },
    );
  });

  it("round trips at a height as well", () => {
    fc.assert(
      fc.property(caseArb, fc.double({ min: 0, max: 20, noNaN: true }), ({ camera, screen, tilt }, height) => {
        const ground = unprojectPerspective(screen, tilt, camera, undefined, height);
        if (isViewError(ground)) throw new Error(ground.message);
        const back = projectPerspective(ground, height, tilt, camera);
        if (isViewError(back)) throw new Error(back.message);
        expect(Math.abs(back.x - screen.x)).toBeLessThanOrEqual(0.001);
        expect(Math.abs(back.y - screen.y)).toBeLessThanOrEqual(0.001);
      }),
      { numRuns: 200 },
    );
  });
});
