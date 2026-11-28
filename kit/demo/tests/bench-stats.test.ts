import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  BenchFailure,
  checkFrameCount,
  formatMs,
  formatSummary,
  intervals,
  summarize,
} from "../bench/bench-stats.js";

describe("bench statistics", () => {
  it("gives median, 95th percentile and maximum", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    const s = summarize("Minimap", "draw time", values);
    expect(s).toEqual({ count: 100, median: 50.5, p95: 95, max: 100 });
  });

  it("takes the middle value for an odd count and one value alone", () => {
    expect(summarize("Minimap", "draw time", [3, 1, 2]).median).toBe(2);
    expect(summarize("Minimap", "draw time", [7])).toEqual({ count: 1, median: 7, p95: 7, max: 7 });
  });

  it("formats with 2 decimals", () => {
    expect(formatMs(1)).toBe("1.00");
    expect(formatMs(1.234)).toBe("1.23");
    expect(formatSummary({ count: 3, median: 1, p95: 2.346, max: 3 })).toBe(
      "median 1.00  p95 2.35  max 3.00",
    );
  });

  it("fails when fewer frames than required were measured, with both numbers", () => {
    expect(() => checkFrameCount("Tilted_View", 120)).toThrow(
      "The Tilted_View was measured for 120 frames, but 300 frames are required.",
    );
    expect(() => checkFrameCount("Tilted_View", 300)).not.toThrow();
  });

  it("fails on a value that is not finite or is negative, naming View and measurement", () => {
    expect(() => summarize("Full_Map", "draw time", [1, Number.NaN])).toThrow(
      /Full_Map.*draw time|draw time.*Full_Map/,
    );
    expect(() => summarize("Full_Map", "frame interval", [Infinity])).toThrow(BenchFailure);
    expect(() => summarize("Minimap", "paths per frame", [1, -0.5])).toThrow(
      "The paths per frame of the Minimap is negative (-0.5).",
    );
  });

  it("fails on an empty list", () => {
    expect(() => summarize("Minimap", "draw time", [])).toThrow(BenchFailure);
  });

  it("computes the differences between timestamps", () => {
    expect(intervals([10, 26, 43])).toEqual([16, 17]);
    expect(intervals([5])).toEqual([]);
  });

  it("keeps median and p95 between the smallest value and the maximum", () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: 0, max: 1000, noNaN: true }), { minLength: 1, maxLength: 200 }), (values) => {
        const s = summarize("Minimap", "draw time", values);
        const lo = Math.min(...values);
        expect(s.median).toBeGreaterThanOrEqual(lo);
        expect(s.median).toBeLessThanOrEqual(s.max);
        expect(s.p95).toBeGreaterThanOrEqual(s.median);
        expect(s.p95).toBeLessThanOrEqual(s.max);
        expect(s.max).toBe(Math.max(...values));
      }),
    );
  });
});
