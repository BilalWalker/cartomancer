import { describe, expect, it } from "vitest";
import type { EngineMap, RoadData } from "../../src/types.js";
import type { Camera } from "../../src/views/camera.js";
import {
  ARROW_MIN_SPACING_PX,
  drawBlockedRoadMarks,
  drawOneWayArrows,
  drawRoadFills,
  drawRoadOutlines,
} from "../../src/views/layers-roads.js";
import { RecordingCanvas } from "../../src/views/recording-canvas.js";
import { DEFAULT_STYLE, resolveStyle } from "../../src/views/style.js";

function camera(zoom = 1): Camera {
  return {
    centerX: 0,
    centerY: 0,
    zoom,
    rotationDegrees: 0,
    viewportWidth: 400,
    viewportHeight: 400,
  };
}

function makeMap(roads: RoadData[], usable: string[]): EngineMap {
  return {
    formatVersion: 1,
    nodes: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 100, y: 0 },
      { id: "c", x: 0, y: 100 },
    ],
    roads,
    places: [],
    blockedAreas: [],
    props: [],
    style: { colors: {}, lineStyles: {} },
    usableRoadIds: new Set(usable),
    blockedRoads: [],
  };
}

const road = (id: string, to: string, extra: Partial<RoadData> = {}): RoadData => ({
  id,
  fromNodeId: "a",
  toNodeId: to,
  width: 8,
  kind: "main",
  ...extra,
});

describe("road layers", () => {
  it("draws all outlines before all fills with the outline wider", () => {
    const map = makeMap([road("r1", "b"), road("r2", "c", { kind: "side" })], ["r1", "r2"]);
    const rec = new RecordingCanvas();
    const ids = ["r1", "r2"];
    drawRoadOutlines(rec, map, ids, camera(), DEFAULT_STYLE);
    drawRoadFills(rec, map, ids, camera(), DEFAULT_STYLE);
    const strokes = rec.getCalls().filter((c) => c.op === "stroke");
    expect(strokes).toHaveLength(4);
    const colors = strokes.map((c) => c.state.strokeColor);
    expect(colors).toEqual([
      DEFAULT_STYLE.roadOutlineColor,
      DEFAULT_STYLE.roadOutlineColor,
      DEFAULT_STYLE.roadColors.main,
      DEFAULT_STYLE.roadColors.side,
    ]);
    const widths = strokes.map((c) => c.state.lineWidth);
    expect(widths[0]).toBe(8 + DEFAULT_STYLE.roadOutlineStyle.widthPx);
    expect(widths[2]).toBe(8);
  });

  it("draws a kind with a styled dash dashed and others solid", () => {
    const map = makeMap([road("r1", "b", { kind: "footpath" }), road("r2", "c")], ["r1", "r2"]);
    const rec = new RecordingCanvas();
    drawRoadFills(rec, map, ["r1", "r2"], camera(2), DEFAULT_STYLE);
    const dashes = rec.findCalls("setLineDash").map((c) => c.args[0]);
    expect(dashes).toEqual([[], [3, 2]]);
  });

  it("uses a dash from the map style", () => {
    const { resolved } = resolveStyle({
      colors: {},
      lineStyles: { "road.main": { width: 1, dash: [10, 2] } },
    });
    const map = makeMap([road("r1", "b")], ["r1"]);
    const rec = new RecordingCanvas();
    drawRoadFills(rec, map, ["r1"], camera(), resolved);
    expect(rec.findCalls("setLineDash")[0]!.args[0]).toEqual([10, 2]);
  });

  it("draws one arrow path per kind and spaces arrowheads at least 40 px apart", () => {
    const map = makeMap(
      [
        road("r1", "b", { oneWay: true }),
        road("r2", "c", { oneWay: true }),
        road("r3", "b", { oneWay: true, kind: "side" }),
        road("r4", "c"),
      ],
      ["r1", "r2", "r3", "r4"],
    );
    const rec = new RecordingCanvas();
    drawOneWayArrows(rec, map, ["r1", "r2", "r3", "r4"], camera(), DEFAULT_STYLE);
    expect(rec.getPathCount()).toBe(2);
    expect(rec.findCalls("fill")).toHaveLength(2);
    // r1 is 100 px long: 2 arrowheads of 3 moveTo each... one moveTo per head.
    const moves = rec.findCalls("moveTo");
    // r1: 2 heads, r2: 2 heads, r3: 2 heads.
    expect(moves).toHaveLength(6);
    const tipsOnR1 = moves.slice(0, 2).map((c) => (c.args as number[])[0]!);
    expect(Math.abs(tipsOnR1[1]! - tipsOnR1[0]!)).toBeGreaterThanOrEqual(ARROW_MIN_SPACING_PX);
  });

  it("points arrowheads in the travel direction", () => {
    const map = makeMap([road("r1", "b", { oneWay: true })], ["r1"]);
    const small = makeMap([{ ...road("r1", "b", { oneWay: true }) }], ["r1"]);
    small.nodes[1] = { id: "b", x: 30, y: 0 };
    const rec = new RecordingCanvas();
    drawOneWayArrows(rec, small, ["r1"], camera(), DEFAULT_STYLE);
    const tip = rec.findCalls("moveTo")[0]!.args as number[];
    const base = rec.findCalls("lineTo")[0]!.args as number[];
    expect(tip[0]!).toBeGreaterThan(base[0]!);
    expect(map.roads).toHaveLength(1);
  });

  it("draws no arrows for a usable two-way road or a blocked one-way road", () => {
    const map = makeMap([road("r1", "b"), road("r2", "c", { oneWay: true })], ["r1"]);
    const rec = new RecordingCanvas();
    drawOneWayArrows(rec, map, ["r1", "r2"], camera(), DEFAULT_STYLE);
    expect(rec.getCalls()).toHaveLength(0);
  });

  it("draws blocked roads as one dashed path per width in the blocked colour", () => {
    const map = makeMap(
      [road("r1", "b"), road("r2", "c"), road("r3", "c", { width: 3 }), road("r4", "b")],
      ["r4"],
    );
    const rec = new RecordingCanvas();
    drawBlockedRoadMarks(rec, map, ["r1", "r2", "r3", "r4"], camera(), DEFAULT_STYLE);
    expect(rec.getPathCount()).toBe(2);
    const strokes = rec.findCalls("stroke");
    expect(strokes.every((c) => c.state.strokeColor === DEFAULT_STYLE.blockedRoadColor)).toBe(
      true,
    );
    expect(rec.findCalls("setLineDash").map((c) => c.args[0])).toEqual([[8, 5], [8, 5]]);
  });

  it("returns a Notice and draws nothing for a zoom that is not usable", () => {
    const map = makeMap([road("r1", "b", { oneWay: true })], ["r1"]);
    const rec = new RecordingCanvas();
    const n = drawOneWayArrows(rec, map, ["r1"], camera(0), DEFAULT_STYLE);
    expect(n).toHaveLength(1);
    expect(drawRoadFills(rec, map, ["r1"], camera(NaN), DEFAULT_STYLE)).toHaveLength(1);
    expect(rec.getCalls()).toHaveLength(0);
  });
});
