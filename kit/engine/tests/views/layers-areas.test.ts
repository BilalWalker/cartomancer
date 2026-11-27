import { describe, expect, it } from "vitest";
import {
  drawBlockedAreas,
  drawFlatProps,
  drawGround,
} from "../../src/views/layers-areas";
import { RecordingCanvas } from "../../src/views/recording-canvas";
import { DEFAULT_STYLE } from "../../src/views/style";
import type { BlockedAreaData, PropData } from "../../src/types";

const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

function prop(over: Partial<PropData>): PropData {
  return { id: "p1", kind: "house", x: 5, y: 6, width: 4, height: 3, rotationDegrees: 90, ...over };
}

describe("drawGround", () => {
  it("fills the region with the ground colour", () => {
    const rec = new RecordingCanvas();
    const notices = drawGround(rec, DEFAULT_STYLE, { minX: -5, minY: -6, maxX: 7, maxY: 8 });
    expect(notices).toEqual([]);
    const fill = rec.findCalls("fill");
    expect(fill).toHaveLength(1);
    expect(fill[0]!.state.fillColor).toBe(DEFAULT_STYLE.groundColor);
    expect(rec.findCalls("moveTo")[0]!.args).toEqual([-5, -6]);
  });

  it("draws nothing for a region that is not finite", () => {
    const rec = new RecordingCanvas();
    const notices = drawGround(rec, DEFAULT_STYLE, { minX: NaN, minY: 0, maxX: 1, maxY: 1 });
    expect(notices).toHaveLength(1);
    expect(rec.getCalls()).toHaveLength(0);
  });
});

describe("drawBlockedAreas", () => {
  it("fills each kind with its own colour and strokes an outline", () => {
    const rec = new RecordingCanvas();
    const areas: BlockedAreaData[] = [
      { id: "a1", kind: "mountain", polygon: square },
      { id: "a2", kind: "water", polygon: square },
      { id: "a3", kind: "wall", polygon: square },
    ];
    const notices = drawBlockedAreas(rec, DEFAULT_STYLE, areas, 2);
    expect(notices).toEqual([]);
    expect(rec.findCalls("fill").map((c) => c.state.fillColor)).toEqual([
      DEFAULT_STYLE.blockedAreaColors.mountain,
      DEFAULT_STYLE.blockedAreaColors.water,
      DEFAULT_STYLE.blockedAreaColors.wall,
    ]);
    const strokes = rec.findCalls("stroke");
    expect(strokes).toHaveLength(3);
    expect(strokes[0]!.state.lineWidth).toBeCloseTo(DEFAULT_STYLE.blockedAreaOutlineStyle.widthPx / 2);
  });

  it("skips a polygon with fewer than 3 points and names it", () => {
    const rec = new RecordingCanvas();
    const notices = drawBlockedAreas(
      rec,
      DEFAULT_STYLE,
      [{ id: "thin", kind: "water", polygon: square.slice(0, 2) }],
      1,
    );
    expect(notices).toHaveLength(1);
    expect(notices[0]!.message).toContain("thin");
    expect(notices[0]!.message).toContain("at least 3 points");
    expect(rec.getCalls()).toHaveLength(0);
  });

  it("draws nothing for a zoom that is not above 0", () => {
    const rec = new RecordingCanvas();
    const notices = drawBlockedAreas(
      rec,
      DEFAULT_STYLE,
      [{ id: "a", kind: "wall", polygon: square }],
      0,
    );
    expect(notices).toHaveLength(1);
    expect(rec.getCalls()).toHaveLength(0);
  });
});

describe("drawFlatProps", () => {
  it("draws a rectangle at the position with the rotation in radians", () => {
    const rec = new RecordingCanvas();
    const notices = drawFlatProps(rec, DEFAULT_STYLE, [prop({})], 1);
    expect(notices).toEqual([]);
    expect(rec.findCalls("translate")[0]!.args).toEqual([5, 6]);
    expect(rec.findCalls("rotate")[0]!.args[0]).toBeCloseTo(Math.PI / 2);
    expect(rec.findCalls("lineTo")).toHaveLength(3);
    expect(rec.findCalls("fill")[0]!.state.fillColor).toBe(DEFAULT_STYLE.propColor);
  });

  it("draws a tree as a circle and an unknown kind as a rectangle", () => {
    const rec = new RecordingCanvas();
    drawFlatProps(rec, DEFAULT_STYLE, [prop({ kind: "tree" })], 1);
    expect(rec.findCalls("arc")).toHaveLength(1);
    const rec2 = new RecordingCanvas();
    drawFlatProps(rec2, DEFAULT_STYLE, [prop({ kind: "zzz-unknown" })], 1);
    expect(rec2.findCalls("arc")).toHaveLength(0);
    expect(rec2.findCalls("lineTo")).toHaveLength(3);
  });

  it("draws a picture reference as a rectangle labelled with the kind", () => {
    const rec = new RecordingCanvas();
    drawFlatProps(rec, DEFAULT_STYLE, [prop({ kind: "upload:fountain" })], 1);
    expect(rec.findCalls("lineTo")).toHaveLength(3);
    const text = rec.findCalls("drawText");
    expect(text).toHaveLength(1);
    expect(text[0]!.args[0]).toBe("upload:fountain");
  });

  it("skips a prop with a bad width, height or rotation and names it", () => {
    const bad: [Partial<PropData>, string][] = [
      [{ width: 0 }, "width"],
      [{ width: NaN }, "width"],
      [{ height: -1 }, "height"],
      [{ height: Infinity }, "height"],
      [{ rotationDegrees: NaN }, "rotation"],
      [{ rotationDegrees: -Infinity }, "rotation"],
    ];
    for (const [over, word] of bad) {
      const rec = new RecordingCanvas();
      const notices = drawFlatProps(rec, DEFAULT_STYLE, [prop({ id: "bad1", ...over })], 1);
      expect(notices).toHaveLength(1);
      expect(notices[0]!.message).toContain("bad1");
      expect(notices[0]!.message).toContain(word);
      expect(rec.getCalls()).toHaveLength(0);
    }
  });

  it("accepts the smallest valid size just above 0", () => {
    const rec = new RecordingCanvas();
    const notices = drawFlatProps(rec, DEFAULT_STYLE, [prop({ width: 1e-9, height: 1e-9 })], 1);
    expect(notices).toEqual([]);
    expect(rec.findCalls("fill")).toHaveLength(1);
  });
});
