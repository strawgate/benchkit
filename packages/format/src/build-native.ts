import type { BenchmarkResult, Benchmark, Metric, Sample, Context } from "./types.js";
import { parseNative } from "./parse-native.js";

/**
 * Input for a single metric inside {@link BuildBenchmarkInput}.
 * Use a plain number for a value-only metric, or a full object for units/direction/range.
 */
export type MetricInput =
  | number
  | {
      value: number;
      unit?: string;
      direction?: "bigger_is_better" | "smaller_is_better";
      range?: number;
    };

/** Input for one benchmark entry in {@link buildNativeResult}. */
export interface BuildBenchmarkInput {
  name: string;
  tags?: Record<string, string>;
  /** Keys become metric names. Values are either plain numbers or full metric objects. */
  metrics: Record<string, MetricInput>;
  samples?: Sample[];
}

/** Options accepted by {@link buildNativeResult}. */
export interface BuildNativeResultOptions {
  benchmarks: BuildBenchmarkInput[];
  context?: Context;
}

/**
 * Build a validated benchkit-native {@link BenchmarkResult} from a plain options object.
 *
 * Metric values may be provided as bare numbers or as full metric descriptor objects.
 * The result is validated through {@link parseNative} before being returned, so any
 * structural errors (missing name, bad direction, etc.) surface as thrown errors.
 *
 * @example
 * ```ts
 * const result = buildNativeResult({
 *   benchmarks: [{
 *     name: "mock-http-ingest",
 *     tags: { scenario: "json-ingest" },
 *     metrics: {
 *       events_per_sec: { value: 13240.5, unit: "events/sec", direction: "bigger_is_better" },
 *       p95_batch_ms:   { value: 143.2,   unit: "ms",         direction: "smaller_is_better" },
 *     },
 *   }],
 *   context: { commit: "abc123", ref: "main" },
 * });
 * ```
 */
export function buildNativeResult(
  options: BuildNativeResultOptions,
): BenchmarkResult {
  if (!options.benchmarks || options.benchmarks.length === 0) {
    throw new Error("buildNativeResult: 'benchmarks' must be a non-empty array.");
  }

  const benchmarks: Benchmark[] = options.benchmarks.map((b) => {
    const metrics: Record<string, Metric> = {};
    for (const [key, input] of Object.entries(b.metrics)) {
      if (typeof input === "number") {
        metrics[key] = { value: input };
      } else {
        metrics[key] = { ...input };
      }
    }

    const bench: Benchmark = { name: b.name, metrics };
    if (b.tags && Object.keys(b.tags).length > 0) {
      bench.tags = b.tags;
    }
    if (b.samples && b.samples.length > 0) {
      bench.samples = b.samples;
    }
    return bench;
  });

  const result: BenchmarkResult = { benchmarks };
  if (options.context) {
    result.context = options.context;
  }

  // Validate through the same path as parseNative so all structural rules apply.
  return parseNative(JSON.stringify(result));
}
