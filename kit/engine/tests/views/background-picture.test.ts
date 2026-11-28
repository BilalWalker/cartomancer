import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { BackgroundPictureData } from "../../src/types.js";
import {
  asImageHandle,
  createPictureResolver,
  type ImageLookup,
} from "../../src/views/image-lookup.js";
import { drawBackgroundPicture, type WorldRegion } from "../../src/views/layers-areas.js";
import { RecordingCanvas } from "../../src/views/recording-canvas.js";

const HANDLE = asImageHandle({ name: "plan" });
const IMAGES: ImageLookup = { plan: { image: HANDLE, width: 200, height: 100 } };
const REGION: WorldRegion = { minX: -10, minY: -10, maxX: 50, maxY: 50 };

function run(
  background: BackgroundPictureData | undefined,
  region: WorldRegion = REGION,
  images: ImageLookup | undefined = IMAGES,
) {
  const rec = new RecordingCanvas();
  const notices = drawBackgroundPicture(rec, background, createPictureResolver(images), region);
  return { rec, notices };
}

describe("drawBackgroundPicture", () => {
  it("draws the picture at its scale and opacity, inside save and restore", () => {
    // Feature: map-views, Property 24: The background picture is drawn at its scale and opacity
    // **Validates: Requirements 24.6, 24.7, 24.8, 24.13, 24.18**
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 20, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (scale, opacity) => {
          const { rec, notices } = run({ ref: "plan", scale, opacity });
          expect(notices).toHaveLength(0);
          const ops = rec.getCalls().map((c) => c.op);
          expect(ops).toEqual(["save", "setGlobalAlpha", "drawImage", "restore"]);
          const draw = rec.findCalls("drawImage")[0]!;
          expect(draw.args).toEqual([HANDLE, 0, 0, 200 * scale, 100 * scale]);
          expect(draw.state.globalAlpha).toBe(opacity);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("does nothing and says nothing without a background", () => {
    const { rec, notices } = run(undefined);
    expect(rec.getCalls()).toHaveLength(0);
    expect(notices).toHaveLength(0);
  });

  it("gives a Notice naming the reference when the picture is missing", () => {
    const { rec, notices } = run({ ref: "gone", scale: 1, opacity: 1 });
    expect(rec.getCalls()).toHaveLength(0);
    expect(notices.some((n) => n.message.includes("gone"))).toBe(true);
  });

  it("gives a Notice when there is no lookup at all", () => {
    const rec = new RecordingCanvas();
    const notices = drawBackgroundPicture(
      rec,
      { ref: "plan", scale: 1, opacity: 1 },
      createPictureResolver(undefined),
      REGION,
    );
    expect(rec.getCalls()).toHaveLength(0);
    expect(notices).toHaveLength(1);
  });

  const badScales: [string, number][] = [
    ["0", 0],
    ["negative", -1],
    ["NaN", NaN],
    ["+Infinity", Infinity],
    ["-Infinity", -Infinity],
  ];
  for (const [name, scale] of badScales) {
    it(`gives a Notice naming scale for ${name} and makes no lookup`, () => {
      let lookups = 0;
      const counting: ImageLookup = () => {
        lookups++;
        return IMAGES instanceof Function ? undefined : IMAGES.plan;
      };
      const { rec, notices } = run({ ref: "plan", scale, opacity: 1 }, REGION, counting);
      expect(rec.getCalls()).toHaveLength(0);
      expect(lookups).toBe(0);
      expect(notices).toHaveLength(1);
      expect(notices[0]!.message).toContain("scale");
    });
  }

  it("draws at a scale just above 0", () => {
    const { rec, notices } = run({ ref: "plan", scale: Number.MIN_VALUE, opacity: 1 });
    expect(notices).toHaveLength(0);
    expect(rec.findCalls("drawImage")).toHaveLength(1);
  });

  const badOpacities: [string, number][] = [
    ["just below 0", -1e-9],
    ["just above 1", 1 + 1e-9],
    ["NaN", NaN],
    ["+Infinity", Infinity],
    ["-Infinity", -Infinity],
  ];
  for (const [name, opacity] of badOpacities) {
    it(`gives a Notice naming opacity for ${name}`, () => {
      const { rec, notices } = run({ ref: "plan", scale: 1, opacity });
      expect(rec.getCalls()).toHaveLength(0);
      expect(notices).toHaveLength(1);
      expect(notices[0]!.message).toContain("opacity");
    });
  }

  it("still makes the call at opacity 0 and at opacity 1", () => {
    for (const opacity of [0, 1]) {
      const { rec } = run({ ref: "plan", scale: 1, opacity });
      expect(rec.findCalls("drawImage")).toHaveLength(1);
      expect(rec.findCalls("drawImage")[0]!.state.globalAlpha).toBe(opacity);
    }
  });

  it("makes no call when the picture lies outside the visible region", () => {
    const far: WorldRegion = { minX: 500, minY: 500, maxX: 600, maxY: 600 };
    const { rec, notices } = run({ ref: "plan", scale: 1, opacity: 1 }, far);
    expect(rec.getCalls()).toHaveLength(0);
    expect(notices).toHaveLength(0);
    const before: WorldRegion = { minX: -100, minY: -100, maxX: -1, maxY: -1 };
    expect(run({ ref: "plan", scale: 1, opacity: 1 }, before).rec.getCalls()).toHaveLength(0);
  });

  it("restores the alpha after the call", () => {
    const rec = new RecordingCanvas();
    drawBackgroundPicture(
      rec,
      { ref: "plan", scale: 1, opacity: 0.3 },
      createPictureResolver(IMAGES),
      REGION,
    );
    rec.fill();
    expect(rec.findCalls("fill")[0]!.state.globalAlpha).toBe(1);
  });
});
