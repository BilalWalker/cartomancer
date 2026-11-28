// Decides whether a frame needs drawing. Each view keeps counters that go
// up when its map, route, position, camera, viewport or style changes.
// The gate draws when a counter differs from the last drawn frame, while
// the camera is settling, and once more when settling ends. It reads no
// clock.

export interface FrameInputs {
  mapVersion: number;
  routeVersion: number;
  positionVersion: number;
  cameraVersion: number;
  viewportVersion: number;
  styleVersion: number;
  /** True while the camera is still moving toward its target. */
  settling: boolean;
  /** False when the canvas is hidden or has a CSS size of 0. */
  canvasVisible: boolean;
}

type Versions = readonly [number, number, number, number, number, number];

function versionsOf(inputs: FrameInputs): Versions {
  return [
    inputs.mapVersion,
    inputs.routeVersion,
    inputs.positionVersion,
    inputs.cameraVersion,
    inputs.viewportVersion,
    inputs.styleVersion,
  ];
}

export class FrameGate {
  private remembered: Versions | undefined;
  private wasSettling = false;

  shouldDraw(inputs: FrameInputs): boolean {
    if (!inputs.canvasVisible) {
      // Forget what was drawn, so the first frame with a valid size draws.
      this.remembered = undefined;
      return false;
    }
    const versions = versionsOf(inputs);
    const changed =
      this.remembered === undefined || versions.some((v, i) => v !== this.remembered![i]);
    const due = changed || inputs.settling || this.wasSettling;
    this.wasSettling = inputs.settling;
    if (due) this.remembered = versions;
    return due;
  }
}

/** Calls `draw` only when the gate says a frame is due. Returns true when it drew. */
export function drawIfDue(gate: FrameGate, inputs: FrameInputs, draw: () => void): boolean {
  if (!gate.shouldDraw(inputs)) return false;
  draw();
  return true;
}
