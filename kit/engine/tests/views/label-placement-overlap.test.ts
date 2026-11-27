import * as fc from "fast-check";
import { describe, it } from "vitest";
import {
  LABEL_GAP_PX,
  placeLabels,
  type LabelCandidate,
} from "../../src/views/label-placement";

const candidateArb: fc.Arbitrary<LabelCandidate> = fc.record({
  placeId: fc.string({ minLength: 1, maxLength: 4 }),
  priority: fc.integer({ min: 0, max: 10 }),
  screenX: fc.double({ min: -200, max: 600, noNaN: true }),
  screenY: fc.double({ min: -200, max: 600, noNaN: true }),
  width: fc.double({ min: 1, max: 120, noNaN: true }),
  height: fc.double({ min: 1, max: 40, noNaN: true }),
});

describe("label placement properties", () => {
  it("never places two labels within the gap of each other", () => {
    // Feature: map-views, Property 7: Place labels never overlap
    // **Validates: Requirements 8.8**
    fc.assert(
      fc.property(
        fc.array(candidateArb, { maxLength: 40 }),
        fc.double({ min: 50, max: 500, noNaN: true }),
        fc.double({ min: 50, max: 500, noNaN: true }),
        (candidates, width, height) => {
          const { labels } = placeLabels(candidates, { width, height });
          for (let i = 0; i < labels.length; i++) {
            const a = labels[i]!.rect;
            for (let j = i + 1; j < labels.length; j++) {
              const b = labels[j]!.rect;
              const dx = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width));
              const dy = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height));
              if (!(dx >= LABEL_GAP_PX || dy >= LABEL_GAP_PX)) return false;
            }
            if (
              a.x < 0 ||
              a.y < 0 ||
              a.x + a.width > width ||
              a.y + a.height > height
            ) {
              return false;
            }
          }
          return true;
        },
      ),
      { numRuns: 200 },
    );
  });
});
