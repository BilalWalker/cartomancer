# Requirements Document

## Introduction

This document covers Block A of `docs/brief.md`: the engine core of Cartomancer, located in `kit/engine/`. The engine core holds the map file format with its checks, route finding, following, rerouting, guidance, and the small documented API an application uses to drive them.

The engine core is pure logic. It runs in Node without a browser and has no runtime dependency. It knows a map, a position with a heading, and a destination. It knows nothing about cars, missions, hospitals or rooms.

Out of scope: map views (Block B), the kit's `.kiro/` folder (Block C), City Run (Block D), Room Finder (Block E), the maker (Block F), and the landing page and docs (Block G). The `mount a view on a canvas` part of the brief's API is part of Block B. Block A tests use hand-written map files and generated maps.

## Glossary

- **Engine**: The pure-logic TypeScript package in `kit/engine/` that implements the requirements of this document.
- **Map**: The in-memory representation of a loaded map file.
- **Map_File**: The JSON text that holds one whole map.
- **Map_Loader**: The Engine component that parses and checks Map_File text and produces a Map.
- **Map_Saver**: The Engine component that writes a Map as Map_File text.
- **Format_Version**: The integer in a Map_File that names the revision of the map file format. The only supported value in Block A is 1.
- **Node**: A point of the road graph with a unique identifier and an x and y position in world units.
- **Road**: A connection between two Nodes with a width, a kind (main, side, footpath or corridor) and an optional one-way flag. A one-way Road may be travelled only from its first Node to its second Node.
- **Place**: A named position with a category, such as "Bank" or "Room 214".
- **Blocked_Area**: A polygon with a kind (mountain, water or wall). A Road whose centre line touches or crosses a Blocked_Area is a Blocked_Road.
- **Blocked_Road**: A Road that crosses a Blocked_Area. A Blocked_Road is not a Usable_Road.
- **Usable_Road**: A Road that is not a Blocked_Road.
- **Prop**: A decoration with a kind (from the starter set or an uploaded picture), a position, a size and a rotation. A Prop has no effect on routes.
- **Background_Picture**: An optional picture reference with a scale and an opacity, used for tracing a floor plan.
- **Style**: The colours and line styles stored in a Map_File.
- **Notice**: A plain-worded message from the Engine that tells the caller about a condition that is not an error, such as a Road left out of routing.
- **Position**: An x and y location in world units together with a heading in degrees.
- **Destination**: A Place or a clicked point that the player wants to reach.
- **Snapped_Point**: The point on a Usable_Road that is nearest to a given point.
- **Route**: An ordered chain of Usable_Roads, with the Snapped_Point of the start and of the Destination, that leads from the player's Position to the Destination.
- **Route_Finder**: The Engine component that computes a Route.
- **No_Way_Result**: The result the Route_Finder returns when no Route exists. It carries a plain-worded reason and no Route.
- **Route_Follower**: The Engine component that trims the travelled part of the Route as the player moves.
- **Rerouter**: The Engine component that decides when the player has left the Route and requests a new Route.
- **Reroute_Margin**: The distance in world units from the Route beyond which the player counts as off the Route. Default 15 world units.
- **Reroute_Delay**: The time in milliseconds the player must stay beyond the Reroute_Margin before a new Route is requested. Default 1000 ms.
- **Guidance**: The data and the plain words that describe the remaining Route: distance left, next turn with distance to it, and arrival.
- **Turn**: One of left, right, straight on or turn back.
- **Arrival_Radius**: The distance in world units from the Destination within which the player counts as arrived. Default 10 world units.
- **Engine_API**: The small documented set of functions and types an application uses: load a map, set a destination, feed the position each frame, and read route and guidance.
- **Default_Suite**: The set of tests that runs with the default test command, excluding browser checks.
- **Large_Generated_Map**: A generated Map with 5,000 Roads.

## Requirements

### Requirement 1: Map file structure and version

**User Story:** As an application developer, I want a documented map file format with a version, so that I can store a whole map in one JSON file and know which revision it follows.

#### Acceptance Criteria

1. THE Map_File SHALL be a single JSON document that holds a Format_Version, nodes, roads, places, blocked areas, props, an optional Background_Picture, and a Style.
2. WHEN Map_File text is loaded, THE Map_Loader SHALL read the Format_Version before reading any other field.
3. IF the Format_Version is missing, is not an integer, or is not a supported value, THEN THE Map_Loader SHALL reject the Map_File with a plain-worded error that names the Format_Version field and lists the supported values.
4. THE Map_Loader SHALL accept a Map_File in which the Background_Picture field is absent.
5. THE Engine SHALL document the Map_File format, including every field, its type and its allowed values, in a file inside `kit/engine/`.

### Requirement 2: Map file checks for nodes and roads

**User Story:** As an application developer, I want the loader to check the road graph, so that the route finder only ever works on a consistent graph.

#### Acceptance Criteria

1. WHEN a Map_File is loaded, THE Map_Loader SHALL verify that every Node has a unique identifier and finite numeric x and y values.
2. WHEN a Map_File is loaded, THE Map_Loader SHALL verify that every Road refers to two existing Node identifiers that differ from each other.
3. WHEN a Map_File is loaded, THE Map_Loader SHALL verify that every Road has a width greater than zero.
4. WHEN a Map_File is loaded, THE Map_Loader SHALL verify that every Road kind is one of main, side, footpath or corridor.
5. WHEN a Map_File is loaded, THE Map_Loader SHALL verify that the one-way flag of every Road, when present, is a boolean.
6. IF a Node identifier is used by more than one Node, THEN THE Map_Loader SHALL reject the Map_File with a plain-worded error that names the duplicated identifier.
7. IF a Road refers to a Node identifier that does not exist, THEN THE Map_Loader SHALL reject the Map_File with a plain-worded error that names the Road and the missing Node identifier.

### Requirement 3: Map file checks for places, blocked areas, props, background and style

**User Story:** As an application developer, I want every other part of the map file checked, so that a map with a bad place, area, prop, picture or style is refused and not half used.

#### Acceptance Criteria

1. WHEN a Map_File is loaded, THE Map_Loader SHALL verify that every Place has a non-empty name, a non-empty category, and finite numeric x and y values.
2. WHEN a Map_File is loaded, THE Map_Loader SHALL verify that every Place has an identifier that is unique among all Places.
3. WHEN a Map_File is loaded, THE Map_Loader SHALL verify that every Blocked_Area has a kind of mountain, water or wall and a polygon of at least three points with finite numeric coordinates.
4. WHEN a Map_File is loaded, THE Map_Loader SHALL verify that every Prop has a kind, finite numeric x and y values, a size greater than zero in both dimensions, and a finite numeric rotation.
5. WHERE a Background_Picture is present, THE Map_Loader SHALL verify that the Background_Picture has a picture reference, a scale greater than zero, and an opacity from 0 to 1 inclusive.
6. WHEN a Map_File is loaded, THE Map_Loader SHALL verify that the Style holds colour values and line style values of the types the format document defines.
7. IF a field of a Place, Blocked_Area, Prop, Background_Picture or Style does not satisfy its check, THEN THE Map_Loader SHALL reject the Map_File with a plain-worded error that names the item and the field.

### Requirement 4: Plain-worded errors and no half-loaded map

**User Story:** As an application developer, I want every load failure to be explained in plain words and to leave me with no map, so that I never run on a partly loaded map.

#### Acceptance Criteria

1. IF the Map_File text is not valid JSON, THEN THE Map_Loader SHALL reject the Map_File with a plain-worded error that states the text is not valid JSON and gives the position of the first problem.
2. IF the top level of the Map_File is not a JSON object, or a required top-level field is missing, THEN THE Map_Loader SHALL reject the Map_File with a plain-worded error that names the missing or wrong field.
3. IF the Map_Loader rejects a Map_File, THEN THE Map_Loader SHALL return no Map.
4. THE Map_Loader SHALL report each rejection as an error that holds a message, the name of the field or item concerned, and its position in the Map_File when known.
5. THE Map_Loader SHALL write each error message in plain words that name the problem and contain no stack trace, internal identifier or programming jargon.
6. WHEN a Map_File has more than one problem, THE Map_Loader SHALL report every problem found in a single result.
7. FOR ALL Map_File text that does not fit the format, THE Map_Loader SHALL either return a Map with no problems found or return errors with no Map, and SHALL NOT return a Map together with errors.

### Requirement 5: Blocked roads are left out with a notice

**User Story:** As a map maker, I want roads that cross blocked areas left out of routing and reported, so that I can see why a road is not used.

#### Acceptance Criteria

1. WHEN a Map is built from a valid Map_File, THE Map_Loader SHALL classify each Road whose centre line touches or crosses a Blocked_Area as a Blocked_Road.
2. WHEN a Map contains one or more Blocked_Roads, THE Map_Loader SHALL return a Notice for each Blocked_Road that names the Road and the Blocked_Area it crosses and states that the Road is left out of routing.
3. THE Route_Finder SHALL exclude every Blocked_Road from all Routes.
4. THE Engine_API SHALL expose the list of Blocked_Roads and their Notices to the caller.
5. WHEN a Map contains no Blocked_Roads, THE Map_Loader SHALL return no Blocked_Road Notices.

### Requirement 6: Map round trip

**User Story:** As an application developer, I want a map saved and loaded again to be the same map, so that no information is lost when a map is stored.

#### Acceptance Criteria

1. THE Map_Saver SHALL write a Map as Map_File text that the Map_Loader accepts.
2. THE Map_Saver SHALL write the current Format_Version in every Map_File it produces.
3. FOR ALL valid Maps, saving a Map with the Map_Saver and loading the result with the Map_Loader SHALL produce a Map equal to the original, field for field, including the absence of a Background_Picture (round-trip property).
4. FOR ALL valid Maps, saving a Map, loading the result and saving it again SHALL produce Map_File text equal to the first saved text (idempotence property).
5. THE Default_Suite SHALL include a property-based test of the round-trip property over generated Maps that include every Road kind, every Blocked_Area kind, Props, and both the present and absent Background_Picture.

### Requirement 7: Snapping a point to the nearest road

**User Story:** As a player, I want a clicked point to be treated as the nearest point on a road, so that I can set a destination anywhere on the map.

#### Acceptance Criteria

1. WHEN a point is given to the Route_Finder as a Destination or a start, THE Route_Finder SHALL compute the Snapped_Point on the Usable_Road that is nearest to the point.
2. WHEN two or more Usable_Roads are equally near to a point, THE Route_Finder SHALL choose the Usable_Road with the lowest identifier so that the result is repeatable.
3. IF a Map has no Usable_Road, THEN THE Route_Finder SHALL return a No_Way_Result that states the map has no usable road.
4. FOR ALL generated Maps and points, THE distance from the point to the Snapped_Point SHALL be less than or equal to the distance from the point to every other point on every Usable_Road (snapping property, checked against a sampled search over all Usable_Roads).
5. FOR ALL points that already lie on a Usable_Road, THE Route_Finder SHALL return a Snapped_Point equal to the point within a tolerance of 0.001 world units.

### Requirement 8: Route finding

**User Story:** As a player, I want the shortest route along usable roads to a place or a clicked point, so that I can reach my destination.

#### Acceptance Criteria

1. WHEN a Destination that is a Place is set, THE Route_Finder SHALL compute the shortest Route along Usable_Roads from the Snapped_Point of the player's Position to the Snapped_Point of the Place.
2. WHEN a Destination that is a clicked point is set, THE Route_Finder SHALL compute the shortest Route along Usable_Roads from the Snapped_Point of the player's Position to the Snapped_Point of the clicked point.
3. THE Route_Finder SHALL measure the length of a Route as the sum of the lengths of the Road parts it uses.
4. WHEN the start and the Destination snap to the same point, THE Route_Finder SHALL return a Route of length zero.
5. WHEN several Routes have the same shortest length, THE Route_Finder SHALL return the same Route every time for the same Map, start and Destination.
6. WHEN a Route is returned, THE Route_Finder SHALL return the Route as an ordered list of Road parts, each with the Road identifier, the travel direction, and the start and end points.
7. FOR ALL generated Maps, starts and Destinations where a Route is returned, THE Route SHALL be an unbroken chain in which the first part starts at the Snapped_Point of the start, each part ends where the next part starts, every part lies on a Usable_Road, and the last part ends at the Snapped_Point of the Destination (chain property).

### Requirement 9: Optimality of routes

**User Story:** As a player, I want the route to be the shortest one, so that I am not sent the long way round.

#### Acceptance Criteria

1. FOR ALL generated Maps with at most 12 Nodes, starts and Destinations, THE length of the Route returned by the Route_Finder SHALL be equal, within a tolerance of 0.000001 world units, to the length of the shortest path found by a plain exhaustive search that is part of the test code (optimality property).
2. FOR ALL generated Maps with at most 12 Nodes, starts and Destinations, IF the plain exhaustive search finds a path, THEN THE Route_Finder SHALL return a Route.
3. THE exhaustive search used in the optimality property SHALL apply the same Usable_Road rule and one-way rule as the Route_Finder without sharing code with the Route_Finder.

### Requirement 10: Unreachable destinations

**User Story:** As a player, I want to be told plainly when there is no way, so that I am never shown a route that does not arrive.

#### Acceptance Criteria

1. IF no chain of Usable_Roads leads from the start to the Destination, THEN THE Route_Finder SHALL return a No_Way_Result and no Route.
2. THE Route_Finder SHALL write the reason in a No_Way_Result in plain words, and SHALL state whether the cause is that the map has no usable road, that the start and the Destination are in separate parts of the map, that a one-way Road blocks the way, or that Blocked_Roads cut the way.
3. IF a Place named by a Destination does not exist in the Map, THEN THE Route_Finder SHALL return a No_Way_Result that names the missing Place.
4. THE Route_Finder SHALL return either a Route that arrives at the Destination or a No_Way_Result, and SHALL NOT return a Route that does not arrive.
5. FOR ALL generated Maps, starts and Destinations where the exhaustive search of Requirement 9 finds no path, THE Route_Finder SHALL return a No_Way_Result and no Route (unreachable property).

### Requirement 11: One-way and blocked road rules

**User Story:** As a player, I want routes to obey one-way roads and blocked areas, so that the route never asks me to do what the map forbids.

#### Acceptance Criteria

1. THE Route_Finder SHALL travel a one-way Road only from its first Node to its second Node.
2. THE Route_Finder SHALL allow travel in both directions on a Road that is not one-way.
3. WHEN the start snaps to the inside of a one-way Road, THE Route_Finder SHALL leave that Road only towards its second Node.
4. WHEN the Destination snaps to the inside of a one-way Road, THE Route_Finder SHALL reach that point only by travelling in the allowed direction.
5. FOR ALL generated Maps that contain Blocked_Areas and one-way Roads, no Route SHALL use a Blocked_Road, and no Route SHALL use a one-way Road against its direction (rules property).

### Requirement 12: Following the route

**User Story:** As a player, I want the part of the route I have travelled to disappear, so that I see only what is left to do.

#### Acceptance Criteria

1. WHEN a new Position is fed to the Engine while a Route is active, THE Route_Follower SHALL find the point on the remaining Route that is nearest to the Position.
2. WHEN the player is on the Route, THE Route_Follower SHALL remove the part of the Route that lies before that nearest point.
3. THE Route_Follower SHALL keep the removed part removed when the player moves back, so that the remaining Route only shrinks while the player is on the Route.
4. THE Route_Follower SHALL report the remaining Route to the caller after each Position is fed.
5. FOR ALL generated Maps, Routes and sequences of Positions that move along the Route, THE distance left SHALL never be greater than the distance left after the previous Position (monotonic property).

### Requirement 13: Rerouting without flicker

**User Story:** As a player, I want a new route when I really leave the old one and not when I merely wobble, so that the route line does not flicker.

#### Acceptance Criteria

1. WHEN the distance from the Position to the remaining Route is greater than the Reroute_Margin, THE Rerouter SHALL start measuring the time the player has stayed beyond the Reroute_Margin.
2. WHEN the player has stayed beyond the Reroute_Margin for the Reroute_Delay without returning within the Reroute_Margin, THE Rerouter SHALL request a new Route from the current Position to the same Destination.
3. WHEN the distance from the Position to the remaining Route becomes less than or equal to the Reroute_Margin before the Reroute_Delay has passed, THE Rerouter SHALL cancel the measured time.
4. WHILE the distance from the Position to the remaining Route is less than or equal to the Reroute_Margin, THE Rerouter SHALL request no new Route.
5. WHEN a new Route has been requested, THE Rerouter SHALL request no further new Route until the player has again stayed beyond the Reroute_Margin for the Reroute_Delay.
6. WHERE the caller supplies a Reroute_Margin or a Reroute_Delay, THE Engine_API SHALL use the supplied values and not the defaults.
7. IF the Rerouter requests a new Route and the Route_Finder returns a No_Way_Result, THEN THE Engine SHALL clear the active Route and report the No_Way_Result to the caller in plain words.
8. THE Engine SHALL take time from the timestamp supplied with each Position and SHALL NOT read the system clock, so that rerouting is repeatable in tests.
9. FOR ALL generated Maps, Routes and sequences of Positions that stay within the Reroute_Margin of the Route, THE Rerouter SHALL request no new Route (no-flicker property).
10. FOR ALL generated Maps, Routes and sequences of Positions that move along the Route, THE Rerouter SHALL request no new Route and THE distance left SHALL not increase (on-route property).

### Requirement 14: Result of a reroute

**User Story:** As a player, I want the new route to begin where I am and end where I was going, so that rerouting never changes my goal.

#### Acceptance Criteria

1. WHEN the Rerouter has requested a new Route, THE Route_Finder SHALL compute it from the Snapped_Point of the Position the player has at the time of the request.
2. WHEN a new Route is computed by the Rerouter, THE Engine SHALL keep the Destination unchanged.
3. FOR ALL generated Maps and off-route Positions where a new Route is found, THE new Route SHALL start at the Snapped_Point of the Position at the time of the request and SHALL end at the Snapped_Point of the same Destination as the old Route (reroute property).

### Requirement 15: Guidance data

**User Story:** As an application developer, I want guidance as structured data, so that I can show it in any way I like.

#### Acceptance Criteria

1. WHILE a Route is active, THE Engine SHALL provide Guidance data with the distance left along the remaining Route in world units.
2. WHILE a Route is active and a Turn remains on the Route, THE Engine SHALL provide in the Guidance data the next Turn and the distance along the Route to that Turn.
3. WHEN a Turn is classified, THE Engine SHALL compare the heading of the Route part before the Turn point with the heading of the part after it, and SHALL classify an absolute change of up to 30 degrees as straight on, a change of more than 30 and up to 150 degrees to the left as left, a change of more than 30 and up to 150 degrees to the right as right, and an absolute change of more than 150 degrees as turn back.
4. WHEN the first part of the Route points more than 150 degrees away from the player's heading, THE Engine SHALL provide turn back as the next Turn at distance zero.
5. WHEN the distance from the Position to the Destination is less than or equal to the Arrival_Radius, THE Engine SHALL set the Guidance arrived flag.
6. WHILE the Guidance arrived flag is set, THE Engine SHALL provide a distance left of zero and no next Turn.
7. WHEN no Route is active, THE Engine SHALL provide Guidance data that states there is no active Route and that holds no distance and no Turn.
8. FOR ALL generated Maps and Routes, THE distance left at the start of a Route SHALL be equal, within a tolerance of 0.000001 world units, to the Route length.

### Requirement 16: Guidance in plain words

**User Story:** As a player, I want guidance in plain words, so that I can follow directions without reading data.

#### Acceptance Criteria

1. WHEN Guidance data holds a next Turn, THE Engine SHALL produce a sentence that names the Turn in the words "turn left", "turn right", "go straight on" or "turn back" and states the distance to it rounded to the nearest whole world unit.
2. WHEN the Guidance arrived flag is set, THE Engine SHALL produce the sentence "You have arrived."
3. WHEN Guidance data holds a distance left and no next Turn, THE Engine SHALL produce a sentence that states the distance left rounded to the nearest whole world unit.
4. WHEN no Route is active, THE Engine SHALL produce a sentence that states there is no route and, when a No_Way_Result exists, includes the plain reason of the No_Way_Result.
5. THE Engine SHALL produce every guidance sentence from the Guidance data alone, so that identical Guidance data produces identical text.
6. WHERE a Place is the Destination, THE Engine SHALL include the Place name in the arrival sentence.

### Requirement 17: Mirroring a map

**User Story:** As an application developer, I want mirrored maps to give mirrored guidance, so that left and right are never mixed up.

#### Acceptance Criteria

1. THE Engine SHALL provide, for test use, a function that mirrors a Map horizontally by negating the x value of every Node, Place, Prop, Blocked_Area point, and Background_Picture position, and by negating the Prop rotation.
2. FOR ALL generated Maps, starts and Destinations, THE Guidance of the Route on the mirrored Map SHALL contain the same sequence of Turns as the Guidance of the Route on the original Map with every left replaced by right and every right replaced by left, and with straight on and turn back unchanged (mirror property).
3. FOR ALL generated Maps, starts and Destinations, THE Route length, the distance to each Turn and the sequence of Road identifiers on the mirrored Map SHALL be equal to those on the original Map, within a tolerance of 0.000001 world units for lengths and distances (mirror property).
4. WHEN a Map is mirrored twice, THE result SHALL equal the original Map (mirror involution property).

### Requirement 18: Engine API

**User Story:** As an application developer, I want a small documented API, so that I can use the engine without reading its inner parts.

#### Acceptance Criteria

1. THE Engine_API SHALL provide a function to load a Map from Map_File text that returns either a Map with its Notices or the list of errors.
2. THE Engine_API SHALL provide a function to set a Destination that accepts either a Place identifier or a clicked point, and that returns either the Route with its length or a No_Way_Result.
3. THE Engine_API SHALL provide a function to feed a Position and a timestamp, to be called once for each frame, that updates the remaining Route, the Rerouter state and the Guidance.
4. THE Engine_API SHALL provide read access to the current Route, the remaining Route, the Guidance data, the Guidance sentence, the last No_Way_Result, and the list of Blocked_Roads.
5. THE Engine_API SHALL provide a function to clear the Destination.
6. THE Engine_API SHALL expose Places by name and category so that an application can offer a search.
7. THE Engine_API SHALL document each exported function and type with a description, its inputs, its outputs and one usage example, in a file inside `kit/engine/`.
8. IF an Engine_API function is called with an input of the wrong type or with a value that is not finite, THEN THE Engine_API SHALL return a plain-worded error that names the input and SHALL leave the Engine state unchanged.
9. IF a Position is fed before a Map is loaded, THEN THE Engine_API SHALL return a plain-worded error that states no map is loaded.
10. THE Engine_API SHALL export only the documented functions and types.

### Requirement 19: Engine independence

**User Story:** As a maintainer, I want the engine logic to run in Node with no dependencies, so that it can be tested without a browser and reused anywhere.

#### Acceptance Criteria

1. THE Engine SHALL declare no runtime dependency in the `dependencies` field of its package manifest.
2. THE Engine core logic SHALL import no browser-only global, including `window`, `document` and `HTMLCanvasElement`.
3. THE Default_Suite SHALL run the Engine core logic in Node without a browser.
4. THE Engine core logic SHALL contain no reference to cars, missions, hospitals, rooms or any other application concept.
5. THE Engine SHALL compile with the TypeScript strict option enabled and no compile error.
6. THE Engine SHALL use no real-world map data and no AI model at run time.

### Requirement 20: Measured speed

**User Story:** As a reviewer, I want route time measured on a large map and reported, so that speed claims rest on numbers.

#### Acceptance Criteria

1. THE Engine SHALL include a generator that produces a Large_Generated_Map from a numeric seed, so that the same seed always produces the same Map.
2. THE Engine SHALL include a benchmark command, separate from the Default_Suite, that measures the Route_Finder on the Large_Generated_Map.
3. WHEN the benchmark command runs, THE benchmark SHALL load the Large_Generated_Map, compute at least 100 Routes between seeded random start and Destination pairs, and print the median, the 95th percentile and the maximum route time in milliseconds together with the Node version and the machine description.
4. WHEN the benchmark command runs, THE benchmark SHALL also print the time taken to load the Large_Generated_Map and the number of Routes that returned a No_Way_Result.
5. THE benchmark SHALL report the measured numbers and SHALL set no pass or fail threshold that the numbers are compared against.
6. THE checkpoint report for Block A SHALL include the measured route times from the benchmark.

### Requirement 21: Test suite rules

**User Story:** As a reviewer, I want a fast and honest test suite, so that I can rerun it at each checkpoint and trust it.

#### Acceptance Criteria

1. THE Default_Suite SHALL complete in under 60 seconds on the development machine.
2. THE Default_Suite SHALL contain one property-based test, written with Vitest and fast-check, for each of the following properties: chain, optimality, unreachable, rules (blocked and one-way), snapping, monotonic distance left, no reroute while on the Route, reroute start and destination, mirror, and save-then-load round trip.
3. THE Default_Suite SHALL run each property-based test with at least 100 generated cases.
4. THE Default_Suite SHALL contain no skipped test, no test with a raised time limit, and no loosened threshold to make a test pass.
5. IF a property cannot be made to pass, THEN THE checkpoint report SHALL state the failing property and its counterexample and SHALL NOT weaken the test.
6. THE Default_Suite SHALL include example-based tests with a hand-written Map_File that cover each error message of Requirements 1 to 4, each Turn class of Requirement 15, and each sentence form of Requirement 16.
7. WHEN a property-based test fails, THE Default_Suite SHALL print the seed and the shrunk counterexample so that the failure can be repeated.
