# Views API reference

The Views draw a map, a route and a player on a canvas. This file documents mounting, which
puts a View on a canvas with one call. Positions use the Screen_Convention of the engine: x
grows right, y grows down, and a heading is in degrees clockwise from the positive x axis.
Zoom is in CSS pixels per world unit. Sizes are in CSS pixels.

A call that is given input it cannot use returns a `ViewError` with a plain message that names
the input and its allowed range. A rejected call changes nothing.

## Mounting

Every Mount_Function takes a canvas element, an Engine and an options object, and returns a
Mount_Handle or a `ViewError`. The Engine may have no map yet. The application only feeds
positions to the engine with `feedPosition`; the mounted View reads the position, the remaining
route and the guidance from the engine on every animation frame.

Mounting order: the inputs are checked first, then the View and the canvas adapter are built,
and only then are the observer, the listeners and the first frame request added. When a mount
returns a `ViewError`, no listener, observer, frame request or canvas size is left behind.

### Map version and maps that arrive later

The engine offers `getMapVersion()`. It returns a whole number that is 0 before any map is
loaded and rises by exactly 1 on every successful `loadMap`; a failed `loadMap` leaves it
unchanged. It does not copy the map, so it is cheap to read on every frame. Every Mount_Function
needs it: an engine without a function `getMapVersion` is refused with a `ViewError` that names
the `engine` argument and `getMapVersion`, and nothing is mounted.

A mounted View reads `getMapVersion()` on every animation frame and calls `getMap()` only when
the version is above 0 and differs from the one it handled before. A mount on an engine at
version 0 succeeds (the waiting mount): while the version is 0 the View makes no drawing call and
reports nothing, and the first `loadMap` builds the View and draws it no later than the next
frame. A later map replaces the earlier one and keeps the zoom limits, zoom, tilt angle, height
factors, `images` option and smoothing duration you set. A Full_Map fits its first map and keeps
its camera for later maps (call `fit()` to fit again). A map the View refuses gives one notice,
the previous map stays on the screen, and `getMap()` is not called again until the version changes.

An application mounts a View once and loads maps into the engine. It does not call `destroy()`
and mount again when the map changes.

While a View has no map, the handle controls that need a map (`select`, `selectPlace`, `fit`,
`follow`, `pan` and `zoomAt`) return a `ViewError` that says no map has been loaded yet, and
change nothing. The controls that only hold a setting (`setZoomLimits`, `setZoom`,
`setTiltAngle` and `setHeightFactor`) check their value as always and keep it for the View that
is built when the first map arrives. A Full_Map ignores pointer, wheel, touch and key input
without an error while it has no map.

### `mountMinimap`

Puts a Minimap on a canvas: a round map that stays centred on the player and turns so that the
heading points up the screen, with the route line, the markers and the place names.

- Inputs: `mountMinimap(canvas, engine, options?)`.
  - `canvas`: a canvas element with a 2D context and a CSS size of 1 to 16384 pixels each way.
    A canvas can hold one View at a time.
  - `engine`: an `Engine`, with or without a map loaded (it must offer `getMapVersion`,
    `getMap`, `getPosition`, `getRemainingRoute` and `getGuidanceSentence`).
  - `options`: see "Options" below.
- Outputs: a `MinimapHandle`, or a `ViewError`.
- Errors: a first argument that is not a canvas element; an engine that lacks a function the
  View reads, including `getMapVersion`; options that are not an object; a zoom, zoom limit or smoothing
  duration outside its range; a minimum zoom that is not below the maximum; a first zoom
  outside the zoom limits; an `images` option that is not an object or a function, or an
  `images` entry with a width or height that is not above 0; a canvas that already has a View;
  a canvas without 2D drawing or with a CSS size of 0; a `services` entry that is not a
  function; a host without animation frames.

```ts
import { Engine } from "./index.js";
import { mountMinimap } from "./views/mount.js";

const engine = new Engine();
engine.loadMap(mapText);
engine.feedPosition({ x: 0, y: 0, headingDegrees: 0 }, performance.now());

const canvas = document.querySelector("canvas")!;
const minimap = mountMinimap(canvas, engine, { zoom: 2 });
if ("message" in minimap) throw new Error(minimap.message); // a plain ViewError

// The loop now draws every frame. The application only feeds positions.
engine.setDestination({ placeId: "bank" });
function onMove(x: number, y: number, heading: number): void {
  engine.feedPosition({ x, y, headingDegrees: heading }, performance.now());
}

minimap.setZoom(3); // returns a ViewError when 3 is outside the zoom limits
minimap.destroy(); // stops the loop and removes everything the mount added
```

### `mountFullMap`

Puts a Full_Map on a canvas: a north-up map the player can pan and zoom, with the route line,
the player, the markers and the place names. It binds mouse, touch and keyboard input to the
canvas (drag to pan, wheel or pinch to zoom, click or tap to choose a destination, and the keys
of the canvas description: arrows, plus, minus, Home, F, the square brackets and Enter). A
selection goes to the engine as a destination; the view finds no route itself.

- Inputs: `mountFullMap(canvas, engine, options?)`.
  - `canvas`: as for `mountMinimap`, and it must also take input (`getBoundingClientRect`, a
    `style`, pointer, wheel, touch and key events). A real canvas element does.
  - `engine`: an `Engine`, with or without a map loaded. It must offer the four functions of `mountMinimap`
    and `setDestination`.
  - `options`: see "Options" below. `liveRegion` should be given so that a screen reader hears
    the guidance sentence and the place focus announcements.
- Outputs: a `FullMapHandle`, or a `ViewError`.
- Errors: those of `mountMinimap` (except the first-zoom ones), an engine without
  `setDestination`, a canvas that cannot take input, a zoom limit outside its range, an
  `onSelect` that is not a function, a `liveRegion` that is not an element.

```ts
import { Engine } from "./index.js";
import { mountFullMap } from "./views/mount.js";

const engine = new Engine();
engine.loadMap(mapText);
engine.feedPosition({ x: 0, y: 0, headingDegrees: 0 }, performance.now());

const canvas = document.querySelector("canvas")!;
const liveRegion = document.querySelector("#guidance")!; // becomes aria-live="polite"
const fullMap = mountFullMap(canvas, engine, {
  liveRegion,
  onNotice: (notice) => console.warn(notice.message),
});
if ("message" in fullMap) throw new Error(fullMap.message); // a plain ViewError

// Clicks, taps, wheel and keys now work on the canvas.
fullMap.selectPlace("bank"); // same as clicking the marker; the engine finds the route
fullMap.zoomAt({ x: 200, y: 150 }, 1.25); // keeps the point under (200, 150) fixed
fullMap.follow(); // keep the player centred until the next pan
fullMap.fit(); // show the whole map
fullMap.destroy(); // stops the loop and removes the input listeners too
```

### `mountTiltedView`

Puts a Tilted_View on a canvas: the map seen from above at a slant in perspective (default 35
degrees), centred on the player with the heading up the screen, in which buildings and houses
are raised blocks that show the side faces looking towards the viewer, with the route line, the
player, the markers and the place names.

The default tilt angle is 35 degrees. The focal distance of the perspective is
`1.5 * H / tan(tilt)` CSS pixels, where `H` is the viewport height. Two measurable criteria
hold for the default tilt (tests: `tests/views/tilted-criteria-26.test.ts`, on a recording
canvas at 400 by 300 and at 375 by 500 CSS pixels):

- A road segment of fixed width across the heading is drawn at most 60% as wide at the far edge
  (the top of the viewport) as at the player. With this rule the ratio is 0.5.
- A `building` with the default height of 12 world units and a 12 by 12 footprint, centred 20
  world units ahead of the player, has side faces whose screen area is at least 25% of the
  screen area of its top face. Measured: 1.62 at 400 by 300 and 1.54 at 375 by 500.

- Inputs: `mountTiltedView(canvas, engine, options?)`.
  - `canvas`: as for `mountMinimap`.
  - `engine`: as for `mountMinimap`.
  - `options`: see "Options" below. `tiltAngleDegrees` and `heightFactors` are checked at mount.
- Outputs: a `TiltedViewHandle`, or a `ViewError`.
- Errors: those of `mountMinimap` (except the zoom ones), a tilt angle outside 20 to 70
  degrees, `heightFactors` that is not an object, or a height factor outside 0 to 100 (the
  message names the prop kind).

```ts
import { Engine } from "./index.js";
import { mountTiltedView } from "./views/mount.js";

const engine = new Engine();
engine.loadMap(mapText);
engine.feedPosition({ x: 0, y: 0, headingDegrees: 0 }, performance.now());

const canvas = document.querySelector("canvas")!;
const tilted = mountTiltedView(canvas, engine, {
  tiltAngleDegrees: 50,
  heightFactors: { building: 1.5 }, // taller buildings; other kinds keep the factor 1
});
if ("message" in tilted) throw new Error(tilted.message); // a plain ViewError

// The loop now draws every frame. The application only feeds positions.
tilted.setTiltAngle(60); // returns a ViewError when 60 is outside 20 to 70
tilted.setHeightFactor("house", 2); // returns a ViewError outside 0 to 100
tilted.destroy(); // stops the loop and removes everything the mount added
```

## Options

Every option is optional.

| Option | Applies to | Allowed values | Default |
| --- | --- | --- | --- |
| `smoothingDurationMs` | all | finite number from 1 to 5000 (ms) | 300 |
| `images` | all | an object or a function, see "Pictures" | no pictures |
| `services` | all | an object with some or all of the five services, see "Services" | the real browser globals |
| `onNotice` | all | a function called with `{ message }` for each notice and drawing problem | none |
| `onGuidance` | all | a function called with the guidance sentence whenever it changes | none |
| `liveRegion` | all | an element; it becomes an `aria-live="polite"` region and receives the guidance sentence (and, for the full map, the focus announcements) | none |
| `minZoom` | `mountMinimap` | number from 0.001 to 1000 | 0.5 (or the first zoom, if lower) |
| `maxZoom` | `mountMinimap` | number from 0.001 to 1000, above `minZoom` | 4 (or the first zoom, if higher) |
| `zoom` | `mountMinimap` | number from 0.001 to 1000, inside the zoom limits | 1 |
| `minZoom` | `mountFullMap` | number from 0.001 to 1000 | the zoom that fits the whole map |
| `maxZoom` | `mountFullMap` | number from 0.001 to 1000, above `minZoom` | 8 |
| `onSelect` | `mountFullMap` | a function called with each selection instead of setting the engine destination | none |
| `tiltAngleDegrees` | `mountTiltedView` | finite number from 20 to 70 (degrees) | 35 |
| `heightFactors` | `mountTiltedView` | an object from prop kind to a finite number from 0 to 100 | factor 1 for every kind |

`smoothingDurationMs` has no effect on the full map, which does not smooth its camera.

A rejected option returns a `ViewError` that names the option and its range.

## The Mount_Handle

Every handle has `destroy()`. The controls return a `ViewError`, or nothing when they worked.

`MinimapHandle`:

- `destroy()`: stops the frame loop, cancels the pending frame, removes every listener the
  mount added, disconnects every observer it created and frees the canvas for a new mount.
  A second call does nothing and returns nothing.
- `setZoom(zoom)`: sets the zoom. It must be a finite number inside the current zoom limits.
- `setZoomLimits(min, max)`: sets the lowest and highest zoom. Each is a number from 0.001 to
  1000 and `min` is below `max`. A zoom outside the new limits moves to the nearest limit.
- `resize()`: reads the CSS size of the canvas again and resizes the View. The View also does
  this by itself when the CSS size of the canvas changes.

`FullMapHandle` (plus `destroy()` as above; `destroy()` also removes every input listener and
restores the canvas `touch-action`):

- `pan(dx, dy)`: moves the map by a screen distance in CSS pixels; ends following.
- `zoomAt(anchor, factor)`: multiplies the zoom by `factor` (finite, above 0), keeping the world
  point under `anchor` fixed. A zoom past a limit is set to the limit and reported as a notice.
- `fit()`: shows the whole map. `follow()`: centres on the player until the next pan.
- `select(screenPoint)`: chooses a place marker or a spot, as a click does. Returns the result
  (`selection`, `handled`, `route` or `noWayMessage`) or a `ViewError`.
- `selectPlace(placeId)`: chooses a place by identifier, as a hit on its marker does.
- `resize()`: as for the minimap.

`pan`, `zoomAt`, `fit`, `follow` and `resize` return a `ViewError`, or nothing when they worked;
their notices go to `onNotice`.

`TiltedViewHandle` (plus `destroy()` as above):

- `setTiltAngle(degrees)`: sets the tilt angle, a finite number from 20 to 70.
- `setHeightFactor(kind, factor)`: sets the height factor of a prop kind, a finite number from
  0 to 100. A value out of range is refused and the old one is kept.
- `resize()`: as for the minimap.

After `destroy()` every control returns a `ViewError` that says the view has been destroyed.

## The View_Errors of mounting

| Situation | The message names |
| --- | --- |
| first argument is not a canvas element | `canvas` and "canvas element" |
| engine lacks a function | `engine` and the function |
| engine lacks `getMapVersion` | `engine` and `getMapVersion` |
| a control that needs a map, used before the first map | `engine` and "no map has been loaded yet" |
| options is not an object | `options` |
| option outside its range | the option and its range |
| `images` not an object or a function | `images` |
| `images` entry without a usable size | `images` and the picture reference |
| canvas already mounted | `canvas` and "already has a view" |
| canvas without 2D drawing | the canvas |
| CSS size outside 1 to 16384 pixels | the size |
| `services` entry that is not a function | `services` and the service |
| a service failed while mounting | `services` |
| a control used after `destroy()` | "destroyed" |

## Pictures

The Views never load pictures. The application loads them and gives the Views a lookup from a
picture reference to `{ image, width, height }`, where `width` and `height` are above 0. The
Views hand the `image` to the canvas and never read it. A missing picture is a notice, never
an error.

```ts
const statue = new Image();
statue.src = "statue.png";
await statue.decode();

const minimap = mountMinimap(canvas, engine, {
  images: { statue: { image: statue, width: statue.naturalWidth, height: statue.naturalHeight } },
});
```

For an object, each entry is checked when the View is mounted. A function is checked only when
a picture is drawn.

## Services

A mounted View reaches the browser only through the `services` option. Every service that is not
given uses the real global, so an application normally passes none. Tests pass stand-ins.

| Service | Real global used by default |
| --- | --- |
| `requestFrame(callback)` | `requestAnimationFrame` |
| `cancelFrame(handle)` | `cancelAnimationFrame` |
| `createResizeObserver(callback)` | `ResizeObserver` (without it, size changes are not observed; use `resize()`) |
| `matchReducedMotion()` | `matchMedia("(prefers-reduced-motion: reduce)")` (without it, motion is not reduced) |
| `devicePixelRatio()` | `devicePixelRatio` (without it, 1) |

## Reference: every other exported function, constant and type

Each entry below is a heading that names what it documents in backticks. A heading that names
several items documents them together. Each entry gives a description, `Inputs`, `Outputs`,
`Errors` (the View_Errors, or "none") and one usage example. A test keeps this list equal to
the export list of `src/views/index.ts`. Units are CSS pixels for screen values, world units
for map values and degrees for angles, as in the first paragraph of this file. A function that
draws never throws for a bad value: it returns a `Notice` (`{ message }`) and skips the item.

### The three views

#### `Minimap`, `FullMap`, `TiltedView`

The View classes that the Mount_Functions wrap. They draw to a `CanvasInterface`, read no
browser global and own no loop, so they run in Node with a recording canvas. Use them when you
need your own loop. `setMap(map)`, `setImages(lookup)`, `resize(width, height)`, `getCamera()`,
`getNotices()` and `draw(canvas, state, timestampMs)` exist on all three; the minimap adds
`setZoom`, `setZoomLimits`, `getZoom`, `getZoomLimits` and `setReducedMotion`; the full map adds
`pan`, `zoomAt`, `fit`, `follow`, `select`, `selectPlace`, `focusNextPlace`,
`focusPreviousPlace`, `activateFocusedPlace`, `isFollowing` and `applyCommand`; the tilted view
adds `setTiltAngle`, `setHeightFactor`, `getTiltAngle` and `setReducedMotion`.

- Inputs: `new Minimap(map, options?)`, `new FullMap(map, options?)`, `new TiltedView(map,
  options?)`, with a loaded `EngineMap` and the matching options type. `draw` takes the
  canvas, the state and a finite timestamp in ms.
- Outputs: `draw` returns `{ drew, notices }`; `drew` is false when nothing was due.
- Errors: a map or option outside its range, a camera operation with a number that is not
  finite, or a timestamp that is not a finite number returns a `ViewError` and changes nothing.

```ts
const view = new Minimap(engine.getMap()!, { width: 200, height: 200 });
const result = view.draw(canvasAdapter, { position }, performance.now());
if ("message" in result) console.warn(result.message);
```

#### `DEFAULT_MINIMAP_SIZE_PX`, `DEFAULT_MINIMAP_ZOOM`, `DEFAULT_MINIMAP_ZOOM_MIN`, `DEFAULT_MINIMAP_ZOOM_MAX`

The minimap defaults: side 200 px, zoom 1, lowest zoom 0.5 and highest zoom 4 (pixels per
world unit).

- Inputs: none (constants).
- Outputs: numbers.
- Errors: none.

```ts
const options = { width: DEFAULT_MINIMAP_SIZE_PX, zoom: DEFAULT_MINIMAP_ZOOM_MAX };
```

#### `DEFAULT_FULL_MAP_WIDTH_PX`, `DEFAULT_FULL_MAP_HEIGHT_PX`, `DEFAULT_FULL_MAP_ZOOM_MAX`, `FIT_MARGIN_FRACTION`, `FOCUS_RING_RADIUS_PX`, `MIN_EXTENT_UNITS`, `PAN_KEEP_FRACTION`, `SELECT_MAX_ROAD_DISTANCE_PX`, `SELECT_MAX_ROAD_DISTANCE_UNITS`

The full map constants: default size 400 by 300 px, highest zoom 8, the margin `fit` leaves
(0.05 of the viewport on each side), the focus ring radius 11 px, the smallest extent used for
fitting (1 world unit), the part of the map that panning keeps in view (0.2), and the farthest
a selected spot may be from a road (200 px and 100 world units; a farther spot is refused).

- Inputs: none (constants).
- Outputs: numbers.
- Errors: none.

```ts
const farthestSelectableUnits = SELECT_MAX_ROAD_DISTANCE_UNITS; // 100
```

#### `DEFAULT_TILTED_WIDTH_PX`, `DEFAULT_TILTED_HEIGHT_PX`, `DEFAULT_TILTED_ZOOM`, `PLAYER_SCREEN_FRACTION`

The tilted view defaults: size 400 by 300 px, zoom 2, and the player drawn 0.75 of the way
down the viewport.

- Inputs: none (constants).
- Outputs: numbers.
- Errors: none.

```ts
const options = { width: DEFAULT_TILTED_WIDTH_PX, zoom: DEFAULT_TILTED_ZOOM };
```

#### `headingUpRotation`

The camera rotation, in degrees, that puts a heading at the top of the screen.

- Inputs: `headingDegrees`, a finite number of degrees.
- Outputs: a number of degrees (`-90 - headingDegrees`).
- Errors: none.

```ts
const rotationDegrees = headingUpRotation(90); // -180
```

#### `northMarkFor`

The corner points of the north mark on the rim of the minimap for a given camera.

- Inputs: `camera` (a valid `Camera`), `radius` in px (finite, above 0).
- Outputs: a `NorthMark`, or a `ViewError`.
- Errors: an unusable camera field, or a radius that is not finite and above 0.

```ts
const mark = northMarkFor(camera, 100);
if (!isViewError(mark)) console.log(mark.tip.x, mark.tip.y);
```

### Draw functions

#### `drawMapLayers`, `LAYER_ORDER`

`drawMapLayers` draws every layer once in the fixed order `LAYER_ORDER`: `ground`, `backgroundPicture`, `blockedAreas`, `flatProps`, `roadOutlines`,
`roadFills`, `blockedRoadMarks`, `routeLine`, `destinationMarker`, `placeMarkers`,
`placeLabels`, `playerMarker`. It is what the minimap and the full map call each frame.

- Inputs: `canvas` (a `CanvasInterface`) and a `DrawMapLayersInput`: `map`, `style` (a
  `ResolvedStyle`), `camera` (a valid `Camera`), `visible` (the items to draw), `position`,
  and optionally `remainingRoute`, `destinationPlaceId`, `images`.
- Outputs: an array of `Notice`.
- Errors: none are thrown; an unusable camera gives one `Notice` and nothing is drawn.

```ts
const notices = drawMapLayers(canvasAdapter, { map, style, camera, visible, position });
```

#### `drawGround`, `drawBackgroundPicture`, `drawBlockedAreas`, `drawFlatProps`

Draw the ground colour over a world region, the optional background picture (scale above 0,
opacity 0 to 1), the blocked areas as filled polygons by kind, and the props flat as plain
shapes (a picture prop uses the lookup, and is a labelled placeholder when the picture is
missing).

- Inputs: `canvas`, then `style`, plus a `WorldRegion` with finite bounds (ground, picture),
  the area list and a zoom above 0 (areas), or the prop list, a zoom above 0 and an optional
  picture resolver (props). `drawBackgroundPicture(canvas, background, resolve, region)` takes
  the map background or `undefined`.
- Outputs: an array of `Notice`.
- Errors: none are thrown; a bound or zoom that is not usable gives a `Notice`.

```ts
const notices = drawGround(canvasAdapter, style, { minX: 0, minY: 0, maxX: 500, maxY: 400 });
```

#### `drawRoadOutlines`, `drawRoadFills`, `drawOneWayArrows`, `drawBlockedRoadMarks`, `ARROW_MIN_SPACING_PX`

Draw the dark outline, then the coloured fill of the usable roads (one path per kind and
width), the arrow heads on one-way roads (at least `ARROW_MIN_SPACING_PX` = 40 px apart on the
screen) and the marks on the roads left out because they cross a blocked area.

- Inputs: `canvas`, `map`, `roadIds` (an iterable of road identifiers), `camera` (zoom above
  0), `style`.
- Outputs: an array of `Notice`.
- Errors: none are thrown; a road with a coordinate that is not finite is skipped with a
  `Notice`, and a zoom that is not above 0 gives one `Notice`.

```ts
const ids = map.roads.map((road) => road.id);
drawRoadOutlines(canvasAdapter, map, ids, camera, style);
drawRoadFills(canvasAdapter, map, ids, camera, style);
```

#### `drawPlaceMarkers`, `drawPlaceLabels`, `LABEL_FONT_DEFAULT_PX`, `LABEL_FONT_MIN_PX`, `LABEL_FONT_MAX_PX`

Draw one round marker per place, and the place names. The label font stays between 11 and 16 px
at every zoom (default 12). Overlapping labels are dropped by priority; the destination keeps
its label.

- Inputs: `canvas`, `style`, `places`, `camera` (zoom above 0); `drawPlaceLabels` also takes
  an optional `destinationPlaceId`, `fontPx` (11 to 16) and a `project` function for the
  tilted view.
- Outputs: an array of `Notice`.
- Errors: none are thrown; a place with a position that is not finite is skipped with a
  `Notice`.

```ts
drawPlaceMarkers(canvasAdapter, style, map.places, camera);
drawPlaceLabels(canvasAdapter, style, map.places, camera, "bank", LABEL_FONT_DEFAULT_PX);
```

#### `drawRouteLine`, `drawDestinationMarker`, `drawPlayerMarker`

Draw the part of the route still to go (width kept between 4 and 12 px, with an outline), the
marker at its end, and the player as an arrow that points along the heading (size 10 to 24 px,
default 16).

- Inputs: `canvas`, the remaining `Route` (or `undefined`; nothing is drawn), `camera`
  (zoom above 0), `style`; `drawPlayerMarker(canvas, position, camera, style, sizePx?)` takes
  a `Position` instead of a route.
- Outputs: an array of `Notice`.
- Errors: none are thrown; a route point or position that is not usable gives a `Notice`.

```ts
drawRouteLine(canvasAdapter, engine.getRemainingRoute(), camera, style);
drawPlayerMarker(canvasAdapter, position, camera, style);
```

#### `validatePosition`, `validateRoute`, `MAX_POSITION_COORDINATE`, `PLAYER_MARKER_DEFAULT_PX`, `PLAYER_MARKER_MIN_PX`, `PLAYER_MARKER_MAX_PX`, `ROUTE_LINE_MIN_WIDTH_PX`, `ROUTE_LINE_MAX_WIDTH_PX`

`validatePosition` checks that x and y are finite with an absolute value of at most
`MAX_POSITION_COORDINATE` (1,000,000 world units) and that the heading is finite.
`validateRoute` checks that every route point is finite. The other constants are the player
marker sizes (10, 16 default and 24 px) and the route line widths (4 and 12 px).

- Inputs: a `Position`, or a `Route`.
- Outputs: `undefined` when usable; a `ViewError` (position) or a `Notice` (route) when not.
- Errors: the message names the input and, for a position, its range.

```ts
const problem = validatePosition({ x: 10, y: 20, headingDegrees: 0 }); // undefined
```

### Pictures and style

#### `asImageHandle`

Marks a picture you loaded (an `Image`, `ImageBitmap` or canvas) as an `ImageHandle`, so it
can go into an `ImageEntry`. It changes and reads nothing.

- Inputs: any loaded picture.
- Outputs: the same value, typed as `ImageHandle`.
- Errors: none.

```ts
const handle = asImageHandle(await createImageBitmap(blob));
```

#### `ImageLookup`, `ImageEntry`, `ImageHandle`

`ImageHandle` is the opaque picture the canvas can draw. An `ImageEntry` is `{ image, width,
height }` with width and height in pixels above 0. An `ImageLookup` maps a picture reference
(the text after `picture:` or `upload:` in a prop kind, or the `ref` of the background) to an
`ImageEntry`: either an object keyed by reference, or a function `(ref) => ImageEntry |
undefined`. The Views never load pictures. A missing picture draws a placeholder and reports a
`Notice`.

- Inputs: the `images` option of a mount function, or `setImages` of a View.
- Outputs: none; the lookup is read when a picture is drawn.
- Errors: an `images` value that is not an object or a function, or an object entry with a
  width or height that is not above 0, is a `ViewError` at mount.

```ts
const hall = new Image();
hall.src = "hall.png";
await hall.decode();
const images: ImageLookup = {
  hall: { image: asImageHandle(hall), width: hall.naturalWidth, height: hall.naturalHeight },
};
const minimap = mountMinimap(canvas, engine, { images });
```

#### `DEFAULT_STYLE`, `STYLE_COLOR_KEYS`, `STYLE_LINE_KEYS`

`DEFAULT_STYLE` is the built-in look. `STYLE_COLOR_KEYS` are the 21 colour keys and
`STYLE_LINE_KEYS` the 11 line style keys that a map file may set; they are listed with their
defaults in `map-file-format.md`.

- Inputs: none (constants).
- Outputs: a `ResolvedStyle`, and two arrays of key names.
- Errors: none.

```ts
const keys = STYLE_COLOR_KEYS.filter((key) => key.startsWith("road."));
```

#### `isUsableColor`, `resolveStyle`

The colour rule: a style colour is usable when it is a text of `#` followed by exactly 3, 6 or 8
hex digits (upper or lower case); `red`, `rgb(0,0,0)`, `#abcd`, a number or an empty text are
not. `resolveStyle` turns a map's `style` into a complete `ResolvedStyle`. A colour that is
not usable, a missing key and a line width outside its range take the default, and a `Notice`
names the key and the default used. Unknown keys are ignored.

- Inputs: any value (`isUsableColor`); a map `StyleData` or `undefined` (`resolveStyle`).
- Outputs: a boolean; `{ resolved, notices }`.
- Errors: none.

```ts
isUsableColor("#AABBCC"); // true
const { resolved, notices } = resolveStyle({ colors: { ground: "green" } }); // notice, default
```

#### `contrastRatio`

The WCAG contrast ratio of two hex colours, from 1 to 21.

- Inputs: two usable colour texts.
- Outputs: a number from 1 to 21.
- Errors: none; give it usable colours (check with `isUsableColor`).

```ts
const ok = contrastRatio("#000000", "#ffffff") >= 4.5; // true
```

#### `LineStyle`, `ResolvedStyle`

`LineStyle` is `{ widthPx, dash? }` (width in px, dash segments in px). `ResolvedStyle` holds
every colour and line style the Views draw with, for example `groundColor`, `routeLineColor`
and `roadColors`. No drawing function fixes a colour of its own.

- Inputs: none (types).
- Outputs: the type of `DEFAULT_STYLE` and of `resolveStyle(...).resolved`.
- Errors: none.

```ts
const line: LineStyle = { widthPx: 3, dash: [6, 4] };
```

### Camera, projection and smoothing

#### `createCamera`, `validateCamera`, `MIN_ZOOM`, `MAX_ZOOM`, `MIN_VIEWPORT_SIZE`, `MAX_VIEWPORT_SIZE`

A `Camera` is `{ centerX, centerY, zoom, rotationDegrees, viewportWidth, viewportHeight }`.
`createCamera` fills the fields you leave out with defaults and checks the result;
`validateCamera` checks a camera. Zoom is 0.001 to 1000 pixels per world unit, a viewport side
is 1 to 16384 px, and the centre and rotation are any finite numbers.

- Inputs: `Partial<Camera>` (`createCamera`), a `Camera` (`validateCamera`).
- Outputs: a `Camera` or a `ViewError`; `undefined` or a `ViewError`.
- Errors: a field that is not finite, or a zoom or size outside its range; the message names
  the field and the range.

```ts
const camera = createCamera({ zoom: 2, viewportWidth: 300, viewportHeight: 200 });
```

#### `worldToScreen`, `screenToWorld`

Map a point between world units and screen pixels through a camera, including its rotation.

- Inputs: a valid `Camera` and a `Point` with finite x and y.
- Outputs: a `Point`, or a `ViewError`.
- Errors: an unusable camera or a point that is not finite.

```ts
const onScreen = worldToScreen(camera, { x: 10, y: 5 });
```

#### `panCamera`, `zoomCamera`

`panCamera` moves the camera by a screen distance. `zoomCamera` multiplies the zoom by a
factor and keeps the world point under the anchor fixed. Both return a new camera and leave
the old one unchanged.

- Inputs: `panCamera(camera, { dx, dy })` with finite px; `zoomCamera(camera, anchor, factor)`
  with an anchor in px and a finite factor above 0. A zoom past 0.001 or 1000 is clamped.
- Outputs: a `Camera`, or a `ViewError`.
- Errors: an unusable camera, delta, anchor or factor.

```ts
const next = zoomCamera(camera, { x: 150, y: 100 }, 1.25);
```

#### `MIN_TILT_DEGREES`, `MAX_TILT_DEGREES`, `DEFAULT_TILT_DEGREES`, `validateTilt`

The tilt angle limits (20 and 70 degrees), the default (35) and the check.

- Inputs: a tilt angle in degrees.
- Outputs: `undefined` when usable, else a `ViewError`.
- Errors: a value that is not finite or is outside 20 to 70.

```ts
const problem = validateTilt(80); // a ViewError naming "tilt angle" and 20 to 70
```

#### `projectTilted`, `unprojectTilted`

`projectTilted` maps a ground point and a height to the screen of the tilted view, which
draws in perspective: ground farther up the screen is smaller and narrower. A height lifts a
point by `height * zoom * cos(tilt)` times the scale of its ground point, so the lift is exact
at the player and smaller farther away. `unprojectTilted` maps a screen point back to the
ground, or to the plane at a height.

- Inputs: `projectTilted(ground, heightWorldUnits, tiltAngleDegrees, camera, focalDistancePx?)`;
  `unprojectTilted(screen, tiltAngleDegrees, camera, focalDistancePx?, heightWorldUnits = 0)`.
  Heights are finite world units. The focal distance is in CSS pixels and defaults to
  `1.5 * viewportHeight / tan(tilt)`.
- Outputs: a `Point`, or a `ViewError`.
- Errors: an unusable tilt, camera, point, height or focal distance; ground nearer than the
  near clip (a quarter of the focal distance, behind the viewer's feet); for `unprojectTilted`
  a screen point on or above the horizon row.

```ts
const top = projectTilted({ x: 4, y: 2 }, 12, 35, camera);
```

#### `depthOf`, `sortByDepth`

`depthOf` gives the distance of a ground point below the viewport centre, in world units. A
larger value is nearer the viewer, and the depth along the viewing axis falls as it grows, so
this is the perspective order.
`sortByDepth` orders items farther first and nearer last, so nearer blocks cover farther ones.
Items less than 0.001 world units apart in depth are ordered by identifier. The input array is
not changed.

- Inputs: `depthOf(ground, camera)`; `sortByDepth(items, camera)` with items `{ id, ground }`.
- Outputs: a number, or a new array; a `ViewError` for either.
- Errors: an unusable camera or point.

```ts
const ordered = sortByDepth([{ id: "a", ground: { x: 0, y: 5 } }, { id: "b", ground: { x: 0, y: -5 } }], camera);
```

#### `blockHeightValue`, `blockHeightOf`, `RAISED_KINDS`, `DEFAULT_BLOCK_HEIGHTS`

`RAISED_KINDS` are the prop kinds drawn as raised blocks (`building`, `house`, `tower`,
`wall-block`). `blockHeightValue` gives a prop's own `blockHeight` or the default of its kind
(0 for a kind that is not raised). `blockHeightOf` multiplies that by the height factor of the
kind (default 1).

- Inputs: a prop; for `blockHeightOf` also a `heightFactors` object from kind to a number from
  0 to 100.
- Outputs: a height in world units; `blockHeightOf` returns a `Notice` when the result is not
  finite or is below 0, and the prop is then drawn flat.
- Errors: none.

```ts
const height = blockHeightOf(prop, { building: 1.5 });
```

#### `advanceSmoothed`, `advanceSmoothedHeading`, `advanceCamera`

One frame of smoothing. `advanceSmoothed` moves a number towards its target, reaching 95% of a
change in the smoothing duration. `advanceSmoothedHeading` does the same for a heading in
degrees by the shorter turn. `advanceCamera` moves a whole camera, and jumps at once when
reduced motion is on.

- Inputs: `current`, `target`, `dtMs` (0 to 1000 ms) and `durationMs` (1 to 5000, default
  300); `advanceCamera(current, target, dtMs, durationMs, reducedMotion)`.
- Outputs: a number; a number; `{ camera, settling }` or a `ViewError`.
- Errors: `advanceCamera` rejects a duration outside 1 to 5000 ms and an unusable camera. The
  two number functions return `current` when an input is not finite.

```ts
const next = advanceSmoothed(0, 100, 16, 300); // between 0 and 100
```

#### `DEFAULT_SMOOTHING_MS`, `MIN_SMOOTHING_MS`, `MAX_SMOOTHING_MS`, `validateSmoothingDuration`

The default smoothing duration (300 ms), its limits (1 and 5000 ms) and the check.

- Inputs: a duration in ms.
- Outputs: `undefined` when usable, else a `ViewError`.
- Errors: a value that is not finite or is outside 1 to 5000.

```ts
const problem = validateSmoothingDuration(0); // a ViewError
```

#### `FrameClock`

Turns the timestamps you pass into frame intervals. It reads no clock. The first timestamp
gives an interval of 0; an interval longer than 1000 ms is cut to 1000; a timestamp that goes
backwards gives 0 and a `Notice`.

- Inputs: `tick(timestampMs)`, a finite number of ms.
- Outputs: `{ dtMs, notice? }`, or a `ViewError`.
- Errors: a timestamp that is not a finite number.

```ts
const clock = new FrameClock();
const tick = clock.tick(performance.now());
```

### Hit test, labels, frame gate and input

#### `hitTestPlace`, `HIT_RADIUS_PX`, `HitPlace`

Finds the place marker nearest to a screen point within a radius (default `HIT_RADIUS_PX`, 20
px). A `HitPlace` is `{ id, screenX, screenY }` in px.

- Inputs: `places` (an array of `HitPlace`), `point` `{ x, y }`, optional `radiusPx` (0 or
  more).
- Outputs: the nearest `HitPlace`, or `undefined` when none is in range.
- Errors: none; a point that is not finite or a negative radius gives `undefined`.

```ts
const hit = hitTestPlace(projected, { x: 120, y: 80 });
```

#### `placeLabels`, `LABEL_GAP_PX`, `LabelCandidate`, `LabelPlacement`, `PlacedLabel`, `Rect`

Chooses which labels fit without overlapping, with at least `LABEL_GAP_PX` (4 px) between
them, nudging a label when it helps. Lower `priority` numbers are placed first. A `Rect` is
`{ x, y, width, height }` in px.

- Inputs: `candidates` (`{ placeId, priority, screenX, screenY, width, height }`) and the
  `viewport` `{ width, height }` in px (above 0).
- Outputs: `{ labels, notices }`; a label that cannot be placed is left out.
- Errors: none are thrown; an unusable viewport or candidate gives a `Notice`.

```ts
const { labels } = placeLabels(candidates, { width: 300, height: 200 });
```

#### `FrameGate`, `drawIfDue`, `FrameInputs`

Decides whether a frame must be drawn. A draw is due when a version number, the pictures
signature or the settling flag changed, and never when the canvas is not visible.
`drawIfDue` calls your draw function only when it is due.

- Inputs: `FrameInputs` (`mapVersion`, `routeVersion`, `positionVersion`, `cameraVersion`,
  `viewportVersion`, `styleVersion`, `imagesSignature`, `settling`, `canvasVisible`), and for
  `drawIfDue` a gate and a draw function.
- Outputs: a boolean (true when it drew).
- Errors: none.

```ts
const gate = new FrameGate();
const drew = drawIfDue(gate, inputs, () => view.draw(canvasAdapter, state, now));
```

#### `bindInput`, `BindableCanvas`, `BindableEvent`, `InputBindingOptions`

Binds pointer, wheel, touch and key events of a canvas to a `FullMap` (drag, wheel and pinch,
click or tap to select, and the keys described in the canvas description). It sets
`touch-action: none` on the canvas.

- Inputs: `bindInput(canvas, fullMap, options?)`. `canvas` offers `addEventListener`,
  `removeEventListener`, `getBoundingClientRect` and `style`. `options` may have `onChange` and
  `onSelectResult` callbacks.
- Outputs: a function that removes every listener and restores `touch-action`.
- Errors: none are thrown; a command that fails reaches `onChange` as a `ViewError`.

```ts
const unbind = bindInput(canvas, fullMap, { onSelectResult: (r) => console.log(r) });
unbind();
```

### Canvas

#### `CanvasAdapter`, `CanvasLike`, `Context2DLike`, `ResizeResult`

`CanvasAdapter` implements `CanvasInterface` over a real 2D context, the only place the Views
touch it. `resize` sets the backing size for the pixel ratio. A `CanvasLike` is a canvas with
`width`, `height` and `getContext("2d")`; `Context2DLike` is the part of the context used.

- Inputs: `new CanvasAdapter(canvas)`; `resize(cssWidth, cssHeight, pixelRatio)` with sizes of
  1 to 16384 px and a pixel ratio above 0.
- Outputs: `{ pixelRatio, pixelWidth, pixelHeight, notices }`, or a `ViewError`.
- Errors: a canvas without 2D drawing, or a size outside its range.

```ts
const adapter = new CanvasAdapter(canvas);
const sized = adapter.resize(300, 200, window.devicePixelRatio);
```

#### `CanvasInterface`, `LineCap`, `LineJoin`, `TextAlign`, `TextSize`

The drawing calls the Views use (`save`, `restore`, `translate`, `rotate`, `scale`, paths,
`fill`, `stroke`, `clip`, colour, line, alpha, `drawText`, `measureText`, `drawImage`). A test
can pass a recording canvas that stores the calls. `LineCap` and `LineJoin` are the values of
the 2D context, `TextAlign` is `left`, `center` or `right`, and `TextSize` is `{ width,
height }` in px.

- Inputs: none (types).
- Outputs: none.
- Errors: none.

```ts
function drawDot(canvas: CanvasInterface, x: number, y: number): void {
  canvas.beginPath();
  canvas.arc(x, y, 4, 0, Math.PI * 2);
  canvas.fill();
}
```

### Accessibility

#### `describeCanvas`, `VIEW_DESCRIPTIONS`, `FOCUS_INDICATOR`, `ViewKind`, `ViewDescription`, `AccessibleElement`

`describeCanvas` gives a canvas an accessible name and a description of its keys. For the full
map it also makes the canvas focusable. `VIEW_DESCRIPTIONS` holds the name and description of
each `ViewKind` (`minimap`, `fullMap`, `tiltedView`). `FOCUS_INDICATOR` holds the focus ring
colour (`#1a56db`), the page background it is checked against (`#ffffff`), and its width and
offset (3 px and 2 px). While the canvas has keyboard focus it shows that outline.

- Inputs: `describeCanvas(canvas, kind)`, with an element that offers `setAttribute`,
  `removeAttribute`, `addEventListener`, `removeEventListener` and a `style`.
- Outputs: a function that removes everything the call added.
- Errors: none.

```ts
const undo = describeCanvas(canvas, "fullMap");
undo();
```

#### `createLiveRegion`, `LiveRegion`, `LiveRegionElement`

Makes an element a polite `aria-live` region and returns a writer for the guidance sentence
(the same sentence twice in a row is not repeated) and for place focus announcements.

- Inputs: an element that offers `setAttribute`, `removeAttribute` and a `textContent`.
- Outputs: a `LiveRegion` with `setGuidance(sentence)`, `announce(text)` (always shown, also
  when repeated) and `dispose()` (removes the attributes and empties the region).
- Errors: none.

```ts
const region = createLiveRegion(document.querySelector("#guidance")!);
region.setGuidance("Turn left in 40 metres.");
```

### Errors and notices

#### `isViewError`, `ViewError`, `ViewNotice`

A `ViewError` is `{ message }`: an input was refused, the call changed nothing, and the message
is plain words that name the input and its range. A `ViewNotice` is `{ message }` too: a
condition the View reports and goes on from (a missing picture, a dropped label). It is
exported as `ViewNotice` so it does not clash with the engine's `Notice`. `isViewError` tells
a `ViewError` from a result.

- Inputs: any value.
- Outputs: a boolean.
- Errors: none.

```ts
const result = zoomCamera(camera, { x: 0, y: 0 }, 2);
if (isViewError(result)) console.warn(result.message);
```

### Mounting types

#### `MountHandle`, `MinimapHandle`, `FullMapHandle`, `TiltedViewHandle`

What the Mount_Functions return. Every handle has `destroy()`. The controls of each handle are
listed under "The Mount_Handle".

- Inputs: none (types).
- Outputs: the handle types of `mountMinimap`, `mountFullMap` and `mountTiltedView`.
- Errors: a control returns a `ViewError`, or nothing when it worked; after `destroy()` it
  returns a `ViewError` that says the view has been destroyed.

```ts
const handle: MinimapHandle | ViewError = mountMinimap(canvas, engine);
```

#### `BaseMountOptions`, `MinimapMountOptions`, `FullMapMountOptions`, `TiltedViewMountOptions`

The option objects of the Mount_Functions. Every field is optional; the ranges and defaults are
in the table under "Options".

- Inputs: none (types).
- Outputs: none.
- Errors: an option outside its range is a `ViewError` at mount that names the option.

```ts
const options: MinimapMountOptions = { zoom: 2, smoothingDurationMs: 200 };
```

#### `MountServices`

The five browser services (`requestFrame`, `cancelFrame`, `createResizeObserver`,
`matchReducedMotion`, `devicePixelRatio`) a mounted View may use. See "Services".

- Inputs: none (type); pass an object with some or all of them as the `services` option.
- Outputs: none.
- Errors: a `services` entry that is not a function is a `ViewError` at mount.

```ts
const services: Partial<MountServices> = { devicePixelRatio: () => 2 };
const minimap = mountMinimap(canvas, engine, { services });
```

#### `MountableCanvas`, `FullMapCanvas`, `MinimapEngine`, `FullMapEngine`, `DestinationTarget`

The parts of a canvas and of an Engine that the Mount_Functions use. A `MountableCanvas` is a
`CanvasLike` with `setAttribute`, `removeAttribute`, `clientWidth` and `clientHeight`;
a `FullMapCanvas` also takes input (`BindableCanvas`). A `MinimapEngine` offers `getMap`,
`getPosition`, `getRemainingRoute` and `getGuidanceSentence`; a `FullMapEngine` adds
`setDestination` (a `DestinationTarget`). The real `Engine` and a canvas element satisfy
these types.

- Inputs: none (types).
- Outputs: none.
- Errors: a value that lacks a member is a `ViewError` at mount.

```ts
const engineForMap: FullMapEngine = new Engine();
```

### Types of the three views

#### `MinimapOptions`, `MinimapState`, `MinimapDraw`, `NorthMark`

Options of `new Minimap` (`width`, `height` in px 1 to 16384; `zoom`; `smoothingDurationMs`;
`reducedMotion`; `images`), the state for a frame (`position`, optional `remainingRoute` and
`destinationPlaceId`), the result of `draw` (`{ drew, notices }`), and the north mark (`tip`,
`baseLeft`, `baseRight` points and `directionDegrees`).

- Inputs: none (types).
- Outputs: none.
- Errors: a value outside its range is a `ViewError` from the constructor or `draw`.

```ts
const state: MinimapState = { position, remainingRoute: engine.getRemainingRoute() };
```

#### `FullMapOptions`, `FullMapState`, `FullMapDraw`, `FullMapChange`, `FullMapSelection`, `FullMapSelectResult`, `FocusAnnouncement`

Options of `new FullMap` (`engine`, `onSelect`, `width`, `height`, `images`), the frame state, the
result of `draw`, the result of a camera operation (`{ notices, announcement? }`), what a
selection hit (`{ kind: "place", placeId }` or `{ kind: "point", point }`), the result of a
selection (`selection`, `handled`, and `route` or `noWayMessage`), and the result of a focus
command (`text` to announce and, for Enter, `result`).

- Inputs: none (types).
- Outputs: none.
- Errors: a value outside its range is a `ViewError` from the method that took it.

```ts
const onSelect = (selection: FullMapSelection): void => console.log(selection.kind);
```

#### `TiltedViewOptions`, `TiltedViewState`, `TiltedViewDraw`

Options of `new TiltedView` (`width`, `height`, `zoom`, `smoothingDurationMs`, `reducedMotion`,
`images`), the frame state and the result of `draw`.

- Inputs: none (types).
- Outputs: none.
- Errors: a value outside its range is a `ViewError` from the constructor or `draw`.

```ts
const view = new TiltedView(map, { zoom: 2 } satisfies TiltedViewOptions);
```

#### `Camera`, `Point`, `LayerName`, `DrawMapLayersInput`, `WorldRegion`

Types used above: `Point` is `{ x, y }`; `Camera` is described under `createCamera`;
`LayerName` is one name of `LAYER_ORDER`; `DrawMapLayersInput` is the input of `drawMapLayers`;
`WorldRegion` is `{ minX, minY, maxX, maxY }` in world units.

- Inputs: none (types).
- Outputs: none.
- Errors: none.

```ts
const region: WorldRegion = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
```
