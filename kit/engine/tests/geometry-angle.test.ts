import { describe, expect, it } from "vitest";
import { classifyTurn, headingOfSegment, signedAngleDifference } from "../src/geometry";

describe("heading of a segment (y down, clockwise on screen)", () => {
  const o = { x: 0, y: 0 };
  it("is 0 for a segment going right", () => {
    expect(headingOfSegment(o, { x: 5, y: 0 })).toBeCloseTo(0);
  });
  it("is 90 for a segment going down the screen", () => {
    expect(headingOfSegment(o, { x: 0, y: 5 })).toBeCloseTo(90);
  });
  it("is -90 for a segment going up the screen", () => {
    expect(headingOfSegment(o, { x: 0, y: -5 })).toBeCloseTo(-90);
  });
});

describe("signed angle difference", () => {
  it("is positive for a right change and negative for a left change", () => {
    expect(signedAngleDifference(0, 90)).toBe(90);
    expect(signedAngleDifference(0, -90)).toBe(-90);
  });
  it("wraps around at 180 into (-180, 180]", () => {
    expect(signedAngleDifference(170, -170)).toBe(20);
    expect(signedAngleDifference(-170, 170)).toBe(-20);
    expect(signedAngleDifference(0, 180)).toBe(180);
    expect(signedAngleDifference(0, -180)).toBe(180);
    expect(signedAngleDifference(90, 90)).toBe(0);
  });
});

describe("turn classification", () => {
  it("treats 30 degrees on either side as straight on", () => {
    expect(classifyTurn(0)).toBe("straight-on");
    expect(classifyTurn(30)).toBe("straight-on");
    expect(classifyTurn(-30)).toBe("straight-on");
  });
  it("turns right just past 30 and left just past -30", () => {
    expect(classifyTurn(30.001)).toBe("right");
    expect(classifyTurn(-30.001)).toBe("left");
  });
  it("keeps 150 degrees on either side as a turn, not a turn back", () => {
    expect(classifyTurn(150)).toBe("right");
    expect(classifyTurn(-150)).toBe("left");
  });
  it("turns back beyond 150 degrees", () => {
    expect(classifyTurn(150.001)).toBe("turn-back");
    expect(classifyTurn(-150.001)).toBe("turn-back");
    expect(classifyTurn(180)).toBe("turn-back");
  });
});
