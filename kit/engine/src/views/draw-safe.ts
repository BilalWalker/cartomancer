// A wrapper over CanvasInterface that skips a drawing call when one of its
// numbers is not finite. Each skipped call adds a Notice that names the
// operation, and nothing non-finite reaches the wrapped canvas.

import type {
  CanvasInterface,
  ImageHandle,
  LineCap,
  LineJoin,
  TextAlign,
  TextSize,
} from "./canvas-interface.js";
import { skippedDrawing } from "./view-errors.js";
import type { Notice } from "./view-errors.js";

export class SafeCanvas implements CanvasInterface {
  private readonly inner: CanvasInterface;
  private readonly collected: Notice[] = [];

  constructor(inner: CanvasInterface) {
    this.inner = inner;
  }

  /** The Notices of every call skipped so far, in order. */
  get notices(): readonly Notice[] {
    return this.collected;
  }

  /** Returns the collected Notices and clears the list. */
  takeNotices(): Notice[] {
    return this.collected.splice(0, this.collected.length);
  }

  private ok(operation: string, numbers: readonly number[]): boolean {
    for (const n of numbers) {
      if (!Number.isFinite(n)) {
        this.collected.push(skippedDrawing(operation));
        return false;
      }
    }
    return true;
  }

  save(): void {
    this.inner.save();
  }
  restore(): void {
    this.inner.restore();
  }
  translate(x: number, y: number): void {
    if (this.ok("translate", [x, y])) this.inner.translate(x, y);
  }
  rotate(radians: number): void {
    if (this.ok("rotate", [radians])) this.inner.rotate(radians);
  }
  scale(sx: number, sy: number): void {
    if (this.ok("scale", [sx, sy])) this.inner.scale(sx, sy);
  }
  beginPath(): void {
    this.inner.beginPath();
  }
  moveTo(x: number, y: number): void {
    if (this.ok("moveTo", [x, y])) this.inner.moveTo(x, y);
  }
  lineTo(x: number, y: number): void {
    if (this.ok("lineTo", [x, y])) this.inner.lineTo(x, y);
  }
  arc(x: number, y: number, radius: number, startRadians: number, endRadians: number): void {
    if (this.ok("arc", [x, y, radius, startRadians, endRadians])) {
      this.inner.arc(x, y, radius, startRadians, endRadians);
    }
  }
  closePath(): void {
    this.inner.closePath();
  }
  fill(): void {
    this.inner.fill();
  }
  stroke(): void {
    this.inner.stroke();
  }
  clip(): void {
    this.inner.clip();
  }
  setFillColor(color: string): void {
    this.inner.setFillColor(color);
  }
  setStrokeColor(color: string): void {
    this.inner.setStrokeColor(color);
  }
  setLineWidth(width: number): void {
    if (this.ok("setLineWidth", [width])) this.inner.setLineWidth(width);
  }
  setLineJoin(join: LineJoin): void {
    this.inner.setLineJoin(join);
  }
  setLineCap(cap: LineCap): void {
    this.inner.setLineCap(cap);
  }
  setLineDash(segments: number[]): void {
    if (this.ok("setLineDash", segments)) this.inner.setLineDash(segments);
  }
  setGlobalAlpha(alpha: number): void {
    if (this.ok("setGlobalAlpha", [alpha])) this.inner.setGlobalAlpha(alpha);
  }
  drawText(text: string, x: number, y: number, font: string, align: TextAlign): void {
    if (this.ok("drawText", [x, y])) this.inner.drawText(text, x, y, font, align);
  }
  measureText(text: string, font: string): TextSize {
    return this.inner.measureText(text, font);
  }
  drawImage(image: ImageHandle, dx: number, dy: number, width: number, height: number): void {
    if (!this.ok("drawImage", [dx, dy, width, height])) return;
    if (width > 0 && height > 0) {
      this.inner.drawImage(image, dx, dy, width, height);
    } else {
      this.collected.push(skippedDrawing("drawImage"));
    }
  }
}
