// Stand-ins for the browser services a mounted View uses, so the Mount
// functions run in Node. Each one counts what is added and removed, so a test
// can check that destroy() leaves nothing behind.

import type { Context2DLike } from "../../../src/views/canvas-adapter.js";
import type { MinimapEngine, MountableCanvas, MountServices } from "../../../src/views/mount.js";
import type { EngineMap, Position, Route } from "../../../src/types.js";
import { smallTown } from "./small-town.js";

/** A 2D context that counts every call it gets. */
export class FakeContext implements Context2DLike {
  fillStyle: unknown = "";
  strokeStyle: unknown = "";
  lineWidth = 1;
  lineJoin = "miter";
  lineCap = "butt";
  globalAlpha = 1;
  font = "";
  textAlign = "start";
  textBaseline = "alphabetic";
  calls = 0;
  private count(): void {
    this.calls++;
  }
  save(): void { this.count(); }
  restore(): void { this.count(); }
  translate(): void { this.count(); }
  rotate(): void { this.count(); }
  scale(): void { this.count(); }
  setTransform(): void { this.count(); }
  beginPath(): void { this.count(); }
  moveTo(): void { this.count(); }
  lineTo(): void { this.count(); }
  arc(): void { this.count(); }
  closePath(): void { this.count(); }
  fill(): void { this.count(); }
  stroke(): void { this.count(); }
  clip(): void { this.count(); }
  setLineDash(): void { this.count(); }
  fillText(): void { this.count(); }
  measureText(text: string): { width: number } {
    return { width: text.length * 6 };
  }
  drawImage(): void {
    this.images++;
    this.count();
  }
  images = 0;
}

/** A canvas element that counts listeners and attributes added and removed. */
export class FakeCanvas implements MountableCanvas {
  width = 300;
  height = 150;
  clientWidth: number;
  clientHeight: number;
  style: { outline?: string; outlineOffset?: string } = {};
  readonly context = new FakeContext();
  readonly attributes = new Map<string, string>();
  listenerAdds = 0;
  listenerRemoves = 0;
  private readonly listeners = new Set<string>();
  contextAvailable = true;

  constructor(cssWidth = 200, cssHeight = 200) {
    this.clientWidth = cssWidth;
    this.clientHeight = cssHeight;
  }

  getContext(_id: "2d"): Context2DLike | null {
    return this.contextAvailable ? this.context : null;
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }
  addEventListener(type: string, _listener: () => void): void {
    this.listenerAdds++;
    this.listeners.add(type);
  }
  removeEventListener(type: string, _listener: () => void): void {
    this.listenerRemoves++;
    this.listeners.delete(type);
  }
  get openListeners(): number {
    return this.listenerAdds - this.listenerRemoves;
  }
}

/** An animation frame scheduler that runs frames only when the test says so. */
export class FakeScheduler {
  requested = 0;
  cancelled = 0;
  private nextHandle = 1;
  private readonly waiting = new Map<number, (timestampMs: number) => void>();

  requestFrame = (callback: (timestampMs: number) => void): number => {
    this.requested++;
    const handle = this.nextHandle++;
    this.waiting.set(handle, callback);
    return handle;
  };
  cancelFrame = (handle: number): void => {
    this.cancelled++;
    this.waiting.delete(handle);
  };
  get pending(): number {
    return this.waiting.size;
  }
  /** Runs every waiting frame once, with the given timestamp. */
  runFrame(timestampMs: number): void {
    const batch = [...this.waiting.values()];
    this.waiting.clear();
    for (const callback of batch) callback(timestampMs);
  }
}

/** A resize observer factory that counts what it creates, observes and disconnects. */
export class FakeResizeObservers {
  created = 0;
  observed = 0;
  disconnected = 0;
  private callbacks: Array<() => void> = [];
  private live = new Set<number>();

  create = (callback: () => void): { observe(element: unknown): void; disconnect(): void } => {
    const id = this.created++;
    this.callbacks.push(callback);
    return {
      observe: () => {
        this.observed++;
        this.live.add(id);
      },
      disconnect: () => {
        this.disconnected++;
        this.live.delete(id);
      },
    };
  };
  get active(): number {
    return this.live.size;
  }
  /** Tells every observer that the size changed. */
  fire(): void {
    for (const callback of this.callbacks) callback();
  }
}

/** A reduced-motion query that can change and counts its listeners. */
export class FakeMotionQuery {
  matches: boolean;
  added = 0;
  removed = 0;
  private readonly listeners = new Set<() => void>();

  constructor(matches = false) {
    this.matches = matches;
  }
  query = (): { readonly matches: boolean; addListener(cb: () => void): void; removeListener(cb: () => void): void } => {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return {
      get matches(): boolean {
        return self.matches;
      },
      addListener: (callback) => {
        self.added++;
        self.listeners.add(callback);
      },
      removeListener: (callback) => {
        self.removed++;
        self.listeners.delete(callback);
      },
    };
  };
  get open(): number {
    return this.listeners.size;
  }
  /** Changes the setting and tells every listener. */
  set(matches: boolean): void {
    this.matches = matches;
    for (const listener of [...this.listeners]) listener();
  }
}

/** An Engine that gives what the test set and counts each read. */
export class FakeEngine implements MinimapEngine {
  map: EngineMap | undefined = smallTown();
  position: Position | undefined = { x: 10, y: 20, headingDegrees: 30 };
  remainingRoute: Route | undefined = undefined;
  sentence = "Go straight on.";
  /** The Map_Version: 1 with the map the engine starts with; a test that clears `map` also sets this to 0. */
  mapVersion = 1;
  reads = { map: 0, mapVersion: 0, position: 0, remainingRoute: 0, sentence: 0 };

  getMapVersion(): number {
    this.reads.mapVersion++;
    return this.mapVersion;
  }
  getMap(): EngineMap | undefined {
    this.reads.map++;
    return this.map;
  }
  /** Like a successful `Engine.loadMap`: sets the map and raises the version by 1. */
  loadMap(map: EngineMap): void {
    this.map = map;
    this.mapVersion++;
  }
  getPosition(): Position | undefined {
    this.reads.position++;
    return this.position ? { ...this.position } : undefined;
  }
  getRemainingRoute(): Route | undefined {
    this.reads.remainingRoute++;
    return this.remainingRoute;
  }
  getGuidanceSentence(): string {
    this.reads.sentence++;
    return this.sentence;
  }
}

/** Everything a mount test needs, wired together. */
export interface StandIns {
  scheduler: FakeScheduler;
  observers: FakeResizeObservers;
  motion: FakeMotionQuery;
  services: MountServices;
  /** Last pixel ratio the services report; change it to test resizing. */
  ratio: { value: number };
}

export function makeStandIns(options: { reducedMotion?: boolean; pixelRatio?: number } = {}): StandIns {
  const scheduler = new FakeScheduler();
  const observers = new FakeResizeObservers();
  const motion = new FakeMotionQuery(options.reducedMotion ?? false);
  const ratio = { value: options.pixelRatio ?? 1 };
  return {
    scheduler,
    observers,
    motion,
    ratio,
    services: {
      requestFrame: scheduler.requestFrame,
      cancelFrame: scheduler.cancelFrame,
      createResizeObserver: observers.create,
      matchReducedMotion: motion.query,
      devicePixelRatio: () => ratio.value,
    },
  };
}

/** A canvas that also keeps its listeners, so a test can send it events. */
export class FakeInputCanvas extends FakeCanvas {
  style: { outline?: string; outlineOffset?: string; touchAction?: string } = {};
  private readonly handlers = new Map<string, Set<(event: never) => void>>();

  getBoundingClientRect(): { left: number; top: number } {
    return { left: 0, top: 0 };
  }
  addEventListener(type: string, listener: (event: never) => void): void {
    super.addEventListener(type, listener as () => void);
    const set = this.handlers.get(type) ?? new Set();
    set.add(listener);
    this.handlers.set(type, set);
  }
  removeEventListener(type: string, listener: (event: never) => void): void {
    super.removeEventListener(type, listener as () => void);
    this.handlers.get(type)?.delete(listener);
  }
  /** How many listeners of this type are attached now. */
  listenersOf(type: string): number {
    return this.handlers.get(type)?.size ?? 0;
  }
  /** Sends an event to every listener of its type; returns true when preventDefault was called. */
  dispatch(type: string, fields: Record<string, unknown> = {}): boolean {
    let prevented = false;
    const event = { ...fields, preventDefault: () => (prevented = true) };
    for (const listener of [...(this.handlers.get(type) ?? [])]) listener(event as never);
    return prevented;
  }
}

/** A FakeEngine that also takes destinations, like the real Engine. */
export class FakeDestinationEngine extends FakeEngine {
  destinations: unknown[] = [];
  setDestination(destination: unknown): never {
    this.destinations.push(destination);
    return { reason: "no-way", message: "There is no way to get there." } as never;
  }
}
