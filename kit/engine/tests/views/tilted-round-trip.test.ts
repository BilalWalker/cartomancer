import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createCamera, type Camera, type Point } from "../../src/views/camera.js";
import {
  projectTilted,
  unprojectTilted,
} from "../../src/views/tilted-projection.js";
import { isViewError, type ViewError } from "../../src/views/view-errors.js";
import { cameraArb, worldPointNear } from "./helpers/view-arbitraries.js";

function ok<T extends object>(value: T | ViewError): T {
  if (isViewError(value)) throw new Error(value.message);
  return value;
}

const camera0: Camera = ok(
  createCamera({ centerX: 0, centerY: 0, zoom: 2, viewportWidth: 200, viewportHeight: 100 }),
);

describe("tilted projection: examples", () => {
  it("shortens the vertical offset by sin of the tilt and lifts by height times cos", () => {
    const flat = ok(projectTilted({ x: 0, y: 10 }, 0, 30, camera0)) as Point;
    expect(flat.x).toBeCloseTo(100, 9);
    expect(flat.y).toBeCloseTo(50 + 20 * 0.5, 9);
    const lifted = ok(projectTilted({ x: 0, y: 10 }, 10, 60, camera0)) as Point;
    expect(lifted.y).toBeCloseTo(50 + 20 * Math.sin(Math.PI / 3) - 20 * 0.5, 9);
  });

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
    expect(isViewError(projectTilted({ x: 0, y: 0 }, NaN, 45, camera0))).toBe(true);
    expect(isViewError(projectTilted({ x: Infinity, y: 0 }, 0, 45, camera0))).toBe(true);
    expect(isViewError(unprojectTilted({ x: 0, y: -Infinity }, 45, camera0))).toBe(true);
  });
});

describe("tilted projection: round trip", () => {
  it("Property 14: ground point to screen and back returns the ground point", () => {
    // Feature: map-views, Property 14: Tilted projection round trip at ground level
    // Validates: Requirements 12.12
    fc.assert(
      fc.property(
        cameraArb.chain((camera) =>
          fc
            .tuple(worldPointNear(camera), fc.double({ min: 20, max: 70, noNaN: true }))
            .map(([point, tilt]) => ({ camera, point, tilt })),
        ),
        ({ camera, point, tilt }) => {
          const screen = projectTilted(point, 0, tilt, camera) as Point;
          const back = unprojectTilted(screen, tilt, camera) as Point;
          expect(Math.abs(back.x - point.x)).toBeLessThanOrEqual(0.001);
          expect(Math.abs(back.y - point.y)).toBeLessThanOrEqual(0.001);
        },
      ),
      { numRuns: 200 },
    );
  });
});
