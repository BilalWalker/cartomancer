# Implementation Plan: Map Views

## Overview

This plan builds Block B of `docs/brief.md` in TypeScript: the Views (Minimap, Full_Map, Tilted_View) and their Mount_Functions inside `kit/engine/src/views/`, and the bare demo page in `kit/demo/`. The order is:

1. Groups 1 to 12 hold the Engine-side gaps and all pure logic: the commit rule update, `Engine.getMap`, the `snapToRoad` export, the five `blockHeight` steps, views foundation, camera, spatial index and visibility, style, layer pieces (including road batching), label placement and layer order, hit test, smoothing, tilted projection and block height, frame gate, input state machine, and a task that commits the task status files.
2. Groups 13 to 16 hold, in this order: `drawImage` and the image lookup, picture props, the background picture layer, the frame gate image signature, the hex colour rule and the style key tables with their drift test (all in group 13, before any View uses them), then the three Views, the canvas adapter, input binding, accessibility, the mount functions (`mount.ts`, which also carries the smoke test allowlist edit), the public exports and the Views API doc.
3. Groups 17 to 21 hold the demo page (which uses only the Mount_Functions), a checkpoint, the Playwright frame benchmark, a second checkpoint, and last the Gate.

The Screen_Convention of the engine core applies everywhere: x grows right, y grows down, a heading is in degrees clockwise from the positive x axis. World north is the negative y direction.

Each task is small (a few files) and ends with its own commit. A piece of code and its tests go in ONE commit, never two. Every property test sits in the same task as the code it tests. Every commit builds and passes the default suite, and no task uses code from a later task. Property tests are required tasks, not optional.

## Working rules for every task

- One task, one commit. Never put several tasks in one commit. Never push. Commit only on branch `wip/build`; never switch branches, never touch `main`, never use `git reset`.
- Run exactly one command per tool call. No chaining (`&&`, `;`), no pipes, no multi-line scripts. Create and edit files with the file tools, not with shell commands.
- Before committing, run `npm run build` (a `tsc --noEmit` check) and `npm test` (Vitest, single run) in `kit/engine`, each as its own call. Both must pass. For tasks that touch `kit/demo`, also run `npm run build` and `npm test` in `kit/demo`, each as its own call.
- Stage by path (`git add <path>`, one call per path). Never `git add -A` or `git add .`.
- Commit subject uses `Area: what changed`, at most 72 characters, as named in each task. The body (wrapped at 72 characters) says why and how it was verified. No attribution lines.
- No skipped tests, no raised time limits, no loosened thresholds. If a property fails, report the failing property and its shrunk counterexample; do not weaken the test.
- Every property test runs at least 100 cases (`numRuns: 100` or more), starts with the comment `// Feature: map-views, Property N: <title>`, and leaves fast-check's seed and shrunk counterexample reporting on.
- Every task that adds a View_Error or Notice adds an example test for it (plain words, names the input, no coordinates where the requirement says so) and, for each numeric input with a range, boundary tests at the lower bound, upper bound, just below, just above, NaN, +Infinity and -Infinity (Requirements 19.15, 19.16).
- Files under `kit/engine/src/views/` other than `canvas-adapter.ts`, `input-binding.ts` and `mount.ts` import no browser global and mention no application concept (cars, missions, hospitals, rooms) and no existing game or product. `mount.ts` reaches browser services only through the injectable `services` option.
- The engine core behaviour stays unchanged for every map file without `blockHeight`, and no existing engine-core test is edited to make it pass (Requirements 19.12, 19.17, 23.12). New tests and the extension of the test generator are allowed; existing assertions stay as they are.
- Test files for the Views go under `kit/engine/tests/views/`, helpers under `kit/engine/tests/views/helpers/`.

## Tasks

- [x] 1. Commit rule update
  - [x] 1.1 Update the commit rules steering file
    - Already done and committed as `e0bdb87` (`Rules: code and its tests go in one commit`). The steering file says a piece of code and its tests go in ONE commit, never two. No further work.
    - _Requirements: 19.5_

- [x] 2. Engine-side gaps (all before any view code)
  - [x] 2.1 Engine.getMap
    - Add `getMap(): EngineMap | undefined` to `kit/engine/src/engine.ts`, returning a defensive copy like `getPlaces()` does and `undefined` before a map is loaded. Add an entry with a usage example to `kit/engine/docs/api.md`.
    - Extend `tests/engine-api.test.ts`: no map, loaded map, the copy does not change engine state when edited, and the existing check that docs match exports still passes.
    - Commit subject: `Engine: add getMap for read access to the loaded map`
    - _Requirements: 19.13_
  - [x] 2.2 Export and document snapToRoad
    - Add `snapToRoad`, `isNoUsableRoad` and the `NoUsableRoadResult` type to `kit/engine/src/index.ts`. Add one entry each to `kit/engine/docs/api.md` with a usage example. No change to `snapping.ts` logic.
    - Extend the export-list check in `tests/engine-api.test.ts` so the new exports and doc entries must match.
    - Commit subject: `Engine: export and document snapToRoad`
    - _Requirements: 11.4, 11.8, 19.13_
  - [x] 2.3 blockHeight type and format document
    - Add the optional field `blockHeight?: number` to `PropData` (and the map file prop shape) in `kit/engine/src/types.ts`. In `kit/engine/docs/map-file-format.md`, list `blockHeight` in the Props table as optional (finite, 0 or more, world units), state the Default_Block_Height values (`building` 12, `house` 6, `tower` 24, `wall-block` 3, any other kind 0), and state why the field is not called `height` (`width` and `height` are the ground footprint).
    - Extend `tests/types.test.ts` with a type-level example that a Prop with and without `blockHeight` both compile. Run the whole engine-core suite unedited.
    - Commit subject: `Engine: add optional blockHeight to props and format doc`
    - _Requirements: 23.1, 23.2, 23.9, 23.10_
  - [x] 2.4 blockHeight loader check
    - In `kit/engine/src/map-loader-checks.ts`, make the Prop check accept an absent `blockHeight` (the Prop loads as before and no `blockHeight` is added) and a finite number of 0 or more (kept in the Map). Anything else (text, NaN, +Infinity, -Infinity, below 0) returns a plain error that names the Prop identifier and `blockHeight` and states "a finite number of 0 or more", and loads no Map.
    - Create `tests/map-loader-block-height.test.ts` with examples at 0, just below 0, a very large finite value, NaN, +Infinity, -Infinity and a text value, plus a Prop without the field that loads to the same Map as before. Run the whole engine-core suite unedited.
    - Commit subject: `Engine: check blockHeight when loading props`
    - _Requirements: 23.3, 23.4, 23.5, 23.11, 23.12_
  - [x] 2.5 blockHeight saver
    - In `kit/engine/src/map-saver.ts`, write `blockHeight` after `rotationDegrees` only for Props that have it, so the text for maps without it stays byte-for-byte as before.
    - Create `tests/map-saver-block-height.test.ts`: a Prop with `blockHeight` writes the key, a Prop without it writes no key, and the saved text of an existing hand-written map is unchanged. Run the whole engine-core suite unedited.
    - Commit subject: `Engine: write blockHeight when saving props`
    - _Requirements: 23.3, 23.6, 23.12_
  - [x] 2.6 Round-trip generator and property
    - Extend the Prop generator in `tests/helpers/arbitraries.ts` to produce Props with and without a finite `blockHeight` from 0 to 1,000. Existing assertions are not edited. Create `tests/map-saver-roundtrip-block-height.test.ts` with the property. Extend `tests/helpers/arbitraries.test.ts` so the generator is checked to produce both kinds of Prop.
    - **Property 21: Save and load round trip keeps blockHeight**
    - **Validates: Requirements 23.7**
    - Commit subject: `Engine tests: generate blockHeight in the round-trip property`
    - _Requirements: 23.3, 23.4, 23.6, 23.7, 23.12_
  - [x] 2.7 Mirror keeps blockHeight
    - Create `tests/mirror-block-height.test.ts` with the property over the extended generator: mirroring keeps every Prop's `blockHeight` and changes nothing beyond the existing mirror rules. Change `src/mirror.ts` only if the test shows it is needed (`mirrorMap` already copies each Prop with a spread, so no change is expected).
    - **Property 22: Mirroring keeps blockHeight and changes nothing else**
    - **Validates: Requirements 23.8**
    - Commit subject: `Engine tests: mirror keeps blockHeight on props`
    - _Requirements: 23.8, 23.12_

- [x] 3. Views foundation
  - [x] 3.1 View_Error and Notice types
    - Create `kit/engine/src/views/view-errors.ts` with `ViewError` and `Notice` types and plain-worded factories (`badNumber`, `outOfRange`, `badPoint`, `badSize`, `noContext`, `destroyed`, and similar) whose messages name the input and the allowed range and contain no coordinates.
    - Create `tests/views/view-errors.test.ts`: each factory's message names the input, states the range, contains no digits taken from a rejected point, and contains none of the markers `undefined`, `NaN`, `at `, `Error:`, `stack`.
    - Commit subject: `Views: add plain-worded error and notice types`
    - _Requirements: 2.4, 2.5, 19.15_
  - [x] 3.2 Canvas interface and recording canvas
    - Create `src/views/canvas-interface.ts` (the `CanvasInterface` of the design) and `src/views/recording-canvas.ts` (`RecordingCanvas` storing each call in order with arguments and the current fill colour, stroke colour, line width, and the accumulated transform matrix; `getCalls()`, `findCalls(op)`, and a count of paths begun).
    - Create `tests/views/canvas-interface-recording.test.ts`: draw a small fixed scene and assert the exact ordered call list and stored state, including nested save and restore and a translate then rotate.
    - Commit subject: `Views: add canvas interface and recording canvas`
    - _Requirements: 1.1, 1.3, 1.4, 1.5_
  - [x] 3.3 Boundary test for browser globals and dependencies
    - Create `tests/views/views-boundary.test.ts`: scan every file in `src/views/` except `canvas-adapter.ts`, `input-binding.ts` and `mount.ts` for the identifiers `window`, `document`, `HTMLCanvasElement`, `ResizeObserver`, `requestAnimationFrame`, `matchMedia`, and for the whole words car, mission, hospital, room (case-insensitive); assert `package.json` still has no `dependencies` field. The scan skips files that do not exist yet, so the test passes now and guards each later file.
    - Commit subject: `Views tests: guard the browser boundary`
    - _Requirements: 1.6, 1.7, 19.10, 19.18_

- [x] 4. Camera
  - [x] 4.1 Camera and transforms
    - Create `src/views/camera.ts` with `Camera`, `createCamera`, `worldToScreen`, `screenToWorld` as in the design (translate to viewport centre, rotate, scale, translate by minus the centre; validation returning a `ViewError`, previous state kept).
    - Create `tests/views/helpers/view-arbitraries.ts` with camera, viewport and point generators, and `tests/views/camera-round-trip.test.ts` and `tests/views/camera-no-shear.test.ts`. Add examples: rotation 0 moves x right and y down, rotation 90 maps +x to +y, rotation r and r+360 agree within 0.001, range and non-finite cases.
    - **Property 1: Transform round trip (world to screen to world)**
    - **Property 2: Transform round trip (screen to world to screen)**
    - **Property 3: No shear, uniform scaling (includes world centre maps to viewport centre)**
    - **Validates: Requirements 2.7, 2.8, 2.9, 2.10**
    - Commit subject: `Views: add camera transforms with round-trip properties`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10_
  - [x] 4.2 Camera pan and zoom at an anchor
    - Add `panCamera` and `zoomCamera` to `camera.ts` (zoom keeps the world point under the anchor fixed; invalid factor or anchor returns a `ViewError`; unchanged camera on error). Add `tests/views/full-map-zoom-anchor.test.ts` with the property and examples: pan keeps the world point under the pointer, factor 0, NaN and negative factor errors.
    - **Property 10: Zoom keeps the anchor point fixed in world space**
    - **Validates: Requirements 10.8**
    - Commit subject: `Views: add camera pan and anchored zoom`
    - _Requirements: 10.1, 10.2, 10.8, 10.9_

- [x] 5. Spatial index and visibility
  - [x] 5.1 Item bounds, map checks and the spatial index
    - Create `src/views/visible-set.ts` with item bounding boxes and `buildSpatialIndex(map)` (uniform grid, cell size from the median road length with a minimum of 10 world units, built once per map), and `src/views/map-inspect.ts` with `inspectMap(map)` returning the notices for no roads, empty map and no usable road (Requirements 3.8 to 3.10) or a `ViewError` naming the item kind and identifier for a non-finite coordinate (3.11).
    - Create `tests/views/visible-set-index.test.ts` and `tests/views/map-inspect.test.ts` with examples for each notice and the error, and for an index over a hand-written map.
    - Commit subject: `Views: add spatial index and map inspection`
    - _Requirements: 3.7, 3.8, 3.9, 3.10, 3.11_
  - [x] 5.2 Visible region and visible set
    - Add `visibleRegion(camera, margin)` and `computeVisibleSet(index, region)` to `visible-set.ts` (the margin covers the largest road width, the route line width in world units and the largest block height). Create `tests/views/helpers/naive-visibility-check.ts` (shares no code with `visible-set.ts`) and `tests/views/visible-set-model.test.ts`: the property, plus an example on the 5,000-road generated map (from `bench/generate-large-map.ts`) in which a region over at most 5% of the roads tests at most 25% of the roads (expose a count of roads tested).
    - **Property 4: Nothing visible is left out (index equals a plain check, including whole-extent cameras)**
    - **Validates: Requirements 3.4, 3.5, 3.6**
    - Commit subject: `Views: add visible set with model-checked index`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 6. Style
  - [x] 6.1 Default style and contrast
    - Create `src/views/style.ts` with `DEFAULT_STYLE` (one entry per item of Requirement 4.3) and `contrastRatio` (WCAG relative luminance). Create `tests/views/style-contrast.test.ts` using a contrast function written in the test itself: label text on label background at least 4.5, route line against every road kind colour and the ground at least 3.
    - Commit subject: `Views: add default style and contrast check`
    - _Requirements: 4.3, 4.5, 4.6, 4.7_
  - [x] 6.2 Resolve the map style
    - Add `resolveStyle(style)` to `style.ts`: fill every missing key from `DEFAULT_STYLE`, replace an unusable colour or an out-of-range line width (0 to 100) or dash (0 to 1000) with the default and return a Notice naming the key. Create `tests/views/style-resolution.test.ts`: a style that sets only some keys (the rest equal the defaults exactly), bad colour, width and dash cases with boundaries.
    - Commit subject: `Views: resolve map style over the default style`
    - _Requirements: 4.1, 4.2, 4.4, 4.8, 19.9_

- [x] 7. Layer pieces
  - [x] 7.1 Safe drawing helper
    - Create `src/views/draw-safe.ts`: wrappers over `CanvasInterface` that skip a call with a non-finite number, add a Notice naming the operation, and send nothing non-finite on. Create `tests/views/draw-safe.test.ts` with examples for each wrapped operation.
    - Commit subject: `Views: add drawing helper that skips non-finite input`
    - _Requirements: 1.1, 1.8_
  - [x] 7.2 Ground, blocked areas and props
    - Create `src/views/layers-areas.ts` with `drawGround`, `drawBlockedAreas`, `drawFlatProps`: polygon fill and outline in the colour of the kind, props by kind as plain shapes (unknown kind a rectangle), a picture reference as a placeholder rectangle labelled with the kind; Notices for a polygon with fewer than 3 points and for a prop with bad width, height or rotation. Props play no part in routes or guidance.
    - Create `tests/views/layers-areas.test.ts` with examples on the `RecordingCanvas`, including both Notices and the colour of each kind.
    - Commit subject: `Views: draw ground, blocked areas and props`
    - _Requirements: 6.2, 6.3, 6.4, 6.6, 6.7_
  - [x] 7.3 Road batching with path-count property
    - Create `src/views/road-batching.ts`: `batchUsableRoads` groups visible Usable_Roads by (kind, pixel width) with the width rounded to 0.25 px and raised to the 1 px floor, giving an outline list (roads under the 2 px footpath and corridor rule get no outline batch) and a fill list; `batchBlockedRoads` groups Blocked_Roads by pixel width; `drawRoadPass` draws one path per batch (one `moveTo` and `lineTo` per road, one `stroke`, round joins and caps set once per batch). Batches are ordered by kind then width. A road with a width that is not finite or not above 0 is left out with a Notice naming the road.
    - Create `tests/views/road-batching-path-count.test.ts` with the property over the `RecordingCanvas` and an example that draws a map of 5,000 roads of one kind and width and checks that the number of paths begun equals the number for a map with 1 road of that kind and width. Add examples for the 1 px floor, the skipped outline and the bad width Notice.
    - **Property 18: Path count does not depend on the number of roads**
    - **Validates: Requirements 5.10, 5.11, 22.1, 22.2, 22.5**
    - Commit subject: `Views: batch roads into one path per kind and width`
    - _Requirements: 5.5, 5.6, 5.9, 5.10, 5.11, 22.1, 22.2, 22.5, 22.11_
  - [x] 7.4 Roads layer
    - Create `src/views/layers-roads.ts` with `drawRoadOutlines`, `drawRoadFills`, `drawOneWayArrows` and `drawBlockedRoadMarks`, built on `road-batching.ts`: all outline batches before all fill batches, kind told apart by width and colour, dash from the style for a kind, arrowheads at least 40 px apart in one path per kind per pass, and Blocked_Roads as one dashed path per width in the blocked colour.
    - Create `tests/views/road-batching-order.test.ts` with examples on the `RecordingCanvas`: outlines before fills, dash for a styled kind, arrow spacing and one arrow path per kind per pass, blocked roads as one dashed path.
    - Commit subject: `Views: draw road outlines, fills, arrows and blocked roads`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.7, 5.8, 22.3, 22.4_
  - [x] 7.5 Route line, markers and input validation
    - Create `src/views/layers-route.ts` with `drawRouteLine` (remaining route only, outline below fill, round joins and caps, width kept between 4 and 12 px at every zoom), `drawDestinationMarker` (only while a route is active), `drawPlayerMarker` (10 to 24 px across, pointer for the heading), and `validatePosition` and `validateRoute` (finite coordinates of absolute value at most 1,000,000, finite heading; a route with a non-finite point draws no line and gives a Notice).
    - Create `tests/views/route-line.test.ts` with the property and examples: no line without a route, width limits at zoom extremes, marker sizes, bad position returns a `ViewError` and keeps the previous position, No_Way_Result message is exposed and no line is drawn.
    - **Property 6: Route line lies on the remaining route**
    - **Validates: Requirements 7.8**
    - Commit subject: `Views: draw route line and markers with a route property`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10_

- [x] 8. Labels and layer order
  - [x] 8.1 Label placement
    - Create `src/views/label-placement.ts` with `placeLabels(candidates, viewport)` as in the design (priority order, 4 px gap, move inside the viewport when it fits, leave out when it does not fit, leave out and Notice for non-finite or non-positive size). Create `tests/views/label-placement-overlap.test.ts` (property) and `tests/views/label-placement-example.test.ts` (destination place placed when it fits, priority order, same input same result, viewport nudging).
    - **Property 7: Place labels never overlap**
    - **Validates: Requirements 8.8**
    - Commit subject: `Views: add label placement with a no-overlap property`
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.7, 8.8, 8.9, 8.10_
  - [x] 8.2 Place markers and labels layer
    - Create `src/views/layers-places.ts` with `drawPlaceMarkers` and `drawPlaceLabels` (font 11 to 16 px at every zoom, label background and text colours, labels from `placeLabels`, an empty name gives a marker with no label and a Notice naming the place). Create `tests/views/layers-places.test.ts` with examples.
    - Commit subject: `Views: draw place markers and labels`
    - _Requirements: 8.1, 8.6, 8.11_
  - [x] 8.3 Fixed layer order
    - Create `src/views/draw-map-layers.ts` with `drawMapLayers(...)` calling the layers in the order ground, blocked areas, flat props, road outlines, road fills, blocked road marks, route line, destination marker, place markers, place labels, player marker. Create `tests/views/layer-order.test.ts` with the property over the `RecordingCanvas` call log, grouped by layer.
    - **Property 5: Layer order**
    - **Validates: Requirements 6.5**
    - Commit subject: `Views: draw map layers in a fixed order`
    - _Requirements: 6.1, 6.5_

- [x] 9. Hit test
  - [x] 9.1 Hit test for place markers
    - Create `src/views/hit-test.ts` with `hitTestPlace(places, point, radiusPx)` (nearest within the radius, lowest id on a tie within 0.001 px, none when out of range). Create `tests/views/helpers/naive-nearest-place.ts` (shares no code) and `tests/views/hit-test.test.ts` with the property and examples at the 20 px boundary.
    - **Property 12: Hit test returns the nearest place within range**
    - **Validates: Requirements 11.9**
    - Commit subject: `Views: add place hit test with a model-checked property`
    - _Requirements: 11.2, 11.3, 11.9_

- [x] 10. Smoothing
  - [x] 10.1 Smoothing step functions
    - Create `src/views/smoothing.ts` with `advanceSmoothed` and `advanceSmoothedHeading` (exponential approach, 95% of the change within the duration, default 300 ms, no overshoot, exact end at the target, shortest turn of at most 180 degrees using the engine's `signedAngleDifference`). Create `tests/views/smoothing.test.ts` with the property and examples (95% at 300 ms, duration limits 1 and 5000).
    - **Property 15: Smoothing moves monotonically toward the target without overshoot (and takes the shortest turn)**
    - **Validates: Requirements 13.8, 13.9**
    - Commit subject: `Views: add smoothing with a no-overshoot property`
    - _Requirements: 13.1, 13.2, 13.3, 13.7, 13.8, 13.9_
  - [x] 10.2 Camera smoothing, reduced motion and timestamps
    - Add `advanceCamera(current, target, dtMs, durationMs, reducedMotion)` and a `FrameClock` helper to `smoothing.ts`: reduced motion jumps to the target in the same frame, a non-finite timestamp gives a `ViewError` and keeps the camera, an earlier timestamp gives an interval of 0 and a Notice, an interval over 1000 ms is cut to 1000, a duration outside 1 to 5000 gives a `ViewError`. Add examples to `tests/views/smoothing.test.ts`.
    - Commit subject: `Views: add camera smoothing, reduced motion and clock checks`
    - _Requirements: 13.1, 13.4, 13.5, 13.6, 13.10, 13.11, 13.12, 13.13, 22.9_

- [x] 11. Tilted projection and block height
  - [x] 11.1 Tilted projection and its inverse
    - Create `src/views/tilted-projection.ts` with `projectTilted` (forward component times sin of the tilt, height lifted by height times cos of the tilt) and `unprojectTilted` (height 0). Create `tests/views/tilted-round-trip.test.ts` with the property and examples at the tilt limits 20 and 70 and a tilt out of range (`ViewError`).
    - **Property 14: Tilted projection round trip at ground level**
    - **Validates: Requirements 12.12**
    - Commit subject: `Views: add tilted projection with a round-trip property`
    - _Requirements: 12.2, 12.8, 12.9, 12.12_
  - [x] 11.2 Depth order
    - Add `depthOf` and `sortByDepth` (nearer after farther, ties within 0.001 by ascending identifier) to `tilted-projection.ts`. Create `tests/views/tilted-depth.test.ts` with examples: order for hand-placed blocks, tie rule.
    - Commit subject: `Views: add depth order for the tilted view`
    - _Requirements: 12.6, 12.7_
  - [x] 11.3 Block height
    - Create `src/views/block-height.ts` with `RAISED_KINDS` (`building`, `house`, `tower`, `wall-block`), `DEFAULT_BLOCK_HEIGHTS` (12, 6, 24, 3), `blockHeightValue(prop)` (the Prop's `blockHeight`, else the default of a raised kind, else 0), `blockHeightOf(prop, heightFactors)` (value times the kind's height factor, never the footprint `height` field; a non-finite or negative result returns a Notice naming the Prop so the caller draws it flat), `validateHeightFactor(kind, factor)` (0 to 100) and `largestBlockHeight(props, factors)` for the visible region margin.
    - Create `tests/views/block-height.test.ts` with examples: defaults per kind, `blockHeight` over the default, `blockHeight` on a non-raised kind (value kept, Prop stays flat), the factor, the footprint `height` never used, flat fallback with Notice for a negative or non-finite height, margin from the largest height, factor boundaries (0, 100, just below, just above, NaN, +Infinity, -Infinity).
    - Commit subject: `Views: add block height with default heights and factors`
    - _Requirements: 12.13, 12.14, 12.15, 12.16, 12.17, 12.18, 23.13, 23.14_

- [x] 12. Frame gate, input state machine and task status
  - [x] 12.1 Frame gate
    - Create `src/views/frame-gate.ts` with `FrameGate.shouldDraw(inputs)` (version counters for Map, Route, Position, Camera, Viewport and Style, a `settling` flag and a `canvasVisible` flag; true on any change, true while settling, true once more when settling ends, false and versions not remembered while the canvas is hidden or has a size of 0) and `drawIfDue(gate, inputs, draw)` that calls the draw function only when the gate says so. No clock is read.
    - Create `tests/views/frame-gate-unchanged.test.ts` with the property: drawing `drawMapLayers` through `drawIfDue` twice on the `RecordingCanvas` with no change between the two leaves zero calls for the second. Create `tests/views/frame-gate-changes.test.ts` with one example per change type (Map, Route, Position, Camera, Viewport, Style) asserting exactly one more frame and then zero calls, the one last frame after settling ends, a camera at rest in the same frame under reduced motion, and a hidden canvas that makes zero calls and draws again at the first frame with a valid size.
    - **Property 19: An unchanged frame makes zero drawing calls**
    - **Validates: Requirements 14.4, 14.9, 14.10, 22.6**
    - Commit subject: `Views: add frame gate with unchanged-frame property`
    - _Requirements: 14.4, 14.9, 14.10, 22.6, 22.7, 22.8, 22.9, 22.10, 22.12_
  - [x] 12.2 Pointer drag and selection
    - Create `src/views/input-state-machine.ts` with `InputEvent`, `InputCommand`, `InputState`, `processEvents` for pointer down, move and up: pan commands from drag deltas, a selection when released within 6 px and 500 ms, events with non-finite x, y or timestamp dropped with a Notice. Create `tests/views/input-pan-sum.test.ts` with the property and examples for selection, drag and dropped events.
    - **Property 16: Pointer drag commands sum to the total screen displacement**
    - **Validates: Requirements 15.12**
    - Commit subject: `Views: add pointer input reducer with a pan-sum property`
    - _Requirements: 11.1, 15.2, 15.3, 15.11, 15.12, 15.13_
  - [x] 12.3 Wheel, pinch and keys
    - Extend `processEvents`: wheel to zoom at the pointer with a factor from 0.5 to 2, two-finger pinch to zoom at the midpoint by the ratio of distances (no command under 1 px distance), keys as in Requirements 15.5 and 15.6 (arrows pan by 10% of the viewport, plus 1.25, minus 0.8, Home fit, F follow, brackets for the next and previous place, Enter activate), unused keys give no command. Create `tests/views/input-keys.test.ts` with examples.
    - Commit subject: `Views: add wheel, pinch and key commands to the input reducer`
    - _Requirements: 15.1, 15.4, 15.5, 15.6, 15.14, 15.15_
  - [x] 12.4 Record task status for the pure logic groups
    - Update the status of tasks 1 to 12 in `.kiro/specs/map-views/tasks.md` and, if it exists, `.kiro/specs/map-views/tasks.meta.json`, and commit those two files together as one commit. Run `npm run build` and `npm test` in `kit/engine` first, each as its own call. If neither file changed, make no commit.
    - Commit subject: `Specs: record map-views task status`
    - _Requirements: 19.2, 19.5_

- [x] 13. Pictures, colour rule and the three views
  - [x] 13.1 drawImage on the canvas interface
    - Add the opaque `ImageHandle` type and `drawImage(image, dx, dy, width, height)` to `src/views/canvas-interface.ts`. Implement it in `RecordingCanvas` (stores the call with the image handle, the four numbers, the current global alpha, and the accumulated transform) and in `SafeCanvas` in `src/views/draw-safe.ts` (skips the call and adds a Notice naming `drawImage` when a number is not finite or the width or height is not above 0; the image handle is passed on unread). No other file implements `CanvasInterface` yet (the adapter comes in task 14.1), so the suite stays green.
    - Create `tests/views/canvas-interface-draw-image.test.ts`: the recorded call and its stored state on the `RecordingCanvas`, and the skipped calls and Notices on `SafeCanvas` with boundaries (width and height 0, just above 0, NaN, +Infinity, -Infinity, negative). Extend `tests/views/canvas-interface-recording.test.ts` only by adding examples; existing assertions stay.
    - Commit subject: `Views: add drawImage to the canvas interface and test canvases`
    - _Requirements: 1.10, 1.11, 1.12, 19.15, 19.16_
  - [x] 13.2 Image lookup
    - Create `src/views/image-lookup.ts` with `ImageHandle` re-use, `ImageLookup` (object or function), `ImageEntry`, `asImageHandle` (identity cast), `pictureRefOfKind` (strips exactly one `picture:` or `upload:` prefix; `undefined` for other kinds) and `resolvePicture(images, ref)` that never throws: an entry is returned only when `images` is given, the lookup returns an object without throwing, `image` is neither `undefined` nor `null`, and `width` and `height` are finite and above 0; every other case returns `missing` with a plain Notice naming the reference. An object lookup is read with an own-property check, so `constructor` and `__proto__` find nothing.
    - Create `tests/views/image-lookup.test.ts`: prefixes (`picture:a:b` gives `a:b`, an empty reference), each missing case, a lookup that throws, a function lookup, own-property check, and boundaries for the entry width and height (0, just above 0, NaN, +Infinity, -Infinity).
    - Commit subject: `Views: add image lookup with a never-throwing resolver`
    - _Requirements: 24.1, 24.2, 24.3, 24.14, 24.15, 24.16, 19.15, 19.16_
  - [x] 13.3 Picture props drawn as image or placeholder
    - In `src/views/layers-areas.ts`, change `drawFlatProps` to take the lookup and a per-frame resolver (a `Map` memo so several props with one reference make one lookup and one Notice): a Picture_Prop with an entry is drawn with `drawImage` at the destination of the plain rectangle (same `save`, `translate`, `rotate`), a missing entry or an empty reference gives the labelled placeholder rectangle and a Notice naming the Prop identifier and the reference, and a Picture_Prop outside the Visible_Region makes no call. A `blockHeight` on a picture kind is ignored. Add `images?: ImageLookup` to `DrawMapLayersInput` in `src/views/draw-map-layers.ts`, create the memoised resolver once per call and pass it on; existing callers stay valid because the field is optional. Update the Views tests that read the old placeholder-only behaviour in the same commit.
    - Create `tests/views/picture-props.test.ts` with the property over `drawMapLayers` on the `RecordingCanvas` and examples for the image, the placeholder, the empty reference, the throwing lookup and the one-lookup-per-reference memo. The extension of this property to the three Views follows in task 13.15.
    - **Property 23: A Picture_Prop is an image or a placeholder, never nothing**
    - **Validates: Requirements 24.4, 24.5, 24.9, 24.16, 24.17**
    - Commit subject: `Views: draw picture props as image or placeholder`
    - _Requirements: 24.4, 24.5, 24.9, 24.11, 24.16, 24.17, 24.19, 12.17_
  - [x] 13.4 Background picture layer
    - In `src/views/layers-areas.ts`, add `drawBackgroundPicture(canvas, background, resolve, region)`: nothing and no Notice without a background; a Notice naming the field and range for a `scale` not finite or not above 0 or an `opacity` not finite or outside 0 to 1, before any lookup; a Notice naming the reference when the picture is missing; otherwise `save`, `setGlobalAlpha(opacity)`, `drawImage(image, 0, 0, image width times scale, image height times scale)`, `restore`, and no call when that rectangle lies outside the Visible_Region. `opacity` 0 still makes the call. In `src/views/draw-map-layers.ts`, add `"backgroundPicture"` to `LAYER_ORDER` between `"ground"` and `"blockedAreas"` and call the new function right after the ground. Update `tests/views/layer-order.test.ts` in the same commit so the existing layer-order property covers the twelve layers (its generator now sometimes adds a background picture and an image lookup).
    - Create `tests/views/background-picture.test.ts` with the property and examples: no background, missing picture, bad `scale` and `opacity` with boundaries (0, just above 0, 1, just above 1, NaN, +Infinity, -Infinity), `opacity` 0 and 1, outside the region, alpha restored after the call.
    - **Property 24: The background picture is drawn at its scale and opacity, before every later layer**
    - **Property 5 (extended): Layer order, now with the background picture layer**
    - **Validates: Requirements 24.6, 24.7, 24.8, 24.13, 24.18, 6.5**
    - Commit subject: `Views: add background picture layer after the ground`
    - _Requirements: 6.5, 24.6, 24.7, 24.8, 24.9, 24.13, 24.18, 24.19_
  - [x] 13.5 Frame gate notices a changed image lookup
    - Add `imagesSignature: string` to the `FrameGate` inputs in `src/views/frame-gate.ts` (a changed signature makes `shouldDraw` true; an empty signature never does) and a pure `buildImagesSignature(references, images)` in `src/views/image-lookup.ts` (for each distinct reference of the map, the handle identity, width and height of the resolved entry or `missing`; a throwing lookup counts as `missing`; no lookup is made for a map with no pictures) plus `collectPictureReferences(map)` (every Picture_Prop reference and the background `ref`). Existing callers pass the empty signature; existing assertions stay.
    - Extend `tests/views/frame-gate-unchanged.test.ts` (Property 19) with maps that have pictures: two draws with no change leave zero calls on the second, and a lookup entry that arrives or changes size makes the next draw non-empty. Add examples to `tests/views/frame-gate-changes.test.ts` and `tests/views/image-lookup.test.ts`.
    - **Property 19 (extended): An unchanged frame makes zero drawing calls, including image lookups**
    - **Validates: Requirements 14.4, 14.9, 14.10, 22.6, 24.12**
    - Commit subject: `Views: make the frame gate notice image lookup changes`
    - _Requirements: 14.9, 22.6, 24.12_
  - [x] 13.6 Hex colour rule and style key lists
    - In `src/views/style.ts`, replace the old colour check by the exported `isUsableColor` (a text that starts with `#`, then exactly 3, 6 or 8 hexadecimal digits of either case); `resolveStyle` replaces an unusable colour by the Default_Style colour and returns one Notice that names the key and the default colour. `DEFAULT_STYLE` keeps only `#rgb` and `#rrggbb` values and `contrastRatio` is unchanged. Export `STYLE_COLOR_KEYS` (the 21 colour keys, in table order) and `STYLE_LINE_KEYS` (the 11 line style keys, in table order) with the key-to-field table used by `resolveStyle`. A map colour with an alpha part goes to `setFillColor` and `setStrokeColor` as written. Update `tests/views/style-resolution.test.ts` in the same commit only where it relied on the old rule.
    - Create `tests/views/style-colour-rule.test.ts` with the property (an independent model in the test shares no code with `style.ts`) and the named accept and reject examples and the Notice text.
    - **Property 25: The hex colour rule accepts exactly `#rgb`, `#rrggbb` and `#rrggbbaa`**
    - **Validates: Requirements 4.9, 4.10, 4.11, 4.13, 4.16**
    - Commit subject: `Views: accept #rgb, #rrggbb and #rrggbbaa colours in styles`
    - _Requirements: 4.9, 4.10, 4.11, 4.13, 4.16_
  - [x] 13.7 Style tables in the format document with a drift test
    - In the Style section of `kit/engine/docs/map-file-format.md`, add the colour rule and its Notice, two plain Markdown tables with one row per key and the key in backticks in the first column (colour keys with the default colour; line style keys with the default width in CSS pixels and the default dash, `none` when there is none), the statement that a key the Views do not read is ignored and a key the map does not set takes its default, and the statement that the Engine loader accepts any colour text and the Views apply the rule (replacing the old statement that the engine does not check a colour text). The Block A loader behaviour is not changed.
    - Create `tests/views/style-doc-drift.test.ts`: read the document as raw text through Vite's `?raw` glob, cut out the Style section, parse both tables, and assert that the colour key list equals `STYLE_COLOR_KEYS` as a set and in order, each documented default equals the value in `DEFAULT_STYLE`, the line style key list equals `STYLE_LINE_KEYS`, and each documented width and dash equals the `LineStyle` in `DEFAULT_STYLE`. Add one example that a changed default makes the test fail (using a stand-in copy of the document text).
    - **Validates: Requirements 4.12, 4.13, 4.14, 4.15** (an example-style test, not a property)
    - Commit subject: `Docs: document style keys and test them against defaults`
    - _Requirements: 4.12, 4.13, 4.14, 4.15, 19.12_
  - [x] 13.8 Minimap
    - Create `src/views/minimap.ts`: player-centred camera whose rotation is the negated heading, smoothing through `advanceCamera`, clip to a circle with a rim, the North_Mark on the rim rotating with the map, the layers of `drawMapLayers` (with the optional `images` passed on), `resize` keeps the centre, map inspection notices, and `draw` goes through the `FrameGate`. Add a small hand-written fixture `tests/views/helpers/small-town.ts`.
    - Create `tests/views/minimap-player-centred.test.ts` and `tests/views/minimap-north-mark.test.ts` with the two properties, plus an example that draws the fixture on the `RecordingCanvas`, one that a second unchanged draw makes zero calls, and one that a picture prop is drawn from the `images` lookup.
    - **Property 8: Minimap keeps the player centred with heading up**
    - **Property 9: North mark points to world north**
    - **Validates: Requirements 9.7, 9.8**
    - Commit subject: `Views: add minimap with centring and north mark properties`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.6, 9.7, 9.8, 13.1, 16.3, 22.6, 24.1_
  - [x] 13.9 Minimap zoom limits and small size
    - Add `setZoomLimits(min, max)` and `setZoom(z)` to `minimap.ts` (defaults 0.5 and 4, range 0.001 to 1000, minimum below maximum, a zoom outside the limits is an error, the player marker does not move) and the Notice for a viewport under 40 by 40 with no circle drawn. Create `tests/views/minimap-zoom.test.ts` with examples and boundaries.
    - Commit subject: `Views: add minimap zoom limits and small size notice`
    - _Requirements: 9.5, 9.9, 9.10, 9.11_
  - [x] 13.10 Full map camera operations
    - Create `src/views/full-map.ts` with the camera at rotation 0, `pan`, `zoomAt` (clamped to the zoom limits with a Notice, defaults of the fit zoom and 8), `fit` (extent with a 5% margin, extent of at least 1 unit, empty map gives a `ViewError`), `follow`, the pan clamp that keeps at least 20% of the extent in view, `resize` keeps the centre, and `draw` through the `FrameGate` (with the optional `images` passed on to `drawMapLayers`). Create `tests/views/full-map-camera.test.ts` with examples and boundaries.
    - Commit subject: `Views: add full map pan, zoom, fit and follow`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.9, 10.10, 10.11, 10.12, 16.3_
  - [x] 13.11 Full map selection sets the destination
    - Add `select(screenPoint)` to `full-map.ts`: hit test the place markers (20 px), else convert with `screenToWorld` and call `Engine.setDestination({ point })`; set a place by id; a caller handler replaces setting the destination; a No_Way_Result message is shown to the caller; errors for a point outside the viewport, a map with no usable road, and a spot more than 100 world units or 200 px from a road (using `snapToRoad`). The view computes no route itself.
    - Create `tests/views/full-map-click-snaps.test.ts` with the property and examples for each branch.
    - **Property 11: A click lands on a usable road**
    - **Validates: Requirements 11.8**
    - Commit subject: `Views: add full map click to set a destination`
    - _Requirements: 11.2, 11.4, 11.5, 11.6, 11.7, 11.8, 11.10, 11.11, 11.12_
  - [x] 13.12 Full map place focus by keyboard
    - Add `focusNextPlace`, `focusPreviousPlace` and `activateFocusedPlace` to `full-map.ts` (order by identifier, a visible focus ring drawn on the focused place, Enter sets the destination, announcements for no places and no selected place returned as text for the live region). Create `tests/views/full-map-focus.test.ts`.
    - Commit subject: `Views: add full map place focus by keyboard`
    - _Requirements: 15.6, 15.16, 15.17_
  - [x] 13.13 Tilted view with block heights
    - Create `src/views/tilted-view.ts`: player-centred heading-up camera with the player in the lower half, ground layers first (pictures are added in task 13.15), raised blocks (kinds in `RAISED_KINDS`) with top and darker side faces in depth order, each block's height from `blockHeightOf` (flat with a Notice when the height is not usable, a Prop outside the raised kinds drawn flat), other props flat, visible region widened by `largestBlockHeight`, `resize` keeps the centre, and `draw` through the `FrameGate`.
    - Create `tests/views/tilted-depth-order.test.ts` with the depth property and `tests/views/tilted-block-height.test.ts` with the block-height property, both over the `RecordingCanvas`, plus an example drawing the fixture and an example with `blockHeight` over the default, a `blockHeight` of 0 and a footprint `height` that is not used as a block height.
    - **Property 13: Raised blocks are drawn nearer after farther**
    - **Property 20: Raised block top lies above its footprint by the block height**
    - **Validates: Requirements 12.11, 12.15, 12.17, 12.19**
    - Commit subject: `Views: add tilted view with raised blocks and block heights`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.10, 12.11, 12.14, 12.15, 12.16, 12.17, 12.18, 12.19, 23.13_
  - [x] 13.14 Tilted view settings
    - Add `setTiltAngle` (20 to 70, default 45) and `setHeightFactor(kind, factor)` (0 to 100, default 1) to `tilted-view.ts`, each returning a `ViewError` and keeping the previous value for an input out of range. Create `tests/views/tilted-settings.test.ts` with examples and boundaries, and an example that a changed factor changes the drawn top lift.
    - Commit subject: `Views: add tilt angle and height factor settings`
    - _Requirements: 12.8, 12.9, 12.13_
  - [x] 13.15 Tilted view pictures and Property 23 on all three views
    - In `tilted-view.ts`, accept the optional `images` lookup, create the per-frame memoised resolver at the top of `draw`, call `drawBackgroundPicture` right after the ground with the tilted ground transform (`translate`, `rotate`, `scale(zoom, zoom * sin(tilt))`, `translate`) so the picture lies on the ground plane, and draw Picture_Props through `drawFlatProps` (flat, never raised; a `blockHeight` on a picture kind is ignored).
    - Create `tests/views/tilted-pictures.test.ts` (flat Picture_Prop, background on the ground plane, no depth sort involved) and extend `tests/views/picture-props.test.ts` so Property 23 runs on the Full_Map, the Minimap and the Tilted_View. Add the static test that `label-placement.ts`, `hit-test.ts` and `visible-set.ts` do not import `image-lookup.ts` to `tests/views/views-boundary.test.ts`.
    - **Property 23 (extended): A Picture_Prop is an image or a placeholder on every view**
    - **Validates: Requirements 24.4, 24.5, 24.10, 24.11, 24.17**
    - Commit subject: `Views: draw pictures in the tilted view and test all views`
    - _Requirements: 24.4, 24.5, 24.10, 24.11, 24.17, 12.17_

- [x] 14. Canvas adapter, input binding and accessibility
  - [x] 14.1 Canvas adapter
    - Create `src/views/canvas-adapter.ts` (`CanvasAdapter implements CanvasInterface` on a 2D context, `mount(canvas)` returning a `ViewError` when there is no 2D context, pixel size from CSS size times the pixel ratio rounded, one scale by the ratio, ratio limited to 3 and to a 16384 px side with a Notice, bad ratio replaced by 1 with a Notice, a bad CSS size returns a `ViewError` and keeps the previous size).
    - The adapter implements `drawImage` by passing the opaque handle to the context's `drawImage` (cast to the context's own image source type, which is a TypeScript type, not a browser global). Browser-global rule for this task: until task 15.1, the old smoke test scan is still in force, so `canvas-adapter.ts` must not contain the words `window`, `document` or `HTMLCanvasElement` anywhere (not in code, comments or strings). It uses structural types for the canvas, the context and the pixel ratio (passed in as an argument).
    - Create `tests/views/canvas-adapter.test.ts` using hand-written fake context and canvas objects, with boundaries for the ratio (0.5, 8, just below, just above, NaN, infinities) and the size, and examples that `drawImage` reaches the fake context with the same handle and numbers (Requirement 1.13).
    - Commit subject: `Views: add canvas adapter with pixel ratio handling`
    - _Requirements: 1.2, 1.9, 1.13, 14.1, 14.2, 14.3, 14.5, 14.6, 14.7, 14.8, 16.7_
  - [x] 14.2 Input binding
    - Browser-global rule for this task and task 14.3: until task 15.1, the old smoke test scan is still in force, so `input-binding.ts` (and `accessibility.ts` if it is created) must not contain the words `window`, `document` or `HTMLCanvasElement` anywhere. They work on the canvas and the event target that are passed in, with structural types.
    - Create `src/views/input-binding.ts`: attach pointer, wheel, touch and key listeners to a canvas, build plain `InputEvent` records, call `processEvents`, apply the commands to a `FullMap`, call `preventDefault` for wheel and touch, set `touch-action: none`, and return a function that removes every listener it added. Create `tests/views/input-binding.test.ts` with a fake event target that counts added and removed listeners.
    - Commit subject: `Views: add input binding for the full map`
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.10, 15.15_
  - [x] 14.3 Canvas accessibility
    - Add to `input-binding.ts` (or a new `src/views/accessibility.ts` if the file grows past a few hundred lines) the accessible name and key description of each canvas, a visible focus indicator style with contrast of at least 3 to 1, and an `aria-live="polite"` element that receives the guidance sentence and the focus announcements. Create `tests/views/accessibility.test.ts` with a fake element and a contrast check of the focus colour against the page background.
    - Commit subject: `Views: add canvas names, focus style and live guidance text`
    - _Requirements: 15.7, 15.8, 15.9_

- [x] 15. Mount functions
  - [x] 15.1 Mount core and mountMinimap
    - Smoke test allowlist edit (decided: it lands in THIS commit, the one that adds `mount.ts`, the last of the three allowlisted files; `canvas-adapter.ts` and `input-binding.ts` already exist and name no browser global, so the old scan stayed green until now). Create `tests/helpers/browser-global-scan.ts` with `BROWSER_GLOBAL_ALLOWLIST` (exactly `src/views/canvas-adapter.ts`, `src/views/input-binding.ts`, `src/views/mount.ts`), `BROWSER_GLOBAL_PATTERN` (`/\b(window|document|HTMLCanvasElement)\b/`, as today) and the pure `checkBrowserGlobals(files, allowlist)`: it strips the leading `../`, first adds a plain message for each allowlisted path with no matching file (`The allowlisted path "src/views/mount.ts" does not exist under kit/engine/src, so the allowlist is out of date.`), then adds `src/x.ts mentions a browser global` for each non-allowlisted file that matches the pattern; the match is on the exact path, no directory, pattern or prefix. Change the one test in `tests/smoke.test.ts` that scans for browser globals to `expect(checkBrowserGlobals(sources, BROWSER_GLOBAL_ALLOWLIST)).toEqual([])` over the same glob; this is the one permitted edit of an engine-core test and no other assertion in that file changes. Create `tests/smoke-allowlist.test.ts` with stand-in file lists: (a) a missing allowlisted path fails and the message names it; (b) an extra file that mentions `window` fails and the message names the file; (c) an allowlisted file that mentions `document` passes; (d) `src/views/mount-extra.ts` is still scanned; (e) all three present and clean gives an empty result. If `canvas-adapter.ts` or `input-binding.ts` turned out to need a browser global name earlier, this edit would instead have to land with the last of the three files to exist; the commit must leave the whole engine-core suite green.
    - Create `src/views/mount.ts` with the `MountServices` option (request and cancel frame, resize observer, reduced-motion query, pixel ratio; defaults to the real globals, reached only here), argument validation (canvas element, Engine functions the View reads, options ranges, an optional `images` that must be an object or a function, and for an object every own entry checked at mount with a View_Error naming `images` and the reference, a module-level `WeakSet` of mounted canvases), the Frame_Loop (reads Position, Route, remaining Route, Guidance and Map from the Engine on each frame, keeps exactly one pending frame request, passes the frame timestamp and the `images` lookup on, and builds `imagesSignature` for the `FrameGate` with `buildImagesSignature`), `destroy()` (cancels the frame, removes every listener, disconnects every observer, clears the mounted mark; a second call does nothing; controls after it return a destroyed `ViewError`) and `mountMinimap` with its handle (`setZoomLimits`, `setZoom`, `destroy`). Mounting order: validate, create the adapter, then register side effects, so a failure leaves nothing behind.
    - Create `tests/views/helpers/stand-ins.ts` (fake canvas, frame scheduler, resize observer, reduced-motion query and Engine, each counting what is added and removed) and `tests/views/mount-functions.test.ts` with examples: a valid mount, the loop reading from the Engine each frame, one pending frame, a reduced-motion change used from the next frame, the second `destroy()`, controls after `destroy()`.
    - Create `kit/engine/docs/views-api.md` with the mounting section: the three Mount_Functions, the options, the Mount_Handle, the View_Errors and `destroy()`, and the usage example for `mountMinimap`.
    - Commit subject: `Views: add mount core and mountMinimap`
    - _Requirements: 13.6, 19.19, 19.20, 19.21, 19.22, 19.23, 19.24, 21.20, 21.21, 21.22, 21.1, 21.2, 21.4, 21.5, 21.6, 21.7, 21.8, 21.9, 21.10, 21.17, 21.18_
  - [x] 15.2 mountFullMap
    - Add `mountFullMap` to `mount.ts`: the same validation and mounting order, binds the input of Requirement 15 through `input-binding.ts` and the accessibility parts, and returns a handle with `pan`, `zoomAt`, `fit`, `follow`, `select` and `destroy`. Add examples to `tests/views/mount-functions.test.ts` (input bound, handle controls reach the view, every listener added by the input binding is removed by `destroy()`). Add the usage example for `mountFullMap` to `views-api.md`.
    - Commit subject: `Views: add mountFullMap`
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.8, 21.17_
  - [x] 15.3 mountTiltedView
    - Add `mountTiltedView` to `mount.ts`: the same validation and mounting order, handle with `setTiltAngle`, `setHeightFactor` and `destroy`, options `tiltAngleDegrees` and `heightFactors` validated with the ranges of Requirement 12. Add examples to `tests/views/mount-functions.test.ts` and the usage example for `mountTiltedView` to `views-api.md`.
    - Commit subject: `Views: add mountTiltedView`
    - _Requirements: 21.1, 21.2, 21.4, 21.13, 21.17_
  - [x] 15.4 Mount errors and destroy-leaves-nothing
    - Create `tests/views/mount-errors.test.ts` with one example for each View_Error of Requirement 21 criteria 10 to 14 on each Mount_Function (not a canvas, Engine missing a function, option not an object or out of range with boundaries for the Zoom limits, smoothing duration, tilt angle and height factor, `images` that is `null`, a number or a text, and an `images` entry with a width or height that is not finite or not above 0, canvas already mounted, controls after destroy), each checking plain words, the named input and nothing left behind (Requirement 21.15). Create `tests/views/mount-destroy-leaves-nothing.test.ts` with the property.
    - **Property 17: Destroy leaves nothing behind**
    - **Validates: Requirements 21.8, 21.15, 21.19**
    - Commit subject: `Views tests: mount errors and destroy leaves nothing`
    - _Requirements: 21.8, 21.9, 21.10, 21.11, 21.12, 21.13, 21.14, 21.15, 21.18, 21.19_

- [x] 16. Public surface and docs
  - [x] 16.1 Views exports
    - Create `src/views/index.ts` re-exporting the documented View functions and types (including the three Mount_Functions, the public Draw_Functions, `drawBackgroundPicture`, `ImageLookup`, `ImageEntry`, `ImageHandle`, `asImageHandle`, `isUsableColor`, `STYLE_COLOR_KEYS` and `STYLE_LINE_KEYS`), and re-export them from `src/index.ts` without changing the existing exports. Create `tests/views/exports.test.ts` listing the expected export names.
    - Commit subject: `Views: add public exports`
    - _Requirements: 19.14, 21.7_
  - [x] 16.2 Views API doc
    - Complete `kit/engine/docs/views-api.md` with one entry per remaining exported function and type (including the `images` option, the `ImageLookup` shape with a usage example of an application that loads pictures and passes the lookup, and the colour rule): description, inputs with units and ranges, outputs, View_Errors, one usage example. Add a test in `tests/views/exports.test.ts` that the export list and the doc entries match exactly, and that the doc has a usage example for each of the three Mount_Functions.
    - Commit subject: `Views: add API reference doc`
    - _Requirements: 19.14, 21.17_

- [x] 17. Demo page
  - [x] 17.1 Scaffold the demo package
    - Create `kit/demo/package.json` (no `dependencies`; devDependencies vite, vitest, typescript, @playwright/test; scripts `build` = `tsc --noEmit`, `test` = `vitest --run`, `dev`, `bench`, `gate`), `tsconfig.json` (strict), `vite.config.ts` (with `server.port` 5173 and `strictPort: true`, so the address never changes silently), `vitest.config.ts`, `index.html` with an empty body and `src/main.ts` with an empty export, and a smoke test `tests/smoke.test.ts` that asserts there is no `dependencies` field and strict mode is on. Run `npm install` in `kit/demo` and commit the lockfile with it. Check that `.gitignore` already ignores `node_modules/` and `dist/`.
    - Commit subject: `Demo: add package scaffold`
    - _Requirements: 17.1_
  - [x] 17.2 Town_Map
    - Create `kit/demo/src/town-map.ts`: a hand-written `MapFile` of an invented town with at least 12 nodes, 3 road kinds, 6 places, 1 one-way road, 1 blocked area, 6 props of which at least 3 are raised kinds (one with its own `blockHeight`), and no real-world data. Create `kit/engine/tests/views/example-town-map.test.ts` that loads it with `parseMap`, checks the counts, and draws it on the `RecordingCanvas` in each View with a route, a player and a destination, asserting the presence of roads, blocked areas, props, route line, player marker, destination marker and place labels.
    - Commit subject: `Demo: add the town map with draw examples in each view`
    - _Requirements: 17.2, 17.10, 19.8_
  - [x] 17.3 Map choice
    - Create `kit/demo/src/map-choice.ts` with `chooseMap(name)` returning the Town_Map text or the Large_Generated_Map text from the engine generator with a fixed seed, with a plain error for an unknown name. Create `kit/demo/tests/map-choice.test.ts`: the same seed twice gives equal text, the large map has 5,000 roads and loads, unknown name gives the error.
    - Commit subject: `Demo: add map choice between town and large map`
    - _Requirements: 17.3, 17.12_
  - [x] 17.4 Player dot
    - Create `kit/demo/src/player-dot.ts`: position, heading from the latest movement, speed from 1 to 200 world units per second (default 30; an invalid speed keeps the previous and returns a message naming speed and range), stop at the map extent widened by 50 units with a message, timestamp-driven. Create `kit/demo/tests/player-dot.test.ts` with examples and boundaries.
    - Commit subject: `Demo: add arrow-key player dot`
    - _Requirements: 17.5, 17.6, 17.13, 17.14_
  - [x] 17.5 Reduced motion and status text
    - Create `kit/demo/src/reduced-motion.ts` (reads the setting and reports changes through an injected media query object, passed to the Mount_Functions as their reduced-motion service) and `kit/demo/src/status-text.ts` (pure formatting of the guidance sentence, distance left, the No_Way_Result message, road count and blocked-road notices, map load errors, and the no-usable-road notice). Create tests for both.
    - Commit subject: `Demo: add reduced motion reader and status text`
    - _Requirements: 13.4, 13.5, 13.6, 17.8, 17.9, 17.11, 17.12, 17.15_
  - [x] 17.6 Page layout
    - Fill `kit/demo/index.html` and `src/demo.css`: a statement that this is a demonstration of the Views and not an application, three canvases side by side at 1200 px and wider and in one column at 375 px (canvases 300 to 375 px wide, no horizontal scrolling), a map choice, a speed control, a status area, controls of at least 44 by 44 px with text labels and visible focus. Extend `tests/smoke.test.ts` to read the HTML and CSS and assert the notice text, the labels, the 44 px minimum size rule and the media queries.
    - Commit subject: `Demo: add page layout for three views`
    - _Requirements: 16.1, 16.2, 16.4, 16.5, 17.4, 17.11_
  - [x] 17.7 Wire the page with the mount functions
    - Fill `kit/demo/src/main.ts`: load the chosen map into the `Engine` (on failure show the errors and keep the previous map), mount the three Views only with `mountMinimap`, `mountFullMap` and `mountTiltedView` (no direct adapter, input binding or frame loop code in the demo), move the dot with the arrow keys while no canvas has focus, feed only the position and a timestamp to the Engine each frame, show the status text. Keep the logic in small testable functions; add `tests/main-wiring.test.ts` using fake canvases and the engine stand-ins for a load, a click, a position feed and a failed load, and a test that `main.ts` imports none of `CanvasAdapter`, `bindInput` or `requestAnimationFrame` directly. Run `npm run build` in `kit/demo` to check the Vite build.
    - Create `kit/demo/README.md` that states how to start the demo page: run `npm run dev` in `kit/demo`, then open `http://localhost:5173/` (the address of the Vite dev server, fixed by `strictPort`), plus the other scripts (`build`, `test`, `bench`, `gate`) and what the page shows. Add a test to `kit/demo/tests/smoke.test.ts` that reads the README and `vite.config.ts` and asserts the README contains `npm run dev`, `kit/demo` and `http://localhost:5173/`, and that the config sets port 5173 with `strictPort`.
    - Commit subject: `Demo: wire engine and views into the page`
    - _Requirements: 16.3, 17.1, 17.5, 17.7, 17.8, 17.9, 17.12, 21.16_

- [x] 18. Checkpoint - Demo page
  - Run `npm run build` and `npm test` in `kit/engine` and in `kit/demo`, each as its own call, and note the run time of each (the engine default suite must stay under 60 seconds). Run `npm run bench` in `kit/engine` once for the route times. Run `git status` and `git log --oneline` as separate calls.
  - Update the task status in `.kiro/specs/map-views/tasks.md` and `.kiro/specs/map-views/tasks.meta.json` (if it exists), and commit those two files together as one commit with the subject `Specs: record map-views task status`. If the status files did not change, make no commit.
  - Report plainly: the command that starts the demo page (`npm run dev` in `kit/demo`) and its address (`http://localhost:5173/`, as written in `kit/demo/README.md` and fixed in `vite.config.ts`), real `git status` output, the commit list, test results with time, the measured route times, and anything not done or not verified. No frame times exist yet at this point. Do not report credit figures. Do not push. Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 19.2, 19.5, 19.6, 19.7_

- [ ] 19. Frame benchmark
  - [ ] 19.1 Playwright frame benchmark
    - Create `kit/demo/playwright.config.ts` (starts the Vite server, a Chromium project, a separate command from the default suite) and `kit/demo/bench/frame-bench.spec.ts`: load the Large_Generated_Map, move the player along a fixed seeded path for at least 300 frames, measure each View's draw time with `performance.now()` and the interval between animation frames, measure the Full_Map at the fit zoom and at 4 px per world unit, count the paths begun per frame for each View with a counting wrapper around the Canvas_Interface, and print the median, 95th percentile and maximum in ms with 2 decimals, plus browser name and version, Node version, viewport, Device_Pixel_Ratio and machine description. No pass or fail threshold on the numbers. It fails with a plain reason only when fewer than 300 frames were measured (stating both numbers), a time is not finite or is negative (naming the View and the measurement), or the page or browser cannot run.
    - Add a Node-level test `kit/demo/tests/bench-stats.test.ts` for the statistics helper (median, 95th percentile, maximum, the failure reasons) in `kit/demo/bench/bench-stats.ts`.
    - Run `npm run bench` once (generous timeout) and put the printed numbers in the commit body. The benchmark stays out of `npm test`.
    - Commit subject: `Demo: add Playwright frame benchmark`
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.8, 18.9, 18.10, 22.13_

- [ ] 20. Checkpoint - End of block
  - Run `npm run build` and `npm test` in `kit/engine` and in `kit/demo`, each as its own call, with run times. Run `npm run bench` in `kit/engine` and `npm run bench` in `kit/demo` once more. Run `git status` and `git log --oneline` as separate calls.
  - Update the task status in `tasks.md` and `tasks.meta.json` (if it exists) and commit those two files together with the subject `Specs: record map-views task status`.
  - Report plainly: the start command and address of the demo page (`npm run dev` in `kit/demo`, `http://localhost:5173/`), real `git status` output, the commit list, test results with time, measured route times, measured frame times (median, 95th percentile, maximum for each View, with the machine description) and paths begun per frame, and anything not done or not verified. Do not report credit figures. Do not push. Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 18.7, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7, 19.12, 19.17_

- [ ] 21. Gate (last task)
  - If the Gate fails, the project stops here: report the failing step plainly and start no further block.
  - [ ] 21.1 Playwright gate check
    - Create `kit/demo/bench/gate.spec.ts` and a `gate` script. On the Large_Generated_Map, driven by mouse and keyboard: click a place on the Full_Map and check that the route line is drawn on the three Views; move the player along the route and check that the travelled part disappears and no new route is requested; leave the route by more than the reroute margin for longer than the reroute delay and check that a new route is drawn from the player to the same destination. Report, without a threshold, the number of frames with an interval above 50 ms for each View during these steps. Repeat the same steps at a 375 px wide viewport with touch input, and check there is no horizontal scrolling and each canvas is 300 to 375 px wide. Fail with a plain reason if the map does not load within 30 seconds (stating the time waited) or if the click returns a No_Way_Result (reporting its message).
    - Add a Node test for any pure helper the gate uses (for example the frame-interval counter).
    - Commit subject: `Demo: add Playwright gate check on the large map`
    - _Requirements: 16.1, 16.2, 16.6, 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.9, 20.10_
  - [ ] 21.2 Run the gate and report
    - Run `npm run gate` in `kit/demo`. Ask the user to try the same three steps by hand on the Demo_Page and to say what they saw. Update the task status in `tasks.md` and `tasks.meta.json` (if it exists) and commit those two files together with the subject `Specs: record map-views gate result`.
    - Report plainly: real `git status` output, the commit list, the gate result for each step, the frames over 50 ms for each View, and the frame benchmark numbers. If any step failed, say that the Gate failed, name the step, and state that the project stops there. Do not report credit figures. Do not push.
    - _Requirements: 20.7, 20.8_

## Notes

- Property tests are required tasks and carry no `*` marker. They are written inside the task of the code they test, so code and tests always land in one commit.
- Property numbers 1 to 25 match the design. Requirement 19.3 names 14 properties; design Properties 1 and 2 together cover the transform round trip. Properties 17 to 25 come from Requirements 21, 22, 12, 23, 24 and 4: 17 in task 15.4, 18 in task 7.3, 19 in task 12.1 (extended with image lookups in task 13.5), 20 in task 13.13, 21 in task 2.6, 22 in task 2.7, 23 in task 13.3 (extended to all three views in task 13.15), 24 in task 13.4, 25 in task 13.6.
- Property 5 (layer order) is extended in task 13.4 to twelve layers, by updating the Views test in the same commit as `LAYER_ORDER`.
- Task numbers after 12 changed: group 13 now starts with the picture and style tasks 13.1 to 13.7, and the three Views are tasks 13.8 to 13.15. Groups 14 to 21 keep their numbers.
- Smoke test allowlist (Requirement 19.19 to 19.24): the edit lands in task 15.1, the commit that adds `mount.ts`, the last of the three allowlisted files. Tasks 14.1 to 14.3 must not name `window`, `document` or `HTMLCanvasElement` in any file, so the old scan stays green until then.
- Property 19 is first proved on the gate over `drawMapLayers` (task 12.1); each View task (13.8, 13.10, 13.13) adds an example that its own `draw` makes zero calls when nothing changed.
- Requirement 8.9 (destination label kept) and the other criteria without a listed property are covered by example tests in their tasks.
- Requirement 12 criteria 15 to 18 (defaults, fallback, factor, margin) are examples in task 11.3; criterion 19 is Property 20 in task 13.13.
- Requirement 4.15 (format document against `DEFAULT_STYLE`) is an example-style drift test in task 13.7, not a property. The demo page start command and address are fixed in task 17.1, written in `kit/demo/README.md` in task 17.7 and reported in tasks 18 and 20.
- The pure logic stays in groups 1 to 12; groups 13 to 16 hold the three Views, adapter, binding and mount; the demo page (group 17) uses only the Mount_Functions.
- The Gate task is the last task. The end-of-block checkpoint (task 20) comes before it and reports build, tests and frame times; task 21.2 reports the Gate result.
- Task 1.1 is already committed as `e0bdb87` and is marked done.
- Waves below hold one task each because every task is its own commit on the same branch and later tasks edit files that earlier tasks created.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1"] },
    { "id": 1, "tasks": ["2.2"] },
    { "id": 2, "tasks": ["2.3"] },
    { "id": 3, "tasks": ["2.4"] },
    { "id": 4, "tasks": ["2.5"] },
    { "id": 5, "tasks": ["2.6"] },
    { "id": 6, "tasks": ["2.7"] },
    { "id": 7, "tasks": ["3.1"] },
    { "id": 8, "tasks": ["3.2"] },
    { "id": 9, "tasks": ["3.3"] },
    { "id": 10, "tasks": ["4.1"] },
    { "id": 11, "tasks": ["4.2"] },
    { "id": 12, "tasks": ["5.1"] },
    { "id": 13, "tasks": ["5.2"] },
    { "id": 14, "tasks": ["6.1"] },
    { "id": 15, "tasks": ["6.2"] },
    { "id": 16, "tasks": ["7.1"] },
    { "id": 17, "tasks": ["7.2"] },
    { "id": 18, "tasks": ["7.3"] },
    { "id": 19, "tasks": ["7.4"] },
    { "id": 20, "tasks": ["7.5"] },
    { "id": 21, "tasks": ["8.1"] },
    { "id": 22, "tasks": ["8.2"] },
    { "id": 23, "tasks": ["8.3"] },
    { "id": 24, "tasks": ["9.1"] },
    { "id": 25, "tasks": ["10.1"] },
    { "id": 26, "tasks": ["10.2"] },
    { "id": 27, "tasks": ["11.1"] },
    { "id": 28, "tasks": ["11.2"] },
    { "id": 29, "tasks": ["11.3"] },
    { "id": 30, "tasks": ["12.1"] },
    { "id": 31, "tasks": ["12.2"] },
    { "id": 32, "tasks": ["12.3"] },
    { "id": 33, "tasks": ["12.4"] },
    { "id": 34, "tasks": ["13.1"] },
    { "id": 35, "tasks": ["13.2"] },
    { "id": 36, "tasks": ["13.3"] },
    { "id": 37, "tasks": ["13.4"] },
    { "id": 38, "tasks": ["13.5"] },
    { "id": 39, "tasks": ["13.6"] },
    { "id": 40, "tasks": ["13.7"] },
    { "id": 41, "tasks": ["13.8"] },
    { "id": 42, "tasks": ["13.9"] },
    { "id": 43, "tasks": ["13.10"] },
    { "id": 44, "tasks": ["13.11"] },
    { "id": 45, "tasks": ["13.12"] },
    { "id": 46, "tasks": ["13.13"] },
    { "id": 47, "tasks": ["13.14"] },
    { "id": 48, "tasks": ["13.15"] },
    { "id": 49, "tasks": ["14.1"] },
    { "id": 50, "tasks": ["14.2"] },
    { "id": 51, "tasks": ["14.3"] },
    { "id": 52, "tasks": ["15.1"] },
    { "id": 53, "tasks": ["15.2"] },
    { "id": 54, "tasks": ["15.3"] },
    { "id": 55, "tasks": ["15.4"] },
    { "id": 56, "tasks": ["16.1"] },
    { "id": 57, "tasks": ["16.2"] },
    { "id": 58, "tasks": ["17.1"] },
    { "id": 59, "tasks": ["17.2"] },
    { "id": 60, "tasks": ["17.3"] },
    { "id": 61, "tasks": ["17.4"] },
    { "id": 62, "tasks": ["17.5"] },
    { "id": 63, "tasks": ["17.6"] },
    { "id": 64, "tasks": ["17.7"] },
    { "id": 65, "tasks": ["19.1"] },
    { "id": 66, "tasks": ["21.1"] },
    { "id": 67, "tasks": ["21.2"] }
  ]
}
```
