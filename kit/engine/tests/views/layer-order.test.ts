import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { EngineMap, Position, RoadData, Route } from "../../src/types.js";
import type { Camera } from "../../src/views/camera.js";
import {
  drawMapLayers,
  LAYER_ORDER,
  type LayerName,
} from "../../src/views/draw-map-layers.js";
import { asImageHandle } from "../../src/views/image-lookup.js";
import { RecordingCanvas, type RecordedCall } from "../../src/views/recording-canvas.js";
import { DEFAULT_STYLE } from "../../src/views/style.js";
import type { VisibleSet } from "../../src/views/visible-set.js";

const NODES = [
  { id: "n0", x: 0, y: 0 },
  { id: "n1", x: 100, y: 0 },
  { id: "n2", x: 100, y: 100 },
  { id: "n3", x: 0, y: 100 },
];

const roadArb: fc.Arbitrary<RoadData & { usable: boolean }> = fc.record({
  id: fc.constant(""),
  fromNodeId: fc.constantFrom("n0", "n1"),
  toNodeId: fc.constantFrom("n2", "n3"),
  width: fc.double({ min: 1, max: 12, noNaN: true }),
  kind: fc.constantFrom("main", "side", "footpath", "corridor"),
  oneWay: fc.boolean(),
  usable: fc.boolean(),
});

const sceneArb = fc.record({
  roads: fc.array(roadArb, { maxLength: 8 }),
  placeNames: fc.array(fc.string({ minLength: 1, maxLength: 6 }), { maxLength: 4 }),
  propKinds: fc.array(fc.constantFrom("house", "tree", "marker", "box"), { maxLength: 4 }),
  background: fc.option(
    fc.record({
      scale: fc.double({ min: 0.1, max: 3, noNaN: true }),
      opacity: fc.double({ min: 0, max: 1, noNaN: true }),
    }),
    { nil: undefined },
  ),
  areaCount: fc.integer({ min: 0, max: 2 }),
  routeLength: fc.integer({ min: 0, max: 3 }),
  camera: fc.record({
    centerX: fc.double({ min: 0, max: 100, noNaN: true }),
    centerY: fc.double({ min: 0, max: 100, noNaN: true }),
    zoom: fc.double({ min: 0.5, max: 8, noNaN: true }),
    rotationDegrees: fc.double({ min: -360, max: 360, noNaN: true }),
    viewportWidth: fc.integer({ min: 200, max: 500 }),
    viewportHeight: fc.integer({ min: 200, max: 500 }),
  }),
  position: fc.record({
    x: fc.double({ min: 0, max: 100, noNaN: true }),
    y: fc.double({ min: 0, max: 100, noNaN: true }),
    headingDegrees: fc.double({ min: -360, max: 360, noNaN: true }),
  }),
});

type Scene = typeof sceneArb extends fc.Arbitrary<infer T> ? T : never;

function build(scene: Scene): { map: EngineMap; visible: VisibleSet; route: Route | undefined } {
  const roads: RoadData[] = scene.roads.map((r, i) => ({
    id: `r${i}`,
    fromNodeId: r.fromNodeId,
    toNodeId: r.toNodeId,
    width: r.width,
    kind: r.kind,
    oneWay: r.oneWay,
  }));
  const map: EngineMap = {
    formatVersion: 1,
    nodes: NODES,
    roads,
    places: scene.placeNames.map((name, i) => ({
      id: `p${i}`,
      name,
      category: "shop",
      x: 10 + i * 20,
      y: 20 + i * 10,
    })),
    blockedAreas: Array.from({ length: scene.areaCount }, (_, i) => ({
      id: `a${i}`,
      kind: "water" as const,
      polygon: [
        { x: 10 * i, y: 10 },
        { x: 40 + 10 * i, y: 10 },
        { x: 20 + 10 * i, y: 40 },
      ],
    })),
    props: scene.propKinds.map((kind, i) => ({
      id: `q${i}`,
      kind,
      x: 30 + i * 10,
      y: 60,
      width: 6,
      height: 6,
      rotationDegrees: 0,
    })),
    ...(scene.background === undefined
      ? {}
      : { backgroundPicture: { ref: "plan", ...scene.background } }),
    style: { colors: {}, lineStyles: {} },
    usableRoadIds: new Set(roads.filter((_, i) => scene.roads[i]!.usable).map((r) => r.id)),
    blockedRoads: [],
  };
  const visible: VisibleSet = {
    roadIds: new Set(roads.map((r) => r.id)),
    blockedAreaIds: new Set(map.blockedAreas.map((a) => a.id)),
    propIds: new Set(map.props.map((p) => p.id)),
    placeIds: new Set(map.places.map((p) => p.id)),
    roadsTested: roads.length,
  };
  const route: Route | undefined =
    scene.routeLength === 0
      ? undefined
      : {
          parts: Array.from({ length: scene.routeLength }, (_, i) => ({
            roadId: `r${i}`,
            direction: "forward" as const,
            start: { x: 10 * i, y: 0 },
            end: { x: 10 * (i + 1), y: 0 },
          })),
          lengthWorldUnits: 10 * scene.routeLength,
          destination: { point: { x: 10 * scene.routeLength, y: 0 } },
        };
  return { map, visible, route };
}

function drawScene(scene: Scene): {
  rec: RecordingCanvas;
  starts: { layer: LayerName; at: number }[];
} {
  const { map, visible, route } = build(scene);
  const rec = new RecordingCanvas();
  const starts: { layer: LayerName; at: number }[] = [];
  const position: Position = scene.position;
  const camera: Camera = scene.camera;
  drawMapLayers(rec, {
    map,
    style: DEFAULT_STYLE,
    camera,
    visible,
    remainingRoute: route,
    position,
    destinationPlaceId: map.places[0]?.id,
    images: { plan: { image: asImageHandle({ name: "plan" }), width: 1000, height: 1000 } },
    onLayer: (layer) => starts.push({ layer, at: rec.getCalls().length }),
  });
  return { rec, starts };
}

function segmentOf(
  calls: readonly RecordedCall[],
  starts: { layer: LayerName; at: number }[],
  layer: LayerName,
): RecordedCall[] {
  const i = starts.findIndex((s) => s.layer === layer);
  const end = i + 1 < starts.length ? starts[i + 1]!.at : calls.length;
  return calls.slice(starts[i]!.at, end);
}

describe("drawMapLayers", () => {
  it("draws the layers in the fixed order and keeps each layer's calls together", () => {
    // Feature: map-views, Property 5: Layer order
    // **Validates: Requirements 6.5**
    fc.assert(
      fc.property(sceneArb, (scene) => {
        const { rec, starts } = drawScene(scene);
        const calls = rec.getCalls();
        expect(starts.map((s) => s.layer)).toEqual([...LAYER_ORDER]);
        for (let i = 1; i < starts.length; i++) {
          expect(starts[i]!.at).toBeGreaterThanOrEqual(starts[i - 1]!.at);
        }
        // The ground is the first thing filled.
        const firstFill = calls.findIndex((c) => c.op === "fill");
        expect(calls[firstFill]!.state.fillColor).toBe(DEFAULT_STYLE.groundColor);
        expect(firstFill).toBeLessThan(starts[1]!.at);
        // The background picture comes right after the ground and before every later layer.
        expect(starts.map((s) => s.layer).slice(0, 2)).toEqual(["ground", "backgroundPicture"]);
        const images = calls.filter((c) => c.op === "drawImage");
        const backgroundCalls = segmentOf(calls, starts, "backgroundPicture");
        expect(backgroundCalls.filter((c) => c.op === "drawImage")).toHaveLength(
          scene.background === undefined ? 0 : 1,
        );
        expect(images).toHaveLength(scene.background === undefined ? 0 : 1);
        // Text is drawn by the label layer only (no picture props are generated).
        for (const layer of LAYER_ORDER) {
          const texts = segmentOf(calls, starts, layer).filter((c) => c.op === "drawText");
          if (layer !== "placeLabels") expect(texts).toHaveLength(0);
        }
        // Road outlines are all drawn before any road fill.
        const outlineEnd = starts.find((s) => s.layer === "roadFills")!.at;
        const fillEnd = starts.find((s) => s.layer === "blockedRoadMarks")!.at;
        const outlineStrokes = segmentOf(calls, starts, "roadOutlines").filter((c) => c.op === "stroke");
        const fillStrokes = segmentOf(calls, starts, "roadFills").filter((c) => c.op === "stroke");
        expect(outlineStrokes.every((c) => c.state.strokeColor === DEFAULT_STYLE.roadOutlineColor)).toBe(true);
        expect(fillStrokes.every((c) => c.state.strokeColor !== DEFAULT_STYLE.roadOutlineColor)).toBe(true);
        expect(outlineEnd).toBeLessThanOrEqual(fillEnd);
        // The route line has only strokes, and sits before the destination marker.
        const route = segmentOf(calls, starts, "routeLine");
        expect(route.some((c) => c.op === "fill")).toBe(false);
        // The player marker is the last thing filled.
        const lastFill = calls.map((c) => c.op).lastIndexOf("fill");
        expect(lastFill).toBeGreaterThanOrEqual(starts[starts.length - 1]!.at);
        expect(calls[lastFill]!.state.fillColor).toBe(DEFAULT_STYLE.playerMarkerColor);
      }),
      { numRuns: 100 },
    );
  });

  it("puts world layers under the camera transform and labels at the identity", () => {
    const scene = fc.sample(sceneArb, 1)[0]!;
    scene.placeNames = ["Bank"];
    scene.camera = { ...scene.camera, zoom: 2, rotationDegrees: 0 };
    const { rec, starts } = drawScene(scene);
    const labels = segmentOf(rec.getCalls(), starts, "placeLabels");
    const text = labels.find((c) => c.op === "drawText");
    expect(text).toBeDefined();
    expect(text!.state.transform).toEqual([1, 0, 0, 1, 0, 0]);
    const ground = segmentOf(rec.getCalls(), starts, "ground").find((c) => c.op === "fill");
    expect(ground!.state.transform[0]).toBeCloseTo(2);
  });

  it("returns a notice and draws nothing for an unusable camera", () => {
    const scene = fc.sample(sceneArb, 1)[0]!;
    const { map, visible } = build(scene);
    const rec = new RecordingCanvas();
    const notices = drawMapLayers(rec, {
      map,
      style: DEFAULT_STYLE,
      camera: { ...scene.camera, zoom: NaN },
      visible,
      position: scene.position,
    });
    expect(notices).toHaveLength(1);
    expect(notices[0]!.message).toContain("zoom");
    expect(rec.getCalls()).toHaveLength(0);
  });
});
