import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { signedAngleDifference } from "../../src/geometry";
import {
  DEFAULT_SMOOTHING_MS,
  MAX_SMOOTHING_MS,
  MIN_SMOOTHING_MS,
  FrameClock,
  advanceCamera,
  advanceSmoothed,
  advanceSmoothedHeading,
} from "../../src/views/smoothing";
import { isViewError } from "../../src/views/view-errors";
import type { Camera } from "../../src/views/camera";

const valueArb = fc.double({ min: -1e6, max: 1e6, noNaN: true });
const dtsArb = fc.array(fc.integer({ min: 1, max: 1000 }), { minLength: 1, maxLength: 40 });
const durationArb = fc.integer({ min: MIN_SMOOTHING_MS, max: MAX_SMOOTHING_MS });

describe("smoothing property", () => {
  it("moves monotonically toward the target without overshoot, and turns the short way", () => {
    // Feature: map-views, Property 15: Smoothing moves monotonically toward the target without overshoot (and takes the shortest turn)
    // **Validates: Requirements 13.8, 13.9**
    fc.assert(
      fc.property(valueArb, valueArb, dtsArb, durationArb, (start, target, dts, duration) => {
        let value = start;
        for (const dt of dts) {
          const next = advanceSmoothed(value, target, dt, duration);
          if (target >= value) {
            expect(next).toBeGreaterThanOrEqual(value);
            expect(next).toBeLessThanOrEqual(target);
          } else {
            expect(next).toBeLessThanOrEqual(value);
            expect(next).toBeGreaterThanOrEqual(target);
          }
          value = next;
        }
      }),
      { numRuns: 200 },
    );
    const headingArb = fc.double({ min: -720, max: 720, noNaN: true });
    fc.assert(
      fc.property(headingArb, headingArb, dtsArb, durationArb, (start, target, dts, duration) => {
        let value = start;
        for (const dt of dts) {
          const shortest = signedAngleDifference(value, target);
          const next = advanceSmoothedHeading(value, target, dt, duration);
          // Headings are equal modulo 360, so measure the turn, not the number.
          const moved = signedAngleDifference(value, next);
          expect(Math.abs(moved)).toBeLessThanOrEqual(180 + 1e-9);
          expect(Math.abs(moved)).toBeLessThanOrEqual(Math.abs(shortest) + 1e-9);
          if (shortest !== 0) expect(moved * shortest).toBeGreaterThanOrEqual(0);
          value = next;
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe("advanceSmoothed examples", () => {
  it("covers 95% of the change after the default 300 ms", () => {
    expect(DEFAULT_SMOOTHING_MS).toBe(300);
    expect(advanceSmoothed(0, 100, 300)).toBeCloseTo(95, 6);
  });

  it("reaches 95% after one duration at the limits 1 and 5000 ms", () => {
    expect(advanceSmoothed(0, 10, 1, 1)).toBeCloseTo(9.5, 6);
    expect(advanceSmoothed(0, 10, 5000, 5000)).toBeCloseTo(9.5, 6);
  });

  it("depends on elapsed time, not on frame count", () => {
    const once = advanceSmoothed(0, 100, 200);
    const twice = advanceSmoothed(advanceSmoothed(0, 100, 100), 100, 100);
    expect(twice).toBeCloseTo(once, 9);
  });

  it("ends exactly on the target after a very long interval", () => {
    expect(advanceSmoothed(0, 100, 1000, 1)).toBe(100);
    expect(advanceSmoothed(5, -7.25, 1000, 1)).toBe(-7.25);
  });

  it("stays put for an interval of 0 and returns the target when already there", () => {
    expect(advanceSmoothed(3, 10, 0)).toBe(3);
    expect(advanceSmoothed(10, 10, 16)).toBe(10);
  });

  it("takes the short way round for headings", () => {
    const next = advanceSmoothedHeading(350, 10, 100);
    expect(next).toBeGreaterThan(350);
    expect(next).toBeLessThan(370);
    const back = advanceSmoothedHeading(10, 350, 100);
    expect(back).toBeLessThan(10);
    expect(back).toBeGreaterThan(-10);
  });

  it("ends exactly on the target heading as given", () => {
    expect(advanceSmoothedHeading(350, 10, 1000, 1)).toBe(10);
    expect(advanceSmoothedHeading(0, 180, 1000, 1)).toBe(180);
  });
});

const startCamera: Camera = {
  centerX: 0,
  centerY: 0,
  zoom: 1,
  rotationDegrees: 350,
  viewportWidth: 200,
  viewportHeight: 200,
};
const targetCamera: Camera = {
  centerX: 100,
  centerY: -50,
  zoom: 2,
  rotationDegrees: 10,
  viewportWidth: 300,
  viewportHeight: 250,
};

describe("advanceCamera examples", () => {
  it("jumps to the target in the same frame under reduced motion", () => {
    const step = advanceCamera(startCamera, targetCamera, 16, 300, true);
    expect(isViewError(step)).toBe(false);
    if (!isViewError(step)) {
      expect(step.camera).toEqual(targetCamera);
      expect(step.settling).toBe(false);
    }
  });

  it("moves part of the way and reports settling, then arrives", () => {
    const step = advanceCamera(startCamera, targetCamera, 100, 300, false);
    if (isViewError(step)) throw new Error("unexpected error");
    expect(step.settling).toBe(true);
    expect(step.camera.centerX).toBeGreaterThan(0);
    expect(step.camera.centerX).toBeLessThan(100);
    expect(step.camera.rotationDegrees).toBeGreaterThan(350);
    expect(step.camera.viewportWidth).toBe(300);
    const done = advanceCamera(step.camera, targetCamera, 1000, 1, false);
    if (isViewError(done)) throw new Error("unexpected error");
    expect(done.camera).toEqual(targetCamera);
    expect(done.settling).toBe(false);
  });

  it("cuts an interval over 1000 ms to 1000 ms", () => {
    const long = advanceCamera(startCamera, targetCamera, 50000, 5000, false);
    const capped = advanceCamera(startCamera, targetCamera, 1000, 5000, false);
    expect(long).toEqual(capped);
  });

  it("rejects a duration outside 1 to 5000 ms and names it", () => {
    for (const bad of [0, 0.999, 5000.001, 6000, NaN, Infinity, -Infinity]) {
      const step = advanceCamera(startCamera, targetCamera, 16, bad, false);
      expect(isViewError(step)).toBe(true);
      if (isViewError(step)) {
        expect(step.message).toContain("smoothing duration");
        expect(step.message).toContain("1 to 5000");
      }
    }
    for (const ok of [1, 5000]) {
      expect(isViewError(advanceCamera(startCamera, targetCamera, 16, ok, false))).toBe(false);
    }
  });

  it("rejects an unusable target", () => {
    const step = advanceCamera(startCamera, { ...targetCamera, zoom: NaN }, 16, 300, false);
    expect(isViewError(step)).toBe(true);
  });
});

describe("FrameClock examples", () => {
  it("gives 0 for the first timestamp and then the interval", () => {
    const clock = new FrameClock();
    expect(clock.tick(1000)).toEqual({ dtMs: 0 });
    expect(clock.tick(1016)).toEqual({ dtMs: 16 });
  });

  it("cuts an interval over 1000 ms to 1000", () => {
    const clock = new FrameClock();
    clock.tick(0);
    expect(clock.tick(5000)).toEqual({ dtMs: 1000 });
    clock.tick(6000);
    expect(clock.tick(7000)).toEqual({ dtMs: 1000 });
    expect(clock.tick(7000.5)).toEqual({ dtMs: 0.5 });
  });

  it("gives interval 0 and a notice when time goes backwards", () => {
    const clock = new FrameClock();
    clock.tick(500);
    const tick = clock.tick(400);
    expect(isViewError(tick)).toBe(false);
    if (!isViewError(tick)) {
      expect(tick.dtMs).toBe(0);
      expect(tick.notice?.message).toContain("time went backwards");
    }
    expect(clock.tick(416)).toEqual({ dtMs: 16 });
  });

  it("rejects a timestamp that is not finite and keeps its state", () => {
    const clock = new FrameClock();
    clock.tick(100);
    for (const bad of [NaN, Infinity, -Infinity]) {
      const tick = clock.tick(bad);
      expect(isViewError(tick)).toBe(true);
      if (isViewError(tick)) {
        expect(tick.message).toContain("timestamp");
        expect(tick.message).toContain("finite number of ms");
      }
    }
    expect(clock.tick(120)).toEqual({ dtMs: 20 });
  });
});
