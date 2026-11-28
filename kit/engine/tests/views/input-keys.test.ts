import { describe, expect, it } from "vitest";
import {
  createInputState,
  processEvents,
  type InputCommand,
  type InputEvent,
} from "../../src/views/input-state-machine.js";

function run(events: InputEvent[], state = createInputState()) {
  return processEvents(state, events);
}
function key(k: string): InputEvent {
  return { kind: "keydown", key: k, timestampMs: 0 };
}
function wheel(deltaY: number, x = 50, y = 60): InputEvent {
  return { kind: "wheel", x, y, deltaY, timestampMs: 0 };
}
function touches(a: [number, number], b: [number, number]): InputEvent {
  return {
    kind: "touchmove",
    touches: [
      { id: 1, x: a[0], y: a[1] },
      { id: 2, x: b[0], y: b[1] },
    ],
    timestampMs: 0,
  };
}

describe("wheel", () => {
  it("zooms at the pointer; scrolling up zooms in, down zooms out", () => {
    const up = run([wheel(-100)]).commands[0] as Extract<InputCommand, { type: "zoom" }>;
    expect(up.anchor).toEqual({ x: 50, y: 60 });
    expect(up.factor).toBeCloseTo(2);
    const down = run([wheel(100)]).commands[0] as Extract<InputCommand, { type: "zoom" }>;
    expect(down.factor).toBeCloseTo(0.5);
  });

  it("keeps the factor between 0.5 and 2", () => {
    const big = run([wheel(-100000)]).commands[0] as Extract<InputCommand, { type: "zoom" }>;
    expect(big.factor).toBe(2);
    const small = run([wheel(100000)]).commands[0] as Extract<InputCommand, { type: "zoom" }>;
    expect(small.factor).toBe(0.5);
  });

  it("gives no command for a zero delta and drops a non-finite event with a notice", () => {
    expect(run([wheel(0)]).commands).toEqual([]);
    const result = run([wheel(Number.NaN)]);
    expect(result.commands).toEqual([]);
    expect(result.state.notices).toHaveLength(1);
  });
});

describe("pinch", () => {
  it("zooms at the midpoint by the ratio of distances", () => {
    const { commands } = run([touches([0, 0], [100, 0]), touches([0, 0], [200, 0])]);
    expect(commands).toEqual([{ type: "zoom", anchor: { x: 100, y: 0 }, factor: 2 }]);
  });

  it("zooms out when the fingers move together", () => {
    const { commands } = run([touches([0, 0], [100, 0]), touches([0, 0], [50, 0])]);
    expect(commands).toEqual([{ type: "zoom", anchor: { x: 25, y: 0 }, factor: 0.5 }]);
  });

  it("gives no command when the distance is under 1 px", () => {
    const { commands } = run([touches([0, 0], [100, 0]), touches([0, 0], [0.5, 0])]);
    expect(commands).toEqual([]);
    const again = run([touches([0, 0], [0.5, 0]), touches([0, 0], [100, 0])]);
    expect(again.commands).toEqual([]);
  });

  it("gives no command for the first two-finger event or a single finger", () => {
    expect(run([touches([0, 0], [100, 0])]).commands).toEqual([]);
    const single: InputEvent = {
      kind: "touchmove",
      touches: [{ id: 1, x: 1, y: 1 }],
      timestampMs: 0,
    };
    expect(run([single]).commands).toEqual([]);
  });

  it("drops a non-finite touch with a notice", () => {
    const result = run([touches([0, 0], [Number.POSITIVE_INFINITY, 0])]);
    expect(result.commands).toEqual([]);
    expect(result.state.notices).toHaveLength(1);
  });
});

describe("keys", () => {
  it("arrows pan by 10% of the viewport", () => {
    expect(run([key("ArrowLeft")]).commands).toEqual([{ type: "panFraction", fx: 0.1, fy: 0 }]);
    expect(run([key("ArrowRight")]).commands).toEqual([{ type: "panFraction", fx: -0.1, fy: 0 }]);
    expect(run([key("ArrowUp")]).commands).toEqual([{ type: "panFraction", fx: 0, fy: 0.1 }]);
    expect(run([key("ArrowDown")]).commands).toEqual([{ type: "panFraction", fx: 0, fy: -0.1 }]);
  });

  it("plus and minus zoom by 1.25 and 0.8 about the centre", () => {
    expect(run([key("+")]).commands).toEqual([{ type: "zoom", anchor: null, factor: 1.25 }]);
    expect(run([key("-")]).commands).toEqual([{ type: "zoom", anchor: null, factor: 0.8 }]);
  });

  it("Home, F, brackets and Enter give their commands", () => {
    expect(run([key("Home")]).commands).toEqual([{ type: "fit" }]);
    expect(run([key("f")]).commands).toEqual([{ type: "follow" }]);
    expect(run([key("F")]).commands).toEqual([{ type: "follow" }]);
    expect(run([key("]")]).commands).toEqual([{ type: "focusNextPlace" }]);
    expect(run([key("[")]).commands).toEqual([{ type: "focusPreviousPlace" }]);
    expect(run([key("Enter")]).commands).toEqual([{ type: "activateFocusedPlace" }]);
  });

  it("gives no command for an unused key", () => {
    const result = run([key("q"), key("Tab"), key("Escape")]);
    expect(result.commands).toEqual([]);
    expect(result.state.notices).toEqual([]);
  });
});
