import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { signedAngleDifference } from "../src/geometry.js";
import { mirrorHeading, mirrorMap } from "../src/mirror.js";
import type { Destination, EngineMap, Position } from "../src/types.js";
import {
  gridRouteArbitrary,
  loadValid,
  mapFileArbitrary,
  smallMapRouteArbitrary,
} from "./helpers/arbitraries.js";
import { turnSequence } from "./helpers/turn-sequence.js";

const sample: EngineMap = {
  formatVersion: 1,
  nodes: [
    { id: "a", x: 10, y: 5 },
    { id: "b", x: -20, y: 7 },
  ],
  roads: [{ id: "r1", fromNodeId: "a", toNodeId: "b", width: 6, kind: "main", oneWay: true }],
  places: [{ id: "p1", name: "Bank", category: "shop", x: 4, y: 9 }],
  blockedAreas: [
    {
      id: "w1",
      kind: "water",
      polygon: [
        { x: 1, y: 1 },
        { x: -3, y: 2 },
        { x: 0, y: 6 },
      ],
    },
  ],
  props: [{ id: "t1", kind: "tree", x: 8, y: 2, width: 3, height: 4, rotationDegrees: 30 }],
  backgroundPicture: { ref: "plan.png", scale: 2, opacity: 0.5 },
  style: { colors: { road: "#333" }, lineStyles: { road: { width: 2 } } },
  usableRoadIds: new Set(["r1"]),
  blockedRoads: [{ roadId: "r2", blockedAreaId: "w1" }],
};

describe("mirrorMap", () => {
  it("negates x of nodes, places, props and blocked area points", () => {
    const m = mirrorMap(sample);
    expect(m.nodes).toEqual([
      { id: "a", x: -10, y: 5 },
      { id: "b", x: 20, y: 7 },
    ]);
    expect(m.places[0]).toEqual({ id: "p1", name: "Bank", category: "shop", x: -4, y: 9 });
    expect(m.blockedAreas[0]?.polygon).toEqual([
      { x: -1, y: 1 },
      { x: 3, y: 2 },
      { x: 0, y: 6 },
    ]);
    expect(m.props[0]).toEqual({
      id: "t1", kind: "tree", x: -8, y: 2, width: 3, height: 4, rotationDegrees: -30,
    });
  });

  it("leaves roads, background, style and derived fields unchanged", () => {
    const m = mirrorMap(sample);
    expect(m.roads).toEqual(sample.roads);
    expect(m.backgroundPicture).toEqual(sample.backgroundPicture);
    expect(m.style).toEqual(sample.style);
    expect(m.usableRoadIds).toEqual(sample.usableRoadIds);
    expect(m.blockedRoads).toEqual(sample.blockedRoads);
  });

  it("does not change the input map", () => {
    mirrorMap(sample);
    expect(sample.nodes[0]?.x).toBe(10);
  });
});

describe("mirrorHeading", () => {
  it("maps 0 to 180 and 180 to 0", () => {
    expect(mirrorHeading(0)).toBe(180);
    expect(mirrorHeading(180)).toBe(0);
  });

  it("keeps straight down and straight up", () => {
    expect(mirrorHeading(90)).toBe(90);
    expect(mirrorHeading(-90)).toBe(-90);
  });
});

// Feature: engine-core, Property 26: Mirroring twice restores the original map
// **Validates: Requirements 17.4, 17.5**
describe("Property 26: mirroring twice restores the original map", () => {
  // Headings stay in (-180, 180], the range mirrorHeading returns.
  const headingArbitrary = fc.oneof(
    fc.integer({ min: -179, max: 180 }),
    fc.double({ min: -179.5, max: 180, noNaN: true }),
  );

  it("mirrorMap twice equals the original loaded map", () => {
    let withContent = 0;
    fc.assert(
      fc.property(mapFileArbitrary(), (file) => {
        const map = loadValid(file);
        const twice = mirrorMap(mirrorMap(map));
        expect(twice).toEqual(map);
        if (map.nodes.length > 0 && map.nodes.some((n) => n.x !== 0)) withContent++;
      }),
      { numRuns: 100 },
    );
    expect(withContent).toBeGreaterThan(0);
  });

  it("mirrorMap changes the map when it has a node away from x = 0", () => {
    let changed = 0;
    fc.assert(
      fc.property(mapFileArbitrary(), (file) => {
        const map = loadValid(file);
        if (map.nodes.some((n) => n.x !== 0)) {
          expect(mirrorMap(map)).not.toEqual(map);
          changed++;
        }
      }),
      { numRuns: 100 },
    );
    expect(changed).toBeGreaterThan(0);
  });

  it("mirrorHeading twice equals the heading", () => {
    fc.assert(
      fc.property(headingArbitrary, (h) => {
        expect(mirrorHeading(mirrorHeading(h))).toBeCloseTo(h, 9);
      }),
      { numRuns: 200 },
    );
  });
});

// Feature: engine-core, Property 25: Mirroring swaps turns and preserves lengths
// **Validates: Requirements 17.2, 17.3, 17.5**
describe("Property 25: mirroring swaps turns and preserves lengths", () => {
  const swap = (turn: string | undefined): string | undefined =>
    turn === "left" ? "right" : turn === "right" ? "left" : turn;

  it("swaps left and right, keeps turn back, and keeps every length", () => {
    let routes = 0;
    let noRoute = 0;
    let withLeft = 0;
    let withRight = 0;
    let withTurnBack = 0;
    let headingChecks = 0;
    fc.assert(
      fc.property(fc.oneof(smallMapRouteArbitrary(), gridRouteArbitrary()), (c) => {
        const mirroredMap = mirrorMap(c.map);
        const mirroredStart: Position = {
          x: 0 - c.start.x,
          y: c.start.y,
          headingDegrees: mirrorHeading(c.start.headingDegrees),
        };
        const mirroredDestination: Destination =
          "point" in c.destination
            ? { point: { x: 0 - c.destination.point.x, y: c.destination.point.y } }
            : c.destination;

        const original = turnSequence(c.map, c.start, c.destination);
        const mirrored = turnSequence(mirroredMap, mirroredStart, mirroredDestination);

        // A route exists on one side exactly when it exists on the other.
        expect(mirrored === undefined).toBe(original === undefined);
        if (original === undefined || mirrored === undefined) {
          noRoute++;
          return;
        }
        routes++;

        expect(mirrored.roadIds).toEqual(original.roadIds);
        expect(Math.abs(mirrored.routeLength - original.routeLength)).toBeLessThanOrEqual(1e-6);
        expect(mirrored.steps.length).toBe(original.steps.length);
        expect(mirrored.partHeadings.length).toBe(original.partHeadings.length);

        // A heading h maps to 180 - h: a left change becomes a right change of the same size.
        for (let i = 0; i < original.partHeadings.length; i++) {
          const h = original.partHeadings[i]!;
          const m = mirrored.partHeadings[i]!;
          expect(Math.abs(signedAngleDifference(mirrorHeading(h), m))).toBeLessThanOrEqual(1e-6);
          if (i > 0) {
            const before = signedAngleDifference(original.partHeadings[i - 1]!, h);
            const after = signedAngleDifference(mirrored.partHeadings[i - 1]!, m);
            const sameSize = Math.abs(Math.abs(before) - Math.abs(after)) <= 1e-6;
            // A change of exactly 180 has no side, so only its size is compared.
            const flipped = Math.abs(before + after) <= 1e-6 || Math.abs(Math.abs(before) - 180) <= 1e-6;
            expect(sameSize && flipped).toBe(true);
            headingChecks++;
          }
        }

        for (let i = 0; i < original.steps.length; i++) {
          const a = original.steps[i]!;
          const b = mirrored.steps[i]!;
          expect(a.nextTurn as string | undefined).not.toBe("straight-on");
          expect(b.nextTurn as string | undefined).not.toBe("straight-on");
          expect(b.nextTurn as string | undefined).toBe(swap(a.nextTurn));
          expect(b.distanceToTurn === undefined).toBe(a.distanceToTurn === undefined);
          if (a.distanceToTurn !== undefined && b.distanceToTurn !== undefined) {
            expect(Math.abs(a.distanceToTurn - b.distanceToTurn)).toBeLessThanOrEqual(1e-6);
          }
          if (a.distanceLeft !== undefined && b.distanceLeft !== undefined) {
            expect(Math.abs(a.distanceLeft - b.distanceLeft)).toBeLessThanOrEqual(1e-6);
          }
          if (a.nextTurn === "left") withLeft++;
          if (a.nextTurn === "right") withRight++;
          if (a.nextTurn === "turn-back") withTurnBack++;
        }
      }),
      { numRuns: 300 },
    );
    expect(routes).toBeGreaterThan(0);
    expect(noRoute).toBeGreaterThan(0);
    expect(withLeft).toBeGreaterThan(0);
    expect(withRight).toBeGreaterThan(0);
    expect(headingChecks).toBeGreaterThan(0);
    expect(withTurnBack).toBeGreaterThan(0);
  });
});
