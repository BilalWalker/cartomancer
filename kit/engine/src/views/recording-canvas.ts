// Recording_Canvas: a test stand-in that implements the Canvas_Interface by
// storing each call in order, with its arguments and the drawing state that
// was in effect when the call began. No browser code.

import type {
  CanvasInterface,
  LineCap,
  LineJoin,
  TextAlign,
  TextSize,
} from "./canvas-interface";

/** A 2x3 affine matrix [a, b, c, d, e, f]: x' = a*x + c*y + e, y' = b*x + d*y + f. */
export type Matrix = readonly [number, number, number, number, number, number];

/** The drawing state in effect when a call began. */
export interface RecordedState {
  fillColor: string;
  strokeColor: string;
  lineWidth: number;
  transform: Matrix;
}

/** One stored call. */
export interface RecordedCall {
  op: string;
  args: unknown[];
  state: RecordedState;
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Width of one character and height of a line that measureText reports. */
const CHAR_WIDTH = 8;
const LINE_HEIGHT = 12;

export class RecordingCanvas implements CanvasInterface {
  private calls: RecordedCall[] = [];
  private pathsBegun = 0;
  private fillColor = "#000000";
  private strokeColor = "#000000";
  private lineWidth = 1;
  private transform: Matrix = IDENTITY;
  private stack: RecordedState[] = [];

  /** All calls so far, in order. */
  getCalls(): readonly RecordedCall[] {
    return this.calls;
  }

  /** The calls of one operation, in order. */
  findCalls(op: string): RecordedCall[] {
    return this.calls.filter((c) => c.op === op);
  }

  /** The number of paths begun (calls of beginPath). */
  getPathCount(): number {
    return this.pathsBegun;
  }

  private record(op: string, args: unknown[]): void {
    this.calls.push({
      op,
      args,
      state: {
        fillColor: this.fillColor,
        strokeColor: this.strokeColor,
        lineWidth: this.lineWidth,
        transform: this.transform,
      },
    });
  }

  save(): void {
    this.record("save", []);
    this.stack.push({
      fillColor: this.fillColor,
      strokeColor: this.strokeColor,
      lineWidth: this.lineWidth,
      transform: this.transform,
    });
  }

  restore(): void {
    this.record("restore", []);
    const top = this.stack.pop();
    if (top !== undefined) {
      this.fillColor = top.fillColor;
      this.strokeColor = top.strokeColor;
      this.lineWidth = top.lineWidth;
      this.transform = top.transform;
    }
  }

  translate(x: number, y: number): void {
    this.record("translate", [x, y]);
    const [a, b, c, d, e, f] = this.transform;
    this.transform = [a, b, c, d, e + a * x + c * y, f + b * x + d * y];
  }

  rotate(radians: number): void {
    this.record("rotate", [radians]);
    const [a, b, c, d, e, f] = this.transform;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    this.transform = [
      a * cos + c * sin,
      b * cos + d * sin,
      -a * sin + c * cos,
      -b * sin + d * cos,
      e,
      f,
    ];
  }

  scale(sx: number, sy: number): void {
    this.record("scale", [sx, sy]);
    const [a, b, c, d, e, f] = this.transform;
    this.transform = [a * sx, b * sx, c * sy, d * sy, e, f];
  }

  beginPath(): void {
    this.record("beginPath", []);
    this.pathsBegun += 1;
  }

  moveTo(x: number, y: number): void {
    this.record("moveTo", [x, y]);
  }

  lineTo(x: number, y: number): void {
    this.record("lineTo", [x, y]);
  }

  arc(x: number, y: number, radius: number, startRadians: number, endRadians: number): void {
    this.record("arc", [x, y, radius, startRadians, endRadians]);
  }

  closePath(): void {
    this.record("closePath", []);
  }

  fill(): void {
    this.record("fill", []);
  }

  stroke(): void {
    this.record("stroke", []);
  }

  clip(): void {
    this.record("clip", []);
  }

  setFillColor(color: string): void {
    this.record("setFillColor", [color]);
    this.fillColor = color;
  }

  setStrokeColor(color: string): void {
    this.record("setStrokeColor", [color]);
    this.strokeColor = color;
  }

  setLineWidth(width: number): void {
    this.record("setLineWidth", [width]);
    this.lineWidth = width;
  }

  setLineJoin(join: LineJoin): void {
    this.record("setLineJoin", [join]);
  }

  setLineCap(cap: LineCap): void {
    this.record("setLineCap", [cap]);
  }

  setLineDash(segments: number[]): void {
    this.record("setLineDash", [segments.slice()]);
  }

  setGlobalAlpha(alpha: number): void {
    this.record("setGlobalAlpha", [alpha]);
  }

  drawText(text: string, x: number, y: number, font: string, align: TextAlign): void {
    this.record("drawText", [text, x, y, font, align]);
  }

  /** A fixed-size estimate (8 px per character, 12 px high); it is recorded too. */
  measureText(text: string, font: string): TextSize {
    this.record("measureText", [text, font]);
    return { width: text.length * CHAR_WIDTH, height: LINE_HEIGHT };
  }
}
