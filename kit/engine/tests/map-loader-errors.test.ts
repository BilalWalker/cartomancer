import { describe, expect, it } from "vitest";
import { checkNodes } from "../src/map-loader-checks.js";

describe("checkNodes", () => {
  it("accepts a good node list and an empty list", () => {
    expect(
      checkNodes([
        { id: "a", x: 0, y: 0 },
        { id: "b", x: -3.5, y: 12 },
      ]),
    ).toEqual([]);
    expect(checkNodes([])).toEqual([]);
  });

  it("rejects a node list that is not a list", () => {
    const errors = checkNodes({ id: "a", x: 0, y: 0 });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("nodes");
  });

  it("rejects a node that is not an object", () => {
    const errors = checkNodes([{ id: "a", x: 0, y: 0 }, 7]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("nodes");
    expect(errors[0]?.item).toBe("node 2");
  });

  it("names a duplicated node id", () => {
    const errors = checkNodes([
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 1, y: 1 },
      { id: "a", x: 2, y: 2 },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("nodes");
    expect(errors[0]?.item).toBe("a");
    expect(errors[0]?.message).toContain('"a"');
  });

  it("names a missing id", () => {
    const errors = checkNodes([{ x: 0, y: 0 }]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("id");
    expect(errors[0]?.item).toBe("node 1");
  });

  it("names an id of the wrong type", () => {
    const errors = checkNodes([{ id: 5, x: 0, y: 0 }]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("id");
    expect(errors[0]?.item).toBe("node 1");
  });

  it("names a missing x", () => {
    const errors = checkNodes([{ id: "a", y: 0 }]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("x");
    expect(errors[0]?.item).toBe("a");
  });

  it("names a y that is not a number", () => {
    const errors = checkNodes([{ id: "a", x: 0, y: "4" }]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("y");
    expect(errors[0]?.item).toBe("a");
  });

  it("names an x that is not finite", () => {
    const errors = checkNodes([
      { id: "a", x: Number.NaN, y: 0 },
      { id: "b", x: 0, y: Number.POSITIVE_INFINITY },
    ]);
    expect(errors).toHaveLength(2);
    expect(errors[0]?.field).toBe("x");
    expect(errors[0]?.item).toBe("a");
    expect(errors[1]?.field).toBe("y");
    expect(errors[1]?.item).toBe("b");
  });

  it("reports every problem in one call", () => {
    const errors = checkNodes([
      { id: "a", x: 0, y: 0 },
      { id: "a", x: "1", y: 0 },
    ]);
    expect(errors).toHaveLength(2);
  });
});
