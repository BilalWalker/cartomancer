import { describe, expect, it } from "vitest";
import { screenToWorld, worldToScreen } from "../../src/views/camera.js";
import { FullMap } from "../../src/views/full-map.js";
import { RecordingCanvas } from "../../src/views/recording-canvas.js";
import { asImageHandle } from "../../src/views/image-lookup.js";
import { isViewError, type ViewError } from "../../src/views/view-errors.js";
import type { EngineMap } from "../../src/types.js";
import { smallTown } from "./helpers/small-town.js";

function make(options: Parameters<typeof FullMap.create>[1] = {}, map: EngineMap = smallTown()): FullMap {
  const view = FullMap.create(map, options);
  if (isViewError(view)) throw new Error(view.message);
  return view;
}

function emptyMap(): EngineMap {
  return {
    ...smallTown(),
    nodes: [],
    roads: [],
    places: [],
    blockedAreas: [],
    props: [],
    usableRoadIds: new Set(),
  };
}

const position = { x: 10, y: 20, headingDegrees: 30 };
const badNumbers = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

function ok<T>(value: T | ViewError): T {
  if (isViewError(value)) throw new Error(value.message);
  return value;
}

describe("FullMap fit", () => {
  it("starts fitted with a 5% margin and rotation 0", () => {
    // The town extent is x 0..100 (props reach -.. 85), y 0..100: 100 by 100 units.
    const view = make({ width: 400, height: 300 });
    const camera = view.getCamera();
    expect(camera.rotationDegrees).toBe(0);
    expect(camera.centerX).toBeCloseTo(50, 6);
    expect(camera.centerY).toBeCloseTo(50, 6);
    // 300 * 0.9 / 100 = 2.7 (height is the tighter side)
    expect(camera.zoom).toBeCloseTo(2.7, 6);
    const corner = ok(worldToScreen(camera, { x: 0, y: 0 }));
    expect(corner.y).toBeCloseTo(15, 6);
    const far = ok(worldToScreen(camera, { x: 100, y: 100 }));
    expect(far.y).toBeCloseTo(285, 6);
  });

  it("fits again after a pan and zoom", () => {
    const view = make({ width: 400, height: 300 });
    ok(view.pan(30, 10));
    ok(view.zoomAt({ x: 10, y: 10 }, 2));
    ok(view.fit());
    const camera = view.getCamera();
    expect(camera.centerX).toBeCloseTo(50, 6);
    expect(camera.zoom).toBeCloseTo(2.7, 6);
  });

  it("uses an extent of at least one unit when the map is a single point", () => {
    const map = emptyMap();
    map.places = [{ id: "p", name: "Only", category: "x", x: 5, y: 7 }];
    const view = make({ width: 100, height: 100 }, map);
    const camera = view.getCamera();
    expect(camera.centerX).toBeCloseTo(5, 6);
    expect(camera.centerY).toBeCloseTo(7, 6);
    // 100 * 0.9 / 1 = 90, held at the highest zoom of 8
    expect(camera.zoom).toBe(8);
  });

  it("gives a ViewError for an empty map and keeps the camera", () => {
    const view = make({}, emptyMap());
    const before = view.getCamera();
    const result = view.fit();
    expect(isViewError(result)).toBe(true);
    expect(isViewError(result) && result.message).toContain("empty");
    expect(view.getCamera()).toEqual(before);
  });
});

describe("FullMap zoom limits", () => {
  it("has the fit zoom as lowest and 8 as highest by default", () => {
    const view = make({ width: 400, height: 300 });
    const limits = view.getZoomLimits();
    expect(limits.min).toBeCloseTo(2.7, 6);
    expect(limits.max).toBe(8);
  });

  it("clamps a zoom out to the lowest zoom with a notice", () => {
    const view = make({ width: 400, height: 300 });
    const result = ok(view.zoomAt({ x: 200, y: 150 }, 0.5));
    expect(view.getCamera().zoom).toBeCloseTo(2.7, 9);
    expect(result.notices.some((n) => n.message.includes("lowest zoom"))).toBe(true);
  });

  it("clamps a zoom in to 8 exactly with a notice and keeps the anchor", () => {
    const view = make({ width: 400, height: 300 });
    const anchor = { x: 120, y: 90 };
    const before = ok(screenToWorld(view.getCamera(), anchor));
    const result = ok(view.zoomAt(anchor, 100));
    const camera = view.getCamera();
    expect(camera.zoom).toBe(8);
    expect(result.notices.some((n) => n.message.includes("highest zoom"))).toBe(true);
    const after = ok(screenToWorld(camera, anchor));
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it("gives no notice for a zoom that ends inside the limits", () => {
    const view = make({ width: 400, height: 300 });
    const result = ok(view.zoomAt({ x: 200, y: 150 }, 2));
    expect(result.notices).toEqual([]);
    expect(view.getCamera().zoom).toBeCloseTo(5.4, 9);
  });

  it("keeps the world point under the anchor within 0.001", () => {
    const view = make({ width: 400, height: 300 });
    for (const [x, y, f] of [[0, 0, 1.5], [400, 300, 1.2], [10, 290, 1.1], [200, 5, 1.3]] as const) {
      const before = ok(screenToWorld(view.getCamera(), { x, y }));
      ok(view.zoomAt({ x, y }, f));
      const after = ok(screenToWorld(view.getCamera(), { x, y }));
      expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(0.001);
      expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(0.001);
    }
  });

  it("refuses a factor or anchor that is not usable and keeps the camera", () => {
    const view = make();
    const before = view.getCamera();
    for (const f of [0, -1, ...badNumbers]) {
      expect(isViewError(view.zoomAt({ x: 10, y: 10 }, f))).toBe(true);
    }
    for (const bad of badNumbers) {
      expect(isViewError(view.zoomAt({ x: bad, y: 10 }, 1.5))).toBe(true);
      expect(isViewError(view.zoomAt({ x: 10, y: bad }, 1.5))).toBe(true);
    }
    expect(view.getCamera()).toEqual(before);
  });

  it("takes caller limits and refuses bad ones", () => {
    const view = make();
    expect(view.setZoomLimits(1, 20)).toBeUndefined();
    expect(view.getZoomLimits()).toEqual({ min: 1, max: 20 });
    for (const [min, max] of [[0.0009, 4], [1, 1000.5], [3, 3], [4, 3], [Number.NaN, 4]]) {
      expect(isViewError(view.setZoomLimits(min!, max!))).toBe(true);
    }
    expect(view.getZoomLimits()).toEqual({ min: 1, max: 20 });
    ok(view.zoomAt({ x: 10, y: 10 }, 1000));
    expect(view.getCamera().zoom).toBe(20);
  });
});

describe("FullMap pan", () => {
  it("keeps the world point under the pointer", () => {
    const view = make({ width: 400, height: 300 });
    const start = { x: 200, y: 150 };
    const world = ok(screenToWorld(view.getCamera(), start));
    ok(view.pan(7, -5));
    const moved = ok(worldToScreen(view.getCamera(), world));
    expect(moved.x).toBeCloseTo(207, 6);
    expect(moved.y).toBeCloseTo(145, 6);
  });

  it("refuses a distance that is not finite and keeps the camera", () => {
    const view = make();
    const before = view.getCamera();
    for (const bad of badNumbers) {
      expect(isViewError(view.pan(bad, 0))).toBe(true);
      expect(isViewError(view.pan(0, bad))).toBe(true);
    }
    expect(view.getCamera()).toEqual(before);
  });

  it("cannot pan the map out of sight: 20% of the extent stays in view", () => {
    const view = make({ width: 400, height: 300 });
    ok(view.zoomAt({ x: 200, y: 150 }, 3));
    ok(view.pan(1e7, -1e7));
    const camera = view.getCamera();
    const halfW = camera.viewportWidth / camera.zoom / 2;
    const halfH = camera.viewportHeight / camera.zoom / 2;
    // extent x 0..100, y 0..100: 20 units must overlap on each axis
    const overlapX = Math.min(100, camera.centerX + halfW) - Math.max(0, camera.centerX - halfW);
    const overlapY = Math.min(100, camera.centerY + halfH) - Math.max(0, camera.centerY - halfH);
    expect(overlapX).toBeGreaterThanOrEqual(20 - 1e-9);
    expect(overlapY).toBeGreaterThanOrEqual(20 - 1e-9);
    // and it was pushed to the limit, not left in the middle
    expect(overlapX).toBeCloseTo(Math.min(20, halfW * 2), 6);
  });

  it("uses a one-unit extent for the pan limit of a flat map", () => {
    const map = emptyMap();
    map.places = [
      { id: "a", name: "A", category: "x", x: 0, y: 5 },
      { id: "b", name: "B", category: "x", x: 40, y: 5 },
    ];
    const view = make({ width: 400, height: 300 }, map);
    ok(view.pan(-1e7, 1e7));
    const camera = view.getCamera();
    const halfH = camera.viewportHeight / camera.zoom / 2;
    // the extent height is widened to 1 unit around y = 5: 4.5..5.5
    const overlapY = Math.min(5.5, camera.centerY + halfH) - Math.max(4.5, camera.centerY - halfH);
    expect(overlapY).toBeGreaterThanOrEqual(0.2 - 1e-9);
    expect(overlapY).toBeLessThanOrEqual(1);
  });
});

describe("FullMap follow", () => {
  it("centres on the player and keeps following until a pan", () => {
    const view = make({ width: 400, height: 300 });
    const canvas = new RecordingCanvas();
    view.draw(canvas, { position }, 0);
    expect(view.isFollowing()).toBe(false);
    ok(view.follow());
    expect(view.getCamera().centerX).toBe(10);
    expect(view.getCamera().centerY).toBe(20);
    view.draw(canvas, { position: { x: 60, y: 40, headingDegrees: 0 } }, 16);
    expect(view.getCamera().centerX).toBe(60);
    expect(view.getCamera().centerY).toBe(40);
    expect(view.isFollowing()).toBe(true);
    ok(view.pan(5, 5));
    expect(view.isFollowing()).toBe(false);
    view.draw(canvas, { position: { x: 70, y: 40, headingDegrees: 0 } }, 32);
    expect(view.getCamera().centerX).not.toBe(70);
  });

  it("follows from the next draw when no position is known yet", () => {
    const view = make();
    ok(view.follow());
    view.draw(new RecordingCanvas(), { position }, 0);
    expect(view.getCamera().centerX).toBe(10);
  });
});

describe("FullMap resize", () => {
  it("keeps the centre and sets the new viewport", () => {
    const view = make({ width: 400, height: 300 });
    ok(view.pan(20, 10));
    const before = view.getCamera();
    expect(view.resize(200, 500)).toBeUndefined();
    const after = view.getCamera();
    expect(after.centerX).toBe(before.centerX);
    expect(after.centerY).toBe(before.centerY);
    expect(after.viewportWidth).toBe(200);
    expect(after.viewportHeight).toBe(500);
  });

  it("refuses a size outside 1 to 16384 and keeps the viewport", () => {
    const view = make({ width: 400, height: 300 });
    for (const [w, h] of [[0, 300], [400, 0.5], [16385, 300], [400, 16385], [Number.NaN, 300]]) {
      expect(isViewError(view.resize(w!, h!))).toBe(true);
    }
    expect(view.resize(1, 16384)).toBeUndefined();
    expect(isViewError(FullMap.create(smallTown(), { width: 0 }))).toBe(true);
  });
});

describe("FullMap applyCommand", () => {
  it("handles pan commands and fractions of the viewport", () => {
    const view = make({ width: 400, height: 300 });
    const start = ok(screenToWorld(view.getCamera(), { x: 200, y: 150 }));
    ok(view.applyCommand({ type: "panFraction", fx: 0.1, fy: -0.1 }));
    const moved = ok(worldToScreen(view.getCamera(), start));
    expect(moved.x).toBeCloseTo(240, 6);
    expect(moved.y).toBeCloseTo(120, 6);
    ok(view.applyCommand({ type: "pan", dx: -10, dy: 0 }));
    const again = ok(worldToScreen(view.getCamera(), start));
    expect(again.x).toBeCloseTo(230, 6);
  });

  it("zooms about the viewport centre for a null anchor", () => {
    const view = make({ width: 400, height: 300 });
    const centre = view.getCamera();
    ok(view.applyCommand({ type: "zoom", anchor: null, factor: 1.25 }));
    const after = view.getCamera();
    expect(after.zoom).toBeCloseTo(centre.zoom * 1.25, 9);
    expect(after.centerX).toBeCloseTo(centre.centerX, 9);
    expect(after.centerY).toBeCloseTo(centre.centerY, 9);
  });

  it("zooms at a given anchor, fits and follows", () => {
    const view = make({ width: 400, height: 300 });
    ok(view.applyCommand({ type: "zoom", anchor: { x: 0, y: 0 }, factor: 2 }));
    expect(view.getCamera().zoom).toBeCloseTo(5.4, 9);
    ok(view.applyCommand({ type: "fit" }));
    expect(view.getCamera().zoom).toBeCloseTo(2.7, 9);
    ok(view.applyCommand({ type: "follow" }));
    expect(view.isFollowing()).toBe(true);
  });

  it("returns a ViewError for a bad fraction or factor and changes nothing for a selection", () => {
    const view = make();
    const before = view.getCamera();
    expect(isViewError(view.applyCommand({ type: "panFraction", fx: Number.NaN, fy: 0 }))).toBe(true);
    expect(isViewError(view.applyCommand({ type: "zoom", anchor: null, factor: 0 }))).toBe(true);
    expect(ok(view.applyCommand({ type: "select", x: 1, y: 1 })).notices).toEqual([]);
    expect(view.getCamera()).toEqual(before);
  });
});

describe("FullMap draw", () => {
  it("draws the fixture, and a second unchanged draw makes zero calls", () => {
    const view = make();
    const canvas = new RecordingCanvas();
    const first = ok(view.draw(canvas, { position }, 0));
    expect(first.drew).toBe(true);
    expect(canvas.getCalls().length).toBeGreaterThan(0);
    const second = new RecordingCanvas();
    const result = ok(view.draw(second, { position }, 16));
    expect(result.drew).toBe(false);
    expect(second.getCalls().length).toBe(0);
  });

  it("draws again after a pan, a zoom or a resize", () => {
    const view = make();
    view.draw(new RecordingCanvas(), { position }, 0);
    ok(view.zoomAt({ x: 10, y: 10 }, 1.5));
    expect(ok(view.draw(new RecordingCanvas(), { position }, 16)).drew).toBe(true);
    ok(view.pan(10, 0));
    expect(ok(view.draw(new RecordingCanvas(), { position }, 32)).drew).toBe(true);
    view.resize(300, 300);
    expect(ok(view.draw(new RecordingCanvas(), { position }, 48)).drew).toBe(true);
    expect(ok(view.draw(new RecordingCanvas(), { position }, 64)).drew).toBe(false);
  });

  it("refuses a bad timestamp or position and keeps the camera", () => {
    const view = make();
    const before = view.getCamera();
    expect(isViewError(view.draw(new RecordingCanvas(), { position }, Number.NaN))).toBe(true);
    expect(
      isViewError(view.draw(new RecordingCanvas(), { position: { x: Number.NaN, y: 0, headingDegrees: 0 } }, 0)),
    ).toBe(true);
    expect(view.getCamera()).toEqual(before);
  });

  it("draws a picture prop from the images lookup", () => {
    const handle = asImageHandle({ name: "statue" });
    const view = make({ images: { statue: { image: handle, width: 20, height: 12 } } });
    const canvas = new RecordingCanvas();
    ok(view.draw(canvas, { position }, 0));
    const images = canvas.findCalls("drawImage");
    expect(images).toHaveLength(1);
    expect(images[0]!.args[0]).toBe(handle);
  });

  it("draws the picture after setImages", () => {
    const handle = asImageHandle({ name: "statue" });
    const view = make();
    ok(view.draw(new RecordingCanvas(), { position }, 0));
    view.setImages({ statue: { image: handle, width: 20, height: 12 } });
    const canvas = new RecordingCanvas();
    expect(ok(view.draw(canvas, { position }, 16)).drew).toBe(true);
    expect(canvas.findCalls("drawImage")).toHaveLength(1);
  });

  it("keeps the old map when setMap is given a coordinate that is not finite", () => {
    const view = make();
    const bad = smallTown();
    bad.nodes[0] = { id: "n1", x: Number.NaN, y: 0 };
    expect(isViewError(view.setMap(bad))).toBe(true);
    expect(view.setMap(smallTown())).toBeUndefined();
  });

  it("reports a notice for an empty map", () => {
    expect(make({}, emptyMap()).getNotices().length).toBeGreaterThan(0);
  });
});
