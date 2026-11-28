import { describe, expect, it } from "vitest";
import { RecordingCanvas } from "../../src/views/recording-canvas";
import { SafeCanvas } from "../../src/views/draw-safe";

describe("RecordingCanvas drawImage", () => {
  it("stores the handle, the four numbers, the alpha and the transform", () => {
    const canvas = new RecordingCanvas();
    const handle = { name: "picture" };
    canvas.translate(10, 20);
    canvas.scale(2, 3);
    canvas.setGlobalAlpha(0.5);
    canvas.drawImage(handle, 1, 2, 30, 40);
    const calls = canvas.findCalls("drawImage");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args[0]).toBe(handle);
    expect(calls[0]?.args.slice(1)).toEqual([1, 2, 30, 40]);
    expect(calls[0]?.state.globalAlpha).toBe(0.5);
    expect(calls[0]?.state.transform).toEqual([2, 0, 0, 3, 10, 20]);
  });

  it("restores the alpha after save and restore", () => {
    const canvas = new RecordingCanvas();
    canvas.save();
    canvas.setGlobalAlpha(0.25);
    canvas.restore();
    canvas.drawImage("a", 0, 0, 1, 1);
    expect(canvas.findCalls("drawImage")[0]?.state.globalAlpha).toBe(1);
  });
});

describe("SafeCanvas drawImage", () => {
  function setup(): { inner: RecordingCanvas; safe: SafeCanvas } {
    const inner = new RecordingCanvas();
    return { inner, safe: new SafeCanvas(inner) };
  }

  it("passes a good call on with the handle unread", () => {
    const { inner, safe } = setup();
    const handle = {};
    safe.drawImage(handle, 1, 2, 3, 4);
    expect(inner.findCalls("drawImage")[0]?.args).toEqual([handle, 1, 2, 3, 4]);
    expect(inner.findCalls("drawImage")[0]?.args[0]).toBe(handle);
    expect(safe.notices).toHaveLength(0);
  });

  it("passes a width and height just above 0", () => {
    const { inner, safe } = setup();
    safe.drawImage("a", 0, 0, Number.MIN_VALUE, 1e-9);
    expect(inner.findCalls("drawImage")).toHaveLength(1);
    expect(safe.notices).toHaveLength(0);
  });

  const skipped: Array<[string, number, number, number, number]> = [
    ["width 0", 0, 0, 0, 5],
    ["height 0", 0, 0, 5, 0],
    ["negative width", 0, 0, -1, 5],
    ["negative height", 0, 0, 5, -1],
    ["NaN width", 0, 0, NaN, 5],
    ["+Infinity height", 0, 0, 5, Infinity],
    ["-Infinity width", 0, 0, -Infinity, 5],
    ["NaN x", NaN, 0, 5, 5],
    ["+Infinity y", 0, Infinity, 5, 5],
    ["-Infinity x", -Infinity, 0, 5, 5],
  ];
  for (const [name, dx, dy, w, h] of skipped) {
    it(`skips the call with one Notice for ${name}`, () => {
      const { inner, safe } = setup();
      safe.drawImage("a", dx, dy, w, h);
      expect(inner.findCalls("drawImage")).toHaveLength(0);
      expect(safe.notices).toHaveLength(1);
      expect(safe.notices[0]?.message).toContain("drawImage");
    });
  }
});
