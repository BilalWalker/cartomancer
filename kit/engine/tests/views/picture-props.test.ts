import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { EngineMap, PropData } from "../../src/types.js";
import type { Camera } from "../../src/views/camera.js";
import { drawMapLayers } from "../../src/views/draw-map-layers.js";
import {
  asImageHandle,
  createPictureResolver,
  type ImageEntry,
  type ImageLookup,
} from "../../src/views/image-lookup.js";
import { drawFlatProps } from "../../src/views/layers-areas.js";
import { FullMap } from "../../src/views/full-map.js";
import { Minimap } from "../../src/views/minimap.js";
import { RecordingCanvas } from "../../src/views/recording-canvas.js";
import { DEFAULT_STYLE } from "../../src/views/style.js";
import { TiltedView } from "../../src/views/tilted-view.js";
import { isViewError } from "../../src/views/view-errors.js";
import type { VisibleSet } from "../../src/views/visible-set.js";
import { smallTown } from "./helpers/small-town.js";

const camera: Camera = {
  centerX: 50,
  centerY: 50,
  zoom: 2,
  rotationDegrees: 0,
  viewportWidth: 300,
  viewportHeight: 300,
};

function entry(name: string): ImageEntry {
  return { image: asImageHandle({ name }), width: 64, height: 32 };
}

function prop(id: string, kind: string, over: Partial<PropData> = {}): PropData {
  return { id, kind, x: 40, y: 40, width: 10, height: 6, rotationDegrees: 30, ...over };
}

function mapWith(props: PropData[]): EngineMap {
  return {
    formatVersion: 1,
    nodes: [],
    roads: [],
    places: [],
    blockedAreas: [],
    props,
    style: { colors: {}, lineStyles: {} },
    usableRoadIds: new Set(),
    blockedRoads: [],
  };
}

function draw(props: PropData[], images?: ImageLookup) {
  const map = mapWith(props);
  const visible: VisibleSet = {
    roadIds: new Set(),
    blockedAreaIds: new Set(),
    propIds: new Set(props.map((p) => p.id)),
    placeIds: new Set(),
    roadsTested: 0,
  };
  const rec = new RecordingCanvas();
  const notices = drawMapLayers(rec, {
    map,
    style: DEFAULT_STYLE,
    camera,
    visible,
    position: { x: 50, y: 50, headingDegrees: 0 },
    images,
  });
  return { rec, notices };
}

describe("picture props in drawMapLayers", () => {
  it("is an image or a placeholder, never nothing", () => {
    // Feature: map-views, Property 23: A Picture_Prop is an image or a placeholder, never nothing
    // **Validates: Requirements 24.4, 24.5, 24.9, 24.16, 24.17**
    const refArb = fc.constantFrom("a", "b", "c", "");
    const lookupArb = fc.constantFrom<"none" | "some" | "throws" | "bad-size">(
      "none",
      "some",
      "throws",
      "bad-size",
    );
    fc.assert(
      fc.property(
        fc.array(fc.tuple(refArb, fc.constantFrom("picture:", "upload:")), { maxLength: 6 }),
        lookupArb,
        (specs, mode) => {
          const props = specs.map(([ref, prefix], i) =>
            prop(`q${i}`, prefix + ref, { blockHeight: 20 }),
          );
          const images: ImageLookup | undefined =
            mode === "none"
              ? undefined
              : mode === "some"
                ? { a: entry("a"), b: entry("b") }
                : mode === "throws"
                  ? () => {
                      throw new Error("boom");
                    }
                  : { a: { ...entry("a"), width: 0 }, b: { ...entry("b"), height: NaN } };
          const { rec } = draw(props, images);
          const imagesDrawn = rec.findCalls("drawImage").length;
          const placeholders = rec.findCalls("drawText").length;
          expect(imagesDrawn + placeholders).toBe(props.length);
          for (const call of rec.findCalls("drawText")) {
            expect(props.map((p) => p.kind)).toContain(call.args[0]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("draws a found picture with drawImage at the place of the plain rectangle", () => {
    const found = entry("clinic");
    const { rec, notices } = draw([prop("q1", "picture:clinic")], { clinic: found });
    expect(notices).toEqual([]);
    const calls = rec.findCalls("drawImage");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args).toEqual([found.image, -5, -3, 10, 6]);
    expect(rec.findCalls("drawText")).toHaveLength(0);
    expect(rec.findCalls("rotate").some((c) => Math.abs((c.args[0] as number) - Math.PI / 6) < 1e-9)).toBe(true);
  });

  it("draws a labelled placeholder and names the prop and reference when the picture is missing", () => {
    const { rec, notices } = draw([prop("q1", "upload:fountain")], {});
    expect(rec.findCalls("drawImage")).toHaveLength(0);
    expect(rec.findCalls("drawText")[0]!.args[0]).toBe("upload:fountain");
    expect(notices).toHaveLength(1);
    expect(notices[0]!.message).toContain("q1");
    expect(notices[0]!.message).toContain("fountain");
  });

  it("draws a placeholder for an empty reference and names the prop", () => {
    const { rec, notices } = draw([prop("q9", "picture:")], { "": entry("x") });
    expect(rec.findCalls("drawImage")).toHaveLength(0);
    expect(rec.findCalls("drawText")).toHaveLength(1);
    expect(notices).toHaveLength(1);
    expect(notices[0]!.message).toContain("q9");
  });

  it("draws a placeholder when the lookup throws", () => {
    const { rec, notices } = draw([prop("q1", "picture:a")], () => {
      throw new Error("boom");
    });
    expect(rec.findCalls("drawText")).toHaveLength(1);
    expect(notices.length).toBeGreaterThanOrEqual(1);
    expect(notices.some((n) => n.message.includes("q1"))).toBe(true);
  });

  it("makes one lookup and one lookup Notice for several props with one reference", () => {
    let calls = 0;
    const lookup: ImageLookup = () => {
      calls++;
      throw new Error("boom");
    };
    const { rec, notices } = draw(
      [prop("q1", "picture:a"), prop("q2", "picture:a"), prop("q3", "picture:a")],
      lookup,
    );
    expect(calls).toBe(1);
    expect(rec.findCalls("drawText")).toHaveLength(3);
    expect(notices.filter((n) => n.message.includes("could not be looked up"))).toHaveLength(1);
  });

  it("ignores blockHeight on a picture kind and draws it flat", () => {
    const { rec } = draw([prop("q1", "picture:a", { blockHeight: 50 })], { a: entry("a") });
    expect(rec.findCalls("drawImage")).toHaveLength(1);
  });

  it("makes no call for a picture prop outside the visible set", () => {
    const rec = new RecordingCanvas();
    const props = [prop("q1", "picture:a")];
    const visible: VisibleSet = {
      roadIds: new Set(),
      blockedAreaIds: new Set(),
      propIds: new Set(),
      placeIds: new Set(),
      roadsTested: 0,
    };
    drawMapLayers(rec, {
      map: mapWith(props),
      style: DEFAULT_STYLE,
      camera,
      visible,
      position: { x: 50, y: 50, headingDegrees: 0 },
      images: { a: entry("a") },
    });
    expect(rec.findCalls("drawImage")).toHaveLength(0);
  });
});

/**
 * The number of pictures drawn in depth bands: a maximal run of `drawImage`
 * calls that follow the same prop placement (the last `translate` before the
 * call) counts as one picture, and must hold 1 to 43 calls.
 */
function pictureRuns(rec: RecordingCanvas): number {
  let placement = "";
  let previous: string | undefined;
  let runs = 0;
  let length = 0;
  for (const call of rec.getCalls()) {
    if (call.op === "translate") placement = JSON.stringify(call.args);
    if (call.op !== "drawImage") continue;
    if (placement !== previous) {
      if (previous !== undefined) expect(length).toBeLessThanOrEqual(43);
      runs++;
      length = 0;
      previous = placement;
    }
    length++;
  }
  if (previous !== undefined) expect(length).toBeLessThanOrEqual(43);
  return runs;
}

describe("picture props on every view", () => {
  it("is an image or a placeholder on the Full_Map, the Minimap and the Tilted_View", () => {
    // Feature: map-views, Property 23 (extended): A Picture_Prop is an image or a placeholder on every view
    // **Validates: Requirements 24.4, 24.5, 24.10, 24.11, 24.17**
    const refArb = fc.constantFrom("a", "b", "c", "");
    const lookupArb = fc.constantFrom<"none" | "some" | "throws" | "bad-size">(
      "none",
      "some",
      "throws",
      "bad-size",
    );
    const position = { x: 40, y: 40, headingDegrees: 0 };
    fc.assert(
      fc.property(
        fc.array(fc.tuple(refArb, fc.constantFrom("picture:", "upload:")), { maxLength: 6 }),
        lookupArb,
        (specs, mode) => {
          const props = specs.map(([ref, prefix], i) =>
            prop(`q${i}`, prefix + ref, { x: 40 + i * 3, blockHeight: 20 }),
          );
          const images: ImageLookup | undefined =
            mode === "none"
              ? undefined
              : mode === "some"
                ? { a: entry("a"), b: entry("b") }
                : mode === "throws"
                  ? () => {
                      throw new Error("boom");
                    }
                  : { a: { ...entry("a"), width: 0 }, b: { ...entry("b"), height: NaN } };
          const base = smallTown();
          const map: EngineMap = { ...base, places: [], blockedAreas: [], props };
          const full = FullMap.create(map, { images });
          const mini = Minimap.create(map, { images });
          const tilted = TiltedView.create(map, { images });
          if (isViewError(full) || isViewError(mini) || isViewError(tilted)) throw new Error("view not built");
          const canvases = [new RecordingCanvas(), new RecordingCanvas(), new RecordingCanvas()];
          const results = [
            full.draw(canvases[0]!, { position }, 0),
            mini.draw(canvases[1]!, { position }, 0),
            tilted.draw(canvases[2]!, { position }, 0),
          ];
          for (const result of results) expect(isViewError(result)).toBe(false);
          canvases.forEach((rec, index) => {
            // On the Tilted_View a picture is drawn in 1 to 43 depth bands, one call per band,
            // so a run of calls with one handle and one prop placement counts as one picture.
            const images = index === 2 ? pictureRuns(rec) : rec.findCalls("drawImage").length;
            const drawn = images + rec.findCalls("drawText").length;
            expect(drawn).toBe(props.length);
            for (const call of rec.findCalls("drawText")) {
              expect(props.map((p) => p.kind)).toContain(call.args[0]);
            }
          });
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("createPictureResolver", () => {
  it("calls the lookup once per reference and gives the Notice once", () => {
    let calls = 0;
    const resolve = createPictureResolver(() => {
      calls++;
      return undefined;
    });
    resolve("a");
    resolve("a");
    expect(calls).toBe(1);
  });
});

describe("drawFlatProps without a resolver", () => {
  it("draws a picture kind as a placeholder", () => {
    const rec = new RecordingCanvas();
    const notices = drawFlatProps(rec, DEFAULT_STYLE, [prop("q1", "picture:a")], 1);
    expect(rec.findCalls("drawText")).toHaveLength(1);
    expect(notices).toHaveLength(1);
  });
});
