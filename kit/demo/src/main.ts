// The demo page. The Views are mounted only through the Mount_Functions, once,
// when createDemo runs; a map switch only loads the map into the Engine. The
// logic is in page.ts.

import { Engine, mountFullMap, mountMinimap, mountTiltedView } from "../../engine/src/index.js";
import { createDemo } from "./page.js";
import { REDUCED_MOTION_QUERY } from "./reduced-motion.js";

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`The page has no element with the id "${id}".`);
  return found as T;
}

const minimap = element<HTMLCanvasElement>("minimap-canvas");
const fullMap = element<HTMLCanvasElement>("fullmap-canvas");
const tilted = element<HTMLCanvasElement>("tilted-canvas");
const mapChoice = element<HTMLSelectElement>("map-choice");
const speedInput = element<HTMLInputElement>("speed-input");
const tiltInput = element<HTMLInputElement>("tilt-input");
const tiltValue = element<HTMLElement>("tilt-value");

const demo = createDemo<HTMLCanvasElement>({
  engine: new Engine(),
  mounts: { mountMinimap, mountFullMap, mountTiltedView },
  canvases: { minimap, fullMap, tilted },
  status: {
    guidance: element("status-guidance"),
    distance: element("status-distance"),
    roads: element("status-roads"),
    notices: element("status-notices"),
    message: element("status-message"),
    errors: element("status-errors"),
  },
  isViewFocused: () => {
    const active = document.activeElement;
    return active === minimap || active === fullMap || active === tilted;
  },
  reducedMotionQuery: window.matchMedia(REDUCED_MOTION_QUERY),
  initialTiltDegrees: Number(tiltInput.value),
});
tiltValue.textContent = `${tiltInput.value} degrees`;

let shownMap = mapChoice.value;
mapChoice.addEventListener("change", () => {
  if (demo.loadChoice(mapChoice.value)) shownMap = mapChoice.value;
  else mapChoice.value = shownMap;
});
speedInput.addEventListener("change", () => {
  demo.setSpeedText(speedInput.value);
});
tiltInput.addEventListener("input", () => {
  demo.setTiltAngle(Number(tiltInput.value));
  tiltInput.value = String(demo.tiltDegrees);
  tiltValue.textContent = `${demo.tiltDegrees} degrees`;
});
document.addEventListener("keydown", (event) => demo.keyDown(event));
document.addEventListener("keyup", (event) => demo.keyUp(event));

// Test-only hook: the Frame_Benchmark opens the page with "?bench" and needs the
// Full_Map handle to set the zoom. Without that query nothing is exposed.
if (new URLSearchParams(window.location.search).has("bench")) {
  (window as unknown as { __benchHandles: { fullMap: unknown } }).__benchHandles = { fullMap: demo.fullMap };
}

demo.loadChoice(shownMap);
demo.start();
