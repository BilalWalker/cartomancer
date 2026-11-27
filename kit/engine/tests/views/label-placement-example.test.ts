import { describe, expect, it } from "vitest";
import { placeLabels, type LabelCandidate } from "../../src/views/label-placement";

const vp = { width: 400, height: 300 };

function cand(id: string, priority: number, x: number, y: number, w = 60, h = 16): LabelCandidate {
  return { placeId: id, priority, screenX: x, screenY: y, width: w, height: h };
}

describe("placeLabels examples", () => {
  it("places the destination label when it fits", () => {
    const { labels } = placeLabels(
      [cand("a", 1, 100, 100), cand("dest", 0, 110, 105)],
      vp,
    );
    expect(labels.map((l) => l.placeId)).toEqual(["dest"]);
  });

  it("gives the higher priority label the space", () => {
    const { labels } = placeLabels(
      [cand("b", 2, 10, 10), cand("a", 1, 20, 12)],
      vp,
    );
    expect(labels.map((l) => l.placeId)).toEqual(["a"]);
  });

  it("breaks priority ties by identifier", () => {
    const { labels } = placeLabels([cand("z", 1, 10, 10), cand("m", 1, 10, 10)], vp);
    expect(labels.map((l) => l.placeId)).toEqual(["m"]);
  });

  it("keeps labels exactly 4 px apart and drops labels 3.9 px apart", () => {
    const ok = placeLabels([cand("a", 0, 0, 0), cand("b", 1, 64, 0)], vp);
    expect(ok.labels).toHaveLength(2);
    const close = placeLabels([cand("a", 0, 0, 0), cand("b", 1, 63.9, 0)], vp);
    expect(close.labels).toHaveLength(1);
  });

  it("returns the same result for the same input", () => {
    const input = [cand("a", 1, 5, 5), cand("b", 0, 300, 100), cand("c", 2, 7, 6)];
    expect(placeLabels(input, vp)).toEqual(placeLabels(input, vp));
  });

  it("moves a label inside the viewport when it fits", () => {
    const { labels } = placeLabels([cand("a", 0, -20, 290), cand("b", 1, 390, -5)], vp);
    expect(labels[0]!.rect).toEqual({ x: 0, y: 284, width: 60, height: 16 });
    expect(labels[1]!.rect).toEqual({ x: 340, y: 0, width: 60, height: 16 });
  });

  it("leaves out a label larger than the viewport without a notice", () => {
    const r = placeLabels([cand("a", 0, 0, 0, 500, 16)], vp);
    expect(r.labels).toEqual([]);
    expect(r.notices).toEqual([]);
  });

  it("leaves out unusable candidates and names the place in a notice", () => {
    const bad = [
      cand("nan", 0, NaN, 0),
      cand("inf", 0, 0, Infinity),
      cand("zero", 0, 0, 0, 0, 10),
      cand("neg", 0, 0, 0, 10, -1),
      cand("w", 0, 0, 0, NaN, 10),
    ];
    const r = placeLabels([...bad, cand("good", 1, 10, 10)], vp);
    expect(r.labels.map((l) => l.placeId)).toEqual(["good"]);
    expect(r.notices).toHaveLength(5);
    for (const id of ["nan", "inf", "zero", "neg", "w"]) {
      expect(r.notices.some((n) => n.message.includes(`"${id}"`))).toBe(true);
    }
  });

  it("returns nothing with a notice for an unusable viewport", () => {
    for (const bad of [NaN, Infinity, -Infinity, 0, -1]) {
      const r = placeLabels([cand("a", 0, 0, 0)], { width: bad, height: 100 });
      expect(r.labels).toEqual([]);
      expect(r.notices).toHaveLength(1);
    }
  });
});

describe("placeLabels rounding edge", () => {
  it("keeps a nudged label inside the viewport when width subtraction rounds", () => {
    // Shrunk counterexample from seed 375557932: viewport width minus label
    // width rounded so that x + width ended above the viewport width.
    const viewportWidth = 53.05696486261353;
    const { labels } = placeLabels(
      [cand("a", 0, 52.056964862613526, 0, 1.0000000000000107, 1)],
      { width: viewportWidth, height: 50 },
    );
    expect(labels).toHaveLength(1);
    const r = labels[0]!.rect;
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(viewportWidth);
  });

  it("keeps the label inside for the sizes in the original report", () => {
    const { labels } = placeLabels([cand("a", 0, 34.94, 0, 17.007, 1)], { width: 51.95, height: 50 });
    expect(labels).toHaveLength(1);
    expect(labels[0]!.rect.x + labels[0]!.rect.width).toBeLessThanOrEqual(51.95);
  });
});
