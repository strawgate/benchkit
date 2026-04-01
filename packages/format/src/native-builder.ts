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

export function defineMetric(value: number, options: Omit<NativeMetricInit, "value"> = {}): Metric {
  const direction = options.direction ?? (options.unit ? inferDirection(options.unit) : undefined);
  return {
    value,
    unit: options.unit,
    direction,
    range: options.range,
  };
}

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

export function buildNativeResult(init: NativeResultInit): BenchmarkResult {
  return {
    benchmarks: init.benchmarks.map((benchmark) => defineBenchmark(benchmark)),
    context: cloneContext(init.context),
  };
}

export function stringifyNativeResult(
  resultOrInit: BenchmarkResult | NativeResultInit,
  indent = 2,
): string {
  const result = buildNativeResult(resultOrInit as NativeResultInit);
  const json = JSON.stringify(result, null, indent);
  parseNative(json);
  return `${json}\n`;
}
