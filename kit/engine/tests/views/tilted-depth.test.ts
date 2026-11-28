import { describe, expect, it } from "vitest";
import { createCamera, type Camera } from "../../src/views/camera.js";
import { depthOf, sortByDepth } from "../../src/views/tilted-projection.js";
import { isViewError, type ViewError } from "../../src/views/view-errors.js";
import { modelProject } from "./helpers/perspective-screen-check.js";

function ok<T extends object>(value: T | ViewError): T {
  if (isViewError(value)) throw new Error(value.message);
  return value;
}

const camera: Camera = ok(
  createCamera({ centerX: 0, centerY: 0, zoom: 2, viewportWidth: 200, viewportHeight: 100 }),
);

describe("depthOf", () => {
  it("is larger for a point lower on the screen, in world units", () => {
    expect(depthOf({ x: 0, y: 0 }, camera)).toBeCloseTo(0, 9);
    expect(depthOf({ x: 5, y: 10 }, camera)).toBeCloseTo(10, 9);
    expect(depthOf({ x: 5, y: -4 }, camera)).toBeCloseTo(-4, 9);
  });

  it("follows the camera rotation", () => {
    const turned = ok(
      createCamera({
        centerX: 0,
        centerY: 0,
        zoom: 2,
        rotationDegrees: 90,
        viewportWidth: 200,
        viewportHeight: 100,
      }),
    );
    expect(depthOf({ x: 10, y: 0 }, turned)).toBeCloseTo(10, 9);
    expect(depthOf({ x: 0, y: 10 }, turned)).toBeCloseTo(0, 9);
  });

  it("returns a ViewError for a non-finite point", () => {
    expect(isViewError(depthOf({ x: Number.NaN, y: 0 }, camera))).toBe(true);
  });
});

describe("depthOf under the Perspective_Projection", () => {
  it("orders ground points like the depth along the optical axis of the pinhole model", () => {
    // Depth_Order is perspective-correct: a larger key is nearer, so a smaller z.
    const points = [-90, -40, -7, 0, 12, 33].map((y) => ({ x: 5, y }));
    const keys = points.map((p) => depthOf(p, camera) as number);
    const zs = points.map((p) => modelProject(camera, 35, p, 0).z);
    for (let i = 1; i < points.length; i++) {
      expect(keys[i]!).toBeGreaterThan(keys[i - 1]!);
      expect(zs[i]!).toBeLessThan(zs[i - 1]!);
    }
  });
});

describe("sortByDepth", () => {
  it("puts farther blocks first and nearer blocks last", () => {
    const items = [
      { id: "c", ground: { x: 0, y: 30 } },
      { id: "a", ground: { x: 0, y: -20 } },
      { id: "b", ground: { x: 0, y: 5 } },
    ];
    const sorted = ok(sortByDepth(items, camera) as { id: string }[] | ViewError);
    expect((sorted as { id: string }[]).map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(items.map((i) => i.id)).toEqual(["c", "a", "b"]);
  });

  it("draws the lower identifier first when depths differ by less than 0.001", () => {
    const items = [
      { id: "z", ground: { x: 0, y: 10 } },
      { id: "m", ground: { x: 50, y: 10.0004 } },
      { id: "a", ground: { x: -50, y: 10 } },
    ];
    const sorted = sortByDepth(items, camera) as { id: string }[];
    expect(sorted.map((i) => i.id)).toEqual(["a", "m", "z"]);
  });

  it("orders by depth when the difference is 0.001 or more", () => {
    const items = [
      { id: "a", ground: { x: 0, y: 10.01 } },
      { id: "b", ground: { x: 0, y: 10 } },
    ];
    const sorted = sortByDepth(items, camera) as { id: string }[];
    expect(sorted.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("returns a ViewError for an unusable ground point", () => {
    const result = sortByDepth([{ id: "a", ground: { x: Number.POSITIVE_INFINITY, y: 0 } }], camera);
    expect(isViewError(result)).toBe(true);
  });
});
