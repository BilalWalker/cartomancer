// Pictures of the Tilted_View under the Perspective_Projection. The canvas
// cannot draw an image under a projective map, so a picture is drawn in depth
// bands: the screen rows of the Viewport are cut into 1 to 43 horizontal strips
// of nearly equal depth ratio (at most 1.02), and each strip that the projected
// picture overlaps gets one `drawImage` call inside its own clip, under an
// affine map that is exact at the middle row of the strip. The destination is
// in world units, the picture outline is exact, and the placement error inside
// a strip is small (see the design, "Pictures").
//
// The caller has set the identity transform on the canvas, as for the ground
// layers of `tilted-ground.ts`. Missing pictures give the placeholder polygon
// of the ground layer and the Notices of Requirement 24.

import type { BackgroundPictureData, PropData } from "../types.js";
import type { Point } from "./camera.js";
import type { CanvasInterface, ImageHandle } from "./canvas-interface.js";
import {
  createPictureResolver,
  pictureRefOfKind,
  type PictureResolver,
} from "./image-lookup.js";
import { checkBackgroundPicture } from "./layers-areas.js";
import type { ResolvedStyle } from "./style.js";
import {
  badPropNotice,
  drawTiltedFlatProps,
  footprintUnderNearClip,
  nearClipPropNotice,
  projectGroundPolygon,
  propFootprintCorners,
  type TiltedGroundView,
} from "./tilted-ground.js";
import { projectPerspective } from "./tilted-projection.js";
import { isViewError, notice, type Notice, type ViewError } from "./view-errors.js";

/** The depth ratio of one band, and so the most bands a picture is cut into. */
export const BAND_DEPTH_RATIO = 1.02;
export const MAX_BANDS = 43;

const LABEL_FONT = "11px sans-serif";
/** A clipped piece with a screen area below this (CSS pixels squared) counts as outside. */
const MIN_PIECE_AREA = 1e-6;

/** A horizontal strip of the Viewport, in CSS pixel rows (top above bottom). */
export interface DepthBand {
  top: number;
  bottom: number;
}

/**
 * The strips that cover the Viewport rows from the bottom (row H) to the top
 * (row 0), nearest strip first. Rows between the ends are rounded to whole CSS
 * pixels, so neighbouring strips share an exact row; strips with no height are
 * dropped. There are 1 to 43 strips; 43 for the default Focal_Distance rule.
 */
export function depthBands(
  viewportHeight: number,
  tiltAngleDegrees: number,
  focalDistancePx: number,
): DepthBand[] {
  const t = (tiltAngleDegrees * Math.PI) / 180;
  const ft = focalDistancePx * Math.tan(t);
  const player = 0.75 * viewportHeight;
  const scaleAt = (row: number): number => (row - player + ft) / ft;
  const rowAt = (z: number): number => player - ft + (ft * focalDistancePx) / z;
  const zBottom = focalDistancePx / scaleAt(viewportHeight);
  const zTop = focalDistancePx / scaleAt(0);
  const ratio = zTop / zBottom;
  const count = Math.min(
    MAX_BANDS,
    Math.max(1, Math.ceil(Math.log(ratio) / Math.log(BAND_DEPTH_RATIO) - 1e-9)),
  );
  const rows: number[] = [viewportHeight];
  for (let k = 1; k < count; k++) {
    const row = Math.round(rowAt(zBottom * Math.pow(ratio, k / count)));
    rows.push(Math.min(viewportHeight, Math.max(0, row)));
  }
  rows.push(0);
  const bands: DepthBand[] = [];
  for (let k = 0; k < count; k++) {
    const bottom = rows[k]!;
    const top = rows[k + 1]!;
    if (top < bottom) bands.push({ top, bottom });
  }
  return bands;
}

function signedArea(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/** Keeps the part of a polygon where `value(p) >= bound`. */
function cutBelow(points: Point[], value: (p: Point) => number, bound: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const cur = points[i]!;
    const prev = points[(i + points.length - 1) % points.length]!;
    const vc = value(cur) - bound;
    const vp = value(prev) - bound;
    const cross = (): Point => {
      const t = vp / (vp - vc);
      return { x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t };
    };
    if (vc >= 0) {
      if (vp < 0) out.push(cross());
      out.push(cur);
    } else if (vp >= 0) {
      out.push(cross());
    }
  }
  return out;
}

/** The screen polygon cut to one strip and to the Viewport columns, or undefined when it is outside. */
function pieceInBand(
  screen: Point[],
  band: DepthBand,
  viewportWidth: number,
): Point[] | undefined {
  let piece = cutBelow(screen, (p) => p.y, band.top);
  if (piece.length > 0) piece = cutBelow(piece, (p) => -p.y, -band.bottom);
  if (piece.length > 0) piece = cutBelow(piece, (p) => p.x, 0);
  if (piece.length > 0) piece = cutBelow(piece, (p) => -p.x, -viewportWidth);
  if (piece.length < 3 || Math.abs(signedArea(piece)) < MIN_PIECE_AREA) return undefined;
  return piece;
}

/** Sets the transform of a strip: ground (world) coordinates to the screen, exact at the strip's middle row. */
function setBandTransform(
  canvas: CanvasInterface,
  view: TiltedGroundView,
  band: DepthBand,
  focalDistancePx: number,
): boolean {
  const { camera, tiltAngleDegrees } = view;
  const t = (tiltAngleDegrees * Math.PI) / 180;
  const ft = focalDistancePx * Math.tan(t);
  const row = (band.top + band.bottom) / 2;
  const s = (row - 0.75 * camera.viewportHeight + ft) / ft;
  if (!(s > 0) || !Number.isFinite(s)) return false;
  const z = focalDistancePx / s;
  const g = (z - focalDistancePx) / Math.cos(t);
  canvas.translate(camera.viewportWidth / 2, row);
  canvas.scale(s, s * s * Math.sin(t));
  // The flat camera maps the world to the screen; the forward offset g of the
  // strip's middle row sits at the viewport centre row minus g.
  canvas.translate(0, g);
  canvas.rotate((camera.rotationDegrees * Math.PI) / 180);
  canvas.scale(camera.zoom, camera.zoom);
  canvas.translate(-camera.centerX, -camera.centerY);
  return true;
}

function clipTo(canvas: CanvasInterface, piece: readonly Point[]): void {
  canvas.beginPath();
  canvas.moveTo(piece[0]!.x, piece[0]!.y);
  for (let i = 1; i < piece.length; i++) canvas.lineTo(piece[i]!.x, piece[i]!.y);
  canvas.closePath();
  canvas.clip();
}

/**
 * Draws one picture in bands. `place` sets the extra transform (for a prop,
 * its position and rotation) and makes the `drawImage` call in world units.
 * Returns the number of calls made.
 */
function drawInBands(
  canvas: CanvasInterface,
  view: TiltedGroundView,
  worldCorners: readonly Point[],
  alpha: number | undefined,
  place: () => void,
): number {
  const projected = projectGroundPolygon(worldCorners, view);
  if (isViewError(projected) || projected.screen === undefined) return 0;
  const { camera, tiltAngleDegrees } = view;
  const bands = depthBands(camera.viewportHeight, tiltAngleDegrees, projected.focalDistancePx);
  let calls = 0;
  for (const band of bands) {
    const piece = pieceInBand(projected.screen, band, camera.viewportWidth);
    if (piece === undefined) continue;
    canvas.save();
    clipTo(canvas, piece);
    if (setBandTransform(canvas, view, band, projected.focalDistancePx)) {
      if (alpha !== undefined) canvas.setGlobalAlpha(alpha);
      place();
      calls += 1;
    }
    canvas.restore();
  }
  return calls;
}

function viewNotice(error: ViewError, what: string): Notice {
  return notice(`${error.message} ${what} was not drawn.`);
}

/**
 * Draws the background picture on the ground plane, its top left corner at the
 * world origin, in depth bands, each with the picture's opacity as alpha. No
 * background, a picture outside the Viewport and the clipped-away ground give
 * no call. A bad scale or opacity or a missing image gives a Notice and no call.
 */
export function drawTiltedBackgroundPicture(
  canvas: CanvasInterface,
  background: BackgroundPictureData | undefined,
  resolve: PictureResolver,
  view: TiltedGroundView,
): Notice[] {
  const checked = checkBackgroundPicture(background, resolve);
  if (checked.size === undefined) return checked.notices;
  const { entry, opacity, width, height } = checked.size;
  const probe = projectGroundPolygon([], view);
  if (isViewError(probe)) return [viewNotice(probe, "The background picture")];
  const corners: Point[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  drawInBands(canvas, view, corners, opacity, () => {
    canvas.drawImage(entry.image as ImageHandle, 0, 0, width, height);
  });
  return [];
}

/**
 * Draws each Picture_Prop of the list flat on the ground, as an image in depth
 * bands, or as the placeholder polygon with the prop kind as its label when the
 * image is missing. A prop with a corner under the near clip is not drawn and
 * gets one Notice; a prop outside the Viewport makes no call. Props whose kind
 * is not a picture kind are ignored.
 */
export function drawTiltedPictureProps(
  canvas: CanvasInterface,
  style: ResolvedStyle,
  props: readonly PropData[],
  view: TiltedGroundView,
  resolve: PictureResolver = createPictureResolver(undefined),
): Notice[] {
  const notices: Notice[] = [];
  for (const prop of props) {
    const ref = pictureRefOfKind(prop.kind);
    if (ref === undefined) continue;
    const bad = badPropNotice(prop);
    if (bad !== undefined) {
      notices.push(bad);
      continue;
    }
    const probe = projectGroundPolygon([], view);
    if (isViewError(probe)) {
      notices.push(viewNotice(probe, "The picture props"));
      break;
    }
    if (footprintUnderNearClip(prop, view)) {
      notices.push(nearClipPropNotice(prop.id));
      continue;
    }
    const found = ref === "" ? { missing: undefined } : resolve(ref);
    if ("entry" in found) {
      const { entry } = found;
      const w = prop.width;
      const h = prop.height;
      drawInBands(canvas, view, propFootprintCorners(prop), undefined, () => {
        canvas.translate(prop.x, prop.y);
        canvas.rotate((prop.rotationDegrees * Math.PI) / 180);
        canvas.drawImage(entry.image as ImageHandle, -w / 2, -h / 2, w, h);
      });
      continue;
    }
    if (found.missing !== undefined) notices.push(found.missing);
    notices.push(
      notice(
        ref === ""
          ? `The prop "${prop.id}" has an empty picture reference, so a placeholder is drawn.`
          : `The prop "${prop.id}" uses the picture "${ref}", which is missing, so a placeholder is drawn.`,
      ),
    );
    notices.push(...drawTiltedFlatProps(canvas, style, [prop], view));
    const outline = projectGroundPolygon(propFootprintCorners(prop), view);
    if (isViewError(outline) || outline.screen === undefined) continue;
    const centre = projectPerspective(
      { x: prop.x, y: prop.y },
      0,
      view.tiltAngleDegrees,
      view.camera,
      outline.focalDistancePx,
    );
    if (isViewError(centre)) continue;
    canvas.setFillColor(style.placeLabelTextColor);
    canvas.drawText(prop.kind, centre.x, centre.y, LABEL_FONT, "center");
  }
  return notices;
}
