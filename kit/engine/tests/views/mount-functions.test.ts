import { afterEach, describe, expect, it } from "vitest";
import { Engine } from "../../src/engine.js";
import {
  mountFullMap,
  mountMinimap,
  type FullMapHandle,
  type FullMapMountOptions,
  type MinimapHandle,
  type MinimapMountOptions,
} from "../../src/views/mount.js";
import { isViewError, type Notice, type ViewError } from "../../src/views/view-errors.js";
import {
  FakeCanvas,
  FakeDestinationEngine,
  FakeEngine,
  FakeInputCanvas,
  makeStandIns,
  type StandIns,
} from "./helpers/stand-ins.js";

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

// ---------------------------------------------------------------------------
// mountFullMap

class FakeLiveRegion {
  textContent: string | null = null;
  readonly attributes = new Map<string, string>();
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }
}

interface MountedFull {
  canvas: FakeInputCanvas;
  engine: FakeDestinationEngine;
  stand: StandIns;
  handle: FullMapHandle;
  region: FakeLiveRegion;
  notices: Notice[];
}

function mountFull(
  options: FullMapMountOptions = {},
  setup: { canvas?: FakeInputCanvas; engine?: FakeDestinationEngine; stand?: StandIns } = {},
): MountedFull {
  const canvas = setup.canvas ?? new FakeInputCanvas();
  const engine = setup.engine ?? new FakeDestinationEngine();
  const stand = setup.stand ?? makeStandIns();
  const region = new FakeLiveRegion();
  const notices: Notice[] = [];
  const handle = mountFullMap(canvas, engine, {
    services: stand.services,
    liveRegion: region,
    onNotice: (notice) => notices.push(notice),
    ...options,
  });
  if (isViewError(handle)) throw new Error(handle.message);
  return { canvas, engine, stand, handle, region, notices };
}

const INPUT_EVENT_TYPES = [
  "pointerdown",
  "pointermove",
  "pointerup",
  "pointercancel",
  "wheel",
  "touchstart",
  "touchmove",
  "touchend",
  "touchcancel",
  "keydown",
];

describe("mountFullMap: a valid mount", () => {
  it("sizes and describes the canvas, binds the input and requests one frame", () => {
    const { canvas, stand } = mountFull();
    expect(canvas.width).toBe(200);
    expect(canvas.attributes.get("aria-label")).toBe("Full map");
    expect(canvas.attributes.get("tabindex")).toBe("0");
    expect(canvas.style.touchAction).toBe("none");
    for (const type of INPUT_EVENT_TYPES) expect(canvas.listenersOf(type)).toBe(1);
    expect(stand.scheduler.pending).toBe(1);
  });

  it("returns a handle with the full map controls", () => {
    const { handle } = mountFull();
    for (const name of ["pan", "zoomAt", "fit", "follow", "select", "selectPlace", "destroy"] as const) {
      expect(typeof handle[name]).toBe("function");
    }
  });

  it("makes the live region polite and shows the guidance sentence once per change", () => {
    const { region, engine, stand } = mountFull();
    expect(region.attributes.get("aria-live")).toBe("polite");
    stand.scheduler.runFrame(0);
    expect(region.textContent).toBe("Go straight on.");
    engine.sentence = "Turn left.";
    stand.scheduler.runFrame(16);
    expect(region.textContent).toBe("Turn left.");
  });

  it("draws a frame and reads the engine on each frame", () => {
    const { canvas, engine, stand } = mountFull();
    const afterMount = canvas.context.calls;
    stand.scheduler.runFrame(0);
    expect(canvas.context.calls).toBeGreaterThan(afterMount + 10);
    expect(engine.reads.position).toBe(1);
  });

  it("works with a real Engine as the destination target", () => {
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
    const canvas = new FakeInputCanvas();
    const stand = makeStandIns();
    const handle = mountFullMap(canvas, engine, { services: stand.services });
    if (isViewError(handle)) throw new Error(handle.message);
    const result = handle.selectPlace("p1");
    expect(isViewError(result)).toBe(false);
    expect(engine.getRemainingRoute()).toBeDefined();
    handle.destroy();
  });
});

describe("mountFullMap: input is bound", () => {
  it("sends the place keys to the view and announces them in the live region", () => {
    const { canvas, engine, region } = mountFull();
    expect(canvas.dispatch("keydown", { key: "]" })).toBe(true);
    expect(region.textContent).toContain("Focused place: Bakery");
    canvas.dispatch("keydown", { key: "Enter" });
    expect(engine.destinations).toEqual([{ placeId: "p1" }]);
    expect(region.textContent).toBe("There is no way to get there.");
  });

  it("announces that no place is marked when Enter is pressed first", () => {
    const { canvas, engine, region } = mountFull();
    canvas.dispatch("keydown", { key: "Enter" });
    expect(engine.destinations).toEqual([]);
    expect(region.textContent).toContain("No place is selected");
  });

  it("lets the browser handle a key the map does not use", () => {
    const { canvas } = mountFull();
    expect(canvas.dispatch("keydown", { key: "q" })).toBe(false);
  });

  it("moves the camera with a key, so the next frame is drawn again", () => {
    const { canvas, stand } = mountFull();
    stand.scheduler.runFrame(0);
    stand.scheduler.runFrame(16);
    const still = canvas.context.calls;
    canvas.dispatch("keydown", { key: "+" });
    stand.scheduler.runFrame(32);
    expect(canvas.context.calls).toBeGreaterThan(still);
  });

  it("stops the page from scrolling on a wheel event", () => {
    const { canvas } = mountFull();
    expect(canvas.dispatch("wheel", { clientX: 10, clientY: 10, deltaY: -100 })).toBe(true);
  });

});

describe("mountFullMap: the handle controls reach the view", () => {
  it("moves, zooms, fits and follows, and the next frame is drawn again", () => {
    const { canvas, stand, handle } = mountFull();
    stand.scheduler.runFrame(0);
    let calls = canvas.context.calls;
    const steps: Array<() => ViewError | undefined> = [
      () => handle.zoomAt({ x: 100, y: 100 }, 2),
      () => handle.pan(20, 10),
      () => handle.follow(),
      () => handle.fit(),
    ];
    let time = 16;
    for (const step of steps) {
      expect(step()).toBeUndefined();
      stand.scheduler.runFrame(time);
      time += 16;
      expect(canvas.context.calls).toBeGreaterThan(calls);
      calls = canvas.context.calls;
    }
  });

  it("returns a plain error for a zoom factor that cannot be used", () => {
    const { handle } = mountFull();
    const error = handle.zoomAt({ x: 1, y: 1 }, 0);
    expect(isViewError(error)).toBe(true);
  });

  it("reports a zoom limit as a notice and still returns nothing", () => {
    const { handle, notices } = mountFull();
    const before = notices.length;
    expect(handle.zoomAt({ x: 100, y: 100 }, 1000)).toBeUndefined();
    expect(notices.length).toBe(before + 1);
    expect(notices[before]!.message).toContain("highest zoom");
  });

  it("selects a place through the engine, and a spot as a point", () => {
    const { handle, engine } = mountFull();
    const result = handle.selectPlace("p2");
    expect(isViewError(result)).toBe(false);
    expect(engine.destinations).toEqual([{ placeId: "p2" }]);
  });

  it("gives the selection to onSelect instead of the engine when it is set", () => {
    const heard: unknown[] = [];
    const { handle, engine } = mountFull({ onSelect: (selection) => heard.push(selection) });
    handle.selectPlace("p1");
    expect(heard).toEqual([{ kind: "place", placeId: "p1" }]);
    expect(engine.destinations).toEqual([]);
  });

  it("reads the CSS size again on resize()", () => {
    const { canvas, handle } = mountFull();
    canvas.clientWidth = 120;
    canvas.clientHeight = 90;
    expect(handle.resize()).toBeUndefined();
    expect(canvas.width).toBe(120);
    expect(canvas.height).toBe(90);
  });

  it("applies the zoom limits given as options", () => {
    mountFull({ minZoom: 0.5, maxZoom: 2 });
    const refused = mountFullMap(new FakeInputCanvas(), new FakeDestinationEngine(), {
      services: makeStandIns().services,
      minZoom: 3,
      maxZoom: 2,
    });
    expect(isViewError(refused)).toBe(true);
  });
});

describe("mountFullMap: destroy", () => {
  it("removes every listener the input binding added and restores the canvas", () => {
    const { canvas, stand, handle, region } = mountFull();
    stand.scheduler.runFrame(0);
    handle.destroy();
    for (const type of INPUT_EVENT_TYPES) expect(canvas.listenersOf(type)).toBe(0);
    expect(canvas.listenersOf("focus")).toBe(0);
    expect(canvas.listenersOf("blur")).toBe(0);
    expect(canvas.openListeners).toBe(0);
    expect(canvas.listenerRemoves).toBe(canvas.listenerAdds);
    expect(canvas.style.touchAction).toBeUndefined();
    expect(canvas.attributes.size).toBe(0);
    expect(region.attributes.size).toBe(0);
    expect(region.textContent).toBe("");
    expect(stand.scheduler.pending).toBe(0);
    expect(stand.observers.active).toBe(0);
  });

  it("does nothing on a second call, and keys after destroy reach nothing", () => {
    const { canvas, engine, handle } = mountFull();
    handle.destroy();
    const removes = canvas.listenerRemoves;
    expect(handle.destroy()).toBeUndefined();
    expect(canvas.listenerRemoves).toBe(removes);
    canvas.dispatch("keydown", { key: "]" });
    canvas.dispatch("keydown", { key: "Enter" });
    expect(engine.destinations).toEqual([]);
  });

  it("makes every control return a destroyed error", () => {
    const { handle } = mountFull();
    handle.destroy();
    const results = [
      handle.pan(1, 1),
      handle.zoomAt({ x: 1, y: 1 }, 2),
      handle.fit(),
      handle.follow(),
      handle.select({ x: 1, y: 1 }),
      handle.selectPlace("p1"),
      handle.resize(),
    ];
    for (const result of results) {
      expect(isViewError(result)).toBe(true);
      expect((result as ViewError).message).toContain("destroyed");
    }
  });

  it("frees the canvas so it can be mounted again", () => {
    const canvas = new FakeInputCanvas();
    mountFull({}, { canvas }).handle.destroy();
    expect(mountFull({}, { canvas }).stand.scheduler.pending).toBe(1);
  });
});

describe("mountFullMap: refused input leaves nothing behind", () => {
  function refusedFull(
    options: unknown,
    setup: { canvas?: unknown; engine?: unknown } = {},
  ): { error: ViewError; canvas: FakeInputCanvas; stand: StandIns } {
    const canvas = "canvas" in setup ? (setup.canvas as FakeInputCanvas) : new FakeInputCanvas();
    const engine = "engine" in setup ? setup.engine : new FakeDestinationEngine();
    const stand = makeStandIns();
    const result = mountFullMap(canvas as never, engine as never, { services: stand.services, ...(options as object) });
    if (!isViewError(result)) throw new Error("the mount was expected to be refused");
    return { error: result, canvas: canvas as FakeInputCanvas, stand };
  }

  it("refuses an engine that cannot take a destination and names the function", () => {
    const engine = new FakeEngine();
    const { error, canvas, stand } = refusedFull({}, { engine });
    expect(error.message).toContain('"setDestination"');
    expect(stand.scheduler.requested).toBe(0);
    expect(canvas.listenerAdds).toBe(0);
    expect(canvas.attributes.size).toBe(0);
  });

  it("refuses a canvas that cannot take input", () => {
    const { error, canvas } = refusedFull({}, { canvas: new FakeCanvas() });
    expect(error.message).toContain('"canvas"');
    expect(canvas.listenerAdds).toBe(0);
  });

  it("refuses a zoom limit outside 0.001 to 1000 and an onSelect that is not a function", () => {
    for (const bad of [0, 1001, Number.NaN]) {
      const { error, canvas } = refusedFull({ minZoom: bad });
      expect(error.message).toContain('"minZoom"');
      expect(canvas.listenerAdds).toBe(0);
    }
    expect(refusedFull({ onSelect: 5 }).error.message).toContain('"onSelect"');
  });

  it("refuses a live region that is not an element", () => {
    const { error, canvas } = refusedFull({ liveRegion: 5 });
    expect(error.message).toContain('"liveRegion"');
    expect(canvas.listenerAdds).toBe(0);
  });

  it("refuses a canvas that already has a view", () => {
    const canvas = new FakeInputCanvas();
    mountFull({}, { canvas });
    const { error } = refusedFull({}, { canvas });
    expect(error.message).toContain("already has a view");
  });

  it("leaves nothing behind when a service fails in the middle of mounting", () => {
    const stand = makeStandIns();
    const canvas = new FakeInputCanvas();
    const failing = {
      ...stand.services,
      createResizeObserver: () => {
        throw new Error("no observer");
      },
    };
    const { error } = refusedFull({ services: failing }, { canvas });
    expect(error.message).toContain("failed");
    expect(canvas.openListeners).toBe(0);
    expect(canvas.attributes.size).toBe(0);
    expect(canvas.width).toBe(300);
    mountFull({}, { canvas });
  });
});
