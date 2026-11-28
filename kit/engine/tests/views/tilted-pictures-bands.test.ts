import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { BackgroundPictureData, BlockedAreaData, PropData } from "../../src/types.js";
import { createCamera, screenToWorld, type Camera, type Point } from "../../src/views/camera.js";
import {
  asImageHandle,
  createPictureResolver,
  type ImageEntry,
  type ImageLookup,
} from "../../src/views/image-lookup.js";
import { RecordingCanvas, type Matrix, type RecordedCall } from "../../src/views/recording-canvas.js";
import { DEFAULT_STYLE } from "../../src/views/style.js";
import { drawTiltedBlockedAreas, type TiltedGroundView } from "../../src/views/tilted-ground.js";
import {
  BAND_DEPTH_RATIO,
  MAX_BANDS,
  depthBands,
  drawTiltedBackgroundPicture,
  drawTiltedPictureProps,
} from "../../src/views/tilted-pictures.js";
import {
  focalDistanceFor,
  projectPerspective,
  unprojectPerspective,
} from "../../src/views/tilted-projection.js";
import { isViewError, type ViewError } from "../../src/views/view-errors.js";

function ok<T extends object>(value: T | ViewError): T {
  if (isViewError(value)) throw new Error(value.message);
  return value;
}

const TILT = 35;
const camera: Camera = ok(
  createCamera({ centerX: 0, centerY: 0, zoom: 2, rotationDegrees: 0, viewportWidth: 400, viewportHeight: 300 }),
);
const view: TiltedGroundView = { camera, tiltAngleDegrees: TILT };
const f = focalDistanceFor(TILT, 300) as number;

const PLAN = asImageHandle({ name: "plan" });
const planEntry: ImageEntry = { image: PLAN, width: 2000, height: 2000 };

function apply(m: Matrix, p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

function resolverOf(lookup: ImageLookup | undefined) {
  return createPictureResolver(lookup);
}

/** The world point shown at a screen point of the view (height 0, rotation 0, centre at the origin). */
function worldAtScreen(x: number, y: number): Point {
  return ok(screenToWorld(camera, { x, y }));
}

function prop(id: string, kind: string, at: Point, over: Partial<PropData> = {}): PropData {
  return { id, kind, x: at.x, y: at.y, width: 10, height: 6, rotationDegrees: 0, ...over };
}

/** Runs of consecutive drawImage calls with the same handle. */
function runsOf(rec: RecordingCanvas): { handle: unknown; length: number }[] {
  const runs: { handle: unknown; length: number }[] = [];
  for (const call of rec.findCalls("drawImage")) {
    const last = runs[runs.length - 1];
    if (last !== undefined && last.handle === call.args[0]) last.length += 1;
    else runs.push({ handle: call.args[0], length: 1 });
  }
  return runs;
}

describe("depth bands", () => {
  it("gives 43 contiguous bands from the bottom row to the top row for the default Viewports", () => {
    for (const [w, h] of [
      [400, 300],
      [375, 500],
      [200, 200],
      [1600, 1600],
    ] as const) {
      const bands = depthBands(h, TILT, focalDistanceFor(TILT, h) as number);
      expect(bands.length).toBeGreaterThanOrEqual(1);
      expect(bands.length).toBeLessThanOrEqual(MAX_BANDS);
      expect(bands[0]!.bottom).toBe(h);
      expect(bands[bands.length - 1]!.top).toBe(0);
      for (let i = 0; i < bands.length; i++) {
        expect(bands[i]!.top).toBeLessThan(bands[i]!.bottom);
        if (i > 0) expect(bands[i]!.bottom).toBe(bands[i - 1]!.top);
      }
      expect(w).toBeGreaterThan(0);
    }
    expect(depthBands(300, TILT, f)).toHaveLength(MAX_BANDS);
  });

  it("keeps the depth ratio of each band near 1.02 and rounds inner rows to whole pixels", () => {
    const bands = depthBands(1600, TILT, focalDistanceFor(TILT, 1600) as number);
    const ft = (focalDistanceFor(TILT, 1600) as number) * Math.tan((TILT * Math.PI) / 180);
    const scaleAt = (row: number): number => (row - 0.75 * 1600 + ft) / ft;
    for (const band of bands) {
      expect(Number.isInteger(band.top)).toBe(true);
      // Depth is the inverse of the scale of a row.
      expect(scaleAt(band.bottom) / scaleAt(band.top)).toBeLessThanOrEqual(BAND_DEPTH_RATIO * 1.001);
    }
  });
});

describe("tilted background picture in bands", () => {
  const background: BackgroundPictureData = { ref: "plan", scale: 1, opacity: 0.4 };

  function drawBackground(cam: Camera = camera) {
    const v: TiltedGroundView = { camera: cam, tiltAngleDegrees: TILT };
    const rec = new RecordingCanvas();
    const notices = drawTiltedBackgroundPicture(rec, background, resolverOf({ plan: planEntry }), v);
    return { rec, notices };
  }

  it("draws one drawImage call per band, each inside its own clip, with the picture alpha", () => {
    const cam = ok(createCamera({ centerX: 1000, centerY: 1000, zoom: 2, rotationDegrees: 40, viewportWidth: 400, viewportHeight: 300 }));
    const { rec, notices } = drawBackground(cam);
    expect(notices).toEqual([]);
    const bands = depthBands(300, TILT, f);
    const images = rec.findCalls("drawImage");
    expect(images).toHaveLength(bands.length);
    const calls = rec.getCalls();
    images.forEach((image, k) => {
      expect(image.args).toEqual([PLAN, 0, 0, 2000, 2000]);
      expect(image.state.globalAlpha).toBe(0.4);
      const at = calls.indexOf(image);
      let start = at;
      while (calls[start]!.op !== "save") start -= 1;
      const inside = calls.slice(start, at);
      expect(inside.some((c) => c.op === "clip")).toBe(true);
      expect(calls[at + 1]!.op).toBe("restore");
      // The clip path lies inside the rows of its band.
      const ys = inside.filter((c) => c.op === "moveTo" || c.op === "lineTo").map((c) => c.args[1] as number);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(bands[k]!.top - 1e-9);
      expect(Math.max(...ys)).toBeLessThanOrEqual(bands[k]!.bottom + 1e-9);
    });
  });

  it("places the picture exactly at the middle row of each band", () => {
    const cam = ok(createCamera({ centerX: 1000, centerY: 1000, zoom: 2, rotationDegrees: 40, viewportWidth: 400, viewportHeight: 300 }));
    const { rec } = drawBackground(cam);
    const bands = depthBands(300, TILT, f);
    rec.findCalls("drawImage").forEach((image, k) => {
      const mid = (bands[k]!.top + bands[k]!.bottom) / 2;
      for (const column of [60, 200, 330]) {
        const world = ok(unprojectPerspective({ x: column, y: mid }, TILT, cam, f));
        const placed = apply(image.state.transform, world);
        const exact = ok(projectPerspective(world, 0, TILT, cam, f));
        expect(placed.x).toBeCloseTo(exact.x, 6);
        expect(placed.y).toBeCloseTo(exact.y, 6);
      }
    });
  });

  it("restores the alpha after the bands", () => {
    const rec = new RecordingCanvas();
    rec.setGlobalAlpha(0.7);
    drawTiltedBackgroundPicture(rec, background, resolverOf({ plan: planEntry }), view);
    rec.fill();
    const last = rec.getCalls()[rec.getCalls().length - 1]!;
    expect(last.state.globalAlpha).toBe(0.7);
  });

  it("makes no call for a picture whose bands are all outside the Viewport", () => {
    const rec = new RecordingCanvas();
    const small: ImageLookup = { plan: { image: PLAN, width: 10, height: 10 } };
    const far = ok(createCamera({ centerX: 5000, centerY: 5000, zoom: 2, rotationDegrees: 0, viewportWidth: 400, viewportHeight: 300 }));
    const notices = drawTiltedBackgroundPicture(rec, background, resolverOf(small), { camera: far, tiltAngleDegrees: TILT });
    expect(notices).toEqual([]);
    expect(rec.getCalls()).toHaveLength(0);
  });

  it("draws nothing and says so when the image is missing", () => {
    const rec = new RecordingCanvas();
    const notices = drawTiltedBackgroundPicture(rec, background, resolverOf({}), view);
    expect(rec.getCalls()).toHaveLength(0);
    expect(notices).toHaveLength(1);
    expect(notices[0]!.message).toContain("plan");
  });

  it("draws nothing for no background and names a bad opacity", () => {
    const rec = new RecordingCanvas();
    expect(drawTiltedBackgroundPicture(rec, undefined, resolverOf(undefined), view)).toEqual([]);
    const notices = drawTiltedBackgroundPicture(rec, { ref: "plan", scale: 1, opacity: 2 }, resolverOf({ plan: planEntry }), view);
    expect(notices).toHaveLength(1);
    expect(notices[0]!.message).toContain("opacity");
    expect(rec.getCalls()).toHaveLength(0);
  });
});

describe("tilted picture props in bands", () => {
  const STATUE = asImageHandle({ name: "statue" });
  const statue: ImageEntry = { image: STATUE, width: 20, height: 12 };

  it("draws a prop picture in bands with its position and rotation in world units", () => {
    const rec = new RecordingCanvas();
    const at = worldAtScreen(200, 150);
    const p = prop("q1", "picture:statue", at, { width: 40, height: 24, rotationDegrees: 30 });
    const notices = drawTiltedPictureProps(rec, DEFAULT_STYLE, [p], view, resolverOf({ statue }));
    expect(notices).toEqual([]);
    const images = rec.findCalls("drawImage");
    expect(images.length).toBeGreaterThanOrEqual(1);
    expect(images.length).toBeLessThanOrEqual(MAX_BANDS);
    for (const image of images) expect(image.args).toEqual([STATUE, -20, -12, 40, 24]);
    // The prop centre maps to its exact projection within the band.
    const centre = ok(projectPerspective(at, 0, TILT, camera, f));
    const bands = depthBands(300, TILT, f);
    const band = bands.findIndex((b) => centre.y >= b.top && centre.y <= b.bottom);
    expect(band).toBeGreaterThanOrEqual(0);
    expect(rec.findCalls("fill")).toHaveLength(0);
  });

  it("draws the placeholder with the kind as label and names the prop when the image is missing", () => {
    const rec = new RecordingCanvas();
    const p = prop("q2", "picture:statue", worldAtScreen(200, 150));
    const notices = drawTiltedPictureProps(rec, DEFAULT_STYLE, [p], view, resolverOf({}));
    expect(rec.findCalls("drawImage")).toHaveLength(0);
    expect(rec.findCalls("fill")).toHaveLength(1);
    const labels = rec.findCalls("drawText");
    expect(labels).toHaveLength(1);
    expect(labels[0]!.args[0]).toBe("picture:statue");
    expect(labels[0]!.args.slice(3)).toEqual(["11px sans-serif", "center"]);
    expect(notices).toHaveLength(1);
    expect(notices[0]!.message).toContain("q2");
    expect(notices[0]!.message).toContain("statue");
  });

  it("treats an empty reference as a placeholder and names the prop", () => {
    const rec = new RecordingCanvas();
    const p = prop("q3", "upload:", worldAtScreen(200, 150));
    const notices = drawTiltedPictureProps(rec, DEFAULT_STYLE, [p], view, resolverOf({ statue }));
    expect(rec.findCalls("drawImage")).toHaveLength(0);
    expect(rec.findCalls("drawText")).toHaveLength(1);
    expect(notices.map((n) => n.message).join(" ")).toContain("q3");
  });

  it("does not draw a prop under the near clip and names it in one Notice", () => {
    const rec = new RecordingCanvas();
    const p = prop("behind", "picture:statue", worldAtScreen(200, 150 + 700));
    const notices = drawTiltedPictureProps(rec, DEFAULT_STYLE, [p], view, resolverOf({ statue }));
    expect(notices).toHaveLength(1);
    expect(notices[0]!.message).toContain("behind");
    expect(rec.getCalls()).toHaveLength(0);
  });

  it("makes no call for a prop outside the Viewport and ignores props of other kinds", () => {
    const rec = new RecordingCanvas();
    const outside = prop("far", "picture:statue", { x: 4000, y: -4000 });
    const house = prop("h", "house", worldAtScreen(200, 150));
    const notices = drawTiltedPictureProps(rec, DEFAULT_STYLE, [outside, house], view, resolverOf({ statue }));
    expect(notices).toEqual([]);
    expect(rec.getCalls()).toHaveLength(0);
  });

  it("reports a bad size without drawing", () => {
    const rec = new RecordingCanvas();
    const p = prop("flat", "picture:statue", worldAtScreen(200, 150), { width: 0 });
    const notices = drawTiltedPictureProps(rec, DEFAULT_STYLE, [p], view, resolverOf({ statue }));
    expect(notices).toHaveLength(1);
    expect(notices[0]!.message).toContain("width");
    expect(rec.getCalls()).toHaveLength(0);
  });
});

describe("tilted picture properties on the Recording_Canvas", () => {
  it("is an image or a placeholder, a run of 1 to 43 calls with one handle counts as one", () => {
    // Feature: map-views, Property 23 (restated): A Picture_Prop is an image or a placeholder, never nothing
    // **Validates: Requirements 24.4, 24.5, 24.9, 24.10, 24.16, 24.17**
    const propArb = fc.record({
      inside: fc.boolean(),
      hasImage: fc.boolean(),
      sx: fc.integer({ min: 60, max: 340 }),
      sy: fc.integer({ min: 60, max: 260 }),
      far: fc.record({
        x: fc.integer({ min: 3000, max: 6000 }),
        y: fc.integer({ min: 3000, max: 6000 }),
        sx: fc.constantFrom(-1, 1),
        sy: fc.constantFrom(-1, 1),
      }),
      width: fc.integer({ min: 2, max: 8 }),
      height: fc.integer({ min: 2, max: 8 }),
      rotation: fc.integer({ min: 0, max: 359 }),
      kind: fc.constantFrom("picture", "upload"),
    });
    fc.assert(
      fc.property(fc.array(propArb, { minLength: 1, maxLength: 8 }), (specs) => {
        const lookup: Record<string, ImageEntry> = {};
        const props: PropData[] = specs.map((s, i) => {
          const at = s.inside
            ? worldAtScreen(s.sx, s.sy)
            : { x: s.far.x * s.far.sx, y: s.far.y * s.far.sy };
          if (s.hasImage) lookup[`r${i}`] = { image: asImageHandle({ i }), width: 30, height: 20 };
          return prop(`p${i}`, `${s.kind}:r${i}`, at, {
            width: s.width,
            height: s.height,
            rotationDegrees: s.rotation,
          });
        });
        const rec = new RecordingCanvas();
        drawTiltedPictureProps(rec, DEFAULT_STYLE, props, view, resolverOf(lookup));
        const expectedImages = specs.filter((s) => s.inside && s.hasImage).length;
        const expectedPlaceholders = specs.filter((s) => s.inside && !s.hasImage).length;
        const runs = runsOf(rec);
        const runsOk = runs.every((r) => r.length >= 1 && r.length <= MAX_BANDS);
        const labels = rec.findCalls("drawText").length;
        return runs.length === expectedImages && runsOk && labels === expectedPlaceholders;
      }),
      { numRuns: 100 },
    );
  });

  it("keeps the scale and opacity of the background in every band, before every later layer", () => {
    // Feature: map-views, Property 24 (restated): The background picture keeps its scale and opacity in every band
    // **Validates: Requirements 24.6, 24.10, 24.17, 24.18**
    const arb = fc.record({
      scale: fc.double({ min: 0.2, max: 3, noNaN: true }),
      opacity: fc.oneof(fc.constantFrom(0, 1), fc.double({ min: 0, max: 1, noNaN: true })),
      imageWidth: fc.integer({ min: 4, max: 500 }),
      imageHeight: fc.integer({ min: 4, max: 500 }),
      ux: fc.double({ min: 0, max: 1, noNaN: true }),
      uy: fc.double({ min: 0, max: 1, noNaN: true }),
      zoom: fc.double({ min: 0.5, max: 4, noNaN: true }),
      rotation: fc.integer({ min: 0, max: 359 }),
      viewportWidth: fc.integer({ min: 200, max: 800 }),
      viewportHeight: fc.integer({ min: 200, max: 600 }),
      tilt: fc.integer({ min: 20, max: 70 }),
    });
    fc.assert(
      fc.property(arb, (a) => {
        const width = a.imageWidth * a.scale;
        const height = a.imageHeight * a.scale;
        const cam = ok(
          createCamera({
            centerX: a.ux * width,
            centerY: a.uy * height,
            zoom: a.zoom,
            rotationDegrees: a.rotation,
            viewportWidth: a.viewportWidth,
            viewportHeight: a.viewportHeight,
          }),
        );
        const v: TiltedGroundView = { camera: cam, tiltAngleDegrees: a.tilt };
        const handle = asImageHandle({ name: "bg" });
        const lookup: ImageLookup = { bg: { image: handle, width: a.imageWidth, height: a.imageHeight } };
        const area: BlockedAreaData = {
          id: "lake",
          kind: "water",
          polygon: [
            { x: cam.centerX - 5, y: cam.centerY - 5 },
            { x: cam.centerX + 5, y: cam.centerY - 5 },
            { x: cam.centerX, y: cam.centerY + 5 },
          ],
        };
        const rec = new RecordingCanvas();
        rec.setGlobalAlpha(0.9);
        const notices = drawTiltedBackgroundPicture(
          rec,
          { ref: "bg", scale: a.scale, opacity: a.opacity },
          resolverOf(lookup),
          v,
        );
        drawTiltedBlockedAreas(rec, DEFAULT_STYLE, [area], v);
        rec.fill();
        const calls = rec.getCalls();
        const images = calls.filter((c: RecordedCall) => c.op === "drawImage");
        const laterFill = calls.findIndex((c) => c.op === "fill");
        const lastImage = calls.lastIndexOf(images[images.length - 1]!);
        return (
          notices.length === 0 &&
          images.length >= 1 &&
          images.length <= MAX_BANDS &&
          images.every(
            (c) =>
              c.state.globalAlpha === a.opacity &&
              c.args[0] === handle &&
              c.args[1] === 0 &&
              c.args[2] === 0 &&
              c.args[3] === width &&
              c.args[4] === height,
          ) &&
          (laterFill === -1 || lastImage < laterFill) &&
          calls[calls.length - 1]!.state.globalAlpha === 0.9
        );
      }),
      { numRuns: 100 },
    );
  });
});
