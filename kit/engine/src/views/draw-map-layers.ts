// Draws the layers of the Full_Map and the Minimap in one fixed order:
// ground, blocked areas, flat props, road outlines, road fills, blocked
// road marks, route line, destination marker, place markers, place
// labels, player marker.
//
// The world layers draw under the camera transform. Place labels draw in
// screen coordinates (CSS pixels), so they are drawn outside that transform.

import type { EngineMap, Position, Route } from "../types.js";
import { validateCamera, type Camera } from "./camera.js";
import type { CanvasInterface } from "./canvas-interface.js";
import { createPictureResolver, type ImageLookup } from "./image-lookup.js";
import {
  drawBackgroundPicture,
  drawBlockedAreas,
  drawFlatProps,
  drawGround,
} from "./layers-areas.js";
import { drawPlaceLabels, drawPlaceMarkers } from "./layers-places.js";
import {
  drawBlockedRoadMarks,
  drawRoadFills,
  drawRoadOutlines,
} from "./layers-roads.js";
import { drawDestinationMarker, drawPlayerMarker, drawRouteLine } from "./layers-route.js";
import type { ResolvedStyle } from "./style.js";
import { notice, type Notice } from "./view-errors.js";
import { visibleRegion, type VisibleSet } from "./visible-set.js";

/** The layers, in the order they are drawn. */
export const LAYER_ORDER = [
  "ground",
  "backgroundPicture",
  "blockedAreas",
  "flatProps",
  "roadOutlines",
  "roadFills",
  "blockedRoadMarks",
  "routeLine",
  "destinationMarker",
  "placeMarkers",
  "placeLabels",
  "playerMarker",
] as const;

export type LayerName = (typeof LAYER_ORDER)[number];

export interface DrawMapLayersInput {
  map: EngineMap;
  style: ResolvedStyle;
  camera: Camera;
  /** The items to draw, from `computeVisibleSet`. */
  visible: VisibleSet;
  /** The part of the route not yet travelled; none when no route is active. */
  remainingRoute?: Route;
  position: Position;
  destinationPlaceId?: string;
  /** Loaded pictures for picture props; without it they are drawn as placeholders. */
  images?: ImageLookup;
  /** Called just before each layer is drawn; tests use it to split the call log by layer. */
  onLayer?: (layer: LayerName) => void;
}

function applyCameraTransform(canvas: CanvasInterface, camera: Camera): void {
  canvas.translate(camera.viewportWidth / 2, camera.viewportHeight / 2);
  canvas.rotate((camera.rotationDegrees * Math.PI) / 180);
  canvas.scale(camera.zoom, camera.zoom);
  canvas.translate(-camera.centerX, -camera.centerY);
}

/** Draws every layer once, in the fixed order. Returns the notices the layers report. */
export function drawMapLayers(canvas: CanvasInterface, input: DrawMapLayersInput): Notice[] {
  const { map, style, camera, visible, remainingRoute, position, destinationPlaceId } = input;
  const mark = input.onLayer ?? ((): void => {});
  const cameraError = validateCamera(camera);
  if (cameraError !== undefined) {
    return [notice(`${cameraError.message} Nothing was drawn.`)];
  }
  const region = visibleRegion(camera, 0);
  if ("message" in region) return [notice(`${region.message} Nothing was drawn.`)];

  const notices: Notice[] = [];
  const resolve = createPictureResolver(input.images);
  const areas = map.blockedAreas.filter((a) => visible.blockedAreaIds.has(a.id));
  const props = map.props.filter((p) => visible.propIds.has(p.id));
  const places = map.places.filter((p) => visible.placeIds.has(p.id));

  canvas.save();
  applyCameraTransform(canvas, camera);
  mark("ground");
  notices.push(...drawGround(canvas, style, region));
  mark("backgroundPicture");
  notices.push(...drawBackgroundPicture(canvas, map.backgroundPicture, resolve, region));
  mark("blockedAreas");
  notices.push(...drawBlockedAreas(canvas, style, areas, camera.zoom));
  mark("flatProps");
  notices.push(...drawFlatProps(canvas, style, props, camera.zoom, resolve));
  mark("roadOutlines");
  notices.push(...drawRoadOutlines(canvas, map, visible.roadIds, camera, style));
  mark("roadFills");
  notices.push(...drawRoadFills(canvas, map, visible.roadIds, camera, style));
  mark("blockedRoadMarks");
  notices.push(...drawBlockedRoadMarks(canvas, map, visible.roadIds, camera, style));
  mark("routeLine");
  notices.push(...drawRouteLine(canvas, remainingRoute, camera, style));
  mark("destinationMarker");
  notices.push(...drawDestinationMarker(canvas, remainingRoute, camera, style));
  mark("placeMarkers");
  notices.push(...drawPlaceMarkers(canvas, style, places, camera));
  canvas.restore();

  mark("placeLabels");
  notices.push(...drawPlaceLabels(canvas, style, places, camera, destinationPlaceId));

  canvas.save();
  applyCameraTransform(canvas, camera);
  mark("playerMarker");
  notices.push(...drawPlayerMarker(canvas, position, camera, style));
  canvas.restore();
  return notices;
}
