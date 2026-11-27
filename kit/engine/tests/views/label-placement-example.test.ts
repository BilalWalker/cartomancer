import { describe, expect, it } from "vitest";
import { placeLabels } from "../../src/views/label-placement";

describe("label placement rounding edge", () => {
  it("keeps a nudged label inside the viewport when width subtraction rounds", () => {
    // Shrunk counterexample from seed 375557932: viewport minus label
    // width rounded so that x + width ended above the viewport width.
    const viewportWidth = 53.05696486261353;
    const width = 1.0000000000000107;
    const { labels } = placeLabels(
      [{ placeId: "a", priority: 0, screenX: 52.056964862613526, screenY: 0, width, height: 1 }],
      { width: viewportWidth, height: 50 },
    );
    expect(labels).toHaveLength(1);
    const r = labels[0]!.rect;
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(viewportWidth);
  });

  it("keeps the viewport-sized case inside with the issue's sizes", () => {
    const viewportWidth = 51.95;
    const { labels } = placeLabels(
      [{ placeId: "a", priority: 0, screenX: 34.94, screenY: 0, width: 17.007, height: 1 }],
      { width: viewportWidth, height: 50 },
    );
    expect(labels).toHaveLength(1);
    const r = labels[0]!.rect;
    expect(r.x + r.width).toBeLessThanOrEqual(viewportWidth);
  });
});
