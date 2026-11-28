import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  createInputState,
  processEvents,
  type InputEvent,
} from "../../src/views/input-state-machine.js";

const coord = fc.double({ min: -100000, max: 100000, noNaN: true });

function down(x: number, y: number, t = 0, id = 1): InputEvent {
  return { kind: "pointerdown", x, y, timestampMs: t, pointerId: id };
}
function move(x: number, y: number, t = 10, id = 1): InputEvent {
  return { kind: "pointermove", x, y, timestampMs: t, pointerId: id };
}
function up(x: number, y: number, t = 20, id = 1): InputEvent {
  return { kind: "pointerup", x, y, timestampMs: t, pointerId: id };
}

describe("pointer drag commands", () => {
  it("sum to the displacement from the first to the last event", () => {
    // Feature: map-views, Property 16: Pointer drag commands sum to the total screen displacement
    // **Validates: Requirements 15.12**
    fc.assert(
      fc.property(
        coord,
        coord,
        fc.array(fc.tuple(coord, coord), { minLength: 0, maxLength: 20 }),
        coord,
        coord,
        fc.double({ min: 7, max: 1000, noNaN: true }),
        (x0, y0, mids, x1, y1, jump) => {
          // The first move leaves the 6 px selection circle, so a drag starts.
          const events: InputEvent[] = [down(x0, y0), move(x0 + jump, y0)];
          mids.forEach(([x, y], i) => events.push(move(x, y, 20 + i)));
          events.push(up(x1, y1, 100));
          const { commands } = processEvents(createInputState(), events);
          let sx = 0;
          let sy = 0;
          for (const c of commands) {
            expect(c.type).toBe("pan");
            if (c.type === "pan") {
              sx += c.dx;
              sy += c.dy;
            }
          }
          expect(Math.abs(sx - (x1 - x0))).toBeLessThanOrEqual(0.001);
          expect(Math.abs(sy - (y1 - y0))).toBeLessThanOrEqual(0.001);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("pointer selection and drag examples", () => {
  it("treats a release within 6 px and 500 ms as a selection", () => {
    const { commands, state } = processEvents(createInputState(), [
      down(100, 100, 0),
      move(103, 104, 100),
      up(103, 104, 500),
    ]);
    expect(commands).toEqual([{ type: "select", x: 103, y: 104 }]);
    expect(state.activePointerId).toBeUndefined();
  });

  it("gives no selection just past 6 px or just past 500 ms", () => {
    const far = processEvents(createInputState(), [down(0, 0, 0), up(6.5, 0, 100)]);
    expect(far.commands).toEqual([]);
    const slow = processEvents(createInputState(), [down(0, 0, 0), up(0, 0, 501)]);
    expect(slow.commands).toEqual([]);
  });

  it("accepts exactly 6 px", () => {
    const { commands } = processEvents(createInputState(), [down(0, 0, 0), up(6, 0, 10)]);
    expect(commands).toEqual([{ type: "select", x: 6, y: 0 }]);
  });

  it("pans on a drag", () => {
    const { commands } = processEvents(createInputState(), [
      down(0, 0),
      move(20, 0),
      move(30, 10),
      up(30, 10),
    ]);
    expect(commands).toEqual([
      { type: "pan", dx: 20, dy: 0 },
      { type: "pan", dx: 10, dy: 10 },
    ]);
  });

  it("ignores events of another pointer", () => {
    const { commands } = processEvents(createInputState(), [
      down(0, 0, 0, 1),
      move(50, 50, 10, 2),
      up(0, 0, 20, 1),
    ]);
    expect(commands).toEqual([{ type: "select", x: 0, y: 0 }]);
  });

  it("drops events with a non-finite x, y or timestamp and adds a Notice", () => {
    const bad: InputEvent[] = [
      down(NaN, 0),
      down(0, Infinity),
      down(0, 0, -Infinity),
    ];
    const { commands, state } = processEvents(createInputState(), bad);
    expect(commands).toEqual([]);
    expect(state.activePointerId).toBeUndefined();
    expect(state.notices).toHaveLength(3);
    expect(state.notices[0]!.message).toBe("An invalid pointer event was ignored.");
  });

  it("keeps the press going when a later event is invalid", () => {
    const { commands, state } = processEvents(createInputState(), [
      down(0, 0, 0),
      move(NaN, 5, 5),
      up(1, 1, 10),
    ]);
    expect(commands).toEqual([{ type: "select", x: 1, y: 1 }]);
    expect(state.notices).toHaveLength(1);
  });
});
