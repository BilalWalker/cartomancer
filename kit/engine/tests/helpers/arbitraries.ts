// fast-check generators for valid map files. Numbers avoid -0 and NaN so a
// generated file survives a JSON round trip unchanged.

import fc from "fast-check";
import { parseMap } from "../../src/map-loader.js";
import type {
  BackgroundPictureData,
  BlockedAreaData,
  BlockedAreaKind,
  EngineMap,
  MapFile,
  NodeData,
  PlaceData,
  PropData,
  RoadData,
  RoadKind,
  StyleData,
} from "../../src/types.js";

const ROAD_KINDS: RoadKind[] = ["main", "side", "footpath", "corridor"];
const AREA_KINDS: BlockedAreaKind[] = ["mountain", "water", "wall"];

/** A coordinate: a multiple of 0.5 from -500 to 500 (never -0). */
const coordinate = fc.integer({ min: -1000, max: 1000 }).map((n) => n / 2 + 0);

/** A length above zero: a multiple of 0.5 from 0.5 to 40. */
const positiveSize = fc.integer({ min: 1, max: 80 }).map((n) => n / 2);

const word = fc.string({ minLength: 1, maxLength: 12 }).filter((s) => s.trim() !== "");

function nodeArb(index: number): fc.Arbitrary<NodeData> {
  return fc
    .tuple(coordinate, coordinate)
    .map(([x, y]) => ({ id: `n${index}`, x, y }));
}

function roadsArb(nodeCount: number): fc.Arbitrary<RoadData[]> {
  if (nodeCount < 2) return fc.constant([]);
  const one = fc
    .record({
      from: fc.integer({ min: 0, max: nodeCount - 1 }),
      offset: fc.integer({ min: 1, max: nodeCount - 1 }),
      width: positiveSize,
      kind: fc.constantFrom(...ROAD_KINDS),
      oneWay: fc.option(fc.boolean(), { nil: undefined }),
    })
    .map(({ from, offset, width, kind, oneWay }) => ({
      from,
      to: (from + offset) % nodeCount,
      width,
      kind,
      oneWay,
    }));
  return fc.array(one, { maxLength: nodeCount * 2 }).map((list) =>
    list.map((r, i): RoadData => {
      const road: RoadData = {
        id: `r${i}`,
        fromNodeId: `n${r.from}`,
        toNodeId: `n${r.to}`,
        width: r.width,
        kind: r.kind,
      };
      if (r.oneWay !== undefined) road.oneWay = r.oneWay;
      return road;
    }),
  );
}

const placeArb: fc.Arbitrary<Omit<PlaceData, "id">> = fc.record({
  name: word,
  category: word,
  x: coordinate,
  y: coordinate,
});

const blockedAreaArb: fc.Arbitrary<Omit<BlockedAreaData, "id">> = fc.record({
  kind: fc.constantFrom(...AREA_KINDS),
  polygon: fc.array(fc.record({ x: coordinate, y: coordinate }), {
    minLength: 3,
    maxLength: 8,
  }),
});

const propArb: fc.Arbitrary<Omit<PropData, "id">> = fc.record({
  kind: fc.oneof(
    fc.constantFrom("building", "tree", "water", "marker"),
    word,
  ),
  x: coordinate,
  y: coordinate,
  width: positiveSize,
  height: positiveSize,
  rotationDegrees: fc.integer({ min: -720, max: 720 }).map((n) => n + 0),
});

const backgroundArb: fc.Arbitrary<BackgroundPictureData> = fc.record({
  ref: word,
  scale: positiveSize,
  opacity: fc.integer({ min: 0, max: 100 }).map((n) => n / 100),
});

const styleArb: fc.Arbitrary<StyleData> = fc.record({
  colors: fc.dictionary(
    fc.constantFrom("road", "background", "building", "route", "water"),
    fc.constantFrom("#000000", "#ffffff", "#3a7bd5", "#c0392b", "red"),
  ),
  lineStyles: fc.dictionary(
    fc.constantFrom("road", "route", "outline"),
    fc.record(
      {
        width: positiveSize,
        dash: fc.array(fc.integer({ min: 0, max: 20 }), { maxLength: 4 }),
      },
      { requiredKeys: ["width"] },
    ),
  ),
});

/** Generates valid MapFile values with up to `maxNodes` nodes. */
export function mapFileArbitrary(maxNodes = 10): fc.Arbitrary<MapFile> {
  return fc
    .integer({ min: 0, max: maxNodes })
    .chain((nodeCount) =>
      fc.record({
        nodes: fc.tuple(
          ...Array.from({ length: nodeCount }, (_, i) => nodeArb(i)),
        ) as fc.Arbitrary<NodeData[]>,
        roads: roadsArb(nodeCount),
        places: fc.array(placeArb, { maxLength: 6 }),
        blockedAreas: fc.array(blockedAreaArb, { maxLength: 4 }),
        props: fc.array(propArb, { maxLength: 6 }),
        background: fc.option(backgroundArb, { nil: undefined }),
        style: styleArb,
      }),
    )
    .map(({ nodes, roads, places, blockedAreas, props, background, style }) => {
      const file: MapFile = {
        formatVersion: 1,
        nodes,
        roads,
        places: places.map((p, i) => ({ id: `p${i}`, ...p })),
        blockedAreas: blockedAreas.map((a, i) => ({ id: `a${i}`, ...a })),
        props: props.map((p, i) => ({ id: `o${i}`, ...p })),
        style,
      };
      if (background !== undefined) file.backgroundPicture = background;
      return file;
    });
}

/** Load a generated file; throws with the error messages if it does not load. */
export function loadValid(file: MapFile): EngineMap {
  const result = parseMap(JSON.stringify(file));
  if ("errors" in result) {
    throw new Error(
      `Generated map did not load: ${result.errors.map((e) => e.message).join("; ")}`,
    );
  }
  return result.map;
}
