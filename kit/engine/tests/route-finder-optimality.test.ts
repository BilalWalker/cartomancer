import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { findRoute } from "../src/route-finder.js";
import { isNoUsableRoad, snapToRoad } from "../src/snapping.js";
import { smallMapRouteArbitrary } from "./helpers/arbitraries.js";
import { exhaustiveShortestPath } from "./helpers/exhaustive-search.js";

describe("route optimality property", () => {
  const TOLERANCE = 0.000001;

  // Feature: engine-core, Property 11: Routes are optimal and complete on small maps
  // **Validates: Requirements 9.1, 9.2, 9.3**
  it("route length equals the exhaustive shortest path, and a route is returned whenever a path exists", () => {
    let compared = 0;
    let withLength = 0;
    let unreachable = 0;
    fc.assert(
      fc.property(smallMapRouteArbitrary(), ({ map, start, destination }) => {
        let target: { x: number; y: number };
        if ("placeId" in destination) {
          const place = map.places.find((candidate) => candidate.id === destination.placeId);
          if (!place) return; // missing place: covered by other tests
          target = place;
        } else {
          target = destination.point;
        }
        const snappedStart = snapToRoad(map, start);
        const snappedEnd = snapToRoad(map, target);
        if (isNoUsableRoad(snappedStart) || isNoUsableRoad(snappedEnd)) return;

        const best = exhaustiveShortestPath(
          map,
          { roadId: snappedStart.roadId, distanceAlongRoad: snappedStart.distanceAlongRoad },
          { roadId: snappedEnd.roadId, distanceAlongRoad: snappedEnd.distanceAlongRoad },
        );
        const result = findRoute(map, start, destination);
        compared++;

        if (best === undefined) {
          unreachable++;
          expect("parts" in result).toBe(false);
          return;
        }
        expect("parts" in result).toBe(true);
        if (!("parts" in result)) return;
        if (best.length > 0) withLength++;
        expect(Math.abs(result.lengthWorldUnits - best.length)).toBeLessThanOrEqual(TOLERANCE);
      }),
      { numRuns: 300 },
    );
    // Non-vacuity: the run must have found routes and unreachable cases.
    expect(withLength).toBeGreaterThan(0);
    expect(unreachable).toBeGreaterThan(0);
    expect(compared).toBeGreaterThan(unreachable);
  });
});
