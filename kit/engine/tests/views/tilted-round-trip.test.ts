import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createCamera, type Camera, type Point } from "../../src/views/camera.js";
import { projectTilted, unprojectTilted } from "../../src/views/tilted-projection.js";
import { isViewError, type ViewError } from "../../src/views/view-errors.js";
import { perspectiveCameraArb, tiltArb } from "./helpers/perspective-screen-check.js";

// Perspective version of the former affine round-trip test. The same cases are
// kept: round trip at the tilt limits 20 and 70, plain errors for a tilt out of
// range or not finite and for a height or point that is not finite, and
// Property 14 with the same 0.001 tolerance.

function ok<T extends object>(value: T | ViewError): T {
  if (isViewError(value)) throw new Error(value.message);
  return value;
}

const camera0: Camera = ok(
  createCamera({ centerX: 0, centerY: 0, zoom: 2, viewportWidth: 200, viewportHeight: 100 }),
);

describe("tilted projection under perspective: examples", () => {
  it("round trips at the tilt limits 20 and 70", () => {
    for (const tilt of [20, 70]) {
      const screen = ok(projectTilted({ x: 7, y: -13 }, 0, tilt, camera0)) as Point;
      const back = ok(unprojectTilted(screen, tilt, camera0)) as Point;
      expect(back.x).toBeCloseTo(7, 6);
      expect(back.y).toBeCloseTo(-13, 6);
    }
  });

  it("returns a plain error for a tilt out of range or not finite", () => {
    for (const tilt of [19.999, 70.001, NaN, Infinity, -Infinity]) {
      const forward = projectTilted({ x: 0, y: 0 }, 0, tilt, camera0);
      const backward = unprojectTilted({ x: 0, y: 0 }, tilt, camera0);
      for (const result of [forward, backward]) {
        expect(isViewError(result)).toBe(true);
        expect((result as ViewError).message).toContain("tilt angle");
      }
    }
    expect((projectTilted({ x: 0, y: 0 }, 0, 19.999, camera0) as ViewError).message).toContain(
      "from 20 to 70",
    );
  });

  it("returns an error for a height or point that is not finite", () => {
    expect(isViewError(projectTilted({ x: 0, y: 0 }, NaN, 35, camera0))).toBe(true);
    expect(isViewError(projectTilted({ x: Infinity, y: 0 }, 0, 35, camera0))).toBe(true);
    expect(isViewError(unprojectTilted({ x: 0, y: -Infinity }, 35, camera0))).toBe(true);
  });
});

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
        const ground = unprojectTilted(screen, tilt, camera);
        if (isViewError(ground)) throw new Error(ground.message);
        const projected = projectTilted(ground, 0, tilt, camera);
        if (isViewError(projected)) throw new Error(projected.message);
        const back = unprojectTilted(projected, tilt, camera);
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
        const ground = unprojectTilted(screen, tilt, camera);
        if (isViewError(ground)) throw new Error(ground.message);
        const back = projectTilted(ground, 0, tilt, camera);
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
        const ground = unprojectTilted(screen, tilt, camera, undefined, height);
        if (isViewError(ground)) throw new Error(ground.message);
        const back = projectTilted(ground, height, tilt, camera);
        if (isViewError(back)) throw new Error(back.message);
        expect(Math.abs(back.x - screen.x)).toBeLessThanOrEqual(0.001);
        expect(Math.abs(back.y - screen.y)).toBeLessThanOrEqual(0.001);
      }),
      { numRuns: 200 },
    );
  });
});
