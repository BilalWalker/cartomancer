import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { EngineMap } from "../../src/types.js";
import { tiltedVisibleRegion, unprojectPerspective } from "../../src/views/tilted-projection.js";
import { buildSpatialIndex, computeVisibleSet } from "../../src/views/visible-set.js";
import { isViewError } from "../../src/views/view-errors.js";
import {
  anyCornerOnScreen,
  perspectiveCameraArb,
  tiltArb,
} from "./helpers/perspective-screen-check.js";

// Feature: map-views, Property 30: The Tilted_View's visible region covers the Viewport
// Validates: Requirements 12.10, 12.18, 26.5

interface TestProp {
  id: string;
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDegrees: number;
  blockHeight: number;
}

function mapOf(props: TestProp[]): EngineMap {
  return {
    formatVersion: 1,
    nodes: [],
    roads: [],
    places: [],
    blockedAreas: [],
    props,
    style: { colors: {}, lineStyles: {} },
    usableRoadIds: new Set<string>(),
    blockedRoads: [],
  } as unknown as EngineMap;
}

const unit = fc.double({ min: 0, max: 1, noNaN: true });

describe("Property 30: visible region", () => {
  it("holds the ground point under every screen point inside the viewport", () => {
    fc.assert(
      fc.property(perspectiveCameraArb, tiltArb, unit, unit, (camera, tilt, u, v) => {
        const region = tiltedVisibleRegion(camera, tilt, 0, 0);
        if (isViewError(region)) throw new Error(region.message);
        const ground = unprojectPerspective(
          { x: u * camera.viewportWidth, y: v * camera.viewportHeight },
          tilt,
          camera,
        );
        if (isViewError(ground)) throw new Error(ground.message);
        expect(ground.x).toBeGreaterThanOrEqual(region.minX);
        expect(ground.x).toBeLessThanOrEqual(region.maxX);
        expect(ground.y).toBeGreaterThanOrEqual(region.minY);
        expect(ground.y).toBeLessThanOrEqual(region.maxY);
      }),
      { numRuns: 300 },
    );
  });

  it("puts into the visible set every prop that an independent screen test finds on screen", () => {
    fc.assert(
      fc.property(
        perspectiveCameraArb,
        tiltArb,
        fc.array(
          fc.record({
            u: fc.double({ min: -1.5, max: 1.5, noNaN: true }),
            v: fc.double({ min: -1.5, max: 1.5, noNaN: true }),
            width: fc.integer({ min: 1, max: 60 }),
            height: fc.integer({ min: 1, max: 60 }),
            rotationDegrees: fc.integer({ min: -360, max: 360 }),
            blockHeight: fc.double({ min: 0, max: 100, noNaN: true }),
          }),
          { minLength: 1, maxLength: 12 },
        ),
        (camera, tilt, specs) => {
          // Props are placed around the player, up to 1.5 viewport widths and
          // heights away in the plain (unturned) world frame at pixel scale.
          const props: TestProp[] = specs.map((s, i) => ({
            id: `b${i}`,
            kind: "building",
            x: camera.centerX + (s.u * camera.viewportWidth) / camera.zoom,
            y: camera.centerY + (s.v * camera.viewportHeight) / camera.zoom,
            width: s.width,
            height: s.height,
            rotationDegrees: s.rotationDegrees,
            blockHeight: s.blockHeight,
          }));
          const maxLift = Math.max(...props.map((p) => p.blockHeight));
          const region = tiltedVisibleRegion(camera, tilt, maxLift, 0);
          if (isViewError(region)) throw new Error(region.message);
          const set = computeVisibleSet(buildSpatialIndex(mapOf(props)), region);
          for (const prop of props) {
            if (anyCornerOnScreen(camera, tilt, prop, prop.blockHeight)) {
              expect(set.propIds.has(prop.id)).toBe(true);
            }
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it("keeps a block whose base is below the viewport but whose roof is inside", () => {
    const camera = {
      centerX: 0,
      centerY: 0,
      zoom: 1,
      rotationDegrees: 0,
      viewportWidth: 400,
      viewportHeight: 300,
    };
    // The bottom row is 75 pixels below the player's row. A prop whose centre
    // is just below that ground edge, with a roof 200 world units high, shows.
    const flat = tiltedVisibleRegion(camera, 35, 0, 0);
    const tall = tiltedVisibleRegion(camera, 35, 200, 0);
    if (isViewError(flat) || isViewError(tall)) throw new Error("region failed");
    const prop: TestProp = {
      id: "tower",
      kind: "building",
      x: 0,
      y: flat.maxY + 20,
      width: 10,
      height: 10,
      rotationDegrees: 0,
      blockHeight: 200,
    };
    const index = buildSpatialIndex(mapOf([prop]));
    expect(computeVisibleSet(index, flat).propIds.has("tower")).toBe(false);
    expect(computeVisibleSet(index, tall).propIds.has("tower")).toBe(true);
    expect(anyCornerOnScreen(camera, 35, prop, 200)).toBe(true);
  });
});
