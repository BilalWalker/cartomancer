import { describe, expect, it } from "vitest";
import { mountFullMap, mountMinimap, mountTiltedView } from "../../src/views/mount.js";
import { isViewError, type Notice } from "../../src/views/view-errors.js";
import { FakeDestinationEngine, FakeInputCanvas, makeStandIns } from "./helpers/stand-ins.js";
import { smallTown } from "./helpers/small-town.js";

// Requirement 25.13 and 25.14: controls and input while a View has no map.

function waitingEngine(): FakeDestinationEngine {
  const engine = new FakeDestinationEngine();
  engine.map = undefined;
  engine.mapVersion = 0;
  return engine;
}

function fullMapWaiting() {
  const engine = waitingEngine();
  const canvas = new FakeInputCanvas();
  const stand = makeStandIns();
  const notices: Notice[] = [];
  const handle = mountFullMap(canvas, engine, {
    services: stand.services,
    onNotice: (notice) => notices.push(notice),
  });
  if (isViewError(handle)) throw new Error(handle.message);
  return { engine, canvas, stand, notices, handle };
}

describe("controls that need a map, before the first map", () => {
  const controls: Array<[string, (h: ReturnType<typeof fullMapWaiting>["handle"]) => unknown]> = [
    ["select", (h) => h.select({ x: 10, y: 10 })],
    ["selectPlace", (h) => h.selectPlace("p1")],
    ["fit", (h) => h.fit()],
    ["follow", (h) => h.follow()],
    ["pan", (h) => h.pan(5, 5)],
    ["zoomAt", (h) => h.zoomAt({ x: 10, y: 10 }, 2)],
  ];
  for (const [name, call] of controls) {
    it(`${name} returns a plain error that names the control and changes nothing`, () => {
      const { engine, handle, notices } = fullMapWaiting();
      const result = call(handle);
      expect(isViewError(result)).toBe(true);
      if (isViewError(result)) {
        expect(result.message).toContain("No map has been loaded yet");
        expect(result.message).toContain(name);
      }
      expect(engine.destinations).toEqual([]);
      expect(notices).toEqual([]);
    });
  }
});

describe("setting-only controls, before the first map", () => {
  it("check their value as before", () => {
    const engine = waitingEngine();
    const stand = makeStandIns();
    const minimap = mountMinimap(new FakeInputCanvas(), engine, { services: stand.services });
    const tilted = mountTiltedView(new FakeInputCanvas(), engine, { services: makeStandIns().services });
    if (isViewError(minimap) || isViewError(tilted)) throw new Error("mount failed");
    expect(isViewError(minimap.setZoom(5000))).toBe(true);
    expect(isViewError(minimap.setZoom(100))).toBe(true); // above the default limit of 4
    expect(isViewError(minimap.setZoomLimits(5, 2))).toBe(true);
    expect(isViewError(minimap.setZoomLimits(0, 2))).toBe(true);
    expect(isViewError(tilted.setTiltAngle(10))).toBe(true);
    expect(isViewError(tilted.setTiltAngle(Number.NaN))).toBe(true);
    expect(isViewError(tilted.setHeightFactor("building", 101))).toBe(true);
  });

  it("are applied to the View built when the first map arrives", () => {
    const engine = waitingEngine();
    const stand = makeStandIns();
    const minimap = mountMinimap(new FakeInputCanvas(), engine, { services: stand.services });
    const tiltedStand = makeStandIns();
    const tilted = mountTiltedView(new FakeInputCanvas(), engine, { services: tiltedStand.services });
    if (isViewError(minimap) || isViewError(tilted)) throw new Error("mount failed");
    expect(minimap.setZoomLimits(0.2, 50)).toBeUndefined();
    expect(minimap.setZoom(30)).toBeUndefined();
    expect(tilted.setTiltAngle(60)).toBeUndefined();
    expect(tilted.setHeightFactor("building", 3)).toBeUndefined();
    engine.loadMap(smallTown());
    stand.scheduler.runFrame(0);
    tiltedStand.scheduler.runFrame(0);
    // The limits 0.2 to 50 were kept: 40 is accepted, 60 is refused, and 30 was the first zoom.
    expect(minimap.setZoom(40)).toBeUndefined();
    expect(isViewError(minimap.setZoom(60))).toBe(true);
    expect(minimap.setZoomLimits(0.2, 30)).toBeUndefined();
    // The tilt of 60 is held by the built View: a bad value is still refused, a good one accepted.
    expect(tilted.setTiltAngle(65)).toBeUndefined();
    expect(isViewError(tilted.setTiltAngle(80))).toBe(true);
  });
});

describe("Full_Map input, before the first map", () => {
  it("ignores pointer, wheel, touch and key input without an error or a notice", () => {
    const { engine, canvas, stand, notices } = fullMapWaiting();
    const events: Array<[string, Record<string, unknown>]> = [
      ["pointerdown", { clientX: 10, clientY: 10, pointerId: 1 }],
      ["pointerup", { clientX: 10, clientY: 10, pointerId: 1 }],
      ["wheel", { clientX: 10, clientY: 10, deltaY: -100 }],
      ["touchmove", { touches: [{ identifier: 1, clientX: 5, clientY: 5 }] }],
      ["keydown", { key: "ArrowLeft" }],
    ];
    for (const [type, fields] of events) {
      expect(() => canvas.dispatch(type, fields), type).not.toThrow();
    }
    stand.scheduler.runFrame(0);
    expect(notices).toEqual([]);
    expect(engine.destinations).toEqual([]);
  });
});
