# Cartomancer: project brief for Kiro

Second entry of our team for Kiroween 2026 (Devpost), category **Skeleton Crew**. Deadline
2026-12-04 2:00 PM Pacific. This brief is the starting point: turn it into specs under `.kiro/specs/`
and build from those. Where the brief and a rule of the hackathon disagree, the rule wins.
"Cartomancer" is a working name.

## What it is, in one sentence

A starter kit for maps with built-in navigation: you draw a map in the browser (roads, buildings,
named places, blocked areas), and it gets a minimap, a route to any place you click, and a new route
the moment you leave the old one. No server, no account, no AI model at run time, no real-world map
data.

Skeleton Crew asks for one lean skeleton and two different applications built from it, in separate
folders. That is the shape of this repository:

```
kit/engine/          the map engine (route finding, guidance, map views); no runtime dependency
kit/maker/           the map maker (a browser page that writes the map file)
kit/starter/         starter pieces: buildings, trees, water, road styles, markers
kit/.kiro/           steering, hooks and a spec template that ship with the kit
apps/city-run/       application 1: a small driving game
apps/room-finder/    application 2: an indoor guide for a building
site/                landing page that links the maker and both applications (static)
.kiro/               specs, steering, hooks for this repository (never git-ignored)
```

## Stack

TypeScript (strict), Vite, Canvas 2D, Vitest with fast-check, Playwright for browser checks.
`kit/engine/` has no runtime dependency and its logic (everything except drawing) runs in Node, so
it can be tested without a browser. Everything is static files; hosting is GitHub Pages or the like.
MIT licence, `LICENSE` at the root so GitHub shows it in About.

## The map file

One JSON file holds a whole map. It carries a format version and:

- **nodes and roads:** a graph. A road joins two nodes and has a width, a kind (for example main,
  side, footpath, corridor) and may be one-way;
- **places:** a name, a category and a position ("Bank", "Room 214");
- **blocked areas:** polygons with a kind (mountain, water, wall). A road that crosses a blocked
  area cannot be used; the engine leaves it out and says so, and the maker shows it in red;
- **props:** a kind from the starter set or an uploaded picture, with position, size and rotation;
  decoration only;
- **background picture** (optional): for tracing a floor plan, with scale and opacity;
- **style:** colours and line styles.

Loading a file that does not fit the format is an error with a plain message naming the problem;
never a half-loaded map.

## The engine

Knows a map, a position with a heading, and a destination. Knows nothing about cars, missions,
hospitals or rooms.

1. **Route finding.** Shortest route along usable roads from where the player is to a place or a
   clicked point (snapped to the nearest road). When there is no way, it says so plainly; it never
   draws a route that does not arrive.
2. **Following.** As the player moves, the part of the route already travelled is trimmed.
3. **Rerouting.** When the player has left the route, a new route is found from where they are. It
   must not flicker: leaving is decided with a distance margin and a short delay, and a player who
   is on the route never triggers a new one.
4. **Guidance.** Distance left, the next turn (left, right, straight on, turn back) with the
   distance to it, and "you have arrived". Available as data and as plain words.
5. **Map views.** A minimap that turns with the player, a full map with pan, zoom and click to set a
   destination, and a tilted view in which buildings are raised blocks. All three draw the route
   line, the player, markers and place names.
6. **A small, documented API** that an application uses: load a map, set a destination, feed the
   position each frame, read route and guidance, mount a view on a canvas.

Properties to prove with fast-check (generated maps, positions and destinations):
- a route is an unbroken chain of usable roads from the start to the destination;
- on small maps, no other path is shorter than the route (checked against a plain exhaustive
  search);
- when the destination cannot be reached, no route is returned;
- no route ever uses a road that crosses a blocked area or a one-way road the wrong way;
- snapping a point returns the nearest point on a road;
- while the player moves along the route, the distance left never goes up and no reroute happens;
- after a reroute, the new route starts where the player is and reaches the same destination;
- mirroring a map swaps every left turn for a right turn and changes nothing else;
- saving a map and loading it again gives the same map.

Speed is measured and reported, not guessed: route time on a generated map of 5,000 roads, and
frame time of the views on the same map.

## The maker

A browser page for people who do not write code.

- Click, click, click draws a road. Ends snap to nearby nodes and roads; roads that cross are joined
  at the crossing.
- Select, move and delete nodes, roads, places, props and blocked areas.
- Drop props from the starter set; upload an own picture as a prop or as the background to trace.
- Name places and give them a category.
- Draw blocked areas.
- A checks panel in plain words: places that cannot be reached, roads through blocked areas, loose
  ends.
- Undo and redo. The work is kept in the browser between visits. Save to a file and open a file.
- **Play:** walk or drive on the map at once, with minimap, route and rerouting, without leaving the
  page.
- **Export:** the map file, plus a short "use it in your page" snippet. A link that carries a small
  map in the address is welcome if time allows.

The maker writes only what the map file format allows, and the engine loads whatever the maker
saves; a property test covers that round trip.

## The kit's own `.kiro/`

`kit/.kiro/` ships with the kit, so someone who copies the kit and opens it in Kiro gets: steering
that states the map file format and the engine's API rules, a hook that runs the engine tests when
an engine file is saved and checks a map file when one is saved, and a spec template for "a new
application on this kit". **Both applications must be built by using that template**, and the
write-up will say honestly how that went.

## The two applications

Each is a map file made in the maker, a way of moving, a goal and a look. Neither changes the
engine; what an application needs and the engine lacks goes into the engine for both.

- **City Run** (`apps/city-run/`): a small town to drive around with the keyboard (touch buttons on
  a phone). Missions "reach the marker" with a timer and a score. Shows the minimap, the route line
  and rerouting when the player takes another street.
- **Room Finder** (`apps/room-finder/`): an indoor guide for one floor of an invented building
  (a clinic or a school), made by tracing corridors over a floor plan picture we draw ourselves.
  Search for a room, get the route and step-by-step directions in words, move the position by
  tapping or with the arrow keys (a browser cannot locate a person indoors; say so on the page), and
  a link that opens the same route on a phone. Plain, readable look; reaches WCAG AA contrast.

Both are original. Do not copy the maps, names, characters or look of any existing game or product,
and do not name any in the user interface, the docs or the write-up. No real-world map data. Art
comes later from the owner; build with plain shapes and one palette file per application so art can
be swapped in. Keyboard works everywhere. Works at 375 px width.

## Order of work, with checkpoints

Stop after each checkpoint and report; the reviewer reruns the checks before the next block.

1. **Block A, the engine core:** map file format with its checks, route finding, following,
   rerouting, guidance, with their properties. A hand-written map file is enough here.
2. **Block B, the views:** minimap, full map, tilted view, on a bare demo page.
   **Gate:** on that page a person can click a place, see the route, leave it and get a new one,
   smoothly, on the 5,000-road map. If this gate fails, say so plainly; the project stops there.
3. **Block C:** the kit's own `.kiro/` and the spec template.
4. **Block D:** City Run, from the template.
5. **Block E:** Room Finder, from the template.
6. **Block F, the maker.** In this order, so it can be cut from the end if time runs out: roads with
   snapping and joining, places, save and open, Play; then blocked areas, props, checks panel, undo
   and redo; then background picture, uploads, export snippet.
7. **Block G:** landing page, README for the kit ("your own map in ten minutes"), `THIRD_PARTY.md`,
   and a short honest "related work" note: route-finding libraries for the web exist
   (PathFinding.js, EasyStar.js, navmesh), map kits with route guidance exist for the big game
   engines, open indoor guides exist (OpenIndoorMaps, indrz); what this kit adds is the maker, the
   engine and the views in one piece for the browser.

Until the maker exists, the applications' maps are written by hand or by a small script; they are
redone in the maker once it works, and the write-up says which maps were made how.

## Rules

- One logical change per commit; subject `Area: what changed`, at most 72 characters; body says why
  and how it was verified. No attribution lines of any kind. Stage by path. Never push.
- Tests are never weakened to pass: no skipped tests, no raised time limits, no loosened
  thresholds. If something cannot be made to pass, report it.
- No silent wrong output: no route is better than a wrong route, and the player is told in plain
  words.
- Keep the default suite fast (under 60 seconds); browser checks may be a separate command.
- Report at each checkpoint: real `git status` output, the commit list, test results with time, the
  measured speeds, and anything not done or not verified, said plainly. Do not report credit
  figures.
