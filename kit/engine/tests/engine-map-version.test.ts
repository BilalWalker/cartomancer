import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Engine } from "../src/engine.js";

const validText = JSON.stringify({
  formatVersion: 1,
  nodes: [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 100, y: 0 },
  ],
  roads: [{ id: "r1", fromNodeId: "a", toNodeId: "b", width: 6, kind: "main" }],
  places: [],
  blockedAreas: [],
  props: [],
  style: { colors: {}, lineStyles: {} },
});

const invalidTexts = ["not json", "", "{}", JSON.stringify({ formatVersion: 99 })];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Engine.getMapVersion", () => {
  it("is 0 before any load", () => {
    expect(new Engine().getMapVersion()).toBe(0);
  });

  it("is 1 after a valid text and 2 after a second one", () => {
    const engine = new Engine();
    engine.loadMap(validText);
    expect(engine.getMapVersion()).toBe(1);
    engine.loadMap(validText);
    expect(engine.getMapVersion()).toBe(2);
  });

  it("stays unchanged after invalid text, the empty text, and values that are not text", () => {
    const engine = new Engine();
    engine.loadMap(validText);
    for (const bad of [...invalidTexts, 42, null, undefined, {}, []]) {
      const result = engine.loadMap(bad as unknown as string);
      expect("errors" in result).toBe(true);
      expect(engine.getMapVersion()).toBe(1);
    }
  });

  it("stays 0 when the first load fails", () => {
    const engine = new Engine();
    engine.loadMap("not json");
    engine.loadMap(undefined as unknown as string);
    expect(engine.getMapVersion()).toBe(0);
  });

  it("does not call structuredClone", () => {
    const engine = new Engine();
    engine.loadMap(validText);
    const spy = vi.spyOn(globalThis, "structuredClone");
    engine.getMapVersion();
    engine.getMapVersion();
    expect(spy).not.toHaveBeenCalled();
  });

  // Feature: map-views, Property 26: The map version counts the successful loads
  // **Validates: Requirements 25.1, 25.2, 25.3, 25.4**
  it("equals the number of successful loads over any sequence of calls", () => {
    const input = fc.oneof(
      fc.constant<unknown>(validText),
      fc.constantFrom<unknown>(...invalidTexts),
      fc.constantFrom<unknown>(0, 7, null, undefined, {}, []),
      fc.string(),
    );
    fc.assert(
      fc.property(fc.array(input, { maxLength: 20 }), (calls) => {
        const engine = new Engine();
        let successes = 0;
        for (const call of calls) {
          const result = engine.loadMap(call as string);
          if ("map" in result) successes += 1;
          expect(engine.getMapVersion()).toBe(successes);
        }
      }),
      { numRuns: 100 },
    );
  });
});
