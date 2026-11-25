import { describe, expect, it } from "vitest";
import { segmentCrossesPolygon } from "../src/geometry";

describe("segment and polygon crossing", () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it("is false for a segment fully outside", () => {
    expect(segmentCrossesPolygon({ x: 20, y: 0 }, { x: 30, y: 10 }, square)).toBe(false);
    expect(segmentCrossesPolygon({ x: -5, y: -5 }, { x: 15, y: -5 }, square)).toBe(false);
  });

  it("is true for a segment crossing an edge", () => {
    expect(segmentCrossesPolygon({ x: -5, y: 5 }, { x: 5, y: 5 }, square)).toBe(true);
    expect(segmentCrossesPolygon({ x: -5, y: 5 }, { x: 15, y: 5 }, square)).toBe(true);
  });

  it("is true for a segment touching a corner", () => {
    expect(segmentCrossesPolygon({ x: -5, y: -5 }, { x: 0, y: 0 }, square)).toBe(true);
    expect(segmentCrossesPolygon({ x: -5, y: 5 }, { x: 5, y: -5 }, square)).toBe(true);
  });

  it("is true for a segment fully inside", () => {
    expect(segmentCrossesPolygon({ x: 2, y: 2 }, { x: 8, y: 8 }, square)).toBe(true);
  });

  it("is true for a segment collinear with an edge", () => {
    expect(segmentCrossesPolygon({ x: 2, y: 0 }, { x: 8, y: 0 }, square)).toBe(true);
    expect(segmentCrossesPolygon({ x: -5, y: 0 }, { x: 3, y: 0 }, square)).toBe(true);
    expect(segmentCrossesPolygon({ x: 12, y: 0 }, { x: 20, y: 0 }, square)).toBe(false);
  });
});
