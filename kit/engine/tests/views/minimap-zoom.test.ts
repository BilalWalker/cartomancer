import { describe, expect, it } from "vitest";
import { worldToScreen } from "../../src/views/camera.js";
import { Minimap } from "../../src/views/minimap.js";
import { RecordingCanvas } from "../../src/views/recording-canvas.js";
import { isViewError } from "../../src/views/view-errors.js";
import { smallTown } from "./helpers/small-town.js";

function make(options: Parameters<typeof Minimap.create>[1] = {}): Minimap {
  const minimap = Minimap.create(smallTown(), options);
  if (isViewError(minimap)) throw new Error(minimap.message);
  return minimap;
}

const position = { x: 10, y: 20, headingDegrees: 30 };
const badNumbers = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

describe("Minimap zoom limits", () => {
  it("starts with the limits 0.5 and 4", () => {
    expect(make().getZoomLimits()).toEqual({ min: 0.5, max: 4 });
  });

  it("accepts limits at the range ends", () => {
    const minimap = make();
    expect(minimap.setZoomLimits(0.001, 1000)).toBeUndefined();
    expect(minimap.getZoomLimits()).toEqual({ min: 0.001, max: 1000 });
  });

  it("refuses limits outside the range and keeps the old ones", () => {
    const minimap = make();
    const cases: Array<[number, number]> = [
      [0.0009, 4],
      [0.5, 1000.001],
      [0.5, 1001],
      [0, 4],
      [-1, 4],
      ...badNumbers.map((v): [number, number] => [v, 4]),
      ...badNumbers.map((v): [number, number] => [0.5, v]),
    ];
    for (const [min, max] of cases) {
      const error = minimap.setZoomLimits(min, max);
      expect(isViewError(error)).toBe(true);
      expect(minimap.getZoomLimits()).toEqual({ min: 0.5, max: 4 });
    }
    const named = minimap.setZoomLimits(0.0009, 4);
    expect(named && named.message).toContain("minimum zoom");
    expect(named && named.message).toContain("0.001 to 1000");
  });

  it("refuses a minimum that is not below the maximum", () => {
    const minimap = make();
    expect(isViewError(minimap.setZoomLimits(2, 2))).toBe(true);
    expect(isViewError(minimap.setZoomLimits(3, 2))).toBe(true);
    expect(minimap.getZoomLimits()).toEqual({ min: 0.5, max: 4 });
    expect(minimap.setZoomLimits(2, 2.001)).toBeUndefined();
  });
});

describe("Minimap setZoom", () => {
  it("accepts the limits and a value between", () => {
    const minimap = make();
    expect(minimap.setZoom(0.5)).toBeUndefined();
    expect(minimap.setZoom(4)).toBeUndefined();
    expect(minimap.setZoom(2)).toBeUndefined();
    expect(minimap.getZoom()).toBe(2);
  });

  it("refuses a zoom outside the limits and keeps the old zoom", () => {
    const minimap = make();
    for (const z of [0.4999, 4.0001, 0, -1, ...badNumbers]) {
      const error = minimap.setZoom(z);
      expect(isViewError(error)).toBe(true);
      expect(minimap.getZoom()).toBe(1);
    }
    const error = minimap.setZoom(5);
    expect(error && error.message).toContain("0.5 to 4");
  });

  it("uses the limits the caller set", () => {
    const minimap = make();
    expect(minimap.setZoomLimits(0.1, 8)).toBeUndefined();
    expect(minimap.setZoom(8)).toBeUndefined();
    expect(minimap.setZoom(0.1)).toBeUndefined();
    expect(isViewError(minimap.setZoom(8.5))).toBe(true);
  });

  it("moves the zoom into new limits that exclude it", () => {
    const minimap = make();
    expect(minimap.setZoomLimits(2, 3)).toBeUndefined();
    expect(minimap.getZoom()).toBe(2);
  });

  it("keeps the player marker at the viewport centre when the zoom changes", () => {
    const minimap = make({ width: 200, height: 160, reducedMotion: true });
    const canvas = new RecordingCanvas();
    minimap.draw(canvas, { position }, 0);
    expect(minimap.setZoom(3.5)).toBeUndefined();
    const result = minimap.draw(canvas, { position }, 16);
    expect(isViewError(result) ? false : result.drew).toBe(true);
    const camera = minimap.getCamera()!;
    expect(camera.zoom).toBe(3.5);
    const point = worldToScreen(camera, { x: position.x, y: position.y });
    if (isViewError(point)) throw new Error(point.message);
    expect(point.x).toBeCloseTo(100, 6);
    expect(point.y).toBeCloseTo(80, 6);
  });
});

describe("Minimap small size", () => {
  function opCount(canvas: RecordingCanvas, op: string): number {
    return canvas.getCalls().filter((c) => c.op === op).length;
  }

  it("draws no circle and reports a notice under 40 by 40", () => {
    for (const [w, h] of [[39, 200], [200, 39], [39.99, 39.99], [1, 1]]) {
      const minimap = make({ width: w, height: h });
      const canvas = new RecordingCanvas();
      const result = minimap.draw(canvas, { position }, 0);
      if (isViewError(result)) throw new Error(result.message);
      expect(opCount(canvas, "arc")).toBe(0);
      expect(result.notices.some((n) => n.message.includes("at least 40 by 40 CSS pixels"))).toBe(true);
    }
  });

  it("draws the circle at exactly 40 by 40", () => {
    const minimap = make({ width: 40, height: 40 });
    const canvas = new RecordingCanvas();
    const result = minimap.draw(canvas, { position }, 0);
    if (isViewError(result)) throw new Error(result.message);
    expect(opCount(canvas, "arc")).toBeGreaterThan(0);
    expect(result.notices.some((n) => n.message.includes("at least 40 by 40"))).toBe(false);
  });

  it("draws the circle again after a resize from small to 40", () => {
    const minimap = make({ width: 30, height: 30 });
    const canvas = new RecordingCanvas();
    minimap.draw(canvas, { position }, 0);
    expect(minimap.resize(40, 40)).toBeUndefined();
    minimap.draw(canvas, { position }, 16);
    expect(opCount(canvas, "arc")).toBeGreaterThan(0);
  });
});
