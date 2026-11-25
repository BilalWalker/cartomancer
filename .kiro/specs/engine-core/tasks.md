# Implementation Plan: Engine Core

## Overview

This plan builds the engine core in `kit/engine/` in TypeScript (the design names TypeScript, Vitest and fast-check). The order is: scaffolding, types and errors, geometry (with the Screen_Convention), loader checks (one field group per task), loader, blocked roads, saver, snapping, route finder, test helpers, route properties, first checkpoint, follower (progress and search window, off-route distance), rerouter (margin measured from the road edge), guidance (route-based arrival, next turn skips straight on), mirror, Engine class, docs, benchmark, final checkpoint.

All geometry follows the Screen_Convention: x grows right, y grows down, a heading is in degrees clockwise from the positive x axis (0 is right, 90 is down the screen), and a signed angle change is positive for a right turn and negative for a left turn.

Each task is small (1-3 files) and ends with its own commit. Each task adds its tests together with its code, so every commit builds and passes the default suite, and no task uses code from a later task. Property tests are required tasks, not optional.

## Working rules for every task

- One task, one commit. Never put several tasks in one commit. Never push.
- Run exactly one command per tool call. No chaining (`&&`, `;`), no pipes, no multi-line scripts. Create and edit files with the file tools, not with shell commands.
- Before committing, run `npm run build` (a `tsc --noEmit` check) and `npm test` (Vitest, single run) in `kit/engine`, each as its own call. Both must pass.
- Stage by path (`git add <path>`, one call per path or one call listing explicit paths). Never `git add -A` or `git add .`.
- Commit subject uses `Area: what changed`, at most 72 characters, as named in each task. The body says why and how it was verified. No attribution lines.
- No skipped tests, no raised time limits, no loosened thresholds. If a property fails, report the failing property and its shrunk counterexample; do not weaken the test.
- Every property test runs at least 100 cases (`numRuns: 100` or more), starts with the comment `// Feature: engine-core, Property N: <title>`, and leaves fast-check's seed and shrunk counterexample reporting on.
- Engine source under `kit/engine/src/` imports no browser global and mentions no application concept (cars, missions, hospitals, rooms).

## Tasks

- [ ] 1. Scaffolding
  - [ ] 1.1 Create the package manifest and .gitignore
    - Create `kit/engine/package.json` (name, version, `"type": "module"`, scripts `build` = `tsc --noEmit`, `test` = `vitest --run`; no `dependencies` field; devDependencies typescript, vitest, fast-check) and a root `.gitignore` listing `node_modules/` and `dist/`.
    - Run `npm install` in `kit/engine` to create `package-lock.json`, and commit it with the manifest.
    - Commit subject: `Engine: add package manifest and gitignore`
    - _Requirements: 19.1_
  - [ ] 1.2 Add the strict TypeScript config and an empty entry point
    - Create `kit/engine/tsconfig.json` with `strict: true` and `include` of `src` and `tests`, and `kit/engine/src/index.ts` containing only an empty export so the build has an input.
    - Verify `npm run build` passes.
    - Commit subject: `Engine: add strict tsconfig and empty entry point`
    - _Requirements: 19.5_
  - [ ] 1.3 Add the Vitest config and the smoke test
    - Create `kit/engine/vitest.config.ts` (Node environment, tests under `tests/`, no browser environment) and `kit/engine/tests/smoke.test.ts`.
    - The smoke test reads `package.json` and asserts there is no `dependencies` field, reads `tsconfig.json` and asserts `strict` is true, imports `src/index.ts` in Node, and scans every file in `src/` for the browser globals `window`, `document`, `HTMLCanvasElement` and for the whole words car, mission, hospital, room (case-insensitive).
    - Commit subject: `Engine: add Vitest config and Node smoke test`
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 21.4_

- [ ] 2. Types and errors
  - [ ] 2.1 Define shared types and the format version constant
    - Create `kit/engine/src/types.ts` with the data models from the design: the map file pieces, `EngineMap` (with `usableRoadIds` and `blockedRoads`), `Position` (x, y and `headingDegrees`, with a comment stating the Screen_Convention: y down, heading clockwise from +x), `Destination`, `SnappedPoint`, `Route`, `RoutePart`, `NoWayResult`, `Notice`, `Turn`, `NextTurn` (`Turn` without `straight-on`), `Guidance` (with `nextTurn?: NextTurn`), `FollowerState` (`progress`), `EngineOptions` (`searchWindow` 100, `rerouteMargin` 15, `rerouteDelayMs` 1000, `arrivalRadius` 10), `OffRouteDistance`, `EngineError`, `LoadResult`.
    - Create `kit/engine/src/format.ts` exporting the supported format version list `[1]`.
    - Verify with `npm run build`; add `tests/types.test.ts` that builds one value of each type, and asserts at type level that `"straight-on"` is not assignable to `NextTurn`.
    - Commit subject: `Engine: add shared types and format version constant`
    - _Requirements: 1.1, 1.3, 12.1, 13.6, 15.11_
  - [ ] 2.2 Add plain-worded error factories
    - Create `kit/engine/src/errors.ts` with `notValidJson`, `notAnObject`, `missingField`, `wrongType`, `duplicateId`, `unknownReference`, `outOfRange`, `unsupportedVersion`, `noMapLoaded`, `badInput`, each returning an `EngineError` with message, field, item and optional position.
    - Create `tests/errors.test.ts`: each factory's message contains the field or item name and none of the denylist markers (`undefined`, `NaN`, `at `, `Error:`, `stack`).
    - Commit subject: `Engine: add plain-worded error factories`
    - _Requirements: 4.4, 4.5, 18.8, 18.9_

- [ ] 3. Geometry
  - [ ] 3.1 Point and segment distance helpers
    - Create `kit/engine/src/geometry.ts` with `distancePointToSegment` and `nearestPointOnSegment` (also returning the fraction along the segment), plus `tests/geometry-distance.test.ts` with examples: interior point, end-point clamping, zero-length segment.
    - Commit subject: `Engine: add point-to-segment geometry helpers`
    - _Requirements: 7.1, 7.4_
  - [ ] 3.2 Segment and polygon crossing test
    - Add `segmentCrossesPolygon` to `geometry.ts` (true when the segment touches, crosses or lies inside the polygon), plus `tests/geometry-polygon.test.ts` with examples: fully outside, crossing an edge, touching a corner, fully inside, collinear with an edge.
    - Commit subject: `Engine: add segment-polygon crossing test`
    - _Requirements: 5.1_
  - [ ] 3.3 Heading, signed angle difference and turn classification
    - Add to `geometry.ts`, under the Screen_Convention: `headingOfSegment(a, b)` = `atan2(b.y - a.y, b.x - a.x)` in degrees (y down, so headings grow clockwise on the screen); `signedAngleDifference(before, after)` = `after - before` normalised to (-180, 180], positive for a right (clockwise) change and negative for a left change; `classifyTurn(delta)` returning `straight-on` for `|delta| <= 30`, `right` for `30 < delta <= 150`, `left` for `-150 <= delta < -30`, `turn-back` for `|delta| > 150`.
    - Add `tests/geometry-angle.test.ts` with examples: the 30 and 150 degree boundaries on both signs, wraparound at 180, and 0, 90 and -90 headings from segments.
    - Commit subject: `Engine: add heading, signed angle and turn classification`
    - _Requirements: 15.3, 15.4_
  - [ ] 3.4 Screen convention example tests
    - Create `tests/screen-convention.test.ts` with hand-written examples built from `headingOfSegment`, `signedAngleDifference` and `classifyTurn`: a player travelling right (heading 0) onto a road that goes up the screen (heading -90) gets a left turn; onto a road that goes down the screen (heading 90) gets a right turn; each case again with x negated (heading `180 - h`) gives the swapped turn.
    - Commit subject: `Engine tests: add screen convention turn examples`
    - _Requirements: 15.3, 15.14, 21.6_

- [ ] 4. Loader field checks
  - [ ] 4.1 Check nodes
    - Create `kit/engine/src/map-loader-checks.ts` with `checkNodes` (unique id, finite x and y) and `tests/map-loader-errors.test.ts` with one hand-written bad node list per error case, asserting the named field and item.
    - Commit subject: `Engine: add node checks for the map loader`
    - _Requirements: 2.1, 2.6, 4.4_
  - [ ] 4.2 Check roads
    - Add `checkRoads` (existing and distinct endpoints, width above zero, kind one of main/side/footpath/corridor, boolean one-way flag) and one example test per error case in `tests/map-loader-errors.test.ts`.
    - Commit subject: `Engine: add road checks for the map loader`
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.7_
  - [ ] 4.3 Check places
    - Add `checkPlaces` (non-empty name and category, finite x and y, unique id) and example tests per error case.
    - Commit subject: `Engine: add place checks for the map loader`
    - _Requirements: 3.1, 3.2, 3.7_
  - [ ] 4.4 Check blocked areas
    - Add `checkBlockedAreas` (kind mountain/water/wall, polygon of at least three finite points) and example tests per error case.
    - Commit subject: `Engine: add blocked area checks for the map loader`
    - _Requirements: 3.3, 3.7_
  - [ ] 4.5 Check props
    - Add `checkProps` (kind present, finite x and y, width and height above zero, finite rotation) and example tests per error case.
    - Commit subject: `Engine: add prop checks for the map loader`
    - _Requirements: 3.4, 3.7_
  - [ ] 4.6 Check the background picture
    - Add `checkBackgroundPicture` (absent is accepted; present needs a reference, scale above zero, opacity 0 to 1 inclusive) and example tests per error case, including the absent case.
    - Commit subject: `Engine: add background picture check for the map loader`
    - _Requirements: 1.4, 3.5, 3.7_
  - [ ] 4.7 Check the style
    - Add `checkStyle` (colour values are strings; line styles have a finite width above zero and an optional dash list of non-negative numbers) and example tests per error case. The type rules must match what `docs/map-file-format.md` will state later.
    - Commit subject: `Engine: add style check for the map loader`
    - _Requirements: 3.6, 3.7_

- [ ] 5. Map loader
  - [ ] 5.1 Parse JSON, top level and format version
    - Create `kit/engine/src/map-loader.ts` with `parseMap(text)`: parse JSON (position of the first problem on failure), reject non-object top level, reject missing required top-level fields, read and check `formatVersion` before any other field, and return `{ errors }` for each case. When these steps pass, return a `{ map }` built from the raw data with `usableRoadIds` holding all road ids and `blockedRoads` empty (field checks arrive in 5.2, blocked roads in 6.2).
    - Add `tests/map-loader-errors.test.ts` cases: not JSON, top level array, missing field, missing/wrong-type/unsupported version.
    - Commit subject: `Engine: parse map text, top level and format version`
    - _Requirements: 1.2, 1.3, 4.1, 4.2, 4.3_
  - [ ] 5.2 Run all field checks and build the map
    - In `parseMap`, run every check from `map-loader-checks.ts`, collect every error into one list, return `{ errors }` with no map when the list is non-empty, otherwise build the `EngineMap`. Add example tests: a valid hand-written map file loads, a file with problems in two groups reports both, the loader returns no map with errors.
    - Commit subject: `Engine: report all loader errors in one result`
    - _Requirements: 4.3, 4.6, 4.7_
  - [ ] 5.3 Add map arbitraries
    - Create `kit/engine/tests/helpers/arbitraries.ts` with fast-check generators for valid `MapFile` values (nodes, roads of every kind with optional one-way and differing widths, places, blocked areas of every kind, props, optional background picture, style), plus a helper `loadValid(file)` that runs `parseMap` and throws if the result has errors. Add `tests/helpers/arbitraries.test.ts` asserting that every generated file loads without errors over 100 runs.
    - Commit subject: `Engine tests: add generators for valid map files`
    - _Requirements: 6.5, 21.2_
  - [ ] 5.4 Add a fault injector and Property 1
    - Create `tests/helpers/fault-injection.ts` that takes a valid map file and one named fault (duplicate node id, dangling road reference, equal road endpoints, non-positive width, unknown kind, non-boolean one-way, bad place/blocked area/prop/background/style field, malformed text, non-object top level, missing top-level field, unsupported version) and returns the broken text plus the expected field and item. Create `tests/map-loader-property.test.ts` with Property 1.
    - **Property 1: Loader validation matches injected faults**
    - **Validates: Requirements 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.1, 4.2, 4.4**
    - Commit subject: `Engine tests: add property test for loader fault detection`
    - _Requirements: 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.1, 4.2, 4.4_
  - [ ] 5.5 Property 2: never a map together with errors
    - Add to `tests/map-loader-property.test.ts` a property over valid texts, faulty texts and arbitrary strings: the result has either a map or errors, never both, and a rejected result has no map field.
    - **Property 2: Loader never returns a map together with errors**
    - **Validates: Requirements 4.3, 4.7**
    - Commit subject: `Engine tests: add property test for loader result shape`
    - _Requirements: 4.3, 4.7_
  - [ ] 5.6 Property 3: several faults are all reported
    - Add to `tests/map-loader-property.test.ts` a property that injects two or more independent faults (in different groups) and asserts at least one error per injected fault in the single result.
    - **Property 3: Multiple independent faults are all reported**
    - **Validates: Requirements 4.6**
    - Commit subject: `Engine tests: add property test for multiple loader faults`
    - _Requirements: 4.6_

- [ ] 6. Blocked roads
  - [ ] 6.1 Classify blocked roads
    - Create `kit/engine/src/blocked-roads.ts` with `classifyBlockedRoads(map)` returning blocked road ids and exactly one Notice per blocked road (plain words, names the road and the area, says the road is left out of routing). Add `tests/blocked-roads.test.ts` with examples: crossing, touching, inside, clear of all areas (no notices).
    - Commit subject: `Engine: classify blocked roads with notices`
    - _Requirements: 5.1, 5.2, 5.5_
  - [ ] 6.2 Wire classification into the loader
    - In `parseMap`, call `classifyBlockedRoads`, fill `usableRoadIds` and `blockedRoads`, and return the notices with the map. Add example tests in `tests/blocked-roads.test.ts` that a loaded map exposes the blocked list and notices, and that a clear map has none.
    - Commit subject: `Engine: fill usable roads and notices when loading`
    - _Requirements: 5.1, 5.2, 5.4, 5.5_
  - [ ] 6.3 Property 4: blocked roads classified exactly
    - Add to `tests/blocked-roads.test.ts` a property over generated maps with blocked areas: the blocked set equals the set of roads whose centre line touches or crosses an area (computed in the test by a separate sampling check, not by calling `classifyBlockedRoads`), with one notice per blocked road.
    - **Property 4: Blocked roads are classified and noticed exactly**
    - **Validates: Requirements 5.1, 5.2, 5.5**
    - Commit subject: `Engine tests: add property test for blocked road classification`
    - _Requirements: 5.1, 5.2, 5.5_

- [ ] 7. Map saver
  - [ ] 7.1 Write maps as text
    - Create `kit/engine/src/map-saver.ts` with `saveMap(map)` that writes the current format version and every field the loader reads in a stable key order, leaving out derived fields (`usableRoadIds`, `blockedRoads`) and the background picture when absent. Add `tests/map-saver.test.ts` with one example: save a hand-written map, load it, compare.
    - Commit subject: `Engine: add map saver`
    - _Requirements: 6.1, 6.2_
  - [ ] 7.2 Property 5: save-then-load round trip
    - Create `tests/map-saver-roundtrip.test.ts` with a property over generated maps covering every road kind, every blocked area kind, props, and both present and absent background picture: loading `saveMap(map)` gives a map equal to the original field for field.
    - **Property 5: Map round trip**
    - **Validates: Requirements 6.1, 6.2, 6.3**
    - Commit subject: `Engine tests: add property test for map round trip`
    - _Requirements: 6.1, 6.2, 6.3, 6.5_
  - [ ] 7.3 Property 6: save is idempotent
    - Add to `tests/map-saver-roundtrip.test.ts` a property: save, load, save again gives identical text.
    - **Property 6: Save is idempotent after a round trip**
    - **Validates: Requirements 6.4**
    - Commit subject: `Engine tests: add property test for save idempotence`
    - _Requirements: 6.4_

- [ ] 8. Snapping
  - [ ] 8.1 Snap a point to the nearest usable road
    - Create `kit/engine/src/snapping.ts` with `snapToRoad(map, point)` returning a SnappedPoint (x, y, road id, distance along road) or a typed no-usable-road result; ties go to the lowest road id. Add `tests/snapping.test.ts` with examples: nearest road, tie, blocked road ignored, point already on a road, no usable road.
    - Commit subject: `Engine: add snapping to the nearest usable road`
    - _Requirements: 7.1, 7.2, 7.3_
  - [ ] 8.2 Property 7: snapping finds the nearest point
    - Add point arbitraries (arbitrary points and points constructed on a usable road) to `tests/helpers/arbitraries.ts` and a property in `tests/snapping.test.ts`: the snapped distance is at most the distance to every sampled point on every usable road; points on a road snap to themselves within 0.001; the same point always picks the same road on ties.
    - **Property 7: Snapping finds the nearest usable point**
    - **Validates: Requirements 7.2, 7.4, 7.5**
    - Commit subject: `Engine tests: add property test for snapping`
    - _Requirements: 7.2, 7.4, 7.5_

- [ ] 9. Route finder
  - [ ] 9.1 Route finder entry: snapping, missing place, zero-length route
    - Create `kit/engine/src/route-finder.ts` with `findRoute(map, start, destination)`: resolve a place destination (missing place gives a No_Way_Result naming it), snap start and destination, return a No_Way_Result for no usable road, and return a zero-length route when both snap to the same point. Other cases return a No_Way_Result with reason `separate-parts` as a temporary answer, replaced in 9.2. Add `tests/route-finder-rules.test.ts` examples for each handled case.
    - Commit subject: `Engine: add route finder entry cases`
    - _Requirements: 7.3, 8.4, 10.3_
  - [ ] 9.2 Shortest path between nodes
    - Add Dijkstra over usable roads to `route-finder.ts`, with one-way direction respected, road lengths summed, and ties broken by lowest road id in adjacency order so results repeat. Return an ordered list of route parts (road id, direction, start, end) for routes that start and end exactly at nodes. Add `tests/route-finder-chain.test.ts` examples: a small grid, a one-way detour, two equal routes always giving the same answer.
    - Commit subject: `Engine: add shortest path search over usable roads`
    - _Requirements: 8.1, 8.2, 8.3, 8.5, 8.6, 11.1, 11.2_
  - [ ] 9.3 Start and destination inside roads
    - Extend `route-finder.ts` so start and destination snapped inside a road add partial parts at both ends, including both points on the same road, and one-way roads are left or entered only in the allowed direction. Add examples to `tests/route-finder-chain.test.ts` and `tests/route-finder-rules.test.ts`: same road forward, same road against a one-way (must go round), start inside a one-way road, destination inside a one-way road.
    - Commit subject: `Engine: route from and to points inside roads`
    - _Requirements: 8.1, 8.2, 8.7, 11.3, 11.4_
  - [ ] 9.4 Reasons for no way
    - Extend `findRoute` so an unreachable destination returns a No_Way_Result whose reason is `separate-parts`, `one-way-blocks-the-way` (reachable if one-way flags are ignored) or `blocked-roads-cut-the-way` (reachable if blocked roads are allowed), in plain words. Add `tests/no-way-reasons.test.ts` with one hand-written map per reason and for no usable road and missing place.
    - Commit subject: `Engine: give a plain reason when there is no way`
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [ ] 10. Test helpers for routes
  - [ ] 10.1 Exhaustive search helper
    - Create `kit/engine/tests/helpers/exhaustive-search.ts`: an independent brute-force shortest path over nodes and partial road ends (simple-path enumeration) applying the usable-road and one-way rules. It must not import anything from `src/route-finder.ts`. Add `tests/helpers/exhaustive-search.test.ts` with hand-computed examples.
    - Commit subject: `Engine tests: add independent exhaustive path search`
    - _Requirements: 9.3_
  - [ ] 10.2 Small-map and route arbitraries
    - Add to `tests/helpers/arbitraries.ts` a small-map generator (at most 12 nodes, with one-way roads and blocked areas) and start/destination generators (points, places). Extend `tests/helpers/arbitraries.test.ts` to check the 12-node limit and that generated maps load.
    - Commit subject: `Engine tests: add small-map and route generators`
    - _Requirements: 9.1, 21.2_

- [ ] 11. Route properties
  - [ ] 11.1 Property 8: route is an unbroken chain
    - Add a property to `tests/route-finder-chain.test.ts`: first part starts at the snapped start, each part ends where the next starts, every part lies on a usable road, last part ends at the snapped destination.
    - **Property 8: A returned route is an unbroken chain of usable roads**
    - **Validates: Requirements 8.1, 8.2, 8.6, 8.7**
    - Commit subject: `Engine tests: add property test for route chain`
    - _Requirements: 8.1, 8.2, 8.6, 8.7_
  - [ ] 11.2 Property 9: zero-length route
    - Add a property to `tests/route-finder-rules.test.ts`: start and destination that snap to the same point give a route of length zero.
    - **Property 9: Same-point start and destination give a zero-length route**
    - **Validates: Requirements 8.4**
    - Commit subject: `Engine tests: add property test for zero-length route`
    - _Requirements: 8.4_
  - [ ] 11.3 Property 10: determinism
    - Add a property to `tests/route-finder-rules.test.ts`: two calls with the same inputs return equal routes, including maps with equal-length alternatives (use a grid generator).
    - **Property 10: Route finding is deterministic**
    - **Validates: Requirements 8.5**
    - Commit subject: `Engine tests: add property test for route determinism`
    - _Requirements: 8.5_
  - [ ] 11.4 Property 11: optimal and complete on small maps
    - Create `tests/route-finder-optimality.test.ts`: compare route length with the exhaustive search within 0.000001, and assert a route is returned whenever the search finds a path.
    - **Property 11: Routes are optimal and complete on small maps**
    - **Validates: Requirements 9.1, 9.2**
    - Commit subject: `Engine tests: add property test for route optimality`
    - _Requirements: 9.1, 9.2, 9.3_
  - [ ] 11.5 Property 12: unreachable gives no route
    - Create `tests/route-finder-unreachable.test.ts`: when the exhaustive search finds no path, `findRoute` returns a No_Way_Result and no route.
    - **Property 12: Unreachable destinations produce no route**
    - **Validates: Requirements 10.1, 10.4, 10.5**
    - Commit subject: `Engine tests: add property test for unreachable destinations`
    - _Requirements: 10.1, 10.4, 10.5_
  - [ ] 11.6 Property 13: rules are never broken
    - Add to `tests/route-finder-rules.test.ts` a property over maps with blocked areas and one-way roads (including starts and destinations on one-way roads): no returned route uses a blocked road or travels a one-way road against its direction.
    - **Property 13: Routes never break the usable-road or one-way rules**
    - **Validates: Requirements 5.3, 11.1, 11.2, 11.3, 11.4, 11.5**
    - Commit subject: `Engine tests: add property test for route rules`
    - _Requirements: 5.3, 11.1, 11.2, 11.3, 11.4, 11.5_

- [ ] 12. Checkpoint - Ensure all tests pass
  - Run `npm run build` and `npm test` in `kit/engine`, each as its own call. Ensure all tests pass, ask the user if questions arise. No commit unless a fix was needed (then one commit per fix).

- [ ] 13. Route follower
  - [ ] 13.1 Follow the route with progress and a search window
    - Create `kit/engine/src/route-follower.ts` with `advance(route, progress, position, searchWindow = 100)` returning `{ remaining, progress }`. It looks for the point nearest to the position only among route points whose distance along the route is in `[progress, progress + searchWindow]`, sets the new progress to that point's distance along the route, and removes the part before it. Progress never decreases, so stepping back keeps the removed part removed.
    - Add `tests/route-follower.test.ts` examples: on route, ahead, stepping back keeps the removed part removed, position far away, a caller-supplied window replaces the default 100, and a hand-written loop where a later stretch lies closer than the stretch at the progress but beyond the window (progress stays within the window, nothing beyond it is removed).
    - Commit subject: `Engine: add route follower with progress and search window`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_
  - [ ] 13.2 Off-route distance measured from the road edge
    - Add `offRouteDistance(remaining, position, roadWidthOf)` to `route-follower.ts`: the distance from the position to the nearest point of the remaining route minus half the width of the road in use at that point (negative or zero on the road surface). Add examples to `tests/route-follower.test.ts`: on the centre line, at the road edge, exactly half width plus margin away from the centre line on a wide road and on a narrow road (same margin test gives different centre-line distances).
    - Commit subject: `Engine: add off-route distance measured from the road edge`
    - _Requirements: 13.1, 13.4_
  - [ ] 13.3 Position sequence generators
    - Add to `tests/helpers/arbitraries.ts` generators for position sequences along a route (forward, with small backward steps) with timestamps. Extend `tests/helpers/arbitraries.test.ts` to check the sequences stay within a small distance of the route.
    - Commit subject: `Engine tests: add position sequence generators`
    - _Requirements: 12.7, 13.10_
  - [ ] 13.4 Property 14: distance left never grows
    - Add to `tests/route-follower.test.ts` a property over generated maps, routes and position sequences that move along the route (including momentary backward steps): the remaining length never exceeds the previous remaining length, progress never decreases, and the removed part does not return.
    - **Property 14: Following the route never increases the distance left**
    - **Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.7**
    - Commit subject: `Engine tests: add property test for route following`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.7_
  - [ ] 13.5 Looping route generator
    - Add to `tests/helpers/arbitraries.ts` a generator for routes that loop back to pass within the reroute margin of an earlier or later stretch of themselves, position sequences along them, and a caller-supplied search window. Extend `tests/helpers/arbitraries.test.ts` to check the loop property (some later stretch lies within the margin of an earlier stretch) and that sequences move along the route.
    - Commit subject: `Engine tests: add looping route generator`
    - _Requirements: 12.8_
  - [ ] 13.6 Property 15: no jump ahead on looping routes
    - Create `tests/route-follower-looping.test.ts` with a property over looping routes and position sequences moving along them, with default and caller-supplied search windows: progress after each position is at most the previous progress plus the window, no part beyond the window is removed, and the remaining route still contains every untravelled stretch.
    - **Property 15: The follower never jumps ahead on a looping route**
    - **Validates: Requirements 12.1, 12.2, 12.5, 12.6, 12.8**
    - Commit subject: `Engine tests: add property test for no jump ahead on loops`
    - _Requirements: 12.1, 12.2, 12.5, 12.6, 12.8_

- [ ] 14. Rerouter
  - [ ] 14.1 Rerouter with margin from the road edge and delay
    - Create `kit/engine/src/rerouter.ts` with `class Rerouter` (options `margin` default 15, `delayMs` default 1000) and `update(remainingRoute, position, timestampMs, roadWidthOf)` returning `{ requestReroute }`. It computes `offRouteDistance` (from `route-follower.ts`); beyond the margin when that value is greater than the margin. It starts timing beyond the margin, cancels on return within the margin, fires once after the delay, then waits for a fresh overstay. It never reads the system clock.
    - Add `tests/rerouter.test.ts` examples: default values, custom margin and delay honoured, cancel before delay, one request only, second request after a fresh overstay.
    - Commit subject: `Engine: add rerouter with edge-measured margin and delay`
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.8_
  - [ ] 14.2 Edge margin example tests
    - Create `tests/rerouter-edge-margin.test.ts` with hand-written examples: on a wide road a position at half the width plus the margin from the centre line never triggers a reroute; one world unit further, held for the delay, triggers exactly one; the same centre-line distance triggers on a narrow road but not on a wide one.
    - Commit subject: `Engine tests: add edge-measured margin examples for rerouter`
    - _Requirements: 13.4, 13.9, 13.11_
  - [ ] 14.3 Wobble and off-route sequence generators
    - Add to `tests/helpers/arbitraries.ts` generators, on routes whose roads have differing widths, for sequences whose off-route distance stays within the margin (wobbling near it, including exactly at half the width plus the margin from the centre line), and for sequences that leave and stay beyond it for at least the delay, with returns in between. Extend `tests/helpers/arbitraries.test.ts` to check both shapes against `offRouteDistance`.
    - Commit subject: `Engine tests: add reroute sequence generators`
    - _Requirements: 13.9, 13.11_
  - [ ] 14.4 Property 16: no reroute within the margin
    - Add to `tests/rerouter-edge-margin.test.ts` a property: sequences whose off-route distance (measured from the road edge, differing widths) stays at or below the margin never request a reroute, for any duration.
    - **Property 16: Staying within the margin measured from the road edge never triggers a reroute**
    - **Validates: Requirements 13.1, 13.3, 13.4, 13.9**
    - Commit subject: `Engine tests: add property test for no reroute within margin`
    - _Requirements: 13.1, 13.3, 13.4, 13.9_
  - [ ] 14.5 Property 17: exactly one reroute per overstay
    - Add to `tests/rerouter-edge-margin.test.ts` a property: sequences that stay beyond the margin for at least the delay request exactly one reroute per stay and no more until the player returns within the margin and overstays again; a stay shorter than the delay requests none.
    - **Property 17: Overstaying the margin for the full delay triggers exactly one reroute**
    - **Validates: Requirements 13.2, 13.3, 13.5, 13.11**
    - Commit subject: `Engine tests: add property test for reroute timing`
    - _Requirements: 13.2, 13.3, 13.5, 13.11_
  - [ ] 14.6 Property 18: moving along the route never reroutes
    - Add to `tests/rerouter.test.ts` a property: sequences that move along the route (fed through `advance` and the rerouter) request no reroute and never increase the distance left.
    - **Property 18: Moving along the route never triggers a reroute**
    - **Validates: Requirements 13.10**
    - Commit subject: `Engine tests: add property test for on-route rerouter`
    - _Requirements: 13.10_

- [ ] 15. Guidance
  - [ ] 15.1 Distance left and no-route guidance
    - Create `kit/engine/src/guidance.ts` with `computeGuidance(remainingRoute, position, destination, offRouteDistance, margin = 15, arrivalRadius = 10)`: distance left equals the remaining route length, and an undefined route gives the fixed inactive guidance (`active: false`, no distance, no turn). Add `tests/guidance-turn.test.ts` examples for both.
    - Commit subject: `Engine: add guidance distance left and inactive state`
    - _Requirements: 15.1, 15.7_
  - [ ] 15.2 Next turn, skipping straight-on points
    - Extend `computeGuidance`: turn points are the joints between consecutive route parts, each classified with `signedAngleDifference` and `classifyTurn` from `geometry.ts`. The next turn is the first turn point ahead classified left, right or turn back, with the distance along the remaining route to it; every straight-on point is skipped and never reported; when none remains, guidance holds a distance left and no next turn.
    - Add to `tests/guidance-turn.test.ts` one hand-written route per turn class, and to `tests/screen-convention.test.ts` guidance-level examples: a route heading right then up the screen reports left, then down the screen reports right.
    - Commit subject: `Engine: report the next turn and skip straight on points`
    - _Requirements: 15.2, 15.3, 15.9, 15.10, 15.11, 15.14_
  - [ ] 15.3 Straight-on skipping examples
    - Create `tests/guidance-next-turn.test.ts` with hand-written routes: several straight-on points before a left turn report the left turn at its distance; a route with only straight-on points reports a distance left and no next turn; a point at exactly 30 degrees is skipped and one just above 30 is reported.
    - Commit subject: `Engine tests: add straight on skipping examples`
    - _Requirements: 15.9, 15.10, 21.6_
  - [ ] 15.4 Turn back from the player's heading
    - Extend `computeGuidance` so when the player's heading (`position.headingDegrees`) differs from the first route part's heading by more than 150 degrees, the next turn is turn back at distance zero. Add examples to `tests/guidance-turn.test.ts` at 150 and 151 degrees.
    - Commit subject: `Engine: report turn back from the player heading`
    - _Requirements: 15.4_
  - [ ] 15.5 Arrival along the route
    - Extend `computeGuidance` so the arrived flag is set when the distance left along the remaining route is at most the arrival radius AND the off-route distance is at most the margin, never from the straight-line distance to the destination. While arrived, distance left is zero and there is no next turn. Add `tests/guidance-arrival.test.ts` examples: just inside, exactly on the radius, just outside, custom radius, within the radius but beyond the margin (not arrived).
    - Commit subject: `Engine: add route-based arrival to guidance`
    - _Requirements: 15.5, 15.6, 15.12_
  - [ ] 15.6 Arrival example with a destination behind a blocked area
    - Create `tests/guidance-arrival-blocked.test.ts` with a hand-written map file in which the destination lies just behind a blocked area, within the arrival radius of the position in a straight line but further than the radius along the route. Load it with `parseMap`, find the route with `findRoute`, compute guidance, and assert the arrived flag is not set and distance left is the route distance.
    - Commit subject: `Engine tests: add blocked area arrival example`
    - _Requirements: 15.12, 15.13, 21.6_
  - [ ] 15.7 Guidance sentences
    - Create `kit/engine/src/guidance-text.ts` with `toSentence(guidance, noWayResult?)` using the fixed templates: "turn left in N", "turn right in N", "turn back in N" (N rounded to a whole unit), "You have arrived." (with the place name when the destination is a place), "go straight on" for the rounded distance left when there is a distance and no next turn, and the no-route sentence with the plain reason when present. There is no sentence for a straight-on turn, since it cannot be reported. Add `tests/guidance-text.test.ts` with one example per template.
    - Commit subject: `Engine: add guidance sentences`
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.6, 21.6_
  - [ ] 15.8 Property 20: turn bands
    - Add to `tests/guidance-turn.test.ts` a property over generated heading pairs (including exactly 30 and 150 degrees, both signs, wrap-around at 180): the change is `after - before` normalised to (-180, 180], and the class is straight on up to 30, right above 30 up to 150, left below -30 down to -150, turn back above 150; the same bands apply to player heading versus first route part.
    - **Property 20: Turn classification follows the signed angle bands**
    - **Validates: Requirements 15.3, 15.4**
    - Commit subject: `Engine tests: add property test for turn classification`
    - _Requirements: 15.3, 15.4_
  - [ ] 15.9 Property 21: next turn is never straight on
    - Add to `tests/guidance-next-turn.test.ts` a property over generated routes: the next turn is never straight on, equals the first turn point ahead classified left, right or turn back, and when none remains guidance holds a distance left and no next turn.
    - **Property 21: The next turn is never straight on**
    - **Validates: Requirements 15.2, 15.9, 15.10, 15.11**
    - Commit subject: `Engine tests: add property test for next turn never straight on`
    - _Requirements: 15.2, 15.9, 15.10, 15.11_
  - [ ] 15.10 Property 22: arrival along the route
    - Add to `tests/guidance-arrival.test.ts` a property over generated maps, routes and positions: the arrived flag is set exactly when distance left along the remaining route is at most the arrival radius and the off-route distance is at most the margin; straight-line distance to the destination never decides it; when set, distance left is zero and no next turn is reported.
    - **Property 22: Arrival depends on distance along the route and on being on the route**
    - **Validates: Requirements 15.5, 15.6, 15.12**
    - Commit subject: `Engine tests: add property test for arrival`
    - _Requirements: 15.5, 15.6, 15.12_
  - [ ] 15.11 Property 23: distance left starts at route length
    - Add to `tests/guidance-turn.test.ts` a property over generated maps and routes: guidance computed at the route start has distance left equal to the route length within 0.000001.
    - **Property 23: Guidance distance left starts equal to route length**
    - **Validates: Requirements 15.1, 15.8**
    - Commit subject: `Engine tests: add property test for starting distance left`
    - _Requirements: 15.1, 15.8_
  - [ ] 15.12 Property 24: sentences depend on guidance data only
    - Add to `tests/guidance-text.test.ts` a property: two structurally equal guidance values (and equal optional No_Way_Result values), built separately, give identical sentences.
    - **Property 24: Guidance sentences are a pure function of guidance data**
    - **Validates: Requirements 16.5**
    - Commit subject: `Engine tests: add property test for sentence purity`
    - _Requirements: 16.5_

- [ ] 16. Checkpoint - Ensure all tests pass
  - Run `npm run build` and `npm test` in `kit/engine`, each as its own call. Ensure all tests pass, ask the user if questions arise. No commit unless a fix was needed.

- [ ] 17. Mirror
  - [ ] 17.1 Mirror a map and a heading
    - Create `kit/engine/src/mirror.ts` with `mirrorMap(map)`: negate x of nodes, places, props, blocked area points and background picture position, negate prop rotation, leave everything else unchanged and keep derived fields consistent. Also export `mirrorHeading(h)` = `180 - h`. Add `tests/mirror.test.ts` with hand-written examples for the map and for headings (0 becomes 180, 90 stays 90, -90 stays -90).
    - Commit subject: `Engine: add map and heading mirroring`
    - _Requirements: 17.1, 17.5_
  - [ ] 17.2 Property 26: mirroring twice restores the map
    - Add to `tests/mirror.test.ts` a property over generated maps and headings: `mirrorMap(mirrorMap(map))` equals the map and `mirrorHeading(mirrorHeading(h))` equals h.
    - **Property 26: Mirroring twice restores the original map**
    - **Validates: Requirements 17.4, 17.5**
    - Commit subject: `Engine tests: add property test for mirror involution`
    - _Requirements: 17.4, 17.5_
  - [ ] 17.3 Property 25: mirrored guidance swaps turns
    - Create `tests/helpers/turn-sequence.ts` that finds a route with `findRoute`, walks positions along it with `advance`, and records the next turn and its distance from `computeGuidance` (without the Engine class). Add to `tests/mirror.test.ts` a property over generated maps, starts and destinations: the mirrored turn sequence equals the original with left and right swapped and turn back unchanged, neither contains straight on, a heading h maps to `180 - h` so a left change becomes a right change of the same size, and route length, distances to turns and road id sequence are equal within 0.000001.
    - **Property 25: Mirroring swaps turns and preserves lengths**
    - **Validates: Requirements 17.2, 17.3, 17.5**
    - Commit subject: `Engine tests: add property test for mirrored guidance`
    - _Requirements: 17.2, 17.3, 17.5_

- [ ] 18. Engine class
  - [ ] 18.1 Engine: load a map and read places and blocked roads
    - Create `kit/engine/src/engine.ts` with `class Engine` and `loadMap(text)` (a failed load keeps the previous state), `getPlaces()` (name and category exposed for search) and `getBlockedRoads()`. Create `tests/engine-api.test.ts` with examples for each method.
    - Commit subject: `Engine: add Engine class with loadMap and place access`
    - _Requirements: 5.4, 18.1, 18.4, 18.6_
  - [ ] 18.2 Engine: set and clear a destination
    - Add `setDestination({ placeId } | { point })`, `clearDestination()`, `getRoute()`, `getRemainingRoute()` and `getLastNoWayResult()` to `engine.ts`. Setting a destination returns the route with its length or the No_Way_Result and stores it, and resets the follower progress to zero. Add examples to `tests/engine-api.test.ts`, including an unknown place id.
    - Commit subject: `Engine: add destination handling to Engine`
    - _Requirements: 10.3, 18.2, 18.4, 18.5_
  - [ ] 18.3 Engine: feed positions, follow the route and configure options
    - Add `feedPosition(position, timestampMs)` and `configure({ searchWindow, rerouteMargin, rerouteDelayMs, arrivalRadius })` to `engine.ts`. Feeding keeps a follower progress, calls `advance` with the configured search window (default 100) and stores the remaining route and last position; before a map is loaded it returns the plain "no map is loaded" error. Add examples to `tests/engine-api.test.ts`, including that a caller-supplied search window is used.
    - Commit subject: `Engine: follow the route when a position is fed`
    - _Requirements: 12.4, 12.5, 13.6, 18.3, 18.9_
  - [ ] 18.4 Engine: guidance data and sentence
    - Add `getGuidance()` and `getGuidanceSentence()` to `engine.ts`, computed from the remaining route, last position, destination, `offRouteDistance` (using road widths from the map), the configured margin and arrival radius, and the last No_Way_Result. Add examples to `tests/engine-api.test.ts`: a route in progress, arrival with a place name, no route.
    - Commit subject: `Engine: expose guidance data and sentence`
    - _Requirements: 15.1, 15.5, 15.7, 16.1, 16.2, 16.3, 16.4, 18.4_
  - [ ] 18.5 Engine: rerouting
    - Wire `Rerouter` into `feedPosition` using the configured margin and delay and the road width lookup from the map. On a request, find a new route from the position to the same destination and reset the follower progress; when the finder returns a No_Way_Result, clear the route and keep the result for `getLastNoWayResult` and the sentence. Time comes only from the supplied timestamp. Add examples to `tests/engine-api.test.ts`: reroute after the delay, no reroute on a wobble, no-way after a reroute.
    - Commit subject: `Engine: reroute when the player leaves the route`
    - _Requirements: 13.2, 13.6, 13.7, 13.8, 14.1, 14.2_
  - [ ] 18.6 Property 19: reroute starts at the player and keeps the destination
    - Create `tests/reroute-result.test.ts` with a property over generated maps and off-route positions where a new route is found: the new route starts at the snapped point of the position at the time of the request and ends at the snapped point of the same destination as the old route.
    - **Property 19: A reroute starts where the player is and keeps the destination**
    - **Validates: Requirements 14.1, 14.2, 14.3**
    - Commit subject: `Engine tests: add property test for reroute result`
    - _Requirements: 14.1, 14.2, 14.3_
  - [ ] 18.7 Engine: input guards on every method
    - Add type and finiteness checks at the start of every public Engine method (including `configure`) using the `badInput` factory, so a rejected call returns a plain error naming the input and changes no state. Add examples to `tests/engine-api.test.ts` for NaN, Infinity and wrong types on each method.
    - Commit subject: `Engine: reject malformed input without changing state`
    - _Requirements: 18.8_
  - [ ] 18.8 Property 27: malformed input leaves state unchanged
    - Add to `tests/engine-api.test.ts` a property over malformed inputs (wrong type, NaN, Infinity) passed to each Engine method: the call returns an error naming the input, and route, remaining route, guidance and loaded map are equal to their values before the call.
    - **Property 27: The API rejects malformed input without changing state**
    - **Validates: Requirements 18.8**
    - Commit subject: `Engine tests: add property test for input rejection`
    - _Requirements: 18.8_

- [ ] 19. Public surface and docs
  - [ ] 19.1 Public exports and map file format doc
    - Fill `kit/engine/src/index.ts` with re-exports of `Engine`, the documented types and `mirrorMap` only (plus `mirrorHeading`). Create `kit/engine/docs/map-file-format.md` describing every field, type and allowed value, the supported format version, the Screen_Convention, and the style rules from `checkStyle`. Add to `tests/engine-api.test.ts` a check that the doc mentions every field name the loader reads.
    - Commit subject: `Engine: add public exports and map file format doc`
    - _Requirements: 1.5, 18.10_
  - [ ] 19.2 API doc and export list test
    - Create `kit/engine/docs/api.md` with one entry per exported function and type (including `configure` and `mirrorHeading`): description, inputs, outputs and one usage example. Add to `tests/engine-api.test.ts` a test that the export list of `src/index.ts` matches the entries in `docs/api.md` exactly.
    - Commit subject: `Engine: add API reference doc`
    - _Requirements: 18.7, 18.10_

- [ ] 20. Generator and benchmark
  - [ ] 20.1 Large map generator
    - Create `kit/engine/bench/generate-large-map.ts` producing a connected 5,000-road map from a numeric seed with a seeded random generator (no `Math.random`). Add `tests/generate-large-map.test.ts`: the same seed gives equal output, a different seed differs, the map loads without errors and has 5,000 roads.
    - Commit subject: `Engine: add seeded large map generator`
    - _Requirements: 20.1_
  - [ ] 20.2 Benchmark command
    - Create `kit/engine/bench/route-bench.ts` and add a `bench` script to `package.json`. It loads the large map, times the load, computes at least 100 seeded start and destination routes, and prints the median, 95th percentile and maximum route time in ms, the load time, the Node version, the machine description and the number of No_Way_Results, with no pass or fail threshold. Run it once with `npm run bench` (give the call a generous timeout) and record the printed numbers in the commit body. The benchmark stays out of `npm test`.
    - Commit subject: `Engine: add route benchmark command`
    - _Requirements: 20.2, 20.3, 20.4, 20.5_

- [ ] 21. Final checkpoint - Ensure all tests pass
  - Run `npm run build` and `npm test` in `kit/engine`, each as its own call, and note the default suite run time (must be under 60 seconds). Run `npm run bench` once more. Run `git status` and `git log --oneline` as separate calls. Ensure all tests pass, ask the user if questions arise.
  - Report plainly: real `git status` output, the commit list, test results with time, the measured route times, and anything not done or not verified. Do not report credit figures. Do not push.
  - _Requirements: 20.6, 21.1, 21.3, 21.4, 21.5, 21.6, 21.7_

## Notes

- Property tests are required tasks and carry no `*` marker.
- Property numbers 1 to 27 match the numbered properties in `design.md`.
- Each task is one commit; a task that grows is committed in several working steps, each building and passing the suite.
- Waves below hold one task each because every task is its own commit on the same branch and later tasks edit files earlier tasks created.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3"] },
    { "id": 3, "tasks": ["2.1"] },
    { "id": 4, "tasks": ["2.2"] },
    { "id": 5, "tasks": ["3.1"] },
    { "id": 6, "tasks": ["3.2"] },
    { "id": 7, "tasks": ["3.3"] },
    { "id": 8, "tasks": ["3.4"] },
    { "id": 9, "tasks": ["4.1"] },
    { "id": 10, "tasks": ["4.2"] },
    { "id": 11, "tasks": ["4.3"] },
    { "id": 12, "tasks": ["4.4"] },
    { "id": 13, "tasks": ["4.5"] },
    { "id": 14, "tasks": ["4.6"] },
    { "id": 15, "tasks": ["4.7"] },
    { "id": 16, "tasks": ["5.1"] },
    { "id": 17, "tasks": ["5.2"] },
    { "id": 18, "tasks": ["5.3"] },
    { "id": 19, "tasks": ["5.4"] },
    { "id": 20, "tasks": ["5.5"] },
    { "id": 21, "tasks": ["5.6"] },
    { "id": 22, "tasks": ["6.1"] },
    { "id": 23, "tasks": ["6.2"] },
    { "id": 24, "tasks": ["6.3"] },
    { "id": 25, "tasks": ["7.1"] },
    { "id": 26, "tasks": ["7.2"] },
    { "id": 27, "tasks": ["7.3"] },
    { "id": 28, "tasks": ["8.1"] },
    { "id": 29, "tasks": ["8.2"] },
    { "id": 30, "tasks": ["9.1"] },
    { "id": 31, "tasks": ["9.2"] },
    { "id": 32, "tasks": ["9.3"] },
    { "id": 33, "tasks": ["9.4"] },
    { "id": 34, "tasks": ["10.1"] },
    { "id": 35, "tasks": ["10.2"] },
    { "id": 36, "tasks": ["11.1"] },
    { "id": 37, "tasks": ["11.2"] },
    { "id": 38, "tasks": ["11.3"] },
    { "id": 39, "tasks": ["11.4"] },
    { "id": 40, "tasks": ["11.5"] },
    { "id": 41, "tasks": ["11.6"] },
    { "id": 42, "tasks": ["13.1"] },
    { "id": 43, "tasks": ["13.2"] },
    { "id": 44, "tasks": ["13.3"] },
    { "id": 45, "tasks": ["13.4"] },
    { "id": 46, "tasks": ["13.5"] },
    { "id": 47, "tasks": ["13.6"] },
    { "id": 48, "tasks": ["14.1"] },
    { "id": 49, "tasks": ["14.2"] },
    { "id": 50, "tasks": ["14.3"] },
    { "id": 51, "tasks": ["14.4"] },
    { "id": 52, "tasks": ["14.5"] },
    { "id": 53, "tasks": ["14.6"] },
    { "id": 54, "tasks": ["15.1"] },
    { "id": 55, "tasks": ["15.2"] },
    { "id": 56, "tasks": ["15.3"] },
    { "id": 57, "tasks": ["15.4"] },
    { "id": 58, "tasks": ["15.5"] },
    { "id": 59, "tasks": ["15.6"] },
    { "id": 60, "tasks": ["15.7"] },
    { "id": 61, "tasks": ["15.8"] },
    { "id": 62, "tasks": ["15.9"] },
    { "id": 63, "tasks": ["15.10"] },
    { "id": 64, "tasks": ["15.11"] },
    { "id": 65, "tasks": ["15.12"] },
    { "id": 66, "tasks": ["17.1"] },
    { "id": 67, "tasks": ["17.2"] },
    { "id": 68, "tasks": ["17.3"] },
    { "id": 69, "tasks": ["18.1"] },
    { "id": 70, "tasks": ["18.2"] },
    { "id": 71, "tasks": ["18.3"] },
    { "id": 72, "tasks": ["18.4"] },
    { "id": 73, "tasks": ["18.5"] },
    { "id": 74, "tasks": ["18.6"] },
    { "id": 75, "tasks": ["18.7"] },
    { "id": 76, "tasks": ["18.8"] },
    { "id": 77, "tasks": ["19.1"] },
    { "id": 78, "tasks": ["19.2"] },
    { "id": 79, "tasks": ["20.1"] },
    { "id": 80, "tasks": ["20.2"] }
  ]
}
```
