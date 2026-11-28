// The Tilted_View: a map seen from above at a slant, centred on the player
// with the heading up the screen and the player in the lower half. Ground
// layers are drawn under a tilted transform; raised blocks (buildings and
// similar props) are drawn afterwards in screen coordinates, farther before
// nearer, each with a top face and darker side faces. It owns a camera that
// follows the player through `advanceCamera` and draws only when its
// FrameGate says a frame is due. No browser code.

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
  type ImageLookup,
} from "./image-lookup.js";
import { drawBlockedAreas, drawFlatProps, drawGround } from "./layers-areas.js";
import { drawPlaceLabels, drawPlaceMarkers } from "./layers-places.js";
import { drawBlockedRoadMarks, drawRoadFills, drawRoadOutlines } from "./layers-roads.js";
import {
  drawDestinationMarker,
  drawPlayerMarker,
  drawRouteLine,
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
import { DEFAULT_TILT_DEGREES, projectTilted, sortByDepth, validateTilt } from "./tilted-projection.js";
import { badSize, isViewError, notice, type Notice, type ViewError } from "./view-errors.js";
import {
  buildSpatialIndex,
  computeVisibleSet,
  visibleRegion,
  type SpatialIndex,
} from "./visible-set.js";

/** Default viewport size of a Tilted_View, in CSS pixels. */
export const DEFAULT_TILTED_WIDTH_PX = 400;
export const DEFAULT_TILTED_HEIGHT_PX = 300;

/** Default zoom, in CSS pixels per world unit. */
export const DEFAULT_TILTED_ZOOM = 2;

/** The player stands this far down from the top of the viewport, as a fraction of its height. */
export const PLAYER_SCREEN_FRACTION = 0.75;

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
   * The camera that puts the player in the lower part of the viewport with the
   * heading up: its centre lies ahead of the player, far enough that the
   * tilted offset on the screen is the lower share of the viewport height.
   */
  private targetCamera(position: Position): Camera {
    const sin = Math.sin((this.tiltDegrees * Math.PI) / 180);
    const ahead = ((PLAYER_SCREEN_FRACTION - 0.5) * this.height) / (this.zoom * sin);
    const heading = (position.headingDegrees * Math.PI) / 180;
    return {
      centerX: position.x + Math.cos(heading) * ahead,
      centerY: position.y + Math.sin(heading) * ahead,
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

  /** Sets the canvas transform that lays the ground under the tilt. */
  private applyGroundTransform(canvas: CanvasInterface, camera: Camera): void {
    const sin = Math.sin((this.tiltDegrees * Math.PI) / 180);
    canvas.translate(camera.viewportWidth / 2, camera.viewportHeight / 2);
    canvas.scale(1, sin);
    canvas.rotate((camera.rotationDegrees * Math.PI) / 180);
    canvas.scale(camera.zoom, camera.zoom);
    canvas.translate(-camera.centerX, -camera.centerY);
  }

  private paint(canvas: CanvasInterface, camera: Camera, state: TiltedViewState): Notice[] {
    const sin = Math.sin((this.tiltDegrees * Math.PI) / 180);
    const cos = Math.cos((this.tiltDegrees * Math.PI) / 180);
    // The ground seen through the viewport is longer than the viewport, by 1 / sin.
    const groundCamera: Camera = { ...camera, viewportHeight: camera.viewportHeight / sin };
    const lift = largestBlockHeight(this.map.props, this.heightFactors);
    const region = visibleRegion(groundCamera, lift * Math.max(1, cos / sin));
    if (isViewError(region)) return [notice(`${region.message} Nothing was drawn.`)];
    const visible = computeVisibleSet(this.index, region);
    const notices: Notice[] = [];
    const resolve = createPictureResolver(this.images);

    const areas = this.map.blockedAreas.filter((a) => visible.blockedAreaIds.has(a.id));
    const places = this.map.places.filter((p) => visible.placeIds.has(p.id));
    const flat: PropData[] = [];
    const raised: RaisedBlock[] = [];
    for (const prop of this.map.props) {
      if (!visible.propIds.has(prop.id)) continue;
      if (!RAISED_KINDS.includes(prop.kind) || !hasUsableFootprint(prop)) {
        flat.push(prop);
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

    canvas.save();
    this.applyGroundTransform(canvas, camera);
    notices.push(...drawGround(canvas, this.style, region));
    notices.push(...drawBlockedAreas(canvas, this.style, areas, camera.zoom));
    notices.push(...drawFlatProps(canvas, this.style, flat, camera.zoom, resolve));
    notices.push(...drawRoadOutlines(canvas, this.map, visible.roadIds, camera, this.style));
    notices.push(...drawRoadFills(canvas, this.map, visible.roadIds, camera, this.style));
    notices.push(...drawBlockedRoadMarks(canvas, this.map, visible.roadIds, camera, this.style));
    notices.push(...drawRouteLine(canvas, state.remainingRoute, camera, this.style));
    notices.push(...drawDestinationMarker(canvas, state.remainingRoute, camera, this.style));
    notices.push(...drawPlaceMarkers(canvas, this.style, places, camera));
    canvas.restore();

    notices.push(...this.drawRaisedBlocks(canvas, raised, camera));

    canvas.save();
    this.applyGroundTransform(canvas, camera);
    notices.push(...drawPlayerMarker(canvas, state.position, camera, this.style));
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

  /** Draws the raised blocks in screen coordinates, farther before nearer. */
  private drawRaisedBlocks(canvas: CanvasInterface, blocks: RaisedBlock[], camera: Camera): Notice[] {
    if (blocks.length === 0) return [];
    const ordered = sortByDepth(blocks, camera);
    if (isViewError(ordered)) return [notice(`${ordered.message} The raised blocks were not drawn.`)];
    const notices: Notice[] = [];
    canvas.save();
    canvas.setStrokeColor(this.style.roadOutlineColor);
    canvas.setLineWidth(this.style.propOutlineStyle.widthPx);
    canvas.setLineDash([]);
    canvas.setLineJoin("round");
    for (const block of ordered) {
      const corners = footprintCorners(block.prop);
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
        for (let i = 0; i < base.length; i++) {
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

function tracePolygon(canvas: CanvasInterface, points: readonly Point[]): void {
  canvas.beginPath();
  canvas.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) canvas.lineTo(points[i]!.x, points[i]!.y);
  canvas.closePath();
}

/** The four ground corners of a prop's footprint, turned by its rotation about its centre. */
function footprintCorners(prop: PropData): Point[] {
  const r = (prop.rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const hw = prop.width / 2;
  const hh = prop.height / 2;
  return [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ].map(([lx, ly]) => ({
    x: prop.x + lx! * cos - ly! * sin,
    y: prop.y + lx! * sin + ly! * cos,
  }));
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
