// The Full_Map: a north-up map the player can pan and zoom. It owns a camera
// with rotation 0, keeps the zoom inside limits, keeps part of the map in
// view when panning, can fit the whole map or follow the player, and draws
// only when its FrameGate says a frame is due. No browser code.

import type { Destination, EngineError, EngineMap, NoWayResult, Position, Route } from "../types.js";
import { isNoUsableRoad, snapToRoad } from "../snapping.js";
import type { Camera, Point } from "./camera.js";
import { panCamera, screenToWorld, validateCamera, worldToScreen, zoomCamera } from "./camera.js";
import { HIT_RADIUS_PX, hitTestPlace, type HitPlace } from "./hit-test.js";
import type { CanvasInterface } from "./canvas-interface.js";
import { drawMapLayers } from "./draw-map-layers.js";
import { drawIfDue, FrameGate } from "./frame-gate.js";
import {
  buildImagesSignature,
  collectPictureReferences,
  type ImageLookup,
} from "./image-lookup.js";
import type { InputCommand } from "./input-state-machine.js";
import { validatePosition } from "./layers-route.js";
import { inspectMap } from "./map-inspect.js";
import { FrameClock } from "./smoothing.js";
import { resolveStyle, type ResolvedStyle } from "./style.js";
import {
  badNumber,
  badSize,
  isViewError,
  notice,
  outOfRange,
  type Notice,
  type ViewError,
} from "./view-errors.js";
import {
  buildSpatialIndex,
  computeVisibleSet,
  visibleRegion,
  type Bounds,
  type SpatialIndex,
} from "./visible-set.js";

/** Default Full_Map viewport size, in CSS pixels. */
export const DEFAULT_FULL_MAP_WIDTH_PX = 400;
export const DEFAULT_FULL_MAP_HEIGHT_PX = 300;

/** Default highest zoom, in CSS pixels per world unit. */
export const DEFAULT_FULL_MAP_ZOOM_MAX = 8;

/** The margin the fit command leaves on every side, as a fraction of the viewport. */
export const FIT_MARGIN_FRACTION = 0.05;

/** The part of the map extent, per direction, that panning keeps in view. */
export const PAN_KEEP_FRACTION = 0.2;

/** Smallest extent, in world units, used for fitting and for the pan limit. */
export const MIN_EXTENT_UNITS = 1;

const ZOOM_RANGE_MIN = 0.001;
const ZOOM_RANGE_MAX = 1000;

/** The part of the Engine a selection talks to. The view computes no route itself. */
export interface DestinationTarget {
  setDestination(destination: Destination): Route | NoWayResult | EngineError;
}

/** What a selection hit: a place marker, or a spot on the map. */
export type FullMapSelection =
  | { kind: "place"; placeId: string }
  | { kind: "point"; point: { x: number; y: number } };

/** The result of a selection that was accepted. */
export interface FullMapSelectResult {
  selection: FullMapSelection;
  /** True when the caller's handler took the selection and no destination was set. */
  handled: boolean;
  /** The route the Engine found, when it found one. */
  route?: Route;
  /** The plain-worded message of a No_Way_Result, to show to the caller. */
  noWayMessage?: string;
}

/** The farthest a selected spot may be from a road: 100 world units. */
export const SELECT_MAX_ROAD_DISTANCE_UNITS = 100;
/** The farthest a selected spot may be from a road: 200 CSS pixels. */
export const SELECT_MAX_ROAD_DISTANCE_PX = 200;

export interface FullMapOptions {
  /** The Engine that receives the destination of a selection. */
  engine?: DestinationTarget;
  /** When given, called with the selection instead of setting the destination. */
  onSelect?: (selection: FullMapSelection) => void;
  /** Viewport width in CSS pixels. Default 400. */
  width?: number;
  /** Viewport height in CSS pixels. Default 300. */
  height?: number;
  /** Loaded pictures for picture props and the background picture. */
  images?: ImageLookup;
}

/** What one frame shows. */
export interface FullMapState {
  position: Position;
  /** The part of the route not yet travelled. */
  remainingRoute?: Route;
  destinationPlaceId?: string;
}

/** The result of one `draw` call. */
export interface FullMapDraw {
  /** False when nothing was due and no canvas call was made. */
  drew: boolean;
  notices: Notice[];
}

/** The result of a camera operation that worked. */
export interface FullMapChange {
  notices: Notice[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function checkSize(width: number, height: number): ViewError | undefined {
  const probe = (name: string, value: number): ViewError | undefined =>
    isFiniteNumber(value) && value >= 1 && value <= 16384 ? undefined : badSize(name, 1, 16384);
  return probe("viewport width", width) ?? probe("viewport height", height);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** The bounding box of every item of the index, or undefined when there is none. */
function extentOf(index: SpatialIndex): Bounds | undefined {
  if (index.items.length === 0) return undefined;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const item of index.items) {
    minX = Math.min(minX, item.bounds.minX);
    minY = Math.min(minY, item.bounds.minY);
    maxX = Math.max(maxX, item.bounds.maxX);
    maxY = Math.max(maxY, item.bounds.maxY);
  }
  // An extent under one unit in a direction is widened to one unit around its centre.
  if (maxX - minX < MIN_EXTENT_UNITS) {
    const mid = (minX + maxX) / 2;
    minX = mid - MIN_EXTENT_UNITS / 2;
    maxX = mid + MIN_EXTENT_UNITS / 2;
  }
  if (maxY - minY < MIN_EXTENT_UNITS) {
    const mid = (minY + maxY) / 2;
    minY = mid - MIN_EXTENT_UNITS / 2;
    maxY = mid + MIN_EXTENT_UNITS / 2;
  }
  return { minX, minY, maxX, maxY };
}

export class FullMap {
  private map: EngineMap;
  private index: SpatialIndex;
  private extent: Bounds | undefined;
  private style: ResolvedStyle;
  private notices: Notice[];
  private images: ImageLookup | undefined;
  private engine: DestinationTarget | undefined;
  private onSelect: ((selection: FullMapSelection) => void) | undefined;
  private camera: Camera;
  private zoomMin = ZOOM_RANGE_MIN;
  private zoomMax = DEFAULT_FULL_MAP_ZOOM_MAX;
  private customLimits = false;
  private following = false;
  private lastPosition: Position | undefined;
  private lastRoute: Route | undefined;
  private lastDestination: string | undefined;

  private mapVersion = 0;
  private routeVersion = 0;
  private positionVersion = 0;
  private cameraVersion = 0;
  private viewportVersion = 0;
  private styleVersion = 0;

  private readonly gate = new FrameGate();
  private readonly clock = new FrameClock();

  private constructor(
    map: EngineMap,
    resolved: ReturnType<typeof resolveStyle>,
    notices: Notice[],
    width: number,
    height: number,
    images: ImageLookup | undefined,
  ) {
    this.map = map;
    this.index = buildSpatialIndex(map);
    this.extent = extentOf(this.index);
    this.style = resolved.resolved;
    this.notices = notices;
    this.images = images;
    this.camera = {
      centerX: 0,
      centerY: 0,
      zoom: 1,
      rotationDegrees: 0,
      viewportWidth: width,
      viewportHeight: height,
    };
    this.refreshDefaultLimits();
    this.camera = this.fitCamera(this.camera) ?? { ...this.camera, zoom: clamp(1, this.zoomMin, this.zoomMax) };
  }

  /** Builds a Full_Map, or returns a ViewError naming the input that cannot be used. */
  static create(map: EngineMap, options: FullMapOptions = {}): FullMap | ViewError {
    const width = options.width ?? DEFAULT_FULL_MAP_WIDTH_PX;
    const height = options.height ?? DEFAULT_FULL_MAP_HEIGHT_PX;
    const sizeError = checkSize(width, height);
    if (sizeError) return sizeError;
    const inspected = inspectMap(map);
    if (!("notices" in inspected)) return inspected;
    const resolved = resolveStyle(map.style);
    const notices = [...inspected.notices, ...resolved.notices];
    const view = new FullMap(map, resolved, notices, width, height, options.images);
    view.engine = options.engine;
    view.onSelect = options.onSelect;
    return view;
  }

  /**
   * Handles a selection (click or tap) at a screen point in CSS pixels. A
   * place marker within 20 px is chosen first; otherwise the point is
   * converted to a world point. The destination goes to the Engine, or to the
   * caller's handler when there is one. The view finds no route itself.
   */
  select(screenPoint: Point): FullMapSelectResult | ViewError {
    const { viewportWidth: w, viewportHeight: h } = this.camera;
    if (
      !isFiniteNumber(screenPoint?.x) ||
      !isFiniteNumber(screenPoint?.y) ||
      screenPoint.x < 0 ||
      screenPoint.y < 0 ||
      screenPoint.x > w ||
      screenPoint.y > h
    ) {
      return {
        message: "The selection is outside the map view, so no destination was set.",
        field: "selection",
      };
    }

    const markers: HitPlace[] = [];
    for (const place of this.map.places) {
      const screen = worldToScreen(this.camera, { x: place.x, y: place.y });
      if (isViewError(screen)) continue;
      markers.push({ id: place.id, screenX: screen.x, screenY: screen.y });
    }
    const hit = hitTestPlace(markers, screenPoint, HIT_RADIUS_PX);
    if (hit !== undefined) {
      return this.deliver({ kind: "place", placeId: hit.id }, { placeId: hit.id });
    }

    if (this.map.usableRoadIds.size === 0) {
      return { message: "The map has no usable road, so no destination was set.", field: "map" };
    }
    const world = screenToWorld(this.camera, screenPoint);
    if (isViewError(world)) return world;
    const snapped = snapToRoad(this.map, world);
    if (isNoUsableRoad(snapped)) {
      return { message: "The map has no usable road, so no destination was set.", field: "map" };
    }
    const limit = Math.min(SELECT_MAX_ROAD_DISTANCE_UNITS, SELECT_MAX_ROAD_DISTANCE_PX / this.camera.zoom);
    if (Math.hypot(snapped.x - world.x, snapped.y - world.y) > limit) {
      return {
        message: "The selected spot is too far from any road, so no destination was set.",
        field: "selection",
      };
    }
    return this.deliver({ kind: "point", point: { x: world.x, y: world.y } }, { point: { x: world.x, y: world.y } });
  }

  /** Selects a place by identifier, as a hit on its marker would. */
  selectPlace(placeId: string): FullMapSelectResult | ViewError {
    return this.deliver({ kind: "place", placeId }, { placeId });
  }

  private deliver(selection: FullMapSelection, destination: Destination): FullMapSelectResult | ViewError {
    if (this.onSelect !== undefined) {
      this.onSelect(selection);
      return { selection, handled: true };
    }
    if (this.engine === undefined) {
      return {
        message: "The view has no engine and no selection handler, so no destination was set.",
        field: "engine",
      };
    }
    const found = this.engine.setDestination(destination);
    if ("parts" in found) return { selection, handled: false, route: found };
    if ("reason" in found) return { selection, handled: false, noWayMessage: found.message };
    return { message: found.message, field: found.field ?? "selection" };
  }

  /** The notices found when the map was taken (empty map, no usable road, style keys). */
  getNotices(): Notice[] {
    return [...this.notices];
  }

  /** A copy of the camera now. */
  getCamera(): Camera {
    return { ...this.camera };
  }

  /** The current zoom limits, in CSS pixels per world unit. */
  getZoomLimits(): { min: number; max: number } {
    return { min: this.zoomMin, max: this.zoomMax };
  }

  /** True while the camera follows the player (until the next pan). */
  isFollowing(): boolean {
    return this.following;
  }

  /** Replaces the map. A map with a coordinate that is not finite is refused and the old map is kept. */
  setMap(map: EngineMap): ViewError | undefined {
    const inspected = inspectMap(map);
    if (!("notices" in inspected)) return inspected;
    const resolved = resolveStyle(map.style);
    this.map = map;
    this.index = buildSpatialIndex(map);
    this.extent = extentOf(this.index);
    this.style = resolved.resolved;
    this.notices = [...inspected.notices, ...resolved.notices];
    this.refreshDefaultLimits();
    this.setCamera({ ...this.camera, zoom: clamp(this.camera.zoom, this.zoomMin, this.zoomMax) });
    this.mapVersion++;
    this.styleVersion++;
    return undefined;
  }

  /** Sets the loaded pictures; a changed picture makes the next frame due. */
  setImages(images: ImageLookup | undefined): void {
    this.images = images;
  }

  /** Changes the viewport. The world point at the centre stays at the centre. */
  resize(width: number, height: number): ViewError | undefined {
    const error = checkSize(width, height);
    if (error) return error;
    this.camera = { ...this.camera, viewportWidth: width, viewportHeight: height };
    this.refreshDefaultLimits();
    this.camera = { ...this.camera, zoom: clamp(this.camera.zoom, this.zoomMin, this.zoomMax) };
    this.cameraVersion++;
    this.viewportVersion++;
    return undefined;
  }

  /**
   * Sets the lowest and highest zoom. Each must be a finite number from 0.001
   * to 1000 and the minimum must be below the maximum, otherwise the previous
   * limits are kept. A current zoom outside the new limits is moved to the
   * nearest limit.
   */
  setZoomLimits(min: number, max: number): ViewError | undefined {
    const rule = `a number from ${ZOOM_RANGE_MIN} to ${ZOOM_RANGE_MAX}`;
    const inRange = (v: number): boolean => isFiniteNumber(v) && v >= ZOOM_RANGE_MIN && v <= ZOOM_RANGE_MAX;
    if (!inRange(min)) return outOfRange("minimum zoom", rule);
    if (!inRange(max)) return outOfRange("maximum zoom", rule);
    if (!(min < max)) return outOfRange("minimum zoom", "below the maximum zoom");
    this.zoomMin = min;
    this.zoomMax = max;
    this.customLimits = true;
    this.setCamera({ ...this.camera, zoom: clamp(this.camera.zoom, min, max) });
    return undefined;
  }

  /**
   * Moves the map by a screen distance in CSS pixels: what was under the
   * pointer stays under it. The map cannot leave the view: at least 20% of
   * the extent width and height stay inside the viewport. A pan ends following.
   */
  pan(dx: number, dy: number): FullMapChange | ViewError {
    const moved = panCamera(this.camera, { dx, dy });
    if (isViewError(moved)) return moved;
    this.following = false;
    this.setCamera(this.clampPan(moved));
    return { notices: [] };
  }

  /**
   * Multiplies the zoom by `factor` (finite, above 0) and keeps the world
   * point under `anchor` fixed on the screen. A zoom that would pass a limit
   * is set to the limit and reported in a Notice.
   */
  zoomAt(anchor: Point, factor: number): FullMapChange | ViewError {
    const probe = zoomCamera(this.camera, anchor, factor);
    if (isViewError(probe)) return probe;
    const wanted = this.camera.zoom * factor;
    const limited = clamp(wanted, this.zoomMin, this.zoomMax);
    const notices: Notice[] = [];
    let next: Camera;
    if (limited === wanted) {
      next = probe;
    } else {
      const bounded = zoomCamera(this.camera, anchor, limited / this.camera.zoom);
      next = isViewError(bounded) ? this.camera : { ...bounded, zoom: limited };
      notices.push(
        notice(
          wanted < this.zoomMin
            ? "The lowest zoom is reached, so the map is not zoomed out further."
            : "The highest zoom is reached, so the map is not zoomed in further.",
        ),
      );
    }
    this.setCamera(this.following ? next : this.clampPan(next));
    return { notices };
  }

  /**
   * Sets the camera so that the whole extent, with a margin of 5% of the
   * viewport on every side, is inside the viewport. An empty map gives a
   * ViewError and the camera is kept.
   */
  fit(): FullMapChange | ViewError {
    const fitted = this.fitCamera(this.camera);
    if (fitted === undefined) {
      return {
        message: "The map is empty, so there is nothing to fit.",
        field: "map",
      };
    }
    const notices: Notice[] = [];
    const wanted = this.rawFitZoom() as number;
    if (wanted < this.zoomMin) {
      notices.push(notice("The lowest zoom is reached, so the whole map does not fit in the view."));
    }
    this.setCamera(fitted);
    return { notices };
  }

  /** Centres the camera on the player and keeps following until the next pan. */
  follow(): FullMapChange {
    this.following = true;
    if (this.lastPosition !== undefined) this.centreOn(this.lastPosition);
    return { notices: [] };
  }

  /**
   * Applies a command of the input reducer. Commands with a fraction of the
   * viewport (`panFraction`) and a zoom with a null anchor (the viewport
   * centre) are turned into pixel values here. Selection and place focus
   * commands are not handled by the camera and change nothing.
   */
  applyCommand(command: InputCommand): FullMapChange | ViewError {
    switch (command.type) {
      case "pan":
        return this.pan(command.dx, command.dy);
      case "panFraction": {
        if (!isFiniteNumber(command.fx) || !isFiniteNumber(command.fy)) return badNumber("pan fraction");
        return this.pan(command.fx * this.camera.viewportWidth, command.fy * this.camera.viewportHeight);
      }
      case "zoom": {
        const anchor =
          command.anchor === null
            ? { x: this.camera.viewportWidth / 2, y: this.camera.viewportHeight / 2 }
            : command.anchor;
        return this.zoomAt(anchor, command.factor);
      }
      case "fit":
        return this.fit();
      case "follow":
        return this.follow();
      default:
        return { notices: [] };
    }
  }

  /**
   * Draws one frame when one is due. A position that cannot be used or a
   * timestamp that is not finite gives a ViewError and keeps the camera.
   */
  draw(canvas: CanvasInterface, state: FullMapState, timestampMs: number): FullMapDraw | ViewError {
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
    if (this.following) this.centreOn(state.position);
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
        settling: false,
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

  private centreOn(position: Position): void {
    if (this.camera.centerX === position.x && this.camera.centerY === position.y) return;
    this.setCamera({ ...this.camera, centerX: position.x, centerY: position.y });
  }

  private setCamera(camera: Camera): void {
    const a = this.camera;
    if (
      a.centerX !== camera.centerX ||
      a.centerY !== camera.centerY ||
      a.zoom !== camera.zoom ||
      a.viewportWidth !== camera.viewportWidth ||
      a.viewportHeight !== camera.viewportHeight
    ) {
      this.cameraVersion++;
    }
    this.camera = camera;
  }

  /** The zoom at which the extent with its margin just fills the viewport, before any limit. */
  private rawFitZoom(): number | undefined {
    const extent = this.extent;
    if (extent === undefined) return undefined;
    const usable = 1 - 2 * FIT_MARGIN_FRACTION;
    return Math.min(
      (this.camera.viewportWidth * usable) / (extent.maxX - extent.minX),
      (this.camera.viewportHeight * usable) / (extent.maxY - extent.minY),
    );
  }

  private fitCamera(camera: Camera): Camera | undefined {
    const extent = this.extent;
    const raw = this.rawFitZoom();
    if (extent === undefined || raw === undefined) return undefined;
    return {
      ...camera,
      rotationDegrees: 0,
      centerX: (extent.minX + extent.maxX) / 2,
      centerY: (extent.minY + extent.maxY) / 2,
      zoom: clamp(raw, this.zoomMin, this.zoomMax),
    };
  }

  /** Without caller limits: the lowest zoom is the fit zoom, the highest is 8. */
  private refreshDefaultLimits(): void {
    if (this.customLimits) return;
    const raw = this.rawFitZoom();
    this.zoomMax = DEFAULT_FULL_MAP_ZOOM_MAX;
    this.zoomMin = raw === undefined ? ZOOM_RANGE_MIN : clamp(Math.min(raw, this.zoomMax), ZOOM_RANGE_MIN, ZOOM_RANGE_MAX);
  }

  /** Moves the centre so that 20% of the extent width and height stay in the viewport. */
  private clampPan(camera: Camera): Camera {
    const extent = this.extent;
    if (extent === undefined) return camera;
    const axis = (
      centre: number,
      lo: number,
      hi: number,
      viewportPx: number,
    ): number => {
      const half = viewportPx / camera.zoom / 2;
      const need = Math.min(PAN_KEEP_FRACTION * (hi - lo), 2 * half);
      return clamp(centre, lo + need - half, hi - need + half);
    };
    return {
      ...camera,
      centerX: axis(camera.centerX, extent.minX, extent.maxX, camera.viewportWidth),
      centerY: axis(camera.centerY, extent.minY, extent.maxY, camera.viewportHeight),
    };
  }

  private paint(canvas: CanvasInterface, camera: Camera, state: FullMapState): Notice[] {
    const cameraError = validateCamera(camera);
    if (cameraError) return [notice(`${cameraError.message} Nothing was drawn.`)];
    const region = visibleRegion(camera, 0);
    if (isViewError(region)) return [notice(`${region.message} Nothing was drawn.`)];
    const visible = computeVisibleSet(this.index, region);
    return drawMapLayers(canvas, {
      map: this.map,
      style: this.style,
      camera,
      visible,
      remainingRoute: state.remainingRoute,
      position: state.position,
      destinationPlaceId: state.destinationPlaceId,
      images: this.images,
    });
  }
}
