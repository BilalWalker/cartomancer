import { afterEach, describe, expect, it } from "vitest";
import { Engine } from "../../src/engine.js";
import {
  mountMinimap,
  type MinimapHandle,
  type MinimapMountOptions,
} from "../../src/views/mount.js";
import { isViewError, type Notice, type ViewError } from "../../src/views/view-errors.js";
import { FakeCanvas, FakeEngine, makeStandIns, type StandIns } from "./helpers/stand-ins.js";

interface Mounted {
  canvas: FakeCanvas;
  engine: FakeEngine;
  stand: StandIns;
  handle: MinimapHandle;
  notices: Notice[];
}

function mount(
  options: MinimapMountOptions = {},
  setup: { canvas?: FakeCanvas; engine?: FakeEngine; stand?: StandIns } = {},
): Mounted {
  const canvas = setup.canvas ?? new FakeCanvas();
  const engine = setup.engine ?? new FakeEngine();
  const stand = setup.stand ?? makeStandIns();
  const notices: Notice[] = [];
  const handle = mountMinimap(canvas, engine, {
    services: stand.services,
    onNotice: (notice) => notices.push(notice),
    ...options,
  });
  if (isViewError(handle)) throw new Error(handle.message);
  return { canvas, engine, stand, handle, notices };
}

/** Mounts with options that must be refused and returns the error. */
function refused(
  options: unknown,
  setup: { canvas?: unknown; engine?: unknown; stand?: StandIns } = {},
): { error: ViewError; canvas: FakeCanvas; stand: StandIns } {
  const canvas = "canvas" in setup ? (setup.canvas as FakeCanvas) : new FakeCanvas();
  const stand = setup.stand ?? makeStandIns();
  const engine = "engine" in setup ? setup.engine : new FakeEngine();
  const merged =
    typeof options === "object" && options !== null && !Array.isArray(options)
      ? { services: stand.services, ...(options as object) }
      : options;
  const result = mountMinimap(canvas as never, engine as never, merged as never);
  if (!isViewError(result)) throw new Error("the mount was expected to be refused");
  return { error: result, canvas, stand };
}

function expectNothingLeft(canvas: FakeCanvas, stand: StandIns): void {
  expect(stand.scheduler.requested).toBe(0);
  expect(stand.scheduler.pending).toBe(0);
  expect(stand.observers.created).toBe(0);
  expect(stand.motion.added).toBe(0);
  expect(canvas.listenerAdds).toBe(0);
  expect(canvas.attributes.size).toBe(0);
  expect(canvas.width).toBe(300);
  expect(canvas.height).toBe(150);
}

describe("mountMinimap: a valid mount", () => {
  it("sizes the canvas, describes it, observes it and requests one frame", () => {
    const stand = makeStandIns({ pixelRatio: 2 });
    const { canvas } = mount({}, { stand });
    expect(canvas.width).toBe(400);
    expect(canvas.height).toBe(400);
    expect(canvas.attributes.get("aria-label")).toBe("Minimap");
    expect(stand.observers.created).toBe(1);
    expect(stand.observers.observed).toBe(1);
    expect(stand.motion.added).toBe(1);
    expect(stand.scheduler.requested).toBe(1);
    expect(stand.scheduler.pending).toBe(1);
  });

  it("returns a handle with destroy and the minimap controls", () => {
    const { handle } = mount();
    expect(typeof handle.destroy).toBe("function");
    expect(typeof handle.setZoom).toBe("function");
    expect(typeof handle.setZoomLimits).toBe("function");
    expect(typeof handle.resize).toBe("function");
  });

  it("reports the notices found in the map at mount", () => {
    const engine = new FakeEngine();
    engine.map = { ...engine.map!, roads: [], usableRoadIds: new Set() };
    const { notices } = mount({}, { engine });
    expect(notices.length).toBeGreaterThan(0);
  });

  it("works with a real Engine", () => {
    const engine = new Engine();
    const text = JSON.stringify({
      formatVersion: 1,
      nodes: [
        { id: "a", x: 0, y: 0 },
        { id: "b", x: 100, y: 0 },
      ],
      roads: [{ id: "r1", fromNodeId: "a", toNodeId: "b", width: 6, kind: "main" }],
      places: [{ id: "p1", name: "Bank", category: "shop", x: 100, y: 0 }],
      blockedAreas: [],
      props: [],
      style: { colors: {}, lineStyles: {} },
    });
    expect("map" in engine.loadMap(text)).toBe(true);
    engine.feedPosition({ x: 0, y: 0, headingDegrees: 0 }, 0);
    engine.setDestination({ placeId: "p1" });
    const canvas = new FakeCanvas();
    const stand = makeStandIns();
    const handle = mountMinimap(canvas, engine, { services: stand.services });
    if (isViewError(handle)) throw new Error(handle.message);
    const afterMount = canvas.context.calls;
    stand.scheduler.runFrame(0);
    expect(canvas.context.calls).toBeGreaterThan(afterMount + 10);
    handle.destroy();
  });
});

describe("mountMinimap: the frame loop", () => {
  it("reads the position, the remaining route and the guidance on every frame", () => {
    const { engine, stand } = mount();
    for (let frame = 0; frame < 3; frame++) stand.scheduler.runFrame(frame * 16);
    expect(engine.reads.position).toBe(3);
    expect(engine.reads.remainingRoute).toBe(3);
    expect(engine.reads.sentence).toBe(3);
  });

  it("keeps exactly one pending frame request", () => {
    const { stand } = mount();
    for (let frame = 0; frame < 4; frame++) {
      expect(stand.scheduler.pending).toBe(1);
      stand.scheduler.runFrame(frame * 16);
    }
    expect(stand.scheduler.pending).toBe(1);
    expect(stand.scheduler.requested).toBe(5);
  });

  it("draws the first frame, and no more calls while nothing changes", () => {
    const { canvas, stand } = mount();
    const afterMount = canvas.context.calls;
    stand.scheduler.runFrame(0);
    const afterFirst = canvas.context.calls;
    expect(afterFirst).toBeGreaterThan(afterMount + 10);
    stand.scheduler.runFrame(16);
    stand.scheduler.runFrame(32);
    expect(canvas.context.calls).toBe(afterFirst);
  });

  it("draws again when the engine position changes", () => {
    const { canvas, engine, stand } = mount();
    stand.scheduler.runFrame(0);
    const before = canvas.context.calls;
    engine.position = { x: 40, y: 20, headingDegrees: 30 };
    stand.scheduler.runFrame(16);
    expect(canvas.context.calls).toBeGreaterThan(before);
  });

  it("keeps the frame loop alive when no position is known yet", () => {
    const engine = new FakeEngine();
    engine.position = undefined;
    const { canvas, stand } = mount({}, { engine });
    const afterMount = canvas.context.calls;
    stand.scheduler.runFrame(0);
    expect(canvas.context.calls).toBe(afterMount);
    expect(stand.scheduler.pending).toBe(1);
    engine.position = { x: 10, y: 20, headingDegrees: 30 };
    stand.scheduler.runFrame(16);
    expect(canvas.context.calls).toBeGreaterThan(afterMount);
  });

  it("passes the guidance sentence on when it changes, not on every frame", () => {
    const heard: string[] = [];
    const { engine, stand } = mount({ onGuidance: (sentence) => heard.push(sentence) });
    stand.scheduler.runFrame(0);
    stand.scheduler.runFrame(16);
    engine.sentence = "Turn left in 20 metres.";
    stand.scheduler.runFrame(32);
    expect(heard).toEqual(["Go straight on.", "Turn left in 20 metres."]);
  });

  it("keeps the loop alive when a callback of the application throws", () => {
    const { stand, engine } = mount({
      onNotice: () => {
        throw new Error("application problem");
      },
    });
    engine.position = { x: Number.NaN, y: 0, headingDegrees: 0 };
    stand.scheduler.runFrame(0);
    expect(stand.scheduler.pending).toBe(1);
  });

  it("reports a position that cannot be drawn once, then keeps going", () => {
    const { stand, engine, notices } = mount();
    const before = notices.length;
    engine.position = { x: Number.NaN, y: 0, headingDegrees: 0 };
    stand.scheduler.runFrame(0);
    stand.scheduler.runFrame(16);
    expect(notices.length - before).toBe(1);
    expect(stand.scheduler.pending).toBe(1);
  });

  it("uses a reduced-motion change from the next frame", () => {
    const jump = { x: 90, y: 20, headingDegrees: 120 };
    const calm = mount();
    calm.stand.scheduler.runFrame(0);
    calm.stand.motion.set(true);
    calm.engine.position = jump;
    calm.stand.scheduler.runFrame(16);
    const afterJump = calm.canvas.context.calls;
    calm.stand.scheduler.runFrame(32);
    calm.stand.scheduler.runFrame(48);
    // The camera jumped in the same frame, so nothing is left to move.
    expect(calm.canvas.context.calls).toBe(afterJump);

    const smooth = mount();
    smooth.stand.scheduler.runFrame(0);
    smooth.engine.position = jump;
    smooth.stand.scheduler.runFrame(16);
    const smoothAfterJump = smooth.canvas.context.calls;
    smooth.stand.scheduler.runFrame(32);
    // Without reduced motion the camera is still moving, so the next frame draws.
    expect(smooth.canvas.context.calls).toBeGreaterThan(smoothAfterJump);
  });

  it("starts with the reduced-motion setting the host reports", () => {
    const stand = makeStandIns({ reducedMotion: true });
    const { canvas, engine } = mount({}, { stand });
    stand.scheduler.runFrame(0);
    engine.position = { x: 90, y: 20, headingDegrees: 120 };
    stand.scheduler.runFrame(16);
    const calls = canvas.context.calls;
    stand.scheduler.runFrame(32);
    expect(canvas.context.calls).toBe(calls);
  });

  it("draws a picture from the images option, and passes it on without loading it", () => {
    const image = { name: "loaded by the application" };
    const { canvas, stand } = mount({ images: { statue: { image: image as never, width: 10, height: 10 } } });
    stand.scheduler.runFrame(0);
    expect(canvas.context.images).toBe(1);
  });

  it("accepts a function as the images option", () => {
    const asked: string[] = [];
    const lookup = (ref: string) => {
      asked.push(ref);
      return { image: {} as never, width: 10, height: 10 };
    };
    const { canvas, stand } = mount({ images: lookup });
    stand.scheduler.runFrame(0);
    expect(asked).toContain("statue");
    expect(canvas.context.images).toBe(1);
  });
});

describe("mountMinimap: the controls", () => {
  it("sets the zoom and the zoom limits", () => {
    const { handle } = mount();
    expect(handle.setZoomLimits(0.1, 8)).toBeUndefined();
    expect(handle.setZoom(8)).toBeUndefined();
    expect(handle.setZoom(0.1)).toBeUndefined();
  });

  it("returns a plain error for a zoom outside the limits", () => {
    const { handle } = mount();
    const error = handle.setZoom(9);
    expect(isViewError(error)).toBe(true);
    expect(error?.message).toContain("zoom");
    expect(error?.message).toContain("0.5 to 4");
  });

  it("reads the CSS size again on resize()", () => {
    const stand = makeStandIns({ pixelRatio: 2 });
    const { canvas, handle } = mount({}, { stand });
    canvas.clientWidth = 150;
    canvas.clientHeight = 120;
    expect(handle.resize()).toBeUndefined();
    expect(canvas.width).toBe(300);
    expect(canvas.height).toBe(240);
  });

  it("follows the resize observer", () => {
    const { canvas, stand } = mount();
    canvas.clientWidth = 90;
    canvas.clientHeight = 80;
    stand.observers.fire();
    expect(canvas.width).toBe(90);
    expect(canvas.height).toBe(80);
  });

  it("keeps the old size and reports a notice when the CSS size becomes 0", () => {
    const { canvas, stand, notices } = mount();
    canvas.clientWidth = 0;
    stand.observers.fire();
    expect(canvas.width).toBe(200);
    expect(notices.some((n) => n.message.includes("cssWidth"))).toBe(true);
  });
});

describe("mountMinimap: destroy", () => {
  it("cancels the frame, removes every listener and disconnects every observer", () => {
    const { canvas, stand, handle } = mount();
    stand.scheduler.runFrame(0);
    handle.destroy();
    expect(stand.scheduler.pending).toBe(0);
    expect(stand.scheduler.cancelled).toBe(1);
    expect(canvas.openListeners).toBe(0);
    expect(canvas.listenerRemoves).toBe(canvas.listenerAdds);
    expect(canvas.attributes.size).toBe(0);
    expect(stand.observers.active).toBe(0);
    expect(stand.observers.disconnected).toBe(stand.observers.created);
    expect(stand.motion.open).toBe(0);
    expect(stand.motion.removed).toBe(stand.motion.added);
  });

  it("does nothing on a second call and returns no error", () => {
    const { canvas, stand, handle } = mount();
    handle.destroy();
    const cancelled = stand.scheduler.cancelled;
    const removes = canvas.listenerRemoves;
    const disconnected = stand.observers.disconnected;
    expect(handle.destroy()).toBeUndefined();
    expect(handle.destroy()).toBeUndefined();
    expect(stand.scheduler.cancelled).toBe(cancelled);
    expect(canvas.listenerRemoves).toBe(removes);
    expect(stand.observers.disconnected).toBe(disconnected);
  });

  it("makes every control return a destroyed error", () => {
    const { handle } = mount();
    handle.destroy();
    for (const result of [handle.setZoom(1), handle.setZoomLimits(0.5, 4), handle.resize()]) {
      expect(isViewError(result)).toBe(true);
      expect(result?.message).toContain("destroyed");
    }
  });

  it("makes no more engine reads or drawing after destroy", () => {
    const { engine, canvas, stand, handle } = mount();
    stand.scheduler.runFrame(0);
    handle.destroy();
    const reads = engine.reads.position;
    const calls = canvas.context.calls;
    stand.scheduler.runFrame(16);
    stand.observers.fire();
    stand.motion.set(true);
    expect(engine.reads.position).toBe(reads);
    expect(canvas.context.calls).toBe(calls);
  });

  it("frees the canvas so it can be mounted again", () => {
    const canvas = new FakeCanvas();
    const first = mount({}, { canvas });
    first.handle.destroy();
    const second = mount({}, { canvas });
    expect(second.stand.scheduler.pending).toBe(1);
  });
});

describe("mountMinimap: refused input leaves nothing behind", () => {
  const plain = (error: ViewError): void => {
    expect(error.message).not.toMatch(/undefined|NaN|Infinity|\bat |Error:|stack/);
  };

  it("refuses a first argument that is not a canvas element", () => {
    for (const bad of [null, undefined, 5, "canvas", {}, { getContext: () => null }]) {
      const stand = makeStandIns();
      const { error } = refused({}, { canvas: bad, stand });
      expect(error.message).toContain("canvas");
      expect(error.message).toContain("canvas element");
      plain(error);
      expect(stand.scheduler.requested).toBe(0);
      expect(stand.observers.created).toBe(0);
    }
  });

  it("refuses an engine without a function the view reads and names it", () => {
    for (const name of ["getMap", "getPosition", "getRemainingRoute", "getGuidanceSentence"]) {
      const engine = Object.create(FakeEngine.prototype) as Record<string, unknown>;
      Object.assign(engine, new FakeEngine());
      engine[name] = undefined;
      const canvas = new FakeCanvas();
      const stand = makeStandIns();
      const { error } = refused({}, { engine, canvas, stand });
      expect(error.message).toContain(`"${name}"`);
      expect(error.message).toContain("engine");
      plain(error);
      expectNothingLeft(canvas, stand);
    }
    for (const bad of [null, undefined, 3]) {
      const { error } = refused({}, { engine: bad });
      expect(error.field).toBe("engine");
    }
  });

  it("refuses an engine that has no map loaded", () => {
    const engine = new FakeEngine();
    engine.map = undefined;
    const canvas = new FakeCanvas();
    const stand = makeStandIns();
    const { error } = refused({}, { engine, canvas, stand });
    expect(error.message).toContain("no map");
    plain(error);
    expectNothingLeft(canvas, stand);
  });

  it("refuses options that are not an object", () => {
    for (const bad of [null, 5, "options", [1]]) {
      const canvas = new FakeCanvas();
      const stand = makeStandIns();
      const { error } = refused(bad, { canvas, stand });
      expect(error.message).toContain('"options"');
      expect(error.message).toContain("object");
      plain(error);
      expectNothingLeft(canvas, stand);
    }
  });

  const badNumbers = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

  it("refuses a zoom or zoom limit outside 0.001 to 1000, with boundaries", () => {
    for (const option of ["zoom", "minZoom", "maxZoom"] as const) {
      for (const bad of [0.0009, 0, -1, 1000.001, 1001, ...badNumbers]) {
        const canvas = new FakeCanvas();
        const stand = makeStandIns();
        const { error } = refused({ [option]: bad }, { canvas, stand });
        expect(error.message).toContain(`"${option}"`);
        expect(error.message).toContain("0.001 to 1000");
        plain(error);
        expectNothingLeft(canvas, stand);
      }
    }
  });

  it("accepts the zoom and the zoom limits at the range ends", () => {
    mount({ zoom: 0.001 });
    mount({ zoom: 1000 });
    mount({ minZoom: 0.001, maxZoom: 1000 });
    mount({ minZoom: 0.001 });
    mount({ maxZoom: 1000 });
  });

  it("refuses a minimum zoom that is not below the maximum, and a zoom outside explicit limits", () => {
    const first = refused({ minZoom: 2, maxZoom: 2 });
    expect(first.error.message).toContain('"minZoom"');
    const second = refused({ minZoom: 1, maxZoom: 2, zoom: 3 });
    expect(second.error.message).toContain('"zoom"');
    expect(second.error.message).toContain("1 to 2");
    expectNothingLeft(second.canvas, second.stand);
  });

  it("refuses a smoothing duration outside 1 to 5000 ms, with boundaries", () => {
    for (const bad of [0.999, 0, 5000.001, ...badNumbers]) {
      const canvas = new FakeCanvas();
      const stand = makeStandIns();
      const { error } = refused({ smoothingDurationMs: bad }, { canvas, stand });
      expect(error.message).toContain("1 to 5000");
      plain(error);
      expectNothingLeft(canvas, stand);
    }
    mount({ smoothingDurationMs: 1 });
    mount({ smoothingDurationMs: 5000 });
  });

  it("refuses an images option that is not an object or a function", () => {
    for (const bad of [null, 5, "pictures", true, [1]]) {
      const canvas = new FakeCanvas();
      const stand = makeStandIns();
      const { error } = refused({ images: bad }, { canvas, stand });
      expect(error.field).toBe("images");
      expect(error.message).toContain('"images"');
      expect(error.message).toContain("object or a function");
      plain(error);
      expectNothingLeft(canvas, stand);
    }
  });

  it("refuses an images entry with a size that is not above 0, naming the picture", () => {
    const sizes = [0, -1, Number.NaN, Number.POSITIVE_INFINITY, "10", undefined];
    for (const bad of sizes) {
      for (const which of ["width", "height"]) {
        const entry = { image: {}, width: 10, height: 10, [which]: bad };
        const canvas = new FakeCanvas();
        const stand = makeStandIns();
        const { error } = refused({ images: { good: { image: {}, width: 1, height: 1 }, statue: entry } }, { canvas, stand });
        expect(error.message).toContain('"images"');
        expect(error.message).toContain('"statue"');
        expect(error.message).not.toContain('"good"');
        plain(error);
        expectNothingLeft(canvas, stand);
      }
    }
  });

  it("accepts an images entry of the smallest usable size and an absent entry", () => {
    mount({ images: { tiny: { image: {} as never, width: 0.0001, height: 0.0001 }, gone: undefined } });
  });

  it("refuses a canvas that already has a view, and keeps the first one working", () => {
    const canvas = new FakeCanvas();
    const first = mount({}, { canvas });
    const stand = makeStandIns();
    const { error } = refused({}, { canvas, stand });
    expect(error.message).toContain("already has a view");
    plain(error);
    expect(stand.scheduler.requested).toBe(0);
    expect(stand.observers.created).toBe(0);
    const afterMount = canvas.context.calls;
    first.stand.scheduler.runFrame(0);
    expect(canvas.context.calls).toBeGreaterThan(afterMount);
  });

  it("refuses a canvas with no 2D drawing", () => {
    const canvas = new FakeCanvas();
    canvas.contextAvailable = false;
    const stand = makeStandIns();
    const { error } = refused({}, { canvas, stand });
    expect(error.message).toContain("2D");
    expectNothingLeft(canvas, stand);
  });

  it("refuses a canvas with a CSS size of 0 and leaves its pixel size alone", () => {
    for (const [w, h] of [[0, 100], [100, 0], [Number.NaN, 100]]) {
      const canvas = new FakeCanvas(w, h);
      const stand = makeStandIns();
      const { error } = refused({}, { canvas, stand });
      expect(error.message).toMatch(/size/);
      plain(error);
      expectNothingLeft(canvas, stand);
    }
  });

  it("refuses a service that is not a function", () => {
    const canvas = new FakeCanvas();
    const stand = makeStandIns();
    const { error } = refused({ services: { ...stand.services, requestFrame: 5 } }, { canvas, stand });
    expect(error.message).toContain('"requestFrame"');
    expectNothingLeft(canvas, stand);
  });

  it("refuses to mount in a host with no animation frames when none were given", () => {
    const canvas = new FakeCanvas();
    const stand = makeStandIns();
    const { error } = refused({ services: {} }, { canvas, stand });
    expect(error.message).toContain("requestFrame");
    expectNothingLeft(canvas, stand);
  });

  it("leaves nothing behind when a service fails in the middle of mounting", () => {
    const canvas = new FakeCanvas();
    const stand = makeStandIns();
    const failing = {
      ...stand.services,
      matchReducedMotion: () => {
        throw new Error("no query");
      },
    };
    const { error } = refused({ services: failing }, { canvas, stand });
    expect(error.message).toContain("failed");
    plain(error);
    expect(stand.scheduler.pending).toBe(0);
    expect(canvas.openListeners).toBe(0);
    expect(canvas.attributes.size).toBe(0);
    expect(stand.observers.active).toBe(0);
    expect(canvas.width).toBe(300);
    expect(canvas.height).toBe(150);
    // The canvas is free again.
    mount({}, { canvas });
  });
});

describe("mountMinimap: default services", () => {
  const host = globalThis as unknown as Record<string, unknown>;
  const saved: Record<string, unknown> = {};
  const names = ["requestAnimationFrame", "cancelAnimationFrame", "devicePixelRatio"];

  afterEach(() => {
    for (const name of names) {
      if (saved[name] === undefined) delete host[name];
      else host[name] = saved[name];
    }
  });

  it("uses the real animation frame and pixel ratio globals when no service is given", () => {
    for (const name of names) saved[name] = host[name];
    const requested: Array<(timestampMs: number) => void> = [];
    const cancelled: number[] = [];
    host.requestAnimationFrame = (callback: (timestampMs: number) => void) => requested.push(callback);
    host.cancelAnimationFrame = (handle: number) => cancelled.push(handle);
    host.devicePixelRatio = 2;
    const canvas = new FakeCanvas();
    const handle = mountMinimap(canvas, new FakeEngine());
    if (isViewError(handle)) throw new Error(handle.message);
    expect(requested).toHaveLength(1);
    expect(canvas.width).toBe(400);
    const afterMount = canvas.context.calls;
    requested[0]!(0);
    expect(requested).toHaveLength(2);
    expect(canvas.context.calls).toBeGreaterThan(afterMount + 10);
    handle.destroy();
    expect(cancelled).toEqual([2]);
  });
});
