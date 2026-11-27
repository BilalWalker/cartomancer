import { describe, expect, it } from "vitest";
import { createCamera, type Camera } from "../../src/views/camera";
import { drawPlaceLabels, drawPlaceMarkers } from "../../src/views/layers-places";
import { RecordingCanvas } from "../../src/views/recording-canvas";
import { DEFAULT_STYLE } from "../../src/views/style";
import { isViewError } from "../../src/views/view-errors";
import type { PlaceData } from "../../src/types";

function makeCamera(init: Partial<Camera>): Camera {
  const result = createCamera(init);
  if (isViewError(result)) throw new Error(result.message);
  return result;
}

const camera = makeCamera({
  centerX: 0,
  centerY: 0,
  zoom: 2,
  viewportWidth: 200,
  viewportHeight: 200,
});

function place(over: Partial<PlaceData>): PlaceData {
  return { id: "p1", name: "Bank", category: "shop", x: 0, y: 0, ...over };
}

describe("drawPlaceMarkers", () => {
  it("draws one circle per place, 5 CSS pixels in radius", () => {
    const rec = new RecordingCanvas();
    const notices = drawPlaceMarkers(
      rec,
      DEFAULT_STYLE,
      [place({}), place({ id: "p2", x: 10, y: 5 })],
      camera,
    );
    expect(notices).toEqual([]);
    const arcs = rec.findCalls("arc");
    expect(arcs).toHaveLength(2);
    expect(arcs[0]!.args[2]).toBeCloseTo(2.5);
    expect(arcs[1]!.args.slice(0, 2)).toEqual([10, 5]);
  });

  it("draws an empty-named place's marker and reports it by identifier", () => {
    const rec = new RecordingCanvas();
    const notices = drawPlaceMarkers(rec, DEFAULT_STYLE, [place({ id: "p9", name: "  " })], camera);
    expect(rec.findCalls("arc")).toHaveLength(1);
    expect(notices).toHaveLength(1);
    expect(notices[0]!.message).toContain("p9");
  });

  it("skips a place whose position is not finite", () => {
    const rec = new RecordingCanvas();
    const notices = drawPlaceMarkers(rec, DEFAULT_STYLE, [place({ x: NaN })], camera);
    expect(rec.findCalls("arc")).toHaveLength(0);
    expect(notices[0]!.message).toContain("p1");
  });
});

describe("drawPlaceLabels", () => {
  it("draws the name in the label colours with a background rectangle", () => {
    const rec = new RecordingCanvas();
    const notices = drawPlaceLabels(rec, DEFAULT_STYLE, [place({})], camera);
    expect(notices).toEqual([]);
    const text = rec.findCalls("drawText");
    expect(text).toHaveLength(1);
    expect(text[0]!.args[0]).toBe("Bank");
    expect(text[0]!.state.fillColor).toBe(DEFAULT_STYLE.placeLabelTextColor);
    const fills = rec.findCalls("fill");
    expect(fills).toHaveLength(1);
    expect(fills[0]!.state.fillColor).toBe(DEFAULT_STYLE.placeLabelBackgroundColor);
  });

  it("keeps the font between 11 and 16 pixels", () => {
    for (const [asked, expected] of [
      [2, 11],
      [11, 11],
      [16, 16],
      [90, 16],
      [NaN, 12],
    ] as const) {
      const rec = new RecordingCanvas();
      drawPlaceLabels(rec, DEFAULT_STYLE, [place({})], camera, undefined, asked);
      expect(rec.findCalls("drawText")[0]!.args[3]).toBe(`${expected}px sans-serif`);
    }
  });

  it("draws no label for an empty name and names the place in a notice", () => {
    const rec = new RecordingCanvas();
    const notices = drawPlaceLabels(rec, DEFAULT_STYLE, [place({ id: "p7", name: "" })], camera);
    expect(rec.findCalls("drawText")).toHaveLength(0);
    expect(notices).toHaveLength(1);
    expect(notices[0]!.message).toContain("p7");
  });

  it("gives the destination place its label when labels would collide", () => {
    const rec = new RecordingCanvas();
    const places = [
      place({ id: "a", name: "Alpha" }),
      place({ id: "b", name: "Beta" }),
    ];
    drawPlaceLabels(rec, DEFAULT_STYLE, places, camera, "b");
    const text = rec.findCalls("drawText");
    expect(text).toHaveLength(1);
    expect(text[0]!.args[0]).toBe("Beta");
  });

  it("leaves out a label that does not fit the viewport", () => {
    const small = makeCamera({ zoom: 1, viewportWidth: 20, viewportHeight: 20 });
    const rec = new RecordingCanvas();
    drawPlaceLabels(rec, DEFAULT_STYLE, [place({ name: "A very long name" })], small);
    expect(rec.findCalls("drawText")).toHaveLength(0);
  });

  it("skips a place whose position is not finite and names it", () => {
    const rec = new RecordingCanvas();
    const notices = drawPlaceLabels(rec, DEFAULT_STYLE, [place({ y: Infinity })], camera);
    expect(rec.findCalls("drawText")).toHaveLength(0);
    expect(notices[0]!.message).toContain("p1");
  });
});
