// Route benchmark. Loads the large generated map, times the load, then times
// seeded start and destination routes. It prints what it measured and sets
// no pass or fail threshold. Run with `npm run bench`; it is not part of
// `npm test`.

import type { Point } from "../src/geometry.js";
import { parseMap } from "../src/map-loader.js";
import { findRoute } from "../src/route-finder.js";
import type { Destination, EngineMap } from "../src/types.js";
import { generateLargeMap } from "./generate-large-map.js";

// The engine keeps no Node type package, so declare the little this file uses.
declare const process: { version: string; platform: string; arch: string };
declare const performance: { now(): number };
interface OsLike {
  cpus(): { model: string }[];
  totalmem(): number;
  release(): string;
}

const MAP_SEED = 1;
const PAIR_SEED = 2024;
const ROUTE_COUNT = 200;
const WARM_UP_ROUTES = 10;

/** Small seeded generator (mulberry32). Returns numbers in [0, 1). */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Value at a fraction of the sorted list (nearest rank). */
function percentile(sorted: number[], fraction: number): number {
  const rank = Math.max(1, Math.ceil(fraction * sorted.length));
  return sorted[rank - 1] as number;
}

function ms(value: number): string {
  return `${value.toFixed(3)} ms`;
}

async function describeMachine(): Promise<string> {
  const moduleName = "node:os";
  const os = (await import(moduleName)) as OsLike;
  const cpus = os.cpus();
  const model = cpus.length > 0 ? (cpus[0] as { model: string }).model.trim() : "unknown CPU";
  const memoryGb = (os.totalmem() / 1024 ** 3).toFixed(1);
  return `${model}, ${cpus.length} logical cores, ${memoryGb} GB memory, ${process.platform} ${os.release()} (${process.arch})`;
}

/** Pairs alternate between a place and a clicked point as the destination. */
function makePairs(map: EngineMap, count: number): { start: Point; destination: Destination }[] {
  const random = seededRandom(PAIR_SEED);
  const nodes = map.nodes;
  const xs = nodes.map((node) => node.x);
  const ys = nodes.map((node) => node.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pairs: { start: Point; destination: Destination }[] = [];
  for (let i = 0; i < count; i++) {
    const node = nodes[Math.floor(random() * nodes.length)];
    if (!node) throw new Error("The generated map has no nodes.");
    const start = { x: node.x, y: node.y };
    let destination: Destination;
    const place = map.places[Math.floor(random() * map.places.length)];
    if (i % 2 === 0 && place) {
      destination = { placeId: place.id };
    } else {
      destination = {
        point: {
          x: minX + random() * (maxX - minX),
          y: minY + random() * (maxY - minY),
        },
      };
    }
    pairs.push({ start, destination });
  }
  return pairs;
}

async function main(): Promise<void> {
  const text = generateLargeMap(MAP_SEED);

  const loadStart = performance.now();
  const loaded = parseMap(text);
  const loadMs = performance.now() - loadStart;
  if (!("map" in loaded)) {
    throw new Error(`The large map did not load: ${loaded.errors.map((e) => e.message).join("; ")}`);
  }
  const map = loaded.map;

  const pairs = makePairs(map, WARM_UP_ROUTES + ROUTE_COUNT);
  for (const pair of pairs.slice(0, WARM_UP_ROUTES)) findRoute(map, pair.start, pair.destination);

  const times: number[] = [];
  let noWay = 0;
  for (const pair of pairs.slice(WARM_UP_ROUTES)) {
    const begin = performance.now();
    const result = findRoute(map, pair.start, pair.destination);
    times.push(performance.now() - begin);
    if (!("parts" in result)) noWay++;
  }
  const sorted = [...times].sort((a, b) => a - b);

  console.log("Route benchmark (no pass or fail threshold)");
  console.log(`Node version: ${process.version}`);
  console.log(`Machine: ${await describeMachine()}`);
  console.log(`Map: generated from seed ${MAP_SEED}, ${map.roads.length} roads, ${map.nodes.length} nodes, ${map.places.length} places`);
  console.log(`Map load time: ${ms(loadMs)}`);
  console.log(`Routes timed: ${times.length} (after ${WARM_UP_ROUTES} untimed warm-up routes)`);
  console.log(`Pairs: seed ${PAIR_SEED}; start at a random node, destination alternating between a random place and a random point`);
  console.log(`Route time minimum: ${ms(sorted[0] as number)}`);
  console.log(`Route time median: ${ms(percentile(sorted, 0.5))}`);
  console.log(`Route time 95th percentile: ${ms(percentile(sorted, 0.95))}`);
  console.log(`Route time maximum: ${ms(sorted[sorted.length - 1] as number)}`);
  console.log(`No-way results: ${noWay}`);
}

await main();
