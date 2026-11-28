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

function setup(options: { focused?: () => boolean; failMinimap?: boolean; initialTilt?: number } = {}) {
  const engine = new Engine();
  const calls: string[] = [];
  const tiltMounts: Array<number | undefined> = [];
  const tiltCalls: number[] = [];
  const destroyed: string[] = [];
  const fitCalls: number[] = [];
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
      return {
        ...handle("fullMap"),
        fit: () => {
          fitCalls.push(1);
          return undefined;
        },
      } as never;
    },
    mountTiltedView(canvas: FakeCanvas, _engine: Engine, opts?: { tiltAngleDegrees?: number }) {
      calls.push(canvas.name);
      tiltMounts.push(opts?.tiltAngleDegrees);
      return {
        ...handle("tilted"),
        setTiltAngle: (degrees: number) => {
          tiltCalls.push(degrees);
          if (degrees < 20 || degrees > 70) return { message: "The tilt angle must be from 20 to 70 degrees." } as ViewError;
          return undefined;
        },
      } as never;
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
    ...(options.initialTilt === undefined ? {} : { initialTiltDegrees: options.initialTilt }),
  };
  return { demo: createDemo(deps), engine, calls, destroyed, status, tiltMounts, tiltCalls, fitCalls };
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

  it("mounts the three views once at page start, before any map is loaded", () => {
    const { demo, calls, engine } = setup();
    expect(calls).toEqual(["minimap", "fullMap", "tilted"]);
    expect(demo.viewCount).toBe(3);
    expect(engine.getMapVersion()).toBe(0);
  });

  it("switching the map loads it into the engine and never destroys or mounts again", () => {
    const { demo, calls, destroyed, engine } = setup();
    demo.loadChoice("town");
    demo.loadChoice("large");
    demo.loadChoice("town");
    expect(engine.getMapVersion()).toBe(3);
    expect(destroyed).toEqual([]);
    expect(calls).toEqual(["minimap", "fullMap", "tilted"]);
    expect(demo.viewCount).toBe(3);
  });

  it("a switch resets the dot to the start and fits the full map once at the next frame", () => {
    const { demo, engine, fitCalls } = setup();
    demo.loadChoice("town");
    expect(fitCalls.length).toBe(0);
    demo.frame(16);
    expect(fitCalls.length).toBe(1);
    demo.keyDown(key("ArrowRight"));
    demo.frame(1000);
    demo.frame(2000);
    demo.keyUp(key("ArrowRight"));
    demo.loadChoice("town");
    const start = engine.getPosition()!;
    expect(start.x).toBe(engine.getMap()!.nodes[0]!.x);
    demo.frame(3000);
    expect(fitCalls.length).toBe(2);
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

  it("passes the slider value to the tilted mount, default 35", () => {
    const first = setup();
    first.demo.loadChoice("town");
    expect(first.tiltMounts).toEqual([35]);
    const second = setup({ initialTilt: 50 });
    second.demo.loadChoice("town");
    expect(second.tiltMounts).toEqual([50]);
  });

  it("a tilt change calls setTiltAngle once and does not mount again", () => {
    const { demo, calls, tiltCalls, tiltMounts } = setup();
    demo.loadChoice("town");
    expect(demo.setTiltAngle(55)).toBeNull();
    expect(tiltCalls).toEqual([55]);
    expect(calls.length).toBe(3);
    expect(tiltMounts.length).toBe(1);
    expect(demo.tiltDegrees).toBe(55);
  });

  it("a refused tilt shows the message and keeps the previous value", () => {
    const { demo, status } = setup();
    demo.loadChoice("town");
    demo.setTiltAngle(50);
    expect(demo.setTiltAngle(80)).toContain("20 to 70");
    expect(status.errors.textContent).toContain("20 to 70");
    expect(demo.tiltDegrees).toBe(50);
    expect(demo.setTiltAngle(60)).toBeNull();
    expect(status.errors.textContent).toBe("");
  });

  it("the tilt slider keeps working on the same handle after a map change", () => {
    const { demo, tiltMounts, tiltCalls } = setup();
    demo.loadChoice("town");
    demo.setTiltAngle(45);
    demo.loadChoice("large");
    expect(demo.setTiltAngle(60)).toBeNull();
    expect(tiltMounts).toEqual([35]);
    expect(tiltCalls).toEqual([45, 60]);
    expect(demo.tiltDegrees).toBe(60);
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
