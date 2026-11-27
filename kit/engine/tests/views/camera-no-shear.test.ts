import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { worldToScreen, type Point } from "../../src/views/camera.js";
import { cameraArb, worldPointClose } from "./helpers/view-arbitraries.js";

describe("camera transforms: no shear", () => {
  it("Property 3: world centre maps to the viewport centre and distances scale by zoom", () => {
    // Feature: map-views, Property 3: No shear, uniform scaling (includes world centre maps to viewport centre)
    // Validates: Requirements 2.9, 2.10
    fc.assert(
      fc.property(
        cameraArb.chain((camera) =>
          fc
            .tuple(worldPointClose(camera), worldPointClose(camera))
            .filter(([a, b]) => Math.hypot(a.x - b.x, a.y - b.y) >= 1)
            .map(([a, b]) => ({ camera, a, b })),
        ),
        ({ camera, a, b }) => {
          const centre = worldToScreen(camera, {
            x: camera.centerX,
            y: camera.centerY,
          }) as Point;
          expect(Math.abs(centre.x - camera.viewportWidth / 2)).toBeLessThanOrEqual(0.001);
          expect(Math.abs(centre.y - camera.viewportHeight / 2)).toBeLessThanOrEqual(0.001);

          const sa = worldToScreen(camera, a) as Point;
          const sb = worldToScreen(camera, b) as Point;
          const screenDistance = Math.hypot(sa.x - sb.x, sa.y - sb.y);
          const expected = Math.hypot(a.x - b.x, a.y - b.y) * camera.zoom;
          expect(Math.abs(screenDistance - expected)).toBeLessThanOrEqual(expected * 1e-6);
        },
      ),
      { numRuns: 200 },
    );
  });
});
