import { describe, expect, it } from "vitest";
import { createCamera, type Camera, type Point } from "../../src/views/camera.js";
import {
  depthOfPerspective,
  eyeGroundPoint,
  focalDistanceFor,
  NEAR_CLIP_FRACTION,
  projectPerspective,
  sortByDepth,
  tiltedFootprint,
  tiltedVisibleRegion,
  unprojectPerspective,
  validateFocalDistance,
} from "../../src/views/tilted-projection.js";
import { isViewError, type ViewError } from "../../src/views/view-errors.js";

function ok<T extends object>(value: T | ViewError): T {
  if (isViewError(value)) throw new Error(value.message);
  return value;
}

function cameraOf(width: number, height: number, zoom = 1, rotationDegrees = 0): Camera {
  return ok(
    createCamera({
      centerX: 0,
      centerY: 0,
      zoom,
      rotationDegrees,
      viewportWidth: width,
      viewportHeight: height,
    }),
  );
}

const cam400 = cameraOf(400, 300);

describe("focalDistanceFor", () => {
  it("gives the worked numbers of the design at 35 degrees", () => {
    expect(focalDistanceFor(35, 200)).toBeCloseTo(428.4, 1);
    expect(focalDistanceFor(35, 300)).toBeCloseTo(642.7, 1);
    expect(focalDistanceFor(35, 500)).toBeCloseTo(1071.1, 1);
    expect(focalDistanceFor(35, 1600)).toBeCloseTo(3427.6, 1);
  });

  it("gives the worked numbers for other tilts at 400 x 300", () => {
    expect(focalDistanceFor(20, 300)).toBeCloseTo(1236.4, 1);
    expect(focalDistanceFor(45, 300)).toBeCloseTo(450.0, 1);
    expect(focalDistanceFor(70, 300)).toBeCloseTo(163.8, 1);
  });
});

describe("tilt boundaries", () => {
  it("accepts 20 and 70 and rejects values outside or not finite", () => {
    for (const tilt of [20, 70]) {
      expect(isViewError(projectPerspective({ x: 0, y: 0 }, 0, tilt, cam400))).toBe(false);
      expect(isViewError(unprojectPerspective({ x: 200, y: 200 }, tilt, cam400))).toBe(false);
      expect(isViewError(focalDistanceFor(tilt, 300))).toBe(false);
    }
    for (const tilt of [19.999, 70.001, NaN, Infinity, -Infinity]) {
      const results = [
        projectPerspective({ x: 0, y: 0 }, 0, tilt, cam400),
        unprojectPerspective({ x: 200, y: 200 }, tilt, cam400),
        focalDistanceFor(tilt, 300),
        tiltedFootprint(cam400, tilt),
        tiltedVisibleRegion(cam400, tilt, 0, 0),
        eyeGroundPoint(cam400, tilt),
      ];
      for (const result of results) {
        expect(isViewError(result)).toBe(true);
        expect((result as ViewError).message).toContain("tilt angle");
      }
    }
    expect((projectPerspective({ x: 0, y: 0 }, 0, 19.999, cam400) as ViewError).message).toContain(
      "from 20 to 70",
    );
  });
});

describe("validateFocalDistance", () => {
  const H = 300;
  const lowest = (0.75 * H) / Math.tan((35 * Math.PI) / 180);

  it("accepts the rule value, a value just above the lowest and the value 1000 H", () => {
    expect(validateFocalDistance(642.7, 35, H)).toBeUndefined();
    expect(validateFocalDistance(lowest * 1.0001, 35, H)).toBeUndefined();
    expect(validateFocalDistance(1000 * H, 35, H)).toBeUndefined();
  });

  it("rejects 0, a negative value, the lowest value and just above 1000 H, naming the range", () => {
    for (const bad of [0, -5, lowest * 0.9999, 1000 * H + 1]) {
      const error = validateFocalDistance(bad, 35, H);
      expect(error).toBeDefined();
      expect(error!.message).toContain("focal distance");
      expect(error!.message).toContain("CSS pixels");
    }
    expect(validateFocalDistance(lowest, 35, H)).toBeDefined();
  });

  it("rejects values that are not finite", () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      const error = validateFocalDistance(bad, 35, H);
      expect(error!.message).toContain("focal distance");
    }
  });

  it("is applied by the projection functions", () => {
    expect(isViewError(projectPerspective({ x: 0, y: 0 }, 0, 35, cam400, 0))).toBe(true);
    expect(isViewError(unprojectPerspective({ x: 200, y: 200 }, 35, cam400, NaN))).toBe(true);
    expect(isViewError(projectPerspective({ x: 0, y: 0 }, 0, 35, cam400, 1000 * H + 1))).toBe(true);
    expect(isViewError(projectPerspective({ x: 0, y: 0 }, 0, 35, cam400, 1000 * H))).toBe(false);
  });
});

describe("projectPerspective at the player", () => {
  it("puts the player at the player row, the horizontal centre", () => {
    const p = ok(projectPerspective({ x: 0, y: 0 }, 0, 35, cam400)) as Point;
    expect(p.x).toBeCloseTo(200, 9);
    expect(p.y).toBeCloseTo(225, 9);
  });

  it("lifts a height by exactly height * zoom * cos(tilt) at the player", () => {
    const camera = cameraOf(400, 300, 2);
    for (const height of [0, 12, 1000]) {
      const p = ok(projectPerspective({ x: 0, y: 0 }, height, 35, camera)) as Point;
      expect(p.y).toBeCloseTo(225 - height * 2 * Math.cos((35 * Math.PI) / 180), 9);
      expect(p.x).toBeCloseTo(200, 9);
    }
  });

  it("moves a point one step ahead by sin(tilt) of the step at the player", () => {
    const step = 1e-4;
    const p = ok(projectPerspective({ x: 0, y: -step }, 0, 35, cam400)) as Point;
    expect(225 - p.y).toBeCloseTo(step * Math.sin((35 * Math.PI) / 180), 8);
  });

  it("scales lateral distances by 0.5 at the top row, 1 at the player row", () => {
    const top = ok(unprojectPerspective({ x: 0, y: 0 }, 35, cam400)) as Point;
    const topRight = ok(unprojectPerspective({ x: 400, y: 0 }, 35, cam400)) as Point;
    // World width of the top row is 2 W, screen width 400: scale 0.5.
    expect(topRight.x - top.x).toBeCloseTo(800, 6);
  });
});

describe("errors of the projection", () => {
  it("returns an error for a height or point that is not finite", () => {
    expect(isViewError(projectPerspective({ x: 0, y: 0 }, NaN, 35, cam400))).toBe(true);
    expect(isViewError(projectPerspective({ x: Infinity, y: 0 }, 0, 35, cam400))).toBe(true);
    expect(isViewError(unprojectPerspective({ x: NaN, y: 0 }, 35, cam400))).toBe(true);
    expect(isViewError(unprojectPerspective({ x: 0, y: 0 }, 35, cam400, undefined, NaN))).toBe(true);
  });

  it("returns an error for a point on or above the horizon row", () => {
    // The horizon lies 0.75 H = 225 pixels above the top edge.
    for (const y of [-226, -1000]) {
      const result = unprojectPerspective({ x: 200, y }, 35, cam400);
      expect(isViewError(result)).toBe(true);
      expect((result as ViewError).message).toContain("horizon");
    }
    expect(isViewError(unprojectPerspective({ x: 200, y: -224 }, 35, cam400))).toBe(false);
  });

  it("returns an error for ground nearer than the near clip, naming the value", () => {
    const f = focalDistanceFor(35, 300) as number;
    const g = (-(1 - NEAR_CLIP_FRACTION) * f) / Math.cos((35 * Math.PI) / 180);
    const behind = projectPerspective({ x: 0, y: -g * 1.01 }, 0, 35, cam400);
    expect(isViewError(behind)).toBe(true);
    expect((behind as ViewError).message).toContain("point depth");
    const justInside = projectPerspective({ x: 0, y: -g * 0.99 }, 0, 35, cam400);
    expect(isViewError(justInside)).toBe(false);
  });

  it("keeps the near clip at 0.25", () => {
    expect(NEAR_CLIP_FRACTION).toBe(0.25);
  });
});

describe("depth order", () => {
  it("gives a larger key to the nearer point, which is lower on the screen", () => {
    const farther = { x: 0, y: -50 };
    const nearer = { x: 0, y: 20 };
    expect(depthOfPerspective(nearer, cam400) as number).toBeGreaterThan(
      depthOfPerspective(farther, cam400) as number,
    );
    const yFar = (ok(projectPerspective(farther, 0, 35, cam400)) as Point).y;
    const yNear = (ok(projectPerspective(nearer, 0, 35, cam400)) as Point).y;
    expect(yNear).toBeGreaterThan(yFar);
  });

  it("sorts farther first and breaks a tie below 0.001 by ascending identifier", () => {
    const items = [
      { id: "near", ground: { x: 0, y: 30 } },
      { id: "b", ground: { x: 5, y: -10 } },
      { id: "a", ground: { x: -5, y: -10 + 0.0005 } },
      { id: "far", ground: { x: 0, y: -80 } },
    ];
    const sorted = ok(sortByDepth(items, cam400) as unknown as object) as unknown as typeof items;
    expect(sorted.map((i) => i.id)).toEqual(["far", "a", "b", "near"]);
  });
});

describe("tiltedFootprint", () => {
  it("has the closed-form corners at 35 degrees, 400 x 300, zoom 1", () => {
    const t = (35 * Math.PI) / 180;
    const f = focalDistanceFor(35, 300) as number;
    const corners = ok(tiltedFootprint(cam400, 35) as unknown as object) as unknown as Point[];
    expect(corners).toHaveLength(4);
    const topY = -f / Math.cos(t);
    const bottomY = f / (7 * Math.cos(t));
    expect(corners[0]!.x).toBeCloseTo(-400, 5);
    expect(corners[0]!.y).toBeCloseTo(topY, 5);
    expect(corners[1]!.x).toBeCloseTo(400, 5);
    expect(corners[1]!.y).toBeCloseTo(topY, 5);
    expect(corners[2]!.x).toBeCloseTo((3 * 400) / 7, 5);
    expect(corners[2]!.y).toBeCloseTo(bottomY, 5);
    expect(corners[3]!.x).toBeCloseTo((-3 * 400) / 7, 5);
    expect(corners[3]!.y).toBeCloseTo(bottomY, 5);
  });

  it("has the area 120 W H / (49 sin t) in pixels squared", () => {
    const corners = ok(tiltedFootprint(cam400, 35) as unknown as object) as unknown as Point[];
    let area = 0;
    for (let i = 0; i < 4; i++) {
      const a = corners[i]!;
      const b = corners[(i + 1) % 4]!;
      area += a.x * b.y - b.x * a.y;
    }
    expect(Math.abs(area) / 2).toBeCloseTo((120 * 400 * 300) / (49 * Math.sin((35 * Math.PI) / 180)), 3);
  });
});

describe("eyeGroundPoint and tiltedVisibleRegion", () => {
  it("puts the eye behind the player by f cos(tilt) pixels", () => {
    const camera = cameraOf(400, 300, 2);
    const f = focalDistanceFor(35, 300) as number;
    const eye = ok(eyeGroundPoint(camera, 35) as unknown as object) as unknown as Point;
    expect(eye.x).toBeCloseTo(0, 9);
    expect(eye.y).toBeCloseTo((f * Math.cos((35 * Math.PI) / 180)) / 2, 9);
  });

  it("widens by the margin and reaches lower for a lift", () => {
    const plain = ok(tiltedVisibleRegion(cam400, 35, 0, 0) as unknown as object) as unknown as {
      minX: number; minY: number; maxX: number; maxY: number;
    };
    const lifted = ok(tiltedVisibleRegion(cam400, 35, 50, 10) as unknown as object) as unknown as typeof plain;
    expect(lifted.minX).toBeLessThan(plain.minX - 9.99);
    expect(lifted.maxY).toBeGreaterThan(plain.maxY + 9.99);
    expect(lifted.minY).toBeLessThan(plain.minY);
  });

  it("returns an error for a negative or not finite lift or margin", () => {
    for (const bad of [-1, NaN, Infinity]) {
      expect(isViewError(tiltedVisibleRegion(cam400, 35, bad, 0))).toBe(true);
      expect(isViewError(tiltedVisibleRegion(cam400, 35, 0, bad))).toBe(true);
    }
  });

  it("caps an enormous lift instead of failing", () => {
    expect(isViewError(tiltedVisibleRegion(cam400, 35, 1_000_000, 0))).toBe(false);
  });
});
