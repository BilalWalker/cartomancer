import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Engine } from "../../src/engine.js";
import { mountFullMap, mountMinimap, mountTiltedView } from "../../src/views/mount.js";
import { isViewError, type Notice } from "../../src/views/view-errors.js";
import { FakeDestinationEngine, FakeEngine, FakeInputCanvas, makeStandIns } from "./helpers/stand-ins.js";
import { smallTown } from "./helpers/small-town.js";

function waiting(options: Record<string, unknown> = {}) {
  const engine = new FakeEngine();
  engine.map = undefined;
  engine.mapVersion = 0;
  const canvas = new FakeInputCanvas();
  const stand = makeStandIns();
  const notices: Notice[] = [];
  const handle = mountMinimap(canvas, engine, {
    services: stand.services,
    onNotice: (notice) => notices.push(notice),
    ...options,
  });
  if (isViewError(handle)) throw new Error(handle.message);
  return { engine, canvas, stand, notices, handle };
}

function badTown() {
  const bad = smallTown();
  bad.nodes[0] = { id: "n1", x: Number.NaN, y: 0 };
  return bad;
}

// Feature: map-views, Property 27: A mounted View reads the Map once per version change
// **Validates: Requirements 25.6, 25.7, 25.12, 25.15, 25.18**
describe("Property 27: a mounted View reads the Map once per version change", () => {
  it("calls getMap once per new version and never on a frame without a change", () => {
    const step = fc.constantFrom("frame", "load", "refused-load");
    fc.assert(
      fc.property(fc.array(step, { maxLength: 30 }), (steps) => {
        const { engine, stand } = waiting();
        let expectedReads = 0;
        let loaded = false;
        let versionSeenByFrame = 0;
        for (const kind of steps) {
          if (kind === "load") engine.loadMap(smallTown());
          if (kind === "refused-load") engine.loadMap(badTown());
          if (kind === "frame") {
            stand.scheduler.runFrame(0);
            if (engine.mapVersion > 0 && engine.mapVersion !== versionSeenByFrame) expectedReads++;
            versionSeenByFrame = engine.mapVersion;
            loaded = loaded || engine.mapVersion > 0;
            expect(engine.reads.map).toBe(expectedReads);
          }
        }
        expect(engine.reads.mapVersion).toBeGreaterThanOrEqual(steps.filter((s) => s === "frame").length);
      }),
    );
  });
});

describe("a View mounted before any map", () => {
  it("makes no canvas call and reports nothing while the version is 0, then draws after the first load", () => {
    const { engine, canvas, stand, notices } = waiting();
    const afterMount = canvas.context.calls;
    stand.scheduler.runFrame(0);
    stand.scheduler.runFrame(16);
    expect(canvas.context.calls).toBe(afterMount);
    expect(notices).toEqual([]);
    expect(engine.reads.map).toBe(0);
    engine.loadMap(smallTown());
    stand.scheduler.runFrame(32);
    expect(canvas.context.calls).toBeGreaterThan(afterMount + 10);
    expect(engine.reads.map).toBe(1);
  });

  it("works with the real Engine: mounts at version 0 and draws after loadMap", () => {
    const engine = new Engine();
    const canvas = new FakeInputCanvas();
    const stand = makeStandIns();
    const handle = mountMinimap(canvas, engine, { services: stand.services });
    expect(isViewError(handle)).toBe(false);
    const afterMount = canvas.context.calls;
    stand.scheduler.runFrame(0);
    expect(canvas.context.calls).toBe(afterMount);
  });

  it("builds the three views on the first map", () => {
    for (const mount of [mountMinimap, mountFullMap, mountTiltedView]) {
      const engine = new FakeDestinationEngine();
      engine.map = undefined;
      engine.mapVersion = 0;
      const canvas = new FakeInputCanvas();
      const stand = makeStandIns();
      const handle = mount(canvas as never, engine as never, { services: stand.services });
      expect(isViewError(handle)).toBe(false);
      const afterMount = canvas.context.calls;
      engine.loadMap(smallTown());
      stand.scheduler.runFrame(0);
      expect(canvas.context.calls).toBeGreaterThan(afterMount);
    }
  });

  it("answers a control that needs a map with a plain error until the map arrives", () => {
    const { handle } = waiting();
    const result = handle.setZoom(2);
    expect(isViewError(result)).toBe(true);
    if (isViewError(result)) expect(result.message).toContain("No map has been loaded yet");
  });
});

describe("later maps", () => {
  it("shows the second map after two loads", () => {
    const { engine, canvas, stand } = waiting();
    engine.loadMap(smallTown());
    stand.scheduler.runFrame(0);
    const second = smallTown();
    second.places = [];
    engine.loadMap(second);
    const before = canvas.context.calls;
    stand.scheduler.runFrame(16);
    expect(canvas.context.calls).toBeGreaterThan(before);
    expect(engine.reads.map).toBe(2);
  });

  it("keeps the zoom limits across maps", () => {
    const { engine, stand, handle } = waiting({ minZoom: 0.1, maxZoom: 20, zoom: 10 });
    engine.loadMap(smallTown());
    stand.scheduler.runFrame(0);
    engine.loadMap(smallTown());
    stand.scheduler.runFrame(16);
    expect(handle.setZoom(15)).toBeUndefined();
    expect(isViewError(handle.setZoom(25))).toBe(true);
  });

  it("gives one Notice for a refused map, keeps the old map and does not read again", () => {
    const { engine, canvas, stand, notices } = waiting();
    engine.loadMap(smallTown());
    stand.scheduler.runFrame(0);
    const noticesBefore = notices.length;
    const callsBefore = canvas.context.calls;
    engine.loadMap(badTown());
    stand.scheduler.runFrame(16);
    stand.scheduler.runFrame(32);
    stand.scheduler.runFrame(48);
    expect(notices.length).toBe(noticesBefore + 1);
    expect(engine.reads.map).toBe(2);
    expect(canvas.context.calls).toBe(callsBefore);
    engine.loadMap(smallTown());
    stand.scheduler.runFrame(64);
    expect(engine.reads.map).toBe(3);
  });

  it("does not read the map again after a failed load of the real Engine", () => {
    const engine = new Engine();
    const stand = makeStandIns();
    const canvas = new FakeInputCanvas();
    mountMinimap(canvas, engine, { services: stand.services });
    engine.loadMap("not a map");
    stand.scheduler.runFrame(0);
    expect(engine.getMapVersion()).toBe(0);
  });
});

describe("an Engine without getMapVersion", () => {
  it("is refused at mount with an error that names the engine and the function, and nothing is registered", () => {
    const engine = Object.assign(new FakeEngine(), { getMapVersion: undefined });
    const canvas = new FakeInputCanvas();
    const stand = makeStandIns();
    for (const mount of [mountMinimap, mountFullMap, mountTiltedView]) {
      const result = mount(canvas as never, engine as never, { services: stand.services });
      expect(isViewError(result)).toBe(true);
      if (isViewError(result)) {
        expect(result.message).toContain('"engine"');
        expect(result.message).toContain("getMapVersion");
      }
    }
    expect(stand.scheduler.requested).toBe(0);
    expect(stand.observers.created).toBe(0);
    expect(canvas.listenerAdds).toBe(0);
    expect(canvas.attributes.size).toBe(0);
  });
});
