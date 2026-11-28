# Cartomancer views demo

A bare page that shows the three map views (minimap, full map, tilted
view) side by side. It is a demonstration of the views, not an
application. It uses an invented map and no real-world map data.

## Start

Run `npm run dev` in `kit/demo`, then open <http://localhost:5173/>.
The port is fixed (`strictPort`), so the address does not change
silently. If the port is in use, the server stops with an error.

## Other scripts

- `npm run build`: type-checks the demo (`tsc --noEmit`).
- `npm run test`: runs the demo tests with Vitest.
- `npm run bench`: runs the Playwright frame benchmark.
- `npm run gate`: runs the Playwright gate check.

## What the page shows

- Three canvases: minimap, full map, tilted view.
- A map choice (town map or the large generated map with 5,000 roads)
  and a speed control (1 to 200 world units per second).
- Click or tap the full map to set a destination. Move the player dot
  with the arrow keys while no map canvas has keyboard focus. Leave the
  route and a new one is found.
- Status text: guidance, distance left, the no-way message, the road
  count, roads left out because they cross a blocked area, and map load
  errors.
