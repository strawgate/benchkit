import { inferDirection } from "./infer-direction.js";
import { parseNative } from "./parse-native.js";
import type {
  Benchmark,
  BenchmarkResult,
  Context,
  Metric,
  NativeBenchmarkInit,
  NativeMetricInit,
  NativeResultInit,
} from "./types.js";

function cloneContext(context: Context | undefined): Context | undefined {
  if (!context) return undefined;
  return {
    ...context,
    monitor: context.monitor ? { ...context.monitor } : undefined,
  };
}

/**
 * Create a `Metric` object from a numeric value and optional metadata.
 *
 * If `direction` is not provided it is inferred from `unit` via `inferDirection`.
 * If neither `direction` nor `unit` is provided, `direction` is left undefined.
 *
 * @param value - The numeric measurement value.
 * @param options - Optional unit, direction, and range overrides.
 * @returns A fully-formed `Metric` object.
 */
export function defineMetric(value: number, options: Omit<NativeMetricInit, "value"> = {}): Metric {
  const direction = options.direction ?? (options.unit ? inferDirection(options.unit) : undefined);
  return {
    value,
    unit: options.unit,
    direction,
    range: options.range,
  };
}

/**
 * Create a `Benchmark` object from an init descriptor.
 *
 * Numeric shorthand values in `init.metrics` are automatically converted to
 * `Metric` objects via `defineMetric`. Rich metric objects are also passed
 * through `defineMetric` so that direction is inferred when not explicit.
 *
 * @param init - Benchmark name, optional tags, metrics map, and optional samples.
 * @returns A fully-formed `Benchmark` object.
 */
export function defineBenchmark(init: NativeBenchmarkInit): Benchmark {
  const metrics = Object.fromEntries(
    Object.entries(init.metrics).map(([name, metric]) => {
      if (typeof metric === "number") {
        return [name, defineMetric(metric)];
      }
      return [name, defineMetric(metric.value, metric)];
    }),
  );

  return {
    name: init.name,
    tags: init.tags ? { ...init.tags } : undefined,
    metrics,
    samples: init.samples ? [...init.samples] : undefined,
  };
}

/**
 * Build a `BenchmarkResult` from a plain init descriptor.
 *
 * Use this when you want a typed `BenchmarkResult` in memory. To also
 * validate and serialize to JSON, prefer `stringifyNativeResult`.
 *
 * @param init - Result init containing benchmarks and optional context.
 * @returns A validated `BenchmarkResult` object.
 */
export function buildNativeResult(init: NativeResultInit): BenchmarkResult {
  return {
    benchmarks: init.benchmarks.map((benchmark) => defineBenchmark(benchmark)),
    context: cloneContext(init.context),
  };
}

/**
 * Serialize a benchmark result to the benchkit native JSON format.
 *
 * Accepts either a `BenchmarkResult` or a `NativeResultInit` descriptor.
 * The result is validated via `parseNative` before being returned, so
 * invalid data (e.g. non-numeric metric values) will throw.
 *
 * @param resultOrInit - The result or init object to serialize.
 * @param indent - JSON indentation width (default `2`).
 * @returns A JSON string ending with a trailing newline.
 */
export function stringifyNativeResult(
  resultOrInit: BenchmarkResult | NativeResultInit,
  indent = 2,
): string {
  const result = buildNativeResult(resultOrInit as NativeResultInit);
  const json = JSON.stringify(result, null, indent);
  parseNative(json);
  return `${json}\n`;
}
