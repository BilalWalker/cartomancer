import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { EngineMap, RoadData, RoadKind } from "../../src/types.js";
import type { Camera } from "../../src/views/camera.js";
import {
  batchBlockedRoads,
  batchUsableRoads,
  drawRoadPass,
  segmentOf,
} from "../../src/views/road-batching.js";
import { RecordingCanvas } from "../../src/views/recording-canvas.js";
import { DEFAULT_STYLE } from "../../src/views/style.js";

const KINDS: RoadKind[] = ["main", "side", "footpath", "corridor"];

function camera(zoom: number): Camera {
  return {
    centerX: 0,
    centerY: 0,
    zoom,
    rotationDegrees: 0,
    viewportWidth: 300,
    viewportHeight: 300,
  };
}

/** A map with `usable` roads of one kind and width and `blocked` blocked roads of one width. */
function buildMap(usable: number, blocked: number, kind: RoadKind, width: number): EngineMap {
  const roads: RoadData[] = [];
  const usableRoadIds = new Set<string>();
  for (let i = 0; i < usable + blocked; i++) {
    const isUsable = i < usable;
    roads.push({
      id: `r${i}`,
      fromNodeId: "a",
      toNodeId: "b",
      width,
      kind: isUsable ? kind : "side",
    });
    if (isUsable) usableRoadIds.add(`r${i}`);
  }
  return {
    formatVersion: 1,
    nodes: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 10, y: 5 },
    ],
    roads,
    places: [],
    blockedAreas: [],
    props: [],
    style: { colors: {}, lineStyles: {} },
    usableRoadIds,
    blockedRoads: [],
  };
}

/** Draws the outline pass, the fill pass and the blocked pass; returns the paths begun. */
function pathsFor(map: EngineMap, zoom: number): number {
  const rec = new RecordingCanvas();
  const cam = camera(zoom);
  const ids = map.roads.map((r) => r.id);
  const usable = batchUsableRoads(ids, map, cam, DEFAULT_STYLE);
  const blocked = batchBlockedRoads(ids, map, cam);
  const seg = (id: string) => segmentOf(map, id);
  drawRoadPass(rec, usable.outlines, seg, () => {});
  drawRoadPass(rec, usable.fills, seg, () => {});
  drawRoadPass(rec, blocked.batches, seg, () => {});
  return rec.getPathCount();
}

describe("road batching path count", () => {
  it("Property 18: path count does not depend on the number of roads", () => {
    // Feature: map-views, Property 18: Path count does not depend on the number of roads
    // **Validates: Requirements 5.10, 5.11, 22.1, 22.2, 22.5**
    fc.assert(
      fc.property(
        fc.constantFrom(...KINDS),
        fc.double({ min: 0.5, max: 20, noNaN: true }),
        fc.double({ min: 0.05, max: 20, noNaN: true }),
        fc.integer({ min: 1, max: 5000 }),
        fc.integer({ min: 1, max: 5000 }),
        (kind, width, zoom, n, m) => {
          const one = pathsFor(buildMap(1, 1, kind, width), zoom);
          const many = pathsFor(buildMap(n, m, kind, width), zoom);
          expect(many).toBe(one);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("draws 5,000 roads of one kind and width in as many paths as 1 road", () => {
    const one = pathsFor(buildMap(1, 0, "main", 8), 1);
    const many = pathsFor(buildMap(5000, 0, "main", 8), 1);
    expect(many).toBe(one);
    expect(many).toBe(2);
  });

  it("uses one moveTo and one lineTo per road and one stroke per batch", () => {
    const map = buildMap(7, 0, "main", 8);
    const rec = new RecordingCanvas();
    const b = batchUsableRoads(
      map.roads.map((r) => r.id),
      map,
      camera(1),
      DEFAULT_STYLE,
    );
    drawRoadPass(rec, b.fills, (id) => segmentOf(map, id), () => {});
    expect(rec.findCalls("moveTo")).toHaveLength(7);
    expect(rec.findCalls("lineTo")).toHaveLength(7);
    expect(rec.findCalls("stroke")).toHaveLength(1);
    expect(rec.findCalls("setLineJoin")[0]!.args).toEqual(["round"]);
    expect(rec.findCalls("setLineCap")[0]!.args).toEqual(["round"]);
  });

  it("raises a thin road to 1 px and shares the batch with float noise", () => {
    const map = buildMap(2, 0, "main", 0.1);
    map.roads[1]!.width = 0.1 + 1e-12;
    const b = batchUsableRoads(["r0", "r1"], map, camera(1), DEFAULT_STYLE);
    expect(b.fills).toHaveLength(1);
    expect(b.fills[0]!.widthPx).toBe(1);
    expect(b.fills[0]!.roadIds).toEqual(["r0", "r1"]);
  });

  it("gives no outline to a footpath or corridor under 2 px but keeps its fill", () => {
    const thin = buildMap(1, 0, "footpath", 1.5);
    const t = batchUsableRoads(["r0"], thin, camera(1), DEFAULT_STYLE);
    expect(t.outlines).toHaveLength(0);
    expect(t.fills).toHaveLength(1);
    const wide = buildMap(1, 0, "footpath", 2);
    const w = batchUsableRoads(["r0"], wide, camera(1), DEFAULT_STYLE);
    expect(w.outlines).toHaveLength(1);
    const main = buildMap(1, 0, "main", 1.5);
    expect(batchUsableRoads(["r0"], main, camera(1), DEFAULT_STYLE).outlines).toHaveLength(1);
  });

  it("makes the outline wider than the fill by the outline width", () => {
    const map = buildMap(1, 0, "main", 8);
    const b = batchUsableRoads(["r0"], map, camera(1), DEFAULT_STYLE);
    expect(b.fills[0]!.widthPx).toBe(8);
    expect(b.outlines[0]!.widthPx).toBe(8 + DEFAULT_STYLE.roadOutlineStyle.widthPx);
  });

  it("orders batches by kind then width", () => {
    const map = buildMap(3, 0, "main", 8);
    map.roads[0]!.kind = "footpath";
    map.roads[1]!.width = 12;
    map.roads[2]!.width = 4;
    const b = batchUsableRoads(["r0", "r1", "r2"], map, camera(1), DEFAULT_STYLE);
    expect(b.fills.map((x) => `${x.kind}${x.widthPx}`)).toEqual(["main4", "main12", "footpath8"]);
  });

  it("leaves out a road with a bad width and names it in a Notice", () => {
    for (const width of [0, -1, NaN, Infinity]) {
      const map = buildMap(2, 1, "main", 8);
      map.roads[0]!.width = width;
      map.roads[2]!.width = width;
      const ids = ["r0", "r1", "r2"];
      const usable = batchUsableRoads(ids, map, camera(1), DEFAULT_STYLE);
      expect(usable.fills.flatMap((b) => b.roadIds)).toEqual(["r1"]);
      expect(usable.notices).toHaveLength(1);
      expect(usable.notices[0]!.message).toContain('"r0"');
      expect(usable.notices[0]!.message).toContain("greater than 0");
      const blocked = batchBlockedRoads(ids, map, camera(1));
      expect(blocked.batches).toHaveLength(0);
      expect(blocked.notices[0]!.message).toContain('"r2"');
    }
  });

  it("groups blocked roads by pixel width", () => {
    const map = buildMap(0, 3, "main", 8);
    map.roads[2]!.width = 3;
    const b = batchBlockedRoads(["r0", "r1", "r2"], map, camera(1));
    expect(b.batches.map((x) => [x.widthPx, x.roadIds])).toEqual([
      [3, ["r2"]],
      [8, ["r0", "r1"]],
    ]);
  });

  it("returns a Notice and no batches for a zoom that is not usable", () => {
    const map = buildMap(1, 1, "main", 8);
    for (const zoom of [0, -1, NaN]) {
      const u = batchUsableRoads(["r0"], map, camera(zoom), DEFAULT_STYLE);
      expect(u.fills).toHaveLength(0);
      expect(u.notices).toHaveLength(1);
      expect(batchBlockedRoads(["r1"], map, camera(zoom)).notices).toHaveLength(1);
    }
  });

  it("skips a road whose node is missing and begins no path for an empty batch", () => {
    const map = buildMap(1, 0, "main", 8);
    map.roads[0]!.toNodeId = "missing";
    const rec = new RecordingCanvas();
    const b = batchUsableRoads(["r0"], map, camera(1), DEFAULT_STYLE);
    drawRoadPass(rec, b.fills, (id) => segmentOf(map, id), () => {});
    expect(rec.getPathCount()).toBe(0);
  });
});
