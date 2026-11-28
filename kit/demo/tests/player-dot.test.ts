import { describe, expect, it } from "vitest";
import {
  DEFAULT_SPEED,
  EDGE_MESSAGE,
  createPlayerDot,
} from "../src/player-dot.js";

const extent = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
const start = { x: 50, y: 50, headingDegrees: 0 };

describe("player dot", () => {
  it("starts with the default speed and does not move on the first step", () => {
    const dot = createPlayerDot(start, extent);
    dot.setHeld({ right: true });
    expect(dot.speed).toBe(DEFAULT_SPEED);
    expect(dot.step(1000).position.x).toBe(50);
  });

  it("moves by speed times elapsed time and sets the heading", () => {
    const dot = createPlayerDot(start, extent);
    dot.step(0);
    dot.setHeld({ down: true });
    const { position, message } = dot.step(1000);
    expect(position.y).toBeCloseTo(80);
    expect(position.headingDegrees).toBeCloseTo(90);
    expect(message).toBeNull();
    dot.setHeld({ down: false, left: true });
    expect(dot.step(2000).position.headingDegrees).toBeCloseTo(180);
  });

  it("keeps the heading when nothing is held", () => {
    const dot = createPlayerDot(start, extent);
    dot.step(0);
    dot.setHeld({ up: true });
    dot.step(100);
    dot.setHeld({ up: false });
    const { position } = dot.step(200);
    expect(position.headingDegrees).toBeCloseTo(-90);
  });

  it("moves diagonally at the same speed", () => {
    const dot = createPlayerDot(start, extent);
    dot.step(0);
    dot.setHeld({ right: true, down: true });
    const { position } = dot.step(1000);
    expect(position.x - 50).toBeCloseTo(30 / Math.SQRT2);
    expect(position.headingDegrees).toBeCloseTo(45);
  });

  it("ignores time that goes backwards", () => {
    const dot = createPlayerDot(start, extent);
    dot.step(1000);
    dot.setHeld({ right: true });
    expect(dot.step(500).position.x).toBe(50);
  });

  describe("speed", () => {
    it("accepts the bounds 1 and 200", () => {
      const dot = createPlayerDot(start, extent);
      expect(dot.setSpeed(1)).toBeNull();
      expect(dot.speed).toBe(1);
      expect(dot.setSpeed(200)).toBeNull();
      expect(dot.speed).toBe(200);
    });

    it.each([0.999, 200.001, NaN, Infinity, -Infinity])(
      "keeps the previous speed and names speed and range for %s",
      (value) => {
        const dot = createPlayerDot(start, extent);
        dot.setSpeed(80);
        const message = dot.setSpeed(value);
        expect(dot.speed).toBe(80);
        expect(message).toContain(String(value));
        expect(message).toContain("1 to 200");
      },
    );
  });

  describe("edge", () => {
    it("stops at the extent widened by 50 and says so", () => {
      const dot = createPlayerDot(start, extent);
      dot.setSpeed(200);
      dot.step(0);
      dot.setHeld({ right: true });
      const { position, message } = dot.step(10000);
      expect(position.x).toBe(150);
      expect(message).toBe(EDGE_MESSAGE);
    });

    it("reaches the boundary exactly without a message", () => {
      const dot = createPlayerDot({ x: 140, y: 50, headingDegrees: 0 }, extent);
      dot.setSpeed(10);
      dot.step(0);
      dot.setHeld({ right: true });
      const { position, message } = dot.step(1000);
      expect(position.x).toBe(150);
      expect(message).toBeNull();
    });

    it("lets the dot move back from the boundary", () => {
      const dot = createPlayerDot({ x: -50, y: 50, headingDegrees: 0 }, extent);
      dot.step(0);
      dot.setHeld({ right: true });
      expect(dot.step(1000).position.x).toBeCloseTo(-20);
    });
  });
});
