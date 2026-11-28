// Property 17: Destroy leaves nothing behind.
// **Validates: Requirements 21.8, 21.15, 21.19**

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { mountFullMap, mountMinimap, mountTiltedView } from "../../src/views/mount.js";
import { isViewError } from "../../src/views/view-errors.js";
import { FakeDestinationEngine, FakeInputCanvas, makeStandIns } from "./helpers/stand-ins.js";

type Handle = Record<string, (...args: unknown[]) => unknown>;

const KINDS = ["minimap", "fullMap", "tiltedView"] as const;

type Op =
  | { op: "mount"; kind: (typeof KINDS)[number] }
  | { op: "control"; target: number; control: number; value: number }
  | { op: "frame" }
  | { op: "resizeEvent" }
  | { op: "motionChange"; matches: boolean }
  | { op: "input"; type: string }
  | { op: "destroy"; target: number };

const opArbitrary: fc.Arbitrary<Op> = fc.oneof(
  fc.record({ op: fc.constant("mount" as const), kind: fc.constantFrom(...KINDS) }),
  fc.record({
    op: fc.constant("control" as const),
    target: fc.nat(5),
    control: fc.nat(10),
    value: fc.double({ min: -10, max: 10, noNaN: true }),
  }),
  fc.constant({ op: "frame" as const }),
  fc.constant({ op: "resizeEvent" as const }),
  fc.record({ op: fc.constant("motionChange" as const), matches: fc.boolean() }),
  fc.record({
    op: fc.constant("input" as const),
    type: fc.constantFrom("keydown", "wheel", "pointerdown", "touchstart"),
  }),
  fc.record({ op: fc.constant("destroy" as const), target: fc.nat(5) }),
);

function mountKind(kind: (typeof KINDS)[number], canvas: FakeInputCanvas, stand: ReturnType<typeof makeStandIns>) {
  const engine = new FakeDestinationEngine();
  const options = { services: stand.services };
  if (kind === "minimap") return mountMinimap(canvas, engine, options);
  if (kind === "fullMap") return mountFullMap(canvas, engine, options);
  return mountTiltedView(canvas, engine, options);
}

describe("Property 17: destroy leaves nothing behind", () => {
  it("leaves no listener, observer or pending frame after destroy, for any sequence of calls", () => {
    fc.assert(
      fc.property(fc.array(opArbitrary, { maxLength: 40 }), (ops) => {
        const stand = makeStandIns();
        const canvases: FakeInputCanvas[] = [];
        const handles: Handle[] = [];
        const destroyed = new Set<number>();

        for (const step of ops) {
          if (step.op === "mount") {
            const canvas = new FakeInputCanvas();
            const handle = mountKind(step.kind, canvas, stand);
            expect(isViewError(handle)).toBe(false);
            canvases.push(canvas);
            handles.push(handle as unknown as Handle);
          } else if (step.op === "control" && handles.length > 0) {
            const index = step.target % handles.length;
            const handle = handles[index]!;
            const names = Object.keys(handle).filter((key) => key !== "destroy");
            const name = names[step.control % names.length]!;
            const result = handle[name]!({ x: step.value, y: step.value }, step.value, step.value);
            if (destroyed.has(index)) expect(isViewError(result)).toBe(true);
          } else if (step.op === "frame") {
            stand.scheduler.runFrame(0);
          } else if (step.op === "resizeEvent") {
            stand.observers.fire();
          } else if (step.op === "motionChange") {
            stand.motion.set(step.matches);
          } else if (step.op === "input" && canvases.length > 0) {
            for (const canvas of canvases) canvas.dispatch(step.type, { key: "+", clientX: 5, clientY: 5, deltaY: -1 });
          } else if (step.op === "destroy" && handles.length > 0) {
            const index = step.target % handles.length;
            expect(handles[index]!.destroy!()).toBeUndefined();
            destroyed.add(index);
            // A destroyed view leaves nothing behind at once.
            expect(canvases[index]!.openListeners).toBe(0);
            expect(canvases[index]!.attributes.size).toBe(0);
          }
        }

        // Destroy what is left, some of it a second time.
        handles.forEach((handle, index) => {
          expect(handle.destroy!()).toBeUndefined();
          expect(handle.destroy!()).toBeUndefined();
          destroyed.add(index);
        });

        expect(stand.scheduler.pending).toBe(0);
        expect(stand.observers.active).toBe(0);
        expect(stand.observers.disconnected).toBe(stand.observers.created);
        expect(stand.motion.open).toBe(0);
        expect(stand.motion.removed).toBe(stand.motion.added);
        for (const canvas of canvases) {
          expect(canvas.openListeners).toBe(0);
          expect(canvas.listenerRemoves).toBe(canvas.listenerAdds);
          for (const type of ["keydown", "wheel", "pointerdown", "touchstart"]) {
            expect(canvas.listenersOf(type)).toBe(0);
          }
        }

        // Nothing wakes up afterwards.
        const requested = stand.scheduler.requested;
        stand.scheduler.runFrame(16);
        stand.observers.fire();
        stand.motion.set(true);
        expect(stand.scheduler.requested).toBe(requested);
        expect(stand.scheduler.pending).toBe(0);
      }),
      { numRuns: 200 },
    );
  });
});
