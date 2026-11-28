import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { EngineMap, PropData } from "../../src/types.js";
import { RecordingCanvas } from "../../src/views/recording-canvas.js";
import { TiltedView } from "../../src/views/tilted-view.js";
import { isViewError } from "../../src/views/view-errors.js";
import { smallTown } from "./helpers/small-town.js";
import { centroidY, topFaces } from "./helpers/tilted-faces.js";

function mapWithBlocks(props: PropData[]): EngineMap {
  return { ...smallTown(), props };
}

function makeView(map: EngineMap): TiltedView {
  const view = TiltedView.create(map);
  if (isViewError(view)) throw new Error(view.message);
  return view;
}

describe("Tilted view depth order", () => {
  it("draws raised blocks nearer after farther", () => {
    // Feature: map-views, Property 13: Raised blocks are drawn nearer after farther
    // **Validates: Requirements 12.11**
    const headings = [0, 90, 180, 270] as const;
    fc.assert(
      fc.property(
        fc.constantFrom(...headings),
        fc.uniqueArray(fc.integer({ min: 0, max: 80 }), { minLength: 2, maxLength: 6 }),
        fc.array(fc.integer({ min: -60, max: 60 }), { minLength: 6, maxLength: 6 }),
        (heading, forwardOffsets, sideOffsets) => {
          const rad = (heading * Math.PI) / 180;
          const fx = Math.round(Math.cos(rad));
          const fy = Math.round(Math.sin(rad));
          const props: PropData[] = forwardOffsets.map((d, i) => ({
            id: `b${i}`,
            kind: "building",
            x: fx * d - fy * sideOffsets[i]!,
            y: fy * d + fx * sideOffsets[i]!,
            width: 4,
            height: 4,
            rotationDegrees: 0,
          }));
          const view = makeView(mapWithBlocks(props));
          const canvas = new RecordingCanvas();
          const result = view.draw(canvas, { position: { x: 0, y: 0, headingDegrees: heading } }, 0);
          expect(isViewError(result)).toBe(false);
          const faces = topFaces(canvas);
          expect(faces).toHaveLength(props.length);
          // Same size blocks: a nearer block (lower on the screen) has a larger centroid y.
          const ys = faces.map(centroidY);
          for (let i = 1; i < ys.length; i++) expect(ys[i]!).toBeGreaterThan(ys[i - 1]!);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("breaks a depth tie by ascending identifier", () => {
    const props: PropData[] = ["b2", "b1"].map((id, i) => ({
      id,
      kind: "building",
      x: 20,
      y: i === 0 ? 10 : -10,
      width: 4,
      height: 4,
      rotationDegrees: 0,
    }));
    const view = makeView(mapWithBlocks(props));
    const canvas = new RecordingCanvas();
    view.draw(canvas, { position: { x: 0, y: 0, headingDegrees: 0 } }, 0);
    const faces = topFaces(canvas);
    expect(faces).toHaveLength(2);
    // b1 is at y -10 (left of the screen after the turn), b2 at y 10: b1 first.
    const xs = faces.map((f) => f.points.reduce((s, p) => s + p.x, 0) / f.points.length);
    expect(xs[0]!).toBeLessThan(xs[1]!);
  });
});
