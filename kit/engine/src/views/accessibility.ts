// Canvas accessibility: an accessible name and key description for each
// canvas, a visible keyboard focus indicator, and a polite live region that
// receives the guidance sentence and the focus announcements. It works on the
// elements that are passed in, through structural types, and names no global
// of the host environment.

/** The three views a canvas can show. */
export type ViewKind = "minimap" | "fullMap" | "tiltedView";

/** The accessible name and the text description of one view. */
export interface ViewDescription {
  name: string;
  description: string;
}

/** Name and key description of each view, in plain words. */
export const VIEW_DESCRIPTIONS: Readonly<Record<ViewKind, ViewDescription>> = {
  minimap: {
    name: "Minimap",
    description:
      "Small map that turns with the player and shows the route, the player and place names. It uses no keys.",
  },
  fullMap: {
    name: "Full map",
    description:
      "Map of the whole area with the route, the player and place names. " +
      "Arrow keys pan the map. Plus zooms in and minus zooms out. Home fits the whole map. " +
      "F follows the player. Right square bracket and left square bracket move through the places. " +
      "Enter sets the marked place as the destination.",
  },
  tiltedView: {
    name: "Tilted view",
    description:
      "Tilted view of the map in which buildings are raised blocks, with the route, the player and place names. It uses no keys.",
  },
};

/** The focus ring colour, the page background it is checked against, and its shape. */
export const FOCUS_INDICATOR = {
  color: "#1a56db",
  pageBackground: "#ffffff",
  width: "3px",
  offset: "2px",
} as const;

/** The part of an element the accessibility functions use. */
export interface AccessibleElement {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  getAttribute?(name: string): string | null;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
  style: { outline?: string; outlineOffset?: string };
}

/**
 * Gives a canvas its accessible name and key description. The Full_Map
 * canvas can take keyboard focus; the other two have no keys. While a canvas
 * has keyboard focus it shows a solid outline of `FOCUS_INDICATOR.color`.
 * Returns a function that undoes everything this call added.
 */
export function describeCanvas(canvas: AccessibleElement, kind: ViewKind): () => void {
  const { name, description } = VIEW_DESCRIPTIONS[kind];
  const interactive = kind === "fullMap";
  const attributes: [string, string][] = [
    ["role", interactive ? "application" : "img"],
    ["aria-label", name],
    ["aria-description", description],
  ];
  if (interactive) attributes.push(["tabindex", "0"]);
  for (const [attr, value] of attributes) canvas.setAttribute(attr, value);

  const previousOutline = canvas.style.outline;
  const previousOffset = canvas.style.outlineOffset;
  const onFocus = (): void => {
    canvas.style.outline = `${FOCUS_INDICATOR.width} solid ${FOCUS_INDICATOR.color}`;
    canvas.style.outlineOffset = FOCUS_INDICATOR.offset;
  };
  const onBlur = (): void => {
    canvas.style.outline = previousOutline ?? "";
    canvas.style.outlineOffset = previousOffset ?? "";
  };
  canvas.addEventListener("focus", onFocus);
  canvas.addEventListener("blur", onBlur);

  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    canvas.removeEventListener("focus", onFocus);
    canvas.removeEventListener("blur", onBlur);
    for (const [attr] of attributes) canvas.removeAttribute(attr);
    onBlur();
  };
}

/** The part of the live region element that is used. */
export interface LiveRegionElement {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  textContent: string | null;
}

/** A polite live region for the guidance sentence and the focus announcements. */
export interface LiveRegion {
  /** Shows the guidance sentence. The same sentence twice in a row is not repeated. */
  setGuidance(sentence: string): void;
  /** Shows a focus announcement. It is always shown, also when it repeats. */
  announce(text: string): void;
  /** Removes the attributes this region set and empties it. */
  dispose(): void;
}

/** Makes `element` an `aria-live="polite"` region and returns its writer. */
export function createLiveRegion(element: LiveRegionElement): LiveRegion {
  element.setAttribute("aria-live", "polite");
  element.setAttribute("aria-atomic", "true");
  element.setAttribute("role", "status");
  let lastGuidance: string | undefined;
  return {
    setGuidance(sentence: string): void {
      if (sentence === lastGuidance) return;
      lastGuidance = sentence;
      element.textContent = sentence;
    },
    announce(text: string): void {
      lastGuidance = undefined;
      element.textContent = text;
    },
    dispose(): void {
      element.removeAttribute("aria-live");
      element.removeAttribute("aria-atomic");
      element.removeAttribute("role");
      element.textContent = "";
      lastGuidance = undefined;
    },
  };
}
