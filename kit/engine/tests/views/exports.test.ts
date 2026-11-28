/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import * as root from "../../src/index.js";
import * as views from "../../src/views/index.js";

const docs = import.meta.glob("../../docs/views-api.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const sources = import.meta.glob(["../../src/views/index.ts", "../../src/index.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const EXPECTED_VALUES = [
  "ARROW_MIN_SPACING_PX", "CanvasAdapter", "DEFAULT_BLOCK_HEIGHTS", "DEFAULT_FULL_MAP_HEIGHT_PX",
  "DEFAULT_FULL_MAP_WIDTH_PX", "DEFAULT_FULL_MAP_ZOOM_MAX", "DEFAULT_MINIMAP_SIZE_PX",
  "DEFAULT_MINIMAP_ZOOM", "DEFAULT_MINIMAP_ZOOM_MAX", "DEFAULT_MINIMAP_ZOOM_MIN",
  "DEFAULT_SMOOTHING_MS", "DEFAULT_STYLE", "DEFAULT_TILTED_HEIGHT_PX", "DEFAULT_TILTED_WIDTH_PX",
  "DEFAULT_TILTED_ZOOM", "DEFAULT_TILT_DEGREES", "FIT_MARGIN_FRACTION", "FOCUS_INDICATOR",
  "FOCUS_RING_RADIUS_PX", "FrameClock", "FrameGate", "FullMap", "HIT_RADIUS_PX", "LABEL_FONT_DEFAULT_PX",
  "LABEL_FONT_MAX_PX", "LABEL_FONT_MIN_PX", "LABEL_GAP_PX", "LAYER_ORDER", "MAX_POSITION_COORDINATE",
  "MAX_SMOOTHING_MS", "MAX_TILT_DEGREES", "MAX_VIEWPORT_SIZE", "MAX_ZOOM", "MIN_EXTENT_UNITS",
  "MIN_SMOOTHING_MS", "MIN_TILT_DEGREES", "MIN_VIEWPORT_SIZE", "MIN_ZOOM", "Minimap", "PAN_KEEP_FRACTION",
  "PLAYER_MARKER_DEFAULT_PX", "PLAYER_MARKER_MAX_PX", "PLAYER_MARKER_MIN_PX", "PLAYER_SCREEN_FRACTION",
  "RAISED_KINDS", "ROUTE_LINE_MAX_WIDTH_PX", "ROUTE_LINE_MIN_WIDTH_PX", "SELECT_MAX_ROAD_DISTANCE_PX",
  "SELECT_MAX_ROAD_DISTANCE_UNITS", "STYLE_COLOR_KEYS", "STYLE_LINE_KEYS", "TiltedView", "VIEW_DESCRIPTIONS",
  "advanceCamera", "advanceSmoothed", "advanceSmoothedHeading", "asImageHandle", "bindInput",
  "blockHeightOf", "blockHeightValue", "contrastRatio", "createCamera", "createLiveRegion",
  "depthOf", "describeCanvas", "drawBackgroundPicture", "drawBlockedAreas", "drawBlockedRoadMarks",
  "drawDestinationMarker", "drawFlatProps", "drawGround", "drawIfDue", "drawMapLayers",
  "drawOneWayArrows", "drawPlaceLabels", "drawPlaceMarkers", "drawPlayerMarker", "drawRoadFills",
  "drawRoadOutlines", "drawRouteLine", "headingUpRotation", "hitTestPlace", "isUsableColor",
  "isViewError", "mountFullMap", "mountMinimap", "mountTiltedView", "northMarkFor", "panCamera",
  "placeLabels", "projectTilted", "resolveStyle", "screenToWorld", "sortByDepth", "unprojectTilted",
  "validateCamera", "validatePosition", "validateRoute", "validateSmoothingDuration", "validateTilt",
  "worldToScreen", "zoomCamera",
];

const EXPECTED_TYPES = [
  "AccessibleElement", "BaseMountOptions", "BindableCanvas", "BindableEvent", "Camera", "CanvasInterface",
  "CanvasLike", "Context2DLike", "DestinationTarget", "DrawMapLayersInput", "FocusAnnouncement",
  "FrameInputs", "FullMapCanvas", "FullMapChange", "FullMapDraw", "FullMapEngine", "FullMapHandle",
  "FullMapMountOptions", "FullMapOptions", "FullMapSelectResult", "FullMapSelection", "FullMapState",
  "HitPlace", "ImageEntry", "ImageHandle", "ImageLookup", "InputBindingOptions", "LabelCandidate",
  "LabelPlacement", "LayerName", "LineCap", "LineJoin", "LineStyle", "LiveRegion", "LiveRegionElement",
  "MinimapDraw", "MinimapEngine", "MinimapHandle", "MinimapMountOptions", "MinimapOptions",
  "MinimapState", "MountHandle", "MountServices", "MountableCanvas", "NorthMark", "PlacedLabel", "Point",
  "Rect", "ResizeResult", "ResolvedStyle", "TextAlign", "TextSize", "TiltedViewDraw", "TiltedViewHandle",
  "TiltedViewMountOptions", "TiltedViewOptions", "TiltedViewState", "ViewDescription", "ViewError",
  "ViewKind", "ViewNotice", "WorldRegion",
];

describe("views public exports", () => {
  it("exports exactly the expected values", () => {
    expect(Object.keys(views).sort()).toEqual([...EXPECTED_VALUES].sort());
  });

  it("exports the three mount functions, drawBackgroundPicture and the key tables", () => {
    for (const name of ["mountMinimap", "mountFullMap", "mountTiltedView", "drawBackgroundPicture"]) {
      expect(typeof (views as Record<string, unknown>)[name], name).toBe("function");
    }
    expect(typeof views.asImageHandle).toBe("function");
    expect(typeof views.isUsableColor).toBe("function");
    expect(views.STYLE_COLOR_KEYS.length).toBe(21);
    expect(views.STYLE_LINE_KEYS.length).toBe(11);
  });

  it("exports exactly the expected types", () => {
    const source = sources["../../src/views/index.ts"] as string;
    const names = new Set<string>();
    for (const match of source.matchAll(/export type \{([^}]*)\}/g)) {
      for (const part of (match[1] as string).split(",")) {
        const name = part.trim().split(/\s+as\s+/).pop() as string;
        if (name) names.add(name);
      }
    }
    expect([...names].sort()).toEqual([...EXPECTED_TYPES].sort());
  });

  it("is re-exported from the package root next to the engine exports", () => {
    for (const name of EXPECTED_VALUES) {
      expect((root as Record<string, unknown>)[name], name).toBe((views as Record<string, unknown>)[name]);
    }
    for (const name of ["Engine", "mirrorMap", "mirrorHeading", "snapToRoad", "isNoUsableRoad"]) {
      expect(typeof (root as Record<string, unknown>)[name], name).toBe("function");
    }
  });

  describe("views-api.md", () => {
    const doc = docs["../../docs/views-api.md"] as string;
    // An entry is a heading of level 3 or 4 whose backticked names are the items it documents.
    const entries: { names: string[]; body: string }[] = [];
    let current: { names: string[]; body: string } | undefined;
    for (const line of doc.split(/\r?\n/)) {
      const heading = /^(#{2,4}) (.*)$/.exec(line);
      if (heading) {
        const names =
          (heading[1] as string).length >= 3
            ? [...(heading[2] as string).matchAll(/`([A-Za-z_][A-Za-z0-9_]*)`/g)].map((m) => m[1] as string)
            : [];
        current = names.length > 0 ? { names, body: "" } : undefined;
        if (current) entries.push(current);
      } else if (current) {
        current.body += `${line}\n`;
      }
    }

    it("has one entry for every exported value and type, and no others", () => {
      const documented = entries.flatMap((entry) => entry.names);
      expect(new Set(documented).size, "a name is documented twice").toBe(documented.length);
      expect([...documented].sort()).toEqual([...EXPECTED_VALUES, ...EXPECTED_TYPES].sort());
    });

    it("gives every entry inputs, outputs, errors and a usage example", () => {
      for (const entry of entries) {
        const label = entry.names.join(", ");
        expect(entry.body, `${label}: Inputs`).toMatch(/Inputs?:/);
        expect(entry.body, `${label}: Outputs`).toMatch(/Outputs?:/);
        expect(entry.body, `${label}: Errors`).toMatch(/Errors?:/);
        expect(entry.body, `${label}: example`).toMatch(/```ts\n[\s\S]+?```/);
      }
    });

    it("has a usage example for each of the three mount functions", () => {
      for (const name of ["mountMinimap", "mountFullMap", "mountTiltedView"]) {
        const entry = entries.find((e) => e.names.includes(name));
        expect(entry, name).toBeDefined();
        expect(entry?.body, name).toContain(`${name}(canvas, engine`);
        expect(entry?.body, name).toMatch(/```ts\n[\s\S]+?destroy\(\)[\s\S]*?```/);
      }
    });
  });

  it("keeps the engine's own Notice type distinct from the view notice", () => {
    const source = sources["../../src/index.ts"] as string;
    expect(source).toContain("  Notice,");
    expect(sources["../../src/views/index.ts"]).toContain("Notice as ViewNotice");
  });
});
