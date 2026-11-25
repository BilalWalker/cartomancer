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
});
