import { describe, expect, it } from "vitest";
import type { CanvasInterface } from "../../src/views/canvas-interface";
import { RecordingCanvas } from "../../src/views/recording-canvas";

function drawScene(canvas: CanvasInterface): void {
  canvas.setFillColor("#112233");
  canvas.setStrokeColor("#445566");
  canvas.setLineWidth(3);
  canvas.save();
  canvas.translate(10, 20);
  canvas.rotate(Math.PI / 2);
  canvas.setFillColor("#ffffff");
  canvas.beginPath();
  canvas.moveTo(0, 0);
  canvas.lineTo(5, 0);
  canvas.closePath();
  canvas.fill();
  canvas.restore();
  canvas.beginPath();
  canvas.arc(1, 2, 3, 0, 6);
  canvas.stroke();
}

describe("RecordingCanvas", () => {
  it("stores the exact ordered call list for a fixed scene", () => {
    const canvas = new RecordingCanvas();
    drawScene(canvas);
    expect(canvas.getCalls().map((c) => c.op)).toEqual([
      "setFillColor",
      "setStrokeColor",
      "setLineWidth",
      "save",
      "translate",
      "rotate",
      "setFillColor",
      "beginPath",
      "moveTo",
      "lineTo",
      "closePath",
      "fill",
      "restore",
      "beginPath",
      "arc",
      "stroke",
    ]);
    expect(canvas.getCalls()[4]?.args).toEqual([10, 20]);
    expect(canvas.getCalls()[14]?.args).toEqual([1, 2, 3, 0, 6]);
  });

  it("stores colours and line width current at each call", () => {
    const canvas = new RecordingCanvas();
    drawScene(canvas);
    const fills = canvas.findCalls("fill");
    expect(fills).toHaveLength(1);
    expect(fills[0]?.state.fillColor).toBe("#ffffff");
    expect(fills[0]?.state.strokeColor).toBe("#445566");
    expect(fills[0]?.state.lineWidth).toBe(3);
    // After restore, the fill colour is back to the one set before save.
    expect(canvas.findCalls("stroke")[0]?.state.fillColor).toBe("#112233");
  });

  it("restores the transform after a nested save and restore", () => {
    const canvas = new RecordingCanvas();
    canvas.save();
    canvas.translate(5, 6);
    canvas.save();
    canvas.scale(2, 2);
    canvas.beginPath();
    canvas.restore();
    canvas.beginPath();
    canvas.restore();
    canvas.beginPath();
    const paths = canvas.findCalls("beginPath");
    expect(paths[0]?.state.transform).toEqual([2, 0, 0, 2, 5, 6]);
    expect(paths[1]?.state.transform).toEqual([1, 0, 0, 1, 5, 6]);
    expect(paths[2]?.state.transform).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it("accumulates translate then rotate into one matrix", () => {
    const canvas = new RecordingCanvas();
    canvas.translate(10, 20);
    canvas.rotate(Math.PI / 2);
    canvas.stroke();
    const m = canvas.findCalls("stroke")[0]?.state.transform;
    expect(m).toBeDefined();
    const [a, b, c, d, e, f] = m!;
    expect(a).toBeCloseTo(0, 12);
    expect(b).toBeCloseTo(1, 12);
    expect(c).toBeCloseTo(-1, 12);
    expect(d).toBeCloseTo(0, 12);
    expect(e).toBe(10);
    expect(f).toBe(20);
    // The point (1, 0) in local space lands at (10, 21).
    expect(a * 1 + e).toBeCloseTo(10, 12);
    expect(b * 1 + f).toBeCloseTo(21, 12);
  });

  it("counts paths begun", () => {
    const canvas = new RecordingCanvas();
    expect(canvas.getPathCount()).toBe(0);
    drawScene(canvas);
    expect(canvas.getPathCount()).toBe(2);
  });

  it("ignores restore without a matching save", () => {
    const canvas = new RecordingCanvas();
    canvas.restore();
    canvas.stroke();
    expect(canvas.getCalls().map((c) => c.op)).toEqual(["restore", "stroke"]);
  });

  it("measures text with a fixed size and records the call", () => {
    const canvas = new RecordingCanvas();
    expect(canvas.measureText("abcd", "12px sans-serif")).toEqual({ width: 32, height: 12 });
    expect(canvas.findCalls("measureText")).toHaveLength(1);
  });

  it("copies dash segments so later edits do not change the record", () => {
    const canvas = new RecordingCanvas();
    const dash = [4, 2];
    canvas.setLineDash(dash);
    dash[0] = 99;
    expect(canvas.getCalls()[0]?.args).toEqual([[4, 2]]);
  });
});
