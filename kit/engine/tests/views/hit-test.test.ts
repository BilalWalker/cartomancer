import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { HIT_RADIUS_PX, hitTestPlace } from "../../src/views/hit-test";
import { naiveNearest } from "./helpers/naive-nearest-place";

const placesArb = fc
  .uniqueArray(fc.string({ minLength: 1, maxLength: 4 }), { maxLength: 15 })
  .chain((ids) =>
    fc.tuple(
      ...ids.map((id) =>
        fc.record({
          id: fc.constant(id),
          screenX: fc.double({ min: -60, max: 60, noNaN: true }),
          screenY: fc.double({ min: -60, max: 60, noNaN: true }),
        }),
      ),
    ),
  );

describe("hit test property", () => {
  it("returns the nearest place within 20 px, or none", () => {
    // Feature: map-views, Property 12: Hit test returns the nearest place within range
    // **Validates: Requirements 11.9**
    fc.assert(
      fc.property(
        placesArb,
        fc.double({ min: -60, max: 60, noNaN: true }),
        fc.double({ min: -60, max: 60, noNaN: true }),
        (places, x, y) => {
          const hit = hitTestPlace(places, { x, y });
          const model = naiveNearest(places, x, y, HIT_RADIUS_PX, 0.001);
          if (model === undefined) return hit === undefined;
          return hit !== undefined && model.acceptableIds.includes(hit.id);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("hit test examples", () => {
  const places = [
    { id: "b", screenX: 100, screenY: 0 },
    { id: "a", screenX: 0, screenY: 0 },
  ];

  it("hits exactly at the 20 px boundary", () => {
    expect(hitTestPlace(places, { x: -20, y: 0 })?.id).toBe("a");
  });

  it("misses just beyond 20 px", () => {
    expect(hitTestPlace(places, { x: -20.001, y: 0 })).toBeUndefined();
  });

  it("returns the nearer of two places in range", () => {
    const two = [
      { id: "a", screenX: 0, screenY: 0 },
      { id: "b", screenX: 10, screenY: 0 },
    ];
    expect(hitTestPlace(two, { x: 8, y: 0 })?.id).toBe("b");
  });

  it("returns the lowest id when distances differ by less than 0.001", () => {
    const tie = [
      { id: "z", screenX: -5, screenY: 0 },
      { id: "m", screenX: 5.0005, screenY: 0 },
    ];
    expect(hitTestPlace(tie, { x: 0, y: 0 })?.id).toBe("m");
  });

  it("returns nothing for no places and for non-finite points", () => {
    expect(hitTestPlace([], { x: 0, y: 0 })).toBeUndefined();
    expect(hitTestPlace(places, { x: NaN, y: 0 })).toBeUndefined();
    expect(hitTestPlace(places, { x: 0, y: Infinity })).toBeUndefined();
  });
});
