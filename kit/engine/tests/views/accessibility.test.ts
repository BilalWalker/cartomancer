import { describe, expect, it } from "vitest";
import {
  FOCUS_INDICATOR,
  VIEW_DESCRIPTIONS,
  createLiveRegion,
  describeCanvas,
  type ViewKind,
} from "../../src/views/accessibility.js";

// Independent WCAG relative luminance, written in the test itself.
function testContrast(a: string, b: string): number {
  const lum = (hex: string): number => {
    const h = hex.replace("#", "");
    const ch = [0, 2, 4].map((i) => {
      const s = parseInt(h.slice(i, i + 2), 16) / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
  };
  const la = lum(a);
  const lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function fakeElement() {
  const attrs = new Map<string, string>();
  const listeners = new Map<string, Set<() => void>>();
  return {
    attrs,
    listeners,
    style: {} as { outline?: string; outlineOffset?: string },
    textContent: "" as string | null,
    setAttribute(n: string, v: string) {
      attrs.set(n, v);
    },
    removeAttribute(n: string) {
      attrs.delete(n);
    },
    addEventListener(t: string, l: () => void) {
      if (!listeners.has(t)) listeners.set(t, new Set());
      listeners.get(t)!.add(l);
    },
    removeEventListener(t: string, l: () => void) {
      listeners.get(t)?.delete(l);
    },
    fire(t: string) {
      for (const l of [...(listeners.get(t) ?? [])]) l();
    },
    count() {
      let n = 0;
      for (const s of listeners.values()) n += s.size;
      return n;
    },
  };
}

describe("focus indicator", () => {
  it("has a contrast of at least 3 to 1 against the page background", () => {
    expect(testContrast(FOCUS_INDICATOR.color, FOCUS_INDICATOR.pageBackground)).toBeGreaterThanOrEqual(3);
  });
});

describe("describeCanvas", () => {
  const kinds: ViewKind[] = ["minimap", "fullMap", "tiltedView"];

  it.each(kinds)("gives the %s canvas a name and a description", (kind) => {
    const el = fakeElement();
    describeCanvas(el, kind);
    expect(el.attrs.get("aria-label")).toBe(VIEW_DESCRIPTIONS[kind].name);
    expect(el.attrs.get("aria-description")).toBe(VIEW_DESCRIPTIONS[kind].description);
  });

  it("names the keys of the full map and lets only it take focus", () => {
    const full = fakeElement();
    describeCanvas(full, "fullMap");
    const text = full.attrs.get("aria-description")!;
    for (const word of ["Arrow", "Plus", "minus", "Home", "F follows", "bracket", "Enter"]) {
      expect(text).toContain(word);
    }
    expect(full.attrs.get("tabindex")).toBe("0");
    const mini = fakeElement();
    describeCanvas(mini, "minimap");
    expect(mini.attrs.has("tabindex")).toBe(false);
  });

  it("shows the focus outline on focus and removes it on blur", () => {
    const el = fakeElement();
    describeCanvas(el, "fullMap");
    el.fire("focus");
    expect(el.style.outline).toContain(FOCUS_INDICATOR.color);
    el.fire("blur");
    expect(el.style.outline).toBe("");
  });

  it("undoes everything it added, and a second call does nothing", () => {
    const el = fakeElement();
    const undo = describeCanvas(el, "fullMap");
    expect(el.count()).toBe(2);
    undo();
    undo();
    expect(el.count()).toBe(0);
    expect(el.attrs.size).toBe(0);
  });
});

describe("createLiveRegion", () => {
  it("sets aria-live to polite", () => {
    const el = fakeElement();
    createLiveRegion(el);
    expect(el.attrs.get("aria-live")).toBe("polite");
  });

  it("receives the guidance sentence and the announcements", () => {
    const el = fakeElement();
    const region = createLiveRegion(el);
    region.setGuidance("Turn left in 40 metres.");
    expect(el.textContent).toBe("Turn left in 40 metres.");
    region.announce("No place is selected.");
    expect(el.textContent).toBe("No place is selected.");
  });

  it("writes an announcement again even when it repeats, and the guidance after it", () => {
    const el = fakeElement();
    const region = createLiveRegion(el);
    region.setGuidance("Go straight on.");
    region.announce("The map has no places.");
    el.textContent = "";
    region.announce("The map has no places.");
    expect(el.textContent).toBe("The map has no places.");
    region.setGuidance("Go straight on.");
    expect(el.textContent).toBe("Go straight on.");
  });

  it("dispose removes the attributes and empties the text", () => {
    const el = fakeElement();
    const region = createLiveRegion(el);
    region.setGuidance("You have arrived.");
    region.dispose();
    expect(el.attrs.size).toBe(0);
    expect(el.textContent).toBe("");
  });
});
