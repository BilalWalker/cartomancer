# Implementation Plan: Map Views

## Overview

This plan builds Block B of `docs/brief.md` in TypeScript: the Views (Minimap, Full_Map, Tilted_View) inside `kit/engine/src/views/`, and the bare demo page in `kit/demo/`. The order is: the commit rule update, two Engine-side gaps (`Engine.getMap`, export and document `snapToRoad`), the canvas interface and recording canvas, camera, spatial index and visibility, style, layer pieces, label placement, hit test, smoothing, tilted projection, input state machine, the three Views, canvas adapter and input binding, exports and docs, the demo page (Town_Map, map choice, player dot, layout), a checkpoint, the Playwright frame benchmark, a second checkpoint, and last the Gate.

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
- Files under `kit/engine/src/views/` other than `canvas-adapter.ts` and `input-binding.ts` import no browser global and mention no application concept (cars, missions, hospitals, rooms) and no existing game or product.
- The engine core behaviour stays unchanged and no engine-core test is edited to make it pass (Requirement 19.12).
- Test files for the Views go under `kit/engine/tests/views/`, helpers under `kit/engine/tests/views/helpers/`.

## Tasks

- [ ] 1. Commit rule update
  - [ ] 1.1 Update the commit rules steering file
    - Edit `.kiro/steering/commit-rules.md` so it says that a piece of code and its tests go in ONE commit, never two. Replace any line that asks for tests in a separate commit (there may be none). Keep every other rule exactly as it is.
    - Verify by reading the file back: the one-commit rule is present and every other rule is unchanged.
    - Commit subject: `Rules: code and its tests go in one commit`
    - _Requirements: 19.5_

- [ ] 2. Engine-side gaps
  - [ ] 2.1 Engine.getMap
    - Add `getMap(): EngineMap | undefined` to `kit/engine/src/engine.ts`, returning a defensive copy like `getPlaces()` does and `undefined` before a map is loaded. Add an entry with a usage example to `kit/engine/docs/api.md`.
    - Extend `tests/engine-api.test.ts`: no map, loaded map, the copy does not change engine state when edited, and the existing check that docs match exports still passes.
    - Commit subject: `Engine: add getMap for read access to the loaded map`
    - _Requirements: 19.13_
  - [ ] 2.2 Export and document snapToRoad
    - Add `snapToRoad`, `isNoUsableRoad` and the `NoUsableRoadResult` type to `kit/engine/src/index.ts`. Add one entry each to `kit/engine/docs/api.md` with a usage example. No change to `snapping.ts` logic.
    - Extend the export-list check in `tests/engine-api.test.ts` so the new exports and doc entries must match.
    - Commit subject: `Engine: export and document snapToRoad`
    - _Requirements: 11.4, 11.8, 19.13_

- [ ] 3. Views foundation
  - [ ] 3.1 View_Error and Notice types
    - Create `kit/engine/src/views/view-errors.ts` with `ViewError` and `Notice` types and plain-worded factories (`badNumber`, `outOfRange`, `badPoint`, `badSize`, `noContext`, and similar) whose messages name the input and the allowed range and contain no coordinates.
    - Create `tests/views/view-errors.test.ts`: each factory's message names the input, states the range, contains no digits taken from a rejected point, and contains none of the markers `undefined`, `NaN`, `at `, `Error:`, `stack`.
    - Commit subject: `Views: add plain-worded error and notice types`
    - _Requirements: 2.4, 2.5, 19.15_
  - [ ] 3.2 Canvas interface and recording canvas
    - Create `src/views/canvas-interface.ts` (the `CanvasInterface` of the design) and `src/views/recording-canvas.ts` (`RecordingCanvas` storing each call in order with arguments and the current fill colour, stroke colour, line width, and the accumulated transform matrix; `getCalls()` and `findCalls(op)`).
    - Create `tests/views/canvas-interface-recording.test.ts`: draw a small fixed scene and assert the exact ordered call list and stored state, including nested save and restore and a translate then rotate.
    - Commit subject: `Views: add canvas interface and recording canvas`
    - _Requirements: 1.1, 1.3, 1.4, 1.5_
  - [ ] 3.3 Boundary test for browser globals and dependencies
    - Create `tests/views/views-boundary.test.ts`: scan every file in `src/views/` except `canvas-adapter.ts` and `input-binding.ts` for the identifiers `window`, `document`, `HTMLCanvasElement`, `ResizeObserver`, `matchMedia`, and for the whole words car, mission, hospital, room (case-insensitive); assert `package.json` still has no `dependencies` field.
    - Commit subject: `Views tests: guard the browser boundary`
    - _Requirements: 1.6, 1.7, 19.10_

- [ ] 4. Camera
  - [ ] 4.1 Camera and transforms
    - Create `src/views/camera.ts` with `Camera`, `createCamera`, `worldToScreen`, `screenToWorld` as in the design (translate to viewport centre, rotate, scale, translate by minus the centre; validation returning a `ViewError`, previous state kept).
    - Create `tests/views/helpers/view-arbitraries.ts` with camera, viewport and point generators, and `tests/views/camera-round-trip.test.ts` and `tests/views/camera-no-shear.test.ts`. Add examples: rotation 0 moves x right and y down, rotation 90 maps +x to +y, rotation r and r+360 agree within 0.001, range and non-finite cases.
    - **Property 1: Transform round trip (world to screen to world)**
    - **Property 2: Transform round trip (screen to world to screen)**
    - **Property 3: No shear, uniform scaling (includes world centre maps to viewport centre)**
    - **Validates: Requirements 2.7, 2.8, 2.9, 2.10**
    - Commit subject: `Views: add camera transforms with round-trip properties`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10_
  - [ ] 4.2 Camera pan and zoom at an anchor
    - Add `panCamera` and `zoomCamera` to `camera.ts` (zoom keeps the world point under the anchor fixed; invalid factor or anchor returns a `ViewError`; unchanged camera on error). Add `tests/views/full-map-zoom-anchor.test.ts` with the property and examples: pan keeps the world point under the pointer, factor 0, NaN and negative factor errors.
    - **Property 10: Zoom keeps the anchor point fixed in world space**
    - **Validates: Requirements 10.8**
    - Commit subject: `Views: add camera pan and anchored zoom`
    - _Requirements: 10.1, 10.2, 10.8, 10.9_

- [ ] 5. Spatial index and visibility
  - [ ] 5.1 Item bounds, map checks and the spatial index
    - Create `src/views/visible-set.ts` with item bounding boxes and `buildSpatialIndex(map)` (uniform grid, cell size from the median road length with a minimum of 10 world units, built once per map), and `src/views/map-inspect.ts` with `inspectMap(map)` returning the notices for no roads, empty map and no usable road (Requirements 3.8 to 3.10) or a `ViewError` naming the item kind and identifier for a non-finite coordinate (3.11).
    - Create `tests/views/visible-set-index.test.ts` and `tests/views/map-inspect.test.ts` with examples for each notice and the error, and for an index over a hand-written map.
    - Commit subject: `Views: add spatial index and map inspection`
    - _Requirements: 3.7, 3.8, 3.9, 3.10, 3.11_
  - [ ] 5.2 Visible region and visible set
    - Add `visibleRegion(camera, margin)` and `computeVisibleSet(index, region)` to `visible-set.ts`. Create `tests/views/helpers/naive-visibility-check.ts` (shares no code with `visible-set.ts`) and `tests/views/visible-set-model.test.ts`: the property, plus an example on the 5,000-road generated map (from `bench/generate-large-map.ts`) in which a region over at most 5% of the roads tests at most 25% of the roads (expose a count of roads tested).
    - **Property 4: Nothing visible is left out (index equals a plain check, including whole-extent cameras)**
    - **Validates: Requirements 3.4, 3.5, 3.6**
    - Commit subject: `Views: add visible set with model-checked index`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [ ] 6. Style
  - [ ] 6.1 Default style and contrast
    - Create `src/views/style.ts` with `DEFAULT_STYLE` (one entry per item of Requirement 4.3) and `contrastRatio` (WCAG relative luminance). Create `tests/views/style-contrast.test.ts` using a contrast function written in the test itself: label text on label background at least 4.5, route line against every road kind colour and the ground at least 3.
    - Commit subject: `Views: add default style and contrast check`
    - _Requirements: 4.3, 4.5, 4.6, 4.7_
  - [ ] 6.2 Resolve the map style
    - Add `resolveStyle(style)` to `style.ts`: fill every missing key from `DEFAULT_STYLE`, replace an unusable colour or an out-of-range line width (0 to 100) or dash (0 to 1000) with the default and return a Notice naming the key. Create `tests/views/style-resolution.test.ts`: a style that sets only some keys (the rest equal the defaults exactly), bad colour, width and dash cases with boundaries.
    - Commit subject: `Views: resolve map style over the default style`
    - _Requirements: 4.1, 4.2, 4.4, 4.8, 19.9_

- [ ] 7. Layer pieces
  - [ ] 7.1 Safe drawing helper
    - Create `src/views/draw-safe.ts`: wrappers over `CanvasInterface` that skip a call with a non-finite number, add a Notice naming the operation, and send nothing non-finite on. Create `tests/views/draw-safe.test.ts` with examples for each wrapped operation.
    - Commit subject: `Views: add drawing helper that skips non-finite input`
    - _Requirements: 1.1, 1.8_
  - [ ] 7.2 Ground, blocked areas and props
    - Create `src/views/layers-areas.ts` with `drawGround`, `drawBlockedAreas`, `drawFlatProps`: polygon fill and outline in the colour of the kind, props by kind as plain shapes (unknown kind a rectangle), a picture reference as a placeholder rectangle labelled with the kind; Notices for a polygon with fewer than 3 points and for a prop with bad width, height or rotation.
    - Create `tests/views/layers-areas.test.ts` with examples on the `RecordingCanvas`, including both Notices and the colour of each kind.
    - Commit subject: `Views: draw ground, blocked areas and props`
    - _Requirements: 6.2, 6.3, 6.4, 6.6, 6.7_
  - [ ] 7.3 Roads
    - Create `src/views/layers-roads.ts` with `drawRoadOutlines`, `drawRoadFills` (outlines of all visible roads first, round joins and caps, width in world units, at least 1 px, outline skipped under 2 px for footpath and corridor, dash from the style, kind told apart by width and colour), one-way arrowheads at least 40 px apart, and `drawBlockedRoadMarks` (blocked colour plus dash). A road with a width that is not finite or not above 0 is skipped with a Notice naming the road.
    - Create `tests/views/layers-roads.test.ts` with examples: outlines before fills, minimum width, skipped outline, arrow spacing, blocked road dash, bad width Notice.
    - Commit subject: `Views: draw roads, one-way arrows and blocked roads`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9_
  - [ ] 7.4 Route line, markers and input validation
    - Create `src/views/layers-route.ts` with `drawRouteLine` (remaining route only, outline below fill, round joins and caps, width kept between 4 and 12 px at every zoom), `drawDestinationMarker` (only while a route is active), `drawPlayerMarker` (10 to 24 px across, pointer for the heading), and `validatePosition` and `validateRoute` (finite coordinates of absolute value at most 1,000,000, finite heading; a route with a non-finite point draws no line and gives a Notice).
    - Create `tests/views/route-line.test.ts` with the property and examples: no line without a route, width limits at zoom extremes, marker sizes, bad position returns a `ViewError` and keeps the previous position, No_Way_Result message is exposed and no line is drawn.
    - **Property 6: Route line lies on the remaining route**
    - **Validates: Requirements 7.8**
    - Commit subject: `Views: draw route line and markers with a route property`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10_

- [ ] 8. Labels and layer order
  - [ ] 8.1 Label placement
    - Create `src/views/label-placement.ts` with `placeLabels(candidates, viewport)` as in the design (priority order, 4 px gap, move inside the viewport when it fits, leave out when it does not fit, leave out and Notice for non-finite or non-positive size). Create `tests/views/label-placement-overlap.test.ts` (property) and `tests/views/label-placement-example.test.ts` (destination place placed when it fits, priority order, same input same result, viewport nudging).
    - **Property 7: Place labels never overlap**
    - **Validates: Requirements 8.8**
    - Commit subject: `Views: add label placement with a no-overlap property`
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.7, 8.8, 8.9, 8.10_
  - [ ] 8.2 Place markers and labels layer
    - Create `src/views/layers-places.ts` with `drawPlaceMarkers` and `drawPlaceLabels` (font 11 to 16 px at every zoom, label background and text colours, labels from `placeLabels`, an empty name gives a marker with no label and a Notice naming the place). Create `tests/views/layers-places.test.ts` with examples.
    - Commit subject: `Views: draw place markers and labels`
    - _Requirements: 8.1, 8.6, 8.11_
  - [ ] 8.3 Fixed layer order
    - Create `src/views/draw-map-layers.ts` with `drawMapLayers(...)` calling the layers in the order ground, blocked areas, flat props, road outlines, road fills, blocked road marks, route line, destination marker, place markers, place labels, player marker. Create `tests/views/layer-order.test.ts` with the property over the `RecordingCanvas` call log, grouped by layer.
    - **Property 5: Layer order**
    - **Validates: Requirements 6.5**
    - Commit subject: `Views: draw map layers in a fixed order`
    - _Requirements: 6.1, 6.5_

- [ ] 9. Hit test
  - [ ] 9.1 Hit test for place markers
    - Create `src/views/hit-test.ts` with `hitTestPlace(places, point, radiusPx)` (nearest within the radius, lowest id on a tie within 0.001 px, none when out of range). Create `tests/views/helpers/naive-nearest-place.ts` (shares no code) and `tests/views/hit-test.test.ts` with the property and examples at the 20 px boundary.
    - **Property 12: Hit test returns the nearest place within range**
    - **Validates: Requirements 11.9**
    - Commit subject: `Views: add place hit test with a model-checked property`
    - _Requirements: 11.2, 11.3, 11.9_

- [ ] 10. Smoothing
  - [ ] 10.1 Smoothing step functions
    - Create `src/views/smoothing.ts` with `advanceSmoothed` and `advanceSmoothedHeading` (exponential approach, 95% of the change within the duration, default 300 ms, no overshoot, exact end at the target, shortest turn of at most 180 degrees using the engine's `signedAngleDifference`). Create `tests/views/smoothing.test.ts` with the property and examples (95% at 300 ms, duration limits 1 and 5000).
    - **Property 15: Smoothing moves monotonically toward the target without overshoot (and takes the shortest turn)**
    - **Validates: Requirements 13.8, 13.9**
    - Commit subject: `Views: add smoothing with a no-overshoot property`
    - _Requirements: 13.1, 13.2, 13.3, 13.7, 13.8, 13.9_
  - [ ] 10.2 Camera smoothing, reduced motion and timestamps
    - Add `advanceCamera(current, target, dtMs, durationMs, reducedMotion)` and a `FrameClock` helper to `smoothing.ts`: reduced motion jumps to the target, a non-finite timestamp gives a `ViewError` and keeps the camera, an earlier timestamp gives an interval of 0 and a Notice, an interval over 1000 ms is cut to 1000, a duration outside 1 to 5000 gives a `ViewError`. Add examples to `tests/views/smoothing.test.ts`.
    - Commit subject: `Views: add camera smoothing, reduced motion and clock checks`
    - _Requirements: 13.1, 13.4, 13.5, 13.6, 13.10, 13.11, 13.12, 13.13_

- [ ] 11. Tilted projection
  - [ ] 11.1 Tilted projection and its inverse
    - Create `src/views/tilted-projection.ts` with `projectTilted` (forward component times sin of the tilt, height lifted by height times cos of the tilt) and `unprojectTilted` (height 0). Create `tests/views/tilted-round-trip.test.ts` with the property and examples at the tilt limits 20 and 70 and a tilt out of range (`ViewError`).
    - **Property 14: Tilted projection round trip at ground level**
    - **Validates: Requirements 12.12**
    - Commit subject: `Views: add tilted projection with a round-trip property`
    - _Requirements: 12.2, 12.8, 12.9, 12.12_
  - [ ] 11.2 Depth order
    - Add `depthOf` and `sortByDepth` (nearer after farther, ties within 0.001 by ascending identifier) to `tilted-projection.ts`. Add examples to `tests/views/tilted-round-trip.test.ts` or a new `tests/views/tilted-depth.test.ts`: order for hand-placed blocks, tie rule.
    - Commit subject: `Views: add depth order for the tilted view`
    - _Requirements: 12.6, 12.7_

- [ ] 12. Input state machine
  - [ ] 12.1 Pointer drag and selection
    - Create `src/views/input-state-machine.ts` with `InputEvent`, `InputCommand`, `InputState`, `processEvents` for pointer down, move and up: pan commands from drag deltas, a selection when released within 6 px and 500 ms, events with non-finite x, y or timestamp dropped with a Notice. Create `tests/views/input-pan-sum.test.ts` with the property and examples for selection, drag and dropped events.
    - **Property 16: Pointer drag commands sum to the total screen displacement**
    - **Validates: Requirements 15.12**
    - Commit subject: `Views: add pointer input reducer with a pan-sum property`
    - _Requirements: 11.1, 15.2, 15.3, 15.11, 15.12, 15.13_
  - [ ] 12.2 Wheel, pinch and keys
    - Extend `processEvents`: wheel to zoom at the pointer with a factor from 0.5 to 2, two-finger pinch to zoom at the midpoint by the ratio of distances (no command under 1 px distance), keys as in Requirement 15.5 and 15.6 (arrows pan by 10% of the viewport, plus 1.25, minus 0.8, Home fit, F follow, brackets for the next and previous place, Enter activate), unused keys give no command. Add examples to `tests/views/input-keys.test.ts`.
    - Commit subject: `Views: add wheel, pinch and key commands to the input reducer`
    - _Requirements: 15.1, 15.4, 15.5, 15.6, 15.14, 15.15_

- [ ] 13. The three views
  - [ ] 13.1 Minimap
    - Create `src/views/minimap.ts`: player-centred camera whose rotation is the negated heading, smoothing through `advanceCamera`, clip to a circle with a rim, the North_Mark on the rim rotating with the map, the layers of `drawMapLayers`, `resize` keeps the centre, map inspection notices. Add a small hand-written fixture `tests/views/helpers/small-town.ts`.
    - Create `tests/views/minimap-player-centred.test.ts` and `tests/views/minimap-north-mark.test.ts` with the two properties, plus an example that draws the fixture on the `RecordingCanvas`.
    - **Property 8: Minimap keeps the player centred with heading up**
    - **Property 9: North mark points to world north**
    - **Validates: Requirements 9.7, 9.8**
    - Commit subject: `Views: add minimap with centring and north mark properties`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.6, 9.7, 9.8, 13.1, 16.3_
  - [ ] 13.2 Minimap zoom limits and small size
    - Add `setZoomLimits(min, max)` and `setZoom(z)` to `minimap.ts` (defaults 0.5 and 4, range 0.001 to 1000, minimum below maximum, the player marker does not move) and the Notice for a viewport under 40 by 40 with no circle drawn. Add examples with boundaries to `tests/views/minimap-zoom.test.ts`.
    - Commit subject: `Views: add minimap zoom limits and small size notice`
    - _Requirements: 9.5, 9.9, 9.10, 9.11_
  - [ ] 13.3 Full map camera operations
    - Create `src/views/full-map.ts` with the camera at rotation 0, `pan`, `zoomAt` (clamped to the zoom limits with a Notice, defaults of the fit zoom and 8), `fit` (extent with a 5% margin, extent of at least 1 unit, empty map gives a `ViewError`), `follow`, the pan clamp that keeps at least 20% of the extent in view, `resize` keeps the centre. Create `tests/views/full-map-camera.test.ts` with examples and boundaries.
    - Commit subject: `Views: add full map pan, zoom, fit and follow`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.9, 10.10, 10.11, 10.12, 16.3_
  - [ ] 13.4 Full map selection sets the destination
    - Add `select(screenPoint)` to `full-map.ts`: hit test the place markers (20 px), else convert with `screenToWorld` and call `Engine.setDestination({ point })`; set a place by id; a caller handler replaces setting the destination; a No_Way_Result message is shown to the caller; errors for a point outside the viewport, a map with no usable road, and a spot more than 100 world units or 200 px from a road (using `snapToRoad`). The view computes no route itself.
    - Create `tests/views/full-map-click-snaps.test.ts` with the property and examples for each branch.
    - **Property 11: A click lands on a usable road**
    - **Validates: Requirements 11.8**
    - Commit subject: `Views: add full map click to set a destination`
    - _Requirements: 11.2, 11.4, 11.5, 11.6, 11.7, 11.8, 11.10, 11.11, 11.12_
  - [ ] 13.5 Full map place focus by keyboard
    - Add `focusNextPlace`, `focusPreviousPlace` and `activateFocusedPlace` to `full-map.ts` (order by identifier, a visible focus ring drawn on the focused place, Enter sets the destination, announcements for no places and no selected place returned as text for the live region). Create `tests/views/full-map-focus.test.ts`.
    - Commit subject: `Views: add full map place focus by keyboard`
    - _Requirements: 15.6, 15.16, 15.17_
  - [ ] 13.6 Tilted view
    - Create `src/views/tilted-view.ts`: player-centred heading-up camera with the player in the lower half, ground layers first, raised blocks (kinds `building`, `house`, `tower`, `wall-block`) with top and darker side faces in depth order, other props flat, visible region widened by the largest block height, `resize` keeps the centre.
    - Create `tests/views/tilted-depth-order.test.ts` with the property over the `RecordingCanvas` and an example drawing the fixture.
    - **Property 13: Raised blocks are drawn nearer after farther**
    - **Validates: Requirements 12.11**
    - Commit subject: `Views: add tilted view with raised blocks and depth order`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.10, 12.11_
  - [ ] 13.7 Tilted view settings
    - Add `setTiltAngle` (20 to 70, default 45), `setHeightFactor(kind, factor)` (0 to 100) and the flat-with-Notice rule for a block height that is not finite or below 0 to `tilted-view.ts`. Add examples with boundaries to `tests/views/tilted-settings.test.ts`.
    - Commit subject: `Views: add tilt angle and height factor settings`
    - _Requirements: 12.8, 12.9, 12.13, 12.14_

- [ ] 14. Canvas adapter and input binding
  - [ ] 14.1 Canvas adapter and frame gate
    - Create `src/views/canvas-adapter.ts` (`CanvasAdapter implements CanvasInterface` on a 2D context, `mount(canvas)` returning a `ViewError` when there is no 2D context, pixel size from CSS size times the pixel ratio rounded, one scale by the ratio, ratio limited to 3 and to a 16384 px side with a Notice, bad ratio replaced by 1 with a Notice, a bad CSS size returns a `ViewError` and keeps the previous size) and `src/views/frame-gate.ts` (draw only when the camera, position, route, style or viewport changed).
    - Create `tests/views/canvas-adapter.test.ts` and `tests/views/frame-gate.test.ts` using hand-written fake context and canvas objects.
    - Commit subject: `Views: add canvas adapter and frame gate`
    - _Requirements: 1.2, 1.9, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8, 16.7_
  - [ ] 14.2 Input binding
    - Create `src/views/input-binding.ts`: attach pointer, wheel, touch and key listeners to a canvas, build plain `InputEvent` records, call `processEvents`, apply the commands to a `FullMap`, call `preventDefault` for wheel and touch, set `touch-action: none`, and return a function that removes the listeners. Create `tests/views/input-binding.test.ts` with a fake event target.
    - Commit subject: `Views: add input binding for the full map`
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.10, 15.15_
  - [ ] 14.3 Canvas accessibility
    - Add to `input-binding.ts` (or a new `src/views/accessibility.ts` if the file grows past a few hundred lines) the accessible name and key description of each canvas, a visible focus indicator style with contrast of at least 3 to 1, and an `aria-live="polite"` element that receives the guidance sentence and the focus announcements. Add `tests/views/accessibility.test.ts` with a fake element and a contrast check of the focus colour against the page background.
    - Commit subject: `Views: add canvas names, focus style and live guidance text`
    - _Requirements: 15.7, 15.8, 15.9_

- [ ] 15. Public surface and docs
  - [ ] 15.1 Views exports
    - Create `src/views/index.ts` re-exporting the documented View functions and types, and re-export them from `src/index.ts` without changing the existing exports. Add `tests/views/exports.test.ts` listing the expected export names.
    - Commit subject: `Views: add public exports`
    - _Requirements: 19.14_
  - [ ] 15.2 Views API doc
    - Create `kit/engine/docs/views-api.md` with one entry per exported function and type: description, inputs with units and ranges, outputs, View_Errors, one usage example. Add a test in `tests/views/exports.test.ts` that the export list and the doc entries match exactly.
    - Commit subject: `Views: add API reference doc`
    - _Requirements: 19.14_

- [ ] 16. Demo page
  - [ ] 16.1 Scaffold the demo package
    - Create `kit/demo/package.json` (no `dependencies`; devDependencies vite, vitest, typescript, @playwright/test; scripts `build` = `tsc --noEmit`, `test` = `vitest --run`, `dev`, `bench`, `gate`), `tsconfig.json` (strict), `vite.config.ts`, `vitest.config.ts`, `index.html` with an empty body and `src/main.ts` with an empty export, and a smoke test `tests/smoke.test.ts` that asserts there is no `dependencies` field and strict mode is on. Run `npm install` in `kit/demo` and commit the lockfile with it. Check that `.gitignore` already ignores `node_modules/` and `dist/`.
    - Commit subject: `Demo: add package scaffold`
    - _Requirements: 17.1_
  - [ ] 16.2 Town_Map
    - Create `kit/demo/src/town-map.ts`: a hand-written `MapFile` of an invented town with at least 12 nodes, 3 road kinds, 6 places, 1 one-way road, 1 blocked area, 6 props of which at least 3 are raised kinds, and no real-world data. Create `kit/engine/tests/views/example-town-map.test.ts` that loads it with `parseMap`, checks the counts, and draws it on the `RecordingCanvas` in each View with a route, a player and a destination, asserting the presence of roads, blocked areas, props, route line, player marker, destination marker and place labels.
    - Commit subject: `Demo: add the town map with draw examples in each view`
    - _Requirements: 17.2, 17.10, 19.8_
  - [ ] 16.3 Map choice
    - Create `kit/demo/src/map-choice.ts` with `chooseMap(name)` returning the Town_Map text or the Large_Generated_Map text from the engine generator with a fixed seed, with a plain error for an unknown name. Create `kit/demo/tests/map-choice.test.ts`: the same seed twice gives equal text, the large map has 5,000 roads and loads, unknown name gives the error.
    - Commit subject: `Demo: add map choice between town and large map`
    - _Requirements: 17.3, 17.12_
  - [ ] 16.4 Player dot
    - Create `kit/demo/src/player-dot.ts`: position, heading from the latest movement, speed from 1 to 200 world units per second (default 30; an invalid speed keeps the previous and returns a message naming speed and range), stop at the map extent widened by 50 units with a message, timestamp-driven. Create `kit/demo/tests/player-dot.test.ts` with examples and boundaries.
    - Commit subject: `Demo: add arrow-key player dot`
    - _Requirements: 17.5, 17.6, 17.13, 17.14_
  - [ ] 16.5 Reduced motion and status text
    - Create `kit/demo/src/reduced-motion.ts` (reads the setting and reports changes through an injected media query object) and `kit/demo/src/status-text.ts` (pure formatting of the guidance sentence, distance left, the No_Way_Result message, road count and blocked-road notices, map load errors, and the no-usable-road notice). Create tests for both.
    - Commit subject: `Demo: add reduced motion reader and status text`
    - _Requirements: 13.4, 13.5, 13.6, 17.8, 17.9, 17.11, 17.12, 17.15_
  - [ ] 16.6 Page layout
    - Fill `kit/demo/index.html` and `src/demo.css`: a statement that this is a demonstration of the Views and not an application, three canvases side by side at 1200 px and wider and in one column at 375 px (canvases 300 to 375 px wide, no horizontal scrolling), a map choice, a speed control, a status area, controls of at least 44 by 44 px with text labels and visible focus. Extend `tests/smoke.test.ts` to read the HTML and CSS and assert the notice text, the labels, the 44 px minimum size rule and the media queries.
    - Commit subject: `Demo: add page layout for three views`
    - _Requirements: 16.1, 16.2, 16.4, 16.5, 17.4, 17.11_
  - [ ] 16.7 Wire the page
    - Fill `kit/demo/src/main.ts`: load the chosen map into the `Engine` (on failure show the errors and keep the previous map), mount the three Views on their canvases through `CanvasAdapter`, bind input on the Full_Map, move the dot with the arrow keys while no canvas has focus, feed the position and a timestamp each frame, draw each View, show the status text. Keep the logic in small testable functions; add `tests/main-wiring.test.ts` using fake canvases and the `RecordingCanvas` for a load, a click, a position feed and a failed load. Run `npm run build` in `kit/demo` to check the Vite build.
    - Commit subject: `Demo: wire engine and views into the page`
    - _Requirements: 16.3, 17.1, 17.5, 17.7, 17.8, 17.9, 17.12_

- [ ] 17. Checkpoint - Demo page
  - Run `npm run build` and `npm test` in `kit/engine` and in `kit/demo`, each as its own call, and note the run time of each (the engine default suite must stay under 60 seconds). Run `npm run bench` in `kit/engine` once for the route times. Run `git status` and `git log --oneline` as separate calls.
  - Update the task status in `.kiro/specs/map-views/tasks.md` and `.kiro/specs/map-views/tasks.meta.json` (if it exists), and commit those two files together as one commit with the subject `Specs: record map-views task status`. If the status files did not change, make no commit.
  - Report plainly: real `git status` output, the commit list, test results with time, the measured route times, and anything not done or not verified. No frame times exist yet at this point. Do not report credit figures. Do not push. Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 19.2, 19.5, 19.6, 19.7_

- [ ] 18. Frame benchmark
  - [ ] 18.1 Playwright frame benchmark
    - Create `kit/demo/playwright.config.ts` (starts the Vite server, a Chromium project, a separate command from the default suite) and `kit/demo/bench/frame-bench.spec.ts`: load the Large_Generated_Map, move the player along a fixed seeded path for at least 300 frames, measure each View's draw time with `performance.now()` and the interval between animation frames, measure the Full_Map at the fit zoom and at 4 px per world unit, and print the median, 95th percentile and maximum in ms with 2 decimals, plus browser name and version, Node version, viewport, Device_Pixel_Ratio and machine description. No pass or fail threshold on the numbers. It fails with a plain reason only when fewer than 300 frames were measured (stating both numbers), a time is not finite or is negative (naming the View and the measurement), or the page or browser cannot run.
    - Add a Node-level test `kit/demo/tests/bench-stats.test.ts` for the statistics helper (median, 95th percentile, maximum, the failure reasons) in `kit/demo/bench/bench-stats.ts`.
    - Run `npm run bench` once (generous timeout) and put the printed numbers in the commit body. The benchmark stays out of `npm test`.
    - Commit subject: `Demo: add Playwright frame benchmark`
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.8, 18.9, 18.10_

- [ ] 19. Checkpoint - End of block
  - Run `npm run build` and `npm test` in `kit/engine` and in `kit/demo`, each as its own call, with run times. Run `npm run bench` in `kit/engine` and `npm run bench` in `kit/demo` once more. Run `git status` and `git log --oneline` as separate calls.
  - Update the task status in `tasks.md` and `tasks.meta.json` (if it exists) and commit those two files together with the subject `Specs: record map-views task status`.
  - Report plainly: real `git status` output, the commit list, test results with time, measured route times, measured frame times (median, 95th percentile, maximum for each View, with the machine description), and anything not done or not verified. Do not report credit figures. Do not push. Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 18.7, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7, 19.12_

- [ ] 20. Gate (last task)
  - If the Gate fails, the project stops here: report the failing step plainly and start no further block.
  - [ ] 20.1 Playwright gate check
    - Create `kit/demo/bench/gate.spec.ts` and a `gate` script. On the Large_Generated_Map, driven by mouse and keyboard: click a place on the Full_Map and check that the route line is drawn on the three Views; move the player along the route and check that the travelled part disappears and no new route is requested; leave the route by more than the reroute margin for longer than the reroute delay and check that a new route is drawn from the player to the same destination. Report, without a threshold, the number of frames with an interval above 50 ms for each View during these steps. Repeat the same steps at a 375 px wide viewport with touch input, and check there is no horizontal scrolling and each canvas is 300 to 375 px wide. Fail with a plain reason if the map does not load within 30 seconds (stating the time waited) or if the click returns a No_Way_Result (reporting its message).
    - Add a Node test for any pure helper the gate uses (for example the frame-interval counter).
    - Commit subject: `Demo: add Playwright gate check on the large map`
    - _Requirements: 16.1, 16.2, 16.6, 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.9, 20.10_
  - [ ] 20.2 Run the gate and report
    - Run `npm run gate` in `kit/demo`. Ask the user to try the same three steps by hand on the Demo_Page and to say what they saw. Update the task status in `tasks.md` and `tasks.meta.json` (if it exists) and commit those two files together with the subject `Specs: record map-views gate result`.
    - Report plainly: real `git status` output, the commit list, the gate result for each step, the frames over 50 ms for each View, and the frame benchmark numbers. If any step failed, say that the Gate failed, name the step, and state that the project stops there. Do not report credit figures. Do not push.
    - _Requirements: 20.7, 20.8_

## Notes

- Property tests are required tasks and carry no `*` marker. They are written inside the task of the code they test, so code and tests always land in one commit.
- Property numbers 1 to 16 match the design. Requirement 19.3 names 14 properties; design Properties 1 and 2 together cover the transform round trip.
- Requirement 8.9 (destination label kept) and the other criteria without a listed property are covered by example tests in their tasks.
- The Gate task is the last task. The end-of-block checkpoint (task 19) comes before it and reports build, tests and frame times; task 20.2 reports the Gate result.
- Waves below hold one task each because every task is its own commit on the same branch and later tasks edit files that earlier tasks created.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2"] },
    { "id": 3, "tasks": ["3.1"] },
    { "id": 4, "tasks": ["3.2"] },
    { "id": 5, "tasks": ["3.3"] },
    { "id": 6, "tasks": ["4.1"] },
    { "id": 7, "tasks": ["4.2"] },
    { "id": 8, "tasks": ["5.1"] },
    { "id": 9, "tasks": ["5.2"] },
    { "id": 10, "tasks": ["6.1"] },
    { "id": 11, "tasks": ["6.2"] },
    { "id": 12, "tasks": ["7.1"] },
    { "id": 13, "tasks": ["7.2"] },
    { "id": 14, "tasks": ["7.3"] },
    { "id": 15, "tasks": ["7.4"] },
    { "id": 16, "tasks": ["8.1"] },
    { "id": 17, "tasks": ["8.2"] },
    { "id": 18, "tasks": ["8.3"] },
    { "id": 19, "tasks": ["9.1"] },
    { "id": 20, "tasks": ["10.1"] },
    { "id": 21, "tasks": ["10.2"] },
    { "id": 22, "tasks": ["11.1"] },
    { "id": 23, "tasks": ["11.2"] },
    { "id": 24, "tasks": ["12.1"] },
    { "id": 25, "tasks": ["12.2"] },
    { "id": 26, "tasks": ["13.1"] },
    { "id": 27, "tasks": ["13.2"] },
    { "id": 28, "tasks": ["13.3"] },
    { "id": 29, "tasks": ["13.4"] },
    { "id": 30, "tasks": ["13.5"] },
    { "id": 31, "tasks": ["13.6"] },
    { "id": 32, "tasks": ["13.7"] },
    { "id": 33, "tasks": ["14.1"] },
    { "id": 34, "tasks": ["14.2"] },
    { "id": 35, "tasks": ["14.3"] },
    { "id": 36, "tasks": ["15.1"] },
    { "id": 37, "tasks": ["15.2"] },
    { "id": 38, "tasks": ["16.1"] },
    { "id": 39, "tasks": ["16.2"] },
    { "id": 40, "tasks": ["16.3"] },
    { "id": 41, "tasks": ["16.4"] },
    { "id": 42, "tasks": ["16.5"] },
    { "id": 43, "tasks": ["16.6"] },
    { "id": 44, "tasks": ["16.7"] },
    { "id": 45, "tasks": ["18.1"] },
    { "id": 46, "tasks": ["20.1"] },
    { "id": 47, "tasks": ["20.2"] }
  ]
}
```
