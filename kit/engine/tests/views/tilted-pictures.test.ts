import { describe, expect, it } from "vitest";
import type { EngineMap } from "../../src/types.js";
import { asImageHandle, type ImageLookup } from "../../src/views/image-lookup.js";
import { RecordingCanvas } from "../../src/views/recording-canvas.js";
import { DEFAULT_TILT_DEGREES } from "../../src/views/tilted-projection.js";
import { TiltedView } from "../../src/views/tilted-view.js";
import { isViewError } from "../../src/views/view-errors.js";
import { smallTown } from "./helpers/small-town.js";
import { sideFaces, topFaces } from "./helpers/tilted-faces.js";

const PLAN = asImageHandle({ name: "plan" });
const STATUE = asImageHandle({ name: "statue" });
const images: ImageLookup = {
  plan: { image: PLAN, width: 200, height: 100 },
  statue: { image: STATUE, width: 20, height: 12 },
};
const position = { x: 0, y: 0, headingDegrees: 0 };

function drawTown(map: EngineMap, lookup?: ImageLookup) {
  const view = TiltedView.create(map, { images: lookup });
  if (isViewError(view)) throw new Error(view.message);
  const canvas = new RecordingCanvas();
  const result = view.draw(canvas, { position }, 0);
  if (isViewError(result)) throw new Error(result.message);
  return { canvas, notices: result.notices };
}

describe("Tilted view pictures", () => {
  it("draws a Picture_Prop flat as an image, never as a raised block", () => {
    const map: EngineMap = {
      ...smallTown(),
      props: [
        { id: "q2", kind: "picture:statue", x: 30, y: 0, width: 10, height: 6, rotationDegrees: 0, blockHeight: 50 },
      ],
    };
    const { canvas, notices } = drawTown(map, images);
    expect(notices).toEqual([]);
    const drawn = canvas.findCalls("drawImage");
    expect(drawn).toHaveLength(1);
    expect(drawn[0]!.args).toEqual([STATUE, -5, -3, 10, 6]);
    expect(topFaces(canvas)).toHaveLength(0);
    expect(sideFaces(canvas)).toHaveLength(0);
  });

  it("draws a placeholder and names the prop when the picture is missing", () => {
    const map: EngineMap = {
      ...smallTown(),
      props: [{ id: "q2", kind: "picture:statue", x: 30, y: 0, width: 10, height: 6, rotationDegrees: 0 }],
    };
    const { canvas, notices } = drawTown(map, {});
    expect(canvas.findCalls("drawImage")).toHaveLength(0);
    expect(canvas.findCalls("drawText").some((c) => c.args[0] === "picture:statue")).toBe(true);
    expect(notices.some((n) => n.message.includes("q2"))).toBe(true);
  });

  it("draws the background on the ground plane, above the ground and below blocked areas", () => {
    const map: EngineMap = {
      ...smallTown(),
      props: [],
      backgroundPicture: { ref: "plan", scale: 0.5, opacity: 0.4 },
    };
    const { canvas, notices } = drawTown(map, images);
    expect(notices).toEqual([]);
    const calls = canvas.getCalls();
    const at = calls.findIndex((c) => c.op === "drawImage");
    expect(at).toBeGreaterThan(-1);
    expect(calls[at]!.args).toEqual([PLAN, 0, 0, 100, 50]);
    expect(calls[at]!.state.globalAlpha).toBe(0.4);

    const groundFill = calls.findIndex((c) => c.op === "fill");
    const nextFill = calls.findIndex((c, i) => i > at && c.op === "fill");
    expect(groundFill).toBeGreaterThan(-1);
    expect(groundFill).toBeLessThan(at);
    expect(nextFill).toBeGreaterThan(at);

    // The tilted ground transform is in force: a vertical squash by sin(tilt) before the image.
    const sin = Math.sin((DEFAULT_TILT_DEGREES * Math.PI) / 180);
    const squash = calls.findIndex((c) => c.op === "scale" && c.args[0] === 1 && c.args[1] === sin);
    expect(squash).toBeGreaterThan(-1);
    expect(squash).toBeLessThan(at);
    // No depth-sorted block is involved: the image is drawn before any restore of the ground group
    // and no raised face exists.
    expect(topFaces(canvas)).toHaveLength(0);
  });

  it("makes the next frame due when a picture arrives", () => {
    const map: EngineMap = { ...smallTown(), props: [], backgroundPicture: { ref: "plan", scale: 1, opacity: 1 } };
    const view = TiltedView.create(map);
    if (isViewError(view)) throw new Error(view.message);
    view.draw(new RecordingCanvas(), { position }, 0);
    view.setImages(images);
    const canvas = new RecordingCanvas();
    const result = view.draw(canvas, { position }, 0);
    if (isViewError(result)) throw new Error(result.message);
    expect(result.drew).toBe(true);
    expect(canvas.findCalls("drawImage")).toHaveLength(1);
  });
});
