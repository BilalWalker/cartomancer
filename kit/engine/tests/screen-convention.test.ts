import { describe, expect, it } from "vitest";
import { classifyTurn, headingOfSegment, signedAngleDifference } from "../src/geometry";

// Screen convention: x grows right, y grows down, headings grow clockwise on the screen.
// Requirements 15.3, 15.14, 21.6.

const o = { x: 0, y: 0 };

function turnBetween(before: number, after: number) {
  return classifyTurn(signedAngleDifference(before, after));
}

describe("screen convention turns", () => {
  it("player heading right, road goes up the screen: left turn", () => {
    const before = headingOfSegment(o, { x: 10, y: 0 });
    const after = headingOfSegment({ x: 10, y: 0 }, { x: 10, y: -10 });
    expect(before).toBeCloseTo(0);
    expect(after).toBeCloseTo(-90);
    expect(turnBetween(before, after)).toBe("left");
  });

  it("player heading right, road goes down the screen: right turn", () => {
    const before = headingOfSegment(o, { x: 10, y: 0 });
    const after = headingOfSegment({ x: 10, y: 0 }, { x: 10, y: 10 });
    expect(after).toBeCloseTo(90);
    expect(turnBetween(before, after)).toBe("right");
  });

  it("with x negated (heading 180 - h) the up-screen case becomes a right turn", () => {
    const before = 180 - 0;
    const after = 180 - -90;
    expect(headingOfSegment(o, { x: -10, y: 0 })).toBeCloseTo(180);
    expect(headingOfSegment({ x: -10, y: 0 }, { x: -10, y: -10 })).toBeCloseTo(-90);
    expect(turnBetween(before, after)).toBe("right");
  });

  it("with x negated (heading 180 - h) the down-screen case becomes a left turn", () => {
    const before = 180 - 0;
    const after = 180 - 90;
    expect(headingOfSegment({ x: -10, y: 0 }, { x: -10, y: 10 })).toBeCloseTo(90);
    expect(turnBetween(before, after)).toBe("left");
  });
});
