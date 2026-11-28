// The demo page. The Views are mounted only through the Mount_Functions; the
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
});

let shownMap = mapChoice.value;
mapChoice.addEventListener("change", () => {
  if (demo.loadChoice(mapChoice.value)) shownMap = mapChoice.value;
  else mapChoice.value = shownMap;
});
speedInput.addEventListener("change", () => {
  demo.setSpeedText(speedInput.value);
});
document.addEventListener("keydown", (event) => demo.keyDown(event));
document.addEventListener("keyup", (event) => demo.keyUp(event));

demo.loadChoice(shownMap);
demo.start();
