import { describe, expect, it } from "vitest";
import {
  checkBackgroundPicture,
  checkBlockedAreas,
  checkNodes,
  checkPlaces,
  checkProps,
  checkRoads,
  checkStyle,
} from "../src/map-loader-checks.js";
import { parseMap } from "../src/map-loader.js";

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

describe("checkPlaces", () => {
  const good = { id: "p1", name: "Bank", category: "shop", x: 1, y: 2 };

  function expectPlain(message: string | undefined): void {
    expect(message).toBeDefined();
    expect(message).not.toContain("at ");
  }

  it("accepts good places and an empty list", () => {
    expect(checkPlaces([good, { ...good, id: "p2", name: "Room 214" }])).toEqual(
      [],
    );
    expect(checkPlaces([])).toEqual([]);
  });

  it("rejects a place list that is not a list", () => {
    const errors = checkPlaces(good);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("places");
  });

  it("rejects a place that is not an object", () => {
    const errors = checkPlaces([good, null]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("places");
    expect(errors[0]?.item).toBe("place 2");
  });

  it("names a missing id and an id of the wrong type", () => {
    const { id: _id, ...noId } = good;
    const errors = checkPlaces([noId, { ...good, id: 4 }]);
    expect(errors).toHaveLength(2);
    expect(errors[0]?.field).toBe("id");
    expect(errors[0]?.item).toBe("place 1");
    expect(errors[1]?.field).toBe("id");
    expect(errors[1]?.item).toBe("place 2");
  });

  it("names a duplicated place id", () => {
    const errors = checkPlaces([good, { ...good }]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("places");
    expect(errors[0]?.item).toBe("p1");
    expect(errors[0]?.message).toContain('"p1"');
    expectPlain(errors[0]?.message);
  });

  it("rejects an empty or missing name", () => {
    const { name: _n, ...noName } = good;
    const errors = checkPlaces([
      { ...good, id: "p1", name: "" },
      { ...noName, id: "p2" },
      { ...good, id: "p3", name: 5 },
    ]);
    expect(errors).toHaveLength(3);
    for (const [i, item] of ["p1", "p2", "p3"].entries()) {
      expect(errors[i]?.field).toBe("name");
      expect(errors[i]?.item).toBe(item);
      expectPlain(errors[i]?.message);
    }
  });

  it("rejects an empty or missing category", () => {
    const { category: _c, ...noCategory } = good;
    const errors = checkPlaces([
      { ...good, id: "p1", category: "" },
      { ...noCategory, id: "p2" },
      { ...good, id: "p3", category: false },
    ]);
    expect(errors).toHaveLength(3);
    for (const [i, item] of ["p1", "p2", "p3"].entries()) {
      expect(errors[i]?.field).toBe("category");
      expect(errors[i]?.item).toBe(item);
      expectPlain(errors[i]?.message);
    }
  });

  it("names a missing x and a y of the wrong type", () => {
    const { x: _x, ...noX } = good;
    const errors = checkPlaces([noX, { ...good, id: "p2", y: "2" }]);
    expect(errors).toHaveLength(2);
    expect(errors[0]?.field).toBe("x");
    expect(errors[0]?.item).toBe("p1");
    expect(errors[1]?.field).toBe("y");
    expect(errors[1]?.item).toBe("p2");
  });

  it("rejects x and y that are not finite", () => {
    const errors = checkPlaces([
      { ...good, id: "p1", x: Number.NaN },
      { ...good, id: "p2", y: Number.NEGATIVE_INFINITY },
    ]);
    expect(errors).toHaveLength(2);
    expect(errors[0]?.field).toBe("x");
    expect(errors[0]?.item).toBe("p1");
    expect(errors[1]?.field).toBe("y");
    expect(errors[1]?.item).toBe("p2");
    expectPlain(errors[0]?.message);
  });

  it("reports every problem in one call", () => {
    const errors = checkPlaces([
      good,
      { ...good, name: "", category: "", x: Number.NaN },
    ]);
    expect(errors).toHaveLength(4);
  });
});

describe("checkBlockedAreas", () => {
  const good = {
    id: "b1",
    kind: "water",
    polygon: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ],
  };

  function expectPlain(message: string | undefined): void {
    expect(message).toBeDefined();
    expect(message).not.toContain("at ");
  }

  it("accepts every kind and an empty list", () => {
    expect(
      checkBlockedAreas([
        good,
        { ...good, id: "b2", kind: "mountain" },
        { ...good, id: "b3", kind: "wall" },
      ]),
    ).toEqual([]);
    expect(checkBlockedAreas([])).toEqual([]);
  });

  it("rejects a list that is not a list", () => {
    const errors = checkBlockedAreas(good);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("blockedAreas");
  });

  it("rejects an area that is not an object", () => {
    const errors = checkBlockedAreas([good, 7]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("blockedAreas");
    expect(errors[0]?.item).toBe("blocked area 2");
  });

  it("names a missing id and an id of the wrong type", () => {
    const { id: _id, ...noId } = good;
    const errors = checkBlockedAreas([noId, { ...good, id: 3 }]);
    expect(errors).toHaveLength(2);
    expect(errors[0]?.field).toBe("id");
    expect(errors[0]?.item).toBe("blocked area 1");
    expect(errors[1]?.field).toBe("id");
    expect(errors[1]?.item).toBe("blocked area 2");
  });

  it("names a duplicated area id", () => {
    const errors = checkBlockedAreas([good, { ...good }]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("blockedAreas");
    expect(errors[0]?.item).toBe("b1");
    expect(errors[0]?.message).toContain('"b1"');
    expectPlain(errors[0]?.message);
  });

  it("rejects a missing or unknown kind", () => {
    const { kind: _k, ...noKind } = good;
    const errors = checkBlockedAreas([
      noKind,
      { ...good, id: "b2", kind: "lava" },
      { ...good, id: "b3", kind: 4 },
    ]);
    expect(errors).toHaveLength(3);
    for (const [i, item] of ["b1", "b2", "b3"].entries()) {
      expect(errors[i]?.field).toBe("kind");
      expect(errors[i]?.item).toBe(item);
      expectPlain(errors[i]?.message);
    }
  });

  it("rejects a missing polygon and a polygon that is not a list", () => {
    const { polygon: _p, ...noPolygon } = good;
    const errors = checkBlockedAreas([
      noPolygon,
      { ...good, id: "b2", polygon: "square" },
    ]);
    expect(errors).toHaveLength(2);
    expect(errors[0]?.field).toBe("polygon");
    expect(errors[0]?.item).toBe("b1");
    expect(errors[1]?.field).toBe("polygon");
    expect(errors[1]?.item).toBe("b2");
    expectPlain(errors[1]?.message);
  });

  it("rejects a polygon with fewer than three points", () => {
    const errors = checkBlockedAreas([
      { ...good, id: "b1", polygon: [] },
      { ...good, id: "b2", polygon: good.polygon.slice(0, 2) },
    ]);
    expect(errors).toHaveLength(2);
    expect(errors[0]?.field).toBe("polygon");
    expect(errors[0]?.item).toBe("b1");
    expect(errors[1]?.field).toBe("polygon");
    expect(errors[1]?.item).toBe("b2");
    expectPlain(errors[0]?.message);
  });

  it("rejects a polygon point that is not an object", () => {
    const errors = checkBlockedAreas([
      { ...good, polygon: [...good.polygon, null] },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("polygon");
    expect(errors[0]?.item).toBe("b1");
    expectPlain(errors[0]?.message);
  });

  it("names a polygon point with a missing or mistyped coordinate", () => {
    const errors = checkBlockedAreas([
      {
        ...good,
        polygon: [{ y: 0 }, { x: 10, y: "0" }, { x: 10, y: 10 }],
      },
    ]);
    expect(errors).toHaveLength(2);
    expect(errors[0]?.field).toBe("x");
    expect(errors[0]?.item).toBe("b1, point 1 of polygon");
    expect(errors[1]?.field).toBe("y");
    expect(errors[1]?.item).toBe("b1, point 2 of polygon");
    expectPlain(errors[0]?.message);
    expectPlain(errors[1]?.message);
  });

  it("rejects polygon coordinates that are not finite", () => {
    const errors = checkBlockedAreas([
      {
        ...good,
        polygon: [
          { x: Number.NaN, y: 0 },
          { x: 10, y: Number.POSITIVE_INFINITY },
          { x: 10, y: 10 },
        ],
      },
    ]);
    expect(errors).toHaveLength(2);
    expect(errors[0]?.field).toBe("x");
    expect(errors[1]?.field).toBe("y");
    expectPlain(errors[0]?.message);
  });

  it("reports every problem in one call", () => {
    const errors = checkBlockedAreas([
      good,
      { ...good, kind: "lava", polygon: [{ x: 0, y: 0 }] },
    ]);
    expect(errors).toHaveLength(3);
  });
});

describe("checkProps", () => {
  const good = {
    id: "t1",
    kind: "tree",
    x: 1,
    y: 2,
    width: 4,
    height: 5,
    rotationDegrees: 30,
  };

  function expectPlain(message: string | undefined): void {
    expect(message).toBeDefined();
    expect(message).not.toContain("at ");
  }

  it("accepts good props, negative rotation and an empty list", () => {
    expect(
      checkProps([good, { ...good, id: "t2", rotationDegrees: -90 }]),
    ).toEqual([]);
    expect(checkProps([])).toEqual([]);
  });

  it("rejects a prop list that is not a list", () => {
    const errors = checkProps(good);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("props");
  });

  it("rejects a prop that is not an object", () => {
    const errors = checkProps([good, "tree"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("props");
    expect(errors[0]?.item).toBe("prop 2");
  });

  it("names a missing id and an id of the wrong type", () => {
    const { id: _id, ...noId } = good;
    const errors = checkProps([noId, { ...good, id: 4 }]);
    expect(errors).toHaveLength(2);
    expect(errors[0]?.field).toBe("id");
    expect(errors[0]?.item).toBe("prop 1");
    expect(errors[1]?.field).toBe("id");
    expect(errors[1]?.item).toBe("prop 2");
  });

  it("names a duplicated prop id", () => {
    const errors = checkProps([good, { ...good }]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("props");
    expect(errors[0]?.item).toBe("t1");
    expect(errors[0]?.message).toContain('"t1"');
    expectPlain(errors[0]?.message);
  });

  it("rejects a missing, empty or mistyped kind", () => {
    const { kind: _k, ...noKind } = good;
    const errors = checkProps([
      noKind,
      { ...good, id: "t2", kind: "" },
      { ...good, id: "t3", kind: 7 },
    ]);
    expect(errors).toHaveLength(3);
    for (const [i, item] of ["t1", "t2", "t3"].entries()) {
      expect(errors[i]?.field).toBe("kind");
      expect(errors[i]?.item).toBe(item);
      expectPlain(errors[i]?.message);
    }
  });

  it("names a missing x and a y of the wrong type", () => {
    const { x: _x, ...noX } = good;
    const errors = checkProps([noX, { ...good, id: "t2", y: "2" }]);
    expect(errors).toHaveLength(2);
    expect(errors[0]?.field).toBe("x");
    expect(errors[0]?.item).toBe("t1");
    expect(errors[1]?.field).toBe("y");
    expect(errors[1]?.item).toBe("t2");
  });

  it("rejects x and y that are not finite", () => {
    const errors = checkProps([
      { ...good, id: "t1", x: Number.NaN },
      { ...good, id: "t2", y: Number.POSITIVE_INFINITY },
    ]);
    expect(errors).toHaveLength(2);
    expect(errors[0]?.field).toBe("x");
    expect(errors[1]?.field).toBe("y");
    expectPlain(errors[0]?.message);
  });

  it("rejects a width or height of zero or less", () => {
    const errors = checkProps([
      { ...good, id: "t1", width: 0 },
      { ...good, id: "t2", height: -1 },
    ]);
    expect(errors).toHaveLength(2);
    expect(errors[0]?.field).toBe("width");
    expect(errors[0]?.item).toBe("t1");
    expect(errors[1]?.field).toBe("height");
    expect(errors[1]?.item).toBe("t2");
    expectPlain(errors[0]?.message);
  });

  it("names a missing width, a height of the wrong type and non-finite size", () => {
    const { width: _w, ...noWidth } = good;
    const errors = checkProps([
      noWidth,
      { ...good, id: "t2", height: "5" },
      { ...good, id: "t3", width: Number.POSITIVE_INFINITY },
    ]);
    expect(errors).toHaveLength(3);
    expect(errors[0]?.field).toBe("width");
    expect(errors[0]?.item).toBe("t1");
    expect(errors[1]?.field).toBe("height");
    expect(errors[1]?.item).toBe("t2");
    expect(errors[2]?.field).toBe("width");
    expect(errors[2]?.item).toBe("t3");
  });

  it("rejects a missing, mistyped or non-finite rotation", () => {
    const { rotationDegrees: _r, ...noRotation } = good;
    const errors = checkProps([
      noRotation,
      { ...good, id: "t2", rotationDegrees: "90" },
      { ...good, id: "t3", rotationDegrees: Number.NaN },
    ]);
    expect(errors).toHaveLength(3);
    for (const [i, item] of ["t1", "t2", "t3"].entries()) {
      expect(errors[i]?.field).toBe("rotationDegrees");
      expect(errors[i]?.item).toBe(item);
      expectPlain(errors[i]?.message);
    }
  });

  it("reports every problem in one call", () => {
    const errors = checkProps([
      good,
      {
        ...good,
        id: "t2",
        kind: "",
        x: Number.NaN,
        width: 0,
        rotationDegrees: "1",
      },
    ]);
    expect(errors).toHaveLength(4);
  });
});

describe("checkBackgroundPicture", () => {
  const good = { ref: "plan.png", scale: 2, opacity: 0.5 };

  function expectPlain(message: string | undefined): void {
    expect(message).toBeDefined();
    expect(message).not.toContain("at ");
  }

  it("accepts an absent picture", () => {
    expect(checkBackgroundPicture(undefined)).toEqual([]);
  });

  it("accepts a good picture and opacity of exactly 0 and 1", () => {
    expect(checkBackgroundPicture(good)).toEqual([]);
    expect(checkBackgroundPicture({ ...good, opacity: 0 })).toEqual([]);
    expect(checkBackgroundPicture({ ...good, opacity: 1 })).toEqual([]);
  });

  it("rejects a picture that is not an object", () => {
    for (const bad of ["plan.png", null, [good], 4]) {
      const errors = checkBackgroundPicture(bad);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.field).toBe("backgroundPicture");
      expectPlain(errors[0]?.message);
    }
  });

  it("rejects a missing, empty or mistyped reference", () => {
    const { ref: _r, ...noRef } = good;
    for (const bad of [noRef, { ...good, ref: "" }, { ...good, ref: 3 }]) {
      const errors = checkBackgroundPicture(bad);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.field).toBe("ref");
      expect(errors[0]?.item).toBe("background picture");
      expectPlain(errors[0]?.message);
    }
  });

  it("rejects a missing, mistyped, zero, negative or non-finite scale", () => {
    const { scale: _s, ...noScale } = good;
    const bads = [
      noScale,
      { ...good, scale: "2" },
      { ...good, scale: 0 },
      { ...good, scale: -1 },
      { ...good, scale: Number.POSITIVE_INFINITY },
    ];
    for (const bad of bads) {
      const errors = checkBackgroundPicture(bad);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.field).toBe("scale");
      expect(errors[0]?.item).toBe("background picture");
      expectPlain(errors[0]?.message);
    }
  });

  it("rejects a missing, mistyped, out of range or non-finite opacity", () => {
    const { opacity: _o, ...noOpacity } = good;
    const bads = [
      noOpacity,
      { ...good, opacity: "0.5" },
      { ...good, opacity: -0.1 },
      { ...good, opacity: 1.1 },
      { ...good, opacity: Number.NaN },
    ];
    for (const bad of bads) {
      const errors = checkBackgroundPicture(bad);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.field).toBe("opacity");
      expect(errors[0]?.item).toBe("background picture");
      expectPlain(errors[0]?.message);
    }
  });

  it("reports every problem in one picture", () => {
    const errors = checkBackgroundPicture({ ref: "", scale: 0, opacity: 2 });
    expect(errors.map((e) => e.field)).toEqual(["ref", "scale", "opacity"]);
  });
});

describe("checkStyle", () => {
  const good = {
    colors: { road: "#333333", water: "blue" },
    lineStyles: { main: { width: 4 }, dashed: { width: 2, dash: [4, 2] } },
  };

  function expectPlain(message: string | undefined): void {
    expect(message).toBeDefined();
    expect(message).not.toContain("at ");
  }

  it("accepts a good style, empty groups, and an empty or zero dash", () => {
    expect(checkStyle(good)).toEqual([]);
    expect(checkStyle({ colors: {}, lineStyles: {} })).toEqual([]);
    expect(
      checkStyle({
        colors: {},
        lineStyles: { a: { width: 1, dash: [] }, b: { width: 1, dash: [0, 3] } },
      }),
    ).toEqual([]);
  });

  it("rejects a missing style and a style that is not an object", () => {
    const missing = checkStyle(undefined);
    expect(missing).toHaveLength(1);
    expect(missing[0]?.field).toBe("style");
    expectPlain(missing[0]?.message);
    for (const bad of ["dark", null, [good], 4]) {
      const errors = checkStyle(bad);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.field).toBe("style");
      expectPlain(errors[0]?.message);
    }
  });

  it("rejects missing or mistyped colors and lineStyles groups", () => {
    const missing = checkStyle({});
    expect(missing.map((e) => e.field)).toEqual(["colors", "lineStyles"]);
    for (const bad of ["red", null, [], 3]) {
      const errors = checkStyle({ ...good, colors: bad });
      expect(errors).toHaveLength(1);
      expect(errors[0]?.field).toBe("colors");
      expectPlain(errors[0]?.message);
      const errors2 = checkStyle({ ...good, lineStyles: bad });
      expect(errors2).toHaveLength(1);
      expect(errors2[0]?.field).toBe("lineStyles");
      expectPlain(errors2[0]?.message);
    }
  });

  it("rejects colour values that are not text, naming the colour", () => {
    const errors = checkStyle({
      ...good,
      colors: { road: 5, water: "blue", wall: null },
    });
    expect(errors).toHaveLength(2);
    expect(errors.map((e) => e.item)).toEqual(["road", "wall"]);
    for (const error of errors) {
      expect(error.field).toBe("colors");
      expectPlain(error.message);
    }
  });

  it("rejects a line style that is not an object", () => {
    for (const bad of ["thick", null, [1], 2]) {
      const errors = checkStyle({ ...good, lineStyles: { main: bad } });
      expect(errors).toHaveLength(1);
      expect(errors[0]?.field).toBe("lineStyles");
      expect(errors[0]?.item).toBe("main");
      expectPlain(errors[0]?.message);
    }
  });

  it("rejects a missing, mistyped, zero, negative or non-finite width", () => {
    const bads = [
      {},
      { width: "4" },
      { width: 0 },
      { width: -1 },
      { width: Number.POSITIVE_INFINITY },
      { width: Number.NaN },
    ];
    for (const bad of bads) {
      const errors = checkStyle({ ...good, lineStyles: { main: bad } });
      expect(errors).toHaveLength(1);
      expect(errors[0]?.field).toBe("width");
      expect(errors[0]?.item).toBe("main");
      expectPlain(errors[0]?.message);
    }
  });

  it("rejects a dash that is not a list or holds bad numbers", () => {
    const bads = [
      "4 2",
      null,
      { 0: 1 },
      [4, "2"],
      [4, -1],
      [Number.POSITIVE_INFINITY],
      [Number.NaN],
    ];
    for (const dash of bads) {
      const errors = checkStyle({
        ...good,
        lineStyles: { dashed: { width: 2, dash } },
      });
      expect(errors).toHaveLength(1);
      expect(errors[0]?.field).toBe("dash");
      expect(errors[0]?.item).toBe("dashed");
      expectPlain(errors[0]?.message);
    }
  });

  it("reports every problem in one style", () => {
    const errors = checkStyle({
      colors: { road: 1 },
      lineStyles: { main: { width: 0, dash: [-1] } },
    });
    expect(errors.map((e) => e.field)).toEqual(["colors", "width", "dash"]);
  });
});

const validFile = {
  formatVersion: 1,
  nodes: [],
  roads: [{ id: "r1" }, { id: "r2" }],
  places: [],
  blockedAreas: [],
  props: [],
  style: { colors: {}, lineStyles: {} },
};

function loadErrors(text: string) {
  const result = parseMap(text);
  if (!("errors" in result)) throw new Error("expected errors");
  expect("map" in result).toBe(false);
  return result.errors;
}

describe("parseMap top level and version", () => {
  it("rejects text that is not JSON and gives the position", () => {
    const errors = loadErrors('{\n  "formatVersion": 1,\n  oops\n}');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("not valid JSON");
    expect(errors[0]?.position?.line).toBe(3);
    expect(errors[0]?.message).not.toContain("at ");
  });

  it("rejects empty text", () => {
    expect(loadErrors("")[0]?.message).toContain("not valid JSON");
  });

  it("rejects a top level that is an array, a number or null", () => {
    for (const text of ["[]", "5", "null"]) {
      const errors = loadErrors(text);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.message).toContain("must be an object");
      expect(errors[0]?.message).not.toContain("at ");
    }
  });

  it("names every missing top-level field", () => {
    const { nodes: _n, style: _s, ...rest } = validFile;
    const errors = loadErrors(JSON.stringify(rest));
    expect(errors.map((e) => e.field)).toEqual(["nodes", "style"]);
    expect(errors[0]?.message).toContain("nodes");
  });

  it("reports a missing format version alone, before other fields", () => {
    const { formatVersion: _v, nodes: _n, ...rest } = validFile;
    const errors = loadErrors(JSON.stringify(rest));
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("formatVersion");
  });

  it("rejects a format version of the wrong type", () => {
    for (const version of ["1", 1.5, null, true]) {
      const errors = loadErrors(
        JSON.stringify({ ...validFile, formatVersion: version }),
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]?.field).toBe("formatVersion");
    }
  });

  it("rejects an unsupported version and lists the supported ones", () => {
    const errors = loadErrors(JSON.stringify({ ...validFile, formatVersion: 2 }));
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("formatVersion");
    expect(errors[0]?.message).toContain("Supported versions: 1");
    expect(errors[0]?.message).not.toContain("at ");
  });

  it("returns a map with all road ids usable and none blocked", () => {
    const result = parseMap(JSON.stringify(validFile));
    if (!("map" in result)) throw new Error("expected a map");
    expect([...result.map.usableRoadIds]).toEqual(["r1", "r2"]);
    expect(result.map.blockedRoads).toEqual([]);
    expect(result.notices).toEqual([]);
  });
});
