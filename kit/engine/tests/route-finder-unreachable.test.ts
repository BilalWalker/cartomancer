import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { findRoute } from "../src/route-finder.js";
import { isNoUsableRoad, snapToRoad } from "../src/snapping.js";
import type { Destination, EngineMap, NoWayReason, Position } from "../src/types.js";
import {
  cutMapRouteArbitrary,
  smallMapFileArbitrary,
  smallMapRouteArbitrary,
  startArbitrary,
  loadValid,
} from "./helpers/arbitraries.js";
import { exhaustiveShortestPath } from "./helpers/exhaustive-search.js";

const PATH_REASONS: NoWayReason[] = [
  "separate-parts",
  "one-way-blocks-the-way",
  "blocked-roads-cut-the-way",
];

function expectNoWay(result: unknown): NoWayReason {
  expect(result).toBeDefined();
  expect("parts" in (result as object)).toBe(false);
  const noWay = result as { reason: NoWayReason; message: string };
  expect(typeof noWay.reason).toBe("string");
  expect(noWay.message.length).toBeGreaterThan(0);
  expect(noWay.message).not.toContain("at ");
  expect(noWay.message).not.toContain("undefined");
  expect(noWay.message).not.toContain("NaN");
  return noWay.reason;
}

function target(map: EngineMap, destination: Destination): { x: number; y: number } | undefined {
  if ("placeId" in destination) {
    return map.places.find((place) => place.id === destination.placeId);
  }
  return destination.point;
}

describe("unreachable destination property", () => {
  // Feature: engine-core, Property 12: Unreachable destinations produce no route
  // **Validates: Requirements 10.1, 10.4, 10.5**
  it("when the exhaustive search finds no path, findRoute returns a No_Way_Result and no route", () => {
    let unreachable = 0;
    let reachable = 0;
    const reasons = new Set<NoWayReason>();
    const cases = fc.oneof(
      { arbitrary: smallMapRouteArbitrary(), weight: 1 },
      { arbitrary: cutMapRouteArbitrary(), weight: 2 },
    );
    fc.assert(
      fc.property(cases, ({ map, start, destination }) => {
        const point = target(map, destination);
        const result = findRoute(map, start, destination);
        if (point === undefined) {
          // Missing place (Requirement 10.3 / 10.5).
          expect(expectNoWay(result)).toBe("missing-place");
          return;
        }
        const snappedStart = snapToRoad(map, start);
        const snappedEnd = snapToRoad(map, point);
        if (isNoUsableRoad(snappedStart) || isNoUsableRoad(snappedEnd)) {
          expect(expectNoWay(result)).toBe("no-usable-road");
          return;
        }
        const best = exhaustiveShortestPath(
          map,
          { roadId: snappedStart.roadId, distanceAlongRoad: snappedStart.distanceAlongRoad },
          { roadId: snappedEnd.roadId, distanceAlongRoad: snappedEnd.distanceAlongRoad },
        );
        if (best === undefined) {
          unreachable++;
          reasons.add(expectNoWay(result));
          expect(PATH_REASONS).toContain((result as { reason: NoWayReason }).reason);
        } else {
          reachable++;
          expect("parts" in result).toBe(true);
        }
      }),
      { numRuns: 300 },
    );
    // Non-vacuity: unreachable cases happen, reachable ones too, and every
    // reason for a missing path is produced by the generator at least once.
    expect(unreachable).toBeGreaterThan(30);
    expect(reachable).toBeGreaterThan(0);
    for (const reason of PATH_REASONS) {
      expect(reasons.has(reason), `reason ${reason} was never seen`).toBe(true);
    }
  });

  it("a map with no usable road gives no-usable-road and no route", () => {
    const noRoads = smallMapFileArbitrary().map((file) => loadValid({ ...file, roads: [] }));
    fc.assert(
      fc.property(
        noRoads,
        startArbitrary(),
        fc.integer({ min: -100, max: 100 }),
        fc.integer({ min: -100, max: 100 }),
        (map: EngineMap, start: Position, x: number, y: number) => {
          const result = findRoute(map, start, { point: { x: x + 0, y: y + 0 } });
          expect(expectNoWay(result)).toBe("no-usable-road");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("a missing place gives missing-place naming the place, and no route", () => {
    fc.assert(
      fc.property(smallMapRouteArbitrary(), ({ map, start }) => {
        const result = findRoute(map, start, { placeId: "no-such-place" });
        expect(expectNoWay(result)).toBe("missing-place");
        expect((result as { message: string }).message).toContain("no-such-place");
      }),
      { numRuns: 100 },
    );
  });
});
