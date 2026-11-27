import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { signedAngleDifference } from "../../src/geometry";
import {
  DEFAULT_SMOOTHING_MS,
  MAX_SMOOTHING_MS,
  MIN_SMOOTHING_MS,
  advanceSmoothed,
  advanceSmoothedHeading,
} from "../../src/views/smoothing";

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
