// fast-check generators for valid map files. Numbers avoid -0 and NaN so a
// generated file survives a JSON round trip unchanged.

import fc from "fast-check";
import { parseMap } from "../../src/map-loader.js";
import { findRoute } from "../../src/route-finder.js";
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
  Route,
  RoutePart,
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

/** How a chain map is cut between its left and right halves. */
export type CutKind = "missing-road" | "one-way-wrong-way" | "blocked-road";

/** A chain map that is cut in the middle, with a start on the left and a destination on the right. */
export interface CutMapRouteCase extends SmallMapRouteCase {
  cut: CutKind;
}

/**
 * Generates a straight chain of nodes (spacing 40) with a cut between two
 * neighbours: the joining road is missing, or is one-way against the way from
 * the start to the destination, or lies inside a wall. The start is near the
 * left end, the destination (a point or a place) near the right end. Every
 * cut kind gives an unreachable destination, with its own reason.
 */
export function cutMapRouteArbitrary(): fc.Arbitrary<CutMapRouteCase> {
  return fc
    .record({
      left: fc.integer({ min: 2, max: 5 }),
      right: fc.integer({ min: 2, max: 5 }),
      cut: fc.constantFrom<CutKind>("missing-road", "one-way-wrong-way", "blocked-road"),
      byPlace: fc.boolean(),
      kind: fc.constantFrom(...ROAD_KINDS),
      startOffset: fc.integer({ min: -5, max: 5 }),
      endOffset: fc.integer({ min: -5, max: 5 }),
    })
    .map(({ left, right, cut, byPlace, kind, startOffset, endOffset }) => {
      const count = left + right;
      const nodes: NodeData[] = Array.from({ length: count }, (_, i) => ({
        id: `n${i}`,
        x: i * 40,
        y: 0,
      }));
      const roads: RoadData[] = [];
      const blockedAreas: MapFile["blockedAreas"] = [];
      for (let i = 0; i + 1 < count; i++) {
        const isCut = i === left - 1;
        if (isCut && cut === "missing-road") continue;
        const road: RoadData = {
          id: `r${i}`,
          fromNodeId: `n${i}`,
          toNodeId: `n${i + 1}`,
          width: 4,
          kind,
        };
        if (isCut && cut === "one-way-wrong-way") {
          // Points from the right half to the left half.
          road.fromNodeId = `n${i + 1}`;
          road.toNodeId = `n${i}`;
          road.oneWay = true;
        }
        roads.push(road);
        if (isCut && cut === "blocked-road") {
          const cx = i * 40 + 20;
          blockedAreas.push({
            id: "wall",
            kind: "wall",
            polygon: [
              { x: cx - 5, y: -10 },
              { x: cx + 5, y: -10 },
              { x: cx + 5, y: 10 },
              { x: cx - 5, y: 10 },
            ],
          });
        }
      }
      const endX = (count - 1) * 40;
      const file: MapFile = {
        formatVersion: 1,
        nodes,
        roads,
        places: [{ id: "far", name: "Far end", category: "spot", x: endX, y: 0 }],
        blockedAreas,
        props: [],
        style: { colors: {}, lineStyles: {} },
      };
      const map = loadValid(file);
      const destination: Destination = byPlace
        ? { placeId: "far" }
        : { point: { x: endX, y: endOffset } };
      return {
        cut,
        map,
        start: { x: 0, y: startOffset, headingDegrees: 0 },
        destination,
      };
    });
}

/** A position with the time it was read, in milliseconds. */
export interface PositionSample extends Position {
  timestampMs: number;
}

/** Most the generated positions lie to the side of the route centre line. */
export const MAX_SEQUENCE_OFFSET = 2;

/** Most a generated step goes forward and backward along the route. */
export const MAX_FORWARD_STEP = 10;
export const MAX_BACKWARD_STEP = 3;

/** The point at `distance` along the route, with the heading of the part it lies on. */
function pointAlongRoute(
  route: Route,
  distance: number,
): { x: number; y: number; headingDegrees: number; nx: number; ny: number } {
  let start = 0;
  let last: RoutePart | undefined;
  for (const part of route.parts) {
    const length = Math.hypot(part.end.x - part.start.x, part.end.y - part.start.y);
    if (length === 0) continue;
    last = part;
    if (distance <= start + length) {
      return placeOnPart(part, length, distance - start);
    }
    start += length;
  }
  if (last === undefined) {
    const only = route.parts[0]!;
    return { x: only.start.x, y: only.start.y, headingDegrees: 0, nx: 0, ny: 1 };
  }
  const length = Math.hypot(last.end.x - last.start.x, last.end.y - last.start.y);
  return placeOnPart(last, length, length);
}

function placeOnPart(part: RoutePart, length: number, along: number) {
  const dx = (part.end.x - part.start.x) / length;
  const dy = (part.end.y - part.start.y) / length;
  return {
    x: part.start.x + dx * along,
    y: part.start.y + dy * along,
    headingDegrees: (Math.atan2(dy, dx) * 180) / Math.PI,
    nx: -dy,
    ny: dx,
  };
}

/**
 * Generates 1 to 40 positions that travel forward along `route` (which must
 * have a length above zero), with now and then a small step backward, and a
 * small sideways offset of at most MAX_SEQUENCE_OFFSET. Timestamps increase
 * by 1 to 200 ms from a start time.
 */
export function positionSequenceArbitrary(route: Route): fc.Arbitrary<PositionSample[]> {
  const step = fc.oneof(
    { arbitrary: fc.integer({ min: 0, max: MAX_FORWARD_STEP }), weight: 4 },
    { arbitrary: fc.integer({ min: -MAX_BACKWARD_STEP, max: -1 }), weight: 1 },
  );
  return fc
    .record({
      startTime: fc.integer({ min: 0, max: 100000 }),
      steps: fc.array(
        fc.record({
          delta: step,
          side: fc.integer({ min: -MAX_SEQUENCE_OFFSET, max: MAX_SEQUENCE_OFFSET }),
          elapsedMs: fc.integer({ min: 1, max: 200 }),
        }),
        { minLength: 1, maxLength: 40 },
      ),
    })
    .map(({ startTime, steps }) => {
      let distance = 0;
      let time = startTime;
      return steps.map((s): PositionSample => {
        distance = Math.min(route.lengthWorldUnits, Math.max(0, distance + s.delta));
        time += s.elapsedMs;
        const p = pointAlongRoute(route, distance);
        return {
          x: p.x + p.nx * s.side,
          y: p.y + p.ny * s.side,
          headingDegrees: p.headingDegrees,
          timestampMs: time,
        };
      });
    });
}

/** The reroute margin the looping routes are built around (the engine default). */
export const LOOP_MARGIN = 15;

/** A route that doubles back, with positions that travel along it. */
export interface LoopingRouteCase {
  route: Route;
  /** The margin every loop-back stays within. */
  margin: number;
  /** Search window to hand to the follower. */
  searchWindow: number;
  positions: PositionSample[];
}

/**
 * Generates a zigzag route of 3 to 6 straight legs (each 20 to 120 long, all
 * parallel to the x axis) joined by short connectors of 1 to `margin` long.
 * Each leg after the first runs back alongside the leg two steps earlier at a
 * distance of at most `margin`, so a later stretch lies within the margin of
 * an earlier stretch while being far from it along the route. The route has
 * no map, only parts.
 */
export function loopingRouteArbitrary(margin: number = LOOP_MARGIN): fc.Arbitrary<Route> {
  return fc
    .record({
      legs: fc.array(
        fc.record({
          length: fc.integer({ min: 20, max: 120 }),
          gap: fc.integer({ min: 1, max: Math.max(1, Math.floor(margin)) }),
        }),
        { minLength: 3, maxLength: 6 },
      ),
    })
    .map(({ legs }) => {
      const parts: RoutePart[] = [];
      let x = 0;
      let y = 0;
      let eastward = true;
      const push = (ex: number, ey: number) => {
        parts.push({
          roadId: `r${parts.length}`,
          direction: "forward",
          start: { x, y },
          end: { x: ex, y: ey },
        });
        x = ex;
        y = ey;
      };
      legs.forEach((leg, i) => {
        push(eastward ? leg.length : 0, y);
        eastward = !eastward;
        if (i + 1 < legs.length) push(x, y + leg.gap);
      });
      const lengthWorldUnits = parts.reduce(
        (sum, p) => sum + Math.hypot(p.end.x - p.start.x, p.end.y - p.start.y),
        0,
      );
      return {
        parts,
        lengthWorldUnits,
        destination: { point: { x, y } },
      } satisfies Route;
    });
}

/**
 * Generates a looping route, a search window chosen by the caller (by default
 * one of 10, 25, 50, 100 or 150), and positions that travel along the route.
 */
export function loopingRouteCaseArbitrary(
  searchWindow: fc.Arbitrary<number> = fc.constantFrom(10, 25, 50, 100, 150),
  margin: number = LOOP_MARGIN,
): fc.Arbitrary<LoopingRouteCase> {
  return loopingRouteArbitrary(margin).chain((route) =>
    fc.record({
      route: fc.constant(route),
      margin: fc.constant(margin),
      searchWindow,
      positions: positionSequenceArbitrary(route),
    }),
  );
}

/** A loaded map, a route found on it, and positions that travel along that route. */
export interface MapRouteSequenceCase {
  map: EngineMap;
  start: Position;
  destination: Destination;
  route: Route;
  positions: PositionSample[];
}

/**
 * Generates a small or grid map, a route found on it (length above zero), and
 * a position sequence along that route, for the following and rerouting properties.
 */
export function mapRouteSequenceArbitrary(): fc.Arbitrary<MapRouteSequenceCase> {
  return fc
    .oneof(smallMapRouteArbitrary(), gridRouteArbitrary())
    .map((c) => ({ ...c, found: findRoute(c.map, c.start, c.destination) }))
    .filter(
      (c): c is typeof c & { found: Route } =>
        "parts" in c.found && c.found.lengthWorldUnits > 0,
    )
    .chain((c) =>
      positionSequenceArbitrary(c.found).map(
        (positions): MapRouteSequenceCase => ({
          map: c.map,
          start: c.start,
          destination: c.destination,
          route: c.found,
          positions,
        }),
      ),
    );
}

/** The reroute delay the off-route sequences are built around (the engine default). */
export const SEQUENCE_DELAY_MS = 1000;

/** A straight route whose roads have differing widths, with a width lookup. */
export interface WidthRoute {
  route: Route;
  /** Road width by road id. */
  widths: Record<string, number>;
  roadWidthOf: (roadId: string) => number;
}

/** A sample of a reroute sequence, marked with whether it lies beyond the margin. */
export interface MarkedSample extends PositionSample {
  beyond: boolean;
}

/** A route with differing road widths and a position sequence for the rerouter. */
export interface RerouteSequenceCase extends WidthRoute {
  margin: number;
  delayMs: number;
  samples: MarkedSample[];
}

/**
 * Generates a straight route along the x axis of 2 to 5 parts (each 20 to 100
 * long), each on its own road with its own width (1 to 40, a multiple of 0.5).
 * Widths are drawn so that neighbouring parts often differ.
 */
export function widthRouteArbitrary(): fc.Arbitrary<WidthRoute> {
  return fc
    .array(fc.record({ length: fc.integer({ min: 20, max: 100 }), width: positiveSize }), {
      minLength: 2,
      maxLength: 5,
    })
    .map((list) => {
      const parts: RoutePart[] = [];
      const widths: Record<string, number> = {};
      let x = 0;
      list.forEach((item, i) => {
        const id = `r${i}`;
        parts.push({
          roadId: id,
          direction: "forward",
          start: { x, y: 0 },
          end: { x: x + item.length, y: 0 },
        });
        widths[id] = item.width;
        x += item.length;
      });
      return {
        route: { parts, lengthWorldUnits: x, destination: { point: { x, y: 0 } } },
        widths,
        roadWidthOf: (roadId: string) => widths[roadId]!,
      };
    });
}

/**
 * A position inside part `partIndex` (never on a joint, so the nearest part is
 * that part alone), `side` units from the centre line where `side` is
 * `half width + beyondEdge` (clamped to the centre line), on the chosen side.
 */
function samplePosition(
  wr: WidthRoute,
  partIndex: number,
  along: number,
  beyondEdge: number,
  left: boolean,
  timestampMs: number,
): PositionSample {
  const part = wr.route.parts[partIndex]!;
  const length = part.end.x - part.start.x;
  const x = part.start.x + 1 + (along % (length - 1));
  const magnitude = Math.max(0, wr.widths[part.roadId]! / 2 + beyondEdge);
  return { x, y: left ? -magnitude : magnitude, headingDegrees: 0, timestampMs };
}

/**
 * Generates 1 to 40 positions whose Off_Route_Distance stays at or below the
 * margin: some on the road surface, some wobbling near the margin, some exactly
 * at half the road width plus the margin from the centre line. Roads differ in
 * width. Timestamps increase by 1 to 200 ms.
 */
export function wobbleSequenceArbitrary(
  margin: number = LOOP_MARGIN,
): fc.Arbitrary<RerouteSequenceCase> {
  const beyondEdge = fc.oneof(
    { arbitrary: fc.constant(margin), weight: 3 },
    { arbitrary: fc.integer({ min: Math.floor(margin) - 3, max: Math.floor(margin) }), weight: 3 },
    { arbitrary: fc.integer({ min: -4, max: Math.floor(margin) }), weight: 2 },
  );
  return widthRouteArbitrary().chain((wr) =>
    fc
      .record({
        startTime: fc.integer({ min: 0, max: 100000 }),
        steps: fc.array(
          fc.record({
            part: fc.integer({ min: 0, max: wr.route.parts.length - 1 }),
            along: fc.integer({ min: 0, max: 1000 }),
            beyondEdge,
            left: fc.boolean(),
            elapsedMs: fc.integer({ min: 1, max: 200 }),
          }),
          { minLength: 1, maxLength: 40 },
        ),
      })
      .map(({ startTime, steps }): RerouteSequenceCase => {
        let time = startTime;
        const samples = steps.map((s): MarkedSample => {
          time += s.elapsedMs;
          const p = samplePosition(wr, s.part, s.along, s.beyondEdge, s.left, time);
          return { ...p, beyond: false };
        });
        return { ...wr, margin, delayMs: SEQUENCE_DELAY_MS, samples };
      }),
  );
}

/**
 * Generates sequences of 1 to 3 cycles. Each cycle starts with 1 to 2 samples
 * back within the margin, then leaves: samples beyond the margin (1 to 10 units
 * past it) spaced 50 to 200 ms apart until the stay has lasted at least
 * `delayMs`. The sequence ends beyond the margin. Roads differ in width.
 */
export function offRouteSequenceArbitrary(
  margin: number = LOOP_MARGIN,
  delayMs: number = SEQUENCE_DELAY_MS,
): fc.Arbitrary<RerouteSequenceCase> {
  const awaySteps = Math.ceil(delayMs / 50) + 1;
  const cycle = fc.record({
    returns: fc.array(
      fc.record({
        part: fc.nat(),
        along: fc.nat(1000),
        beyondEdge: fc.integer({ min: -4, max: Math.floor(margin) }),
        left: fc.boolean(),
        elapsedMs: fc.integer({ min: 1, max: 200 }),
      }),
      { minLength: 1, maxLength: 2 },
    ),
    away: fc.array(
      fc.record({
        part: fc.nat(),
        along: fc.nat(1000),
        past: fc.integer({ min: 1, max: 10 }),
        left: fc.boolean(),
        elapsedMs: fc.integer({ min: 50, max: 200 }),
      }),
      { minLength: awaySteps, maxLength: awaySteps },
    ),
  });
  return widthRouteArbitrary().chain((wr) =>
    fc
      .record({
        startTime: fc.integer({ min: 0, max: 100000 }),
        cycles: fc.array(cycle, { minLength: 1, maxLength: 3 }),
      })
      .map(({ startTime, cycles }): RerouteSequenceCase => {
        const count = wr.route.parts.length;
        let time = startTime;
        const samples: MarkedSample[] = [];
        for (const c of cycles) {
          for (const r of c.returns) {
            time += r.elapsedMs;
            const p = samplePosition(wr, r.part % count, r.along, r.beyondEdge, r.left, time);
            samples.push({ ...p, beyond: false });
          }
          let stayStart: number | undefined;
          for (const a of c.away) {
            time += a.elapsedMs;
            stayStart ??= time;
            const p = samplePosition(wr, a.part % count, a.along, margin + a.past, a.left, time);
            samples.push({ ...p, beyond: true });
            if (time - stayStart >= delayMs) break;
          }
        }
        return { ...wr, margin, delayMs, samples };
      }),
  );
}

/**
 * Like `offRouteSequenceArbitrary`, but each of the 1 to 4 cycles is either a
 * full stay (beyond the margin for at least `delayMs`) or a short stay of 1 to
 * 4 samples spaced 50 to 200 ms apart, which lasts less than `delayMs` for the
 * default delay. A short stay is always followed by a return within the margin
 * unless it ends the sequence. Roads differ in width.
 */
export function mixedStaySequenceArbitrary(
  margin: number = LOOP_MARGIN,
  delayMs: number = SEQUENCE_DELAY_MS,
): fc.Arbitrary<RerouteSequenceCase> {
  const fullSteps = Math.ceil(delayMs / 50) + 1;
  const cycle = fc.record({
    full: fc.boolean(),
    returns: fc.array(
      fc.record({
        part: fc.nat(),
        along: fc.nat(1000),
        beyondEdge: fc.integer({ min: -4, max: Math.floor(margin) }),
        left: fc.boolean(),
        elapsedMs: fc.integer({ min: 1, max: 200 }),
      }),
      { minLength: 1, maxLength: 2 },
    ),
    away: fc.array(
      fc.record({
        part: fc.nat(),
        along: fc.nat(1000),
        past: fc.integer({ min: 1, max: 10 }),
        left: fc.boolean(),
        elapsedMs: fc.integer({ min: 50, max: 200 }),
      }),
      { minLength: fullSteps, maxLength: fullSteps },
    ),
    shortCount: fc.integer({ min: 1, max: 4 }),
  });
  return widthRouteArbitrary().chain((wr) =>
    fc
      .record({
        startTime: fc.integer({ min: 0, max: 100000 }),
        cycles: fc.array(cycle, { minLength: 1, maxLength: 4 }),
      })
      .map(({ startTime, cycles }): RerouteSequenceCase => {
        const count = wr.route.parts.length;
        let time = startTime;
        const samples: MarkedSample[] = [];
        for (const c of cycles) {
          for (const r of c.returns) {
            time += r.elapsedMs;
            const p = samplePosition(wr, r.part % count, r.along, r.beyondEdge, r.left, time);
            samples.push({ ...p, beyond: false });
          }
          let stayStart: number | undefined;
          // A short stay of n samples lasts at most (n - 1) * 200 ms, under the delay.
          const limit = c.full ? c.away.length : Math.min(c.shortCount, c.away.length);
          for (let i = 0; i < limit; i++) {
            const a = c.away[i]!;
            time += a.elapsedMs;
            stayStart ??= time;
            const p = samplePosition(wr, a.part % count, a.along, margin + a.past, a.left, time);
            samples.push({ ...p, beyond: true });
            if (c.full && time - stayStart >= delayMs) break;
          }
        }
        return { ...wr, margin, delayMs, samples };
      }),
  );
}
