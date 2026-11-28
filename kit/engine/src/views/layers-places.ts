// Place markers and place labels.
// `drawPlaceMarkers` draws in world coordinates: the caller has set the
// camera transform on the canvas. `drawPlaceLabels` draws in screen
// coordinates (CSS pixels): the caller has the identity transform, and text
// is drawn centred vertically on the given y.

import type { PlaceData } from "../types.js";
import { worldToScreen, type Camera, type Point } from "./camera.js";
import type { CanvasInterface } from "./canvas-interface.js";
import { placeLabels, type LabelCandidate } from "./label-placement.js";
import type { ResolvedStyle } from "./style.js";
import { isViewError, notice, type Notice, type ViewError } from "./view-errors.js";

/** The label font size is kept between these sizes, in CSS pixels, at every zoom. */
export const LABEL_FONT_MIN_PX = 11;
export const LABEL_FONT_MAX_PX = 16;
/** Default label font size in CSS pixels. */
export const LABEL_FONT_DEFAULT_PX = 12;
/** Marker radius in CSS pixels. */
const MARKER_RADIUS_PX = 5;
/** Space between the label text and the edge of its background, in CSS pixels. */
const LABEL_PADDING_PX = 3;
/** Space between the marker centre and the left edge of its label, in CSS pixels. */
const LABEL_OFFSET_PX = MARKER_RADIUS_PX + 3;

function zoomNotice(): Notice {
  return notice('The input "zoom" must be a finite number above 0, so nothing was drawn.');
}

function badPlace(place: PlaceData): boolean {
  return !Number.isFinite(place.x) || !Number.isFinite(place.y);
}

function emptyName(place: PlaceData): boolean {
  return typeof place.name !== "string" || place.name.trim() === "";
}

function emptyNameNotice(place: PlaceData): Notice {
  return notice(
    `The place "${place.id}" has an empty name, so its marker is drawn without a label.`,
  );
}

/** Draws one round marker per place. A place with a position that is not finite is skipped. */
export function drawPlaceMarkers(
  canvas: CanvasInterface,
  style: ResolvedStyle,
  places: readonly PlaceData[],
  camera: Camera,
): Notice[] {
  if (!Number.isFinite(camera.zoom) || camera.zoom <= 0) return [zoomNotice()];
  const notices: Notice[] = [];
  const radius = MARKER_RADIUS_PX / camera.zoom;
  canvas.setFillColor(style.placeLabelTextColor);
  canvas.setStrokeColor(style.placeLabelBackgroundColor);
  canvas.setLineWidth(1.5 / camera.zoom);
  canvas.setLineDash([]);
  for (const place of places) {
    if (badPlace(place)) {
      notices.push(
        notice(`The place "${place.id}" has a position that is not finite, so it was not drawn.`),
      );
      continue;
    }
    if (emptyName(place)) notices.push(emptyNameNotice(place));
    canvas.beginPath();
    canvas.arc(place.x, place.y, radius, 0, Math.PI * 2);
    canvas.fill();
    canvas.stroke();
  }
  return notices;
}

/**
 * Draws the place labels chosen by `placeLabels`: a background rectangle in
 * the label background colour and the name in the label text colour. The
 * destination place is placed first. `fontPx` is kept between 11 and 16.
 */
export function drawPlaceLabels(
  canvas: CanvasInterface,
  style: ResolvedStyle,
  places: readonly PlaceData[],
  camera: Camera,
  destinationPlaceId?: string,
  fontPx: number = LABEL_FONT_DEFAULT_PX,
  project: (point: Point) => Point | ViewError = (point) => worldToScreen(camera, point),
): Notice[] {
  if (!Number.isFinite(camera.zoom) || camera.zoom <= 0) return [zoomNotice()];
  const notices: Notice[] = [];
  const size = Math.min(
    LABEL_FONT_MAX_PX,
    Math.max(LABEL_FONT_MIN_PX, Number.isFinite(fontPx) ? fontPx : LABEL_FONT_DEFAULT_PX),
  );
  const font = `${size}px sans-serif`;
  const candidates: LabelCandidate[] = [];
  const names = new Map<string, string>();
  for (const place of places) {
    if (badPlace(place)) {
      notices.push(
        notice(`The place "${place.id}" has a position that is not finite, so it was not drawn.`),
      );
      continue;
    }
    if (emptyName(place)) {
      notices.push(emptyNameNotice(place));
      continue;
    }
    const screen = project({ x: place.x, y: place.y });
    if (isViewError(screen)) {
      notices.push(notice(screen.message));
      continue;
    }
    const measured = canvas.measureText(place.name, font);
    const width = measured.width + 2 * LABEL_PADDING_PX;
    const height = measured.height + 2 * LABEL_PADDING_PX;
    names.set(place.id, place.name);
    candidates.push({
      placeId: place.id,
      priority: place.id === destinationPlaceId ? 0 : 1,
      screenX: screen.x + LABEL_OFFSET_PX,
      screenY: screen.y - height / 2,
      width,
      height,
    });
  }
  const placement = placeLabels(candidates, {
    width: camera.viewportWidth,
    height: camera.viewportHeight,
  });
  notices.push(...placement.notices);
  canvas.setLineDash([]);
  for (const label of placement.labels) {
    const { x, y, width, height } = label.rect;
    canvas.setFillColor(style.placeLabelBackgroundColor);
    canvas.beginPath();
    canvas.moveTo(x, y);
    canvas.lineTo(x + width, y);
    canvas.lineTo(x + width, y + height);
    canvas.lineTo(x, y + height);
    canvas.closePath();
    canvas.fill();
    canvas.setFillColor(style.placeLabelTextColor);
    canvas.drawText(names.get(label.placeId) ?? "", x + LABEL_PADDING_PX, y + height / 2, font, "left");
  }
  return notices;
}
