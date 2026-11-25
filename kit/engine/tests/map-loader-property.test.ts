import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseMap } from "../src/map-loader.js";
import { mapFileArbitrary } from "./helpers/arbitraries.js";
import { FAULT_NAMES, injectFault } from "./helpers/fault-injection.js";

describe("map loader properties", () => {
  it("Property 1: Loader validation matches injected faults", () => {
    // Feature: engine-core, Property 1: Loader validation matches injected faults
    // **Validates: Requirements 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.1, 4.2, 4.4**
    fc.assert(
      fc.property(
        mapFileArbitrary(),
        fc.constantFrom(...FAULT_NAMES),
        fc.nat({ max: 20 }),
        (file, fault, choice) => {
          // The valid file is accepted.
          const valid = parseMap(JSON.stringify(file));
          expect("map" in valid).toBe(true);

          // The same file with one injected fault is rejected, with an error
          // that names the faulty field and, when the loader names one, the item.
          const injected = injectFault(file, fault, choice);
          const result = parseMap(injected.text);
          if (!("errors" in result)) {
            throw new Error(`Fault "${fault}" was accepted by the loader.`);
          }
          expect("map" in result).toBe(false);
          const named = result.errors.some(
            (error) =>
              error.field === injected.field &&
              (injected.item === undefined || error.item === injected.item),
          );
          if (!named) {
            throw new Error(
              `Fault "${fault}": expected an error for field "${injected.field}"` +
                (injected.item === undefined
                  ? ""
                  : ` and item "${injected.item}"`) +
                `, got: ${JSON.stringify(result.errors)}`,
            );
          }
          for (const error of result.errors) {
            expect(error.message.length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("Property 2: Loader never returns a map together with errors", () => {
    // Feature: engine-core, Property 2: Loader never returns a map together with errors
    // **Validates: Requirements 4.3, 4.7**
    const textArbitrary = fc.oneof(
      // Valid texts.
      mapFileArbitrary().map((file) => JSON.stringify(file)),
      // Faulty texts.
      fc
        .tuple(
          mapFileArbitrary(),
          fc.constantFrom(...FAULT_NAMES),
          fc.nat({ max: 20 }),
        )
        .map(([file, fault, choice]) => injectFault(file, fault, choice).text),
      // Arbitrary strings, and arbitrary JSON values as text.
      fc.string(),
      fc.json(),
    );
    fc.assert(
      fc.property(textArbitrary, (text) => {
        const result = parseMap(text);
        const hasMap = "map" in result;
        const hasErrors = "errors" in result;
        expect(hasMap !== hasErrors).toBe(true);
        if (hasErrors) {
          expect(hasMap).toBe(false);
          expect("map" in result).toBe(false);
          expect(Object.keys(result)).toEqual(["errors"]);
          expect(result.errors.length).toBeGreaterThan(0);
        } else {
          expect("errors" in result).toBe(false);
        }
      }),
      { numRuns: 200 },
    );
  });
});
