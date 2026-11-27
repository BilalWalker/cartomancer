import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  createCamera,
  screenToWorld,
  worldToScreen,
  type Camera,
  type Point,
} from "../../src/views/camera.js";
import { isViewError, type ViewError } from "../../src/views/view-errors.js";
import { cameraArb, screenPointNear, worldPointNear } from "./helpers/view-arbitraries.js";

function ok<T extends object>(value: T | ViewError): T {
  if (isViewError(value)) throw new Error(value.message);
  return value;
}

const camera0: Camera = ok(
  createCamera({ centerX: 10, centerY: 20, zoom: 2, viewportWidth: 200, viewportHeight: 100 }),
);

describe("camera transforms: examples", () => {
  it("with rotation 0, x grows right and y grows down by zoom", () => {
    const origin = ok(worldToScreen(camera0, { x: 10, y: 20 })) as Point;
    const moved = ok(worldToScreen(camera0, { x: 11, y: 21 })) as Point;
    expect(origin).toEqual({ x: 100, y: 50 });
    expect(moved.x - origin.x).toBeCloseTo(2, 9);
    expect(moved.y - origin.y).toBeCloseTo(2, 9);
  });

  it("with rotation 90, world +x maps to screen +y", () => {
    const camera = ok(createCamera({ ...camera0, rotationDegrees: 90 }));
    const origin = ok(worldToScreen(camera, { x: 10, y: 20 })) as Point;
    const moved = ok(worldToScreen(camera, { x: 11, y: 20 })) as Point;
    expect(moved.x - origin.x).toBeCloseTo(0, 9);
    expect(moved.y - origin.y).toBeCloseTo(2, 9);
  });

  it("rotation r and r + 360 agree within 0.001 pixels", () => {
    const a = ok(createCamera({ ...camera0, rotationDegrees: 37 }));
    const b = ok(createCamera({ ...camera0, rotationDegrees: 397 }));
    const pa = ok(worldToScreen(a, { x: 55, y: -8 })) as Point;
    const pb = ok(worldToScreen(b, { x: 55, y: -8 })) as Point;
    expect(Math.abs(pa.x - pb.x)).toBeLessThan(0.001);
    expect(Math.abs(pa.y - pb.y)).toBeLessThan(0.001);
  });

  it("returns an error for a point that is not finite, without coordinates", () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      const result = worldToScreen(camera0, { x: bad, y: 3 });
      expect(isViewError(result)).toBe(true);
      expect((result as { message: string }).message).toContain("world point");
      const back = screenToWorld(camera0, { x: 4, y: bad });
      expect(isViewError(back)).toBe(true);
      expect((back as { message: string }).message).toContain("screen point");
      expect((back as { message: string }).message).not.toMatch(/\d/);
    }
  });
});

describe("createCamera: ranges", () => {
  const zoomRule = "from 0.001 to 1000";
  it("accepts the zoom limits and rejects values outside, NaN and infinities", () => {
    expect(isViewError(createCamera({ zoom: 0.001 }))).toBe(false);
    expect(isViewError(createCamera({ zoom: 1000 }))).toBe(false);
    for (const zoom of [0.0009999, 1000.001, NaN, Infinity, -Infinity]) {
      const result = createCamera({ zoom });
      expect(isViewError(result)).toBe(true);
      expect((result as { message: string }).message).toContain(zoomRule);
    }
  });

  it("accepts the viewport limits and rejects values outside, NaN and infinities", () => {
    for (const key of ["viewportWidth", "viewportHeight"] as const) {
      expect(isViewError(createCamera({ [key]: 1 }))).toBe(false);
      expect(isViewError(createCamera({ [key]: 16384 }))).toBe(false);
      for (const value of [0.999, 16384.001, NaN, Infinity, -Infinity]) {
        const result = createCamera({ [key]: value });
        expect(isViewError(result)).toBe(true);
        expect((result as { message: string }).message).toContain("from 1 to 16384");
      }
    }
  });

  it("rejects a centre or rotation that is not finite", () => {
    for (const key of ["centerX", "centerY", "rotationDegrees"] as const) {
      for (const value of [NaN, Infinity, -Infinity]) {
        expect(isViewError(createCamera({ [key]: value }))).toBe(true);
      }
    }
  });

  it("transforms report an invalid camera instead of computing", () => {
    const bad = { ...camera0, zoom: 0 };
    expect(isViewError(worldToScreen(bad, { x: 0, y: 0 }))).toBe(true);
    expect(isViewError(screenToWorld(bad, { x: 0, y: 0 }))).toBe(true);
  });
});

describe("camera transforms: round trips", () => {
  it("Property 1: world to screen to world returns the world point", () => {
    // Feature: map-views, Property 1: Transform round trip (world to screen to world)
    // Validates: Requirements 2.7
    fc.assert(
      fc.property(
        cameraArb.chain((camera) =>
          worldPointNear(camera).map((point) => ({ camera, point })),
        ),
        ({ camera, point }) => {
          const screen = worldToScreen(camera, point) as Point;
          const back = screenToWorld(camera, screen) as Point;
          expect(Math.abs(back.x - point.x)).toBeLessThanOrEqual(0.001);
          expect(Math.abs(back.y - point.y)).toBeLessThanOrEqual(0.001);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("Property 2: screen to world to screen returns the screen point", () => {
    // Feature: map-views, Property 2: Transform round trip (screen to world to screen)
    // Validates: Requirements 2.8
    fc.assert(
      fc.property(
        cameraArb.chain((camera) =>
          screenPointNear(camera).map((point) => ({ camera, point })),
        ),
        ({ camera, point }) => {
          const world = screenToWorld(camera, point) as Point;
          const back = worldToScreen(camera, world) as Point;
          expect(Math.abs(back.x - point.x)).toBeLessThanOrEqual(0.001);
          expect(Math.abs(back.y - point.y)).toBeLessThanOrEqual(0.001);
        },
      ),
      { numRuns: 200 },
    );
  });
});
