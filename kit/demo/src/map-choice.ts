// Map choice: the text of the Town_Map or of the Large_Generated_Map.

import { generateLargeMap } from "../../engine/bench/generate-large-map.js";
import { townMap } from "./town-map.js";

export const LARGE_MAP_SEED = 20261204;

export const MAP_NAMES = ["town", "large"] as const;
export type MapName = (typeof MAP_NAMES)[number];

/** Return the map file text for a map name, or throw a plain error. */
export function chooseMap(name: string): string {
  if (name === "town") return JSON.stringify(townMap);
  if (name === "large") return generateLargeMap(LARGE_MAP_SEED);
  throw new Error(
    `There is no map called "${name}". Choose one of: ${MAP_NAMES.join(", ")}.`,
  );
}
