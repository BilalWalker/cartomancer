// Page wiring of the demo. Small functions with every browser object injected,
// so the logic runs in Node with fake canvases. The three Views are mounted
// only through the Mount_Functions; this file has no adapter, input binding or
// View frame loop. Its own loop only feeds the position and a timestamp to
// the Engine.

import { isViewError } from "../../engine/src/index.js";
import type {
  Engine,
  FullMapHandle,
  MinimapHandle,
  TiltedViewHandle,
  ViewError,
  ViewNotice,
} from "../../engine/src/index.js";
import type { EngineMap } from "../../engine/src/types.js";
import { chooseMap } from "./map-choice.js";
import { createPlayerDot, DEFAULT_SPEED } from "./player-dot.js";
import type { DotExtent, PlayerDot } from "./player-dot.js";
import { reducedMotionService } from "./reduced-motion.js";
import type { MediaQueryLike } from "./reduced-motion.js";
import {
  blockedRoadLines,
  distanceLeftText,
  guidanceStatusText,
  mapLoadErrorLines,
  noUsableRoadText,
  noWayText,
  roadCountText,
} from "./status-text.js";

/** The part of a page element that shows text. */
export interface TextElement {
  textContent: string | null;
}

export interface StatusElements {
  guidance: TextElement;
  distance: TextElement;
  roads: TextElement;
  notices: TextElement;
  message: TextElement;
  errors: TextElement;
}

/** The three Mount_Functions, as the demo calls them. */
export interface Mounts<C> {
  mountMinimap(canvas: C, engine: Engine, options?: ViewOptions): MinimapHandle | ViewError;
  mountFullMap(canvas: C, engine: Engine, options?: ViewOptions): FullMapHandle | ViewError;
  mountTiltedView(
    canvas: C,
    engine: Engine,
    options?: ViewOptions & { tiltAngleDegrees?: number },
  ): TiltedViewHandle | ViewError;
}

/** The default tilt angle of the demo, in degrees. */
export const DEFAULT_TILT_DEGREES = 35;

/** The options the demo passes to every Mount_Function. */
export interface ViewOptions {
  onNotice?(notice: ViewNotice): void;
  services?: { matchReducedMotion(): ReturnType<ReturnType<typeof reducedMotionService>> };
}

export interface KeyEventLike {
  key: string;
  preventDefault(): void;
}

export interface DemoDeps<C> {
  engine: Engine;
  mounts: Mounts<C>;
  canvases: { minimap: C; fullMap: C; tilted: C };
  status: StatusElements;
  /** True while one of the view canvases has keyboard focus. */
  isViewFocused(): boolean;
  reducedMotionQuery: MediaQueryLike;
  /** The value of the tilt slider at the first mount. Default 35. */
  initialTiltDegrees?: number;
  /** Asks for one animation frame for the demo's own position feed. Default: the browser's. */
  requestFrame?(callback: (timestampMs: number) => void): number;
  cancelFrame?(handle: number): void;
}

export interface Demo {
  /** Loads a map by name. Returns true when it is now shown; false keeps the previous map. */
  loadChoice(name: string): boolean;
  /** Sets the speed from page text; returns the message or null. */
  setSpeedText(text: string): string | null;
  /**
   * Sets the tilt angle of the mounted Tilted_View without mounting it again.
   * Returns null on success, or the plain message when the value was refused;
   * then `tiltDegrees` still holds the previous value.
   */
  setTiltAngle(degrees: number): string | null;
  /** The tilt angle in use now, in degrees. */
  readonly tiltDegrees: number;
  keyDown(event: KeyEventLike): void;
  keyUp(event: KeyEventLike): void;
  /** Feeds the position and the timestamp to the Engine and refreshes the status text. */
  frame(timestampMs: number): void;
  /** Starts the demo's own frame loop. */
  start(): void;
  stop(): void;
  /** How many Views are mounted now. */
  readonly viewCount: number;
}

const ARROWS: Record<string, "left" | "right" | "up" | "down"> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

/** The extent of the nodes and places of a map. */
export function mapExtent(map: EngineMap): DotExtent {
  const points = [...map.nodes, ...map.places];
  if (points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

/** Where the dot starts: the first node, or the map centre when there is none. */
export function startPosition(map: EngineMap): { x: number; y: number; headingDegrees: number } {
  const first = map.nodes[0];
  if (first) return { x: first.x, y: first.y, headingDegrees: 0 };
  const e = mapExtent(map);
  return { x: (e.minX + e.maxX) / 2, y: (e.minY + e.maxY) / 2, headingDegrees: 0 };
}

export function createDemo<C>(deps: DemoDeps<C>): Demo {
  const { engine, mounts, canvases, status } = deps;
  const requestFrame =
    deps.requestFrame ?? ((callback: (timestampMs: number) => void): number => globalThis.requestAnimationFrame(callback));
  const cancelFrame = deps.cancelFrame ?? ((handle: number): void => globalThis.cancelAnimationFrame(handle));
  let handles: Array<{ destroy(): void }> = [];
  let tiltedHandle: TiltedViewHandle | undefined;
  let tiltDegrees = deps.initialTiltDegrees ?? DEFAULT_TILT_DEGREES;
  let tiltMessageShown = false;
  let dot: PlayerDot | undefined;
  let hasMap = false;
  let speed = DEFAULT_SPEED;
  let dotMessage = "";
  let viewMessage = "";
  let loopHandle: number | undefined;
  let running = false;

  const setText = (element: TextElement, text: string): void => {
    if (element.textContent !== text) element.textContent = text;
  };

  const destroyViews = (): void => {
    for (const handle of handles) handle.destroy();
    handles = [];
    tiltedHandle = undefined;
  };

  const mountViews = (): string[] => {
    const errors: string[] = [];
    const options: ViewOptions = {
      onNotice: (notice) => {
        viewMessage = notice.message;
      },
      services: { matchReducedMotion: reducedMotionService(deps.reducedMotionQuery) },
    };
    const minimap = mounts.mountMinimap(canvases.minimap, engine, options);
    const fullMap = mounts.mountFullMap(canvases.fullMap, engine, options);
    const tilted = mounts.mountTiltedView(canvases.tilted, engine, { ...options, tiltAngleDegrees: tiltDegrees });
    const results = [minimap, fullMap, tilted];
    for (const result of results) {
      if (isViewError(result)) errors.push(result.message);
      else handles.push(result);
    }
    if (!isViewError(tilted)) tiltedHandle = tilted;
    return errors;
  };

  const loadChoice = (name: string): boolean => {
    let text: string;
    try {
      text = chooseMap(name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setText(status.errors, [message, ...(hasMap ? ["The previous map is still in use."] : [])].join(" "));
      return false;
    }
    const result = engine.loadMap(text);
    if ("errors" in result) {
      setText(status.errors, mapLoadErrorLines(result.errors, hasMap).join(" "));
      return false;
    }

    // The mounts read the map once, so the Views are destroyed and mounted again.
    destroyViews();
    hasMap = true;
    const start = startPosition(result.map);
    dot = createPlayerDot(start, mapExtent(result.map));
    dot.setSpeed(speed);
    dotMessage = "";
    viewMessage = "";
    engine.feedPosition(start, 0);
    const mountErrors = mountViews();

    tiltMessageShown = false;
    setText(status.errors, mountErrors.join(" "));
    setText(status.roads, [roadCountText(result.map.roads.length), noUsableRoadText(result.map.usableRoadIds.size)].filter(Boolean).join(" "));
    setText(status.notices, blockedRoadLines(result.notices).join(" "));
    refreshStatus();
    return true;
  };

  const refreshStatus = (): void => {
    const hasRouteOrNoWay = engine.getRoute() !== undefined || engine.getLastNoWayResult() !== undefined;
    setText(status.guidance, guidanceStatusText(engine.getGuidanceSentence(), hasRouteOrNoWay));
    setText(status.distance, distanceLeftText(engine.getGuidance()));
    setText(status.message, noWayText(engine.getLastNoWayResult()) || dotMessage || viewMessage);
  };

  const frame = (timestampMs: number): void => {
    if (dot === undefined) return;
    const step = dot.step(timestampMs);
    dotMessage = step.message ?? "";
    engine.feedPosition(step.position, timestampMs);
    refreshStatus();
  };

  const loop = (timestampMs: number): void => {
    loopHandle = undefined;
    if (!running) return;
    frame(timestampMs);
    loopHandle = requestFrame(loop);
  };

  return {
    loadChoice,
    setSpeedText(text) {
      const value = text.trim() === "" ? Number.NaN : Number(text);
      if (dot === undefined) {
        // No dot yet: keep the number for the first map, if it is valid.
        const probe = createPlayerDot({ x: 0, y: 0, headingDegrees: 0 }, { minX: 0, minY: 0, maxX: 0, maxY: 0 });
        const message = probe.setSpeed(value);
        if (message === null) speed = value;
        return message;
      }
      const message = dot.setSpeed(value);
      if (message === null) speed = value;
      else setText(status.message, message);
      return message;
    },
    setTiltAngle(degrees) {
      const refuse = (message: string): string => {
        setText(status.errors, message);
        tiltMessageShown = true;
        return message;
      };
      if (tiltedHandle === undefined) return refuse("The tilted view is not mounted, so the tilt angle was not changed.");
      const error = tiltedHandle.setTiltAngle(degrees);
      if (error !== undefined) return refuse(error.message);
      tiltDegrees = degrees;
      if (tiltMessageShown) {
        setText(status.errors, "");
        tiltMessageShown = false;
      }
      return null;
    },
    get tiltDegrees() {
      return tiltDegrees;
    },
    keyDown(event) {
      const direction = ARROWS[event.key];
      if (direction === undefined || deps.isViewFocused()) return;
      event.preventDefault();
      dot?.setHeld({ [direction]: true });
    },
    keyUp(event) {
      const direction = ARROWS[event.key];
      if (direction === undefined) return;
      dot?.setHeld({ [direction]: false });
    },
    frame,
    start() {
      if (running) return;
      running = true;
      loopHandle = requestFrame(loop);
    },
    stop() {
      running = false;
      if (loopHandle !== undefined) cancelFrame(loopHandle);
      loopHandle = undefined;
      destroyViews();
    },
    get viewCount() {
      return handles.length;
    },
  };
}
