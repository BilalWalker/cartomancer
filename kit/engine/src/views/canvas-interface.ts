// The small set of drawing operations the Views call. Nothing in it is
// specific to a browser; the Canvas_Adapter implements it on a Canvas 2D
// context and the Recording_Canvas implements it for tests.

export type LineJoin = "round" | "bevel" | "miter";
export type LineCap = "round" | "butt" | "square";
export type TextAlign = "left" | "center" | "right";

export interface TextSize {
  width: number;
  height: number;
}

/** An opaque picture handle. The Views pass it on and never look inside. */
export type ImageHandle = unknown;

export interface CanvasInterface {
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(radians: number): void;
  scale(sx: number, sy: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, startRadians: number, endRadians: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
  clip(): void;
  setFillColor(color: string): void;
  setStrokeColor(color: string): void;
  setLineWidth(width: number): void;
  setLineJoin(join: LineJoin): void;
  setLineCap(cap: LineCap): void;
  setLineDash(segments: number[]): void;
  setGlobalAlpha(alpha: number): void;
  drawText(text: string, x: number, y: number, font: string, align: TextAlign): void;
  measureText(text: string, font: string): TextSize;
  drawImage(image: ImageHandle, dx: number, dy: number, width: number, height: number): void;
}
