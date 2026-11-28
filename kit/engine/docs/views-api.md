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

## Options

Every option is optional.

| Option | Applies to | Allowed values | Default |
| --- | --- | --- | --- |
| `smoothingDurationMs` | all | finite number from 1 to 5000 (ms) | 300 |
| `images` | all | an object or a function, see "Pictures" | no pictures |
| `services` | all | an object with some or all of the five services, see "Services" | the real browser globals |
| `onNotice` | all | a function called with `{ message }` for each notice and drawing problem | none |
| `onGuidance` | all | a function called with the guidance sentence whenever it changes | none |
| `minZoom` | `mountMinimap` | number from 0.001 to 1000 | 0.5 (or the first zoom, if lower) |
| `maxZoom` | `mountMinimap` | number from 0.001 to 1000, above `minZoom` | 4 (or the first zoom, if higher) |
| `zoom` | `mountMinimap` | number from 0.001 to 1000, inside the zoom limits | 1 |

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
