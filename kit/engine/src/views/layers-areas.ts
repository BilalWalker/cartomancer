// Ground, blocked areas and flat props. All three draw in world
// coordinates: the caller has set the camera transform on the canvas.
// `zoom` converts the CSS pixel widths of the style into world units.
// Props play no part in routes or guidance.

import type { BlockedAreaData, PropData } from "../types.js";
import type { CanvasInterface } from "./canvas-interface.js";
import type { LineStyle, ResolvedStyle } from "./style.js";
import { notice, type Notice } from "./view-errors.js";

/** A rectangle of the world, in world units. */
export interface WorldRegion {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Prop kinds whose Prop is a picture reference; drawn as a labelled placeholder. */
const PICTURE_PREFIXES = ["picture:", "upload:"];

/** Prop kinds drawn as a circle. */
const ROUND_KINDS = new Set(["tree", "bush"]);
/** Prop kinds drawn as a diamond. */
const DIAMOND_KINDS = new Set(["marker", "pin"]);

const LABEL_FONT = "11px sans-serif";

function isPictureKind(kind: string): boolean {
  return PICTURE_PREFIXES.some((p) => kind.startsWith(p));
}

function zoomNotice(): Notice {
  return notice('The input "zoom" must be a finite number above 0, so nothing was drawn.');
}

function applyLine(canvas: CanvasInterface, line: LineStyle, zoom: number): void {
  canvas.setLineWidth(line.widthPx / zoom);
  canvas.setLineDash(line.dash === undefined ? [] : line.dash.map((d) => d / zoom));
  canvas.setLineJoin("round");
  canvas.setLineCap("round");
}

/** Fills the given world region with the ground colour. */
export function drawGround(
  canvas: CanvasInterface,
  style: ResolvedStyle,
  region: WorldRegion,
): Notice[] {
  const values = [region.minX, region.minY, region.maxX, region.maxY];
  if (!values.every((v) => Number.isFinite(v))) {
    return [notice('The input "region" must have finite bounds, so the ground was not drawn.')];
  }
  canvas.setFillColor(style.groundColor);
  canvas.beginPath();
  canvas.moveTo(region.minX, region.minY);
  canvas.lineTo(region.maxX, region.minY);
  canvas.lineTo(region.maxX, region.maxY);
  canvas.lineTo(region.minX, region.maxY);
  canvas.closePath();
  canvas.fill();
  return [];
}

/** Draws each blocked area as a filled polygon in the colour of its kind, with an outline. */
export function drawBlockedAreas(
  canvas: CanvasInterface,
  style: ResolvedStyle,
  areas: readonly BlockedAreaData[],
  zoom: number,
): Notice[] {
  if (!Number.isFinite(zoom) || zoom <= 0) return [zoomNotice()];
  const notices: Notice[] = [];
  for (const area of areas) {
    const points = area.polygon;
    if (!Array.isArray(points) || points.length < 3) {
      notices.push(
        notice(
          `The blocked area "${area.id}" has too few points; a polygon needs at least 3 points, so it was not drawn.`,
        ),
      );
      continue;
    }
    if (!points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) {
      notices.push(
        notice(
          `The blocked area "${area.id}" has a point that is not finite, so it was not drawn.`,
        ),
      );
      continue;
    }
    canvas.beginPath();
    canvas.moveTo(points[0]!.x, points[0]!.y);
    for (let i = 1; i < points.length; i++) canvas.lineTo(points[i]!.x, points[i]!.y);
    canvas.closePath();
    canvas.setFillColor(style.blockedAreaColors[area.kind] ?? style.propColor);
    canvas.fill();
    canvas.setStrokeColor(style.roadOutlineColor);
    applyLine(canvas, style.blockedAreaOutlineStyle, zoom);
    canvas.stroke();
  }
  return notices;
}

function propRectangle(canvas: CanvasInterface, w: number, h: number): void {
  canvas.moveTo(-w / 2, -h / 2);
  canvas.lineTo(w / 2, -h / 2);
  canvas.lineTo(w / 2, h / 2);
  canvas.lineTo(-w / 2, h / 2);
  canvas.closePath();
}

/** Draws props flat on the ground as plain shapes chosen by kind. */
export function drawFlatProps(
  canvas: CanvasInterface,
  style: ResolvedStyle,
  props: readonly PropData[],
  zoom: number,
): Notice[] {
  if (!Number.isFinite(zoom) || zoom <= 0) return [zoomNotice()];
  const notices: Notice[] = [];
  for (const prop of props) {
    const bad =
      !Number.isFinite(prop.width) || prop.width <= 0
        ? "width"
        : !Number.isFinite(prop.height) || prop.height <= 0
          ? "height"
          : !Number.isFinite(prop.rotationDegrees)
            ? "rotation"
            : !Number.isFinite(prop.x) || !Number.isFinite(prop.y)
              ? "position"
              : undefined;
    if (bad !== undefined) {
      const rule =
        bad === "width" || bad === "height"
          ? `must be a finite number above 0`
          : `must be finite`;
      notices.push(
        notice(`The prop "${prop.id}" has a ${bad} that ${rule}, so it was not drawn.`),
      );
      continue;
    }
    const w = prop.width;
    const h = prop.height;
    canvas.save();
    canvas.translate(prop.x, prop.y);
    canvas.rotate((prop.rotationDegrees * Math.PI) / 180);
    canvas.beginPath();
    if (ROUND_KINDS.has(prop.kind)) {
      canvas.arc(0, 0, Math.min(w, h) / 2, 0, Math.PI * 2);
      canvas.closePath();
    } else if (DIAMOND_KINDS.has(prop.kind)) {
      canvas.moveTo(0, -h / 2);
      canvas.lineTo(w / 2, 0);
      canvas.lineTo(0, h / 2);
      canvas.lineTo(-w / 2, 0);
      canvas.closePath();
    } else {
      propRectangle(canvas, w, h);
    }
    canvas.setFillColor(style.propColor);
    canvas.fill();
    canvas.setStrokeColor(style.roadOutlineColor);
    applyLine(canvas, style.propOutlineStyle, zoom);
    canvas.stroke();
    canvas.restore();
    if (isPictureKind(prop.kind)) {
      canvas.save();
      canvas.translate(prop.x, prop.y);
      canvas.scale(1 / zoom, 1 / zoom);
      canvas.setFillColor(style.placeLabelTextColor);
      canvas.drawText(prop.kind, 0, 0, LABEL_FONT, "center");
      canvas.restore();
    }
  }
  return notices;
}
