// Reads the raised block faces out of a RecordingCanvas call log. The faces
// are drawn in screen coordinates, so their points are CSS pixels.

import type { RecordingCanvas } from "../../../src/views/recording-canvas.js";
import { DEFAULT_STYLE } from "../../../src/views/style.js";

export interface Face {
  points: { x: number; y: number }[];
}

function facesFilledWith(canvas: RecordingCanvas, color: string): Face[] {
  const faces: Face[] = [];
  let current: { x: number; y: number }[] = [];
  for (const call of canvas.getCalls()) {
    if (call.op === "beginPath") current = [];
    else if (call.op === "moveTo" || call.op === "lineTo") {
      current.push({ x: call.args[0] as number, y: call.args[1] as number });
    } else if (call.op === "fill" && call.state.fillColor === color) {
      faces.push({ points: current.slice() });
    }
  }
  return faces;
}

/** The top faces of the raised blocks, in the order they were drawn. */
export function topFaces(canvas: RecordingCanvas): Face[] {
  return facesFilledWith(canvas, DEFAULT_STYLE.raisedBlockTopColor);
}

/** The side faces of the raised blocks, in the order they were drawn. */
export function sideFaces(canvas: RecordingCanvas): Face[] {
  return facesFilledWith(canvas, DEFAULT_STYLE.raisedBlockSideColor);
}

export function centroidY(face: Face): number {
  return face.points.reduce((sum, p) => sum + p.y, 0) / face.points.length;
}
