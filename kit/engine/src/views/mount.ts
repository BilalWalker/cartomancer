// Mount functions: one call that puts a View on a canvas. This is one of the
// three Views files that may reach browser services. It reaches them only
// through the `services` option, whose defaults are the real globals, so the
// code runs in Node with stand-ins.
//
// Mounting order, so a failure leaves nothing behind: validate every input,
// build the View and the canvas adapter, set the canvas size, and only then
// register side effects (observer, listeners, the first frame request).

import { describeCanvas, type AccessibleElement } from "./accessibility.js";
import { CanvasAdapter, type CanvasLike } from "./canvas-adapter.js";
import type { ImageLookup } from "./image-lookup.js";
import {
  DEFAULT_MINIMAP_ZOOM_MAX,
  DEFAULT_MINIMAP_ZOOM_MIN,
  Minimap,
  type MinimapState,
} from "./minimap.js";
import { validateSmoothingDuration } from "./smoothing.js";
import {
  badImagesEntry,
  badImagesOption,
  badOptions,
  badServiceOption,
  canvasAlreadyMounted,
  destroyed,
  isViewError,
  missingEngineFunction,
  noFrameService,
  noMapToShow,
  notACanvas,
  outOfRange,
  serviceFailed,
  type Notice,
  type ViewError,
} from "./view-errors.js";
import type { EngineMap, Position, Route } from "../types.js";

/** The query for the reduced-motion setting of the host. */
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** The range any zoom or zoom limit must lie in, in CSS pixels per world unit. */
const ZOOM_RANGE_MIN = 0.001;
const ZOOM_RANGE_MAX = 1000;

/** The browser services a mounted View uses. Each defaults to the real global. */
export interface MountServices {
  /** Asks for one animation frame; the callback gets the frame timestamp in ms. Returns a handle. */
  requestFrame(callback: (timestampMs: number) => void): number;
  /** Cancels a frame requested with `requestFrame`. */
  cancelFrame(handle: number): void;
  /** Makes an observer that calls back when the CSS size of the observed canvas changes. */
  createResizeObserver(callback: () => void): { observe(element: unknown): void; disconnect(): void };
  /** The reduced-motion setting, live, with a way to hear about changes. */
  matchReducedMotion(): {
    readonly matches: boolean;
    addListener(callback: () => void): void;
    removeListener(callback: () => void): void;
  };
  /** Device pixels per CSS pixel. */
  devicePixelRatio(): number;
}

/** Options every Mount_Function takes. */
export interface BaseMountOptions {
  /** Smoothing duration in ms, 1 to 5000. Default 300. */
  smoothingDurationMs?: number;
  /** Replaces some or all browser services. Missing ones use the real globals. */
  services?: Partial<MountServices>;
  /** Called with every notice and every drawing problem, in plain words. */
  onNotice?(notice: Notice): void;
  /** Called with the guidance sentence whenever it changes. */
  onGuidance?(sentence: string): void;
  /** Loaded pictures: an object or a function from a picture reference to an entry. */
  images?: ImageLookup;
}

/** Options of `mountMinimap`. */
export interface MinimapMountOptions extends BaseMountOptions {
  /** Lowest zoom, 0.001 to 1000 CSS pixels per world unit. Default 0.5. */
  minZoom?: number;
  /** Highest zoom, 0.001 to 1000 CSS pixels per world unit. Default 4. */
  maxZoom?: number;
  /** First zoom, inside the limits. Default 1. */
  zoom?: number;
}

/** What every Mount_Function returns when it succeeds. */
export interface MountHandle {
  /** Stops the frame loop, removes every listener and observer. A second call does nothing. */
  destroy(): void;
}

/** The handle of `mountMinimap`. Controls return a ViewError, or nothing when they worked. */
export interface MinimapHandle extends MountHandle {
  setZoom(zoom: number): ViewError | undefined;
  setZoomLimits(min: number, max: number): ViewError | undefined;
  /** Reads the CSS size of the canvas again and resizes the view. */
  resize(): ViewError | undefined;
}

/** The part of a canvas element a mounted View uses. */
export interface MountableCanvas extends CanvasLike, AccessibleElement {
  /** CSS width in pixels. */
  clientWidth: number;
  /** CSS height in pixels. */
  clientHeight: number;
}

/** The part of an Engine a Minimap reads. */
export interface MinimapEngine {
  getMap(): EngineMap | undefined;
  getPosition(): Position | undefined;
  getRemainingRoute(): Route | undefined;
  getGuidanceSentence(): string;
}

const MINIMAP_ENGINE_FUNCTIONS = [
  "getMap",
  "getPosition",
  "getRemainingRoute",
  "getGuidanceSentence",
] as const;

/** Canvases that have a mounted View. */
const mountedCanvases = new WeakSet<object>();

// ---------------------------------------------------------------------------
// Services

interface HostGlobals {
  requestAnimationFrame?: (callback: (timestampMs: number) => void) => number;
  cancelAnimationFrame?: (handle: number) => void;
  ResizeObserver?: new (callback: () => void) => { observe(element: unknown): void; disconnect(): void };
  matchMedia?: (query: string) => {
    matches: boolean;
    addEventListener?(type: string, callback: () => void): void;
    removeEventListener?(type: string, callback: () => void): void;
    addListener?(callback: () => void): void;
    removeListener?(callback: () => void): void;
  };
  devicePixelRatio?: number;
}

const SERVICE_NAMES = [
  "requestFrame",
  "cancelFrame",
  "createResizeObserver",
  "matchReducedMotion",
  "devicePixelRatio",
] as const;

/** Fills every service the caller left out from the real globals. */
function resolveServices(given: unknown): MountServices | ViewError {
  if (given !== undefined && (typeof given !== "object" || given === null || Array.isArray(given))) {
    return outOfRange("services", "an object");
  }
  const own = (given ?? {}) as Record<string, unknown>;
  for (const name of SERVICE_NAMES) {
    if (own[name] !== undefined && typeof own[name] !== "function") return badServiceOption(name);
  }
  const host = globalThis as unknown as HostGlobals;
  const supplied = own as Partial<MountServices>;

  const requestFrame =
    supplied.requestFrame ??
    (typeof host.requestAnimationFrame === "function"
      ? (callback: (timestampMs: number) => void): number => host.requestAnimationFrame!(callback)
      : undefined);
  const cancelFrame =
    supplied.cancelFrame ??
    (typeof host.cancelAnimationFrame === "function"
      ? (handle: number): void => host.cancelAnimationFrame!(handle)
      : undefined);
  if (requestFrame === undefined || cancelFrame === undefined) return noFrameService();

  const createResizeObserver =
    supplied.createResizeObserver ??
    ((callback: () => void) => {
      if (typeof host.ResizeObserver === "function") return new host.ResizeObserver(callback);
      return { observe(): void {}, disconnect(): void {} };
    });

  const matchReducedMotion =
    supplied.matchReducedMotion ??
    (() => {
      if (typeof host.matchMedia !== "function") {
        return { matches: false, addListener(): void {}, removeListener(): void {} };
      }
      const query = host.matchMedia(REDUCED_MOTION_QUERY);
      return {
        get matches(): boolean {
          return query.matches;
        },
        addListener(callback: () => void): void {
          if (typeof query.addEventListener === "function") query.addEventListener("change", callback);
          else query.addListener?.(callback);
        },
        removeListener(callback: () => void): void {
          if (typeof query.removeEventListener === "function") query.removeEventListener("change", callback);
          else query.removeListener?.(callback);
        },
      };
    });

  const devicePixelRatio =
    supplied.devicePixelRatio ??
    ((): number => (typeof host.devicePixelRatio === "number" ? host.devicePixelRatio : 1));

  return { requestFrame, cancelFrame, createResizeObserver, matchReducedMotion, devicePixelRatio };
}

// ---------------------------------------------------------------------------
// Validation

function isMountableCanvas(value: unknown): value is MountableCanvas {
  if (typeof value !== "object" || value === null) return false;
  const canvas = value as Record<string, unknown>;
  return (
    typeof canvas.getContext === "function" &&
    typeof canvas.setAttribute === "function" &&
    typeof canvas.removeAttribute === "function" &&
    typeof canvas.addEventListener === "function" &&
    typeof canvas.removeEventListener === "function" &&
    typeof canvas.style === "object" &&
    canvas.style !== null
  );
}

function checkEngine(engine: unknown, names: readonly string[]): ViewError | undefined {
  for (const name of names) {
    const found =
      (typeof engine === "object" || typeof engine === "function") && engine !== null
        ? (engine as Record<string, unknown>)[name]
        : undefined;
    if (typeof found !== "function") return missingEngineFunction(name);
  }
  return undefined;
}

function zoomInRange(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= ZOOM_RANGE_MIN && value <= ZOOM_RANGE_MAX;
}

/** An `images` option must be an object or a function; each own entry of an object is checked. */
function checkImages(images: unknown): ViewError | undefined {
  if (images === undefined || typeof images === "function") return undefined;
  if (typeof images !== "object" || images === null || Array.isArray(images)) return badImagesOption();
  for (const ref of Object.keys(images)) {
    try {
      const entry = (images as Record<string, unknown>)[ref];
      if (entry === undefined || entry === null) continue;
      if (typeof entry !== "object") return badImagesEntry(ref);
      const { width, height } = entry as { width?: unknown; height?: unknown };
      const usable = (v: unknown): boolean => typeof v === "number" && Number.isFinite(v) && v > 0;
      if (!usable(width) || !usable(height)) return badImagesEntry(ref);
    } catch {
      return badImagesEntry(ref);
    }
  }
  return undefined;
}

function checkBaseOptions(options: BaseMountOptions): ViewError | undefined {
  if (options.smoothingDurationMs !== undefined) {
    const error = validateSmoothingDuration(options.smoothingDurationMs);
    if (error) return error;
  }
  if (options.onNotice !== undefined && typeof options.onNotice !== "function") {
    return outOfRange("onNotice", "a function");
  }
  if (options.onGuidance !== undefined && typeof options.onGuidance !== "function") {
    return outOfRange("onGuidance", "a function");
  }
  return checkImages(options.images);
}

/** The zoom limits and first zoom to apply, widened so a first zoom outside the default limits still fits. */
function minimapZoomPlan(options: MinimapMountOptions): { min: number; max: number; zoom?: number } | ViewError {
  const rule = `a number from ${ZOOM_RANGE_MIN} to ${ZOOM_RANGE_MAX}`;
  if (options.minZoom !== undefined && !zoomInRange(options.minZoom)) return outOfRange("minZoom", rule);
  if (options.maxZoom !== undefined && !zoomInRange(options.maxZoom)) return outOfRange("maxZoom", rule);
  if (options.zoom !== undefined && !zoomInRange(options.zoom)) return outOfRange("zoom", rule);
  const zoom = options.zoom;
  const min = options.minZoom ?? Math.min(DEFAULT_MINIMAP_ZOOM_MIN, zoom ?? Infinity);
  const max = options.maxZoom ?? Math.max(DEFAULT_MINIMAP_ZOOM_MAX, zoom ?? -Infinity);
  if (!(min < max)) return outOfRange("minZoom", "below maxZoom");
  if (zoom !== undefined && (zoom < min || zoom > max)) {
    return outOfRange("zoom", `a number from ${min} to ${max}`);
  }
  return { min, max, zoom };
}

// ---------------------------------------------------------------------------
// mountMinimap

/**
 * Puts a Minimap on a canvas and starts its frame loop. The loop reads the
 * position, the remaining route and the guidance from the engine on every
 * frame; the application only feeds positions to the engine. Returns a
 * handle, or a ViewError and mounts nothing.
 */
export function mountMinimap(
  canvas: MountableCanvas,
  engine: MinimapEngine,
  options?: MinimapMountOptions,
): MinimapHandle | ViewError {
  // 1. Validate.
  if (!isMountableCanvas(canvas)) return notACanvas();
  const engineError = checkEngine(engine, MINIMAP_ENGINE_FUNCTIONS);
  if (engineError) return engineError;
  if (options !== undefined && (typeof options !== "object" || options === null || Array.isArray(options))) {
    return badOptions();
  }
  const given: MinimapMountOptions = options ?? {};
  const optionError = checkBaseOptions(given);
  if (optionError) return optionError;
  const plan = minimapZoomPlan(given);
  if (isViewError(plan)) return plan;
  if (mountedCanvases.has(canvas)) return canvasAlreadyMounted();
  const resolved = resolveServices(given.services);
  if (isViewError(resolved)) return resolved;
  const services = resolved;
  const map = engine.getMap();
  if (map === undefined) return noMapToShow();

  // 2. Build the View and the adapter. Nothing on the canvas has changed yet.
  const cssWidth = canvas.clientWidth;
  const cssHeight = canvas.clientHeight;
  const minimap = Minimap.create(map, {
    width: cssWidth,
    height: cssHeight,
    smoothingDurationMs: given.smoothingDurationMs,
    images: given.images,
  });
  if (isViewError(minimap)) return minimap;
  const limitsError = minimap.setZoomLimits(plan.min, plan.max);
  if (limitsError) return limitsError;
  if (plan.zoom !== undefined) {
    const zoomError = minimap.setZoom(plan.zoom);
    if (zoomError) return zoomError;
  }
  const adapter = CanvasAdapter.mount(canvas);
  if (isViewError(adapter)) return adapter;

  const report = (notice: Notice): void => {
    try {
      given.onNotice?.(notice);
    } catch {
      // A failing callback of the application must not stop the view.
    }
  };

  // 3. Set the canvas size, then register side effects.
  const previousPixelWidth = canvas.width;
  const previousPixelHeight = canvas.height;
  const sized = adapter.resize(cssWidth, cssHeight, services.devicePixelRatio());
  if (isViewError(sized)) return sized;

  let isDestroyed = false;
  let pending = false;
  let pendingHandle = 0;
  let observer: { observe(element: unknown): void; disconnect(): void } | undefined;
  let motion: ReturnType<MountServices["matchReducedMotion"]> | undefined;
  let undescribe: (() => void) | undefined;
  let lastProblem: string | undefined;
  let lastSentence: string | undefined;

  const applyMotion = (): void => {
    if (motion !== undefined) minimap.setReducedMotion(motion.matches);
  };

  const applySize = (): ViewError | undefined => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const result = adapter.resize(width, height, services.devicePixelRatio());
    if (isViewError(result)) return result;
    const error = minimap.resize(width, height);
    if (error) return error;
    for (const notice of result.notices) report(notice);
    return undefined;
  };

  const onSizeChange = (): void => {
    if (isDestroyed) return;
    const error = applySize();
    if (error) report({ message: error.message });
  };

  const runFrame = (timestampMs: number): void => {
    const position = engine.getPosition();
    const remainingRoute = engine.getRemainingRoute();
    const sentence = engine.getGuidanceSentence();
    if (sentence !== lastSentence) {
      lastSentence = sentence;
      try {
        given.onGuidance?.(sentence);
      } catch {
        // A failing callback of the application must not stop the view.
      }
    }
    if (position === undefined) return;
    const destination = remainingRoute?.destination;
    const state: MinimapState = {
      position,
      remainingRoute,
      destinationPlaceId: destination !== undefined && "placeId" in destination ? destination.placeId : undefined,
    };
    const drawn = minimap.draw(adapter, state, timestampMs);
    if (isViewError(drawn)) {
      if (drawn.message !== lastProblem) {
        lastProblem = drawn.message;
        report({ message: drawn.message });
      }
      return;
    }
    lastProblem = undefined;
    for (const notice of drawn.notices) report(notice);
  };

  const schedule = (): void => {
    if (pending || isDestroyed) return;
    pending = true;
    pendingHandle = services.requestFrame(onFrame);
  };

  const onFrame = (timestampMs: number): void => {
    pending = false;
    if (isDestroyed) return;
    try {
      runFrame(timestampMs);
    } finally {
      schedule();
    }
  };

  const teardown = (): void => {
    if (pending) {
      pending = false;
      services.cancelFrame(pendingHandle);
    }
    if (motion !== undefined) motion.removeListener(applyMotion);
    if (observer !== undefined) observer.disconnect();
    if (undescribe !== undefined) undescribe();
    motion = undefined;
    observer = undefined;
    undescribe = undefined;
    mountedCanvases.delete(canvas);
  };

  try {
    undescribe = describeCanvas(canvas, "minimap");
    observer = services.createResizeObserver(onSizeChange);
    observer.observe(canvas);
    motion = services.matchReducedMotion();
    applyMotion();
    motion.addListener(applyMotion);
    mountedCanvases.add(canvas);
    schedule();
  } catch {
    isDestroyed = true;
    teardown();
    canvas.width = previousPixelWidth;
    canvas.height = previousPixelHeight;
    return serviceFailed();
  }

  for (const notice of minimap.getNotices()) report(notice);
  for (const notice of sized.notices) report(notice);

  return {
    destroy(): void {
      if (isDestroyed) return;
      isDestroyed = true;
      teardown();
    },
    setZoom: (zoom) => (isDestroyed ? destroyed() : minimap.setZoom(zoom)),
    setZoomLimits: (min, max) => (isDestroyed ? destroyed() : minimap.setZoomLimits(min, max)),
    resize: () => (isDestroyed ? destroyed() : applySize()),
  };
}
