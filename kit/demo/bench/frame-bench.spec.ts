// Frame_Benchmark (Requirement 18, 22.13). Run with `npm run bench`; it is not
// part of `npm test`. It reports numbers and sets no threshold on them. It
// fails only when the page or browser cannot run, when fewer than 300 frames
// were measured, or when a measured time is not finite or is negative.
//
// How it measures: a script installed before the page loads wraps
// requestAnimationFrame and the 2D context of every canvas. The time of one
// animation-frame callback in which exactly one canvas was drawn on is that
// View's draw time (CPU time of issuing the drawing commands; the browser's
// own rasterising happens later and is not included). The wrapper adds a small
// cost of its own to every canvas call. The same wrapper counts beginPath calls
// (paths begun) per drawn frame.

import os from "node:os";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  BenchFailure,
  REQUIRED_FRAMES,
  checkFrameCount,
  formatSummary,
  intervals,
  summarize,
} from "./bench-stats.js";

const SEED = 20261204;
const MAX_TICKS = 4000;
const ZOOM_TARGET = 4;

const VIEWS = [
  { name: "Minimap", canvas: "minimap-canvas" },
  { name: "Full_Map", canvas: "fullmap-canvas" },
  { name: "Tilted_View", canvas: "tilted-canvas" },
] as const;

interface Sample {
  draw: number[];
  paths: number[];
  stamps: number[];
}
type PhaseData = Record<string, Sample>;

/** Runs in the page before any page script. */
function installCollector(): void {
  type Ctx = CanvasRenderingContext2D;
  const win = window as unknown as Record<string, unknown>;
  const nativeRaf = window.requestAnimationFrame.bind(window);
  const state = {
    recording: false,
    data: {} as Record<string, { draw: number[]; paths: number[]; stamps: number[] }>,
    lastScale: {} as Record<string, number>,
    inCallback: false,
    touched: new Map<string, { calls: number; paths: number }>(),
    ambiguous: 0,
  };

  const proxies = new WeakMap<Ctx, Ctx>();
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
    const ctx = (originalGetContext as (...a: unknown[]) => unknown).apply(this, args) as Ctx | null;
    if (args[0] !== "2d" || ctx === null) return ctx;
    const known = proxies.get(ctx);
    if (known !== undefined) return known;
    const id = this.id;
    const wrappers = new Map<PropertyKey, unknown>();
    const proxy = new Proxy(ctx, {
      get(target, prop) {
        const value = Reflect.get(target, prop, target) as unknown;
        if (typeof value !== "function") return value;
        let wrapper = wrappers.get(prop);
        if (wrapper === undefined) {
          wrapper = (...a: unknown[]): unknown => {
            if (state.inCallback) {
              let t = state.touched.get(id);
              if (t === undefined) {
                t = { calls: 0, paths: 0 };
                state.touched.set(id, t);
              }
              t.calls++;
              if (prop === "beginPath") t.paths++;
              if (prop === "scale" && a[0] === a[1]) state.lastScale[id] = a[0] as number;
            }
            return (value as (...x: unknown[]) => unknown).apply(target, a);
          };
          wrappers.set(prop, wrapper);
        }
        return wrapper;
      },
      set(target, prop, value) {
        Reflect.set(target, prop, value, target);
        return true;
      },
    });
    proxies.set(ctx, proxy);
    return proxy;
  } as typeof HTMLCanvasElement.prototype.getContext;

  window.requestAnimationFrame = (callback: FrameRequestCallback): number =>
    nativeRaf((timestamp) => {
      state.touched.clear();
      state.inCallback = true;
      const t0 = performance.now();
      try {
        callback(timestamp);
      } finally {
        const t1 = performance.now();
        state.inCallback = false;
        if (state.recording && state.touched.size === 1) {
          const [id, t] = [...state.touched.entries()][0]!;
          if (t.calls > 0) {
            const bucket = (state.data[id] ??= { draw: [], paths: [], stamps: [] });
            bucket.draw.push(t1 - t0);
            bucket.paths.push(t.paths);
            bucket.stamps.push(timestamp);
          }
        } else if (state.touched.size > 1) {
          state.ambiguous++;
        }
      }
    });

  function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const ARROWS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
  const key = (type: "keydown" | "keyup", name: string): void => {
    document.dispatchEvent(new KeyboardEvent(type, { key: name, bubbles: true, cancelable: true }));
  };

  win.__bench = {
    state,
    /** Frames of the page's own loop pass. */
    waitFrames(count: number): Promise<void> {
      return new Promise((resolve) => {
        let left = count;
        const tick = (): void => {
          if (--left <= 0) resolve();
          else nativeRaf(tick);
        };
        nativeRaf(tick);
      });
    },
    /**
     * Moves the player along the seeded path (a new arrow key every 15 frames)
     * until every canvas in `ids` has `needed` drawn frames, or `maxTicks`
     * frames passed. Returns what was recorded.
     */
    drive(ids: string[], needed: number, maxTicks: number, seed: number): Promise<{ ticks: number; data: typeof state.data; ambiguous: number }> {
      state.data = {};
      state.ambiguous = 0;
      state.recording = true;
      const random = mulberry32(seed);
      let held: string | undefined;
      let ticks = 0;
      return new Promise((resolve) => {
        const tick = (): void => {
          if (ticks % 15 === 0) {
            if (held !== undefined) key("keyup", held);
            held = ARROWS[Math.floor(random() * ARROWS.length)]!;
            key("keydown", held);
          }
          ticks++;
          const done = ids.every((id) => (state.data[id]?.draw.length ?? 0) >= needed);
          if (done || ticks >= maxTicks) {
            if (held !== undefined) key("keyup", held);
            state.recording = false;
            resolve({ ticks, data: state.data, ambiguous: state.ambiguous });
          } else nativeRaf(tick);
        };
        nativeRaf(tick);
      });
    },
    zoomOf(id: string): number | undefined {
      return state.lastScale[id];
    },
  };
}

interface BenchApi {
  waitFrames(count: number): Promise<void>;
  drive(
    ids: string[],
    needed: number,
    maxTicks: number,
    seed: number,
  ): Promise<{ ticks: number; data: PhaseData; ambiguous: number }>;
  zoomOf(id: string): number | undefined;
}

async function runPhase(page: Page, mapLabel: string): Promise<{ data: PhaseData; ticks: number }> {
  const ids = VIEWS.map((v) => v.canvas);
  const result = await page.evaluate(
    ([idList, needed, maxTicks, seed]) =>
      (window as unknown as { __bench: BenchApi }).__bench.drive(idList as string[], needed as number, maxTicks as number, seed as number),
    [ids, REQUIRED_FRAMES, MAX_TICKS, SEED] as const,
  );
  if (result.ambiguous > 0) {
    throw new BenchFailure(
      `On the ${mapLabel}, ${result.ambiguous} animation-frame callbacks drew on more than one canvas, so their draw time cannot be given to one View.`,
    );
  }
  return { data: result.data, ticks: result.ticks };
}

function report(lines: string[], mapLabel: string, series: string, viewName: string, sample: Sample | undefined): void {
  const label = `${mapLabel} / ${viewName}${series ? ` (${series})` : ""}`;
  if (sample === undefined) {
    throw new BenchFailure(`The ${viewName} on the ${mapLabel} drew no frame, so nothing was measured.`);
  }
  checkFrameCount(`${viewName} on the ${mapLabel}${series ? ` (${series})` : ""}`, sample.draw.length);
  const subject = `${viewName} on the ${mapLabel}`;
  const draw = summarize(subject, "draw time", sample.draw);
  const gap = summarize(subject, "frame interval", intervals(sample.stamps));
  const paths = summarize(subject, "paths begun per frame", sample.paths);
  lines.push(`${label}: ${draw.count} frames`);
  lines.push(`    draw time (ms)       ${formatSummary(draw)}`);
  lines.push(`    frame interval (ms)  ${formatSummary(gap)}`);
  lines.push(`    paths begun/frame    ${formatSummary(paths)}`);
}

async function measureMap(page: Page, choice: "town" | "large", mapLabel: string, lines: string[]): Promise<void> {
  await page.goto("/?bench");
  await page.waitForFunction(() => (window as unknown as { __benchHandles?: unknown }).__benchHandles !== undefined);
  await page.selectOption("#map-choice", choice);
  await expect(page.locator("#status-roads")).not.toHaveText("", { timeout: 60_000 });
  await expect(page.locator("#status-errors")).toHaveText("");
  // Let the Views read the new map and the page fit the Full_Map.
  await page.evaluate(() => (window as unknown as { __bench: BenchApi }).__bench.waitFrames(30));

  // Fit zoom: Minimap, Tilted_View and Full_Map.
  const fit = await runPhase(page, mapLabel);
  const fitZoom = await page.evaluate(() => (window as unknown as { __bench: BenchApi }).__bench.zoomOf("fullmap-canvas"));
  lines.push(`${mapLabel}: Full_Map fit zoom ${fitZoom === undefined ? "unknown" : `${fitZoom.toFixed(4)} px per world unit`}, ${fit.ticks} frames driven`);
  for (const view of VIEWS) report(lines, mapLabel, view.name === "Full_Map" ? "fit zoom" : "", view.name, fit.data[view.canvas]);

  // Full_Map at 4 CSS pixels per world unit, centred on the player.
  if (fitZoom === undefined) throw new BenchFailure(`The fit zoom of the Full_Map on the ${mapLabel} could not be read.`);
  if (fitZoom >= ZOOM_TARGET) {
    throw new BenchFailure(
      `The Full_Map on the ${mapLabel} already fits at ${fitZoom.toFixed(2)} px per world unit, so ${ZOOM_TARGET} px per world unit cannot be set.`,
    );
  }
  const zoomError = await page.evaluate(
    ([target, current]) => {
      const handle = (window as unknown as { __benchHandles: { fullMap: { follow(): unknown; zoomAt(a: { x: number; y: number }, f: number): { message?: string } | undefined } } }).__benchHandles.fullMap;
      const canvas = document.getElementById("fullmap-canvas") as HTMLCanvasElement;
      handle.follow();
      const error = handle.zoomAt({ x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 }, (target as number) / (current as number));
      return error?.message ?? null;
    },
    [ZOOM_TARGET, fitZoom] as const,
  );
  if (zoomError !== null) throw new BenchFailure(`The Full_Map refused the zoom: ${zoomError}`);
  await page.evaluate(() => (window as unknown as { __bench: BenchApi }).__bench.waitFrames(10));
  const zoomed = await runPhase(page, mapLabel);
  const zoomNow = await page.evaluate(() => (window as unknown as { __bench: BenchApi }).__bench.zoomOf("fullmap-canvas"));
  if (zoomNow === undefined || Math.abs(zoomNow - ZOOM_TARGET) > 1e-6) {
    throw new BenchFailure(
      `The Full_Map on the ${mapLabel} drew at ${String(zoomNow)} px per world unit, not at ${ZOOM_TARGET}.`,
    );
  }
  lines.push(`${mapLabel}: Full_Map zoom ${zoomNow} px per world unit, ${zoomed.ticks} frames driven`);
  report(lines, mapLabel, "4 px per world unit", "Full_Map", zoomed.data["fullmap-canvas"]);
}

test("bench: frame times of the Minimap, Full_Map and Tilted_View", async ({ page, browser }) => {
  await page.addInitScript(installCollector);
  const lines: string[] = [];
  try {
    await measureMap(page, "town", "Town_Map", lines);
    await measureMap(page, "large", "Large_Generated_Map", lines);
  } catch (error) {
    if (error instanceof BenchFailure) {
      console.log(`Frame_Benchmark failed: ${error.message}`);
    }
    throw error;
  }
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  const viewport = page.viewportSize();
  const cpus = os.cpus();
  const out = [
    "",
    "=== Frame_Benchmark ===",
    `Browser: ${browser.browserType().name()} ${browser.version()} (headless)`,
    `Node: ${process.version}`,
    `Viewport: ${viewport?.width ?? "?"} x ${viewport?.height ?? "?"} CSS px`,
    `Device_Pixel_Ratio: ${dpr}`,
    `Machine: ${cpus[0]?.model.trim() ?? "unknown CPU"}, ${cpus.length} logical cores, ${(os.totalmem() / 2 ** 30).toFixed(1)} GiB memory, ${os.platform()} ${os.release()} ${os.arch()}`,
    `Path: seeded (${SEED}), a new arrow key every 15 frames; at least ${REQUIRED_FRAMES} drawn frames per View`,
    "Draw time: callback time of one drawn frame, measured with performance.now() around a wrapped 2D context",
    "",
    ...lines,
    "=== end Frame_Benchmark ===",
  ];
  console.log(out.join("\n"));
});
