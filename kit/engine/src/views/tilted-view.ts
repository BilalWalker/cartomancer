// The Tilted_View: a map seen from above at a slant under the
// Perspective_Projection, centred on the player with the heading up the screen
// and the player in the lower part of the viewport. Ground layers, roads and
// pictures are drawn point by point (or in depth bands for pictures) under the
// identity transform; raised blocks (buildings and similar props) are drawn
// afterwards, farther before nearer, each with a top face and the darker side
// faces that look towards the eye. It owns a camera that follows the player
// through `advanceCamera` and draws only when its FrameGate says a frame is
// due. No browser code.

import type { EngineMap, Position, PropData, Route } from "../types.js";
import type { Camera, Point } from "./camera.js";
import { validateCamera } from "./camera.js";
import { blockHeightOf, largestBlockHeight, RAISED_KINDS, validateHeightFactor } from "./block-height.js";
import type { CanvasInterface } from "./canvas-interface.js";
import { drawIfDue, FrameGate } from "./frame-gate.js";
import {
  buildImagesSignature,
  collectPictureReferences,
  createPictureResolver,
  pictureRefOfKind,
  type ImageLookup,
} from "./image-lookup.js";
import { drawPlaceLabels } from "./layers-places.js";
import {
  ROUTE_LINE_MAX_WIDTH_PX,
  ROUTE_LINE_MIN_WIDTH_PX,
  validatePosition,
} from "./layers-route.js";
import { inspectMap } from "./map-inspect.js";
import { headingUpRotation } from "./minimap.js";
import {
  advanceCamera,
  DEFAULT_SMOOTHING_MS,
  FrameClock,
  validateSmoothingDuration,
} from "./smoothing.js";
import { resolveStyle, type ResolvedStyle } from "./style.js";
import {
  drawTiltedBlockedAreas,
  drawTiltedDestinationMarker,
  drawTiltedFlatProps,
  drawTiltedGround,
  drawTiltedPlaceMarkers,
  drawTiltedPlayerMarker,
  drawTiltedRouteLine,
  footprintUnderNearClip,
  nearClipPropNotice,
  propFootprintCorners,
  type TiltedGroundView,
} from "./tilted-ground.js";
import { drawTiltedBackgroundPicture, drawTiltedPictureProps } from "./tilted-pictures.js";
import {
  drawTiltedBlockedRoadMarks,
  drawTiltedRoadFills,
  drawTiltedRoadOutlines,
} from "./tilted-roads.js";
import {
  DEFAULT_TILT_DEGREES,
  depthOf,
  eyeGroundPoint,
  PLAYER_ROW_FRACTION,
  projectTilted,
  sortByDepth,
  tiltedVisibleRegion,
  validateTilt,
} from "./tilted-projection.js";
import { badSize, isViewError, notice, type Notice, type ViewError } from "./view-errors.js";
import { buildSpatialIndex, computeVisibleSet, type SpatialIndex } from "./visible-set.js";

/** Default viewport size of a Tilted_View, in CSS pixels. */
export const DEFAULT_TILTED_WIDTH_PX = 400;
export const DEFAULT_TILTED_HEIGHT_PX = 300;

/** Default zoom, in CSS pixels per world unit. */
export const DEFAULT_TILTED_ZOOM = 2;

/** The player stands this far down from the top of the viewport, as a fraction of its height. */
export const PLAYER_SCREEN_FRACTION = PLAYER_ROW_FRACTION;

export interface TiltedViewOptions {
  /** Viewport width in CSS pixels. Default 400. */
  width?: number;
  /** Viewport height in CSS pixels. Default 300. */
  height?: number;
  /** CSS pixels per world unit at the player. Default 2. */
  zoom?: number;
  /** Smoothing duration in ms, 1 to 5000. Default 300. */
  smoothingDurationMs?: number;
  /** With reduced motion the camera jumps to its target in the same frame. */
  reducedMotion?: boolean;
  /** Loaded pictures for picture props. */
  images?: ImageLookup;
}

/** What one frame shows. */
export interface TiltedViewState {
  position: Position;
  /** The part of the route not yet travelled. */
  remainingRoute?: Route;
  destinationPlaceId?: string;
}

/** The result of one `draw` call. */
export interface TiltedViewDraw {
  /** False when nothing was due and no canvas call was made. */
  drew: boolean;
  notices: Notice[];
}

interface RaisedBlock {
  id: string;
  ground: Point;
  prop: PropData;
  height: number;
}

export class TiltedView {
  private map: EngineMap;
  private index: SpatialIndex;
  private style: ResolvedStyle;
  private notices: Notice[];
  private images: ImageLookup | undefined;
  private width: number;
  private height: number;
  private zoom: number;
  private tiltDegrees = DEFAULT_TILT_DEGREES;
  private heightFactors: Record<string, number> = {};
  private widestRoad: number;
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
    resolved: ReturnType<typeof resolveStyle>,
    notices: Notice[],
    options: Required<Pick<TiltedViewOptions, "width" | "height" | "zoom" | "smoothingDurationMs" | "reducedMotion">> &
      Pick<TiltedViewOptions, "images">,
  ) {
    this.map = map;
    this.index = buildSpatialIndex(map);
    this.widestRoad = widestRoadOf(map);
    this.style = resolved.resolved;
    this.notices = notices;
    this.images = options.images;
    this.width = options.width;
    this.height = options.height;
    this.zoom = options.zoom;
    this.smoothingDurationMs = options.smoothingDurationMs;
    this.reducedMotion = options.reducedMotion;
  }

  /** Builds a Tilted_View, or returns a ViewError naming the input that cannot be used. */
  static create(map: EngineMap, options: TiltedViewOptions = {}): TiltedView | ViewError {
    const width = options.width ?? DEFAULT_TILTED_WIDTH_PX;
    const height = options.height ?? DEFAULT_TILTED_HEIGHT_PX;
    const sizeError = checkSize(width, height);
    if (sizeError) return sizeError;
    const zoom = options.zoom ?? DEFAULT_TILTED_ZOOM;
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
    return new TiltedView(map, resolved, [...inspected.notices, ...resolved.notices], {
      width,
      height,
      zoom,
      smoothingDurationMs: durationMs,
      reducedMotion: options.reducedMotion ?? false,
      images: options.images,
    });
  }

  /** The notices found when the map was taken. */
  getNotices(): Notice[] {
    return [...this.notices];
  }

  /** A copy of the camera now, or undefined before the first draw. */
  getCamera(): Camera | undefined {
    return this.camera === undefined ? undefined : { ...this.camera };
  }

  /** The tilt angle in degrees. */
  getTiltAngle(): number {
    return this.tiltDegrees;
  }

  /** Sets the tilt angle, 20 to 70 degrees. A value out of range is refused and the old angle is kept. */
  setTiltAngle(degrees: number): ViewError | undefined {
    const error = validateTilt(degrees);
    if (error) return error;
    this.tiltDegrees = degrees;
    this.styleVersion++;
    return undefined;
  }

  /** Sets the height factor of a kind, 0 to 100 (default 1). A value out of range is refused and the old factor is kept. */
  setHeightFactor(kind: string, factor: number): ViewError | undefined {
    const error = validateHeightFactor(kind, factor);
    if (error) return error;
    Object.defineProperty(this.heightFactors, kind, {
      value: factor,
      enumerable: true,
      writable: true,
      configurable: true,
    });
    this.styleVersion++;
    return undefined;
  }

  /** Replaces the map. A map with a coordinate that is not finite is refused and the old map is kept. */
  setMap(map: EngineMap): ViewError | undefined {
    const inspected = inspectMap(map);
    if (!("notices" in inspected)) return inspected;
    const resolved = resolveStyle(map.style);
    this.map = map;
    this.index = buildSpatialIndex(map);
    this.widestRoad = widestRoadOf(map);
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

  /**
   * Draws one frame when one is due. A position that cannot be used or a
   * timestamp that is not finite gives a ViewError and keeps the camera.
   */
  draw(canvas: CanvasInterface, state: TiltedViewState, timestampMs: number): TiltedViewDraw | ViewError {
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

    const target = this.targetCamera(state.position);
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

  /**
   * The camera that puts the player on the player row with the heading up. The
   * Perspective_Projection puts the camera centre on that row, so the centre is
   * the player.
   */
  private targetCamera(position: Position): Camera {
    return {
      centerX: position.x,
      centerY: position.y,
      zoom: this.zoom,
      rotationDegrees: headingUpRotation(position.headingDegrees),
      viewportWidth: this.width,
      viewportHeight: this.height,
    };
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

  /**
   * The margin of the visible region in world units: the widest road, or the
   * route line seen at the smallest scale of the viewport (0.5, at the top row).
   */
  private regionMargin(camera: Camera): number {
    const fill = Math.min(
      ROUTE_LINE_MAX_WIDTH_PX,
      Math.max(ROUTE_LINE_MIN_WIDTH_PX, this.style.routeLineStyle.widthPx),
    );
    const routePx = fill + 2 * this.style.routeLineOutlineStyle.widthPx;
    return Math.max(this.widestRoad, routePx / (0.5 * camera.zoom));
  }

  private paint(canvas: CanvasInterface, camera: Camera, state: TiltedViewState): Notice[] {
    const lift = largestBlockHeight(this.map.props, this.heightFactors);
    const region = tiltedVisibleRegion(camera, this.tiltDegrees, lift, this.regionMargin(camera));
    if (isViewError(region)) return [notice(`${region.message} Nothing was drawn.`)];
    const visible = computeVisibleSet(this.index, region);
    const view: TiltedGroundView = { camera, tiltAngleDegrees: this.tiltDegrees };
    const notices: Notice[] = [];
    const resolve = createPictureResolver(this.images);

    const areas = this.map.blockedAreas.filter((a) => visible.blockedAreaIds.has(a.id));
    const places = this.map.places.filter((p) => visible.placeIds.has(p.id));
    const flat: PropData[] = [];
    const pictures: PropData[] = [];
    const raised: RaisedBlock[] = [];
    for (const prop of this.map.props) {
      if (!visible.propIds.has(prop.id)) continue;
      if (!RAISED_KINDS.includes(prop.kind) || !hasUsableFootprint(prop)) {
        (pictureRefOfKind(prop.kind) === undefined ? flat : pictures).push(prop);
        continue;
      }
      const h = blockHeightOf(prop, this.heightFactors);
      if (typeof h !== "number") {
        notices.push(h);
        flat.push(prop);
        continue;
      }
      raised.push({ id: prop.id, ground: { x: prop.x, y: prop.y }, prop, height: h });
    }

    // Every ground layer is drawn point by point under the identity transform.
    canvas.save();
    notices.push(...drawTiltedGround(canvas, this.style, view));
    notices.push(...drawTiltedBackgroundPicture(canvas, this.map.backgroundPicture, resolve, view));
    notices.push(...drawTiltedBlockedAreas(canvas, this.style, areas, view));
    notices.push(...drawTiltedFlatProps(canvas, this.style, flat, view));
    notices.push(...drawTiltedPictureProps(canvas, this.style, pictures, view, resolve));
    notices.push(...drawTiltedRoadOutlines(canvas, this.map, visible.roadIds, view, this.style));
    notices.push(...drawTiltedRoadFills(canvas, this.map, visible.roadIds, view, this.style));
    notices.push(...drawTiltedBlockedRoadMarks(canvas, this.map, visible.roadIds, view, this.style));
    notices.push(...drawTiltedRouteLine(canvas, state.remainingRoute, this.style, view));
    notices.push(...drawTiltedDestinationMarker(canvas, state.remainingRoute, this.style, view));
    notices.push(...drawTiltedPlaceMarkers(canvas, this.style, places, view));
    canvas.restore();

    notices.push(...this.drawRaisedBlocks(canvas, raised, view));

    canvas.save();
    notices.push(...drawTiltedPlayerMarker(canvas, state.position, this.style, view));
    canvas.restore();

    notices.push(
      ...drawPlaceLabels(
        canvas,
        this.style,
        places,
        camera,
        state.destinationPlaceId,
        undefined,
        (point) => projectTilted(point, 0, this.tiltDegrees, camera),
      ),
    );
    return notices;
  }

  /**
   * Draws the raised blocks, farther before nearer. Each block shows the side
   * faces whose outward normal looks towards the eye (back faces are culled),
   * the farther face first, then the top face. A block with a footprint corner
   * under the near clip is not drawn and one Notice names the prop.
   */
  private drawRaisedBlocks(canvas: CanvasInterface, blocks: RaisedBlock[], view: TiltedGroundView): Notice[] {
    if (blocks.length === 0) return [];
    const { camera } = view;
    const ordered = sortByDepth(blocks, camera);
    if (isViewError(ordered)) return [notice(`${ordered.message} The raised blocks were not drawn.`)];
    const eye = eyeGroundPoint(camera, this.tiltDegrees);
    if (isViewError(eye)) return [notice(`${eye.message} The raised blocks were not drawn.`)];
    const notices: Notice[] = [];
    canvas.save();
    canvas.setStrokeColor(this.style.roadOutlineColor);
    canvas.setLineWidth(this.style.propOutlineStyle.widthPx);
    canvas.setLineDash([]);
    canvas.setLineJoin("round");
    for (const block of ordered) {
      if (footprintUnderNearClip(block.prop, view)) {
        notices.push(nearClipPropNotice(block.id));
        continue;
      }
      const corners = propFootprintCorners(block.prop);
      const base: Point[] = [];
      const top: Point[] = [];
      for (const corner of corners) {
        const b = projectTilted(corner, 0, this.tiltDegrees, camera);
        const t = projectTilted(corner, block.height, this.tiltDegrees, camera);
        if (isViewError(b) || isViewError(t)) break;
        base.push(b);
        top.push(t);
      }
      if (base.length !== corners.length) {
        notices.push(notice(`The prop "${block.id}" could not be placed on the screen, so it was not drawn.`));
        continue;
      }
      if (block.height > 0) {
        canvas.setFillColor(this.style.raisedBlockSideColor);
        for (const i of facesTowardsEye(corners, eye, camera)) {
          const j = (i + 1) % base.length;
          tracePolygon(canvas, [base[i]!, base[j]!, top[j]!, top[i]!]);
          canvas.fill();
          canvas.stroke();
        }
      }
      canvas.setFillColor(this.style.raisedBlockTopColor);
      tracePolygon(canvas, top);
      canvas.fill();
      canvas.stroke();
    }
    canvas.restore();
    return notices;
  }
}

/**
 * The side faces of a footprint (face `i` runs from corner `i` to corner `i+1`)
 * whose outward normal on the ground points towards the eye's ground point,
 * the farther face first. The outward side follows from the sign of the area of
 * the footprint, so the order of the corners does not matter.
 */
function facesTowardsEye(corners: readonly Point[], eye: Point, camera: Camera): number[] {
  let area = 0;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i]!;
    const b = corners[(i + 1) % corners.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  const side = area >= 0 ? 1 : -1;
  const faces: { index: number; depth: number }[] = [];
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i]!;
    const b = corners[(i + 1) % corners.length]!;
    const nx = side * (b.y - a.y);
    const ny = -side * (b.x - a.x);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (nx * (eye.x - mid.x) + ny * (eye.y - mid.y) > 0) {
      const depth = depthOf(mid, camera);
      faces.push({ index: i, depth: typeof depth === "number" ? depth : 0 });
    }
  }
  faces.sort((a, b) => a.depth - b.depth);
  return faces.map((f) => f.index);
}

function tracePolygon(canvas: CanvasInterface, points: readonly Point[]): void {
  canvas.beginPath();
  canvas.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) canvas.lineTo(points[i]!.x, points[i]!.y);
  canvas.closePath();
}

/** The widest usable road width of the map, in world units (0 when there is none). */
function widestRoadOf(map: EngineMap): number {
  let widest = 0;
  for (const road of map.roads) {
    if (Number.isFinite(road.width) && road.width > widest) widest = road.width;
  }
  return widest;
}

function hasUsableFootprint(prop: PropData): boolean {
  return (
    Number.isFinite(prop.x) &&
    Number.isFinite(prop.y) &&
    Number.isFinite(prop.width) &&
    prop.width > 0 &&
    Number.isFinite(prop.height) &&
    prop.height > 0 &&
    Number.isFinite(prop.rotationDegrees)
  );
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
