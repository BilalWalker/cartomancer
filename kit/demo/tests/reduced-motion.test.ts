import { describe, expect, it } from "vitest";
import {
  REDUCED_MOTION_QUERY,
  createReducedMotion,
  reducedMotionService,
  type MediaQueryLike,
} from "../src/reduced-motion.js";

function fakeQuery(initial: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches: initial,
    addEventListener(_type: "change", listener: () => void) {
      listeners.add(listener);
    },
    removeEventListener(_type: "change", listener: () => void) {
      listeners.delete(listener);
    },
  };
  return {
    query,
    listeners,
    set(value: boolean) {
      query.matches = value;
      for (const listener of [...listeners]) listener();
    },
  };
}

describe("createReducedMotion", () => {
  it("names the standard query", () => {
    expect(REDUCED_MOTION_QUERY).toBe("(prefers-reduced-motion: reduce)");
  });

  it("reads the live setting", () => {
    const fake = fakeQuery(false);
    const handle = createReducedMotion(fake.query);
    expect(handle.matches).toBe(false);
    fake.set(true);
    expect(handle.matches).toBe(true);
  });

  it("reports changes to a listener until it is removed", () => {
    const fake = fakeQuery(false);
    const handle = createReducedMotion(fake.query);
    let calls = 0;
    const listener = () => {
      calls += 1;
    };
    handle.addListener(listener);
    fake.set(true);
    fake.set(false);
    expect(calls).toBe(2);
    handle.removeListener(listener);
    fake.set(true);
    expect(calls).toBe(2);
    expect(fake.listeners.size).toBe(0);
  });

  it("uses the older addListener API when addEventListener is missing", () => {
    const listeners = new Set<() => void>();
    const old: MediaQueryLike = {
      matches: true,
      addListener: (listener) => void listeners.add(listener),
      removeListener: (listener) => void listeners.delete(listener),
    };
    const handle = createReducedMotion(old);
    const listener = () => {};
    handle.addListener(listener);
    expect(listeners.has(listener)).toBe(true);
    handle.removeListener(listener);
    expect(listeners.size).toBe(0);
  });

  it("does not fail when the query has no listener support", () => {
    const handle = createReducedMotion({ matches: false });
    expect(() => handle.addListener(() => {})).not.toThrow();
    expect(() => handle.removeListener(() => {})).not.toThrow();
  });

  it("gives a service that makes a fresh handle on the same query", () => {
    const fake = fakeQuery(true);
    const service = reducedMotionService(fake.query);
    expect(service().matches).toBe(true);
    fake.set(false);
    expect(service().matches).toBe(false);
  });
});
