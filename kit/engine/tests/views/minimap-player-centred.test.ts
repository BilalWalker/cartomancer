import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { worldToScreen } from "../../src/views/camera.js";
import { isViewError } from "../../src/views/view-errors.js";
import { asImageHandle } from "../../src/views/image-lookup.js";
import { Minimap } from "../../src/views/minimap.js";
import { RecordingCanvas } from "../../src/views/recording-canvas.js";
import { smallTown } from "./helpers/small-town.js";

function makeMinimap(options: Parameters<typeof Minimap.create>[1] = {}): Minimap {
  const minimap = Minimap.create(smallTown(), options);
  if (isViewError(minimap)) throw new Error(minimap.message);
  return minimap;
}

describe("Minimap centring", () => {
  it("keeps the player centred with the heading up", () => {
    // Feature: map-views, Property 8: Minimap keeps the player centred with heading up
    // **Validates: Requirements 9.7**
    fc.assert(
      fc.property(
        fc.double({ min: -1_000_000, max: 1_000_000, noNaN: true }),
        fc.double({ min: -1_000_000, max: 1_000_000, noNaN: true }),
        fc.double({ min: -360, max: 360, noNaN: true }),
        fc.integer({ min: 40, max: 400 }),
        fc.integer({ min: 40, max: 400 }),
        (x, y, heading, width, height) => {
          const minimap = makeMinimap({ width, height });
          const canvas = new RecordingCanvas();
          const result = minimap.draw(canvas, { position: { x, y, headingDegrees: heading } }, 0);
          expect(isViewError(result)).toBe(false);
          const camera = minimap.getCamera()!;
          const centre = worldToScreen(camera, { x, y });
          if (isViewError(centre)) throw new Error(centre.message);
          expect(Math.abs(centre.x - width / 2)).toBeLessThanOrEqual(0.001);
          expect(Math.abs(centre.y - height / 2)).toBeLessThanOrEqual(0.001);
          const rad = (heading * Math.PI) / 180;
          const ahead = worldToScreen(camera, { x: x + Math.cos(rad), y: y + Math.sin(rad) });
          if (isViewError(ahead)) throw new Error(ahead.message);
          expect(Math.abs(ahead.x - width / 2)).toBeLessThanOrEqual(0.001);
          expect(ahead.y).toBeLessThan(height / 2);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Minimap drawing", () => {
  const position = { x: 50, y: 0, headingDegrees: 0 };

  it("draws the small town clipped to a circle, with the rim after the layers", () => {
    const minimap = makeMinimap();
    const canvas = new RecordingCanvas();
    const result = minimap.draw(canvas, { position, destinationPlaceId: "p2" }, 0);
    if (isViewError(result)) throw new Error(result.message);
    expect(result.drew).toBe(true);
    const calls = canvas.getCalls();
    const clip = calls.findIndex((c) => c.op === "clip");
    expect(clip).toBeGreaterThan(0);
    expect(calls[clip - 1]!.op).toBe("closePath");
    expect(calls.slice(0, clip).some((c) => c.op === "arc")).toBe(true);
    const texts = canvas.findCalls("drawText").map((c) => c.args[0]);
    expect(texts).toContain("Bakery");
    expect(canvas.findCalls("stroke").length).toBeGreaterThan(0);
  });

  it("makes zero calls on a second draw when nothing changed", () => {
    const minimap = makeMinimap();
    const first = new RecordingCanvas();
    minimap.draw(first, { position }, 0);
    const second = new RecordingCanvas();
    const result = minimap.draw(second, { position }, 0);
    if (isViewError(result)) throw new Error(result.message);
    expect(result.drew).toBe(false);
    expect(second.getCalls()).toHaveLength(0);
  });

  it("draws a picture prop from the images lookup", () => {
    const handle = asImageHandle({ name: "statue" });
    const minimap = makeMinimap({ images: { statue: { image: handle, width: 20, height: 12 } } });
    const canvas = new RecordingCanvas();
    minimap.draw(canvas, { position }, 0);
    const images = canvas.findCalls("drawImage");
    expect(images).toHaveLength(1);
    expect(images[0]!.args[0]).toBe(handle);
  });

  it("keeps the centre when it is resized", () => {
    const minimap = makeMinimap();
    minimap.draw(new RecordingCanvas(), { position }, 0);
    expect(minimap.resize(300, 100)).toBeUndefined();
    const camera = minimap.getCamera()!;
    expect([camera.centerX, camera.centerY]).toEqual([50, 0]);
    expect([camera.viewportWidth, camera.viewportHeight]).toEqual([300, 100]);
    const redraw = minimap.draw(new RecordingCanvas(), { position }, 0);
    expect(isViewError(redraw) ? false : redraw.drew).toBe(true);
  });

  it("reports a map with no roads as a notice and refuses a bad size", () => {
    const empty = { ...smallTown(), roads: [], usableRoadIds: new Set<string>() };
    const minimap = Minimap.create(empty);
    if (isViewError(minimap)) throw new Error(minimap.message);
    expect(minimap.getNotices().some((n) => n.message.includes("no roads"))).toBe(true);
    expect(isViewError(Minimap.create(smallTown(), { width: Number.NaN }))).toBe(true);
    expect(isViewError(minimap.resize(0, 100))).toBe(true);
    expect(isViewError(minimap.resize(100, 16385))).toBe(true);
  });

  it("refuses a bad position and keeps drawing afterwards", () => {
    const minimap = makeMinimap();
    const canvas = new RecordingCanvas();
    const bad = minimap.draw(canvas, { position: { x: Number.NaN, y: 0, headingDegrees: 0 } }, 0);
    expect(isViewError(bad)).toBe(true);
    expect(canvas.getCalls()).toHaveLength(0);
    const good = minimap.draw(canvas, { position }, 0);
    expect(isViewError(good)).toBe(false);
  });

  it("turns smoothly towards a new heading by the shortest turn", () => {
    const minimap = makeMinimap();
    minimap.draw(new RecordingCanvas(), { position: { x: 0, y: 0, headingDegrees: 170 } }, 0);
    minimap.draw(new RecordingCanvas(), { position: { x: 0, y: 0, headingDegrees: -170 } }, 100);
    const rotation = minimap.getCamera()!.rotationDegrees;
    // From -260 towards -(-170)-90 = 80 via the short way (-260 -> -280 ... = 80 - 360).
    expect(rotation).toBeLessThan(-260);
    expect(rotation).toBeGreaterThan(-280);
  });
});
