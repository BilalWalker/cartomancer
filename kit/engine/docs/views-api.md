# Views API reference

The Views draw a map, a route and a player on a canvas. This file documents mounting, which
puts a View on a canvas with one call. Positions use the Screen_Convention of the engine: x
grows right, y grows down, and a heading is in degrees clockwise from the positive x axis.
Zoom is in CSS pixels per world unit. Sizes are in CSS pixels.

A call that is given input it cannot use returns a `ViewError` with a plain message that names
the input and its allowed range. A rejected call changes nothing.

## Mounting

Every Mount_Function takes a canvas element, an Engine and an options object, and returns a
Mount_Handle or a `ViewError`. The Engine must have a map loaded. The application only feeds
positions to the engine with `feedPosition`; the mounted View reads the position, the remaining
route and the guidance from the engine on every animation frame.

Mounting order: the inputs are checked first, then the View and the canvas adapter are built,
and only then are the observer, the listeners and the first frame request added. When a mount
returns a `ViewError`, no listener, observer, frame request or canvas size is left behind.

The View reads the map from the engine once, when it is mounted. To show a map loaded later,
destroy the View and mount again.

### `mountMinimap`

Puts a Minimap on a canvas: a round map that stays centred on the player and turns so that the
heading points up the screen, with the route line, the markers and the place names.

- Inputs: `mountMinimap(canvas, engine, options?)`.
  - `canvas`: a canvas element with a 2D context and a CSS size of 1 to 16384 pixels each way.
    A canvas can hold one View at a time.
  - `engine`: an `Engine` with a map loaded (it must offer `getMap`, `getPosition`,
    `getRemainingRoute` and `getGuidanceSentence`).
  - `options`: see "Options" below.
- Outputs: a `MinimapHandle`, or a `ViewError`.
- Errors: a first argument that is not a canvas element; an engine that lacks a function the
  View reads or has no map; options that are not an object; a zoom, zoom limit or smoothing
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
  - `engine`: an `Engine` with a map loaded. It must offer the four functions of `mountMinimap`
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

Puts a Tilted_View on a canvas: the map seen from above at a slant, centred on the player with
the heading up the screen, in which buildings and houses are raised blocks, with the route
line, the player, the markers and the place names.

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
| `tiltAngleDegrees` | `mountTiltedView` | finite number from 20 to 70 (degrees) | 45 |
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
| engine has no map | `engine` and "no map" |
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
