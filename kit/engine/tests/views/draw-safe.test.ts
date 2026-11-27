import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { SafeCanvas } from "../../src/views/draw-safe";
import { RecordingCanvas } from "../../src/views/recording-canvas";

function setup(): { rec: RecordingCanvas; safe: SafeCanvas } {
  const rec = new RecordingCanvas();
  return { rec, safe: new SafeCanvas(rec) };
}

describe("SafeCanvas", () => {
  it("passes finite numbers through unchanged", () => {
    const { rec, safe } = setup();
    safe.translate(1, 2);
    safe.rotate(0.5);
    safe.scale(2, 3);
    safe.moveTo(0, 0);
    safe.lineTo(4, 5);
    safe.arc(1, 2, 3, 0, 6);
    safe.setLineWidth(2);
    safe.setLineDash([1, 2]);
    safe.setGlobalAlpha(0.5);
    safe.drawText("a", 1, 2, "12px x", "left");
    expect(rec.getCalls().map((c) => c.op)).toEqual([
      "translate",
      "rotate",
      "scale",
      "moveTo",
      "lineTo",
      "arc",
      "setLineWidth",
      "setLineDash",
      "setGlobalAlpha",
      "drawText",
    ]);
    expect(safe.notices).toEqual([]);
  });

  const cases: [string, (c: SafeCanvas, v: number) => void][] = [
    ["translate", (c, v) => c.translate(v, 0)],
    ["rotate", (c, v) => c.rotate(v)],
    ["scale", (c, v) => c.scale(1, v)],
    ["moveTo", (c, v) => c.moveTo(v, 0)],
    ["lineTo", (c, v) => c.lineTo(0, v)],
    ["arc", (c, v) => c.arc(0, 0, v, 0, 1)],
    ["setLineWidth", (c, v) => c.setLineWidth(v)],
    ["setLineDash", (c, v) => c.setLineDash([1, v])],
    ["setGlobalAlpha", (c, v) => c.setGlobalAlpha(v)],
    ["drawText", (c, v) => c.drawText("a", v, 0, "12px x", "center")],
  ];

  for (const [op, call] of cases) {
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      it(`skips ${op} with ${bad} and names the operation`, () => {
        const { rec, safe } = setup();
        call(safe, bad);
        expect(rec.getCalls()).toEqual([]);
        expect(safe.notices).toHaveLength(1);
        expect(safe.notices[0].message).toContain(`"${op}"`);
        expect(safe.notices[0].message).not.toMatch(/NaN|Infinity/);
      });
    }
  }

  it("passes calls without numbers straight through", () => {
    const { rec, safe } = setup();
    safe.save();
    safe.beginPath();
    safe.closePath();
    safe.fill();
    safe.stroke();
    safe.clip();
    safe.setFillColor("#fff");
    safe.setStrokeColor("#000");
    safe.setLineJoin("round");
    safe.setLineCap("round");
    safe.restore();
    expect(rec.getCalls()).toHaveLength(11);
    expect(safe.measureText("ab", "12px x").width).toBeGreaterThan(0);
  });

  it("takeNotices returns and clears the notices", () => {
    const { safe } = setup();
    safe.moveTo(Number.NaN, 0);
    expect(safe.takeNotices()).toHaveLength(1);
    expect(safe.notices).toEqual([]);
  });

  it("never sends a non-finite number on, for any input", () => {
    // Feature: map-views, helper check for Requirement 1.8
    fc.assert(
      fc.property(
        fc.array(fc.oneof(fc.double({ noDefaultInfinity: false }), fc.constant(Number.NaN)), {
          minLength: 5,
          maxLength: 5,
        }),
        (v) => {
          const { rec, safe } = setup();
          safe.translate(v[0], v[1]);
          safe.arc(v[0], v[1], v[2], v[3], v[4]);
          safe.setLineDash(v);
          for (const call of rec.getCalls()) {
            for (const a of call.args) {
              if (typeof a === "number") expect(Number.isFinite(a)).toBe(true);
              if (Array.isArray(a)) a.forEach((n) => expect(Number.isFinite(n)).toBe(true));
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
