import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { distancePointToSegment } from "../../src/geometry.js";
import { offRouteDistance } from "../../src/route-follower.js";
import {
  mixedStaySequenceArbitrary,
  offRouteSequenceArbitrary,
  wobbleSequenceArbitrary,
  type MarkedSample,
  LOOP_MARGIN,
  loopingRouteCaseArbitrary,
  MAX_FORWARD_STEP,
  MAX_SEQUENCE_OFFSET,
  SMALL_MAP_MAX_NODES,
  mapRouteSequenceArbitrary,
  positionSequenceArbitrary,
  gridMapFileArbitrary,
  gridRouteArbitrary,
  loadValid,
  mapFileArbitrary,
  mapWithPointOnRoadArbitrary,
  pointArbitrary,
  smallMapFileArbitrary,
  smallMapRouteArbitrary,
} from "./arbitraries.js";

describe("map arbitraries", () => {
  it("every generated file loads without errors", () => {
    fc.assert(
      fc.property(mapFileArbitrary(), (file) => {
        const map = loadValid(file);
        expect(map.nodes.length).toBe(file.nodes.length);
      }),
      { numRuns: 100 },
    );
  });

  it("generated props come with and without a blockHeight from 0 to 1,000", () => {
    let withHeight = 0;
    let withoutHeight = 0;
    fc.assert(
      fc.property(mapFileArbitrary(), (file) => {
        for (const prop of file.props) {
          if (prop.blockHeight === undefined) {
            expect("blockHeight" in prop).toBe(false);
            withoutHeight++;
          } else {
            expect(Number.isFinite(prop.blockHeight)).toBe(true);
            expect(prop.blockHeight).toBeGreaterThanOrEqual(0);
            expect(prop.blockHeight).toBeLessThanOrEqual(1000);
            withHeight++;
          }
        }
      }),
      { numRuns: 100 },
    );
    expect(withHeight).toBeGreaterThan(0);
    expect(withoutHeight).toBeGreaterThan(0);
  });

  it("points constructed on a road lie on that usable road", () => {
    fc.assert(
      fc.property(mapWithPointOnRoadArbitrary(), ({ map, roadId, onRoad }) => {
        expect(map.usableRoadIds.has(roadId)).toBe(true);
        const road = map.roads.find((r) => r.id === roadId)!;
        const a = map.nodes.find((n) => n.id === road.fromNodeId)!;
        const b = map.nodes.find((n) => n.id === road.toNodeId)!;
        expect(distancePointToSegment(onRoad, a, b)).toBeLessThan(1e-9);
      }),
      { numRuns: 100 },
    );
  });

  it("arbitrary points are finite", () => {
    fc.assert(
      fc.property(pointArbitrary(), (p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
      { numRuns: 100 },
    );
  });

  it("small maps have at most 12 nodes, load, and include one-way roads and blocked areas over many runs", () => {
    let oneWay = 0;
    let blocked = 0;
    fc.assert(
      fc.property(smallMapFileArbitrary(), (file) => {
        expect(file.nodes.length).toBeLessThanOrEqual(SMALL_MAP_MAX_NODES);
        expect(file.nodes.length).toBeGreaterThanOrEqual(2);
        const map = loadValid(file);
        if (file.roads.some((r) => r.oneWay === true)) oneWay++;
        if (map.blockedRoads.length > 0) blocked++;
      }),
      { numRuns: 200 },
    );
    expect(oneWay).toBeGreaterThan(0);
    expect(blocked).toBeGreaterThan(0);
  });

  it("grid maps load and every road has the same length", () => {
    fc.assert(
      fc.property(gridMapFileArbitrary(), (file) => {
        const map = loadValid(file);
        expect(map.usableRoadIds.size).toBe(file.roads.length);
        for (const road of file.roads) {
          const a = file.nodes.find((n) => n.id === road.fromNodeId)!;
          const b = file.nodes.find((n) => n.id === road.toNodeId)!;
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBe(10);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("route cases give finite starts and destinations that name existing places or points", () => {
    fc.assert(
      fc.property(smallMapRouteArbitrary(), ({ map, start, destination }) => {
        expect(map.nodes.length).toBeLessThanOrEqual(SMALL_MAP_MAX_NODES);
        expect(Number.isFinite(start.x + start.y + start.headingDegrees)).toBe(true);
        if ("placeId" in destination) {
          expect(map.places.some((p) => p.id === destination.placeId)).toBe(true);
        } else {
          expect(Number.isFinite(destination.point.x + destination.point.y)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
    fc.assert(
      fc.property(gridRouteArbitrary(), ({ map }) => map.nodes.length <= 16),
      { numRuns: 100 },
    );
  });

  it("position sequences stay near the route, move forward with small backward steps, and have increasing timestamps", () => {
    let multi = 0;
    fc.assert(
      fc.property(mapRouteSequenceArbitrary(), ({ map, route, positions }) => {
        expect(route.lengthWorldUnits).toBeGreaterThan(0);
        expect(route.parts.length).toBeGreaterThan(0);
        expect(map.nodes.length).toBeGreaterThan(0);
        expect(positions.length).toBeGreaterThanOrEqual(1);
        if (positions.length > 1) multi++;
        for (const p of positions) {
          expect(Number.isFinite(p.x + p.y + p.headingDegrees + p.timestampMs)).toBe(true);
          const nearest = Math.min(
            ...route.parts.map((part) => distancePointToSegment(p, part.start, part.end)),
          );
          expect(nearest).toBeLessThanOrEqual(MAX_SEQUENCE_OFFSET + 1e-9);
        }
        for (let i = 1; i < positions.length; i++) {
          expect(positions[i]!.timestampMs).toBeGreaterThan(positions[i - 1]!.timestampMs);
          // Progress along the route, measured on the centre line near each position.
          const gap = Math.hypot(
            positions[i]!.x - positions[i - 1]!.x,
            positions[i]!.y - positions[i - 1]!.y,
          );
          expect(gap).toBeLessThanOrEqual(
            MAX_FORWARD_STEP + 2 * MAX_SEQUENCE_OFFSET + 1e-9,
          );
        }
        const first = positions[0]!;
        const startsNearRouteStart = route.parts[0]!.start;
        expect(
          Math.hypot(first.x - startsNearRouteStart.x, first.y - startsNearRouteStart.y),
        ).toBeLessThanOrEqual(MAX_FORWARD_STEP + MAX_SEQUENCE_OFFSET + 1e-9);
      }),
      { numRuns: 100 },
    );
    expect(multi).toBeGreaterThan(0);
  });

  it("sequences along a straight route include backward steps", () => {
    const route = {
      parts: [{ roadId: "r0", direction: "forward" as const, start: { x: 0, y: 0 }, end: { x: 500, y: 0 } }],
      lengthWorldUnits: 500,
      destination: { point: { x: 500, y: 0 } },
    };
    let sawBackward = false;
    fc.assert(
      fc.property(positionSequenceArbitrary(route), (positions) => {
        for (let i = 1; i < positions.length; i++) {
          if (positions[i]!.x < positions[i - 1]!.x) sawBackward = true;
        }
      }),
      { numRuns: 100 },
    );
    expect(sawBackward).toBe(true);
  });

  it("looping routes pass within the margin of an earlier stretch, and sequences move along them", () => {
    const windows = new Set<number>();
    fc.assert(
      fc.property(loopingRouteCaseArbitrary(), ({ route, margin, searchWindow, positions }) => {
        windows.add(searchWindow);
        expect(margin).toBe(LOOP_MARGIN);
        // The parts form an unbroken chain and the length adds up.
        let total = 0;
        for (let i = 0; i < route.parts.length; i++) {
          const part = route.parts[i]!;
          if (i > 0) expect(part.start).toEqual(route.parts[i - 1]!.end);
          total += Math.hypot(part.end.x - part.start.x, part.end.y - part.start.y);
        }
        expect(route.lengthWorldUnits).toBeCloseTo(total, 9);
        // Some later stretch (not the part right after) lies within the margin of an earlier one.
        let loops = false;
        for (let j = 2; j < route.parts.length && !loops; j++) {
          const later = route.parts[j]!;
          const mid = {
            x: (later.start.x + later.end.x) / 2,
            y: (later.start.y + later.end.y) / 2,
          };
          for (let i = 0; i < j - 1; i++) {
            const earlier = route.parts[i]!;
            if (distancePointToSegment(mid, earlier.start, earlier.end) <= margin) loops = true;
          }
        }
        expect(loops).toBe(true);
        // Positions move along the route.
        expect(positions.length).toBeGreaterThanOrEqual(1);
        for (const p of positions) {
          const nearest = Math.min(
            ...route.parts.map((part) => distancePointToSegment(p, part.start, part.end)),
          );
          expect(nearest).toBeLessThanOrEqual(MAX_SEQUENCE_OFFSET + 1e-9);
        }
        for (let i = 1; i < positions.length; i++) {
          expect(positions[i]!.timestampMs).toBeGreaterThan(positions[i - 1]!.timestampMs);
        }
      }),
      { numRuns: 100 },
    );
    expect(windows.size).toBeGreaterThan(1);
  });

  it("a caller-supplied search window is used as given", () => {
    fc.assert(
      fc.property(loopingRouteCaseArbitrary(fc.constant(37)), ({ searchWindow }) => {
        expect(searchWindow).toBe(37);
      }),
      { numRuns: 100 },
    );
  });

  it("wobble sequences stay within the margin, reach it exactly, on roads of differing widths", () => {
    let exactlyAtMargin = 0;
    let differingWidths = 0;
    fc.assert(
      fc.property(wobbleSequenceArbitrary(), (c) => {
        expect(c.samples.length).toBeGreaterThanOrEqual(1);
        for (const s of c.samples) {
          const d = offRouteDistance(c.route, s, c.roadWidthOf);
          expect(d).toBeLessThanOrEqual(c.margin);
          if (d === c.margin) exactlyAtMargin++;
          expect(s.beyond).toBe(false);
        }
        for (let i = 1; i < c.samples.length; i++) {
          expect(c.samples[i]!.timestampMs).toBeGreaterThan(c.samples[i - 1]!.timestampMs);
        }
        if (new Set(Object.values(c.widths)).size > 1) differingWidths++;
      }),
      { numRuns: 100 },
    );
    expect(exactlyAtMargin).toBeGreaterThan(0);
    expect(differingWidths).toBeGreaterThan(0);
  });

  it("off-route sequences stay beyond the margin for the delay, with returns in between", () => {
    let multiCycle = 0;
    fc.assert(
      fc.property(offRouteSequenceArbitrary(), (c) => {
        let returns = 0;
        let stayStart: number | undefined;
        let lastBeyond: MarkedSample | undefined;
        c.samples.forEach((s, i) => {
          const d = offRouteDistance(c.route, s, c.roadWidthOf);
          if (s.beyond) {
            expect(d).toBeGreaterThan(c.margin);
            stayStart ??= s.timestampMs;
            lastBeyond = s;
          } else {
            expect(d).toBeLessThanOrEqual(c.margin);
            if (stayStart !== undefined && lastBeyond !== undefined) {
              expect(lastBeyond.timestampMs - stayStart).toBeGreaterThanOrEqual(c.delayMs);
            }
            if (i > 0 && c.samples[i - 1]!.beyond) returns++;
            stayStart = undefined;
          }
        });
        // The last stay is beyond the margin for at least the delay too.
        expect(c.samples[c.samples.length - 1]!.beyond).toBe(true);
        expect(lastBeyond!.timestampMs - stayStart!).toBeGreaterThanOrEqual(c.delayMs);
        if (returns > 0) multiCycle++;
      }),
      { numRuns: 100 },
    );
    expect(multiCycle).toBeGreaterThan(0);
  });

  it("mixed-stay sequences contain both full stays and short stays beyond the margin", () => {
    let shortStays = 0;
    let fullStays = 0;
    fc.assert(
      fc.property(mixedStaySequenceArbitrary(), (c) => {
        let first: number | undefined;
        let last = 0;
        const close = () => {
          if (first === undefined) return;
          if (last - first >= c.delayMs) fullStays++;
          else shortStays++;
          first = undefined;
        };
        for (const s of c.samples) {
          const d = offRouteDistance(c.route, s, c.roadWidthOf);
          if (s.beyond) {
            expect(d).toBeGreaterThan(c.margin);
            first ??= s.timestampMs;
            last = s.timestampMs;
          } else {
            expect(d).toBeLessThanOrEqual(c.margin);
            close();
          }
        }
        close();
      }),
      { numRuns: 100 },
    );
    expect(shortStays).toBeGreaterThan(0);
    expect(fullStays).toBeGreaterThan(0);
  });

  it("loadValid throws when the file does not load", () => {
    const bad = { formatVersion: 1, nodes: [], roads: [] } as never;
    expect(() => loadValid(bad)).toThrow();
  });
});
