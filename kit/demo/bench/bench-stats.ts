// Statistics of the Frame_Benchmark. Pure functions, no browser, so they run
// in Node under the default suite. They report numbers and set no threshold.

/** Frames each View must have been measured for. */
export const REQUIRED_FRAMES = 300;

/** A benchmark failure with a plain-worded reason. */
export class BenchFailure extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "BenchFailure";
  }
}

export interface Summary {
  count: number;
  median: number;
  p95: number;
  max: number;
}

/**
 * The 95th percentile by nearest rank: the smallest value that is at least as
 * large as 95 percent of the values. `sorted` is in ascending order.
 */
function nearestRank95(sorted: readonly number[]): number {
  const rank = Math.ceil(0.95 * sorted.length);
  return sorted[Math.max(1, rank) - 1]!;
}

/** The median; the mean of the two middle values when the count is even. */
function medianOf(sorted: readonly number[]): number {
  const middle = sorted.length >> 1;
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/**
 * Fails when fewer frames were measured than required. The reason states both
 * numbers.
 */
export function checkFrameCount(
  view: string,
  measured: number,
  required: number = REQUIRED_FRAMES,
): void {
  if (measured < required) {
    throw new BenchFailure(
      `The ${view} was measured for ${measured} frames, but ${required} frames are required.`,
    );
  }
}

/**
 * Median, 95th percentile and maximum of `values`. Fails with a reason that
 * names the View and the measurement when a value is not finite or is negative,
 * or when there is no value at all.
 */
export function summarize(
  view: string,
  measurement: string,
  values: readonly number[],
): Summary {
  if (values.length === 0) {
    throw new BenchFailure(`The ${view} has no values for the ${measurement}.`);
  }
  for (const value of values) {
    if (!Number.isFinite(value)) {
      throw new BenchFailure(
        `The ${measurement} of the ${view} is not a finite number (${String(value)}).`,
      );
    }
    if (value < 0) {
      throw new BenchFailure(
        `The ${measurement} of the ${view} is negative (${String(value)}).`,
      );
    }
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    median: medianOf(sorted),
    p95: nearestRank95(sorted),
    max: sorted[sorted.length - 1]!,
  };
}

/** A number in ms with 2 decimal places. */
export function formatMs(value: number): string {
  return value.toFixed(2);
}

/** "median 1.23 p95 2.34 max 3.45" for one measurement. */
export function formatSummary(summary: Summary): string {
  return `median ${formatMs(summary.median)}  p95 ${formatMs(summary.p95)}  max ${formatMs(summary.max)}`;
}

/** The differences between consecutive timestamps. */
export function intervals(timestamps: readonly number[]): number[] {
  const result: number[] = [];
  for (let i = 1; i < timestamps.length; i++) result.push(timestamps[i]! - timestamps[i - 1]!);
  return result;
}
