import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { Engine } from "../../src/engine.js";
import { nearestPointOnSegment } from "../../src/geometry.js";
import { isNoUsableRoad, snapToRoad } from "../../src/snapping.js";
import type { Destination, EngineMap, NoWayResult, Route } from "../../src/types.js";
import { screenToWorld } from "../../src/views/camera.js";
import {
  FullMap,
  type DestinationTarget,
  type FullMapOptions,
  type FullMapSelectResult,
} from "../../src/views/full-map.js";
import { isViewError, type ViewError } from "../../src/views/view-errors.js";
import { smallTown } from "./helpers/small-town.js";

function make(options: FullMapOptions = {}, map: EngineMap = smallTown()): FullMap {
  const view = FullMap.create(map, options);
  if (isViewError(view)) throw new Error(view.message);
  return view;
}

/** Records the destinations it is given and answers with a fixed result. */
function recorder(answer?: Route | NoWayResult): { target: DestinationTarget; calls: Destination[] } {
  const calls: Destination[] = [];
  const target: DestinationTarget = {
    setDestination(destination) {
      calls.push(destination);
      return (
        answer ?? { parts: [], lengthWorldUnits: 0, destination }
      );
    },
  };
  return { target, calls };
}

function fileText(map: EngineMap): string {
  const { usableRoadIds: _usable, blockedRoads: _blocked, ...file } = map;
  return JSON.stringify(file);
}

function ok(value: FullMapSelectResult | ViewError): FullMapSelectResult {
  if (isViewError(value)) throw new Error(value.message);
  return value;
}

function farMap(): EngineMap {
  const town = smallTown();
  return {
    ...town,
    nodes: [
      { id: "n1", x: 0, y: 0 },
      { id: "n2", x: 1, y: 0 },
    ],
    roads: [{ id: "r1", fromNodeId: "n1", toNodeId: "n2", width: 4, kind: "main" }],
    places: [],
    blockedAreas: [],
    props: [{ id: "q1", kind: "tree", x: 1000, y: 1000, width: 8, height: 8, rotationDegrees: 0 }],
    usableRoadIds: new Set(["r1"]),
  };
}

describe("FullMap selection", () => {
  it("a click on a place marker sets that place through the engine", () => {
    const engine = new Engine();
    engine.loadMap(fileText(smallTown()));
    engine.feedPosition({ x: 0, y: 0, headingDegrees: 0 }, 0);
    const view = make({ engine });
    // The Bakery at (50, 0) is at screen (200, 15) in the fitted camera.
    const result = ok(view.select({ x: 205, y: 20 }));
    expect(result.selection).toEqual({ kind: "place", placeId: "p1" });
    expect(result.handled).toBe(false);
    expect(result.route?.destination).toEqual({ placeId: "p1" });
  });

  it("a click away from the markers sets the world point", () => {
    const { target, calls } = recorder();
    const view = make({ engine: target });
    const screen = { x: 200, y: 150 };
    const result = ok(view.select(screen));
    const world = screenToWorld(view.getCamera(), screen) as { x: number; y: number };
    expect(result.selection.kind).toBe("point");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ point: world });
  });

  it("a click with a real engine finds a route to the snapped point", () => {
    const engine = new Engine();
    engine.loadMap(fileText(smallTown()));
    engine.feedPosition({ x: 0, y: 0, headingDegrees: 0 }, 0);
    const view = make({ engine });
    const result = ok(view.select({ x: 200, y: 150 }));
    expect(result.route).toBeDefined();
    expect(engine.getRoute()).toBeDefined();
  });

  it("a caller handler replaces setting the destination", () => {
    const { target, calls } = recorder();
    const seen: unknown[] = [];
    const view = make({ engine: target, onSelect: (s) => seen.push(s) });
    const result = ok(view.select({ x: 205, y: 20 }));
    expect(result.handled).toBe(true);
    expect(seen).toEqual([{ kind: "place", placeId: "p1" }]);
    expect(calls).toHaveLength(0);
  });

  it("selecting a place by id sends the id to the engine", () => {
    const { target, calls } = recorder();
    const view = make({ engine: target });
    ok(view.selectPlace("p2"));
    expect(calls).toEqual([{ placeId: "p2" }]);
  });

  it("shows the message of a No_Way_Result to the caller", () => {
    const noWay: NoWayResult = { reason: "separate-parts", message: "The two parts of the map are not joined." };
    const { target } = recorder(noWay);
    const view = make({ engine: target });
    const result = ok(view.select({ x: 205, y: 20 }));
    expect(result.noWayMessage).toBe("The two parts of the map are not joined.");
    expect(result.route).toBeUndefined();
  });

  it("returns the engine's error as a View_Error", () => {
    const engine = new Engine();
    engine.loadMap(fileText(smallTown()));
    const view = make({ engine });
    const result = view.select({ x: 205, y: 20 });
    expect(isViewError(result)).toBe(true);
  });

  it("ignores a selection outside the viewport or not finite, without coordinates in the message", () => {
    const { target, calls } = recorder();
    const view = make({ engine: target, width: 400, height: 300 });
    for (const point of [
      { x: -1, y: 10 },
      { x: 10, y: 301 },
      { x: 401, y: 10 },
      { x: Number.NaN, y: 10 },
      { x: 10, y: Number.POSITIVE_INFINITY },
    ]) {
      const result = view.select(point);
      expect(isViewError(result)).toBe(true);
      expect((result as ViewError).message).toMatch(/outside the map view/);
      expect((result as ViewError).message).not.toMatch(/\d/);
    }
    expect(calls).toHaveLength(0);
  });

  it("accepts a selection on the viewport edge", () => {
    const { target } = recorder();
    const view = make({ engine: target, width: 400, height: 300 });
    expect(isViewError(view.select({ x: 0, y: 0 }))).toBe(false);
  });

  it("refuses a map with no usable road", () => {
    const { target, calls } = recorder();
    const view = make({ engine: target }, { ...smallTown(), usableRoadIds: new Set() });
    const result = view.select({ x: 200, y: 150 });
    expect(isViewError(result)).toBe(true);
    expect((result as ViewError).message).toMatch(/no usable road/);
    expect(calls).toHaveLength(0);
  });

  it("refuses a spot more than 100 world units from a road", () => {
    const { target, calls } = recorder();
    const view = make({ engine: target, width: 400, height: 300 }, farMap());
    const result = view.select({ x: 200, y: 150 });
    expect(isViewError(result)).toBe(true);
    expect((result as ViewError).message).toMatch(/too far from any road/);
    expect(calls).toHaveLength(0);
  });

  it("refuses a spot more than 200 CSS pixels from a road when that is nearer in world units", () => {
    const { target, calls } = recorder();
    const view = make({ engine: target });
    // Zoom 8: 200 px is 25 world units. The lake centre is 50 units from the roads.
    const zoomed = view.zoomAt({ x: 200, y: 150 }, 8 / view.getCamera().zoom);
    expect(isViewError(zoomed)).toBe(false);
    expect(view.getCamera().zoom).toBeCloseTo(8, 9);
    const result = view.select({ x: 200, y: 150 });
    expect(isViewError(result)).toBe(true);
    expect((result as ViewError).message).toMatch(/too far from any road/);
    expect(calls).toHaveLength(0);
  });

  it("accepts a spot just inside the distance limit", () => {
    const { target, calls } = recorder();
    const view = make({ engine: target });
    // At zoom 2.7 the limit is min(100, 200 / 2.7) = 74.07 units; the lake centre is 50 away.
    expect(isViewError(view.select({ x: 200, y: 150 }))).toBe(false);
    expect(calls).toHaveLength(1);
  });
});

describe("FullMap click lands on a usable road", () => {
  it("Feature: map-views, Property 11: A click lands on a usable road", () => {
    // Feature: map-views, Property 11: A click lands on a usable road
    // **Validates: Requirements 11.8**
    const map = smallTown();
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 3, noNaN: true }),
        fc.double({ min: 0, max: 400, noNaN: true }),
        fc.double({ min: 0, max: 300, noNaN: true }),
        (factor, x, y) => {
          const { target, calls } = recorder();
          const view = make({ engine: target, width: 400, height: 300 });
          view.zoomAt({ x: 200, y: 150 }, factor);
          const result = view.select({ x, y });
          if (isViewError(result)) return; // too far from any road: no destination
          if (result.selection.kind === "place") return;
          expect(calls).toHaveLength(1);
          const world = screenToWorld(view.getCamera(), { x, y }) as { x: number; y: number };
          const snapped = snapToRoad(map, world);
          expect(isNoUsableRoad(snapped)).toBe(false);
          if (isNoUsableRoad(snapped)) return;
          const road = map.roads.find((r) => r.id === snapped.roadId)!;
          expect(map.usableRoadIds.has(road.id)).toBe(true);
          const from = map.nodes.find((n) => n.id === road.fromNodeId)!;
          const to = map.nodes.find((n) => n.id === road.toNodeId)!;
          expect(nearestPointOnSegment(snapped, from, to).distance).toBeLessThan(0.001);
        },
      ),
      { numRuns: 200 },
    );
  });
});
