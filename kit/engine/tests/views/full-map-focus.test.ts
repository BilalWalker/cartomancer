import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import type { Destination, EngineMap } from "../../src/types.js";
import { FOCUS_RING_RADIUS_PX, FullMap, type FullMapOptions } from "../../src/views/full-map.js";
import { RecordingCanvas } from "../../src/views/recording-canvas.js";
import { isViewError } from "../../src/views/view-errors.js";
import { smallTown } from "./helpers/small-town.js";

function make(options: FullMapOptions = {}, map: EngineMap = smallTown()): FullMap {
  const view = FullMap.create(map, options);
  if (isViewError(view)) throw new Error(view.message);
  return view;
}

function withPlaces(ids: string[]): EngineMap {
  const town = smallTown();
  return {
    ...town,
    places: ids.map((id, i) => ({ id, name: `Name ${id}`, category: "shop", x: 10 * i, y: 0 })),
  };
}

const position = { x: 0, y: 0, headingDegrees: 0 };

describe("FullMap place focus by keyboard", () => {
  it("moves through places in identifier order and wraps", () => {
    const view = make({}, withPlaces(["b", "c", "a"]));
    const seen: (string | undefined)[] = [];
    for (let i = 0; i < 4; i++) {
      view.focusNextPlace();
      seen.push(view.getFocusedPlaceId());
    }
    expect(seen).toEqual(["a", "b", "c", "a"]);
    view.focusPreviousPlace();
    expect(view.getFocusedPlaceId()).toBe("c");
  });

  it("previous from no focus starts at the last place", () => {
    const view = make({}, withPlaces(["a", "b"]));
    expect(view.focusPreviousPlace().text).toContain("Name b");
    expect(view.getFocusedPlaceId()).toBe("b");
  });

  it("announces when the map has no places", () => {
    const view = make({}, withPlaces([]));
    expect(view.focusNextPlace().text).toBe("The map has no places to focus.");
    expect(view.getFocusedPlaceId()).toBeUndefined();
  });

  it("announces when Enter is pressed with no place selected", () => {
    const calls: Destination[] = [];
    const view = make({
      engine: {
        setDestination(d) {
          calls.push(d);
          return { parts: [], lengthWorldUnits: 0, destination: d };
        },
      },
    });
    const out = view.activateFocusedPlace();
    expect(out.text).toContain("No place is selected");
    expect(out.result).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it("Enter sets the focused place as the destination", () => {
    const calls: Destination[] = [];
    const view = make({
      engine: {
        setDestination(d) {
          calls.push(d);
          return { parts: [], lengthWorldUnits: 0, destination: d };
        },
      },
    });
    view.focusNextPlace();
    const out = view.activateFocusedPlace();
    expect(calls).toEqual([{ placeId: "p1" }]);
    expect(out.text).toBe("Destination set to Bakery.");
  });

  it("applyCommand wires the three focus commands and returns the text", () => {
    const view = make();
    const next = view.applyCommand({ type: "focusNextPlace" });
    expect(isViewError(next)).toBe(false);
    expect((next as { announcement?: string }).announcement).toContain("Bakery");
    const prev = view.applyCommand({ type: "focusPreviousPlace" });
    expect((prev as { announcement?: string }).announcement).toContain("Library");
    const act = view.applyCommand({ type: "activateFocusedPlace" });
    expect((act as { announcement?: string }).announcement).toContain("no engine");
  });

  it("draws a focus ring only on the focused place, and redraws when focus moves", () => {
    const view = make();
    const ringCalls = (canvas: RecordingCanvas): number =>
      canvas.findCalls("arc").filter((c) => c.args[2] === FOCUS_RING_RADIUS_PX).length;

    const first = new RecordingCanvas();
    view.draw(first, { position }, 0);
    expect(ringCalls(first)).toBe(0);

    view.focusNextPlace();
    const second = new RecordingCanvas();
    const drawn = view.draw(second, { position }, 16);
    expect(isViewError(drawn) ? false : drawn.drew).toBe(true);
    expect(ringCalls(second)).toBe(2);
  });

  it("focus after any command sequence is a place of the map or none", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom("next", "prev", "enter"), { maxLength: 20 }),
        (steps) => {
          const view = make();
          for (const s of steps) {
            if (s === "next") view.focusNextPlace();
            else if (s === "prev") view.focusPreviousPlace();
            else view.activateFocusedPlace();
          }
          const id = view.getFocusedPlaceId();
          return id === undefined || id === "p1" || id === "p2";
        },
      ),
    );
  });
});
