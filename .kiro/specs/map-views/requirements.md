# Requirements Document

## Introduction

This document covers Block B of `docs/brief.md`: the map views of Cartomancer. The views are a minimap that turns with the player, a full map with pan, zoom and click or tap to set a destination, and a tilted view in which buildings and props are raised blocks. A bare demo page shows the three views side by side on a hand-written small town map and on the generated 5,000-road map. The last task of the spec is the gate of the brief: on the demo page a person can click a place, see the route, leave it and get a new one, smoothly, on the 5,000-road map.

The views build on the engine core (`.kiro/specs/engine-core`). They read the Map, the Route, the remaining Route, the Guidance and the Position through the Engine_API. The views do not change the engine core. If a view needs something the Engine_API lacks, such as read access to the loaded Map or a snapping function, that thing is added to the engine, documented in `kit/engine/docs/api.md`, and tested there, so that both applications can use it.

Logic and drawing are split. The Camera, the world-to-screen and screen-to-world transforms, the visibility check, the draw order of the Tilted_View, the label placement and the hit testing are pure code that runs in Node and is tested without a browser. Drawing goes through a small Canvas_Interface, so that tests use a Recording_Canvas that stores the drawing calls. The views have no runtime dependency.

The Screen_Convention of the engine core applies: x grows to the right, y grows downward, and a heading is in degrees clockwise from the positive x axis, so a heading of 0 points right and a heading of 90 points down the screen.

Units and ranges used throughout this document: world coordinates are in world units; screen coordinates and sizes are in CSS pixels (px); angles are in degrees; times are in milliseconds (ms) unless stated. Every number that a caller supplies must be finite (not NaN and not infinite). Where this document gives a tolerance, it is an absolute tolerance in the stated unit unless it is called relative. An invalid input is never repaired silently: each View returns or reports a plain-worded error that names the input and its allowed range, and keeps its previous state.

Out of scope: the kit's `.kiro/` folder (Block C), City Run (Block D), Room Finder (Block E), the maker (Block F), the landing page (Block G), and the art that the owner supplies later. The Block B Prop and building shapes are plain shapes. The views draw no picture for a Background_Picture or an uploaded Prop; a picture reference is drawn as a plain placeholder rectangle with the Prop kind as its label.

## Glossary

- **Views**: The Engine package components of Block B: the Minimap, the Full_Map and the Tilted_View, with the pure logic they share.
- **Engine**: The pure-logic TypeScript package in `kit/engine/` defined by the engine-core spec.
- **Engine_API**: The documented functions and types of the Engine, as defined by the engine-core spec.
- **Map**: The in-memory representation of a loaded map file, as defined by the engine-core spec.
- **Style**: The colours and line styles stored in the map file. The Style holds the two records `colors` and `lineStyles`.
- **Default_Style**: The built-in colours and line styles of the Views, used for every Style key the map file does not set.
- **Resolved_Style**: The Style of the Map with every missing key filled from the Default_Style.
- **Canvas_Interface**: The small set of drawing operations the Views call: save and restore of state, translate, rotate and scale, path building (move, line, arc, close), fill, stroke, set fill colour, set stroke colour, set line width, set line join, set line cap, set line dash, set global alpha, text drawing with a font and alignment, text measuring, and clipping to the current path. The Canvas_Interface contains no operation that is specific to a browser.
- **Canvas_Adapter**: The Views component that implements the Canvas_Interface on a browser Canvas 2D context.
- **Recording_Canvas**: A test stand-in that implements the Canvas_Interface by storing each call in order, with its arguments and the state that was current at the call.
- **Camera**: The state that maps world points to screen points: a world centre point, a Zoom, a rotation in degrees, and the size of the Viewport in CSS pixels.
- **Zoom**: The number of CSS pixels that one world unit covers on the screen. Allowed range 0.001 to 1000 CSS pixels per world unit.
- **Viewport**: The drawing area of a view in CSS pixels. Allowed width and height each 1 to 16384 CSS pixels.
- **World_To_Screen**: The transform of the Camera from a world point to a screen point in the Viewport.
- **Screen_To_World**: The transform of the Camera from a screen point to a world point. It is the inverse of World_To_Screen.
- **Visible_Set**: The set of Roads, Blocked_Areas, Props, Places and Route parts that the visibility check reports as overlapping the visible world region of a view.
- **Visible_Region**: The area of the world that the Viewport shows, widened by a margin that covers the line width, the label size and the block height of the items drawn.
- **Minimap**: The round view that is centred on the player and turns so that the player's heading points up the screen.
- **North_Mark**: The mark on the Minimap rim that points to world north, which is the negative y direction under the Screen_Convention.
- **Full_Map**: The view with pan, zoom, and click or tap to set a Destination.
- **Tilted_View**: The view that shows the Map from a raised angle, centred on the player with the player's heading pointing up the screen, in which Raised_Blocks stand on the ground.
- **Tilt_Angle**: The angle in degrees between the viewing direction and the ground plane in the Tilted_View. Allowed range 20 to 70 degrees. Default 45 degrees.
- **Raised_Block**: A Prop whose kind is in the Raised_Kinds, drawn in the Tilted_View as a box with a ground footprint, a top face and side faces that rise from the ground.
- **Raised_Kinds**: The list of Prop kinds that the Tilted_View draws as Raised_Blocks. Default: `building`, `house`, `tower`, `wall-block`. A Prop kind outside the Raised_Kinds is drawn flat on the ground.
- **Block_Height**: The height in world units of a Raised_Block. It is the Prop height field multiplied by a height factor. The default height factor is 1. A caller-supplied height factor per Prop kind must lie in the range 0 to 100.
- **Depth_Order**: The draw order of the Tilted_View, in which items that are farther from the viewer are drawn before items that are nearer. The viewer is at the bottom of the screen, so an item is nearer when its ground footprint lies lower on the screen.
- **Route_Line**: The drawn line of the remaining Route.
- **Player_Marker**: The drawn mark of the player's Position, with a pointer that shows the heading.
- **Destination_Marker**: The drawn mark of the Destination.
- **Place_Label**: The drawn name of a Place.
- **Label_Placement**: The pure function that decides which Place_Labels are drawn and where.
- **Hit_Test**: The pure function that decides which Place marker, if any, lies under a screen point.
- **Smoothing**: The gradual change of a Camera value over several frames towards a target value.
- **Notice**: A plain-worded message that a View reports to the caller without stopping, for a condition that does not make the View unusable.
- **View_Error**: A plain-worded message that a View returns for an invalid input. A View_Error names the input, states the allowed range or rule, and contains no coordinates of a point that was rejected.
- **Reduced_Motion**: The browser setting `prefers-reduced-motion: reduce`.
- **Device_Pixel_Ratio**: The ratio of physical pixels to CSS pixels of the screen. Allowed range 0.5 to 8; the Canvas_Adapter uses at most 3.
- **Demo_Page**: The bare Vite page in `kit/demo/`, outside the Engine package, that shows the three Views.
- **Town_Map**: A small hand-written map file of an invented town, used by the Demo_Page.
- **Large_Generated_Map**: A generated Map with 5,000 Roads, as defined by the engine-core spec.
- **Frame_Time**: The time the CPU spends in one draw call of a View, measured with `performance.now()` around the draw call, together with the interval between two animation frames.
- **Frame_Benchmark**: The Playwright command, separate from the Default_Suite, that measures the Frame_Time of each View on the Large_Generated_Map in a real browser.
- **Default_Suite**: The set of tests that runs with the default test command, excluding browser checks.
- **Gate**: The check of the brief that the Views work on the Large_Generated_Map as a person uses them.

## Requirements

### Requirement 1: Canvas interface and recording stand-in

**User Story:** As a maintainer, I want all drawing to go through a small interface, so that I can test what a view draws without a browser.

#### Acceptance Criteria

1. THE Views SHALL perform every drawing operation through the Canvas_Interface and SHALL call no browser drawing function directly outside the Canvas_Adapter.
2. THE Canvas_Adapter SHALL implement the Canvas_Interface on a browser Canvas 2D context.
3. THE Views SHALL include a Recording_Canvas that implements the Canvas_Interface and stores each call in order with its arguments.
4. WHEN a View is drawn on the Recording_Canvas, THE Recording_Canvas SHALL give a test access to the ordered list of calls, including the fill colour, stroke colour, line width and transform that were current at each call.
5. THE Default_Suite SHALL draw each View on the Recording_Canvas in Node.
6. THE Views SHALL declare no runtime dependency in the `dependencies` field of the package manifest.
7. THE Views logic, excluding the Canvas_Adapter and the input binding, SHALL reference no browser-only global, including `window`, `document` and `HTMLCanvasElement`.
8. IF a drawing call receives a number that is not finite, THEN THE Views SHALL skip that drawing call, SHALL report a Notice that names the drawing operation, and SHALL send no non-finite number to the Canvas_Interface.
9. IF the Canvas_Adapter is given a canvas that has no Canvas 2D context, THEN THE Canvas_Adapter SHALL return a View_Error that states that the canvas offers no 2D drawing and SHALL mount no View.

### Requirement 2: Camera and transforms

**User Story:** As an application developer, I want exact world-to-screen and screen-to-world transforms, so that clicks, drawing and hit testing agree.

#### Acceptance Criteria

1. THE Camera SHALL hold a world centre with finite x and y, a Zoom from 0.001 to 1000 CSS pixels per world unit, a finite rotation in degrees, and a Viewport width and height each from 1 to 16384 CSS pixels, and SHALL map the world centre to the centre of the Viewport.
2. WHEN the rotation is 0, THE Camera SHALL compute World_To_Screen so that a world x larger by 1 world unit moves the screen point right by Zoom CSS pixels and a world y larger by 1 world unit moves the screen point down by Zoom CSS pixels.
3. WHEN a screen point is given, THE Camera SHALL compute its world point with Screen_To_World.
4. IF the Zoom, the Viewport size, the world centre or the rotation is not finite or lies outside its allowed range, THEN THE Camera SHALL return a plain-worded View_Error that names the value and its allowed range and SHALL keep its previous state.
5. IF a point to transform has an x or y that is not finite, THEN THE Camera SHALL return a plain-worded View_Error that names the point (world point or screen point) and contains no coordinates.
6. WHEN the rotation is positive, THE Camera SHALL turn the world clockwise on the screen about the centre of the Viewport, so that a rotation of 90 degrees maps the world +x direction to the screen +y direction, and a rotation of r degrees and a rotation of r + 360 degrees SHALL give the same screen points within 0.001 CSS pixels.
7. FOR ALL Cameras with world centre coordinates of absolute value at most 1,000,000 world units, and world points within 100,000 CSS pixels divided by Zoom of the world centre, applying World_To_Screen and then Screen_To_World SHALL return the original world point within 0.001 world units (transform round-trip property).
8. FOR ALL Cameras with world centre coordinates of absolute value at most 1,000,000 world units, and screen points within 100,000 CSS pixels of the Viewport centre, applying Screen_To_World and then World_To_Screen SHALL return the original screen point within 0.001 CSS pixels (transform round-trip property).
9. FOR ALL Cameras, THE world centre SHALL map to the centre of the Viewport within 0.001 CSS pixels.
10. FOR ALL Cameras and pairs of world points, THE distance between the two screen points SHALL equal the distance between the two world points multiplied by Zoom within a relative tolerance of 0.000001, so that the transform has no shear and no unequal scaling.

### Requirement 3: Visibility check

**User Story:** As a player, I want large maps to draw fast and completely, so that nothing on the screen is missing and nothing off the screen costs time.

#### Acceptance Criteria

1. WHEN a View is drawn, THE Views SHALL compute the Visible_Region of that View from its Camera and SHALL compute the Visible_Set of items that overlap the Visible_Region.
2. THE Views SHALL draw only the items of the Visible_Set, so that an item entirely outside the Visible_Region costs no drawing call.
3. THE Views SHALL widen the Visible_Region by a margin in world units that is at least the largest Road width, the Route_Line width converted to world units by dividing its pixel width by Zoom, and the largest Block_Height of the Raised_Blocks, so that no partly visible item is left out.
4. FOR ALL generated Maps and Cameras, every Road, Blocked_Area, Prop, Place and Route part whose drawn extent overlaps the Viewport by at least 0 CSS pixels SHALL be in the Visible_Set (nothing-visible-is-left-out property).
5. FOR ALL generated Maps and Cameras that show the whole Map extent, THE Visible_Set SHALL hold every Road of the Map.
6. FOR ALL generated Maps and Cameras, THE Visible_Set SHALL equal the result of a plain test-code check of every item against the Visible_Region, within the same margin (model property).
7. WHEN the Map holds 5,000 Roads and the Camera shows a region that contains at most 5% of the Roads, THE Views SHALL compute the Visible_Set by testing at most 25% of the Roads, by using a spatial index built once when the Map is set.
8. IF the Map set on a View holds no Roads, THEN THE Views SHALL draw the ground, Blocked_Areas, Props and Places, SHALL draw no Route_Line, and SHALL report a Notice that states that the map has no roads.
9. IF the Map set on a View holds no Roads, no Blocked_Areas, no Props and no Places, THEN THE Views SHALL draw the ground only and SHALL report a Notice that states that the map is empty.
10. IF the Map set on a View holds Roads and none of them is a Usable_Road, THEN THE Views SHALL draw the Roads as Blocked_Roads and SHALL report a Notice that states that the map has no usable road.
11. IF a Map is set that holds a Road, Place, Prop or Blocked_Area with a coordinate that is not finite, THEN THE Views SHALL return a View_Error that names the kind of item and its identifier, and SHALL keep the previous Map.

### Requirement 4: Style and default look

**User Story:** As a map maker, I want my map's colours and line styles used, and a good look when I set none, so that every map looks fine at once.

#### Acceptance Criteria

1. WHEN a Map is set on a View, THE Views SHALL build the Resolved_Style by filling every missing Style key from the Default_Style.
2. THE Views SHALL read every colour and line style they draw from the Resolved_Style, so that no colour is fixed in a drawing function.
3. THE Default_Style SHALL define a colour and a line style for each Road kind, the road outline, the ground, each Blocked_Area kind, Props, Raised_Blocks, the Route_Line, the Player_Marker, the Destination_Marker, Place_Labels and the label background.
4. IF a Style colour value is not a colour string the Canvas_Adapter can use, THEN THE Views SHALL use the Default_Style value for that key and SHALL report a Notice in plain words that names the key.
5. THE Default_Style SHALL give Place_Label text and the label background a contrast ratio of at least 4.5 to 1.
6. THE Default_Style SHALL give the Route_Line a contrast ratio of at least 3 to 1 against every Road kind colour and against the ground colour.
7. THE Default_Suite SHALL test the contrast ratios of criteria 5 and 6 with a contrast function written in test code, using the WCAG relative luminance formula.
8. IF a Style line width is not finite or lies outside 0 to 100 CSS pixels, or a dash length is not finite or lies outside 0 to 1000 CSS pixels, THEN THE Views SHALL use the Default_Style value for that key and SHALL report a Notice in plain words that names the key and the allowed range.

### Requirement 5: Roads that look finished

**User Story:** As a player, I want roads that look like roads, so that the map reads at a glance.

#### Acceptance Criteria

1. THE Views SHALL draw each Usable_Road as a stroke with the Road width in world units, with an outline stroke drawn below the stroke that is wider by the outline width of the Resolved_Style, with round line joins and round line caps.
2. THE Views SHALL draw all outlines of the visible Roads before the fills of the visible Roads, so that two Roads that meet show no outline across the join.
3. THE Views SHALL tell Road kinds apart by both width and colour, using the Road width of the Map and the colour of the Road kind in the Resolved_Style.
4. WHERE the Resolved_Style sets a dash line style for a Road kind, THE Views SHALL draw that Road kind with the dash pattern.
5. WHILE the Road width multiplied by Zoom is less than 1 CSS pixel, THE Views SHALL draw that Road 1 CSS pixel wide so that the Road stays visible.
6. WHILE the Road width multiplied by Zoom is less than 2 CSS pixels for a footpath or corridor Road, THE Views SHALL skip the outline of that Road and SHALL still draw the fill.
7. THE Views SHALL mark a one-way Road with arrowheads along its centre line that point in the travel direction, spaced at least 40 CSS pixels apart on the screen.
8. THE Views SHALL draw a Blocked_Road with the blocked colour of the Resolved_Style and a dash pattern, so that a Blocked_Road is told apart from a Usable_Road without relying on colour alone.
9. IF a Road has a width that is not finite or not greater than 0 world units, THEN THE Views SHALL draw no stroke for that Road and SHALL report a Notice that names the Road identifier and states that the width must be greater than 0.

### Requirement 6: Blocked areas, props and layer order

**User Story:** As a player, I want ground, areas and decorations in a stable layer order, so that nothing hides something it should not.

#### Acceptance Criteria

1. THE Views SHALL draw the layers of the Full_Map and the Minimap in this order: ground, Blocked_Areas, flat Props, Road outlines, Road fills, Blocked_Road marks, Route_Line, Destination_Marker, Place markers, Place_Labels, Player_Marker.
2. THE Views SHALL draw each Blocked_Area as a filled polygon with the colour of its kind in the Resolved_Style and an outline.
3. THE Views SHALL draw each Prop at its position, with its width, height and rotation in degrees, as a plain shape that is chosen by the Prop kind, and SHALL draw an unknown Prop kind as a rectangle.
4. THE Views SHALL use no Prop in any decision about routes or guidance.
5. FOR ALL generated Maps, THE ordered calls on the Recording_Canvas SHALL show every item of a later layer after every item of an earlier layer in the same View (layer-order property).
6. IF a Blocked_Area polygon has fewer than 3 points, THEN THE Views SHALL draw no shape for that Blocked_Area and SHALL report a Notice that names the Blocked_Area identifier and states that a polygon needs at least 3 points.
7. IF a Prop has a width or height that is not finite or not greater than 0 world units, or a rotation that is not finite, THEN THE Views SHALL draw no shape for that Prop and SHALL report a Notice that names the Prop identifier and the invalid value.

### Requirement 7: Route line, player and destination

**User Story:** As a player, I want a clear route line, my own position and the goal marked, so that I can see where to go.

#### Acceptance Criteria

1. WHILE a Route is active, THE Views SHALL draw the Route_Line along the remaining Route only, so that the travelled part is not drawn.
2. THE Views SHALL draw the Route_Line with an outline stroke below it and a fill stroke above it, with round joins and round caps, and with a width that stays between 4 and 12 CSS pixels at every Zoom.
3. WHILE no Route is active, THE Views SHALL draw no Route_Line.
4. THE Views SHALL draw the Player_Marker at the Position with a pointer that shows the heading.
5. WHILE a Route is active, THE Views SHALL draw the Destination_Marker at the Snapped_Point of the Destination, and WHILE no Route is active, THE Views SHALL draw no Destination_Marker.
6. WHEN the Engine holds a No_Way_Result, THE Views SHALL expose the plain-worded message of the No_Way_Result to the caller and SHALL draw no Route_Line.
7. THE Views SHALL draw the Player_Marker with a size between 10 and 24 CSS pixels across at every Zoom.
8. FOR ALL generated Maps and Routes, THE points of the Route_Line drawn on the Recording_Canvas, converted back with Screen_To_World, SHALL lie on the remaining Route within 0.01 world units (route-line property).
9. IF the Position given to a View has an x or y that is not finite, or a coordinate of absolute value above 1,000,000 world units, or a heading that is not finite, THEN THE Views SHALL return a View_Error that names the Position and the allowed range (finite coordinates of absolute value at most 1,000,000 world units, finite heading in degrees), SHALL keep the previous Position, and SHALL draw the Player_Marker at the previous Position.
10. IF the Route handed to a View holds a point that is not finite, THEN THE Views SHALL draw no Route_Line and SHALL report a Notice that states that the route could not be drawn.

### Requirement 8: Place names

**User Story:** As a player, I want readable place names that do not pile up, so that I can find where to go.

#### Acceptance Criteria

1. THE Views SHALL draw a marker and a Place_Label for each Place chosen by the Label_Placement.
2. THE Label_Placement SHALL take the screen position and the measured size of each candidate Place_Label and SHALL return the list of Place_Labels to draw with the screen rectangle of each.
3. THE Label_Placement SHALL give priority to the Destination Place, then to the Place nearest to the player's Position, then to the remaining Places in order of identifier.
4. THE Label_Placement SHALL leave out a Place_Label whose rectangle lies within 4 CSS pixels of the rectangle of a Place_Label of higher priority that is already placed.
5. THE Label_Placement SHALL return the same result for the same input.
6. THE Views SHALL draw each Place_Label with a background of the label background colour and text of the label colour, in a font size between 11 and 16 CSS pixels at every Zoom.
7. WHILE a Place_Label would lie partly outside the Viewport, THE Label_Placement SHALL move the rectangle inside the Viewport when the rectangle fits, and SHALL leave the label out when the rectangle does not fit.
8. FOR ALL generated sets of Places and measured sizes, no two Place_Labels returned by the Label_Placement SHALL lie within 4 CSS pixels of each other (labels-do-not-overlap property, gap tolerance 0 CSS pixels below 4).
9. FOR ALL generated sets of Places, THE Destination Place SHALL be among the Place_Labels returned when its marker lies inside the Viewport and its label fits inside the Viewport.
10. IF a candidate Place_Label has a screen position or a measured width or height that is not finite, or a width or height not greater than 0 CSS pixels, THEN THE Label_Placement SHALL leave that Place_Label out and SHALL report a Notice that names the Place identifier.
11. IF a Place name is empty, THEN THE Views SHALL draw the marker of the Place without a Place_Label and SHALL report a Notice that names the Place identifier.

### Requirement 9: Minimap

**User Story:** As a player, I want a round minimap that turns with me, so that up on the minimap is always where I am heading.

#### Acceptance Criteria

1. THE Minimap SHALL draw the Map clipped to a circle that fits inside its Viewport, with a rim of the rim colour of the Resolved_Style.
2. THE Minimap SHALL keep the Player_Marker at the centre of the Viewport.
3. THE Minimap SHALL rotate the Map so that the player's heading points up the screen, for every finite heading.
4. THE Minimap SHALL draw the North_Mark on the rim at the screen direction of world north, and SHALL rotate the North_Mark with the Map.
5. THE Minimap SHALL show a Zoom between a minimum and a maximum that the caller can set, each in the range 0.001 to 1000 CSS pixels per world unit with the minimum below the maximum, with the defaults 0.5 and 4, and SHALL change the Zoom by the caller's call without moving the Player_Marker.
6. WHEN the Position is fed, THE Minimap SHALL follow the Position with Smoothing of the world centre and of the rotation, and SHALL take the shortest turn between two headings.
7. FOR ALL generated Positions with coordinates of absolute value at most 1,000,000 world units and headings from -360 to 360 degrees, World_To_Screen of the Minimap Camera SHALL map the player's world point to the centre of the Viewport within 0.001 CSS pixels, and a point one world unit ahead of the player along the heading SHALL map to a screen point directly above the centre, with a horizontal difference of at most 0.001 CSS pixels (player-centred-heading-up property).
8. FOR ALL generated Cameras of the Minimap, THE North_Mark direction SHALL equal the screen direction of the world vector (0, -1) within 0.001 degrees.
9. IF the caller sets a minimum or maximum Zoom that is not finite, lies outside 0.001 to 1000, or has a minimum that is not below the maximum, THEN THE Minimap SHALL return a plain-worded View_Error that names the value and the allowed range and SHALL keep the previous limits.
10. IF the caller sets a Zoom outside the current minimum and maximum, THEN THE Minimap SHALL return a plain-worded View_Error that names the Zoom and the current limits and SHALL keep the previous Zoom.
11. IF the Viewport of the Minimap is smaller than 40 CSS pixels in width or height, THEN THE Minimap SHALL draw no circle and SHALL report a Notice that states that the minimap needs at least 40 by 40 CSS pixels.

### Requirement 10: Full map pan and zoom

**User Story:** As a player, I want to pan and zoom the full map, so that I can look at any part of it.

#### Acceptance Criteria

1. WHEN the pan input moves by a screen distance, THE Full_Map SHALL move the world centre so that the world point under the pointer at the start of the move stays under the pointer within 0.001 CSS pixels.
2. WHEN a zoom input is applied at a screen anchor point inside the Viewport, THE Full_Map SHALL change the Zoom so that the world point under the anchor point before the change is under the anchor point after the change within 0.001 CSS pixels.
3. THE Full_Map SHALL keep the Zoom between a minimum and a maximum, each in the range 0.001 to 1000 CSS pixels per world unit, with the defaults of the Zoom that fits the whole Map in the Viewport and 8 CSS pixels per world unit.
4. THE Full_Map SHALL keep at least 20% of the Map extent width and at least 20% of the Map extent height inside the Viewport when panning, so that the Map cannot be panned out of sight.
5. WHEN the fit command is given, THE Full_Map SHALL set the Camera so that the whole Map extent, with a margin of 5% of the Viewport width and height on every side, is inside the Viewport.
6. WHEN the follow command is given, THE Full_Map SHALL centre the Camera on the player and SHALL keep following until the next pan input.
7. THE Full_Map SHALL keep the rotation of the Camera at exactly 0 degrees so that world north is up the screen.
8. FOR ALL generated Cameras, anchor points inside the Viewport and zoom factors from 0.1 to 10, THE world point under the anchor point SHALL be the same before and after the zoom within 0.001 world units when the resulting Zoom lies inside the limits (zoom-anchor property).
9. IF a zoom factor, an anchor point or a pan distance is not finite, or a zoom factor is not greater than 0, THEN THE Full_Map SHALL return a plain-worded View_Error that names the input and its allowed range and SHALL keep the Camera unchanged.
10. IF a zoom input would take the Zoom outside the minimum and maximum, THEN THE Full_Map SHALL set the Zoom to the nearest limit and SHALL report a Notice that states that the zoom limit is reached.
11. IF the Map extent has a width or a height of 0 world units, THEN THE Full_Map SHALL use a Map extent of at least 1 world unit in that direction for the fit command and for the pan limit.
12. IF the Map holds no item that has an extent, THEN THE Full_Map SHALL return a plain-worded View_Error that states that the map is empty and that there is nothing to fit, and SHALL keep the Camera unchanged.

### Requirement 11: Setting a destination by click or tap

**User Story:** As a player, I want to click a place or a spot on the map to set my destination, so that I get a route at once.

#### Acceptance Criteria

1. WHEN a click or tap on the Full_Map is released within 6 CSS pixels and 500 ms of where the click or tap began, THE Full_Map SHALL treat the release as a selection and not as a pan.
2. WHEN a selection lies within 20 CSS pixels of the marker of a Place, THE Hit_Test SHALL return that Place, and THE Full_Map SHALL set the Destination to that Place identifier through the Engine_API.
3. WHEN two or more Place markers lie within 20 CSS pixels of the selection, THE Hit_Test SHALL return the Place whose marker is nearest, and SHALL return the Place with the lowest identifier when the distances differ by less than 0.001 CSS pixels.
4. WHEN a selection lies within 20 CSS pixels of no Place marker, THE Full_Map SHALL convert the screen point to a world point with Screen_To_World and SHALL set the Destination to that world point through the Engine_API, which snaps the world point to the nearest Usable_Road.
5. WHEN the Engine_API returns a No_Way_Result, THE Full_Map SHALL leave the Route cleared as the Engine reports it and SHALL show the plain-worded message of the No_Way_Result to the caller.
6. THE Full_Map SHALL send the Destination to the Engine_API and SHALL compute no route itself.
7. WHERE the caller gives a selection handler, THE Full_Map SHALL call the handler with the selection result instead of setting the Destination itself.
8. FOR ALL generated Maps with at least one Usable_Road and screen points inside the Viewport, THE point returned by converting a selection with Screen_To_World and then snapping the world point SHALL lie on a Usable_Road within 0.001 world units (click-lands-on-a-road property).
9. FOR ALL generated sets of Places and screen points, THE Hit_Test SHALL return the Place nearest to the screen point among the Places within 20 CSS pixels, and SHALL return no Place when none is within 20 CSS pixels (hit-test property, distance tolerance 0.001 CSS pixels).
10. IF a selection has an x or y that is not finite or lies outside the Viewport, THEN THE Full_Map SHALL ignore the selection, SHALL set no Destination, and SHALL return a plain-worded View_Error that states that the selection is outside the map view and contains no coordinates.
11. IF the Map holds no Usable_Road when a selection is made, THEN THE Full_Map SHALL set no Destination and SHALL return a plain-worded View_Error that states that the map has no usable road.
12. IF the selection is more than 100 world units or more than 200 CSS pixels from the nearest Usable_Road, whichever is smaller in world units, THEN THE Full_Map SHALL set no Destination and SHALL return a plain-worded View_Error that states that the selected spot is too far from any road.

### Requirement 12: Tilted view

**User Story:** As a player, I want a tilted view where buildings stand up, so that I get a sense of the place as I move.

#### Acceptance Criteria

1. THE Tilted_View SHALL keep the Player_Marker at a fixed screen point in the lower half of the Viewport and SHALL rotate the Map so that the player's heading points up the screen.
2. THE Tilted_View SHALL project world points to the screen with the Tilt_Angle, so that a ground distance along the viewing direction is shortened by multiplying with the sine of the Tilt_Angle and a height is lifted up the screen by the height multiplied by the cosine of the Tilt_Angle.
3. THE Tilted_View SHALL draw each Prop whose kind is in the Raised_Kinds as a Raised_Block with its ground footprint, side faces and top face, using the Block_Height.
4. THE Tilted_View SHALL draw the side faces of a Raised_Block in a darker shade of the Raised_Block colour than the top face, so that the faces are told apart without relying on outlines alone.
5. THE Tilted_View SHALL draw ground items, Blocked_Areas, Roads, the Route_Line and the Destination_Marker on the ground plane, below every Raised_Block that lies nearer to the viewer than the ground item.
6. THE Tilted_View SHALL draw Raised_Blocks and upright Place_Labels in Depth_Order, so that a Raised_Block that is nearer to the viewer is drawn after a Raised_Block that is farther away.
7. WHEN two Raised_Blocks have a depth that differs by less than 0.001 world units, THE Tilted_View SHALL draw the one with the lower Prop identifier first.
8. WHERE the caller sets a Tilt_Angle from 20 to 70 degrees, THE Tilted_View SHALL use the supplied angle and not the default of 45 degrees.
9. IF the caller sets a Tilt_Angle that is not finite or lies outside the range from 20 to 70 degrees, THEN THE Tilted_View SHALL return a plain-worded View_Error that names the Tilt_Angle and the allowed range and SHALL keep the previous angle.
10. THE Tilted_View SHALL use the Visible_Set of Requirement 3, with a Visible_Region widened by the largest Block_Height so that a block whose base is outside the Viewport but whose top is inside is drawn.
11. FOR ALL generated Maps, Cameras and Positions, THE Raised_Blocks drawn on the Recording_Canvas SHALL appear in an order in which no Raised_Block is drawn before a Raised_Block that is farther from the viewer by more than 0.001 world units (nearer-after-farther property).
12. FOR ALL generated Maps and Cameras, with Tilt_Angle from 20 to 70 degrees, THE tilted projection of a ground point at height 0 SHALL map back to the same ground point with the inverse projection within 0.001 world units (tilt round-trip property).
13. IF the caller sets a height factor that is not finite or lies outside the range 0 to 100, THEN THE Tilted_View SHALL return a plain-worded View_Error that names the Prop kind and the allowed range and SHALL keep the previous height factor.
14. IF a Raised_Block has a height that is not finite or is less than 0 world units, THEN THE Tilted_View SHALL draw that Prop flat on the ground and SHALL report a Notice that names the Prop identifier and the invalid height.

### Requirement 13: Smooth movement and reduced motion

**User Story:** As a player, I want the camera to move smoothly, and as a person who dislikes motion I want it to move only as much as I allow.

#### Acceptance Criteria

1. WHEN a new Position is fed, THE Views SHALL move each Camera towards the new target over Smoothing steps that depend on the time elapsed since the last frame in ms and not on the frame count.
2. THE Smoothing SHALL reach 95% of a Camera change within 300 ms by default, and a caller-set duration SHALL lie in the range 1 to 5000 ms.
3. WHEN the caller sets a Camera target, THE Smoothing SHALL end exactly at the target and SHALL NOT overshoot the target by more than 0 units.
4. WHILE Reduced_Motion is set, THE Views SHALL set each Camera to its target in one step, with no Smoothing and no animated zoom.
5. WHILE Reduced_Motion is set, THE Views SHALL draw no animation that is not a direct result of a person's input, including no pulsing of the Destination_Marker.
6. WHEN the Reduced_Motion setting changes while a View is mounted, THE Views SHALL use the new setting from the next frame.
7. THE Views SHALL take the time for Smoothing from the timestamps in ms supplied by the caller and SHALL NOT read the system clock in the pure logic, so that Smoothing is repeatable in tests.
8. FOR ALL generated target values and frame time sequences with frame intervals from 1 to 1000 ms, THE Smoothing SHALL give a sequence of Camera values that moves monotonically towards the target without overshoot (smoothing property, tolerance 0 units).
9. FOR ALL generated finite headings, THE Smoothing of the rotation SHALL take the turn of at most 180 degrees between the current and the target heading.
10. IF a timestamp is not finite, THEN THE Views SHALL return a plain-worded View_Error that names the timestamp and states that it must be a finite number of ms, and SHALL keep the Camera unchanged.
11. IF a timestamp is earlier than the previous timestamp, THEN THE Views SHALL treat the frame interval as 0 ms and SHALL report a Notice that states that time went backwards.
12. IF a frame interval is longer than 1000 ms, THEN THE Views SHALL use a frame interval of 1000 ms for Smoothing.
13. IF the caller sets a Smoothing duration that is not finite or lies outside 1 to 5000 ms, THEN THE Views SHALL return a plain-worded View_Error that names the duration and the allowed range and SHALL keep the previous duration.

### Requirement 14: Sharp on high-density screens

**User Story:** As a player on a high-density screen, I want crisp lines and text, so that the views do not look blurred.

#### Acceptance Criteria

1. WHEN a View is mounted on a canvas, THE Canvas_Adapter SHALL set the pixel size of the canvas to the CSS size multiplied by the Device_Pixel_Ratio, rounded to whole pixels.
2. THE Canvas_Adapter SHALL scale the drawing context by the Device_Pixel_Ratio, so that the Views draw in CSS pixels.
3. WHEN the CSS size of the canvas or the Device_Pixel_Ratio changes, THE Canvas_Adapter SHALL update the pixel size and the scale before the next frame.
4. THE Views SHALL draw a frame only when the Camera, the Position, the Route, the Style or the Viewport has changed since the last frame.
5. THE Canvas_Adapter SHALL limit the Device_Pixel_Ratio it uses to at most 3.
6. IF the Device_Pixel_Ratio is not finite or lies outside 0.5 to 8, THEN THE Canvas_Adapter SHALL use a Device_Pixel_Ratio of 1 and SHALL report a Notice that names the value and the allowed range.
7. IF the CSS size of the canvas has a width or height that is not finite or lies outside 1 to 16384 CSS pixels, THEN THE Canvas_Adapter SHALL keep the previous pixel size, SHALL draw no frame, and SHALL return a plain-worded View_Error that names the size and the allowed range.
8. IF the canvas pixel size (CSS size multiplied by the Device_Pixel_Ratio used) would exceed 16384 pixels in width or height, THEN THE Canvas_Adapter SHALL lower the Device_Pixel_Ratio used until both sides are at most 16384 pixels and SHALL report a Notice that states the lowered ratio.

### Requirement 15: Input by mouse, touch and keyboard

**User Story:** As a player, I want to use mouse, touch or keyboard on every view, so that nothing needs a device I do not have.

#### Acceptance Criteria

1. WHEN the mouse wheel turns over the Full_Map, THE Full_Map SHALL zoom at the pointer position by a factor from 0.5 to 2 per wheel step.
2. WHEN the mouse is dragged over the Full_Map, THE Full_Map SHALL pan.
3. WHEN one finger is dragged over the Full_Map, THE Full_Map SHALL pan.
4. WHEN two fingers move apart or together over the Full_Map, THE Full_Map SHALL zoom about the midpoint of the two fingers by the ratio of the finger distances.
5. WHILE the Full_Map canvas has keyboard focus, THE Full_Map SHALL pan by 10% of the Viewport width or height for each arrow key press, zoom in by a factor of 1.25 for the plus key, zoom out by a factor of 0.8 for the minus key, fit the Map for the Home key, and follow the player for the F key.
6. WHILE the Full_Map canvas has keyboard focus, THE Full_Map SHALL step to the next Place in order of identifier for the right square bracket key and to the previous Place for the left square bracket key, SHALL mark the Place with a visible focus ring, and SHALL set the Destination to the marked Place for the Enter key.
7. THE Views SHALL give each canvas a keyboard focus indicator that is visible and has a contrast ratio of at least 3 to 1 against the page background.
8. THE Views SHALL give each canvas an accessible name and a text description that states which view it is and which keys it uses.
9. THE Views SHALL provide a text alternative of the current Guidance sentence in an element with `aria-live` set to polite, so that the guidance is available to a screen reader.
10. THE input handling SHALL prevent the browser from scrolling the page and from zooming the page while a pointer or finger gesture is on the Full_Map canvas.
11. THE pure part of the input handling, which turns a sequence of pointer events into pan, zoom and selection commands, SHALL run in Node and SHALL be tested without a browser.
12. FOR ALL generated sequences of drag events with coordinates within 100,000 CSS pixels, THE sum of the pan commands SHALL equal the screen distance between the first and the last event within 0.001 CSS pixels (pan property).
13. IF a pointer event has an x or y that is not finite, or a timestamp that is not finite, THEN THE input handling SHALL ignore that event, SHALL issue no command for that event, and SHALL report a Notice that states that an invalid pointer event was ignored.
14. IF a pinch gesture has a distance between the two fingers of less than 1 CSS pixel, THEN THE Full_Map SHALL issue no zoom command for that step.
15. IF a key is pressed that the Full_Map does not use, THEN THE Full_Map SHALL leave the Camera and the Destination unchanged and SHALL let the browser handle the key.
16. IF the Enter key is pressed while no Place is marked, THEN THE Full_Map SHALL set no Destination and SHALL announce in the `aria-live` element that no place is selected.
17. IF the Map holds no Place when the right or left square bracket key is pressed, THEN THE Full_Map SHALL mark no Place and SHALL announce in the `aria-live` element that the map has no places.

### Requirement 16: Small screens

**User Story:** As a player on a phone, I want the views to work at 375 px width, so that I can use them on a small screen.

#### Acceptance Criteria

1. WHILE the viewport of the page is 375 CSS pixels wide, THE Demo_Page SHALL show all content without horizontal scrolling.
2. WHILE the viewport of the page is 375 CSS pixels wide, THE Demo_Page SHALL stack the three Views in one column and keep each canvas between 300 and 375 CSS pixels wide.
3. THE Views SHALL resize to the CSS size of their canvas, and SHALL keep the Camera centre when the size changes.
4. THE Demo_Page SHALL give every button and control a touch target of at least 44 by 44 CSS pixels.
5. THE Demo_Page SHALL give the controls a visible keyboard focus indicator and a text label.
6. THE Gate of Requirement 20 SHALL verify criteria 1 and 2 on the Demo_Page at a viewport 375 CSS pixels wide.
7. IF the CSS size of a canvas changes to a width or height outside 1 to 16384 CSS pixels, THEN THE Views SHALL keep the previous size and SHALL return a plain-worded View_Error that names the size and the allowed range.

### Requirement 17: Demo page

**User Story:** As a reviewer, I want a bare demo page that shows the three views together, so that I can try the views myself.

#### Acceptance Criteria

1. THE Demo_Page SHALL be a Vite page in `kit/demo/` that imports the Engine and the Views from the Engine package and adds no runtime dependency.
2. THE Demo_Page SHALL include the Town_Map as a hand-written map file that holds at least 12 Nodes, at least 3 Road kinds, at least 6 Places, at least one one-way Road, at least one Blocked_Area, and at least 6 Props of which at least 3 have kinds in the Raised_Kinds.
3. THE Demo_Page SHALL include a choice between the Town_Map and the Large_Generated_Map, using the generator of the engine-core spec with a fixed seed.
4. WHILE the viewport of the page is at least 1200 CSS pixels wide, THE Demo_Page SHALL show the Minimap, the Full_Map and the Tilted_View side by side.
5. THE Demo_Page SHALL show a dot, the player, that moves with the arrow keys while no Views canvas has keyboard focus, and SHALL feed the Position of the dot and a timestamp in ms to the Engine each frame.
6. THE Demo_Page SHALL move the dot at a speed from 1 to 200 world units per second that the page sets (default 30), and SHALL set the heading of the dot to the direction of the latest movement.
7. WHEN a person clicks or taps the Full_Map, THE Demo_Page SHALL set the Destination as Requirement 11 states.
8. THE Demo_Page SHALL show the Guidance sentence, the distance left in world units, and the plain-worded No_Way_Result message when there is one.
9. THE Demo_Page SHALL show the number of Roads of the loaded Map and the Notices of the Blocked_Roads.
10. THE Demo_Page SHALL use no real-world map data and SHALL name no existing game or product.
11. THE Demo_Page SHALL show a place on the page that states in plain words that the page is a demonstration of the Views and not an application.
12. IF the Demo_Page fails to load a map, THEN THE Demo_Page SHALL show the plain-worded errors of the Map_Loader and SHALL keep the previous Map in use.
13. IF the speed set on the Demo_Page is not finite or lies outside 1 to 200 world units per second, THEN THE Demo_Page SHALL keep the previous speed and SHALL show a plain-worded message that names the speed and the allowed range.
14. IF the dot would leave the Map extent widened by 50 world units on every side, THEN THE Demo_Page SHALL stop the dot at that boundary and SHALL show a plain-worded message that the player is at the edge of the map.
15. IF a loaded map has no Usable_Road, THEN THE Demo_Page SHALL show the plain-worded Notice of the Views and SHALL show no Route_Line.

### Requirement 18: Measured frame time

**User Story:** As a reviewer, I want frame times measured in a real browser and reported, so that speed claims rest on numbers.

#### Acceptance Criteria

1. THE Views SHALL include a Frame_Benchmark that is a Playwright command, separate from the Default_Suite.
2. WHEN the Frame_Benchmark runs, THE Frame_Benchmark SHALL load the Large_Generated_Map on the Demo_Page, move the player along a fixed seeded path for at least 300 frames, and measure the Frame_Time of the Minimap, the Full_Map and the Tilted_View separately.
3. WHEN the Frame_Benchmark runs, THE Frame_Benchmark SHALL measure the Full_Map at the Zoom that fits the whole Map and at a Zoom of 4 CSS pixels per world unit, so that the whole-map case and the zoomed case are both reported.
4. WHEN the Frame_Benchmark runs, THE Frame_Benchmark SHALL print for each View the median, the 95th percentile and the maximum of the draw time and of the interval between animation frames, in ms with 2 decimal places.
5. WHEN the Frame_Benchmark runs, THE Frame_Benchmark SHALL print the browser name and version, the Node version, the viewport size in CSS pixels, the Device_Pixel_Ratio and the machine description.
6. THE Frame_Benchmark SHALL report the measured numbers and SHALL set no pass or fail threshold that the numbers are compared against.
7. THE checkpoint report for Block B SHALL include the printed Frame_Benchmark numbers and the route times of the engine-core benchmark.
8. THE Frame_Benchmark SHALL fail only when the browser, the page or the measurement fails to run, and SHALL then print a plain-worded reason.
9. IF fewer than 300 frames were measured for a View, THEN THE Frame_Benchmark SHALL fail with a plain-worded reason that states the number of frames measured and the number required.
10. IF a measured time is not finite or is negative, THEN THE Frame_Benchmark SHALL fail with a plain-worded reason that names the View and the measurement.

### Requirement 19: Package, tests and quality rules

**User Story:** As a reviewer, I want a fast and honest test suite for the views, so that I can rerun it at the checkpoint and trust it.

#### Acceptance Criteria

1. THE Views SHALL compile with the TypeScript strict option enabled and no compile error.
2. THE Default_Suite SHALL complete in under 60 seconds on the development machine, including the tests of the engine core.
3. THE Default_Suite SHALL contain one property-based test, written with Vitest and fast-check, for each of the following properties: transform round trip, nothing-visible-is-left-out, layer order, route line on the remaining Route, labels do not overlap, player centred and heading up on the Minimap, North_Mark direction, zoom anchor, click lands on a Usable_Road, hit test, nearer after farther in the Tilted_View, tilt round trip, smoothing without overshoot, and pan sum.
4. THE Default_Suite SHALL run each property-based test with at least 100 generated cases.
5. THE Default_Suite SHALL contain no skipped test, no test with a raised time limit, and no loosened threshold to make a test pass.
6. IF a property cannot be made to pass, THEN THE checkpoint report SHALL state the failing property and its counterexample and SHALL NOT weaken the test.
7. WHEN a property-based test fails, THE Default_Suite SHALL print the seed and the shrunk counterexample so that the failure can be repeated.
8. THE Default_Suite SHALL include example-based tests that draw the Town_Map on the Recording_Canvas in each View and check the presence of roads, Blocked_Areas, Props, the Route_Line, the Player_Marker, the Destination_Marker and Place_Labels.
9. THE Default_Suite SHALL include an example-based test with a Style that sets only some keys, in which the unset keys use the Default_Style.
10. THE Views SHALL contain no reference to cars, missions, hospitals, rooms or any other application concept.
11. THE Views SHALL use no real-world map data, no AI model at run time, and no name of an existing game or product.
12. THE Views SHALL leave the Engine behaviour of the engine-core spec unchanged, and THE Default_Suite of the engine core SHALL still pass without any test being edited to make the test pass.
13. WHERE the Views need an Engine_API function that the Engine lacks, THE Engine SHALL provide the function with a documented entry in `kit/engine/docs/api.md` and with a test, and THE Views SHALL use the function through the Engine_API.
14. THE Views SHALL document each exported function and type with a description, its inputs with their units and allowed ranges, its outputs, its View_Errors and one usage example, in a file inside `kit/engine/docs/`.
15. THE Default_Suite SHALL include an example-based test for each View_Error and each Notice named in Requirements 1 to 18, which checks that the message is plain-worded, names the input, and contains no coordinates where a requirement says so.
16. THE Default_Suite SHALL include, for each numeric input with an allowed range, example-based tests at the lower bound, at the upper bound, just below the lower bound, just above the upper bound, and with NaN, positive infinity and negative infinity.

### Requirement 20: Gate on the large map

**User Story:** As a reviewer, I want to see that the views work as a person uses them on the 5,000-road map, so that the project only continues when the views are good enough.

#### Acceptance Criteria

1. WHEN the Large_Generated_Map is loaded on the Demo_Page, THE Gate SHALL check that a person can click a Place on the Full_Map and see the Route_Line from the player to that Place on the three Views.
2. WHEN the player moves along the Route on the Large_Generated_Map, THE Gate SHALL check that the travelled part of the Route_Line disappears and that no new Route is requested.
3. WHEN the player leaves the Route on the Large_Generated_Map for longer than the Reroute_Delay and further than the Reroute_Margin, THE Gate SHALL check that a new Route is drawn from the player's Position to the same Destination.
4. THE Gate SHALL check smoothness by reporting, for the three Views during the steps of criteria 1 to 3, the number of frames whose interval between animation frames is longer than 50 ms, together with the Frame_Benchmark numbers, and SHALL set no pass or fail threshold on those numbers.
5. THE Gate SHALL be a Playwright check, separate from the Default_Suite, that drives the Demo_Page with mouse and keyboard input, so that the Gate runs the steps of criteria 1 to 3 without a person.
6. THE Gate SHALL include the same steps at a viewport 375 CSS pixels wide with touch input.
7. THE Gate task SHALL be the last task of the spec, and SHALL be done by a person who also tries the steps of criteria 1 to 3 by hand on the Demo_Page.
8. IF the steps of criteria 1 to 3 do not work on the Large_Generated_Map, THEN THE checkpoint report SHALL say plainly that the Gate failed and SHALL name the step that failed, and the project SHALL stop there.
9. IF the Demo_Page does not load the Large_Generated_Map within 30 seconds, THEN THE Gate SHALL fail with a plain-worded reason that states that the map did not load and the time waited.
10. IF the click in criterion 1 yields a No_Way_Result, THEN THE Gate SHALL report the plain-worded message of the No_Way_Result and SHALL record the step as failed.
