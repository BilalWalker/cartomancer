import { describe, expect, it } from "vitest";
import {
  CanvasAdapter,
  type CanvasLike,
  type Context2DLike,
} from "../../src/views/canvas-adapter";
import { isViewError } from "../../src/views/view-errors";

interface Fake {
  canvas: CanvasLike;
  ctx: Context2DLike;
  log: unknown[][];
}

function makeFake(withContext = true): Fake {
  const log: unknown[][] = [];
  const rec =
    (name: string) =>
    (...args: unknown[]) => {
      log.push([name, ...args]);
    };
  const ctx: Context2DLike = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineJoin: "",
    lineCap: "",
    globalAlpha: 1,
    font: "",
    textAlign: "",
    textBaseline: "",
    save: rec("save"),
    restore: rec("restore"),
    translate: rec("translate"),
    rotate: rec("rotate"),
    scale: rec("scale"),
    setTransform: rec("setTransform"),
    beginPath: rec("beginPath"),
    moveTo: rec("moveTo"),
    lineTo: rec("lineTo"),
    arc: rec("arc"),
    closePath: rec("closePath"),
    fill: rec("fill"),
    stroke: rec("stroke"),
    clip: rec("clip"),
    setLineDash: rec("setLineDash"),
    fillText: rec("fillText"),
    measureText: (text: string) => ({ width: text.length * 7 }),
    drawImage: rec("drawImage"),
  };
  const canvas: CanvasLike = {
    width: 300,
    height: 150,
    getContext: () => (withContext ? ctx : null),
  };
  return { canvas, ctx, log };
}

function mounted(): { adapter: CanvasAdapter; fake: Fake } {
  const fake = makeFake();
  const adapter = CanvasAdapter.mount(fake.canvas);
  if (isViewError(adapter)) throw new Error("mount failed");
  return { adapter, fake };
}

describe("CanvasAdapter.mount", () => {
  it("returns a plain ViewError when there is no 2D context", () => {
    const result = CanvasAdapter.mount(makeFake(false).canvas);
    expect(isViewError(result)).toBe(true);
  });

  it("returns an adapter when a context exists", () => {
    expect(isViewError(CanvasAdapter.mount(makeFake().canvas))).toBe(false);
  });
});

describe("CanvasAdapter.resize", () => {
  it("sets the pixel size to CSS size times ratio, rounded, and scales once", () => {
    const { adapter, fake } = mounted();
    const result = adapter.resize(100.5, 50, 2);
    expect(isViewError(result)).toBe(false);
    expect(fake.canvas.width).toBe(201);
    expect(fake.canvas.height).toBe(100);
    expect(fake.log.filter((c) => c[0] === "scale")).toEqual([["scale", 2, 2]]);
    if (!isViewError(result)) expect(result.notices).toEqual([]);
  });

  it("keeps ratios from 0.5 to 3 as they are", () => {
    for (const ratio of [0.5, 1, 3]) {
      const { adapter } = mounted();
      const result = adapter.resize(100, 100, ratio);
      if (isViewError(result)) throw new Error("unexpected error");
      expect(result.pixelRatio).toBe(ratio);
      expect(result.notices).toEqual([]);
    }
  });

  it("limits a ratio above 3 to 3, up to 8", () => {
    for (const ratio of [3.5, 8]) {
      const { adapter } = mounted();
      const result = adapter.resize(100, 100, ratio);
      if (isViewError(result)) throw new Error("unexpected error");
      expect(result.pixelRatio).toBe(3);
      expect(result.pixelWidth).toBe(300);
    }
  });

  it("replaces a bad ratio by 1 with a Notice that names the range", () => {
    for (const ratio of [0.49, 8.01, NaN, Infinity, -Infinity, 0, -1]) {
      const { adapter, fake } = mounted();
      const result = adapter.resize(100, 40, ratio);
      if (isViewError(result)) throw new Error("unexpected error");
      expect(result.pixelRatio).toBe(1);
      expect(result.notices).toHaveLength(1);
      expect(result.notices[0]?.message).toContain("0.5 to 8");
      expect(fake.canvas.width).toBe(100);
      expect(fake.canvas.height).toBe(40);
    }
  });

  it("lowers the ratio so neither side passes 16384 pixels, with a Notice", () => {
    const { adapter, fake } = mounted();
    const result = adapter.resize(10000, 100, 3);
    if (isViewError(result)) throw new Error("unexpected error");
    expect(result.pixelRatio).toBeCloseTo(1.6384, 6);
    expect(fake.canvas.width).toBeLessThanOrEqual(16384);
    expect(result.notices).toHaveLength(1);
    expect(result.notices[0]?.message).toContain("lowered");
  });

  it("accepts the size limits 1 and 16384", () => {
    const { adapter } = mounted();
    expect(isViewError(adapter.resize(1, 1, 1))).toBe(false);
    expect(isViewError(adapter.resize(16384, 16384, 1))).toBe(false);
  });

  it("rejects a bad size and keeps the previous pixel size", () => {
    const { adapter, fake } = mounted();
    adapter.resize(200, 100, 1);
    const callsBefore = fake.log.length;
    for (const bad of [0.99, 16385, 0, -5, NaN, Infinity, -Infinity]) {
      const widthResult = adapter.resize(bad, 100, 1);
      const heightResult = adapter.resize(100, bad, 1);
      expect(isViewError(widthResult)).toBe(true);
      expect(isViewError(heightResult)).toBe(true);
      if (isViewError(widthResult)) {
        expect(widthResult.message).toContain("1 to 16384");
        expect(widthResult.message).not.toContain("NaN");
      }
    }
    expect(fake.canvas.width).toBe(200);
    expect(fake.canvas.height).toBe(100);
    expect(fake.log.length).toBe(callsBefore);
  });
});

describe("CanvasAdapter drawing", () => {
  it("passes path and state calls to the context", () => {
    const { adapter, fake } = mounted();
    adapter.save();
    adapter.translate(1, 2);
    adapter.rotate(0.5);
    adapter.scale(2, 3);
    adapter.beginPath();
    adapter.moveTo(0, 0);
    adapter.lineTo(5, 5);
    adapter.arc(1, 1, 4, 0, 3);
    adapter.closePath();
    adapter.fill();
    adapter.stroke();
    adapter.clip();
    adapter.setLineDash([2, 3]);
    adapter.restore();
    expect(fake.log.map((c) => c[0])).toEqual([
      "save", "translate", "rotate", "scale", "beginPath", "moveTo", "lineTo",
      "arc", "closePath", "fill", "stroke", "clip", "setLineDash", "restore",
    ]);
  });

  it("sets colours, line style and alpha on the context", () => {
    const { adapter, fake } = mounted();
    adapter.setFillColor("#112233");
    adapter.setStrokeColor("#445566");
    adapter.setLineWidth(4);
    adapter.setLineJoin("bevel");
    adapter.setLineCap("square");
    adapter.setGlobalAlpha(0.3);
    expect(fake.ctx.fillStyle).toBe("#112233");
    expect(fake.ctx.strokeStyle).toBe("#445566");
    expect(fake.ctx.lineWidth).toBe(4);
    expect(fake.ctx.lineJoin).toBe("bevel");
    expect(fake.ctx.lineCap).toBe("square");
    expect(fake.ctx.globalAlpha).toBe(0.3);
  });

  it("draws text with a middle baseline, the font and the alignment", () => {
    const { adapter, fake } = mounted();
    adapter.drawText("Bank", 10, 20, "bold 14px sans-serif", "center");
    expect(fake.ctx.font).toBe("bold 14px sans-serif");
    expect(fake.ctx.textAlign).toBe("center");
    expect(fake.ctx.textBaseline).toBe("middle");
    expect(fake.log[fake.log.length - 1]).toEqual(["fillText", "Bank", 10, 20]);
  });

  it("measures text width from the context and height from the font size", () => {
    const { adapter } = mounted();
    expect(adapter.measureText("abc", "12px sans-serif")).toEqual({ width: 21, height: 12 });
    expect(adapter.measureText("abc", "sans-serif").height).toBe(12);
  });

  it("drawImage reaches the context with the same handle and numbers, unread", () => {
    const { adapter, fake } = mounted();
    const handle = new Proxy(
      {},
      {
        get() {
          throw new Error("handle was read");
        },
      },
    );
    adapter.drawImage(handle, 1, 2, 30, 40);
    const last = fake.log[fake.log.length - 1] as unknown[];
    expect(last[0]).toBe("drawImage");
    expect(last[1]).toBe(handle);
    expect(last.slice(2)).toEqual([1, 2, 30, 40]);
  });
});
