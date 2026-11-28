// Public surface of the Views. Everything here is usable without mount.ts.
// The View `Notice` is exported as `ViewNotice` so it does not clash with the
// engine's `Notice` when src/index.ts re-exports this file.

// Mount functions and their option, handle and canvas types.
export { mountFullMap, mountMinimap, mountTiltedView } from "./mount.js";
export type {
  BaseMountOptions,
  FullMapCanvas,
  FullMapEngine,
  FullMapHandle,
  FullMapMountOptions,
  MinimapEngine,
  MinimapHandle,
  MinimapMountOptions,
  MountableCanvas,
  MountHandle,
  MountServices,
  TiltedViewHandle,
  TiltedViewMountOptions,
} from "./mount.js";

// The three views.
export {
  DEFAULT_MINIMAP_SIZE_PX,
  DEFAULT_MINIMAP_ZOOM,
  DEFAULT_MINIMAP_ZOOM_MAX,
  DEFAULT_MINIMAP_ZOOM_MIN,
  headingUpRotation,
  Minimap,
  northMarkFor,
} from "./minimap.js";
export type { MinimapDraw, MinimapOptions, MinimapState, NorthMark } from "./minimap.js";
export {
  DEFAULT_FULL_MAP_HEIGHT_PX,
  DEFAULT_FULL_MAP_WIDTH_PX,
  DEFAULT_FULL_MAP_ZOOM_MAX,
  FIT_MARGIN_FRACTION,
  FOCUS_RING_RADIUS_PX,
  FullMap,
  MIN_EXTENT_UNITS,
  PAN_KEEP_FRACTION,
  SELECT_MAX_ROAD_DISTANCE_PX,
  SELECT_MAX_ROAD_DISTANCE_UNITS,
} from "./full-map.js";
export type {
  DestinationTarget,
  FocusAnnouncement,
  FullMapChange,
  FullMapDraw,
  FullMapOptions,
  FullMapSelectResult,
  FullMapSelection,
  FullMapState,
} from "./full-map.js";
export {
  DEFAULT_TILTED_HEIGHT_PX,
  DEFAULT_TILTED_WIDTH_PX,
  DEFAULT_TILTED_ZOOM,
  PLAYER_SCREEN_FRACTION,
  TiltedView,
} from "./tilted-view.js";
export type { TiltedViewDraw, TiltedViewOptions, TiltedViewState } from "./tilted-view.js";

// Draw functions.
export { drawMapLayers, LAYER_ORDER } from "./draw-map-layers.js";
export type { DrawMapLayersInput, LayerName } from "./draw-map-layers.js";
export {
  drawBackgroundPicture,
  drawBlockedAreas,
  drawFlatProps,
  drawGround,
} from "./layers-areas.js";
export type { WorldRegion } from "./layers-areas.js";
export {
  ARROW_MIN_SPACING_PX,
  drawBlockedRoadMarks,
  drawOneWayArrows,
  drawRoadFills,
  drawRoadOutlines,
} from "./layers-roads.js";
export {
  drawPlaceLabels,
  drawPlaceMarkers,
  LABEL_FONT_DEFAULT_PX,
  LABEL_FONT_MAX_PX,
  LABEL_FONT_MIN_PX,
} from "./layers-places.js";
export {
  drawDestinationMarker,
  drawPlayerMarker,
  drawRouteLine,
  MAX_POSITION_COORDINATE,
  PLAYER_MARKER_DEFAULT_PX,
  PLAYER_MARKER_MAX_PX,
  PLAYER_MARKER_MIN_PX,
  ROUTE_LINE_MAX_WIDTH_PX,
  ROUTE_LINE_MIN_WIDTH_PX,
  validatePosition,
  validateRoute,
} from "./layers-route.js";

// Pictures.
export { asImageHandle } from "./image-lookup.js";
export type { ImageEntry, ImageHandle, ImageLookup } from "./image-lookup.js";

// Style.
export {
  contrastRatio,
  DEFAULT_STYLE,
  isUsableColor,
  resolveStyle,
  STYLE_COLOR_KEYS,
  STYLE_LINE_KEYS,
} from "./style.js";
export type { LineStyle, ResolvedStyle } from "./style.js";

// Camera, projection, smoothing.
export {
  createCamera,
  MAX_VIEWPORT_SIZE,
  MAX_ZOOM,
  MIN_VIEWPORT_SIZE,
  MIN_ZOOM,
  panCamera,
  screenToWorld,
  validateCamera,
  worldToScreen,
  zoomCamera,
} from "./camera.js";
export type { Camera, Point } from "./camera.js";
export {
  DEFAULT_TILT_DEGREES,
  depthOf,
  MAX_TILT_DEGREES,
  MIN_TILT_DEGREES,
  projectTilted,
  sortByDepth,
  unprojectTilted,
  validateTilt,
} from "./tilted-projection.js";
export {
  blockHeightOf,
  blockHeightValue,
  DEFAULT_BLOCK_HEIGHTS,
  RAISED_KINDS,
} from "./block-height.js";
export {
  advanceCamera,
  advanceSmoothed,
  advanceSmoothedHeading,
  DEFAULT_SMOOTHING_MS,
  FrameClock,
  MAX_SMOOTHING_MS,
  MIN_SMOOTHING_MS,
  validateSmoothingDuration,
} from "./smoothing.js";

// Hit test, labels, frame gate, input.
export { HIT_RADIUS_PX, hitTestPlace } from "./hit-test.js";
export type { HitPlace } from "./hit-test.js";
export { LABEL_GAP_PX, placeLabels } from "./label-placement.js";
export type { LabelCandidate, LabelPlacement, PlacedLabel, Rect } from "./label-placement.js";
export { drawIfDue, FrameGate } from "./frame-gate.js";
export type { FrameInputs } from "./frame-gate.js";
export { bindInput } from "./input-binding.js";
export type { BindableCanvas, BindableEvent, InputBindingOptions } from "./input-binding.js";

// Canvas.
export { CanvasAdapter } from "./canvas-adapter.js";
export type { CanvasLike, Context2DLike, ResizeResult } from "./canvas-adapter.js";
export type {
  CanvasInterface,
  LineCap,
  LineJoin,
  TextAlign,
  TextSize,
} from "./canvas-interface.js";

// Accessibility.
export {
  createLiveRegion,
  describeCanvas,
  FOCUS_INDICATOR,
  VIEW_DESCRIPTIONS,
} from "./accessibility.js";
export type {
  AccessibleElement,
  LiveRegion,
  LiveRegionElement,
  ViewDescription,
  ViewKind,
} from "./accessibility.js";

// Errors and notices.
export { isViewError } from "./view-errors.js";
export type { Notice as ViewNotice, ViewError } from "./view-errors.js";
