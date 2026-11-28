import { describe, expect, it } from "vitest";
import { drawIfDue, FrameGate, type FrameInputs } from "../../src/views/frame-gate.js";

const base: FrameInputs = {
  mapVersion: 1,
  routeVersion: 1,
  positionVersion: 1,
  cameraVersion: 1,
  viewportVersion: 1,
  styleVersion: 1,
  settling: false,
  canvasVisible: true,
};

function counter(): { gate: FrameGate; draws: () => number; frame: (i: FrameInputs) => boolean } {
  const gate = new FrameGate();
  let n = 0;
  return {
    gate,
    draws: () => n,
    frame: (i) => drawIfDue(gate, i, () => void n++),
  };
}

describe("FrameGate changes", () => {
  it("draws the first frame, then nothing while nothing changes", () => {
    const c = counter();
    expect(c.frame(base)).toBe(true);
    expect(c.frame(base)).toBe(false);
    expect(c.frame(base)).toBe(false);
    expect(c.draws()).toBe(1);
  });

  const changes: (keyof FrameInputs)[] = [
    "mapVersion",
    "routeVersion",
    "positionVersion",
    "cameraVersion",
    "viewportVersion",
    "styleVersion",
  ];
  for (const key of changes) {
    it(`draws exactly one more frame when ${key} changes`, () => {
      const c = counter();
      c.frame(base);
      const changed = { ...base, [key]: 2 };
      expect(c.frame(changed)).toBe(true);
      expect(c.frame(changed)).toBe(false);
      expect(c.draws()).toBe(2);
    });
  }

  it("draws every frame while settling and once more when settling ends", () => {
    const c = counter();
    c.frame(base);
    const moving = { ...base, settling: true };
    expect(c.frame(moving)).toBe(true);
    expect(c.frame(moving)).toBe(true);
    expect(c.frame(base)).toBe(true);
    expect(c.frame(base)).toBe(false);
  });

  it("draws one frame for a camera change that is at rest in the same frame", () => {
    const c = counter();
    c.frame(base);
    const jumped = { ...base, cameraVersion: 2, settling: false };
    expect(c.frame(jumped)).toBe(true);
    expect(c.frame(jumped)).toBe(false);
  });

  it("makes no draw while the canvas is hidden and draws at the first visible frame", () => {
    const c = counter();
    c.frame(base);
    const hidden = { ...base, canvasVisible: false };
    expect(c.frame(hidden)).toBe(false);
    expect(c.frame({ ...hidden, cameraVersion: 5 })).toBe(false);
    expect(c.draws()).toBe(1);
    expect(c.frame(base)).toBe(true);
    expect(c.frame(base)).toBe(false);
  });
});
