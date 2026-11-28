// The Town_Map (kit/demo/src/town-map.ts) drawn on the Recording_Canvas in
// each View with a route, a player and a destination (Requirements 17.2, 19.8).

import { describe, expect, it } from "vitest";
import { Engine } from "../../src/engine.js";
import { parseMap } from "../../src/map-loader.js";
import type { EngineMap, Position, Route } from "../../src/types.js";
import { blockHeightOf, RAISED_KINDS } from "../../src/views/block-height.js";
import { FullMap } from "../../src/views/full-map.js";
import { Minimap } from "../../src/views/minimap.js";
import { RecordingCanvas } from "../../src/views/recording-canvas.js";
import { DEFAULT_STYLE } from "../../src/views/style.js";
import { TiltedView } from "../../src/views/tilted-view.js";
import { isViewError } from "../../src/views/view-errors.js";
import { townMap, townMapText } from "../../../demo/src/town-map.js";

function loadTown(): EngineMap {
  const result = parseMap(townMapText);
  if (!("map" in result)) throw new Error(result.errors.map((e) => e.message).join("; "));
  return result.map;
}

interface Scenario {
  map: EngineMap;
  position: Position;
  route: Route;
  destinationPlaceId: string;
}

/** The player stands at the junction in the middle and goes to the Market. */
function scenario(): Scenario {
  const map = loadTown();
  const engine = new Engine();
  const loaded = engine.loadMap(townMapText);
  if (!("map" in loaded)) throw new Error("the Town_Map did not load");
  const position: Position = { x: 300, y: 150, headingDegrees: 0 };
  expect(engine.feedPosition(position, 0)).toBeUndefined();
  const route = engine.setDestination({ placeId: "p-market" });
  if (!("parts" in route)) throw new Error("no route to the Market");
  return { map, position, route, destinationPlaceId: "p-market" };
}

/** Every colour the canvas was asked to fill or stroke with. */
function coloursUsed(canvas: RecordingCanvas): Set<string> {
  const colours = new Set<string>();
  for (const call of canvas.getCalls()) {
    if (call.op === "setFillColor" || call.op === "setStrokeColor") colours.add(call.args[0] as string);
  }
  return colours;
}

function textsDrawn(canvas: RecordingCanvas): string[] {
  return canvas.findCalls("drawText").map((c) => c.args[0] as string);
}

describe("Town_Map content", () => {
  it("loads with parseMap and has the required variety", () => {
    const map = loadTown();
    expect(map.nodes.length).toBeGreaterThanOrEqual(12);
    expect(new Set(map.roads.map((r) => r.kind)).size).toBeGreaterThanOrEqual(3);
    expect(map.places.length).toBeGreaterThanOrEqual(6);
    expect(map.roads.filter((r) => r.oneWay === true)).toHaveLength(1);
    expect(map.blockedAreas.length).toBeGreaterThanOrEqual(1);
    expect(map.blockedRoads.map((b) => b.roadId)).toEqual(["r-gk"]);
    expect(map.props.length).toBeGreaterThanOrEqual(6);
    expect(map.props.filter((p) => RAISED_KINDS.includes(p.kind)).length).toBeGreaterThanOrEqual(3);
    const own = map.props.filter((p) => p.blockHeight !== undefined);
    expect(own).toHaveLength(1);
    expect(blockHeightOf(own[0]!, {})).toBe(40);
    expect(townMap.nodes).toHaveLength(map.nodes.length);
  });

  it("gives a route from the Station to every other place", () => {
    const engine = new Engine();
    expect("map" in engine.loadMap(townMapText)).toBe(true);
    expect(engine.feedPosition({ x: 225, y: 150, headingDegrees: 0 }, 0)).toBeUndefined();
    for (const place of townMap.places) {
      if (place.id === "p-station") continue;
      const route = engine.setDestination({ placeId: place.id });
      expect(route, place.name).toHaveProperty("parts");
    }
  });
});

describe("Town_Map drawn in each View", () => {
  it("draws the Minimap with roads, blocked area, props, route, markers and labels", () => {
    const { map, position, route, destinationPlaceId } = scenario();
    const minimap = Minimap.create(map, { width: 300, height: 300, zoom: 1 });
    if (isViewError(minimap)) throw new Error(minimap.message);
    const canvas = new RecordingCanvas();
    const drawn = minimap.draw(canvas, { position, remainingRoute: route, destinationPlaceId }, 0);
    if (isViewError(drawn)) throw new Error(drawn.message);
    expect(drawn.drew).toBe(true);
    const colours = coloursUsed(canvas);
    expect(colours.has(DEFAULT_STYLE.roadColors.main)).toBe(true);
    expect(colours.has(DEFAULT_STYLE.roadColors.side)).toBe(true);
    expect(colours.has(DEFAULT_STYLE.blockedAreaColors.water)).toBe(true);
    expect(colours.has(DEFAULT_STYLE.blockedRoadColor)).toBe(true);
    expect(colours.has(DEFAULT_STYLE.propColor)).toBe(true);
    expect(colours.has(DEFAULT_STYLE.routeLineColor)).toBe(true);
    expect(colours.has(DEFAULT_STYLE.playerMarkerColor)).toBe(true);
    expect(colours.has(DEFAULT_STYLE.destinationMarkerColor)).toBe(true);
    expect(textsDrawn(canvas)).toContain("Market");
  });

  it("draws the Full_Map with the whole town and every place label", () => {
    const { map, position, route, destinationPlaceId } = scenario();
    const fullMap = FullMap.create(map, { width: 800, height: 500 });
    if (isViewError(fullMap)) throw new Error(fullMap.message);
    const canvas = new RecordingCanvas();
    const drawn = fullMap.draw(canvas, { position, remainingRoute: route, destinationPlaceId }, 0);
    if (isViewError(drawn)) throw new Error(drawn.message);
    expect(drawn.drew).toBe(true);
    const colours = coloursUsed(canvas);
    for (const kind of ["main", "side", "footpath"] as const) {
      expect(colours.has(DEFAULT_STYLE.roadColors[kind]), kind).toBe(true);
    }
    expect(colours.has(DEFAULT_STYLE.blockedAreaColors.water)).toBe(true);
    expect(colours.has(DEFAULT_STYLE.blockedRoadColor)).toBe(true);
    expect(colours.has(DEFAULT_STYLE.propColor)).toBe(true);
    expect(colours.has(DEFAULT_STYLE.routeLineColor)).toBe(true);
    expect(colours.has(DEFAULT_STYLE.playerMarkerColor)).toBe(true);
    expect(colours.has(DEFAULT_STYLE.destinationMarkerColor)).toBe(true);
    const texts = textsDrawn(canvas);
    for (const place of townMap.places) expect(texts, place.name).toContain(place.name);
  });

  it("draws the Tilted_View with raised blocks, route, markers and labels", () => {
    const { map, position, route, destinationPlaceId } = scenario();
    const tilted = TiltedView.create(map, { width: 400, height: 300, zoom: 1 });
    if (isViewError(tilted)) throw new Error(tilted.message);
    const canvas = new RecordingCanvas();
    const drawn = tilted.draw(canvas, { position, remainingRoute: route, destinationPlaceId }, 0);
    if (isViewError(drawn)) throw new Error(drawn.message);
    expect(drawn.drew).toBe(true);
    const colours = coloursUsed(canvas);
    expect(colours.has(DEFAULT_STYLE.roadColors.main)).toBe(true);
    expect(colours.has(DEFAULT_STYLE.blockedAreaColors.water)).toBe(true);
    expect(colours.has(DEFAULT_STYLE.blockedRoadColor)).toBe(true);
    expect(colours.has(DEFAULT_STYLE.raisedBlockTopColor)).toBe(true);
    expect(colours.has(DEFAULT_STYLE.raisedBlockSideColor)).toBe(true);
    expect(colours.has(DEFAULT_STYLE.propColor)).toBe(true);
    expect(colours.has(DEFAULT_STYLE.routeLineColor)).toBe(true);
    expect(colours.has(DEFAULT_STYLE.playerMarkerColor)).toBe(true);
    expect(colours.has(DEFAULT_STYLE.destinationMarkerColor)).toBe(true);
    expect(textsDrawn(canvas).length).toBeGreaterThan(0);
  });
});
