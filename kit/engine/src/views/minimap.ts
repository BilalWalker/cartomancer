// The Minimap: a round map that stays centred on the player and turns so
// that the heading points up the screen. It owns a camera that follows the
// player through `advanceCamera`, clips drawing to a circle, draws a rim and
// a North_Mark on the rim, and draws only when its FrameGate says a frame is
// due. No browser code.

import type { EngineMap, Position, Route } from "../types.js";
import type { Camera, Point } from "./camera.js";
import { validateCamera } from "./camera.js";
import type { CanvasInterface } from "./canvas-interface.js";
import { drawMapLayers } from "./draw-map-layers.js";
import { drawIfDue, FrameGate } from "./frame-gate.js";
import {
  buildImagesSignature,
  collectPictureReferences,
  type ImageLookup,
} from "./image-lookup.js";
import { validatePosition } from "./layers-route.js";
import { inspectMap } from "./map-inspect.js";
import {
  advanceCamera,
  DEFAULT_SMOOTHING_MS,
  FrameClock,
  validateSmoothingDuration,
} from "./smoothing.js";
import { resolveStyle, type ResolvedStyle } from "./style.js";
import { badNumber, badSize, isViewError, notice, outOfRange, type Notice, type ViewError } from "./view-errors.js";
import {
  buildSpatialIndex,
  computeVisibleSet,
  visibleRegion,
  type SpatialIndex,
} from "./visible-set.js";

/** Default viewport side of a Minimap, in CSS pixels. */
export const DEFAULT_MINIMAP_SIZE_PX = 200;

/** Default Minimap zoom, in CSS pixels per world unit. */
export const DEFAULT_MINIMAP_ZOOM = 1;

/** Default lowest and highest Minimap zoom. */
export const DEFAULT_MINIMAP_ZOOM_MIN = 0.5;
export const DEFAULT_MINIMAP_ZOOM_MAX = 4;
/** The range any zoom limit must lie in. */
const ZOOM_RANGE_MIN = 0.001;
const ZOOM_RANGE_MAX = 1000;
/** Below this viewport side, in CSS pixels, no circle is drawn. */
const MIN_MINIMAP_SIZE_PX = 40;

/** Size of the North_Mark triangle along the radius, in CSS pixels. */
const NORTH_MARK_LENGTH_PX = 12;
/** Half the width of the North_Mark triangle base, in CSS pixels. */
const NORTH_MARK_HALF_BASE_PX = 5;

/**
 * The camera rotation that turns a heading up the screen. A heading is in
 * degrees clockwise from the positive x axis (Screen_Convention), so the
 * map is turned by the negated heading and a further quarter turn that
 * brings the positive x axis to the top of the screen.
 */
export function headingUpRotation(headingDegrees: number): number {
  return -90 - headingDegrees;
}

/** The corner points of the North_Mark and the direction it points, in CSS pixels. */
export interface NorthMark {
  /** The point on the rim, at the tip of the mark. */
  tip: Point;
  baseLeft: Point;
  baseRight: Point;
  /** Screen direction of world north (0, -1), in degrees clockwise from the screen's positive x axis. */
  directionDegrees: number;
}

/**
 * Where the North_Mark sits for a camera: on the rim of the circle of
 * `radius` CSS pixels around the viewport centre, in the screen direction of
 * the world vector (0, -1). A camera that fails `validateCamera`, or a radius
 * that is not finite and above 0, gives a ViewError.
 */
export function northMarkFor(camera: Camera, radius: number): NorthMark | ViewError {
  const cameraError = validateCamera(camera);
  if (cameraError) return cameraError;
  if (typeof radius !== "number" || !Number.isFinite(radius) || radius <= 0) {
    return badNumber("rim radius");
  }
  const radians = ((camera.rotationDegrees % 360) * Math.PI) / 180;
  // The screen image of the world vector (0, -1) under the camera rotation.
  const ux = Math.sin(radians);
  const uy = -Math.cos(radians);
  const cx = camera.viewportWidth / 2;
  const cy = camera.viewportHeight / 2;
  const inner = Math.max(radius - NORTH_MARK_LENGTH_PX, 0);
  return {
    tip: { x: cx + ux * radius, y: cy + uy * radius },
    baseLeft: { x: cx + ux * inner + uy * NORTH_MARK_HALF_BASE_PX, y: cy + uy * inner - ux * NORTH_MARK_HALF_BASE_PX },
    baseRight: { x: cx + ux * inner - uy * NORTH_MARK_HALF_BASE_PX, y: cy + uy * inner + ux * NORTH_MARK_HALF_BASE_PX },
    directionDegrees: (Math.atan2(uy, ux) * 180) / Math.PI,
  };
}

export interface MinimapOptions {
  /** Viewport width in CSS pixels. Default 200. */
  width?: number;
  /** Viewport height in CSS pixels. Default 200. */
  height?: number;
  /** CSS pixels per world unit. Default 1. */
  zoom?: number;
  /** Smoothing duration in ms, 1 to 5000. Default 300. */
  smoothingDurationMs?: number;
  /** With reduced motion the camera jumps to its target in the same frame. */
  reducedMotion?: boolean;
  /** Loaded pictures for picture props and the background picture. */
  images?: ImageLookup;
}

/** What one frame shows. */
export interface MinimapState {
  position: Position;
  /** The part of the route not yet travelled. */
  remainingRoute?: Route;
  destinationPlaceId?: string;
}

/** The result of one `draw` call. */
export interface MinimapDraw {
  /** False when nothing was due and no canvas call was made. */
  drew: boolean;
  notices: Notice[];
}

export class Minimap {
  private map: EngineMap;
  private index: SpatialIndex;
  private style: ResolvedStyle;
  private notices: Notice[];
  private images: ImageLookup | undefined;
  private width: number;
  private height: number;
  private zoom: number;
  private zoomMin = DEFAULT_MINIMAP_ZOOM_MIN;
  private zoomMax = DEFAULT_MINIMAP_ZOOM_MAX;
  private smoothingDurationMs: number;
  private reducedMotion: boolean;

  private camera: Camera | undefined;
  private lastPosition: Position | undefined;
  private lastRoute: Route | undefined;
  private lastDestination: string | undefined;
  private mapVersion = 0;
  private routeVersion = 0;
  private positionVersion = 0;
  private cameraVersion = 0;
  private viewportVersion = 0;
  private styleVersion = 0;
  private settling = false;

  private readonly gate = new FrameGate();
  private readonly clock = new FrameClock();

  private constructor(
    map: EngineMap,
    index: SpatialIndex,
    resolved: ReturnType<typeof resolveStyle>,
    notices: Notice[],
    options: Required<Pick<MinimapOptions, "width" | "height" | "zoom" | "smoothingDurationMs" | "reducedMotion">> &
      Pick<MinimapOptions, "images">,
  ) {
    this.map = map;
    this.index = index;
    this.style = resolved.resolved;
    this.notices = notices;
    this.images = options.images;
    this.width = options.width;
    this.height = options.height;
    this.zoom = options.zoom;
    this.smoothingDurationMs = options.smoothingDurationMs;
    this.reducedMotion = options.reducedMotion;
  }

  /** Builds a Minimap, or returns a ViewError naming the input that cannot be used. */
  static create(map: EngineMap, options: MinimapOptions = {}): Minimap | ViewError {
    const width = options.width ?? DEFAULT_MINIMAP_SIZE_PX;
    const height = options.height ?? DEFAULT_MINIMAP_SIZE_PX;
    const sizeError = checkSize(width, height);
    if (sizeError) return sizeError;
    const zoom = options.zoom ?? DEFAULT_MINIMAP_ZOOM;
    const durationMs = options.smoothingDurationMs ?? DEFAULT_SMOOTHING_MS;
    const durationError = validateSmoothingDuration(durationMs);
    if (durationError) return durationError;
    const probe = validateCamera({
      centerX: 0,
      centerY: 0,
      zoom,
      rotationDegrees: 0,
      viewportWidth: width,
      viewportHeight: height,
    });
    if (probe) return probe;
    const inspected = inspectMap(map);
    if (!("notices" in inspected)) return inspected;
    const resolved = resolveStyle(map.style);
    const notices = [...inspected.notices, ...resolved.notices];
    return new Minimap(map, buildSpatialIndex(map), resolved, notices, {
      width,
      height,
      zoom,
      smoothingDurationMs: durationMs,
      reducedMotion: options.reducedMotion ?? false,
      images: options.images,
    });
  }

  /** The notices found when the map was taken (empty map, no usable road, style keys). */
  getNotices(): Notice[] {
    return [...this.notices];
  }

  /** A copy of the camera now, or undefined before the first draw. */
  getCamera(): Camera | undefined {
    return this.camera === undefined ? undefined : { ...this.camera };
  }

  /** Replaces the map. A map with a coordinate that is not finite is refused and the old map is kept. */
  setMap(map: EngineMap): ViewError | undefined {
    const inspected = inspectMap(map);
    if (!("notices" in inspected)) return inspected;
    const resolved = resolveStyle(map.style);
    this.map = map;
    this.index = buildSpatialIndex(map);
    this.style = resolved.resolved;
    this.notices = [...inspected.notices, ...resolved.notices];
    this.mapVersion++;
    this.styleVersion++;
    return undefined;
  }

  /** Sets the loaded pictures; a changed picture makes the next frame due. */
  setImages(images: ImageLookup | undefined): void {
    this.images = images;
  }

  setReducedMotion(reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion;
  }

  /** Changes the viewport. The world point at the centre stays at the centre. */
  resize(width: number, height: number): ViewError | undefined {
    const error = checkSize(width, height);
    if (error) return error;
    this.width = width;
    this.height = height;
    if (this.camera !== undefined) {
      this.camera = { ...this.camera, viewportWidth: width, viewportHeight: height };
      this.cameraVersion++;
    }
    this.viewportVersion++;
    return undefined;
  }

  /** The current zoom limits, in CSS pixels per world unit. */
  getZoomLimits(): { min: number; max: number } {
    return { min: this.zoomMin, max: this.zoomMax };
  }

  /** The current zoom, in CSS pixels per world unit. */
  getZoom(): number {
    return this.zoom;
  }

  /**
   * Sets the lowest and highest zoom. Each must be a finite number from 0.001
   * to 1000 and the minimum must be below the maximum, otherwise the previous
   * limits are kept. A current zoom outside the new limits is moved to the
   * nearest limit.
   */
  setZoomLimits(min: number, max: number): ViewError | undefined {
    const rule = `a number from ${ZOOM_RANGE_MIN} to ${ZOOM_RANGE_MAX}`;
    const inRange = (v: number): boolean =>
      typeof v === "number" && Number.isFinite(v) && v >= ZOOM_RANGE_MIN && v <= ZOOM_RANGE_MAX;
    if (!inRange(min)) return outOfRange("minimum zoom", rule);
    if (!inRange(max)) return outOfRange("maximum zoom", rule);
    if (!(min < max)) return outOfRange("minimum zoom", "below the maximum zoom");
    this.zoomMin = min;
    this.zoomMax = max;
    this.zoom = Math.min(Math.max(this.zoom, min), max);
    return undefined;
  }

  /**
   * Sets the zoom. It must be a finite number inside the current limits,
   * otherwise the previous zoom is kept. The player marker stays at the centre.
   */
  setZoom(zoom: number): ViewError | undefined {
    if (typeof zoom !== "number" || !Number.isFinite(zoom) || zoom < this.zoomMin || zoom > this.zoomMax) {
      return outOfRange("zoom", `a number from ${this.zoomMin} to ${this.zoomMax}`);
    }
    this.zoom = zoom;
    return undefined;
  }

  /** The radius of the clip circle (inside the rim), in CSS pixels. */
  private radius(): number {
    return Math.max(Math.min(this.width, this.height) / 2 - this.style.rimStyle.widthPx / 2, 0.5);
  }

  /**
   * Draws one frame when one is due. A position that cannot be used or a
   * timestamp that is not finite gives a ViewError and keeps the camera.
   */
  draw(canvas: CanvasInterface, state: MinimapState, timestampMs: number): MinimapDraw | ViewError {
    const positionError = validatePosition(state.position);
    if (positionError) return positionError;
    const tick = this.clock.tick(timestampMs);
    if (isViewError(tick)) return tick;
    const frameNotices: Notice[] = tick.notice === undefined ? [] : [notice(tick.notice.message)];

    this.notePosition(state.position);
    if (state.remainingRoute !== this.lastRoute || state.destinationPlaceId !== this.lastDestination) {
      this.lastRoute = state.remainingRoute;
      this.lastDestination = state.destinationPlaceId;
      this.routeVersion++;
    }

    const target: Camera = {
      centerX: state.position.x,
      centerY: state.position.y,
      zoom: this.zoom,
      rotationDegrees: headingUpRotation(state.position.headingDegrees),
      viewportWidth: this.width,
      viewportHeight: this.height,
    };
    const previous = this.camera;
    if (previous === undefined) {
      this.camera = target;
      this.settling = false;
    } else {
      const step = advanceCamera(previous, target, tick.dtMs, this.smoothingDurationMs, this.reducedMotion);
      if (isViewError(step)) return step;
      this.camera = step.camera;
      this.settling = step.settling;
    }
    if (previous === undefined || !sameCamera(previous, this.camera)) this.cameraVersion++;
    const camera = this.camera;

    const references = collectPictureReferences(this.map);
    const due = drawIfDue(
      this.gate,
      {
        mapVersion: this.mapVersion,
        routeVersion: this.routeVersion,
        positionVersion: this.positionVersion,
        cameraVersion: this.cameraVersion,
        viewportVersion: this.viewportVersion,
        styleVersion: this.styleVersion,
        imagesSignature: buildImagesSignature(references, this.images),
        settling: this.settling,
        canvasVisible: true,
      },
      () => {
        frameNotices.push(...this.paint(canvas, camera, state));
      },
    );
    return { drew: due, notices: frameNotices };
  }

  private notePosition(position: Position): void {
    const last = this.lastPosition;
    if (
      last === undefined ||
      last.x !== position.x ||
      last.y !== position.y ||
      last.headingDegrees !== position.headingDegrees
    ) {
      this.lastPosition = { ...position };
      this.positionVersion++;
    }
  }

  private paint(canvas: CanvasInterface, camera: Camera, state: MinimapState): Notice[] {
    if (camera.viewportWidth < MIN_MINIMAP_SIZE_PX || camera.viewportHeight < MIN_MINIMAP_SIZE_PX) {
      return [notice(`The minimap needs at least ${MIN_MINIMAP_SIZE_PX} by ${MIN_MINIMAP_SIZE_PX} CSS pixels, so no circle was drawn.`)];
    }
    const region = visibleRegion(camera, 0);
    if (isViewError(region)) return [notice(`${region.message} Nothing was drawn.`)];
    const visible = computeVisibleSet(this.index, region);
    const radius = this.radius();
    const cx = camera.viewportWidth / 2;
    const cy = camera.viewportHeight / 2;

    canvas.save();
    canvas.beginPath();
    canvas.arc(cx, cy, radius, 0, Math.PI * 2);
    canvas.closePath();
    canvas.clip();
    const notices = drawMapLayers(canvas, {
      map: this.map,
      style: this.style,
      camera,
      visible,
      remainingRoute: state.remainingRoute,
      position: state.position,
      destinationPlaceId: state.destinationPlaceId,
      images: this.images,
    });
    canvas.restore();

    // The rim and the North_Mark are drawn in screen coordinates, outside the clip.
    canvas.save();
    canvas.beginPath();
    canvas.arc(cx, cy, radius, 0, Math.PI * 2);
    canvas.closePath();
    canvas.setStrokeColor(this.style.rimColor);
    canvas.setLineWidth(this.style.rimStyle.widthPx);
    canvas.setLineDash(this.style.rimStyle.dash ?? []);
    canvas.stroke();
    const mark = northMarkFor(camera, radius);
    if (!isViewError(mark)) {
      canvas.setLineDash([]);
      canvas.beginPath();
      canvas.moveTo(mark.tip.x, mark.tip.y);
      canvas.lineTo(mark.baseLeft.x, mark.baseLeft.y);
      canvas.lineTo(mark.baseRight.x, mark.baseRight.y);
      canvas.closePath();
      canvas.setFillColor(this.style.northMarkColor);
      canvas.fill();
    }
    canvas.restore();
    return notices;
  }
}

function checkSize(width: number, height: number): ViewError | undefined {
  const probe = (name: string, value: number): ViewError | undefined =>
    typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 16384
      ? undefined
      : badSize(name, 1, 16384);
  return probe("viewport width", width) ?? probe("viewport height", height);
}

function sameCamera(a: Camera, b: Camera): boolean {
  return (
    a.centerX === b.centerX &&
    a.centerY === b.centerY &&
    a.zoom === b.zoom &&
    a.rotationDegrees === b.rotationDegrees &&
    a.viewportWidth === b.viewportWidth &&
    a.viewportHeight === b.viewportHeight
  );
}
