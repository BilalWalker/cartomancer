import { describe, expect, it } from "vitest";
import { checkNodes, checkRoads } from "../src/map-loader-checks.js";

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

describe("checkRoads", () => {
  const nodeIds = new Set(["a", "b", "c"]);
  const good = {
    id: "r1",
    fromNodeId: "a",
    toNodeId: "b",
    width: 6,
    kind: "main",
  };

  function expectPlain(message: string | undefined): void {
    expect(message).toBeDefined();
    expect(message).not.toContain("at ");
  }

  it("accepts good roads of every kind, with and without oneWay", () => {
    expect(
      checkRoads(
        [
          good,
          { ...good, id: "r2", kind: "side", oneWay: true },
          { ...good, id: "r3", kind: "footpath", oneWay: false },
          { ...good, id: "r4", kind: "corridor", toNodeId: "c" },
        ],
        nodeIds,
      ),
    ).toEqual([]);
    expect(checkRoads([], nodeIds)).toEqual([]);
  });

  it("rejects a road list that is not a list", () => {
    const errors = checkRoads(good, nodeIds);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("roads");
  });

  it("rejects a road that is not an object", () => {
    const errors = checkRoads([good, "r2"], nodeIds);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("roads");
    expect(errors[0]?.item).toBe("road 2");
  });

  it("names a missing road id", () => {
    const { id: _id, ...noId } = good;
    const errors = checkRoads([noId], nodeIds);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("id");
    expect(errors[0]?.item).toBe("road 1");
  });

  it("names a duplicated road id", () => {
    const errors = checkRoads([good, { ...good }], nodeIds);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("roads");
    expect(errors[0]?.item).toBe("r1");
  });

  it("names the road and the missing node in fromNodeId", () => {
    const errors = checkRoads([{ ...good, fromNodeId: "zz" }], nodeIds);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("fromNodeId");
    expect(errors[0]?.item).toBe("r1");
    expect(errors[0]?.message).toContain('"r1"');
    expect(errors[0]?.message).toContain('"zz"');
    expectPlain(errors[0]?.message);
  });

  it("names the road and the missing node in toNodeId", () => {
    const errors = checkRoads([{ ...good, toNodeId: "nope" }], nodeIds);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("toNodeId");
    expect(errors[0]?.item).toBe("r1");
    expect(errors[0]?.message).toContain('"nope"');
    expectPlain(errors[0]?.message);
  });

  it("names a missing endpoint field", () => {
    const { toNodeId: _to, ...noTo } = good;
    const errors = checkRoads([noTo], nodeIds);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("toNodeId");
    expect(errors[0]?.item).toBe("r1");
  });

  it("names an endpoint of the wrong type", () => {
    const errors = checkRoads([{ ...good, fromNodeId: 3 }], nodeIds);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("fromNodeId");
    expect(errors[0]?.item).toBe("r1");
  });

  it("rejects a road whose two ends are the same node", () => {
    const errors = checkRoads([{ ...good, toNodeId: "a" }], nodeIds);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("toNodeId");
    expect(errors[0]?.item).toBe("r1");
    expectPlain(errors[0]?.message);
  });

  it("rejects a width of zero or less", () => {
    const errors = checkRoads(
      [
        { ...good, id: "r1", width: 0 },
        { ...good, id: "r2", width: -2 },
      ],
      nodeIds,
    );
    expect(errors).toHaveLength(2);
    expect(errors[0]?.field).toBe("width");
    expect(errors[0]?.item).toBe("r1");
    expect(errors[1]?.field).toBe("width");
    expect(errors[1]?.item).toBe("r2");
    expectPlain(errors[0]?.message);
  });

  it("rejects a width that is not finite", () => {
    const errors = checkRoads(
      [{ ...good, width: Number.POSITIVE_INFINITY }],
      nodeIds,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("width");
  });

  it("names a missing width and a width of the wrong type", () => {
    const { width: _w, ...noWidth } = good;
    const errors = checkRoads(
      [noWidth, { ...good, id: "r2", width: "6" }],
      nodeIds,
    );
    expect(errors).toHaveLength(2);
    expect(errors[0]?.field).toBe("width");
    expect(errors[0]?.item).toBe("r1");
    expect(errors[1]?.field).toBe("width");
    expect(errors[1]?.item).toBe("r2");
  });

  it("rejects a kind that is not allowed", () => {
    const errors = checkRoads(
      [
        { ...good, id: "r1", kind: "highway" },
        { ...good, id: "r2", kind: 4 },
      ],
      nodeIds,
    );
    expect(errors).toHaveLength(2);
    expect(errors[0]?.field).toBe("kind");
    expect(errors[0]?.item).toBe("r1");
    expect(errors[1]?.field).toBe("kind");
    expect(errors[1]?.item).toBe("r2");
    expectPlain(errors[0]?.message);
  });

  it("names a missing kind", () => {
    const { kind: _k, ...noKind } = good;
    const errors = checkRoads([noKind], nodeIds);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("kind");
    expect(errors[0]?.item).toBe("r1");
  });

  it("rejects a oneWay flag that is not a boolean", () => {
    const errors = checkRoads(
      [
        { ...good, id: "r1", oneWay: "yes" },
        { ...good, id: "r2", oneWay: 1 },
      ],
      nodeIds,
    );
    expect(errors).toHaveLength(2);
    expect(errors[0]?.field).toBe("oneWay");
    expect(errors[0]?.item).toBe("r1");
    expect(errors[1]?.field).toBe("oneWay");
    expect(errors[1]?.item).toBe("r2");
    expectPlain(errors[0]?.message);
  });

  it("reports every problem in one call", () => {
    const errors = checkRoads(
      [{ ...good, toNodeId: "zz", width: 0, kind: "x", oneWay: "no" }],
      nodeIds,
    );
    expect(errors).toHaveLength(4);
  });
});
