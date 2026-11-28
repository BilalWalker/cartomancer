// One example for each View_Error of Requirement 21 criteria 10 to 14, on each
// Mount_Function. Each checks plain words, the named input and that nothing is
// left behind (Requirement 21.15).

import { describe, expect, it } from "vitest";
import { mountFullMap, mountMinimap, mountTiltedView } from "../../src/views/mount.js";
import { isViewError, type ViewError } from "../../src/views/view-errors.js";
import {
  FakeDestinationEngine,
  FakeInputCanvas,
  makeStandIns,
  type StandIns,
} from "./helpers/stand-ins.js";

type Mounter = (canvas: unknown, engine: unknown, options: unknown) => unknown;

const MOUNTERS: Array<{ name: string; mount: Mounter }> = [
  { name: "mountMinimap", mount: mountMinimap as Mounter },
  { name: "mountFullMap", mount: mountFullMap as Mounter },
  { name: "mountTiltedView", mount: mountTiltedView as Mounter },
];

function refuse(
  mount: Mounter,
  setup: { canvas?: unknown; engine?: unknown; options?: unknown; stand?: StandIns } = {},
): { error: ViewError; canvas: FakeInputCanvas; stand: StandIns } {
  const stand = setup.stand ?? makeStandIns();
  const canvas = "canvas" in setup ? (setup.canvas as FakeInputCanvas) : new FakeInputCanvas();
  const engine = "engine" in setup ? setup.engine : new FakeDestinationEngine();
  const given = "options" in setup ? setup.options : {};
  const options =
    typeof given === "object" && given !== null && !Array.isArray(given)
      ? { services: stand.services, ...(given as object) }
      : given;
  const result = mount(canvas, engine, options);
  if (!isViewError(result)) throw new Error("the mount was expected to be refused");
  return { error: result, canvas, stand };
}

function expectPlain(error: ViewError): void {
  expect(error.message).not.toMatch(/undefined|NaN|Infinity|\bat |Error:|stack/);
}

function expectNothingLeft(canvas: FakeInputCanvas, stand: StandIns): void {
  expect(stand.scheduler.requested).toBe(0);
  expect(stand.scheduler.pending).toBe(0);
  expect(stand.observers.created).toBe(0);
  expect(stand.motion.added).toBe(0);
  expect(canvas.listenerAdds).toBe(0);
  expect(canvas.openListeners).toBe(0);
  expect(canvas.attributes.size).toBe(0);
  expect(canvas.width).toBe(300);
  expect(canvas.height).toBe(150);
}

/** Refuses with the options, checks the named input and that nothing is left. */
function expectRefusedOption(mount: Mounter, options: unknown, named: string, rule: string): void {
  const { error, canvas, stand } = refuse(mount, { options });
  expect(error.message).toContain(named);
  expect(error.message).toContain(rule);
  expectPlain(error);
  expectNothingLeft(canvas, stand);
}

const NOT_FINITE = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

describe.each(MOUNTERS)("$name: View_Errors", ({ mount }) => {
  it("refuses a first argument that is not a canvas element", () => {
    for (const bad of [null, undefined, 5, "canvas", {}, { getContext: () => null }]) {
      const stand = makeStandIns();
      const { error } = refuse(mount, { canvas: bad, stand });
      expect(error.field).toBe("canvas");
      expect(error.message).toContain("canvas element");
      expectPlain(error);
      expect(stand.scheduler.requested).toBe(0);
      expect(stand.observers.created).toBe(0);
      expect(stand.motion.added).toBe(0);
    }
  });

  it("refuses an engine that misses a function and names it", () => {
    for (const name of ["getMap", "getPosition", "getRemainingRoute", "getGuidanceSentence"]) {
      const engine = Object.assign(new FakeDestinationEngine(), { [name]: undefined });
      const stand = makeStandIns();
      const canvas = new FakeInputCanvas();
      const { error } = refuse(mount, { engine, canvas, stand });
      expect(error.field).toBe("engine");
      expect(error.message).toContain(`"${name}"`);
      expectPlain(error);
      expectNothingLeft(canvas, stand);
    }
    for (const bad of [null, undefined, 3]) {
      expect(refuse(mount, { engine: bad }).error.field).toBe("engine");
    }
  });

  it("refuses options that are not an object", () => {
    for (const bad of [null, 5, "options", [1], true]) {
      expectRefusedOption(mount, bad, '"options"', "object");
    }
  });

  it("refuses a smoothing duration outside 1 to 5000 ms, at the boundaries", () => {
    for (const bad of [0.999, 0, -1, 5000.001, ...NOT_FINITE]) {
      expectRefusedOption(mount, { smoothingDurationMs: bad }, "smoothing", "1 to 5000");
    }
  });

  it("refuses an images option that is null, a number or a text", () => {
    for (const bad of [null, 5, "pictures", true]) {
      const { error, canvas, stand } = refuse(mount, { options: { images: bad } });
      expect(error.field).toBe("images");
      expect(error.message).toContain('"images"');
      expect(error.message).toContain("object or a function");
      expectPlain(error);
      expectNothingLeft(canvas, stand);
    }
  });

  it("refuses an images entry with a width or height that is not finite or not above 0", () => {
    for (const bad of [0, -1, ...NOT_FINITE]) {
      for (const side of ["width", "height"]) {
        const entry = { image: {}, width: 10, height: 10, [side]: bad };
        const { error, canvas, stand } = refuse(mount, { options: { images: { statue: entry } } });
        expect(error.field).toBe("images");
        expect(error.message).toContain('"statue"');
        expectPlain(error);
        expectNothingLeft(canvas, stand);
      }
    }
  });

  it("refuses a canvas that already has a view and leaves the first view working", () => {
    const canvas = new FakeInputCanvas();
    const firstStand = makeStandIns();
    const first = mount(canvas, new FakeDestinationEngine(), { services: firstStand.services });
    expect(isViewError(first)).toBe(false);
    const adds = canvas.listenerAdds;
    const stand = makeStandIns();
    const { error } = refuse(mount, { canvas, stand });
    expect(error.field).toBe("canvas");
    expect(error.message).toContain("already has a view");
    expectPlain(error);
    expect(stand.scheduler.requested).toBe(0);
    expect(stand.observers.created).toBe(0);
    expect(stand.motion.added).toBe(0);
    expect(canvas.listenerAdds).toBe(adds);
    expect(firstStand.scheduler.pending).toBe(1);
    (first as { destroy(): void }).destroy();
    expect(canvas.openListeners).toBe(0);
  });

  it("returns a destroyed error from the controls after destroy, and nothing from a second destroy", () => {
    const stand = makeStandIns();
    const handle = mount(new FakeInputCanvas(), new FakeDestinationEngine(), {
      services: stand.services,
    }) as Record<string, (...args: unknown[]) => unknown>;
    expect(isViewError(handle)).toBe(false);
    expect(handle.destroy!()).toBeUndefined();
    expect(handle.destroy!()).toBeUndefined();
    const controls = Object.keys(handle).filter((key) => key !== "destroy");
    expect(controls.length).toBeGreaterThan(0);
    for (const key of controls) {
      const result = handle[key]!({ x: 1, y: 1 }, 1);
      expect(isViewError(result)).toBe(true);
      expect((result as ViewError).message).toContain("destroyed");
      expectPlain(result as ViewError);
    }
    expect(stand.scheduler.pending).toBe(0);
  });
});

describe("zoom options (mountMinimap and mountFullMap)", () => {
  const rule = "0.001 to 1000";
  for (const { name, mount } of MOUNTERS.slice(0, 2)) {
    it(`${name} refuses a zoom limit outside ${rule}, at the boundaries`, () => {
      for (const option of ["minZoom", "maxZoom"]) {
        for (const bad of [0.0009, 0, -1, 1000.001, ...NOT_FINITE]) {
          expectRefusedOption(mount, { [option]: bad }, `"${option}"`, rule);
        }
      }
    });
    it(`${name} accepts the zoom limits at the range ends`, () => {
      for (const options of [{ minZoom: 0.001 }, { maxZoom: 1000 }, { minZoom: 0.001, maxZoom: 1000 }]) {
        const stand = makeStandIns();
        const handle = mount(new FakeInputCanvas(), new FakeDestinationEngine(), {
          services: stand.services,
          ...options,
        });
        expect(isViewError(handle)).toBe(false);
        (handle as { destroy(): void }).destroy();
      }
    });
  }

  it("mountMinimap refuses a first zoom outside 0.001 to 1000", () => {
    for (const bad of [0.0009, 1000.001, ...NOT_FINITE]) {
      expectRefusedOption(mountMinimap as Mounter, { zoom: bad }, '"zoom"', rule);
    }
  });
});

describe("mountTiltedView: option ranges", () => {
  const mount = mountTiltedView as Mounter;

  it("refuses a tilt angle outside 20 to 70 degrees, at the boundaries", () => {
    for (const bad of [19.999, 70.001, 0, -45, ...NOT_FINITE]) {
      const { error, canvas, stand } = refuse(mount, { options: { tiltAngleDegrees: bad } });
      expect(error.message).toContain("tilt angle");
      expectPlain(error);
      expectNothingLeft(canvas, stand);
    }
    expectRefusedOption(mount, { tiltAngleDegrees: 19.999 }, "tilt angle", "20 to 70");
  });

  it("accepts a tilt angle of 20 and of 70", () => {
    for (const tiltAngleDegrees of [20, 70]) {
      const handle = mount(new FakeInputCanvas(), new FakeDestinationEngine(), {
        services: makeStandIns().services,
        tiltAngleDegrees,
      });
      expect(isViewError(handle)).toBe(false);
    }
  });

  it("refuses a height factor outside 0 to 100, naming the prop kind", () => {
    for (const bad of [-0.001, 100.001, ...NOT_FINITE]) {
      const { error, canvas, stand } = refuse(mount, { options: { heightFactors: { tree: bad } } });
      expect(error.message).toContain("height factor for tree");
      expectPlain(error);
      expectNothingLeft(canvas, stand);
    }
    expectRefusedOption(mount, { heightFactors: { tree: 101 } }, "height factor for tree", "0 to 100");
  });

  it("refuses a height factors option that is not an object", () => {
    for (const bad of [null, 5, "tall", [1]]) {
      expectRefusedOption(mount, { heightFactors: bad }, '"heightFactors"', "object");
    }
  });

  it("accepts a height factor of 0 and of 100", () => {
    const handle = mount(new FakeInputCanvas(), new FakeDestinationEngine(), {
      services: makeStandIns().services,
      heightFactors: { tree: 0, house: 100 },
    });
    expect(isViewError(handle)).toBe(false);
  });
});

describe("mountFullMap: more refusals", () => {
  it("refuses a canvas that cannot take input", () => {
    const canvas = new FakeInputCanvas();
    (canvas as unknown as Record<string, unknown>).getBoundingClientRect = undefined;
    const stand = makeStandIns();
    const { error } = refuse(mountFullMap as Mounter, { canvas, stand });
    expect(error.field).toBe("canvas");
    expectNothingLeft(canvas, stand);
  });

  it("refuses an engine without setDestination", () => {
    const engine = Object.assign(new FakeDestinationEngine(), { setDestination: undefined });
    const { error } = refuse(mountFullMap as Mounter, { engine });
    expect(error.message).toContain('"setDestination"');
  });

  it("refuses an onSelect that is not a function", () => {
    expectRefusedOption(mountFullMap as Mounter, { onSelect: 5 }, '"onSelect"', "function");
  });
});
