// fast-check generators for valid map files. Numbers avoid -0 and NaN so a
// generated file survives a JSON round trip unchanged.

import fc from "fast-check";
import { parseMap } from "../../src/map-loader.js";
import type {
  BackgroundPictureData,
  BlockedAreaData,
  BlockedAreaKind,
  Destination,
  EngineMap,
  MapFile,
  NodeData,
  PlaceData,
  Position,
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

/** An arbitrary point, a little wider than the range the maps use. */
export function pointArbitrary(): fc.Arbitrary<{ x: number; y: number }> {
  const wide = fc.integer({ min: -1200, max: 1200 }).map((n) => n / 2 + 0);
  return fc.record({ x: wide, y: wide });
}

/** A map file with at least one usable road, paired with an index into its usable roads. */
export interface MapWithRoadPoint {
  file: MapFile;
  map: EngineMap;
  /** A point constructed to lie exactly on usable road `roadId`. */
  onRoad: { x: number; y: number };
  roadId: string;
}

/**
 * Generates a loaded map that has at least one usable road, plus a point
 * constructed to lie on one of its usable roads (ends and interior).
 */
export function mapWithPointOnRoadArbitrary(): fc.Arbitrary<MapWithRoadPoint> {
  return mapFileArbitrary()
    .map((file) => ({ file, map: loadValid(file) }))
    .filter(({ map }) => map.usableRoadIds.size > 0)
    .chain(({ file, map }) => {
      const usable = map.roads.filter((r) => map.usableRoadIds.has(r.id));
      return fc
        .tuple(
          fc.integer({ min: 0, max: usable.length - 1 }),
          fc.integer({ min: 0, max: 100 }),
        )
        .map(([index, step]) => {
          const road = usable[index]!;
          const a = map.nodes.find((n) => n.id === road.fromNodeId)!;
          const b = map.nodes.find((n) => n.id === road.toNodeId)!;
          const t = step / 100;
          return {
            file,
            map,
            roadId: road.id,
            onRoad: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
          };
        });
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

/** Most nodes a small map has; the exhaustive search stays fast below this. */
export const SMALL_MAP_MAX_NODES = 12;

/** A coordinate for small maps: a multiple of 5 from -100 to 100. */
const smallCoordinate = fc.integer({ min: -20, max: 20 }).map((n) => n * 5 + 0);

/**
 * Generates a valid small map file: 2 to 12 nodes, each node after the first
 * joined to an earlier node (so most routes are found), extra roads, some
 * one-way, and a few small blocked areas. Node positions are distinct.
 */
export function smallMapFileArbitrary(): fc.Arbitrary<MapFile> {
  return fc
    .integer({ min: 2, max: SMALL_MAP_MAX_NODES })
    .chain((nodeCount) => {
      const positions = fc.uniqueArray(fc.tuple(smallCoordinate, smallCoordinate), {
        minLength: nodeCount,
        maxLength: nodeCount,
        selector: ([x, y]) => `${x},${y}`,
      });
      const links = fc.tuple(
        ...Array.from({ length: nodeCount - 1 }, (_, i) =>
          fc.record({
            to: fc.integer({ min: 0, max: i }),
            oneWay: fc.integer({ min: 0, max: 5 }).map((n) => n === 0),
            reversed: fc.boolean(),
            width: positiveSize,
            kind: fc.constantFrom(...ROAD_KINDS),
          }),
        ),
      );
      const extras = fc.array(
        fc.record({
          a: fc.integer({ min: 0, max: nodeCount - 1 }),
          offset: fc.integer({ min: 1, max: nodeCount - 1 }),
          oneWay: fc.integer({ min: 0, max: 2 }).map((n) => n === 0),
          width: positiveSize,
          kind: fc.constantFrom(...ROAD_KINDS),
        }),
        { maxLength: 8 },
      );
      const areas = fc.array(
        fc.record({
          kind: fc.constantFrom(...AREA_KINDS),
          cx: smallCoordinate,
          cy: smallCoordinate,
          half: fc.integer({ min: 1, max: 6 }).map((n) => n * 2),
        }),
        { maxLength: 2 },
      );
      return fc.record({
        positions,
        links,
        extras,
        areas,
        places: fc.array(placeArb, { maxLength: 4 }),
        style: styleArb,
      });
    })
    .map(({ positions, links, extras, areas, places, style }) => {
      const nodes: NodeData[] = positions.map(([x, y], i) => ({ id: `n${i}`, x, y }));
      const roads: RoadData[] = [];
      const add = (
        from: number,
        to: number,
        width: number,
        kind: RoadKind,
        oneWay: boolean,
      ) => {
        const road: RoadData = {
          id: `r${roads.length}`,
          fromNodeId: `n${from}`,
          toNodeId: `n${to}`,
          width,
          kind,
        };
        if (oneWay) road.oneWay = true;
        roads.push(road);
      };
      links.forEach((l, i) => {
        // Node i+1 joins an earlier node; direction varies for one-way roads.
        if (l.reversed) add(i + 1, l.to, l.width, l.kind, l.oneWay);
        else add(l.to, i + 1, l.width, l.kind, l.oneWay);
      });
      for (const e of extras) {
        add(e.a, (e.a + e.offset) % nodes.length, e.width, e.kind, e.oneWay);
      }
      return {
        formatVersion: 1,
        nodes,
        roads,
        places: places.map((p, i) => ({ id: `p${i}`, ...p })),
        blockedAreas: areas.map((a, i) => ({
          id: `a${i}`,
          kind: a.kind,
          polygon: [
            { x: a.cx - a.half, y: a.cy - a.half },
            { x: a.cx + a.half, y: a.cy - a.half },
            { x: a.cx + a.half, y: a.cy + a.half },
            { x: a.cx - a.half, y: a.cy + a.half },
          ],
        })),
        props: [],
        style,
      } satisfies MapFile;
    });
}

/**
 * Generates a valid grid map of `columns` by `rows` nodes (2 to 4 each) with
 * unit spacing of 10, equal widths and no one-way roads, so many routes have
 * equal-length alternatives. Each node carries a place at its position.
 */
export function gridMapFileArbitrary(): fc.Arbitrary<MapFile> {
  return fc
    .record({
      columns: fc.integer({ min: 2, max: 4 }),
      rows: fc.integer({ min: 2, max: 4 }),
      kind: fc.constantFrom(...ROAD_KINDS),
    })
    .map(({ columns, rows, kind }) => {
      const nodes: NodeData[] = [];
      const roads: RoadData[] = [];
      const id = (c: number, r: number) => `n${r * columns + c}`;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < columns; c++) {
          nodes.push({ id: id(c, r), x: c * 10, y: r * 10 });
        }
      }
      const link = (a: string, b: string) =>
        roads.push({ id: `r${roads.length}`, fromNodeId: a, toNodeId: b, width: 4, kind });
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < columns; c++) {
          if (c + 1 < columns) link(id(c, r), id(c + 1, r));
          if (r + 1 < rows) link(id(c, r), id(c, r + 1));
        }
      }
      return {
        formatVersion: 1,
        nodes,
        roads,
        places: nodes.map((n, i) => ({
          id: `p${i}`,
          name: `Place ${i}`,
          category: "spot",
          x: n.x,
          y: n.y,
        })),
        blockedAreas: [],
        props: [],
        style: { colors: {}, lineStyles: {} },
      } satisfies MapFile;
    });
}

/** A start position for a route: an arbitrary point with a heading. */
export function startArbitrary(): fc.Arbitrary<Position> {
  return fc
    .record({
      x: fc.integer({ min: -120, max: 120 }).map((n) => n + 0),
      y: fc.integer({ min: -120, max: 120 }).map((n) => n + 0),
      headingDegrees: fc.integer({ min: -179, max: 180 }).map((n) => n + 0),
    });
}

/**
 * A destination for `map`: a point, or (when the map has places) a place id.
 * About one in five place destinations names a place that does not exist.
 */
export function destinationArbitrary(map: EngineMap): fc.Arbitrary<Destination> {
  const pointDestination: fc.Arbitrary<Destination> = fc
    .record({
      x: fc.integer({ min: -120, max: 120 }).map((n) => n + 0),
      y: fc.integer({ min: -120, max: 120 }).map((n) => n + 0),
    })
    .map((point) => ({ point }));
  if (map.places.length === 0) return pointDestination;
  const placeDestination: fc.Arbitrary<Destination> = fc
    .integer({ min: 0, max: map.places.length - 1 })
    .map((i) => ({ placeId: map.places[i]!.id }));
  return fc.oneof(
    { arbitrary: pointDestination, weight: 3 },
    { arbitrary: placeDestination, weight: 2 },
  );
}

/** A small loaded map with a start and a destination for it. */
export interface SmallMapRouteCase {
  map: EngineMap;
  start: Position;
  destination: Destination;
}

/** Generates small maps (at most 12 nodes) with a start and a destination. */
export function smallMapRouteArbitrary(): fc.Arbitrary<SmallMapRouteCase> {
  return smallMapFileArbitrary()
    .map((file) => loadValid(file))
    .chain((map) =>
      fc.record({
        map: fc.constant(map),
        start: startArbitrary(),
        destination: destinationArbitrary(map),
      }),
    );
}

/** A grid map with a start and a destination, for equal-length alternatives. */
export function gridRouteArbitrary(): fc.Arbitrary<SmallMapRouteCase> {
  return gridMapFileArbitrary()
    .map((file) => loadValid(file))
    .chain((map) =>
      fc.record({
        map: fc.constant(map),
        start: startArbitrary(),
        destination: destinationArbitrary(map),
      }),
    );
}
