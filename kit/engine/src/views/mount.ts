// Mount functions: one call that puts a View on a canvas. This is one of the
// three Views files that may reach browser services. It reaches them only
// through the `services` option, whose defaults are the real globals, so the
// code runs in Node with stand-ins.
//
// Mounting order, so a failure leaves nothing behind: validate every input,
// build the View and the canvas adapter, set the canvas size, and only then
// register side effects (observer, listeners, the first frame request).
// Every Mount_Function runs through the same core (`mountView`).

import {
  createLiveRegion,
  describeCanvas,
  type AccessibleElement,
  type LiveRegion,
  type LiveRegionElement,
  type ViewKind,
} from "./accessibility.js";
import { CanvasAdapter, type CanvasLike } from "./canvas-adapter.js";
import type { Point } from "./camera.js";
import {
  FullMap,
  type DestinationTarget,
  type FullMapChange,
  type FullMapSelectResult,
  type FullMapSelection,
} from "./full-map.js";
import type { ImageLookup } from "./image-lookup.js";
import { bindInput, type BindableCanvas } from "./input-binding.js";
import {
  DEFAULT_MINIMAP_ZOOM_MAX,
  DEFAULT_MINIMAP_ZOOM_MIN,
  Minimap,
  type MinimapState,
} from "./minimap.js";
import { validateHeightFactor } from "./block-height.js";
import { validateSmoothingDuration } from "./smoothing.js";
import { TiltedView } from "./tilted-view.js";
import { validateTilt } from "./tilted-projection.js";
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
  noMapYet,
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
  /**
   * An element that becomes an `aria-live="polite"` region and receives the
   * guidance sentence (and, for the Full_Map, the focus announcements).
   */
  liveRegion?: LiveRegionElement;
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

/** Options of `mountFullMap`. */
export interface FullMapMountOptions extends BaseMountOptions {
  /** Lowest zoom, 0.001 to 1000 CSS pixels per world unit. Default: the zoom that fits the map. */
  minZoom?: number;
  /** Highest zoom, 0.001 to 1000 CSS pixels per world unit. Default 8. */
  maxZoom?: number;
  /** When given, called with each selection instead of setting the destination on the engine. */
  onSelect?(selection: FullMapSelection): void;
}

/** Options of `mountTiltedView`. */
export interface TiltedViewMountOptions extends BaseMountOptions {
  /** Tilt angle in degrees, 20 to 70. Default 35. */
  tiltAngleDegrees?: number;
  /** Height factor of each prop kind, 0 to 100. A kind not listed keeps the factor 1. */
  heightFactors?: Record<string, number>;
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

/** The handle of `mountFullMap`. Camera controls return a ViewError, or nothing when they worked. */
export interface FullMapHandle extends MountHandle {
  /** Moves the map by a screen distance in CSS pixels. */
  pan(dx: number, dy: number): ViewError | undefined;
  /** Multiplies the zoom by `factor`, keeping the world point under `anchor` fixed. */
  zoomAt(anchor: Point, factor: number): ViewError | undefined;
  /** Fits the whole map in the view. */
  fit(): ViewError | undefined;
  /** Centres the view on the player and keeps following until the next pan. */
  follow(): ViewError | undefined;
  /** Selects a spot (CSS pixels) or a place marker on it, as a click would. */
  select(screenPoint: Point): FullMapSelectResult | ViewError;
  /** Selects a place by identifier, as a hit on its marker would. */
  selectPlace(placeId: string): FullMapSelectResult | ViewError;
  /** Reads the CSS size of the canvas again and resizes the view. */
  resize(): ViewError | undefined;
}

/** The handle of `mountTiltedView`. Controls return a ViewError, or nothing when they worked. */
export interface TiltedViewHandle extends MountHandle {
  /** Sets the tilt angle, 20 to 70 degrees. */
  setTiltAngle(degrees: number): ViewError | undefined;
  /** Sets the height factor of a prop kind, 0 to 100. */
  setHeightFactor(kind: string, factor: number): ViewError | undefined;
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

/** A canvas that `mountFullMap` can bind pointer, wheel, touch and key input to. */
export type FullMapCanvas = MountableCanvas & BindableCanvas;

/** The part of an Engine a Minimap reads. */
export interface MinimapEngine {
  /** The number of successful map loads; 0 before the first. Read on every frame. */
  getMapVersion(): number;
  getMap(): EngineMap | undefined;
  getPosition(): Position | undefined;
  getRemainingRoute(): Route | undefined;
  getGuidanceSentence(): string;
}

/** The part of an Engine a Full_Map reads and writes. The real Engine satisfies it. */
export interface FullMapEngine extends MinimapEngine, DestinationTarget {}

const MINIMAP_ENGINE_FUNCTIONS = [
  "getMapVersion",
  "getMap",
  "getPosition",
  "getRemainingRoute",
  "getGuidanceSentence",
] as const;

const FULL_MAP_ENGINE_FUNCTIONS = [...MINIMAP_ENGINE_FUNCTIONS, "setDestination"] as const;

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

/** A canvas that can also take input: it can say where it is on the page. */
function isBindableCanvas(value: unknown): boolean {
  return typeof (value as Record<string, unknown>)?.getBoundingClientRect === "function";
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
  if (options.liveRegion !== undefined) {
    const region = options.liveRegion as unknown as Record<string, unknown> | null;
    if (
      typeof region !== "object" ||
      region === null ||
      typeof region.setAttribute !== "function" ||
      typeof region.removeAttribute !== "function"
    ) {
      return outOfRange("liveRegion", "an element that can take attributes and text");
    }
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

/** The zoom limits the caller gave for a Full_Map; an absent one keeps the view's default. */
function fullMapZoomPlan(options: FullMapMountOptions): { min?: number; max?: number } | ViewError {
  const rule = `a number from ${ZOOM_RANGE_MIN} to ${ZOOM_RANGE_MAX}`;
  if (options.minZoom !== undefined && !zoomInRange(options.minZoom)) return outOfRange("minZoom", rule);
  if (options.maxZoom !== undefined && !zoomInRange(options.maxZoom)) return outOfRange("maxZoom", rule);
  if (options.onSelect !== undefined && typeof options.onSelect !== "function") {
    return outOfRange("onSelect", "a function");
  }
  return { min: options.minZoom, max: options.maxZoom };
}

/** The tilt angle and height factors to apply, checked with the ranges of Requirement 12. */
function tiltedPlan(
  options: TiltedViewMountOptions,
): { tilt?: number; factors: Array<[string, number]> } | ViewError {
  if (options.tiltAngleDegrees !== undefined) {
    const error = validateTilt(options.tiltAngleDegrees);
    if (error) return error;
  }
  const factors: Array<[string, number]> = [];
  if (options.heightFactors !== undefined) {
    const given: unknown = options.heightFactors;
    if (typeof given !== "object" || given === null || Array.isArray(given)) {
      return outOfRange("heightFactors", "an object from prop kind to a number from 0 to 100");
    }
    for (const kind of Object.keys(given)) {
      const factor = (given as Record<string, number>)[kind]!;
      const error = validateHeightFactor(kind, factor);
      if (error) return error;
      factors.push([kind, factor]);
    }
  }
  return { tilt: options.tiltAngleDegrees, factors };
}

// ---------------------------------------------------------------------------
// The mount core, shared by every Mount_Function

/** What the core needs of a View. */
interface CoreView {
  resize(width: number, height: number): ViewError | undefined;
  draw(canvas: CanvasAdapter, state: MinimapState, timestampMs: number): { notices: Notice[] } | ViewError;
  getNotices(): Notice[];
  /** Replaces the map; a ViewError means it was refused and the old map is kept. */
  setMap(map: EngineMap): ViewError | undefined;
  /** Only the Views that smooth their camera have it. */
  setReducedMotion?(reducedMotion: boolean): void;
}

/** What a Mount_Function adds to the core. */
interface ViewSpec<V extends CoreView, P> {
  kind: ViewKind;
  /** True for the Views that smooth their camera and so follow the reduced-motion setting. */
  usesMotion?: boolean;
  engineFunctions: readonly string[];
  /** Validates the options of this View, after the base options, and returns what `build` needs. */
  plan(given: never): P | ViewError;
  /** Builds the View for the map and the CSS size of the canvas. Touches nothing on the canvas. */
  build(map: EngineMap, width: number, height: number, plan: P): V | ViewError;
  /** Registers listeners of this View; returns the function that removes them. */
  bind?(view: V, hooks: { report(notice: Notice): void; announce(text: string): void }): () => void;
  /** Extra check of the canvas, run with the other canvas checks. */
  checkCanvas?(canvas: unknown): ViewError | undefined;
}

interface MountCore<V, P> {
  /** The View, or undefined while no map has been loaded. */
  getView(): V | undefined;
  isDestroyed(): boolean;
  destroy(): void;
  /** Reads the CSS size of the canvas again and resizes the View. */
  applySize(): ViewError | undefined;
  /** The settings the View is built with; a setting made before the first map is kept here. */
  plan: P;
}

/**
 * Validates, builds, sizes and registers, in that order, and runs the frame
 * loop. Returns a core the Mount_Function wraps in its handle, or a ViewError
 * with nothing left behind.
 */
function mountView<V extends CoreView, P>(
  canvas: MountableCanvas,
  engine: unknown,
  options: unknown,
  spec: ViewSpec<V, P>,
): MountCore<V, P> | ViewError {
  // 1. Validate.
  if (!isMountableCanvas(canvas)) return notACanvas();
  const engineError = checkEngine(engine, spec.engineFunctions);
  if (engineError) return engineError;
  if (options !== undefined && (typeof options !== "object" || options === null || Array.isArray(options))) {
    return badOptions();
  }
  const given = (options ?? {}) as BaseMountOptions;
  const optionError = checkBaseOptions(given);
  if (optionError) return optionError;
  const plan = spec.plan(given as never);
  if (isViewError(plan)) return plan;
  const canvasError = spec.checkCanvas?.(canvas);
  if (canvasError) return canvasError;
  if (mountedCanvases.has(canvas)) return canvasAlreadyMounted();
  const resolved = resolveServices(given.services);
  if (isViewError(resolved)) return resolved;
  const services = resolved;
  const reader = engine as MinimapEngine;

  // 2. Build the View (when a map is already loaded) and the adapter. Nothing
  // on the canvas has changed yet. With no map yet (Map_Version 0) the View is
  // built by the Frame_Loop at the frame that sees the first map.
  const cssWidth = canvas.clientWidth;
  const cssHeight = canvas.clientHeight;
  let handledVersion = reader.getMapVersion();
  let view: V | undefined;
  if (handledVersion > 0) {
    const map = reader.getMap();
    if (map !== undefined) {
      const built = spec.build(map, cssWidth, cssHeight, plan);
      if (isViewError(built)) return built;
      view = built;
    }
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
  let unbind: (() => void) | undefined;
  let live: LiveRegion | undefined;
  let lastProblem: string | undefined;
  let lastSentence: string | undefined;

  const bindHooks = {
    report,
    announce: (text: string): void => {
      if (!isDestroyed) live?.announce(text);
    },
  };

  const applyMotion = (): void => {
    if (motion !== undefined) view?.setReducedMotion?.(motion.matches);
  };

  const applySize = (): ViewError | undefined => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const result = adapter.resize(width, height, services.devicePixelRatio());
    if (isViewError(result)) return result;
    const error = view?.resize(width, height);
    if (error) return error;
    for (const notice of result.notices) report(notice);
    return undefined;
  };

  const onSizeChange = (): void => {
    if (isDestroyed) return;
    const error = applySize();
    if (error) report({ message: error.message });
  };

  /** Builds the View for the first map, with its input and motion setting. A failure is one Notice. */
  const buildFirst = (map: EngineMap): void => {
    const built = spec.build(map, canvas.clientWidth, canvas.clientHeight, plan);
    if (isViewError(built)) {
      report({ message: built.message });
      return;
    }
    try {
      view = built;
      unbind = spec.bind?.(built, bindHooks);
      applyMotion();
    } catch {
      view = undefined;
      report({ message: serviceFailed().message });
      return;
    }
    for (const notice of built.getNotices()) report(notice);
  };

  /** Reads the map when the Map_Version is new; one Notice and the old map kept when the View refuses it. */
  const checkMapVersion = (): void => {
    const version = reader.getMapVersion();
    if (!(version > 0) || version === handledVersion) return;
    handledVersion = version;
    const map = reader.getMap();
    if (map === undefined) return;
    if (view === undefined) {
      buildFirst(map);
      return;
    }
    const refused = view.setMap(map);
    if (refused) {
      report({ message: refused.message });
      return;
    }
    for (const notice of view.getNotices()) report(notice);
  };

  const runFrame = (timestampMs: number): void => {
    checkMapVersion();
    const position = reader.getPosition();
    const remainingRoute = reader.getRemainingRoute();
    const sentence = reader.getGuidanceSentence();
    if (sentence !== lastSentence) {
      lastSentence = sentence;
      live?.setGuidance(sentence);
      try {
        given.onGuidance?.(sentence);
      } catch {
        // A failing callback of the application must not stop the view.
      }
    }
    if (position === undefined || view === undefined) return;
    const destination = remainingRoute?.destination;
    const state: MinimapState = {
      position,
      remainingRoute,
      destinationPlaceId: destination !== undefined && "placeId" in destination ? destination.placeId : undefined,
    };
    const drawn = view.draw(adapter, state, timestampMs);
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
    if (unbind !== undefined) unbind();
    if (undescribe !== undefined) undescribe();
    if (live !== undefined) live.dispose();
    motion = undefined;
    observer = undefined;
    unbind = undefined;
    undescribe = undefined;
    live = undefined;
    mountedCanvases.delete(canvas);
  };

  try {
    undescribe = describeCanvas(canvas, spec.kind);
    if (given.liveRegion !== undefined) live = createLiveRegion(given.liveRegion);
    observer = services.createResizeObserver(onSizeChange);
    observer.observe(canvas);
    if (spec.usesMotion === true) {
      motion = services.matchReducedMotion();
      applyMotion();
      motion.addListener(applyMotion);
    }
    if (view !== undefined) unbind = spec.bind?.(view, bindHooks);
    mountedCanvases.add(canvas);
    schedule();
  } catch {
    isDestroyed = true;
    teardown();
    canvas.width = previousPixelWidth;
    canvas.height = previousPixelHeight;
    return serviceFailed();
  }

  if (view !== undefined) for (const notice of view.getNotices()) report(notice);
  for (const notice of sized.notices) report(notice);

  return {
    getView: () => view,
    isDestroyed: () => isDestroyed,
    destroy(): void {
      if (isDestroyed) return;
      isDestroyed = true;
      teardown();
    },
    applySize,
    plan,
  };
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
  const core = mountView<Minimap, { min: number; max: number; zoom?: number }>(
    canvas,
    engine,
    options,
    {
      kind: "minimap",
      usesMotion: true,
      engineFunctions: MINIMAP_ENGINE_FUNCTIONS,
      plan: (given: MinimapMountOptions) => minimapZoomPlan(given),
      build(map, width, height, plan) {
        const minimap = Minimap.create(map, {
          width,
          height,
          smoothingDurationMs: options?.smoothingDurationMs,
          images: options?.images,
        });
        if (isViewError(minimap)) return minimap;
        const limitsError = minimap.setZoomLimits(plan.min, plan.max);
        if (limitsError) return limitsError;
        if (plan.zoom !== undefined) {
          const zoomError = minimap.setZoom(plan.zoom);
          if (zoomError) return zoomError;
        }
        return minimap;
      },
    },
  );
  if (isViewError(core)) return core;
  const { getView, isDestroyed } = core;
  return {
    destroy: core.destroy,
    setZoom: (zoom) => {
      if (isDestroyed()) return destroyed();
      const view = getView();
      if (view !== undefined) return view.setZoom(zoom);
      // No map yet: check as the View does and keep the value for the first map.
      const { plan } = core;
      if (!zoomInRange(zoom) || zoom < plan.min || zoom > plan.max) {
        return outOfRange("zoom", `a number from ${plan.min} to ${plan.max}`);
      }
      plan.zoom = zoom;
      return undefined;
    },
    setZoomLimits: (min, max) => {
      if (isDestroyed()) return destroyed();
      const view = getView();
      if (view !== undefined) return view.setZoomLimits(min, max);
      const rule = `a number from ${ZOOM_RANGE_MIN} to ${ZOOM_RANGE_MAX}`;
      if (!zoomInRange(min)) return outOfRange("minimum zoom", rule);
      if (!zoomInRange(max)) return outOfRange("maximum zoom", rule);
      if (!(min < max)) return outOfRange("minimum zoom", "below the maximum zoom");
      const { plan } = core;
      plan.min = min;
      plan.max = max;
      if (plan.zoom !== undefined) plan.zoom = Math.min(Math.max(plan.zoom, min), max);
      return undefined;
    },
    resize: () => (isDestroyed() ? destroyed() : core.applySize()),
  };
}

// ---------------------------------------------------------------------------
// mountFullMap

/**
 * Puts a Full_Map on a canvas, binds its mouse, touch and keyboard input and
 * starts its frame loop. A selection goes to the engine as a destination
 * (or to `onSelect`, when given). Returns a handle, or a ViewError and
 * mounts nothing.
 */
export function mountFullMap(
  canvas: FullMapCanvas,
  engine: FullMapEngine,
  options?: FullMapMountOptions,
): FullMapHandle | ViewError {
  const core = mountView<FullMap, { min?: number; max?: number }>(
    canvas,
    engine,
    options,
    {
      kind: "fullMap",
      engineFunctions: FULL_MAP_ENGINE_FUNCTIONS,
      plan: (given: FullMapMountOptions) => fullMapZoomPlan(given),
      checkCanvas: (candidate) =>
        isBindableCanvas(candidate) ? undefined : outOfRange("canvas", "a canvas element that can take input"),
      build(map, width, height, plan) {
        const view = FullMap.create(map, {
          engine,
          onSelect: options?.onSelect,
          width,
          height,
          images: options?.images,
        });
        if (isViewError(view)) return view;
        if (plan.min !== undefined || plan.max !== undefined) {
          const limits = view.getZoomLimits();
          const error = view.setZoomLimits(plan.min ?? limits.min, plan.max ?? limits.max);
          if (error) return error;
        }
        return view;
      },
      bind(view, hooks) {
        return bindInput(canvas, view, {
          onChange: (change) => {
            if (isViewError(change)) {
              hooks.report({ message: change.message });
              return;
            }
            for (const notice of change.notices) hooks.report(notice);
            if (change.announcement !== undefined) hooks.announce(change.announcement);
          },
          onSelectResult: (result) => {
            if (isViewError(result)) hooks.report({ message: result.message });
            else if (result.noWayMessage !== undefined) hooks.report({ message: result.noWayMessage });
          },
        });
      },
    },
  );
  if (isViewError(core)) return core;
  const { getView, isDestroyed } = core;
  /** Runs a control on the View; a destroyed handle or a missing first map is a ViewError. */
  const withView = <R>(control: string, run: (view: FullMap) => R): R | ViewError => {
    if (isDestroyed()) return destroyed();
    const view = getView();
    return view === undefined ? noMapYet(control) : run(view);
  };

  const change = (result: FullMapChange | ViewError): ViewError | undefined => {
    if (isViewError(result)) return result;
    for (const notice of result.notices) {
      try {
        options?.onNotice?.(notice);
      } catch {
        // A failing callback of the application must not stop the view.
      }
    }
    return undefined;
  };

  return {
    destroy: core.destroy,
    pan: (dx, dy) => withView("pan", (view) => change(view.pan(dx, dy))),
    zoomAt: (anchor, factor) => withView("zoomAt", (view) => change(view.zoomAt(anchor, factor))),
    fit: () => withView("fit", (view) => change(view.fit())),
    follow: () => withView("follow", (view) => change(view.follow())),
    select: (screenPoint) => withView("select", (view) => view.select(screenPoint)),
    selectPlace: (placeId) => withView("selectPlace", (view) => view.selectPlace(placeId)),
    resize: () => (isDestroyed() ? destroyed() : core.applySize()),
  };
}

// ---------------------------------------------------------------------------
// mountTiltedView

/**
 * Puts a Tilted_View on a canvas and starts its frame loop. Returns a handle,
 * or a ViewError and mounts nothing.
 */
export function mountTiltedView(
  canvas: MountableCanvas,
  engine: MinimapEngine,
  options?: TiltedViewMountOptions,
): TiltedViewHandle | ViewError {
  const core = mountView<TiltedView, { tilt?: number; factors: Array<[string, number]> }>(
    canvas,
    engine,
    options,
    {
      kind: "tiltedView",
      usesMotion: true,
      engineFunctions: MINIMAP_ENGINE_FUNCTIONS,
      plan: (given: TiltedViewMountOptions) => tiltedPlan(given),
      build(map, width, height, plan) {
        const view = TiltedView.create(map, {
          width,
          height,
          smoothingDurationMs: options?.smoothingDurationMs,
          images: options?.images,
        });
        if (isViewError(view)) return view;
        if (plan.tilt !== undefined) {
          const tiltError = view.setTiltAngle(plan.tilt);
          if (tiltError) return tiltError;
        }
        for (const [kind, factor] of plan.factors) {
          const factorError = view.setHeightFactor(kind, factor);
          if (factorError) return factorError;
        }
        return view;
      },
    },
  );
  if (isViewError(core)) return core;
  const { getView, isDestroyed } = core;
  return {
    destroy: core.destroy,
    setTiltAngle: (degrees) => {
      if (isDestroyed()) return destroyed();
      const view = getView();
      if (view !== undefined) return view.setTiltAngle(degrees);
      const error = validateTilt(degrees);
      if (error) return error;
      core.plan.tilt = degrees;
      return undefined;
    },
    setHeightFactor: (kind, factor) => {
      if (isDestroyed()) return destroyed();
      const view = getView();
      if (view !== undefined) return view.setHeightFactor(kind, factor);
      const error = validateHeightFactor(kind, factor);
      if (error) return error;
      const { factors } = core.plan;
      const existing = factors.find(([name]) => name === kind);
      if (existing) existing[1] = factor;
      else factors.push([kind, factor]);
      return undefined;
    },
    resize: () => (isDestroyed() ? destroyed() : core.applySize()),
  };
}
