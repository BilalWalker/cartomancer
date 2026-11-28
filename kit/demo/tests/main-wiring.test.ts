import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Engine } from "../../engine/src/index.js";
import type { ViewError } from "../../engine/src/index.js";
import { createDemo } from "../src/page.js";
import type { DemoDeps, Mounts, StatusElements } from "../src/page.js";
import { townMap } from "../src/town-map.js";

interface FakeCanvas {
  name: string;
}

function setup(options: { focused?: () => boolean; failMinimap?: boolean } = {}) {
  const engine = new Engine();
  const calls: string[] = [];
  const destroyed: string[] = [];
  const handle = (name: string) => ({
    destroy: () => {
      destroyed.push(name);
    },
  });
  const mounts = {
    mountMinimap(canvas: FakeCanvas) {
      calls.push(canvas.name);
      if (options.failMinimap) return { message: "The minimap could not be mounted." } as ViewError;
      return handle("minimap") as never;
    },
    mountFullMap(canvas: FakeCanvas) {
      calls.push(canvas.name);
      return handle("fullMap") as never;
    },
    mountTiltedView(canvas: FakeCanvas) {
      calls.push(canvas.name);
      return handle("tilted") as never;
    },
  } as Mounts<FakeCanvas>;
  const text = () => ({ textContent: "" as string | null });
  const status: StatusElements = {
    guidance: text(),
    distance: text(),
    roads: text(),
    notices: text(),
    message: text(),
    errors: text(),
  };
  const deps: DemoDeps<FakeCanvas> = {
    engine,
    mounts,
    canvases: { minimap: { name: "minimap" }, fullMap: { name: "fullMap" }, tilted: { name: "tilted" } },
    status,
    isViewFocused: options.focused ?? (() => false),
    reducedMotionQuery: { matches: false },
    requestFrame: () => 1,
    cancelFrame: () => {},
  };
  return { demo: createDemo(deps), engine, calls, destroyed, status };
}

const key = (name: string) => ({ key: name, preventDefault: () => {} });

describe("demo wiring", () => {
  it("loads the town map, mounts the three views and shows the road count", () => {
    const { demo, calls, status } = setup();
    expect(demo.loadChoice("town")).toBe(true);
    expect(calls).toEqual(["minimap", "fullMap", "tilted"]);
    expect(demo.viewCount).toBe(3);
    expect(status.roads.textContent).toContain(`${townMap.roads.length} roads`);
    expect(status.errors.textContent).toBe("");
  });

  it("switching the map destroys the views and mounts them again", () => {
    const { demo, calls, destroyed } = setup();
    demo.loadChoice("town");
    demo.loadChoice("town");
    expect(destroyed.sort()).toEqual(["fullMap", "minimap", "tilted"]);
    expect(calls.length).toBe(6);
    expect(demo.viewCount).toBe(3);
  });

  it("a click that sets a destination shows guidance after a position feed", () => {
    const { demo, engine, status } = setup();
    demo.loadChoice("town");
    const target = townMap.places[0]!;
    engine.setDestination({ placeId: target.id });
    demo.frame(16);
    expect(status.guidance.textContent).not.toBe("");
    expect(status.guidance.textContent).not.toContain("No destination");
    expect(status.distance.textContent).toContain("Distance left:");
  });

  it("feeds the arrow-key movement to the engine as a position", () => {
    const { demo, engine } = setup();
    demo.loadChoice("town");
    const before = engine.getPosition()!;
    demo.keyDown(key("ArrowRight"));
    demo.frame(1000);
    demo.frame(2000);
    expect(engine.getPosition()!.x).toBeGreaterThan(before.x);
    demo.keyUp(key("ArrowRight"));
    const x = engine.getPosition()!.x;
    demo.frame(3000);
    expect(engine.getPosition()!.x).toBe(x);
  });

  it("ignores arrow keys while a view canvas has focus", () => {
    const { demo, engine } = setup({ focused: () => true });
    demo.loadChoice("town");
    const before = engine.getPosition()!;
    demo.keyDown(key("ArrowRight"));
    demo.frame(1000);
    demo.frame(2000);
    expect(engine.getPosition()).toEqual(before);
  });

  it("a failed load shows the error and keeps the previous map and views", () => {
    const { demo, engine, status, destroyed } = setup();
    demo.loadChoice("town");
    const mapBefore = engine.getMap();
    expect(demo.loadChoice("nowhere")).toBe(false);
    expect(status.errors.textContent).toContain("previous map is still in use");
    expect(engine.getMap()).toEqual(mapBefore);
    expect(destroyed).toEqual([]);
    expect(demo.viewCount).toBe(3);
  });

  it("shows a mount error in plain words and still mounts the other views", () => {
    const { demo, status } = setup({ failMinimap: true });
    demo.loadChoice("town");
    expect(status.errors.textContent).toContain("minimap could not be mounted");
    expect(demo.viewCount).toBe(2);
  });

  it("keeps a speed message and the previous speed for a bad speed", () => {
    const { demo } = setup();
    demo.loadChoice("town");
    expect(demo.setSpeedText("500")).toContain("1 to 200");
    expect(demo.setSpeedText("60")).toBeNull();
  });

  it("main.ts mounts only through the mount functions", () => {
    const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
    for (const banned of ["CanvasAdapter", "bindInput", "requestAnimationFrame", "canvas-adapter", "input-binding", "frame-gate"]) {
      expect(source).not.toContain(banned);
    }
    for (const needed of ["mountMinimap", "mountFullMap", "mountTiltedView"]) {
      expect(source).toContain(needed);
    }
  });
});
