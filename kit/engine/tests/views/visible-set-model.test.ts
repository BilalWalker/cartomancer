import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { generateLargeMapFile } from "../../bench/generate-large-map.js";
import { parseMap } from "../../src/map-loader.js";
import type { EngineMap } from "../../src/types.js";
import { createCamera, type Camera } from "../../src/views/camera.js";
import {
  buildSpatialIndex,
  computeVisibleSet,
  visibleRegion,
  type Bounds,
} from "../../src/views/visible-set.js";
import { isViewError } from "../../src/views/view-errors.js";
import { naiveVisible } from "./helpers/naive-visibility-check.js";

const coord = fc.integer({ min: -500, max: 1500 });

const mapArb: fc.Arbitrary<EngineMap> = fc
  .record({
    nodes: fc.array(fc.record({ x: coord, y: coord }), { minLength: 2, maxLength: 12 }),
    roadPairs: fc.array(fc.tuple(fc.nat(11), fc.nat(11)), { maxLength: 20 }),
    places: fc.array(fc.record({ x: coord, y: coord }), { maxLength: 6 }),
    props: fc.array(
      fc.record({
        x: coord,
        y: coord,
        width: fc.integer({ min: 1, max: 80 }),
        height: fc.integer({ min: 1, max: 80 }),
        rotationDegrees: fc.integer({ min: -720, max: 720 }),
      }),
      { maxLength: 6 },
    ),
    areas: fc.array(
      fc.array(fc.record({ x: coord, y: coord }), { minLength: 3, maxLength: 5 }),
      { maxLength: 4 },
    ),
  })
  .map((g) => {
    const nodes = g.nodes.map((n, i) => ({ id: `n${i}`, ...n }));
    const roads = g.roadPairs.map(([a, b], i) => ({
      id: `r${i}`,
      fromNodeId: nodes[a % nodes.length]!.id,
      toNodeId: nodes[b % nodes.length]!.id,
      width: 4,
      kind: "side",
    }));
    return {
      formatVersion: 1,
      nodes,
      roads,
      places: g.places.map((p, i) => ({ id: `p${i}`, name: `P${i}`, category: "c", ...p })),
      blockedAreas: g.areas.map((polygon, i) => ({ id: `a${i}`, kind: "water", polygon })),
      props: g.props.map((p, i) => ({ id: `b${i}`, kind: "house", ...p })),
      style: { colors: {}, lineStyles: {} },
      usableRoadIds: new Set(roads.map((r) => r.id)),
      blockedRoads: [],
    } as EngineMap;
  });

const cameraArb = fc
  .record({
    centerX: fc.integer({ min: -500, max: 1500 }),
    centerY: fc.integer({ min: -500, max: 1500 }),
    zoom: fc.double({ min: 0.05, max: 5, noNaN: true }),
    rotationDegrees: fc.integer({ min: -400, max: 400 }),
    viewportWidth: fc.integer({ min: 50, max: 800 }),
    viewportHeight: fc.integer({ min: 50, max: 800 }),
  })
  .map((init) => createCamera(init) as Camera);

const marginArb = fc.double({ min: 0, max: 50, noNaN: true });

function sorted(set: Set<string>): string[] {
  return [...set].sort();
}

// Every item that touches the unturned viewport must be in the visible set.
// The viewport here is worked out from centre, size and zoom, while
// visibleRegion works it out from the screen corners, so the two edges can
// differ by rounding error (about 1e-13). visibleRegion widens its result by
// a small rounding allowance, so the check here is strict: the exact viewport.
function expectHeldBy(map: EngineMap, camera: Camera): void {
  const half = { w: camera.viewportWidth / 2 / camera.zoom, h: camera.viewportHeight / 2 / camera.zoom };
  const viewport = {
    minX: camera.centerX - half.w,
    maxX: camera.centerX + half.w,
    minY: camera.centerY - half.h,
    maxY: camera.centerY + half.h,
  };
  const set = computeVisibleSet(buildSpatialIndex(map), visibleRegion(camera, 0) as Bounds);
  const inView = naiveVisible(map, viewport);
  for (const id of inView.roadIds) expect(set.roadIds.has(id)).toBe(true);
  for (const id of inView.blockedAreaIds) expect(set.blockedAreaIds.has(id)).toBe(true);
  for (const id of inView.propIds) expect(set.propIds.has(id)).toBe(true);
  for (const id of inView.placeIds) expect(set.placeIds.has(id)).toBe(true);
}

describe("computeVisibleSet", () => {
  // Feature: map-views, Property 4: Nothing visible is left out
  it("equals a plain check of every item against the region (model)", () => {
    fc.assert(
      fc.property(mapArb, cameraArb, marginArb, (map, camera, margin) => {
        const region = visibleRegion(camera, margin) as Bounds;
        const set = computeVisibleSet(buildSpatialIndex(map), region);
        const expected = naiveVisible(map, region);
        expect(sorted(set.roadIds)).toEqual([...expected.roadIds].sort());
        expect(sorted(set.blockedAreaIds)).toEqual([...expected.blockedAreaIds].sort());
        expect(sorted(set.propIds)).toEqual([...expected.propIds].sort());
        expect(sorted(set.placeIds)).toEqual([...expected.placeIds].sort());
      }),
      { numRuns: 200 },
    );
  });

  // Feature: map-views, Property 4: Nothing visible is left out
  it("holds every item that touches an unturned viewport", () => {
    fc.assert(
      fc.property(mapArb, cameraArb, (map, turned) => {
        expectHeldBy(map, { ...turned, rotationDegrees: 0 });
      }),
      { numRuns: 200 },
    );
  });

  // Counterexample found by seed 1669665862: the prop's left edge is at 545,
  // and the viewport's right edge is 545 up to floating point error (the zoom
  // is 0.05000000000000001, so 27 / zoom is 539.9999999999999).
  it("holds a prop whose edge touches the viewport edge to within rounding", () => {
    const map = {
      formatVersion: 1,
      nodes: [],
      roads: [],
      places: [],
      blockedAreas: [],
      props: [
        { id: "b0", kind: "house", x: 558, y: 0, width: 26, height: 1, rotationDegrees: 0 },
      ],
      style: { colors: {}, lineStyles: {} },
      usableRoadIds: new Set<string>(),
      blockedRoads: [],
    } as unknown as EngineMap;
    const camera = createCamera({
      centerX: 5,
      centerY: 0,
      zoom: 0.05000000000000001,
      rotationDegrees: 0,
      viewportWidth: 54,
      viewportHeight: 50,
    }) as Camera;
    expectHeldBy(map, camera);
  });

  // Feature: map-views, Property 4: Nothing visible is left out
  it("holds every road when the camera shows the whole extent", () => {
    fc.assert(
      fc.property(mapArb, fc.integer({ min: -720, max: 720 }), (map, rotationDegrees) => {
        // Every coordinate is within -500..1500 (and props reach at most ~115 beyond).
        const camera = createCamera({
          centerX: 500,
          centerY: 500,
          zoom: 0.1,
          rotationDegrees,
          viewportWidth: 1000,
          viewportHeight: 1000,
        }) as Camera;
        const set = computeVisibleSet(
          buildSpatialIndex(map),
          visibleRegion(camera, 0) as Bounds,
        );
        expect(set.roadIds.size).toBe(map.roads.length);
      }),
      { numRuns: 100 },
    );
  });

  it("finds a road on a small hand-made map and leaves a far one out", () => {
    const map = {
      formatVersion: 1,
      nodes: [
        { id: "a", x: 0, y: 0 },
        { id: "b", x: 50, y: 0 },
        { id: "c", x: 5000, y: 5000 },
        { id: "d", x: 5050, y: 5000 },
      ],
      roads: [
        { id: "near", fromNodeId: "a", toNodeId: "b", width: 4, kind: "side" },
        { id: "far", fromNodeId: "c", toNodeId: "d", width: 4, kind: "side" },
      ],
      places: [],
      blockedAreas: [],
      props: [],
      style: { colors: {}, lineStyles: {} },
      usableRoadIds: new Set(["near", "far"]),
      blockedRoads: [],
    } as EngineMap;
    const camera = createCamera({ centerX: 25, centerY: 0, viewportWidth: 100, viewportHeight: 100 }) as Camera;
    const set = computeVisibleSet(buildSpatialIndex(map), visibleRegion(camera, 5) as Bounds);
    expect([...set.roadIds]).toEqual(["near"]);
  });

  it("tests at most 25% of 5,000 roads for a region over at most 5% of them", () => {
    const loaded = parseMap(JSON.stringify(generateLargeMapFile(1)));
    if (!("map" in loaded)) throw new Error("the generated map did not load");
    const map = loaded.map;
    expect(map.roads.length).toBe(5000);
    const index = buildSpatialIndex(map);
    // The map spans about 4,900 by 4,900 units. A 600 by 600 window holds well under 5%.
    const camera = createCamera({
      centerX: 2400,
      centerY: 2400,
      zoom: 1,
      viewportWidth: 600,
      viewportHeight: 600,
    }) as Camera;
    const region = visibleRegion(camera, 12) as Bounds;
    const set = computeVisibleSet(index, region);
    const expected = naiveVisible(map, region);
    expect(set.roadIds.size).toBe(expected.roadIds.length);
    expect(set.roadIds.size).toBeLessThanOrEqual(5000 * 0.05);
    expect(set.roadsTested).toBeLessThanOrEqual(5000 * 0.25);
    expect(set.roadsTested).toBeGreaterThanOrEqual(set.roadIds.size);
  });
});

describe("visibleRegion", () => {
  const camera = createCamera({ centerX: 10, centerY: 20, zoom: 2, viewportWidth: 100, viewportHeight: 60 }) as Camera;

  it("is the viewport in world units widened by the margin", () => {
    const region = visibleRegion(camera, 5) as Bounds;
    expect(region.minX).toBeCloseTo(-20, 6);
    expect(region.maxX).toBeCloseTo(40, 6);
    expect(region.minY).toBeCloseTo(0, 6);
    expect(region.maxY).toBeCloseTo(40, 6);
    // The region is never narrower than the exact viewport plus margin.
    expect(region.minX).toBeLessThanOrEqual(-20);
    expect(region.maxX).toBeGreaterThanOrEqual(40);
    expect(region.minY).toBeLessThanOrEqual(0);
    expect(region.maxY).toBeGreaterThanOrEqual(40);
  });

  it("returns a plain error for a bad margin", () => {
    for (const bad of [-1, Number.NaN, Infinity, -Infinity]) {
      expect(isViewError(visibleRegion(camera, bad))).toBe(true);
    }
    expect(isViewError(visibleRegion(camera, 0))).toBe(false);
  });

  it("returns a plain error for a bad camera", () => {
    expect(isViewError(visibleRegion({ ...camera, zoom: 0 }, 1))).toBe(true);
  });
});
