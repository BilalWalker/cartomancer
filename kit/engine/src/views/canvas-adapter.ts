// The Canvas_Adapter: implements CanvasInterface on a 2D drawing context and
// owns the pixel size and the pixel-ratio scale. It uses structural types for
// the canvas and the context, and takes the pixel ratio as an argument, so it
// names no global of the host environment.

import type {
  CanvasInterface,
  ImageHandle,
  LineCap,
  LineJoin,
  TextAlign,
  TextSize,
} from "./canvas-interface.js";
import {
  badSize,
  noContext,
  notice,
  type Notice,
  type ViewError,
} from "./view-errors.js";

const MIN_CSS_SIZE = 1;
const MAX_CSS_SIZE = 16384;
const MIN_RATIO = 0.5;
const MAX_RATIO = 8;
const RATIO_LIMIT = 3;
const MAX_PIXELS = 16384;
const DEFAULT_FONT_PX = 12;

/** The part of a 2D context the adapter uses. */
export interface Context2DLike {
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  lineJoin: string;
  lineCap: string;
  globalAlpha: number;
  font: string;
  textAlign: string;
  textBaseline: string;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(radians: number): void;
  scale(sx: number, sy: number): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, start: number, end: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
  clip(): void;
  setLineDash(segments: number[]): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  drawImage(image: never, dx: number, dy: number, width: number, height: number): void;
}

/** The part of a canvas the adapter uses. */
export interface CanvasLike {
  width: number;
  height: number;
  getContext(id: "2d"): Context2DLike | null;
}

/** What `resize` reports when it succeeds. */
export interface ResizeResult {
  /** The pixel ratio actually used. */
  pixelRatio: number;
  /** The canvas pixel width. */
  pixelWidth: number;
  /** The canvas pixel height. */
  pixelHeight: number;
  notices: Notice[];
}

function fontPixels(font: string): number {
  const match = /(\d+(?:\.\d+)?)px/.exec(font);
  if (match === null) return DEFAULT_FONT_PX;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_FONT_PX;
}

function validCssSize(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_CSS_SIZE && value <= MAX_CSS_SIZE;
}

export class CanvasAdapter implements CanvasInterface {
  private readonly canvas: CanvasLike;
  private readonly ctx: Context2DLike;

  private constructor(canvas: CanvasLike, ctx: Context2DLike) {
    this.canvas = canvas;
    this.ctx = ctx;
  }

  /** Wrap a canvas, or return a ViewError when it has no 2D context. */
  static mount(canvas: CanvasLike): CanvasAdapter | ViewError {
    const ctx = canvas.getContext("2d");
    if (ctx === null || ctx === undefined) return noContext();
    return new CanvasAdapter(canvas, ctx);
  }

  /**
   * Set the pixel size to the CSS size times the pixel ratio and scale the
   * context once by that ratio. A bad size returns a ViewError and keeps the
   * previous pixel size.
   */
  resize(cssWidth: number, cssHeight: number, pixelRatio: number): ResizeResult | ViewError {
    if (!validCssSize(cssWidth)) return badSize("cssWidth", MIN_CSS_SIZE, MAX_CSS_SIZE);
    if (!validCssSize(cssHeight)) return badSize("cssHeight", MIN_CSS_SIZE, MAX_CSS_SIZE);

    const notices: Notice[] = [];
    let ratio = pixelRatio;
    if (!Number.isFinite(ratio) || ratio < MIN_RATIO || ratio > MAX_RATIO) {
      const shown = Number.isFinite(ratio) ? String(ratio) : "not a finite number";
      notices.push(
        notice(
          `The pixel ratio (${shown}) must be a number from ${MIN_RATIO} to ${MAX_RATIO}, so a ratio of 1 was used.`,
        ),
      );
      ratio = 1;
    }
    if (ratio > RATIO_LIMIT) ratio = RATIO_LIMIT;

    const largest = Math.max(cssWidth, cssHeight);
    if (largest * ratio > MAX_PIXELS) {
      ratio = MAX_PIXELS / largest;
      notices.push(
        notice(
          `The canvas would be wider or taller than ${MAX_PIXELS} pixels, so the pixel ratio was lowered to ${ratio}.`,
        ),
      );
    }

    const pixelWidth = Math.round(cssWidth * ratio);
    const pixelHeight = Math.round(cssHeight * ratio);
    this.canvas.width = pixelWidth;
    this.canvas.height = pixelHeight;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(ratio, ratio);
    return { pixelRatio: ratio, pixelWidth, pixelHeight, notices };
  }

  save(): void {
    this.ctx.save();
  }
  restore(): void {
    this.ctx.restore();
  }
  translate(x: number, y: number): void {
    this.ctx.translate(x, y);
  }
  rotate(radians: number): void {
    this.ctx.rotate(radians);
  }
  scale(sx: number, sy: number): void {
    this.ctx.scale(sx, sy);
  }
  beginPath(): void {
    this.ctx.beginPath();
  }
  moveTo(x: number, y: number): void {
    this.ctx.moveTo(x, y);
  }
  lineTo(x: number, y: number): void {
    this.ctx.lineTo(x, y);
  }
  arc(x: number, y: number, radius: number, startRadians: number, endRadians: number): void {
    this.ctx.arc(x, y, radius, startRadians, endRadians);
  }
  closePath(): void {
    this.ctx.closePath();
  }
  fill(): void {
    this.ctx.fill();
  }
  stroke(): void {
    this.ctx.stroke();
  }
  clip(): void {
    this.ctx.clip();
  }
  setFillColor(color: string): void {
    this.ctx.fillStyle = color;
  }
  setStrokeColor(color: string): void {
    this.ctx.strokeStyle = color;
  }
  setLineWidth(width: number): void {
    this.ctx.lineWidth = width;
  }
  setLineJoin(join: LineJoin): void {
    this.ctx.lineJoin = join;
  }
  setLineCap(cap: LineCap): void {
    this.ctx.lineCap = cap;
  }
  setLineDash(segments: number[]): void {
    this.ctx.setLineDash(segments);
  }
  setGlobalAlpha(alpha: number): void {
    this.ctx.globalAlpha = alpha;
  }
  /** The y value is the vertical middle of the text. */
  drawText(text: string, x: number, y: number, font: string, align: TextAlign): void {
    this.ctx.font = font;
    this.ctx.textAlign = align;
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(text, x, y);
  }
  measureText(text: string, font: string): TextSize {
    this.ctx.font = font;
    const metrics = this.ctx.measureText(text);
    return { width: metrics.width, height: fontPixels(font) };
  }
  drawImage(image: ImageHandle, dx: number, dy: number, width: number, height: number): void {
    this.ctx.drawImage(image as never, dx, dy, width, height);
  }
}
