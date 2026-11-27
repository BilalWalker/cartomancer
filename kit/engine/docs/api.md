# Engine API reference

Every export of `src/index.ts` has one entry below, headed by its name in backticks.
Positions use the Screen_Convention: x grows right, y grows down, and a heading is in
degrees clockwise from the positive x axis. Distances are in world units.

Methods that take input reject malformed input (wrong type, NaN, Infinity) by returning an
`EngineError` that names the input. A rejected call changes no state.

## Functions and classes

### `Engine`

A map, a position with a heading and a destination, with route finding, following, rerouting and guidance.

- Inputs: `new Engine(options?)`.
- Outputs: an engine object with the methods below.

Methods:

- `loadMap(text)`: takes the map file text, returns a `LoadResult`. A failed load keeps the previous map.
- `getPlaces()`: returns every place as `PlaceData[]`.
- `getMap()`: returns a copy of the loaded `EngineMap`, or nothing before a map is loaded. Editing the copy does not change the engine.
- `getBlockedRoads()`: returns the roads left out of routing, each with its notices.
- `setDestination(destination)`: takes a `Destination`, returns a `Route`, a `NoWayResult` or an `EngineError`.
- `feedPosition(position, timestampMs)`: takes a `Position` and a time in milliseconds, follows the route and reroutes when needed. Returns an `EngineError` or nothing.
- `configure(options)`: takes a partial `EngineOptions`, returns an `EngineError` or nothing.
- `clearDestination()`: forgets the destination, the route and any no-way result.
- `getGuidance()`: returns `Guidance` data for the remaining route.
- `getGuidanceSentence()`: returns the guidance in plain words.
- `getRoute()`: returns the whole `Route` or nothing.
- `getRemainingRoute()`: returns the part of the route not yet travelled, or nothing.
- `getLastNoWayResult()`: returns the last `NoWayResult` or nothing.

```ts
const engine = new Engine();
const loaded = engine.loadMap(mapText);
if ("errors" in loaded) throw new Error(loaded.errors[0].message);
engine.setDestination({ placeId: "bank" });
engine.feedPosition({ x: 0, y: 0, headingDegrees: 0 }, performance.now());
console.log(engine.getGuidanceSentence());
const map = engine.getMap(); // a copy; undefined before a map is loaded
console.log(map?.roads.length);
```

### `isNoUsableRoad`

Tells the two answers of `snapToRoad` apart.

- Inputs: the result of `snapToRoad`.
- Outputs: `true` when the result is a `NoUsableRoadResult`, `false` when it is a snapped point.

```ts
const snapped = snapToRoad(map, { x: 3, y: 4 });
if (isNoUsableRoad(snapped)) console.log(snapped.message);
```

### `mirrorHeading`

Mirrors a heading left to right.

- Inputs: `headingDegrees` (number).
- Outputs: the mirrored heading, `180 - h`, wrapped into (-180, 180].

```ts
mirrorHeading(0); // 180
```

### `mirrorMap`

Mirrors a map left to right: negates x of nodes, places, props, blocked area points, and prop rotation. Everything else is kept.

- Inputs: a `MapFile` (or an `EngineMap`).
- Outputs: a new map of the same type. The input is not changed.

```ts
const mirrored = mirrorMap(map);
```

### `snapToRoad`

Finds the nearest point on a usable road. Roads left out of routing are ignored. When two roads are equally near, the lowest road id wins.

- Inputs: an `EngineMap` (for example from `engine.getMap()`) and a point `{ x, y }`.
- Outputs: a snapped point `{ x, y, roadId, distanceAlongRoad }`, or a `NoUsableRoadResult` when the map has no usable road. The map is not changed.

```ts
const map = engine.getMap();
if (map) {
  const snapped = snapToRoad(map, { x: 40, y: 12 });
  if (!isNoUsableRoad(snapped)) console.log(snapped.roadId, snapped.x, snapped.y);
}
```

## Types

### `BackgroundPictureData`

The optional background picture of a map: `ref`, `scale` (greater than 0) and `opacity` (0 to 1).

```ts
const picture: BackgroundPictureData = { ref: "plan.png", scale: 1, opacity: 0.5 };
```

### `BlockedAreaData`

A blocked area: `id`, `kind` and a `polygon` of at least three points.

```ts
const area: BlockedAreaData = { id: "lake", kind: "water", polygon: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 0, y: 5 }] };
```

### `BlockedAreaKind`

The kind of a blocked area: `"mountain"`, `"water"` or `"wall"`.

```ts
const kind: BlockedAreaKind = "wall";
```

### `Destination`

Where to go: `{ placeId }` or `{ point: { x, y } }`. A point is snapped to the nearest road.

```ts
engine.setDestination({ point: { x: 40, y: 12 } });
```

### `EngineError`

A plain error: `message`, and optionally `field`, `item` and `position` (line and column).

```ts
const error: EngineError = { message: "x must be a finite number", field: "x" };
```

### `EngineMap`

A loaded map: the `MapFile` fields plus `usableRoadIds` and `blockedRoads`, derived on loading.

```ts
const map: EngineMap | undefined = "map" in loaded ? loaded.map : undefined;
```

### `EngineOptions`

Tuning values: `searchWindow` (default 100), `rerouteMargin` (default 15), `rerouteDelayMs` (default 1000) and `arrivalRadius` (default 10).

```ts
engine.configure({ rerouteMargin: 20 });
```

### `FormatVersion`

The supported map file format version, `1`.

```ts
const version: FormatVersion = 1;
```

### `Guidance`

Guidance data: `active`, `distanceLeftWorldUnits`, `nextTurn`, `distanceToTurnWorldUnits` and `arrived`.

```ts
const guidance: Guidance = engine.getGuidance();
```

### `LoadResult`

The result of `loadMap`: `{ map, notices }` on success, `{ errors }` on failure.

```ts
const result: LoadResult = engine.loadMap(text);
```

### `MapFile`

The map file contents: `formatVersion`, `nodes`, `roads`, `places`, `blockedAreas`, `props`, optional `backgroundPicture` and `style`.

```ts
const file: MapFile = JSON.parse(text);
```

### `NextTurn`

A turn that can be reported as the next turn: `"left"`, `"right"` or `"turn-back"`.

```ts
const next: NextTurn | undefined = guidance.nextTurn;
```

### `NodeData`

A node: `id`, `x` and `y`.

```ts
const node: NodeData = { id: "a", x: 0, y: 0 };
```

### `NoUsableRoadResult`

The answer of `snapToRoad` when the map has no usable road: `reason` (`"no-usable-road"`) and `message`.

```ts
const none: NoUsableRoadResult = { reason: "no-usable-road", message: "The map has no road you can use." };
```

### `NoWayReason`

Why no route exists: `"no-usable-road"`, `"separate-parts"`, `"one-way-blocks-the-way"`, `"blocked-roads-cut-the-way"` or `"missing-place"`.

```ts
const reason: NoWayReason = "separate-parts";
```

### `NoWayResult`

A plain answer when no route exists: `reason`, `message` and optionally `placeId`.

```ts
const result = engine.setDestination({ placeId: "bank" });
if ("reason" in result) console.log(result.message);
```

### `Notice`

A note that a road was left out: `roadId`, `blockedAreaId` and `message`.

```ts
const notices: Notice[] = "notices" in loaded ? loaded.notices : [];
```

### `PlaceData`

A named place: `id`, `name`, `category`, `x` and `y`.

```ts
const place: PlaceData = { id: "bank", name: "Bank", category: "shop", x: 10, y: 0 };
```

### `Position`

A position with a heading: `x`, `y` and `headingDegrees`.

```ts
const position: Position = { x: 0, y: 0, headingDegrees: 90 };
```

### `PropData`

A decoration: `id`, `kind`, `x`, `y`, `width`, `height` and `rotationDegrees`.

```ts
const prop: PropData = { id: "t1", kind: "tree", x: 5, y: 5, width: 4, height: 4, rotationDegrees: 0 };
```

### `RoadData`

A road: `id`, `fromNodeId`, `toNodeId`, `width`, `kind` and optional `oneWay`.

```ts
const road: RoadData = { id: "r1", fromNodeId: "a", toNodeId: "b", width: 6, kind: "main" };
```

### `RoadKind`

The kind of a road: `"main"`, `"side"`, `"footpath"` or `"corridor"`.

```ts
const kind: RoadKind = "corridor";
```

### `Route`

A route: `parts`, `lengthWorldUnits` and `destination`.

```ts
const route: Route | undefined = engine.getRoute();
```

### `RoutePart`

One piece of a route: `roadId`, `direction` (`"forward"` or `"backward"`), `start` and `end`.

```ts
const first: RoutePart | undefined = route?.parts[0];
```

### `StyleData`

Colours and line styles: `colors` and `lineStyles`.

```ts
const style: StyleData = { colors: { road: "#444444" }, lineStyles: { road: { width: 2 } } };
```

### `Turn`

The class of any turn point: `"left"`, `"right"`, `"straight-on"` or `"turn-back"`.

```ts
const turn: Turn = "straight-on";
```
