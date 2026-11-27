// The Engine class: the one object an application talks to.

import { parseMap } from "./map-loader.js";
import type { EngineMap, LoadResult, Notice, PlaceData } from "./types.js";

export class Engine {
  private map: EngineMap | undefined;
  private notices: Notice[] = [];

  /** Load map file text. A failed load leaves the previous map in place. */
  loadMap(text: string): LoadResult {
    const result = parseMap(text);
    if ("map" in result) {
      this.map = result.map;
      this.notices = result.notices;
    }
    return result;
  }

  /** Every place with its name and category, for an application's search. */
  getPlaces(): PlaceData[] {
    return this.map ? this.map.places.map((place) => ({ ...place })) : [];
  }

  /** Roads left out of routing, each with its notices. */
  getBlockedRoads(): { roadId: string; notices: Notice[] }[] {
    if (!this.map) return [];
    return this.map.blockedRoads.map(({ roadId }) => ({
      roadId,
      notices: this.notices.filter((notice) => notice.roadId === roadId),
    }));
  }
}
