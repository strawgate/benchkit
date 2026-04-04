import type { BenchmarkResult } from "./types.js";

/**
 * Parse the benchkit native JSON format. Validates structure and returns as-is.
 */
export function parseNative(input: string): BenchmarkResult {
  let parsed;
  try {
    parsed = JSON.parse(input);
  } catch (err) {
    throw new Error(
      `[parse-native] Failed to parse input as JSON: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  if (!parsed.benchmarks || !Array.isArray(parsed.benchmarks)) {
    throw new Error(
      "[parse-native] Native format must have a 'benchmarks' array at the top level.",
    );
  }

  for (const bench of parsed.benchmarks) {
    if (!bench.name || typeof bench.name !== "string") {
      throw new Error("[parse-native] Each benchmark must have a 'name' string.");
    }
    if (!bench.metrics || typeof bench.metrics !== "object") {
      throw new Error(
        `[parse-native] Benchmark '${bench.name}' must have a 'metrics' object.`,
      );
    }
    for (const [key, metric] of Object.entries(bench.metrics)) {
      const m = metric as Record<string, unknown>;
      if (typeof m.value !== "number") {
        throw new Error(
          `[parse-native] Metric '${key}' in benchmark '${bench.name}' must have a numeric 'value'.`,
        );
      }
      if (
        m.direction &&
        m.direction !== "bigger_is_better" &&
        m.direction !== "smaller_is_better"
      ) {
        throw new Error(
          `[parse-native] Metric '${key}' direction must be 'bigger_is_better' or 'smaller_is_better'.`,
        );
      }
    }
  }

  return parsed as BenchmarkResult;
}
