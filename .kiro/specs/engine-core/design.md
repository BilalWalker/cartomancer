# Design Document

## Overview

This design covers Block A of `docs/brief.md`: the engine core, built in `kit/engine/`. The engine core is a pure TypeScript package with no runtime dependency. It loads and saves map files, finds routes, follows a moving player along a route, decides when to reroute, and produces guidance (distance, next turn, plain sentences). It knows nothing about cars, missions, buildings or any other application concept, and it runs in Node without a browser.

The engine is organized as a pipeline of small, single-purpose components, each in its own file, composed by one top-level `Engine` class that implements the `Engine_API` (Requirement 18):

```
Map_File text --[Map_Loader]--> Map (+ Notices) --[Route_Finder]--> Route | No_Way_Result
                                                        |
Position + timestamp --[Route_Follower]--> remaining Route --[Rerouter]--> reroute request
                                                        |
                                              [Guidance] --> Guidance data --[Guidance_Text]--> sentence
```

All geometry follows the Screen_Convention: x grows right, y grows down, a heading is in degrees clockwise from the positive x axis (0 is right, 90 is down the screen), and left and right are as seen on the screen by someone travelling along the Route. A clockwise change of heading is a right change; a counter-clockwise change is a left change.

The `Engine` class owns the current `Map`, the active `Destination`, the remaining `Route`, the follower's `Progress`, and the `Rerouter`'s timing state. Every other component is a pure function or a small stateless/explicitly-stateful class that the `Engine` calls; none of them touch the system clock, `window`, `document` or any browser global.

## Architecture

### Package layout

```
kit/engine/
  package.json          # no "dependencies"; devDependencies: typescript, vitest, fast-check
  tsconfig.json          # strict: true
  src/
    index.ts             # public Engine_API surface (re-exports only, Req 18.10)
    engine.ts            # Engine class: owns state, wires components together
    types.ts             # shared types: Map, Node, Road, Place, Blocked_Area, Prop,
                          # Background_Picture, Style, Position, Route, Route_Part,
                          # Guidance, No_Way_Result, Notice, Engine_Error
    map-loader.ts         # parseMap(text): LoadResult (Map + Notices) | { errors }
    map-loader-checks.ts  # the individual field/shape checks used by map-loader.ts
    map-saver.ts          # saveMap(map): string
    blocked-roads.ts      # classifyBlockedRoads(map): { blockedRoadIds, notices }
    geometry.ts           # point/segment distance, polygon crossing, heading, angle-diff
    snapping.ts           # snapToRoad(map, point): Snapped_Point | NoUsableRoadResult
    route-finder.ts       # findRoute(map, start, destination): Route | No_Way_Result
    route-follower.ts     # advance(route, position): remaining Route
    rerouter.ts            # Rerouter class: margin/delay state machine (pure, timestamp-driven)
    guidance.ts            # computeGuidance(remainingRoute, position, heading, destination): Guidance
    guidance-text.ts       # toSentence(guidance, noWayResult?): string
    mirror.ts              # mirrorMap(map): Map  (test-only helper, still shipped from src
                          # so both engine tests and the maker/apps can reuse it; Req 17.1)
    errors.ts              # EngineError type + factory helpers for plain-worded messages
    format.ts              # MAP_FILE_FORMAT_VERSION constant and shared format docs anchors
  docs/
    map-file-format.md    # Requirement 1.5: full field-by-field format reference
    api.md                 # Requirement 18.7: one entry per exported function/type, with
                          # description, inputs, outputs, one usage example each
  tests/
    map-loader.test.ts
    map-loader-errors.test.ts      # example-based: one hand-written bad file per error case
    map-saver-roundtrip.test.ts
    blocked-roads.test.ts
    snapping.test.ts
    route-finder-chain.test.ts
    route-finder-optimality.test.ts
    route-finder-unreachable.test.ts
    route-finder-rules.test.ts
    route-follower.test.ts
    route-follower-looping.test.ts  # no-jump-ahead property on looping routes
    rerouter.test.ts
    rerouter-edge-margin.test.ts    # margin measured from the road edge, differing widths
    reroute-result.test.ts
    guidance-turn.test.ts
    guidance-next-turn.test.ts      # straight-on skipping, never-straight-on property
    guidance-arrival.test.ts
    guidance-arrival-blocked.test.ts # hand-written blocked-area arrival example
    screen-convention.test.ts       # hand-written left/right examples (heading 0)
    guidance-text.test.ts
    mirror.test.ts
    engine-api.test.ts
    helpers/
      arbitraries.ts        # fast-check generators: Map, Node, Road, Place, Blocked_Area,
                          # Prop, Position, small-map (<=12 nodes) variants
      exhaustive-search.ts # independent brute-force shortest-path search (Req 9.3: no
                          # shared code with route-finder.ts)
  bench/
    generate-large-map.ts  # seeded Large_Generated_Map generator (Req 20.1)
    route-bench.ts          # benchmark command (Req 20.2-20.4), run outside Default_Suite
```

One file per component keeps each task-sized unit small: the loader's per-field checks live in `map-loader-checks.ts` separate from the orchestration in `map-loader.ts`; geometry primitives are isolated in `geometry.ts` so `snapping.ts`, `blocked-roads.ts` and `route-finder.ts` depend on them without duplicating math.

### Data flow for one frame

```mermaid
sequenceDiagram
    participant App as Application
    participant Eng as Engine
    participant Fol as Route_Follower
    participant Rer as Rerouter
    participant Fin as Route_Finder
    participant Gui as Guidance

    App->>Eng: feedPosition(position, timestampMs)
    Eng->>Fol: advance(remainingRoute, position)
    Fol-->>Eng: trimmedRoute
    Eng->>Rer: update(trimmedRoute, position, timestampMs)
    alt reroute requested
        Rer-->>Eng: requestReroute
        Eng->>Fin: findRoute(map, position, destination)
        Fin-->>Eng: newRoute | No_Way_Result
    end
    Eng->>Gui: computeGuidance(route, position, heading, destination)
    Gui-->>Eng: guidanceData
    Eng-->>App: guidanceData, guidanceSentence, remainingRoute
```

### Design decisions and rationale

- **One `Engine` class as the only stateful component.** All geometry, loading, saving and classification functions are pure (map/value in, value out). `Rerouter` is the one component with its own small internal clock-state (elapsed-beyond-margin time), but it takes every timestamp as an argument (Req 13.8) rather than reading the system clock, so it stays a deterministic, directly testable unit even though it is "stateful" across calls.
- **Blocked-road classification happens in the loader, not the route finder.** Requirement 5 says the loader classifies and reports `Blocked_Road`s as part of building the `Map`; the `Route_Finder` then just filters `map.usableRoadIds` (computed once at load time) rather than re-running geometry on every route request. This also lets `Engine_API` expose the blocked-road list and notices directly from the loaded `Map` (Req 5.4) without recomputation.
- **Snapping is a separate module from route finding.** Both the `Route_Finder` (start/destination snapping) and the maker/applications (click-to-destination) need snapping; isolating it in `snapping.ts` keeps the module reusable and independently testable against the snapping property (Req 7.4/7.5).
- **The exhaustive search used for the optimality and unreachable properties lives under `tests/helpers/`, not `src/`.** Requirement 9.3 requires it to share no code with the route finder; keeping it test-only in a separate directory makes that separation structural, not just a convention.
- **`mirror.ts` ships from `src/`, not `tests/helpers/`.** The brief frames mirroring as a map operation ("mirroring a map swaps every left turn for a right turn"), useful beyond tests (e.g. a maker "flip map" feature later). Shipping it from `src/` costs nothing extra and keeps the mirror property test a thin consumer of real production code, matching the model-based-testing idea of testing through the real API.
- **Error reporting is centralized in `errors.ts`.** Every rejection across the loader, the API guard checks (Req 18.8/18.9) and the route finder's `No_Way_Result` reasons is built through the same small set of factory helpers, so "plain words, no jargon" (Req 4.5) is enforced in one place rather than re-implemented per call site.

## Components and Interfaces

### `types.ts`
Shared structural types with no behavior: `Map`, `Node`, `Road`, `Place`, `Blocked_Area`, `Prop`, `Background_Picture`, `Style`, `Position`, `Destination`, `Snapped_Point`, `Route`, `Route_Part`, `No_Way_Result`, `Notice`, `Guidance`, `EngineError`, `LoadResult`. `Map` additionally carries a precomputed `usableRoadIds: Set<string>` and `blockedRoads: { roadId, areaId }[]` filled in by the loader.

### `map-loader.ts` — `parseMap(text: string): LoadResult`
Orchestrates: parse JSON (Req 4.1) → check top-level shape and `Format_Version` first (Req 1.2/1.3, 4.2) → run every check from `map-loader-checks.ts` across nodes, roads, places, blocked areas, props, background picture and style, collecting every error rather than stopping at the first (Req 4.6) → if any error exists, return `{ errors }` with no `Map` (Req 4.3/4.7) → else build the `Map`, call `classifyBlockedRoads` (Req 5.1/5.2), and return `{ map, notices }`.

### `map-loader-checks.ts`
One exported check function per field group (`checkNodes`, `checkRoads`, `checkPlaces`, `checkBlockedAreas`, `checkProps`, `checkBackgroundPicture`, `checkStyle`), each returning a list of `EngineError`. Kept separate from `map-loader.ts` so each check is independently unit-testable and small.

### `map-saver.ts` — `saveMap(map: Map): string`
Writes the current `Format_Version` (Req 6.2) and every field the loader reads, in a stable key order, so that `saveMap` is deterministic for the idempotence property (Req 6.4).

### `blocked-roads.ts` — `classifyBlockedRoads(map): { blockedRoadIds: Set<string>, notices: Notice[] }`
Uses `geometry.ts`'s segment/polygon-crossing test to find every road whose centre line touches or crosses a blocked area; returns exactly one notice per blocked road (Req 5.2/5.5).

### `geometry.ts`
Pure math helpers: `distancePointToSegment`, `nearestPointOnSegment`, `segmentCrossesPolygon`, `headingOfSegment`, `signedAngleDifference`, `classifyTurn`. No engine-specific types beyond plain numbers and points.

Sign convention (Screen_Convention): `headingOfSegment(a, b) = atan2(b.y - a.y, b.x - a.x)` in degrees, so with y down a heading grows clockwise on the screen. `signedAngleDifference(before, after)` returns `after - before` normalised to the range (-180, 180]. A positive result is a clockwise (right) change, a negative result is a counter-clockwise (left) change. `classifyTurn(delta)` returns `straight-on` for `|delta| <= 30`, `right` for `30 < delta <= 150`, `left` for `-150 <= delta < -30`, and `turn-back` for `|delta| > 150`. Example: travelling right (heading 0) onto a road that goes up the screen gives heading -90, so the turn is left; onto a road that goes down the screen gives heading 90, so the turn is right.

### `snapping.ts` — `snapToRoad(map, point): Snapped_Point | NoUsableRoadResult`
Scans `map.usableRoadIds`, finds the nearest point per road via `geometry.ts`, and on ties picks the lowest road identifier (Req 7.2). Returns a typed "no usable road" result when `map.usableRoadIds` is empty (Req 7.3), which `route-finder.ts` turns into a `No_Way_Result`.

### `route-finder.ts` — `findRoute(map, start: Position | Snapped_Point, destination: Destination): Route | No_Way_Result`
Snaps start and destination (Req 7.1, 11.3/11.4), runs Dijkstra over `usableRoadIds` respecting one-way direction (Req 11.1/11.2), and on success returns an ordered `Route_Part[]` with road id, direction and endpoints (Req 8.6); ties are broken by a fixed deterministic ordering (lowest road id first in adjacency iteration) so repeated calls on the same inputs return the same route (Req 8.5). When start and destination snap to the same point, returns a zero-length route without running the search (Req 8.4). When no path exists, returns a `No_Way_Result` whose reason is chosen from a fixed set (no usable road / separate parts / one-way blocks the way / blocked roads cut the way) based on which condition the search detected (Req 10.2).

### `route-follower.ts` — `advance(route: Route, progress: number, position: Position, searchWindow = 100): { remaining: Route; progress: number }`
`progress` is the distance in world units along the original route to the last accepted place of the player. The follower searches for the point nearest to `position` only among route points whose distance along the route lies in `[progress, progress + searchWindow]` (Req 12.1). It sets the new `progress` to the distance along the route of that nearest point and returns a `remaining` route with everything before that point removed (Req 12.2). Because the search starts at the current progress, removed parts are never reconsidered and `progress` never decreases, so the remaining route only shrinks (Req 12.3/12.4). Because the search stops at `progress + searchWindow`, a later stretch of a looping route that passes near the player cannot pull the progress ahead; no part beyond the window is removed (Req 12.6). A caller-supplied `searchWindow` replaces the default (Req 12.5).

The same file exports `offRouteDistance(remaining: Route, position: Position, roadWidthOf: (roadId: string) => number): number`: the distance from `position` to the nearest point of the remaining route, minus half the width of the road in use at that point (the Off_Route_Distance). It is measured from the road edge, not the centre line, and is negative or zero when the player is on the road surface. `Rerouter` and `Guidance` both use it so the margin is computed in one place.

### `rerouter.ts` — `class Rerouter`
Constructed with `{ margin = 15, delayMs = 1000 }` (Req 13.6 overrides the defaults from the glossary). `update(remainingRoute, position, timestampMs, roadWidthOf: (roadId: string) => number): { requestReroute: boolean }`. The road width lookup is required because the margin is measured from the road edge: the rerouter computes the Off_Route_Distance with `offRouteDistance` (distance to the nearest route point minus half the width of the road in use). The player is beyond the margin when that value is greater than `margin`, which is when the distance from the centre line is greater than half the road width plus `margin`. If beyond the margin, it starts or continues an internal "off since" timestamp; if the value returns to `margin` or less first, the timer is cancelled (Req 13.3); if the elapsed time reaches `delayMs` without returning, it returns `requestReroute: true` once and resets so it will not fire again until the player returns within the margin and then overstays it again (Req 13.1-13.5). Takes every timestamp as a parameter and never reads the wall clock (Req 13.8).

### `guidance.ts` — `computeGuidance(remainingRoute, position, destination, offRouteDistance, margin = 15, arrivalRadius = 10): Guidance`
- Distance left is the length of the remaining route along its parts (Req 15.1).
- Turn points are the joints between consecutive route parts. Each is classified with `geometry.signedAngleDifference` and `classifyTurn` (heading after minus heading before, 30°/150° bands, Req 15.3).
- The Next_Turn is the first turn point ahead classified as `left`, `right` or `turn-back`. Every `straight-on` point is skipped and never reported (Req 15.9). If no such point remains, the guidance holds a distance left and no Next_Turn (Req 15.10). The `nextTurn` type excludes `straight-on`, so it cannot be reported (Req 15.11).
- If the first route part points more than 150° away from the player's heading, `turn-back` is reported at distance zero (Req 15.4).
- `arrived` is set when the distance left along the remaining route is `<= arrivalRadius` AND `offRouteDistance <= margin` (Req 15.5). It is never computed from the straight-line distance between position and destination (Req 15.12), so a destination just behind a blocked area, near in a straight line but far along the route, is not arrived. While `arrived` is set, distance left is 0 and there is no Next_Turn (Req 15.6).
- Returns the "no route active" shape when `remainingRoute` is `undefined` (Req 15.7).

### `guidance-text.ts` — `toSentence(guidance: Guidance, noWayResult?: No_Way_Result): string`
A pure function of its arguments only (Req 16.5). It produces "turn left in N", "turn right in N" or "turn back in N" (N rounded to the nearest whole world unit) when a Next_Turn exists, "You have arrived." when `arrived` is set (with the place name when the destination is a `Place`, Req 16.6), "go straight on" for the rounded distance left when there is a distance and no Next_Turn, and a no-route sentence that includes the No_Way_Result reason when one exists (Req 16.1-16.4).

### `mirror.ts` — `mirrorMap(map: Map): Map`
Negates the x of every `Node`, `Place`, `Prop`, `Blocked_Area` point and `Background_Picture` position, and negates `Prop` rotation (Req 17.1). Under the Screen_Convention a heading `h` maps to `180 - h` (Req 17.5), so a left change of heading becomes a right change of the same size; the engine's geometry derives headings from the mirrored coordinates, so no stored heading needs rewriting except a `Position` heading passed through the exported helper `mirrorHeading(h) = 180 - h`. Road widths, kinds, one-way flags and identifiers are unchanged, and mirroring twice is its own inverse (Req 17.4; `180 - (180 - h) = h`, and `-(-x) = x`).

### `errors.ts`
`EngineError { message: string; field?: string; item?: string; position?: { line, column } }` plus small factory functions (`notValidJson`, `missingField`, `duplicateId`, `unknownReference`, `outOfRange`, ...) that all compose plain-worded, jargon-free messages (Req 4.4/4.5), used by both the loader checks and the API's input guards (Req 18.8/18.9).

### `engine.ts` — `class Engine` (implements `Engine_API`, Req 18)
```
loadMap(text: string): LoadResult
setDestination(destination: { placeId: string } | { point: Point }): Route | No_Way_Result
feedPosition(position: Position, timestampMs: number): void
configure(options: { searchWindow?: number; rerouteMargin?: number; rerouteDelayMs?: number; arrivalRadius?: number }): void  // Req 12.5, 13.6
clearDestination(): void
getRoute(): Route | undefined
getRemainingRoute(): Route | undefined
getGuidance(): Guidance
getGuidanceSentence(): string
getLastNoWayResult(): No_Way_Result | undefined
getBlockedRoads(): { roadId: string; notices: Notice[] }[]
getPlaces(): Place[]
```
Guards every input (type/finite checks) before touching state and leaves state unchanged on a rejected call (Req 18.8); rejects `feedPosition` with a plain "no map is loaded" error if called before `loadMap` succeeds (Req 18.9).

### `index.ts`
Re-exports only `Engine`, the documented types from `types.ts`, and `mirrorMap` (needed by test helpers and, later, the maker) — nothing else, so the module's export list matches `docs/api.md` exactly (Req 18.10).

## Data Models

```ts
type FormatVersion = 1;

interface MapFile {
  formatVersion: FormatVersion;
  nodes: NodeData[];
  roads: RoadData[];
  places: PlaceData[];
  blockedAreas: BlockedAreaData[];
  props: PropData[];
  backgroundPicture?: BackgroundPictureData;
  style: StyleData;
}

interface NodeData { id: string; x: number; y: number }

type RoadKind = "main" | "side" | "footpath" | "corridor";
interface RoadData {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  width: number;
  kind: RoadKind;
  oneWay?: boolean; // travel allowed only fromNodeId -> toNodeId when true
}

interface PlaceData { id: string; name: string; category: string; x: number; y: number }

type BlockedAreaKind = "mountain" | "water" | "wall";
interface BlockedAreaData {
  id: string;
  kind: BlockedAreaKind;
  polygon: { x: number; y: number }[]; // length >= 3
}

interface PropData {
  id: string;
  kind: string;
  x: number; y: number;
  width: number; height: number;
  rotationDegrees: number;
}

interface BackgroundPictureData {
  ref: string;
  scale: number;    // > 0
  opacity: number;  // 0..1 inclusive
}

interface StyleData {
  colors: Record<string, string>;
  lineStyles: Record<string, { dash?: number[]; width: number }>;
}

// In-memory Map adds derived, precomputed fields:
interface EngineMap extends MapFile {
  usableRoadIds: Set<string>;
  blockedRoads: { roadId: string; blockedAreaId: string }[];
}

// Screen_Convention: x right, y down, heading in degrees clockwise from +x (0 = right, 90 = down).
interface Position { x: number; y: number; headingDegrees: number }

interface EngineOptions {
  searchWindow: number;   // default 100 world units
  rerouteMargin: number;  // default 15, measured from the road edge
  rerouteDelayMs: number; // default 1000
  arrivalRadius: number;  // default 10, measured along the remaining route
}

// Follower state kept by Engine: distance along the original route, never decreases.
interface FollowerState { progress: number }

// Off_Route_Distance = distance(position, nearest remaining-route point) - roadWidth / 2.
// Beyond the margin when offRouteDistance > rerouteMargin.
type OffRouteDistance = number;

type Destination = { placeId: string } | { point: { x: number; y: number } };

interface SnappedPoint { x: number; y: number; roadId: string; distanceAlongRoad: number }

interface RoutePart {
  roadId: string;
  direction: "forward" | "backward"; // relative to fromNodeId -> toNodeId
  start: { x: number; y: number };
  end: { x: number; y: number };
}

interface Route { parts: RoutePart[]; lengthWorldUnits: number; destination: Destination }

type NoWayReason =
  | "no-usable-road"
  | "separate-parts"
  | "one-way-blocks-the-way"
  | "blocked-roads-cut-the-way"
  | "missing-place";

interface NoWayResult { reason: NoWayReason; message: string; placeId?: string }

interface Notice { roadId: string; blockedAreaId: string; message: string }

// Classification of any turn point.
type Turn = "left" | "right" | "straight-on" | "turn-back";
// Only these can be reported as the Next_Turn; straight-on points are skipped.
type NextTurn = Exclude<Turn, "straight-on">;

interface Guidance {
  active: boolean;
  distanceLeftWorldUnits?: number;
  nextTurn?: NextTurn; // absent when no left/right/turn-back point remains

  distanceToTurnWorldUnits?: number;
  arrived?: boolean;
}

interface EngineError {
  message: string;
  field?: string;
  item?: string;
  position?: { line: number; column: number };
}

type LoadResult =
  | { map: EngineMap; notices: Notice[] }
  | { errors: EngineError[] };
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

PBT is appropriate throughout the engine core: every component is a pure function (or, for `Rerouter`, a function of an explicit timestamp) over structured data — maps, points, routes, position sequences — with a large input space and clear universal invariants. The properties below were derived from the prework analysis, with closely related acceptance criteria folded into a single property where one subsumes or is a facet of another (noted inline).

### Property 1: Loader validation matches injected faults

For all generated `MapFile` candidates that are either fully valid or have exactly one injected fault (duplicate node id, dangling road reference, non-distinct road endpoints, non-positive width, unknown road kind, non-boolean one-way flag, invalid place/blocked-area/prop/background-picture/style field, malformed JSON text, non-object top level, missing required top-level field, or an unsupported `formatVersion`), `parseMap` accepts the valid candidates and rejects every faulty candidate with at least one error naming the faulty item and field.

**Validates: Requirements 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.1, 4.2, 4.4**

### Property 2: Loader never returns a map together with errors

For all generated `MapFile` text, `parseMap`'s result is either a map with no errors or a list of errors with no map, never both, and a rejected result always has an empty `map` field.

**Validates: Requirements 4.3, 4.7**

### Property 3: Multiple independent faults are all reported

For all generated valid maps with two or more independent faults injected at once, `parseMap` reports at least one error per injected fault in a single result.

**Validates: Requirements 4.6**

### Property 4: Blocked roads are classified and noticed exactly

For all generated maps with blocked areas, the set of roads classified as `Blocked_Road` equals exactly the set of roads whose centre line touches or crosses a blocked area, each with exactly one notice naming the road and the area, and a map with no such roads produces no notices.

**Validates: Requirements 5.1, 5.2, 5.5**

### Property 5: Map round trip

For all generated valid `EngineMap`s covering every road kind, every blocked-area kind, props, and both the presence and absence of a background picture, loading the text produced by `saveMap` yields a map equal to the original field for field.

**Validates: Requirements 6.1, 6.2, 6.3**

### Property 6: Save is idempotent after a round trip

For all generated valid `EngineMap`s, saving, loading the result, and saving again produces text identical to the first saved text.

**Validates: Requirements 6.4**

### Property 7: Snapping finds the nearest usable point

For all generated maps with at least one usable road and all generated points (both arbitrary points and points constructed to lie exactly on a usable road), the distance from the point to its snapped point is less than or equal to the distance from the point to every other sampled point on every usable road, and for points already on a usable road the snapped point equals the original point within 0.001 world units; snapping the same point against the same map always selects the same road when two roads are equally near.

**Validates: Requirements 7.2, 7.4, 7.5**

### Property 8: A returned route is an unbroken chain of usable roads

For all generated maps, starts and destinations where `findRoute` returns a `Route`, each part has a road id, a direction and start/end points; the first part starts at the snapped start point, each part ends where the next starts, every part lies on a usable road, and the last part ends at the snapped destination point.

**Validates: Requirements 8.1, 8.2, 8.6, 8.7**

### Property 9: Same-point start and destination give a zero-length route

For all generated maps, starts and destinations where the start and destination snap to the same point, `findRoute` returns a route of length zero.

**Validates: Requirements 8.4**

### Property 10: Route finding is deterministic

For all generated maps, starts and destinations, calling `findRoute` twice with the same inputs returns the same route, including when multiple routes share the shortest length.

**Validates: Requirements 8.5**

### Property 11: Routes are optimal and complete on small maps

For all generated maps with at most 12 nodes, starts and destinations, the length of the route `findRoute` returns is equal, within a tolerance of 0.000001 world units, to the length found by an independent exhaustive search applying the same usable-road and one-way rules; whenever the exhaustive search finds a path, `findRoute` returns a route.

**Validates: Requirements 9.1, 9.2**

### Property 12: Unreachable destinations produce no route

For all generated maps with at most 12 nodes, starts and destinations where the independent exhaustive search finds no path, `findRoute` returns a `No_Way_Result` and no route.

**Validates: Requirements 10.1, 10.4, 10.5**

### Property 13: Routes never break the usable-road or one-way rules

For all generated maps containing blocked areas and one-way roads (including starts and destinations that snap onto a one-way road), no route `findRoute` returns uses a blocked road, and no route travels a one-way road against its allowed direction.

**Validates: Requirements 5.3, 11.1, 11.2, 11.3, 11.4, 11.5**

### Property 14: Following the route never increases the distance left

For all generated maps, routes and position sequences that move along the route (including positions that momentarily move backward within the already-travelled part), the remaining route's length after each fed position is never greater than it was after the previous position, the follower's progress never decreases, and the removed, travelled part never reappears.

**Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.7**

### Property 15: The follower never jumps ahead on a looping route

For all generated routes that loop back to pass within the reroute margin of an earlier or later stretch of themselves, and all position sequences that move along the route, the progress after each fed position is at most the progress before it plus the search window, no route part beyond the search window is removed, and the remaining route still contains every untravelled stretch of the route. The generator also produces a caller-supplied search window, which the follower uses in place of the default.

**Validates: Requirements 12.1, 12.2, 12.5, 12.6, 12.8**

### Property 16: Staying within the margin measured from the road edge never triggers a reroute

For all generated maps, routes whose roads have differing widths, and position sequences in which the Off_Route_Distance (distance to the nearest route point minus half the width of the road in use) stays less than or equal to the reroute margin, including positions exactly at half the road width plus the margin from the centre line, `Rerouter.update` never requests a new route, however long the sequence lasts.

**Validates: Requirements 13.1, 13.3, 13.4, 13.9**

### Property 17: Overstaying the margin for the full delay triggers exactly one reroute

For all generated maps, routes whose roads have differing widths, and position sequences in which the Off_Route_Distance stays greater than the reroute margin for at least the reroute delay, `Rerouter.update` requests a new route exactly once for each such stay, and requests no further route until the player has returned within the margin and then stayed beyond it for the delay again. A stay shorter than the delay, ended by a return within the margin, requests no route.

**Validates: Requirements 13.2, 13.3, 13.5, 13.11**

### Property 18: Moving along the route never triggers a reroute

For all generated maps, routes and position sequences that move along the route, `Rerouter.update` requests no new route and the distance left never increases.

**Validates: Requirements 13.10**

### Property 19: A reroute starts where the player is and keeps the destination

For all generated maps and off-route positions where `findRoute` succeeds on a reroute request, the new route starts at the snapped point of the position at the time of the request and ends at the snapped point of the same destination as the route it replaced.

**Validates: Requirements 14.1, 14.2, 14.3**

### Property 20: Turn classification follows the signed angle bands

For all generated pairs of headings before and after a turn point, including the boundary values 30 and 150 degrees and the wrap-around at 180 degrees, the change of heading is `after - before` normalised to (-180, 180], and `classifyTurn` returns straight-on for an absolute change up to 30, right for a positive (clockwise on screen) change above 30 and up to 150, left for a negative change below -30 and down to -150, and turn-back for an absolute change above 150. The same bands apply when comparing the player's heading to the first route part, where turn-back is reported at distance zero.

**Validates: Requirements 15.3, 15.4**

### Property 21: The next turn is never straight on

For all generated routes, the Next_Turn in the guidance data is never straight-on. It equals the first turn point ahead classified as left, right or turn-back, with every straight-on point before it skipped, and when no such turn point remains the guidance holds a distance left and no Next_Turn.

**Validates: Requirements 15.2, 15.9, 15.10, 15.11**

### Property 22: Arrival depends on distance along the route and on being on the route

For all generated maps, routes and positions, the arrived flag is set exactly when the distance left along the remaining route is less than or equal to the arrival radius and the Off_Route_Distance is less than or equal to the reroute margin. The straight-line distance to the destination never decides it. Whenever the flag is set, distance left is zero and no Next_Turn is reported.

**Validates: Requirements 15.5, 15.6, 15.12**

### Property 23: Guidance distance left starts equal to route length

For all generated maps and routes, the distance left reported immediately after a route is set equals the route's length within a tolerance of 0.000001 world units.

**Validates: Requirements 15.1, 15.8**

### Property 24: Guidance sentences are a pure function of guidance data

For all pairs of equal `Guidance` values (and equal optional `No_Way_Result` values), `toSentence` produces identical sentences.

**Validates: Requirements 16.5**

### Property 25: Mirroring swaps turns and preserves lengths

For all generated maps, starts and destinations, the sequence of Next_Turns for the route on the mirrored map equals the sequence on the original map with every left replaced by right and every right replaced by left, with turn-back unchanged, and neither sequence contains straight-on. A heading h maps to 180 - h, so a left change of heading becomes a right change of the same size. The route length, the distance to each turn, and the sequence of road identifiers are equal between the mirrored and original routes within a tolerance of 0.000001 world units.

**Validates: Requirements 17.2, 17.3, 17.5**

### Property 26: Mirroring twice restores the original map

For all generated maps, applying `mirrorMap` twice produces a map equal to the original, and `mirrorHeading` applied twice returns every heading unchanged.

**Validates: Requirements 17.4, 17.5**

### Property 27: The API rejects malformed input without changing state

For all generated malformed inputs (wrong type, `NaN`, `Infinity`) passed to any `Engine_API` function, the call returns a plain-worded error naming the input, and the engine's observable state (route, guidance, loaded map) is unchanged from immediately before the call.

**Validates: Requirements 18.8**

**Property reflection notes:**
- Property 13 folds Requirement 5.3 in with Requirement 11.5 because both are the same "no route ever uses a forbidden road" invariant checked by one generator that includes both blocked areas and one-way roads.
- Properties 14 and 15 both test the follower. They stay separate because 14 (monotonic) passes on a follower that jumps ahead on a loop, while 15 (no jump ahead) fails it; one test would hide that regression.
- Properties 16, 17 and 18 test the rerouter from three sides (inside the margin, beyond it, moving along the route). The first two use the edge-measured Off_Route_Distance with differing road widths, so a centre-line implementation fails them.
- Property 18 overlaps the distance-left clause of Property 14 (Req 12.7 and 13.10); it is kept so a regression in `Rerouter` alone is distinguishable from one in `Route_Follower` alone.
- Property 21 (never straight on, skip behavior) is separate from Property 20 (band classification): 20 tests the classifier, 21 tests which turn point the guidance selects.
- Property 11 merges Requirements 9.1 and 9.2 (equal-length and completeness-agreement) since both come from the same exhaustive-search comparison in one test.
- Property 25 merges Requirements 17.2, 17.3 and 17.5 since all are assertions over the same mirrored-route generator.
- Requirements 12.5 and 13.6 (caller-supplied values) are covered by the generators in Properties 15 and 17 plus example tests; Requirements 15.13 and 15.14 are example tests and have no property.

## Error Handling

- **Loading.** `parseMap` never throws for malformed input; JSON parse failures, shape mismatches and field-check failures are all caught internally and converted to `EngineError[]` (Req 4.1-4.6). The function's return type (`LoadResult`) forces callers to branch on success vs. errors rather than relying on exceptions.
- **Error content.** Every `EngineError` is built through the `errors.ts` factories, which compose messages from a fixed vocabulary (no stack traces, no `undefined`/`NaN` literals, no internal identifiers) and always include the offending field or item name and, when known (JSON parse failures), a line/column position (Req 4.4/4.5). An example-based test asserts each error factory's output contains none of a small denylist of jargon markers.
- **Routing.** `findRoute` never throws; it returns a typed `No_Way_Result` with one of a fixed set of reasons (Req 10.2) instead. `Engine.setDestination` with an unknown `placeId` short-circuits to a `No_Way_Result` naming the missing place (Req 10.3) without calling the route finder.
- **Rerouting.** If a reroute request yields a `No_Way_Result`, `Engine` clears the active route and surfaces that result through `getLastNoWayResult`/`getGuidanceSentence` in plain words (Req 13.7); it does not throw and does not leave a stale, no-longer-valid route in place.
- **API guards.** `Engine`'s public methods validate argument types and finiteness before mutating any state, returning a plain-worded `EngineError` and leaving state untouched on failure (Req 18.8); `feedPosition` before a successful `loadMap` returns a specific "no map is loaded" error (Req 18.9). No engine function throws for caller-supplied data; `throw` is reserved for programmer errors inside the package (e.g. an unreachable `switch` branch), never for invalid input.

## Testing Strategy

**Dual approach.** Property-based tests (Vitest + fast-check, `fast-check` as the only new devDependency) cover the 27 universal properties above; example-based unit tests cover fixed scenarios the brief calls out by name, and integration-style tests exercise the `Engine_API` surface end to end.

**Property test configuration.**
- Each property test runs at least 100 cases (`fc.assert(fc.property(...), { numRuns: 100 })` or higher where a property spans a larger input space, e.g. Property 1's fault-injection cases).
- Each test file is tagged in a comment referencing its design property, in the form `// Feature: engine-core, Property {number}: {property title}`.
- Generators live in `tests/helpers/arbitraries.ts`: a general map generator, a constrained "small map" generator (≤12 nodes) for Properties 11-12, and position-sequence generators for Properties 14-19 that can wobble near a margin (measured from the road edge, on routes whose roads have differing widths), move strictly forward, or jump off-route, plus a looping-route generator whose route passes within the margin of its own earlier or later stretch (Property 15).
- The exhaustive search used by Properties 11 and 12 lives in `tests/helpers/exhaustive-search.ts` and shares no code with `route-finder.ts` (Req 9.3).
- On failure, fast-check's default shrinking and seed reporting is left enabled so the Default_Suite prints the seed and shrunk counterexample (Req 21.7); no test raises an iteration-count or time-limit threshold to force a pass (Req 21.4).

**Example-based tests.**
- `map-loader-errors.test.ts`: one hand-written bad `MapFile` per error case in Requirements 1-4 (missing format version, wrong-typed version, unsupported version, invalid JSON, non-object top level, each field-check failure), asserting the exact error field/item named.
- `route-finder-unreachable.test.ts` (example section) and a small `no-way-reasons.test.ts`: one hand-written map per `No_Way_Result` reason (no usable road, separate parts, one-way blocks the way, blocked roads cut the way) and one for a missing place id (Req 10.2/10.3).
- `rerouter.test.ts` (example section): caller-supplied margin/delay values are honored instead of the defaults (Req 13.6). `route-follower.test.ts` (example section): a caller-supplied search window replaces the default 100 (Req 12.5).
- `screen-convention.test.ts`: a player travelling right (heading 0) meets a road that goes up the screen (heading -90) and the turn is classified left; meets a road that goes down the screen (heading 90) and the turn is classified right (Req 15.14, 21.6). A mirrored copy of each case asserts the swapped result.
- `guidance-arrival-blocked.test.ts`: a hand-written map in which the destination lies just behind a blocked area, within the arrival radius of the position in a straight line but further than the arrival radius along the route; the test asserts the arrived flag is not set (Req 15.13, 21.6).
- `guidance-next-turn.test.ts` (example section): a route with straight-on points before a left turn reports the left turn, and a route with only straight-on points reports a distance left and no Next_Turn (Req 15.9, 15.10).
- `guidance-text.test.ts` (example section): one hand-written `Guidance` value per sentence template — turn (each of the four turn words), arrival with and without a place name, distance-only, no-route with and without a `No_Way_Result` reason (Req 16.1-16.4, 16.6) — plus the fixed "no active route" guidance shape (Req 15.7).
- `engine-api.test.ts`: calls each documented `Engine_API` function once for its documented shape, asserts `index.ts`'s export list matches `docs/api.md` exactly (Req 18.10), and asserts `feedPosition` before `loadMap` returns the specific "no map is loaded" error (Req 18.9).
- A small Node-only smoke test asserts the compiled package imports cleanly with no browser global referenced (supporting Req 19.2/19.3; the absence of `dependencies` in `package.json` and the `strict` tsconfig flag are checked by reading the config files directly, not generated-input tests, per Req 19.1/19.5).

**Benchmark (outside the Default_Suite).** `bench/route-bench.ts` loads a `Large_Generated_Map` (5,000 roads, seeded per Req 20.1), runs at least 100 seeded start/destination pairs through `findRoute`, and prints median/95th-percentile/maximum time, load time, Node version, machine description and the count of `No_Way_Result`s (Req 20.2-20.4), with no pass/fail threshold (Req 20.5). A one-line example test confirms the generator is deterministic for a fixed seed, but the benchmark itself is run manually and reported at the Block A checkpoint (Req 20.6), not part of the under-60-second Default_Suite (Req 21.1).

**Coverage summary against Requirement 21.2's required property list:**

| Required property (Req 21.2) | Design property |
|---|---|
| chain | Property 8 |
| optimality | Property 11 |
| unreachable | Property 12 |
| rules (blocked and one-way) | Property 13 |
| snapping | Property 7 |
| monotonic distance left | Property 14 |
| no jump ahead on looping routes | Property 15 |
| no reroute while on the route, including roads of differing widths measured from the road edge | Properties 16, 17, 18 |
| next turn is never straight on | Property 21 |
| reroute start and destination | Property 19 |
| mirror | Properties 25, 26 |
| save-then-load round trip | Property 5 |

Requirement 21.6's hand-written examples map to the example tests above: error messages (`map-loader-errors.test.ts`), Turn classes (`guidance-turn.test.ts`), sentence forms (`guidance-text.test.ts`), Screen_Convention (`screen-convention.test.ts`), straight-on skipping (`guidance-next-turn.test.ts`) and the blocked-area arrival example (`guidance-arrival-blocked.test.ts`).

## Decisions made

1. Chose Dijkstra (not A*) for `route-finder.ts`; the brief's performance target (5,000 roads, benchmarked not threshold-gated) does not require A*'s heuristic speed-up, and Dijkstra is simpler to make deterministic and to mirror exactly in the independent exhaustive-search test helper's logic.
2. Put blocked-road classification in the loader (producing a precomputed `usableRoadIds` set on `EngineMap`) rather than recomputing it per route request, so `Route_Finder` is a pure consumer of already-classified data and Requirement 5.4's "expose the list" falls out of the loaded map for free.
3. Shipped `mirror.ts` from `src/` rather than `tests/helpers/`, since the brief describes mirroring as a map-level operation, not a test artifact, and future maker/application use is plausible.
4. Kept the exhaustive search used by the optimality/unreachable properties strictly under `tests/helpers/`, enforcing Requirement 9.3's "no shared code" rule structurally rather than by convention.
5. Folded Requirement 5.3 (blocked roads excluded from routes) into the same property as Requirement 11.5 (one-way rule), since one generator and one assertion style ("no route breaks a routing rule") covers both; kept Requirement 12.5 and 13.10 as two separate properties despite their overlap, so a regression in `Route_Follower` alone is distinguishable from one in `Rerouter` alone.
6. Treated "plain words, no jargon" (Req 4.5) as a narrow mechanical denylist check (no stack-trace markers, no `undefined`/`NaN` literals) inside example-based tests rather than a property, since "plain English" is not mechanically decidable in general.
7. Treated the independence/static requirements of Requirement 19 (no runtime dependency, no browser globals, strict compile) as config/static checks read directly from `package.json`/`tsconfig.json`, not property-based tests, since there is no varying input to generate.
8. Used default parameters (`margin = 15`, `delayMs = 1000`, `arrivalRadius = 10`) matching the glossary's stated defaults, overridable per Requirement 13.6, rather than making them required constructor arguments.
9. Named the Engine_API destination setter `setDestination({ placeId } | { point })` as a single discriminated-union function rather than two functions, since Requirement 18.2 describes it as one function accepting either form.
10. Adopted the Screen_Convention (y down, heading clockwise from +x) everywhere and kept the sign logic in `geometry.ts` only (`signedAngleDifference`, `classifyTurn`), so left/right cannot be inverted in a second place.
11. Gave the follower an explicit `progress` and a forward-only search window instead of searching the whole remaining route, so a looping route cannot pull the player ahead.
12. Measured the reroute margin from the road edge through a shared `offRouteDistance` helper that takes a road-width lookup; `Rerouter.update` and `computeGuidance` both use it.
13. Defined arrival by distance along the remaining route plus being within the margin, never by straight-line distance.
14. Typed `Guidance.nextTurn` as `NextTurn` (no straight-on) so the "never straight on" rule is enforced by the type as well as by Property 21.
15. Put `docs/map-file-format.md` and `docs/api.md` under `kit/engine/docs/` (not the repository's top-level `docs/`) so the format and API documentation ship with the engine package itself, per Requirements 1.5 and 18.7's "a file inside `kit/engine/`" wording.
