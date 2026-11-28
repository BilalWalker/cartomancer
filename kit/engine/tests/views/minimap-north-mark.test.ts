import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { worldToScreen } from "../../src/views/camera.js";
import { northMarkFor, Minimap } from "../../src/views/minimap.js";
import { RecordingCanvas } from "../../src/views/recording-canvas.js";
import { DEFAULT_STYLE } from "../../src/views/style.js";
import { isViewError } from "../../src/views/view-errors.js";
import { smallTown } from "./helpers/small-town.js";

function degreesBetween(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

describe("Minimap North_Mark", () => {
  it("points to world north", () => {
    // Feature: map-views, Property 9: North mark points to world north
    // **Validates: Requirements 9.8, 27.7**
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        fc.double({ min: -720, max: 720, noNaN: true }),
        fc.integer({ min: 40, max: 400 }),
        fc.integer({ min: 40, max: 400 }),
        fc.double({ min: 0.5, max: 4, noNaN: true }),
        (x, y, heading, width, height, zoom) => {
          const minimap = Minimap.create(smallTown(), { width, height, zoom });
          if (isViewError(minimap)) throw new Error(minimap.message);
          const canvas = new RecordingCanvas();
          minimap.draw(canvas, { position: { x, y, headingDegrees: heading } }, 0);
          const camera = minimap.getCamera()!;

          const from = worldToScreen(camera, { x: camera.centerX, y: camera.centerY });
          const to = worldToScreen(camera, { x: camera.centerX, y: camera.centerY - 1 });
          if (isViewError(from) || isViewError(to)) throw new Error("camera");
          const expected = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;

          // The direction the mark function reports.
          const mark = northMarkFor(camera, Math.min(width, height) / 2 - DEFAULT_STYLE.rimStyle.widthPx / 2);
          if (isViewError(mark)) throw new Error(mark.message);
          expect(degreesBetween(mark.directionDegrees, expected)).toBeLessThanOrEqual(0.001);

          const directionOf = (px: number, py: number): number =>
            (Math.atan2(py - camera.viewportHeight / 2, px - camera.viewportWidth / 2) * 180) / Math.PI;

          // The tick that was really drawn: the line stroked in the northMark colour.
          const calls = canvas.getCalls();
          const colour = calls.findIndex(
            (c) => c.op === "setStrokeColor" && c.args[0] === DEFAULT_STYLE.northMarkColor,
          );
          expect(colour).toBeGreaterThan(0);
          const tickEnd = calls.slice(0, colour).reverse().find((c) => c.op === "lineTo")!;
          expect(
            degreesBetween(directionOf(tickEnd.args[0] as number, tickEnd.args[1] as number), expected),
          ).toBeLessThanOrEqual(0.001);

          // The letter that was really drawn, when the minimap is big enough for it.
          const letter = canvas.findCalls("drawText").find((c) => c.args[0] === "N");
          expect(letter !== undefined).toBe(mark.showLetter);
          if (letter !== undefined) {
            expect(
              degreesBetween(directionOf(letter.args[1] as number, letter.args[2] as number), expected),
            ).toBeLessThanOrEqual(0.001);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("points up the screen when the heading is east and rotates with the map", () => {
    const camera = { centerX: 0, centerY: 0, zoom: 1, rotationDegrees: -90, viewportWidth: 100, viewportHeight: 100 };
    const up = northMarkFor(camera, 40);
    if (isViewError(up)) throw new Error(up.message);
    // Heading east (0 degrees): the map turned -90, so north is on the left.
    expect(up.tickOuter.x).toBeCloseTo(8.5, 6);
    expect(up.tickOuter.y).toBeCloseTo(50, 6);
    expect(isViewError(northMarkFor(camera, 0))).toBe(true);
    expect(isViewError(northMarkFor(camera, Number.NaN))).toBe(true);
  });
});
