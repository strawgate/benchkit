import type { BenchmarkResult, Benchmark, Metric } from "./types.js";

/**
 * Parse Hyperfine JSON output into BenchmarkResult.
 *
 * Input format (hyperfine --export-json):
 * {
 *   "results": [
 *     {
 *       "command": "sort input.txt",
 *       "mean": 0.123,
 *       "stddev": 0.005,
 *       "median": 0.121,
 *       "min": 0.115,
 *       "max": 0.135,
 *       "times": [0.121, 0.123, ...]
 *     }
 *   ]
 * }
 */
export function parseHyperfine(input: string): BenchmarkResult {
  const parsed = JSON.parse(input);

  if (!parsed.results || !Array.isArray(parsed.results)) {
    throw new Error("Hyperfine format must have a 'results' array.");
  }

  const benchmarks: Benchmark[] = parsed.results.map((result: any) => {
    if (typeof result.command !== "string") {
      throw new Error("Each Hyperfine result must have a 'command' string.");
    }

    const metrics: Record<string, Metric> = {
      mean: {
        value: result.mean,
        unit: "s",
        direction: "smaller_is_better",
        range: result.stddev,
      },
      stddev: {
        value: result.stddev,
        unit: "s",
        direction: "smaller_is_better",
      },
      median: {
        value: result.median,
        unit: "s",
        direction: "smaller_is_better",
      },
      min: {
        value: result.min,
        unit: "s",
        direction: "smaller_is_better",
      },
      max: {
        value: result.max,
        unit: "s",
        direction: "smaller_is_better",
      },
    };

    return {
      name: result.command,
      metrics,
    };
  });

  return { benchmarks };
}
