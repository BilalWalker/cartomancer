import { describe, expect, it } from "vitest";
import { FullMap } from "../../src/views/full-map.js";
import { bindInput, type BindableCanvas, type BindableEvent } from "../../src/views/input-binding.js";
import { isViewError } from "../../src/views/view-errors.js";
import { smallTown } from "./helpers/small-town.js";

type Listener = (event: BindableEvent) => void;

function fakeCanvas() {
  const active = new Map<string, Set<Listener>>();
  let added = 0;
  let removed = 0;
  const canvas: BindableCanvas = {
    addEventListener(type, listener) {
      if (!active.has(type)) active.set(type, new Set());
      active.get(type)!.add(listener);
      added++;
    },
    removeEventListener(type, listener) {
      if (active.get(type)?.delete(listener)) removed++;
    },
    getBoundingClientRect: () => ({ left: 10, top: 20 }),
    style: {},
  };
  const fire = (type: string, props: Partial<BindableEvent> = {}) => {
    let prevented = 0;
    const event: BindableEvent = { ...props, preventDefault: () => void prevented++ };
    for (const l of [...(active.get(type) ?? [])]) l(event);
    return () => prevented;
  };
  return { canvas, fire, counts: () => ({ added, removed, live: [...active.values()].reduce((n, s) => n + s.size, 0) }) };
}

function make() {
  const view = FullMap.create(smallTown());
  if (isViewError(view)) throw new Error(view.message);
  return view;
}

describe("bindInput", () => {
  it("sets touch-action none and removes every listener it added", () => {
    const { canvas, counts } = fakeCanvas();
    canvas.style.touchAction = "auto";
    const off = bindInput(canvas, make());
    expect(canvas.style.touchAction).toBe("none");
    expect(counts().added).toBeGreaterThan(0);
    expect(counts().live).toBe(counts().added);
    off();
    expect(counts().removed).toBe(counts().added);
    expect(counts().live).toBe(0);
    expect(canvas.style.touchAction).toBe("auto");
    off();
    expect(counts().removed).toBe(counts().added);
  });

  it("pans the view on a drag, using positions relative to the canvas", () => {
    const { canvas, fire } = fakeCanvas();
    const view = make();
    const before = view.getCamera();
    bindInput(canvas, view);
    fire("pointerdown", { clientX: 110, clientY: 120, pointerId: 1, timeStamp: 0 });
    fire("pointermove", { clientX: 150, clientY: 120, pointerId: 1, timeStamp: 10 });
    fire("pointerup", { clientX: 150, clientY: 120, pointerId: 1, timeStamp: 20 });
    const after = view.getCamera();
    expect(after.centerX !== before.centerX || after.centerY !== before.centerY || after.zoom !== before.zoom).toBe(true);
  });

  it("reports a selection for a quick press and release", () => {
    const { canvas, fire } = fakeCanvas();
    const results: unknown[] = [];
    bindInput(canvas, make(), { onSelectResult: (r) => results.push(r) });
    fire("pointerdown", { clientX: 210, clientY: 170, pointerId: 1, timeStamp: 0 });
    fire("pointerup", { clientX: 210, clientY: 170, pointerId: 1, timeStamp: 50 });
    expect(results).toHaveLength(1);
  });

  it("zooms on wheel and prevents the default action", () => {
    const { canvas, fire } = fakeCanvas();
    const view = make();
    view.setZoomLimits(0.01, 100);
    const before = view.getCamera().zoom;
    bindInput(canvas, view);
    const prevented = fire("wheel", { clientX: 210, clientY: 170, deltaY: -100, timeStamp: 0 });
    expect(prevented()).toBe(1);
    expect(view.getCamera().zoom).toBeGreaterThan(before);
  });

  it("prevents the default action of touch events", () => {
    const { canvas, fire } = fakeCanvas();
    bindInput(canvas, make());
    const prevented = fire("touchmove", {
      touches: [{ identifier: 1, clientX: 50, clientY: 50 }],
      timeStamp: 0,
    });
    expect(prevented()).toBe(1);
  });

  it("applies a key command and prevents the default only for used keys", () => {
    const { canvas, fire } = fakeCanvas();
    const changes: unknown[] = [];
    bindInput(canvas, make(), { onChange: (c) => changes.push(c) });
    expect(fire("keydown", { key: "]", timeStamp: 0 })()).toBe(1);
    expect(fire("keydown", { key: "q", timeStamp: 1 })()).toBe(0);
    expect(changes).toHaveLength(1);
  });

  it("forgets a pointer that was cancelled", () => {
    const { canvas, fire } = fakeCanvas();
    const results: unknown[] = [];
    bindInput(canvas, make(), { onSelectResult: (r) => results.push(r) });
    fire("pointerdown", { clientX: 210, clientY: 170, pointerId: 1, timeStamp: 0 });
    fire("pointercancel", { pointerId: 1 });
    fire("pointerup", { clientX: 210, clientY: 170, pointerId: 1, timeStamp: 50 });
    expect(results).toHaveLength(0);
  });
});
